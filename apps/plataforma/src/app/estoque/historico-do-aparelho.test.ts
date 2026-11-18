// O histórico do aparelho na busca por IMEI do /estoque (lote L5e: ORA-INV-010): o livro do estoque e, agora, os
// consertos pelas OS da assistência. Sessão e Supabase SIMULADOS (dados fictícios). As regras da OS estão em
// packages/banco/src/ordem-de-servico.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const IMEI = "352099001761481";
const IMEI2 = "352099001761499";
type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  erros: {} as Record<string, { code: string }>,
  pedidos: [] as { tabela: string; filtros: unknown[] }[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

// Um PostgREST mínimo em memória: filtra por igualdade e por lista, conta quando pedem e devolve o erro configurado.
class Consulta {
  private linhas: Linha[];
  private contar = false;
  private cabeca = false;
  private filtros: unknown[] = [];
  constructor(private tabela: string) { this.linhas = [...(cenario.tabelas[tabela] ?? [])]; }
  select(_colunas?: string, opcoes?: { count?: string; head?: boolean }) { this.contar = opcoes?.count === "exact"; this.cabeca = Boolean(opcoes?.head); return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push(["eq", coluna, valor]); if (!coluna.includes(".")) this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  in(coluna: string, valores: unknown[]) { this.filtros.push(["in", coluna, valores]); this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna])); return this; }
  or(filtro: string) { this.filtros.push(["or", filtro]); return this; }
  is() { return this; }
  order() { return this; }
  range() { return this; }
  limit() { return this; }
  maybeSingle() { return this.resposta().then((r) => ({ data: r.error ? null : (r.data as Linha[] | null)?.[0] ?? null, error: r.error })); }
  private resposta() {
    cenario.pedidos.push({ tabela: this.tabela, filtros: this.filtros });
    const erro = cenario.erros[this.tabela] ?? null;
    return Promise.resolve(erro ? { data: null, count: null, error: erro } : { data: this.cabeca ? null : this.linhas, count: this.contar ? this.linhas.length : null, error: null });
  }
  then(resolver: (r: unknown) => unknown) { return this.resposta().then(resolver); }
}
const supabase = {
  from: (tabela: string) => new Consulta(tabela),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: argumentos.p_permissao === "estoque.consultar", error: null };
    return { data: null, error: { code: "PGRST202" } };
  },
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    // VEL-b: as permissões vêm no molde da sessão, pela mesma regra do rpc simulado.
    molde: { permissoes: { has: (p: string) => Boolean(p === "estoque.consultar") }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
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
const tela = async () => texto(await Estoque({ searchParams: Promise.resolve({ q: IMEI }) }) as ReactElement).replace(/\s+/g, " ");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.erros = {};
  cenario.pedidos = [];
  cenario.tabelas = {
    itens_serializados: [{ id: "item-1", variante_id: "variante-1", unidade_id: LOJA, imei: IMEI, imei2: IMEI2, iccid: null, situacao: "disponivel", em_estoque: true, condicao: "seminovo", conferido_em: null }],
    estoque_movimentos: [{ id: 1, tipo: "devolucao", quantidade: 1, motivo: "Cliente desistiu", ocorrido_em: "2026-11-10T13:00:00Z", unidade_id: LOJA, item_serializado_id: "item-1" }],
    unidades: [{ id: LOJA, nome: "Santa Cândida (teste)" }],
    variantes: [{ id: "variante-1", nome: "Galaxy A15 128 GB", sku: "APA-0001", produto_id: "produto-1", estoque_minimo: 0, estoque_saldos: [{ quantidade: 1, reservado: 0 }] }],
    ordens_servico: [
      { id: "00000000-0000-4000-9000-0000000000a1", numero: 12, situacao: "aberta", servico: "aguardando_orcamento", defeito: "Tela não liga", aberta_em: "2026-11-12T13:00:00Z", imei: IMEI },
      { id: "00000000-0000-4000-9000-0000000000a2", numero: 7, situacao: "entregue", servico: "concluido", defeito: "Conector de carga", aberta_em: "2026-10-02T13:00:00Z", imei: IMEI2 },
    ],
    fotos_produto: [],
  };
});

describe("histórico do aparelho no estoque (L5e)", () => {
  it("a busca pelo IMEI mostra o livro do estoque e os consertos das OS, pelos dois IMEIs, com o caminho para a OS", async () => {
    const t = await tela();
    for (const trecho of ["Histórico (livro do estoque)", "Cliente desistiu", "Consertos (assistência)", "OS nº 12", "Tela não liga", "Aguardando orçamento",
      "OS nº 7", "Conector de carga", "Entregue e cobrada"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(cenario.pedidos.find((p) => p.tabela === "ordens_servico")?.filtros).toEqual([["in", "imei", [IMEI, IMEI2]]]);
  });

  it("sem OS do aparelho a parte não aparece; banco sem a OS também não; outra falha diz que não leu", async () => {
    cenario.tabelas.ordens_servico = [];
    expect(await tela()).not.toContain("Consertos (assistência)");
    cenario.erros = { ordens_servico: { code: "PGRST205" } };
    let t = await tela();
    expect(t).not.toContain("Consertos (assistência)");
    expect(t).not.toContain("Não deu para ler os consertos");
    cenario.erros = { ordens_servico: { code: "57014" } };
    t = await tela();
    expect(t).toContain("Não deu para ler os consertos deste aparelho agora.");
    expect(t).toContain("Histórico (livro do estoque)");
  });
});
