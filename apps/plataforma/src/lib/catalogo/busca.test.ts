// Busca única do catálogo, estoque e PDV (revisão de 10/11/2026). O Supabase é simulado: o simulador
// aplica eq/ilike/in/limit na ordem das chamadas, como o PostgREST.
import { describe, expect, it, vi } from "vitest";

vi.mock("../acesso/sessao", () => ({ FalhaDoServico: class extends Error {} }));

import { buscarNoCatalogo, filtroDoIdentificador, identificadorDigitado, termoDaBusca } from "./busca";

const tabelas: Record<string, Record<string, unknown>[]> = {
  produtos: [
    { id: "p1", nome: "Galaxy A15", ativo: true },
    { id: "p2", nome: "Capa de proteção", ativo: true },
    { id: "p3", nome: "Galaxy antigo", ativo: false },
  ],
  variantes: [
    { id: "v1", produto_id: "p1", sku: "APA-0001", nome: "128 GB Azul", ativa: true },
    { id: "v2", produto_id: "p1", sku: "APA-0002", nome: "256 GB Preto", ativa: true },
    { id: "v3", produto_id: "p1", sku: "APA-0003", nome: "64 GB Verde", ativa: false },
    { id: "v4", produto_id: "p2", sku: "ACE-0001", nome: "Capa Galaxy A15 transparente", ativa: true },
    { id: "v5", produto_id: "p3", sku: "APA-0009", nome: "Antigo 32 GB", ativa: false },
  ],
  // CAT-009: códigos em outros canais (o desligado não acha; o da variação inativa só na busca do estoque).
  variante_codigos_externos: [
    { variante_id: "v2", codigo: "REIN-778", desligado_em: null },
    { variante_id: "v4", codigo: "REIN-779", desligado_em: "2026-11-14T10:00:00Z" },
    { variante_id: "v3", codigo: "REIN-780", desligado_em: null },
  ],
};
const erros: Record<string, { code: string }> = {};
const minusculo = (v: unknown) => String(v ?? "").toLocaleLowerCase("pt-BR");
class Consulta {
  linhas: Record<string, unknown>[];
  nome: string;
  constructor(nome: string) { this.nome = nome; this.linhas = [...(tabelas[nome] ?? [])]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === valor); return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => valores.includes(l[coluna])); return this; }
  is(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === valor); return this; }
  ilike(coluna: string, padrao: string) { const t = minusculo(padrao.replaceAll("%", "")); this.linhas = this.linhas.filter((l) => minusculo(l[coluna]).includes(t)); return this; }
  limit(n: number) { this.linhas = this.linhas.slice(0, n); return this; }
  then(resolver: (r: { data: Record<string, unknown>[] | null; error: null | { code: string } }) => unknown) {
    const erro = erros[this.nome];
    return Promise.resolve(erro ? { data: null, error: erro } : { data: this.linhas, error: null }).then(resolver);
  }
}
const supabase = { from: (nome: string) => new Consulta(nome) } as unknown as Parameters<typeof buscarNoCatalogo>[0];

describe("termo e identificador iguais nas três telas", () => {
  it("o termo perde curingas e separadores do PostgREST, mantém hífen, ponto e barra", () => {
    expect(termoDaBusca("  capa%_*(azul),  ")).toBe("capa azul");
    expect(termoDaBusca("APA-0001")).toBe("APA-0001");
    expect(termoDaBusca("película 6.7/vidro")).toBe("película 6.7/vidro");
    expect(termoDaBusca("x".repeat(80))).toHaveLength(60);
    expect(termoDaBusca(undefined)).toBe("");
  });

  it("IMEI de 15 e ICCID de 19 ou 20 dígitos, com ou sem espaços; nome com número não é identificador", () => {
    expect(identificadorDigitado("35 2099 0017 0001 0")).toBe("352099001700010");
    expect(identificadorDigitado("8955 1000 0000 0000 013")).toBe("8955100000000000013");
    expect(identificadorDigitado("35209900170001")).toBeNull(); // 14 dígitos: o PDV antigo aceitava
    expect(identificadorDigitado("Galaxy 352099001700010")).toBeNull();
    expect(identificadorDigitado("12345")).toBeNull();
  });

  it("o filtro acha pelo IMEI, pelo segundo IMEI e pelo ICCID (o PDV antigo não via o segundo IMEI)", () => {
    expect(filtroDoIdentificador("352099001700010")).toBe("imei.eq.352099001700010,imei2.eq.352099001700010,iccid.eq.352099001700010");
  });
});

describe("buscarNoCatalogo", () => {
  it("pelo nome do produto traz todas as variações ativas dele (o estoque e o PDV antigos não achavam)", async () => {
    expect(await buscarNoCatalogo(supabase, "galaxy a15")).toEqual({ produtos: ["p1", "p2"], variantes: ["v4", "v1", "v2"], cortada: false });
  });

  it("pelo SKU e pelo nome da variação", async () => {
    expect((await buscarNoCatalogo(supabase, "ACE-0001")).produtos).toEqual(["p2"]);
    expect((await buscarNoCatalogo(supabase, "256 gb")).variantes).toEqual(["v2"]);
  });

  it("o estoque inclui produto e variação desativados (ainda podem ter saldo); catálogo e PDV não", async () => {
    expect((await buscarNoCatalogo(supabase, "verde")).variantes).toEqual([]);
    expect((await buscarNoCatalogo(supabase, "verde", { ativos: false })).variantes).toEqual(["v3"]);
    expect((await buscarNoCatalogo(supabase, "galaxy antigo", { ativos: false })).variantes).toEqual(["v5"]);
  });

  it("pelo código ativo de outro canal (CAT-009): o desligado não acha; o da variação inativa só no estoque", async () => {
    expect(await buscarNoCatalogo(supabase, "rein-778")).toEqual({ produtos: ["p1"], variantes: ["v2"], cortada: false });
    expect((await buscarNoCatalogo(supabase, "REIN-779")).variantes).toEqual([]);
    expect((await buscarNoCatalogo(supabase, "REIN-780")).variantes).toEqual([]);
    expect((await buscarNoCatalogo(supabase, "REIN-780", { ativos: false })).variantes).toEqual(["v3"]);
  });

  it("num banco sem a tabela dos códigos a busca segue pelo resto; outra falha nos códigos é falha da busca", async () => {
    erros.variante_codigos_externos = { code: "PGRST205" };
    try {
      expect((await buscarNoCatalogo(supabase, "256 gb")).variantes).toEqual(["v2"]);
      expect((await buscarNoCatalogo(supabase, "rein-778")).variantes).toEqual([]);
      erros.variante_codigos_externos = { code: "57014" };
      await expect(buscarNoCatalogo(supabase, "256 gb")).rejects.toThrow();
    } finally {
      delete erros.variante_codigos_externos;
    }
  });

  it("termo vazio não consulta nada", async () => {
    expect(await buscarNoCatalogo(supabase, "")).toEqual({ produtos: [], variantes: [], cortada: false });
  });
});
