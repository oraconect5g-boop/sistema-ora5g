// "Saldo da loja" do /estoque, corrigido no lote B5 (REV-PLAN-003): antes vinham os 500 primeiros saldos e o
// subtítulo dizia "500 produto(s)" mesmo havendo mais. Sessão e Supabase simulados: um PostgREST em memória
// que filtra pela loja do saldo embutido, conta no "banco" e corta cada resposta no teto de 1.000 linhas.
// Dados fictícios.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  variantes: [] as Record<string, unknown>[],
  semNumero: false,
  pedidos: [] as { tabela: string; cabeca: boolean; de: number | null; ate: number | null }[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

const TETO = 1000;
const comparar = (a: unknown, b: unknown) => String(a).localeCompare(String(b));
class Consulta {
  private linhas: Linha[];
  private cabeca = false;
  private contar = false;
  private lojaDoSaldo: string | null = null;
  private ordem: string[] = [];
  private de: number | null = null;
  private ate: number | null = null;
  constructor(private tabela: string) {
    this.linhas = tabela === "variantes" ? cenario.variantes.map((v) => ({ ...v }))
      : tabela === "estoque_saldos" ? cenario.variantes.flatMap((v) => Object.entries(v.saldos as Record<string, Linha>).map(([unidade, s]) => ({ variante_id: v.id, unidade_id: unidade, ...s })))
      : [];
  }
  select(_colunas: string, opcoes?: { count?: string; head?: boolean }) { this.contar = opcoes?.count === "exact"; this.cabeca = Boolean(opcoes?.head); return this; }
  eq(coluna: string, valor: unknown) {
    if (coluna === "estoque_saldos.unidade_id") this.lojaDoSaldo = String(valor);
    else this.linhas = this.linhas.filter((l) => l[coluna] === valor);
    return this;
  }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => valores.includes(l[coluna])); return this; }
  is() { return this; }
  ilike(coluna: string, padrao: string) { const t = padrao.replaceAll("%", "").toLowerCase(); this.linhas = this.linhas.filter((l) => String(l[coluna]).toLowerCase().includes(t)); return this; }
  order(coluna: string) { this.ordem.push(coluna); return this; }
  range(de: number, ate: number) { this.de = de; this.ate = ate; return this; }
  limit(n: number) { this.de = 0; this.ate = n - 1; return this; }
  then(resolver: (r: unknown) => unknown) {
    let linhas = this.linhas;
    if (this.lojaDoSaldo !== null) {
      const loja = this.lojaDoSaldo;
      linhas = linhas.filter((v) => (v.saldos as Record<string, Linha>)[loja]).map(({ saldos, ...v }) => ({ ...v, estoque_saldos: [(saldos as Record<string, Linha>)[loja]] }));
    }
    linhas = [...linhas].sort((a, b) => { for (const c of this.ordem) { const d = comparar(a[c], b[c]); if (d !== 0) return d; } return 0; });
    cenario.pedidos.push({ tabela: this.tabela, cabeca: this.cabeca, de: this.de, ate: this.ate });
    const count = this.contar ? (cenario.semNumero ? null : linhas.length) : null;
    const de = this.de ?? 0;
    const ate = Math.min(this.ate ?? linhas.length - 1, de + TETO - 1);
    return Promise.resolve({ data: this.cabeca ? null : linhas.slice(de, ate + 1), count, error: null }).then(resolver);
  }
}
const supabase = {
  from: (tabela: string) => new Consulta(tabela),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: ["estoque.consultar", "estoque.conferir"].includes(String(argumentos.p_permissao)), error: null };
    return { data: null, error: { code: "PGRST202" } };
  },
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    // VEL-b: as permissões vêm no molde da sessão, pela mesma regra do rpc simulado.
    molde: { permissoes: { has: (p: string) => Boolean(["estoque.consultar", "estoque.conferir"].includes(p)) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase,
  }),
}));

import Estoque from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Linha>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async (parametros: Record<string, string> = {}) => texto(await Estoque({ searchParams: Promise.resolve(parametros) }) as ReactElement).replace(/\s+/g, " ");
// FIN-009b: as propriedades de cada componente de um tipo (a planilha do estoque), pela árvore da tela.
function doTipo(v: unknown, tipo: string, achados: Linha[] = []): Linha[] {
  if (Array.isArray(v)) for (const x of v) doTipo(x, tipo, achados);
  else if (isValidElement<Linha>(v)) {
    if (typeof v.type === "function" && v.type.name === tipo) achados.push(v.props);
    for (const x of Object.values(v.props)) doTipo(x, tipo, achados);
  } else if (v && typeof v === "object") for (const x of Object.values(v)) doTipo(x, tipo, achados);
  return achados;
}
const variante = (n: number, saldos: Record<string, Linha>) => ({
  id: `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`, nome: `Capa modelo ${String(n).padStart(4, "0")}`, sku: `CAP-${String(n).padStart(4, "0")}`,
  estoque_minimo: 0, produto_id: `00000000-0000-4000-9100-${String(n).padStart(12, "0")}`, ativa: true, saldos,
});

beforeEach(() => {
  cenario.semNumero = false;
  cenario.pedidos = [];
  cenario.variantes = [
    ...Array.from({ length: 250 }, (_, n) => variante(n + 1, { [LOJA]: { quantidade: 3, reservado: 1 } })),
    ...Array.from({ length: 30 }, (_, n) => variante(1000 + n, { [OUTRA]: { quantidade: 5, reservado: 0 } })),
  ];
});

describe("saldo da loja (B5)", () => {
  it("250 produtos com saldo nesta loja: o total vem do banco e a lista vem em páginas de 100, pelo nome", async () => {
    let t = await tela();
    expect(t).toContain("250 produto(s) · mostrando 1 a 100");
    expect(t).toContain("Página 1 de 3");
    expect(t).toContain("Capa modelo 0001");
    expect(t).toContain("Capa modelo 0100");
    expect(t).not.toContain("Capa modelo 0101");
    expect(t).not.toContain("Capa modelo 1000"); // só tem saldo em outra loja
    // A contagem foi no banco (sem trazer linhas) e a página pedida ficou abaixo do teto.
    expect(cenario.pedidos.filter((p) => p.tabela === "variantes")).toEqual([
      { tabela: "variantes", cabeca: true, de: null, ate: null }, { tabela: "variantes", cabeca: false, de: 0, ate: 99 },
    ]);
    t = await tela({ pagina: "3" });
    expect(t).toContain("250 produto(s) · mostrando 201 a 250");
    expect(t).toContain("Capa modelo 0250");
    expect(t).toContain("Anteriores");
    expect(await tela({ pagina: "9" })).toContain("mostrando 201 a 250");
  });

  it("com busca: os saldos das variações achadas vêm completos e a tela avisa quando a busca parou no limite", async () => {
    // "capa" bate no nome das 280 variações: a busca para no limite de 100 e a tela avisa; das achadas, as que têm
    // saldo nesta loja aparecem todas.
    const t = await tela({ q: "capa" });
    expect(t).toContain("A busca achou muitos produtos e parou no limite");
    expect(t).toContain('100 produto(s) com "capa"');
    const exata = await tela({ q: "cap-0042" });
    expect(exata).toContain('1 produto(s) com "cap-0042"');
    expect(exata).not.toContain("parou no limite");
  });

  it("contagem sem número é falha, não zero", async () => {
    cenario.semNumero = true;
    await expect(tela()).rejects.toThrow();
  });

  it("FIN-009b: o saldo leva à planilha da loja inteira (a busca não corta a planilha)", async () => {
    expect(doTipo(await Estoque({ searchParams: Promise.resolve({}) }), "LinksDaPlanilha")).toEqual([{ parte: "saldo", rotulo: "Saldo" }]);
    expect(doTipo(await Estoque({ searchParams: Promise.resolve({ q: "capa" }) }), "LinksDaPlanilha")).toEqual([{ parte: "saldo", rotulo: "Saldo da loja inteira" }]);
  });
});
