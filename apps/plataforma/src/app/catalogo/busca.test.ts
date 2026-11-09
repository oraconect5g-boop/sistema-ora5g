// REV-038 / #40 (prova do Codex na PR #33, 2026-11-08-fotos/busca.repro.ts), agora regressão
// permanente. A tela real é chamada; só a sessão e o Supabase são simulados. O simulador aplica
// ilike/in/eq/limit NA ORDEM das chamadas, como o PostgREST: se a busca viesse depois do limite,
// o produto 201 sumiria (era o defeito).
import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

const produtos = Array.from({ length: 201 }, (_, i) => ({
  id: `p${i}`, nome: i === 200 ? "ZZ Produto alvo" : `Produto ${String(i + 1).padStart(3, "0")}`, tipo: "acessorio", organizacao_id: "org", ativo: true,
}));
const tabelas: Record<string, Record<string, unknown>[]> = {
  produtos,
  variantes: produtos.map((p, i) => ({ id: `v${i}`, produto_id: p.id, sku: i === 200 ? "ALVO-201" : `SKU-${i + 1}`, nome: i === 199 ? "Capa Azul Marinho" : p.nome, cor: null, ativa: true })),
  fotos_produto: [],
  estoque_saldos: [],
};
const comoTexto = (v: unknown) => String(v ?? "").toLocaleLowerCase("pt-BR");
class Consulta {
  linhas: Record<string, unknown>[];
  constructor(nome: string) { this.linhas = [...(tabelas[nome] ?? [])]; }
  select() { return this; }
  order(coluna: string) { this.linhas.sort((a, b) => comoTexto(a[coluna]).localeCompare(comoTexto(b[coluna]))); return this; }
  is(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => (l[coluna] ?? null) === valor); return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => valores.includes(l[coluna])); return this; }
  ilike(coluna: string, padrao: string) { const t = padrao.replaceAll("%", "").toLocaleLowerCase("pt-BR"); this.linhas = this.linhas.filter((l) => comoTexto(l[coluna]).includes(t)); return this; }
  limit(n: number) { this.linhas = this.linhas.slice(0, n); return this; }
  then(resolver: (r: { data: Record<string, unknown>[]; error: null }) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error {},
  obterSessao: async () => ({
    situacao: { unidade_id: "loja", unidade_nome: "Loja de teste" },
    supabase: {
      from: (nome: string) => new Consulta(nome),
      rpc: async (nome: string) => ({ data: nome === "tem_permissao" ? false : [], error: null }),
      storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
    },
  }),
}));

import Catalogo from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<{ children?: unknown }>(v)) return texto(v.props.children);
  return "";
}
const tela = async (q?: string) => texto(await Catalogo({ searchParams: Promise.resolve(q === undefined ? {} : { q }) }));

describe("busca do catálogo na fonte (#40)", () => {
  it("controle: produto dentro das primeiras 200 linhas aparece pela busca", async () => {
    expect(await tela("SKU-1")).toContain("Produto 001");
  });
  it.each(["ZZ Produto alvo", "ALVO-201", "zz produto"])("produto além do limite aparece buscando %s", async (q) => {
    expect(await tela(q)).toContain("ZZ Produto alvo");
  });
  it("o nome da variante também acha o produto", async () => {
    expect(await tela("azul marinho")).toContain("Produto 200");
  });
  it("sem busca, mostra os primeiros 200 e avisa para buscar", async () => {
    const pagina = await tela();
    expect(pagina.replace(/\s+/g, " ")).toMatch(/Mostrando os primeiros 200 produtos ?; use a busca/);
    expect(pagina).not.toContain("ZZ Produto alvo");
  });
  it("caracteres do filtro do PostgREST não viram curinga", async () => {
    // Com o % passando, "1%0" acharia "Produto 100"; limpo, procura "1 0" e não acha nada.
    expect(await tela("1%0")).not.toContain("Produto 100");
    expect(await tela("100")).toContain("Produto 100");
  });
});
