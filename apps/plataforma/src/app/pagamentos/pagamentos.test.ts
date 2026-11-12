// Maquininhas e conciliação (L7a) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados fictícios.
// As regras do banco estão em packages/banco/src/pagamentos-conciliacao.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { erroDosPagamentos, lerConciliacao, lerMaquininha, periodoDaConciliacao } from "../../lib/pagamentos/regras";
import { lerPagamentos } from "../../lib/vendas/regras";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const PAG = "00000000-0000-4000-9000-0000000000c1";
const TERM = "00000000-0000-4000-9000-0000000000c2";
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
class Consulta {
  linhas: Record<string, unknown>[];
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  order() { return this; }
  then(resolver: (r: { data: Record<string, unknown>[]; error: null }) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-11T23:00:00Z" },
  supabase: {
    from: (nome: string) => new Consulta(nome),
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
      cenario.chamadas.push({ nome, argumentos });
      return cenario.respostas[nome] ?? { data: null, error: null };
    },
  },
};
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { cadastrarMaquininha, conciliarPagamento, desconciliarPagamento } from "./acoes";
import Conciliacao from "./conciliacao/page";
import Maquininhas from "./maquininhas/page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const limpar = (v: unknown) => texto(v).replace(/\s+/g, " ");
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};
const form = (campos: Record<string, string>) => ({ get: (n: string) => campos[n] ?? null });

beforeEach(() => {
  cenario.permissoes = new Set();
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.tabelas = { terminais: [{ id: TERM, provedor: "picpay", identificador: "PP-001", apelido: "Balcão 1", ativo: true, criado_em: "2026-11-01T10:00:00Z", unidade_id: LOJA }] };
});

describe("regras (L7a)", () => {
  it("maquininha, conciliação, período e mensagens", () => {
    expect(lerMaquininha(form({ provedor: "pagbank", identificador: " pb-1 ", apelido: "Caixa" }))).toEqual({ ok: true, provedor: "pagbank", identificador: "PB-1", apelido: "Caixa" });
    expect(lerMaquininha(form({ provedor: "stone", identificador: "X1", apelido: "Caixa" }))).toEqual({ ok: false, erro: "provedor" });
    expect(lerConciliacao(form({ referencia: "LOTE-1", liquido: "76,00", data: "2026-11-10" }))).toEqual({ ok: true, referencia: "LOTE-1", liquido: 7_600, data: "2026-11-10" });
    expect(lerConciliacao(form({ referencia: "x", liquido: "76", data: "2026-11-10" }))).toEqual({ ok: false, erro: "referencia" });
    expect(lerConciliacao(form({ referencia: "LOTE-1", liquido: "abc", data: "2026-11-10" }))).toEqual({ ok: false, erro: "liquido" });
    expect(periodoDaConciliacao("2026-11-01", "2026-11-10", "2026-11-11")).toEqual({ inicio: "2026-11-01", fim: "2026-11-10" });
    expect(periodoDaConciliacao("2026-01-01", "2026-11-10", "2026-11-11")).toEqual({ inicio: "2026-11-05", fim: "2026-11-11" });
    expect(erroDosPagamentos({ code: "OR030" })).toBe("ja_conciliado");
    expect(erroDosPagamentos({ code: "22023", message: "A data em que o dinheiro caiu vai do dia da venda até hoje" })).toBe("data");
  });

  it("o PDV manda a maquininha só nos meios de maquininha", () => {
    const lido = lerPagamentos(form({ pagamento_1_meio: "cartao_picpay", pagamento_1_valor: "79,00", pagamento_1_comprovante: "NSU-1", pagamento_1_terminal: TERM,
      pagamento_2_meio: "dinheiro", pagamento_2_valor: "10,00", pagamento_2_terminal: TERM }));
    expect(lido).toEqual({ ok: true, pagamentos: [{ meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-1", terminal: TERM }, { meio: "dinheiro", valor: 1_000 }] });
  });
});

describe("telas e ações (L7a)", () => {
  it("maquininhas: só a gerência; lista com provedor, número e situação", async () => {
    expect(limpar(await Maquininhas({ searchParams: Promise.resolve({}) }) as ReactElement)).toContain("Cadastrar maquininhas é da gerência da loja");
    cenario.permissoes = new Set(["terminal.gerir"]);
    const t = limpar(await Maquininhas({ searchParams: Promise.resolve({ ok: "cadastrada" }) }) as ReactElement);
    for (const trecho of ["Balcão 1", "PicPay · PP-001", "ativa", "Cadastrar maquininha", "Maquininha cadastrada."]) expect(t).toContain(trecho);
  });

  it("conciliação: totais por situação do dinheiro, a liquidar com formulário e conciliado com taxa", async () => {
    cenario.permissoes = new Set(["pagamento.conciliar"]);
    cenario.respostas.pagamentos_do_periodo = { data: {
      totais: { no_caixa: { quantidade: 2, valor: 11_900, liquido: null }, a_liquidar: { quantidade: 1, valor: 3_900, liquido: null }, conciliado: { quantidade: 1, valor: 7_900, liquido: 7_600 } },
      pagamentos: [
        { id: PAG, venda_id: "v1", venda_numero: 10, concluida_em: "2026-11-10T13:00:00Z", meio: "cartao_pagseguro", valor: 7_900, comprovante: "NSU-10", terminal: "Caixa",
          dinheiro: "conciliado", liquidado_em: "2026-11-11", valor_liquido: 7_600, referencia: "LOTE-1" },
        { id: "p2", venda_id: "v2", venda_numero: 11, concluida_em: "2026-11-10T14:00:00Z", meio: "pix_direto", valor: 3_900, comprovante: "E2E-1", terminal: null,
          dinheiro: "a_liquidar", liquidado_em: null, valor_liquido: null, referencia: null },
      ] }, error: null };
    const t = limpar(await Conciliacao({ searchParams: Promise.resolve({ inicio: "2026-11-05", fim: "2026-11-11" }) }) as ReactElement);
    for (const trecho of ["05/11/2026 a 11/11/2026", "No caixa (dinheiro)", "A liquidar (cartão e Pix)", "líquido R$ 76,00", "Venda nº 10", "taxa R$ 3,00", "LOTE-1", "Desfazer", "Venda nº 11", "Conciliar"]) {
      expect(t).toContain(trecho);
    }
    expect(cenario.chamadas.find((c) => c.nome === "pagamentos_do_periodo")?.argumentos).toEqual({ p_inicio: "2026-11-05", p_fim: "2026-11-11" });
    cenario.permissoes = new Set();
    expect(limpar(await Conciliacao({ searchParams: Promise.resolve({}) }) as ReactElement)).toContain("Conciliar pagamentos é da gerência da loja");
  });

  it("ações: validam antes de ir ao banco e voltam ao mesmo período", async () => {
    expect(await destinoDe(cadastrarMaquininha(formulario({ provedor: "picpay", identificador: "PP-9", apelido: "Balcão 2", motivo: "x" })))).toBe("/pagamentos/maquininhas?erro=motivo");
    expect(await destinoDe(cadastrarMaquininha(formulario({ provedor: "picpay", identificador: "PP-9", apelido: "Balcão 2", motivo: "Maquininha nova" })))).toBe("/pagamentos/maquininhas?ok=cadastrada");
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_unidade: LOJA, p_provedor: "picpay", p_identificador: "PP-9", p_apelido: "Balcão 2" });
    expect(await destinoDe(conciliarPagamento(formulario({ pagamento: PAG, referencia: "LOTE-2", liquido: "76,00", data: "2026-11-11", inicio: "2026-11-05", fim: "2026-11-11" }))))
      .toBe("/pagamentos/conciliacao?inicio=2026-11-05&fim=2026-11-11&ok=conciliado");
    expect(cenario.chamadas[1]?.argumentos).toEqual({ p_pagamento: PAG, p_referencia: "LOTE-2", p_valor_liquido: 7_600, p_liquidado_em: "2026-11-11" });
    cenario.respostas.pagamento_desconciliar = { data: null, error: { code: "P0002" } };
    expect(await destinoDe(desconciliarPagamento(formulario({ pagamento: PAG, motivo: "Lote errado" })))).toBe("/pagamentos/conciliacao?erro=nao_encontrado");
  });
});
