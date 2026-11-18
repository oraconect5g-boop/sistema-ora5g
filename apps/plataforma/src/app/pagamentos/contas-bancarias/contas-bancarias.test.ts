// As contas bancárias (lote CONTAS-a: ORA-FIN-006) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados
// fictícios. As regras do banco estão em packages/banco/src/contas-bancarias.test.ts; a leitura e os formulários, em
// lib/contas-bancarias/regras.test.ts.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const CONTA = "00000000-0000-4000-9000-0000000000b1";
const EMPRESA = "00000000-0000-4000-9000-0000000000b2";
const EXTRATO_LIGADO = "00000000-0000-4000-9000-0000000000b3";
const EXTRATO_SOLTO = "00000000-0000-4000-9000-0000000000b4";
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, Resposta>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  constructor(linhas: Record<string, unknown>[]) { this.linhas = [...linhas]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => !(coluna in l) || l[coluna] === valor); return this; }
  order() { return this; }
  limit() { return this; }
  then(resolver: (r: Resposta) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-18T23:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Dono (fictício)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    from: (nome: string) => new Consulta(cenario.tabelas[nome] ?? []),
    rpc: (nome: string, argumentos: Record<string, unknown> = {}) => {
      cenario.chamadas.push({ nome, argumentos });
      return Promise.resolve(cenario.respostas[nome] ?? { data: null, error: null });
    },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { atualizarConta, criarConta, extratoDaConta } from "./acoes";
import ContasBancarias from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && /^[A-Z]/.test((v.type as { name?: string }).name ?? "")) {
      try { return texto((v.type as (p: unknown) => unknown)(v.props)); } catch { /* componente com estado: lê as propriedades */ }
    }
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async (parametros: Record<string, string> = {}) => texto(await ContasBancarias({ searchParams: Promise.resolve(parametros) })).replace(/\s+/g, " ");
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
};
const chamadas = (nome: string) => cenario.chamadas.filter((c) => c.nome === nome).map((c) => c.argumentos);
const saldo = (extra: Record<string, unknown> = {}) => ({
  id: CONTA, numero: 1, empresa_id: EMPRESA, empresa: "Ora Telecom (fictícia)", apelido: "Itaú principal", banco: "Itaú", agencia: "1234-5",
  conta: "12345-6", ativa: true, saldo_inicial_centavos: 500_000, saldo_inicial_em: "2026-11-02", extratos: 1, entradas_centavos: 150_000,
  saidas_centavos: 45_000, saldo_centavos: 605_000, saldo_em: "2026-11-06", ...extra,
});

beforeEach(() => {
  cenario.permissoes = new Set(["pagamento.conciliar"]);
  cenario.chamadas = [];
  cenario.respostas = { contas_bancarias_saldos: { data: [saldo()], error: null } };
  cenario.tabelas = {
    empresas: [{ id: EMPRESA, razao_social: "Ora Telecom Ltda (fictícia)", nome_fantasia: null, status: "ativa" }],
    extratos: [
      { id: EXTRATO_LIGADO, numero: 7, fonte: "Itaú", periodo_inicio: "2026-11-03", periodo_fim: "2026-11-06", conta_id: CONTA, tipo: "banco" },
      { id: EXTRATO_SOLTO, numero: 8, fonte: "Itaú", periodo_inicio: "2026-11-07", periodo_fim: "2026-11-09", conta_id: null, tipo: "banco" },
    ],
  };
});

describe("a tela das contas bancárias (CONTAS-a)", () => {
  it("mostra cada conta com o saldo pelo extrato e até que dia, o que entrou e saiu, os extratos ligados e o que falta ligar", async () => {
    const t = await tela();
    for (const trecho of ["Contas bancárias", "Saldo das contas ativas", "R$ 6.050,00", "Itaú principal", "Ora Telecom (fictícia) · Itaú · ag. 1234-5 · c/c 12345-6",
      "Saldo pelo extrato", "até 06/11/2026", "Entrou", "R$ 1.500,00", "depois de 02/11/2026", "Saiu", "R$ 450,00",
      "Extratos ligados (1)", "Extrato nº 7 · Itaú · de 03/11/2026 a 06/11/2026", "Tirar da conta",
      "1 extrato do banco ainda não está em nenhuma conta", "Ligar um extrato do banco", "Nº 8 · Itaú · de 07/11/2026 a 09/11/2026",
      "Mudar os dados da conta", "Nova conta", "Ora Telecom Ltda (fictícia)"]) {
      expect(t, trecho).toContain(trecho);
    }
  });

  it("sem conta: o convite para cadastrar a primeira; a conta inativa não recebe extrato", async () => {
    cenario.respostas.contas_bancarias_saldos = { data: [], error: null };
    expect(await tela()).toContain("Cadastre a primeira conta");
    cenario.respostas.contas_bancarias_saldos = { data: [saldo({ ativa: false })], error: null };
    const t = await tela();
    expect(t).toContain("inativa");
    expect(t).not.toContain("Ligar um extrato do banco");
  });

  it("as mensagens vêm do catálogo; o texto cru do endereço não aparece", async () => {
    expect(await tela({ erro: "cruzado" })).toContain("cruza com o de outro extrato da mesma conta");
    expect(await tela({ ok: "ligado" })).toContain("Extrato ligado à conta");
    expect(await tela({ erro: "<script>" })).not.toContain("<script>");
  });

  it("quem não concilia não vê a tela; resposta fora da forma é falha, nunca zero", async () => {
    cenario.permissoes = new Set();
    expect(await tela()).toContain("As contas bancárias são de quem concilia os pagamentos.");
    cenario.permissoes = new Set(["pagamento.conciliar"]);
    cenario.respostas.contas_bancarias_saldos = { data: [saldo({ saldo_centavos: 1 })], error: null };
    await expect(tela()).rejects.toThrow();
    cenario.respostas.contas_bancarias_saldos = { data: null, error: { code: "57014" } };
    await expect(tela()).rejects.toThrow();
  });
});

describe("as ações", () => {
  const nova = { empresa: EMPRESA, apelido: "Itaú principal", banco: "Itaú", agencia: "1234-5", conta: "", saldo_inicial: "5.000,00", saldo_em: "2026-11-02" };

  it("cadastra a conta com os dados lidos e volta para ela", async () => {
    cenario.respostas.conta_bancaria_criar = { data: CONTA, error: null };
    expect(await destinoDe(criarConta(formulario(nova)))).toBe(`/pagamentos/contas-bancarias?ok=criada#conta-${CONTA}`);
    expect(chamadas("conta_bancaria_criar")).toEqual([{
      p_empresa: EMPRESA, p_apelido: "Itaú principal", p_banco: "Itaú", p_agencia: "1234-5", p_conta: null, p_saldo_inicial: 500_000, p_saldo_em: "2026-11-02",
    }]);
  });

  it("o formulário errado volta com a mensagem sem chamar o banco; a recusa do banco vira a mensagem dela", async () => {
    expect(await destinoDe(criarConta(formulario({ ...nova, saldo_inicial: "abc" })))).toBe("/pagamentos/contas-bancarias?erro=saldo");
    expect(chamadas("conta_bancaria_criar")).toEqual([]);
    cenario.respostas.conta_bancaria_criar = { data: null, error: { code: "42501" } };
    expect(await destinoDe(criarConta(formulario(nova)))).toBe("/pagamentos/contas-bancarias?erro=permissao");
  });

  it("muda a conta com o motivo; o mesmo de novo diz que nada mudou", async () => {
    const mudanca = { ...nova, conta_bancaria: CONTA, ativa: "sim", motivo: "Saldo conferido no banco" };
    cenario.respostas.conta_bancaria_atualizar = { data: true, error: null };
    expect(await destinoDe(atualizarConta(formulario(mudanca)))).toBe(`/pagamentos/contas-bancarias?ok=atualizada#conta-${CONTA}`);
    expect(chamadas("conta_bancaria_atualizar")[0]).toMatchObject({ p_conta_bancaria: CONTA, p_ativa: true, p_motivo: "Saldo conferido no banco" });
    cenario.respostas.conta_bancaria_atualizar = { data: false, error: null };
    expect(await destinoDe(atualizarConta(formulario(mudanca)))).toBe(`/pagamentos/contas-bancarias?ok=sem_mudanca#conta-${CONTA}`);
    expect(await destinoDe(atualizarConta(formulario({ ...mudanca, motivo: "x" })))).toBe(`/pagamentos/contas-bancarias?erro=motivo#conta-${CONTA}`);
  });

  it("liga o extrato sem motivo; tirar pede o motivo; o período cruzado volta com a mensagem dele", async () => {
    cenario.respostas.extrato_da_conta = { data: true, error: null };
    expect(await destinoDe(extratoDaConta(formulario({ extrato: EXTRATO_SOLTO, conta_bancaria: CONTA })))).toBe(`/pagamentos/contas-bancarias?ok=ligado#conta-${CONTA}`);
    expect(await destinoDe(extratoDaConta(formulario({ extrato: EXTRATO_LIGADO, conta_bancaria: CONTA, tirar: "sim", motivo: "Era de outra conta" }))))
      .toBe(`/pagamentos/contas-bancarias?ok=desligado#conta-${CONTA}`);
    expect(chamadas("extrato_da_conta")).toEqual([
      { p_extrato: EXTRATO_SOLTO, p_conta_bancaria: CONTA, p_motivo: null },
      { p_extrato: EXTRATO_LIGADO, p_conta_bancaria: null, p_motivo: "Era de outra conta" },
    ]);
    expect(await destinoDe(extratoDaConta(formulario({ extrato: EXTRATO_LIGADO, conta_bancaria: CONTA, tirar: "sim", motivo: "" }))))
      .toBe(`/pagamentos/contas-bancarias?erro=motivo#conta-${CONTA}`);
    cenario.respostas.extrato_da_conta = { data: null, error: { code: "OR044" } };
    expect(await destinoDe(extratoDaConta(formulario({ extrato: EXTRATO_SOLTO, conta_bancaria: CONTA })))).toBe(`/pagamentos/contas-bancarias?erro=cruzado#conta-${CONTA}`);
    expect(await destinoDe(extratoDaConta(formulario({ extrato: "x", conta_bancaria: CONTA })))).toBe("/pagamentos/contas-bancarias?erro=dados");
  });
});
