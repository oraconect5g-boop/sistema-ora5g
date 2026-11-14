// /contas-a-pagar (lote L8a) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados fictícios. O que
// o dono e o gerente veem, o que vai ao banco em cada filtro, os estados (sem a migration, falha, resumo que
// não fecha, sem permissão) e o que as ações mandam ao banco. As regras do banco estão em
// packages/banco/src/contas-a-pagar.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA_A = "00000000-0000-4000-8000-0000000000aa";
const LOJA_B = "00000000-0000-4000-8000-0000000000bb";
const CAT_ALUGUEL = "00000000-0000-4000-9000-0000000000c1";
const CAT_LUZ = "00000000-0000-4000-9000-0000000000c2";
const CAT_VELHA = "00000000-0000-4000-9000-0000000000c3";
const CAT_MERCADORIA = "00000000-0000-4000-9000-0000000000c4";
const FORN = "00000000-0000-4000-9000-0000000000f1";
const C1 = "00000000-0000-4000-9000-0000000000e1";
const C2 = "00000000-0000-4000-9000-0000000000e2";
const C3 = "00000000-0000-4000-9000-0000000000e3";
const C4 = "00000000-0000-4000-9000-0000000000e4";
const C5 = "00000000-0000-4000-9000-0000000000e5";

type Linha = Record<string, unknown>;
type Erro = { code: string; message?: string };
const cenario = vi.hoisted(() => ({
  pode: true,
  resumo: null as unknown,
  erroDoResumo: null as null | { code: string },
  /** O banco recusa (42501) o resumo filtrado: loja fora do escopo de quem pede. */
  recusarFiltro: false,
  /** O banco ainda não tem a coluna entra_no_resultado (migration do L8b): o select com ela dá 42703. */
  semColunaDoResultado: false,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  errosDasTabelas: {} as Record<string, { code: string }>,
  filtros: [] as string[],
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Linha[];
  erro: Erro | null;
  constructor(readonly tabela: string) {
    this.linhas = [...(cenario.tabelas[tabela] ?? [])];
    this.erro = cenario.errosDasTabelas[tabela] ?? null;
  }
  select(colunas = "") {
    if (cenario.semColunaDoResultado && colunas.includes("entra_no_resultado")) this.erro = { code: "42703" };
    return this;
  }
  eq(coluna: string, valor: unknown) {
    cenario.filtros.push(`${this.tabela} ${coluna}=${String(valor)}`);
    this.linhas = this.linhas.filter((l) => l[coluna] === valor);
    return this;
  }
  is(coluna: string, valor: null) {
    cenario.filtros.push(`${this.tabela} ${coluna} é nulo`);
    this.linhas = this.linhas.filter((l) => l[coluna] === valor);
    return this;
  }
  gte(coluna: string, valor: string) {
    cenario.filtros.push(`${this.tabela} ${coluna}>=${valor}`);
    this.linhas = this.linhas.filter((l) => String(l[coluna]) >= valor);
    return this;
  }
  order() { return this; }
  limit() { return this; }
  then(resolver: (r: { data: Linha[] | null; error: Erro | null }) => unknown) {
    return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas, error: null }).then(resolver);
  }
}
const supabase = {
  from: (tabela: string) => new Consulta(tabela),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: cenario.pode, error: null };
    cenario.chamadas.push({ nome, argumentos });
    if (nome === "contas_a_pagar_resumo") {
      if (cenario.recusarFiltro && (argumentos.p_unidade || argumentos.p_rede)) return { data: null, error: { code: "42501" } };
      return cenario.erroDoResumo ? { data: null, error: cenario.erroDoResumo } : { data: cenario.resumo, error: null };
    }
    return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
  },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: "eu" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA_A, unidade_nome: "Loja A (teste)", turno_termina_em: "2026-11-13T23:00:00Z" },
    supabase,
  }),
}));

import { cancelarConta, corrigirConta, desfazerPagamento, lancarConta, pagarConta, salvarCategoria } from "./acoes";
import ContasAPagar from "./page";

// ---------------------------------------------------------------------------------------------
// Leitura da árvore: os componentes desta tela (e o estado do painel) são executados; os
// compartilhados ficam como elementos, para o teste conferir as propriedades.
// ---------------------------------------------------------------------------------------------
const LOCAIS = new Set(["ConteudoContas", "PainelDoResumo", "Lancamento", "ListaDeContas", "LinhaDaConta", "Categorias", "Volta", "EstadoDoPainel"]);
const local = (x: ReactElement<Linha>) => typeof x.type === "function" && LOCAIS.has(x.type.name);
const executar = (x: ReactElement<Linha>) => (x.type as (p: unknown) => unknown)(x.props);
const nomeDoTipo = (x: ReactElement<Linha>) => (typeof x.type === "function" ? x.type.name : String(x.type));
function visivel(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      if (local(x)) andar(executar(x));
      else if (typeof x.type === "string") andar(x.props.children);
      else if (nomeDoTipo(x) === "MoldeReal") andar(x.props.children);
      else if (nomeDoTipo(x) === "Indicador") andar([x.props.rotulo, x.props.valor, x.props.detalhe]);
      else andar([x.props.sobretitulo, x.props.titulo, x.props.subtitulo, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
function elementos(v: unknown): ReactElement<Linha>[] {
  const achados: ReactElement<Linha>[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (isValidElement<Linha>(x)) {
      achados.push(x);
      if (local(x)) andar(executar(x));
      else andar(Object.values(x.props));
    }
  };
  andar(v);
  return achados;
}
const doTipo = (v: unknown, nome: string) => elementos(v).filter((e) => nomeDoTipo(e) === nome).map((e) => e.props);
function formularios(v: unknown) {
  return elementos(v).filter((e) => e.type === "form" && typeof e.props.action === "function").map((f) => {
    const campos: Record<string, string> = {};
    for (const e of elementos(f.props.children)) if (e.type === "input" && e.props.type === "hidden") campos[String(e.props.name)] = String(e.props.value);
    const caixas = elementos(f.props.children).filter((e) => e.type === "input" && e.props.type === "checkbox").map((e) => String(e.props.name));
    const selecoes = Object.fromEntries(elementos(f.props.children).filter((e) => e.type === "select").map((e) => [String(e.props.name), elementos(e.props.children).filter((o) => o.type === "option").map((o) => String(o.props.value))]));
    return { acao: (f.props.action as { name: string }).name, campos, caixas, selecoes };
  });
}
const pagina = async (parametros: Record<string, string> = {}) => (await ContasAPagar({ searchParams: Promise.resolve(parametros) })) as ReactElement;
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

const conta = (id: string, extra: Linha) => ({
  id, unidade_id: LOJA_A, categoria_id: CAT_ALUGUEL, fornecedor_id: null, descricao: "Conta", documento: null, valor_centavos: 10_000,
  vencimento: "2026-11-20", forma: "unica", parcela: 1, parcelas: 1, situacao: "aberta", paga_em: null, valor_pago_centavos: null,
  referencia_pagamento: null, cancelada_em: null, motivo_cancelamento: null, ...extra,
});
const RESUMO = {
  hoje: "2026-11-13",
  abertas: { quantidade: 3, valor: 783_333 },
  vencidas: { quantidade: 1, valor: 100_000, mais_antiga_dias: 3 },
  hoje_vencem: { quantidade: 1, valor: 33_333 },
  proximos_7: { quantidade: 1, valor: 650_000 },
  proximos_30: { quantidade: 1, valor: 650_000 },
  pagas_no_mes: { quantidade: 1, valor_pago: 10_500, valor: 10_000 },
  por_categoria: [{ categoria: CAT_ALUGUEL, aberto: 750_000, pago_no_mes: 0 }, { categoria: CAT_LUZ, aberto: 33_333, pago_no_mes: 10_500 }],
  por_loja: [{ unidade: null, aberto: 100_000, vencido: 100_000 }, { unidade: LOJA_B, aberto: 650_000, vencido: 0 }, { unidade: LOJA_A, aberto: 33_333, vencido: 0 }],
  por_semana: [33_333, 650_000, 0, 0, 0, 0, 0, 0].map((valor, i) => ({ inicio: new Date(Date.parse("2026-11-13T12:00:00Z") + 7 * i * 86_400_000).toISOString().slice(0, 10), valor })),
  escopo: { rede: true, lojas: [{ id: LOJA_A, nome: "Loja A (teste)" }, { id: LOJA_B, nome: "Loja B (teste)" }] },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, {
    pode: true, resumo: RESUMO, erroDoResumo: null, recusarFiltro: false, semColunaDoResultado: false, errosDasTabelas: {}, filtros: [], chamadas: [], respostas: {},
    tabelas: {
      contas_a_pagar: [
        conta(C1, { unidade_id: null, descricao: "Aluguel do escritório", valor_centavos: 100_000, vencimento: "2026-11-10" }),
        conta(C2, { categoria_id: CAT_LUZ, fornecedor_id: FORN, documento: "NF 77", descricao: "Boleto de aparelhos", valor_centavos: 33_333, vencimento: "2026-11-13", forma: "parcelada", parcela: 2, parcelas: 3 }),
        conta(C3, { unidade_id: LOJA_B, descricao: "Aluguel da loja", valor_centavos: 650_000, vencimento: "2026-11-20", forma: "mensal", parcela: 12, parcelas: 12 }),
        conta(C4, { categoria_id: CAT_LUZ, descricao: "Conta de luz", situacao: "paga", paga_em: "2026-11-12", valor_pago_centavos: 10_500, referencia_pagamento: "PIX 123" }),
        conta(C5, { descricao: "Lançada em dobro", situacao: "cancelada", cancelada_em: "2026-11-12T14:00:00Z", motivo_cancelamento: "Lançada em dobro" }),
      ],
      contas_pagar_categorias: [
        { id: CAT_ALUGUEL, nome: "Aluguel e condomínio", ativa: true, entra_no_resultado: true }, { id: CAT_LUZ, nome: "Água, luz e internet", ativa: true, entra_no_resultado: true },
        { id: CAT_VELHA, nome: "Antiga", ativa: false, entra_no_resultado: true }, { id: CAT_MERCADORIA, nome: "Mercadoria (fornecedor)", ativa: true, entra_no_resultado: false },
      ],
      fornecedores: [{ id: FORN, nome: "Distribuidora Teste", ativo: true }],
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("/contas-a-pagar: o dono vê a rede e todas as lojas (L8a)", () => {
  it("filtros, indicadores, gráficos, a lista em aberto com as ações de cada conta e as categorias", async () => {
    const tela = await pagina();
    const t = visivel(tela);
    expect(cenario.chamadas).toEqual([{ nome: "contas_a_pagar_resumo", argumentos: { p_unidade: null, p_rede: false } }]);
    expect(cenario.filtros.filter((f) => f.startsWith("contas_a_pagar "))).toEqual(["contas_a_pagar situacao=aberta"]);
    expect(t).toContain("Rede e todas as lojas Contas a pagar");
    expect(doTipo(tela, "FiltroSegmentado").map((f) => (f.opcoes as { rotulo: string }[]).map((o) => o.rotulo))).toEqual([
      ["Todas", "Rede (central)", "Loja A (teste)", "Loja B (teste)"], ["Em aberto", "Pagas (60 dias)", "Canceladas (60 dias)"],
    ]);
    expect(t).toContain("Vencidas R$ 1.000,00 1 conta · a mais antiga há 3 dias");
    expect(t).toContain("Vencem hoje R$ 333,33 1 conta");
    expect(t).toContain("Próximos 7 dias R$ 6.500,00 1 conta · em 30 dias: R$ 6.500,00");
    expect(t).toContain("Pagas no mês R$ 105,00 1 conta · juros e multas R$ 5,00");
    expect(t).toContain("Fora do gráfico: R$ 1.000,00 já vencidos.");
    expect(doTipo(tela, "Colunas")[0]?.dados).toEqual([
      { rotulo: "Hoje", valor: 33_333 }, { rotulo: "20/11", valor: 650_000 }, { rotulo: "27/11", valor: 0 }, { rotulo: "04/12", valor: 0 },
      { rotulo: "11/12", valor: 0 }, { rotulo: "18/12", valor: 0 }, { rotulo: "25/12", valor: 0 }, { rotulo: "01/01", valor: 0 },
    ]);
    const [porCategoria, porLoja] = doTipo(tela, "BarrasHorizontais");
    expect(porCategoria?.dados).toEqual([{ rotulo: "Aluguel e condomínio", valor: 750_000 }, { rotulo: "Água, luz e internet", valor: 33_333 }]);
    expect(t).toContain("Pago no mês: Água, luz e internet R$ 105,00.");
    expect(porLoja?.dados).toEqual([
      { rotulo: "Rede (central)", valor: 100_000, destaque: true }, { rotulo: "Loja B (teste)", valor: 650_000, destaque: false }, { rotulo: "Loja A (teste)", valor: 33_333, destaque: false },
    ]);
    expect(t).toContain("Vencido: Rede (central) R$ 1.000,00.");
    // A lista: a loja de cada conta aparece (todas), o fornecedor, o documento, a parcela e o prazo.
    expect(t).toContain("Aluguel do escritório Aluguel e condomínio · Rede (central) R$ 1.000,00 vence 10/11/2026 vencida há 3 dias");
    expect(t).toContain("Boleto de aparelhos · parcela 2 de 3 Água, luz e internet · Loja A (teste) · Distribuidora Teste · doc. NF 77 R$ 333,33 vence 13/11/2026 vence hoje");
    expect(t).toContain("Aluguel da loja · mês 12 de 12");
    const forms = formularios(tela);
    expect(forms.map((f) => f.acao)).toEqual([
      "lancarConta",
      "pagarConta", "corrigirConta", "cancelarConta", "pagarConta", "corrigirConta", "cancelarConta", "pagarConta", "corrigirConta", "cancelarConta",
      ...Array<string>(13).fill("salvarCategoria"),
    ]);
    // Lançar: a rede e as duas lojas; só as categorias ativas; o fornecedor opcional.
    expect(forms[0]?.selecoes).toEqual({ unidade: ["rede", LOJA_A, LOJA_B], categoria: [CAT_ALUGUEL, CAT_LUZ, CAT_MERCADORIA], forma: ["unica", "parcelada", "mensal"], fornecedor: ["", FORN] });
    expect(t).toContain("Mercadoria (fornecedor) (fora do resultado)");
    // Categorias (L8b): renomear, pôr ou tirar do resultado e desativar cada uma; a nova pode nascer fora do resultado.
    const daCategoria = forms.filter((f) => f.acao === "salvarCategoria");
    expect(daCategoria.filter((f) => "entra" in f.campos).map((f) => [f.campos.categoria, f.campos.entra])).toEqual([
      [CAT_ALUGUEL, "nao"], [CAT_LUZ, "nao"], [CAT_VELHA, "nao"], [CAT_MERCADORIA, "sim"],
    ]);
    expect(daCategoria.at(-1)?.caixas).toEqual(["entra"]);
    expect(t).toContain("Tirar do resultado");
    expect(t).toContain("Pôr no resultado");
    expect(t).toContain("fora do resultado");
    // Cancelar a parcela 2 de 3 oferece "e as seguintes"; a última do lançamento, não.
    const cancelamentos = forms.filter((f) => f.acao === "cancelarConta");
    expect(cancelamentos.map((f) => [f.campos.conta, f.caixas])).toEqual([[C1, []], [C2, ["seguintes"]], [C3, []]]);
    expect(t).toContain("Categorias das despesas");
    expect(t).toContain("Ver e ajustar as 4 categorias");
    expect(t).toContain("desativada");
  });

  it("escolhendo uma loja ou a rede: a pergunta e a lista levam o filtro; loja fora do escopo cai em todas", async () => {
    await pagina({ loja: LOJA_B });
    expect(cenario.chamadas).toEqual([{ nome: "contas_a_pagar_resumo", argumentos: { p_unidade: LOJA_B, p_rede: false } }]);
    expect(cenario.filtros).toContain(`contas_a_pagar unidade_id=${LOJA_B}`);
    Object.assign(cenario, { chamadas: [], filtros: [] });
    const rede = visivel(await pagina({ loja: "rede" }));
    expect(cenario.chamadas[0]?.argumentos).toEqual({ p_unidade: null, p_rede: true });
    expect(cenario.filtros).toContain("contas_a_pagar unidade_id é nulo");
    expect(rede).toContain("Rede (central) Contas a pagar");
    Object.assign(cenario, { chamadas: [], filtros: [], recusarFiltro: true });
    const fora = await pagina({ loja: "00000000-0000-4000-8000-0000000000ff" });
    expect(cenario.chamadas.map((c) => c.argumentos)).toEqual([{ p_unidade: "00000000-0000-4000-8000-0000000000ff", p_rede: false }, { p_unidade: null, p_rede: false }]);
    expect(cenario.filtros.filter((f) => f.includes("unidade_id"))).toEqual([]);
    expect(visivel(fora)).toContain("Rede e todas as lojas Contas a pagar");
  });

  it("pagas e canceladas dos últimos 60 dias: o pagamento com juros e o desfazer; o cancelamento com o motivo", async () => {
    const pagas = await pagina({ ver: "pagas" });
    expect(cenario.filtros).toEqual(expect.arrayContaining(["contas_a_pagar situacao=paga", "contas_a_pagar paga_em>=2026-09-14"]));
    const t = visivel(pagas);
    expect(t).toContain("Conta de luz Água, luz e internet · Loja A (teste) R$ 105,00 paga em 12/11/2026 · juros R$ 5,00");
    expect(t).toContain("Referência: PIX 123 · vencia 20/11/2026, valor da conta R$ 100,00");
    expect(formularios(pagas).map((f) => f.acao)).toContain("desfazerPagamento");
    expect(formularios(pagas).find((f) => f.acao === "desfazerPagamento")?.campos).toEqual({ conta: C4, ver: "pagas", loja: "" });
    const canceladas = visivel(await pagina({ ver: "canceladas" }));
    expect(canceladas).toContain("Lançada em dobro Aluguel e condomínio · Loja A (teste) R$ 100,00 cancelada em 12/11/2026 Motivo: Lançada em dobro");
  });
});

describe("/contas-a-pagar: o gerente e os estados (L8a)", () => {
  it("o gerente vê a loja dele: sem filtro de loja, sem a rede no lançamento e sem as categorias", async () => {
    cenario.resumo = { ...RESUMO, escopo: { rede: false, lojas: [{ id: LOJA_A, nome: "Loja A (teste)" }] } };
    const tela = await pagina();
    const t = visivel(tela);
    expect(t).toContain("Loja A (teste) Contas a pagar");
    expect(doTipo(tela, "FiltroSegmentado")).toHaveLength(1);
    expect(t).not.toContain("Categorias das despesas");
    const forms = formularios(tela);
    expect(forms[0]?.selecoes.unidade).toEqual([LOJA_A]);
    expect(forms.some((f) => f.acao === "salvarCategoria")).toBe(false);
    expect(doTipo(tela, "BarrasHorizontais")).toHaveLength(1);
  });

  it("banco sem a migration: o resumo e a lista dizem que não estão disponíveis, sem formulário e sem número", async () => {
    Object.assign(cenario, { erroDoResumo: { code: "PGRST202" }, errosDasTabelas: { contas_a_pagar: { code: "PGRST205" }, contas_pagar_categorias: { code: "PGRST205" } } });
    const tela = await pagina();
    const t = visivel(tela);
    expect(t.split("Indisponível neste ambiente").length - 1).toBe(2);
    expect(t).toContain("as contas a pagar (migration contas_a_pagar)");
    expect(formularios(tela)).toEqual([]);
    expect(doTipo(tela, "Indicador")).toEqual([]);
    expect(vi.mocked(console.error)).not.toHaveBeenCalled();
  });

  it("banco com as contas a pagar e ainda sem o resultado do mês (L8b): as categorias aparecem sem a marcação, e nada falha", async () => {
    cenario.semColunaDoResultado = true;
    const tela = await pagina();
    const t = visivel(tela);
    expect(t).toContain("Ver e ajustar as 4 categorias");
    expect(t).not.toContain("Tirar do resultado");
    expect(t).not.toContain("(fora do resultado)");
    const daCategoria = formularios(tela).filter((f) => f.acao === "salvarCategoria");
    expect(daCategoria).toHaveLength(9);
    expect(daCategoria.at(-1)?.caixas).toEqual([]);
    expect(vi.mocked(console.error)).not.toHaveBeenCalled();
  });

  it("falha de leitura ou resumo que não fecha: nenhum número, e o registro leva só o código", async () => {
    cenario.erroDoResumo = { code: "57014" };
    expect(visivel(await pagina())).toContain("Não foi possível ler agora");
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["contas a pagar: falha ao consultar contas_a_pagar_resumo", { codigo: "57014" }]);
    cenario.erroDoResumo = null;
    cenario.resumo = { ...RESUMO, abertas: { quantidade: 3, valor: 1 } };
    const quebrado = await pagina();
    expect(doTipo(quebrado, "Indicador")).toEqual([]);
    expect(visivel(quebrado)).toContain("Não foi possível ler agora");
    cenario.resumo = RESUMO;
    cenario.errosDasTabelas.contas_a_pagar = { code: "57014" };
    const lista = visivel(await pagina());
    expect(lista).toContain("Não foi possível ler agora");
    expect(lista).not.toContain("Nenhuma conta em aberto");
  });

  it("quem não gere contas a pagar não chega à tela", async () => {
    cenario.pode = false;
    expect(visivel(await pagina())).toContain("As contas a pagar são do dono e da gerência da loja.");
    expect(cenario.chamadas).toEqual([]);
  });

  it("lista vazia com a leitura funcionando: o formulário já vem aberto", async () => {
    cenario.resumo = { ...RESUMO, abertas: { quantidade: 0, valor: 0 }, vencidas: { quantidade: 0, valor: 0, mais_antiga_dias: 0 }, hoje_vencem: { quantidade: 0, valor: 0 },
      proximos_7: { quantidade: 0, valor: 0 }, proximos_30: { quantidade: 0, valor: 0 }, por_categoria: [{ categoria: CAT_LUZ, aberto: 0, pago_no_mes: 10_500 }], por_loja: [],
      por_semana: RESUMO.por_semana.map((s) => ({ ...s, valor: 0 })) };
    cenario.tabelas.contas_a_pagar = [];
    const tela = await pagina();
    expect(visivel(tela)).toContain("Nenhuma conta em aberto");
    expect(elementos(tela).find((e) => e.type === "details" && e.props.className === "group")?.props.open).toBe(true);
  });
});

describe("ações das contas a pagar (L8a)", () => {
  const lancamento = { unidade: "rede", categoria: CAT_ALUGUEL, descricao: "Aluguel do escritório", valor: "1.000,00", vencimento: "2026-11-20", forma: "unica", ver: "abertas", loja: LOJA_B };

  it("lançar: confere o formulário, manda os dados ao banco e volta para o mesmo filtro", async () => {
    const chave = "3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
    cenario.respostas.conta_pagar_lancar = { data: C1, error: null };
    expect(await destinoDe(lancarConta(formulario({ ...lancamento, chave })))).toBe(`/contas-a-pagar?loja=${LOJA_B}&ok=lancada`);
    expect(cenario.chamadas).toEqual([{ nome: "conta_pagar_lancar", argumentos: {
      p_dados: { unidade: null, categoria: CAT_ALUGUEL, fornecedor: null, descricao: "Aluguel do escritório", documento: null, valor: 100_000, vencimento: "2026-11-20", forma: "unica", vezes: 1 },
      p_chave: chave,
    } }]);
    cenario.chamadas = [];
    expect(await destinoDe(lancarConta(formulario({ ...lancamento, forma: "mensal", vezes: "12", ver: "pagas", loja: "" })))).toBe("/contas-a-pagar?ver=pagas&ok=lancadas");
    expect(String(cenario.chamadas[0]?.argumentos.p_chave)).toMatch(/^[0-9a-f-]{36}$/);
    cenario.chamadas = [];
    expect(await destinoDe(lancarConta(formulario({ ...lancamento, valor: "0" })))).toBe(`/contas-a-pagar?loja=${LOJA_B}&erro=valor`);
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.conta_pagar_lancar = { data: null, error: { code: "42501", message: "Sem permissão para lançar contas a pagar aqui" } };
    expect(await destinoDe(lancarConta(formulario(lancamento)))).toBe(`/contas-a-pagar?loja=${LOJA_B}&erro=permissao`);
  });

  it("pagar, desfazer, cancelar e corrigir: a resposta do banco escolhe a mensagem", async () => {
    cenario.respostas.conta_pagar_pagar = { data: true, error: null };
    expect(await destinoDe(pagarConta(formulario({ conta: C2, pago_em: "2026-11-13", valor_pago: "343,33", referencia: "PIX 9" })))).toBe("/contas-a-pagar?ok=paga");
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "conta_pagar_pagar", argumentos: { p_conta: C2, p_pago_em: "2026-11-13", p_valor_pago: 34_333, p_referencia: "PIX 9" } });
    cenario.respostas.conta_pagar_pagar = { data: false, error: null };
    expect(await destinoDe(pagarConta(formulario({ conta: C2, pago_em: "2026-11-13", valor_pago: "343,33", referencia: "PIX 9" })))).toBe("/contas-a-pagar?ok=sem_mudanca");
    cenario.respostas.conta_pagar_pagar = { data: null, error: { code: "OR030", message: "Pagamento já registrado: desfaça antes de mudar" } };
    expect(await destinoDe(pagarConta(formulario({ conta: C2, pago_em: "2026-11-13", valor_pago: "1", referencia: "PIX 9", ver: "abertas", loja: "rede" })))).toBe("/contas-a-pagar?loja=rede&erro=ja_paga");

    cenario.respostas.conta_pagar_desfazer_pagamento = { data: true, error: null };
    expect(await destinoDe(desfazerPagamento(formulario({ conta: C4, motivo: "Conta errada", ver: "pagas" })))).toBe("/contas-a-pagar?ver=pagas&ok=desfeito");

    for (const [quantas, ok] of [[0, "sem_mudanca"], [1, "cancelada"], [4, "canceladas"]] as const) {
      cenario.respostas.conta_pagar_cancelar = { data: quantas, error: null };
      expect(await destinoDe(cancelarConta(formulario({ conta: C3, motivo: "Contrato encerrado", seguintes: "sim" })))).toBe(`/contas-a-pagar?ok=${ok}`);
    }
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "conta_pagar_cancelar", argumentos: { p_conta: C3, p_motivo: "Contrato encerrado", p_e_seguintes: true } });
    cenario.respostas.conta_pagar_cancelar = { data: null, error: { code: "22023", message: "Conta paga: desfaça o pagamento antes de cancelar" } };
    expect(await destinoDe(cancelarConta(formulario({ conta: C4, motivo: "Tentativa" })))).toBe("/contas-a-pagar?erro=paga");

    cenario.respostas.conta_pagar_corrigir = { data: true, error: null };
    expect(await destinoDe(corrigirConta(formulario({ conta: C3, valor: "7.000,00", vencimento: "2026-11-25", motivo: "Reajuste" })))).toBe("/contas-a-pagar?ok=corrigida");
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "conta_pagar_corrigir", argumentos: { p_conta: C3, p_dados: { valor: 700_000, vencimento: "2026-11-25" }, p_motivo: "Reajuste" } });

    const antes = cenario.chamadas.length;
    expect(await destinoDe(cancelarConta(formulario({ conta: C3, motivo: "ok" })))).toBe("/contas-a-pagar?erro=motivo");
    expect(await destinoDe(pagarConta(formulario({ conta: "x", pago_em: "2026-11-13", valor_pago: "1", referencia: "PIX" })))).toBe("/contas-a-pagar?erro=dados");
    expect(cenario.chamadas).toHaveLength(antes);
  });

  it("categorias: criar sem id, renomear, desativar; só o dono", async () => {
    cenario.respostas.conta_pagar_categoria_salvar = { data: CAT_VELHA, error: null };
    expect(await destinoDe(salvarCategoria(formulario({ nome: "Frete" })))).toBe("/contas-a-pagar?ok=categoria");
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "conta_pagar_categoria_salvar", argumentos: { p_categoria: null, p_nome: "Frete", p_ativa: null, p_entra_no_resultado: null } });
    expect(await destinoDe(salvarCategoria(formulario({ categoria: CAT_VELHA, nome: "Antiga", ativa: "sim" })))).toBe("/contas-a-pagar?ok=categoria");
    expect(cenario.chamadas.at(-1)?.argumentos).toEqual({ p_categoria: CAT_VELHA, p_nome: "Antiga", p_ativa: true, p_entra_no_resultado: null });
    // L8b: tirar do resultado (ou criar já fora dele).
    expect(await destinoDe(salvarCategoria(formulario({ categoria: CAT_VELHA, nome: "Antiga", entra: "nao" })))).toBe("/contas-a-pagar?ok=categoria");
    expect(cenario.chamadas.at(-1)?.argumentos).toEqual({ p_categoria: CAT_VELHA, p_nome: "Antiga", p_ativa: null, p_entra_no_resultado: false });
    expect(await destinoDe(salvarCategoria(formulario({ nome: "Empréstimo", entra: "nao" })))).toBe("/contas-a-pagar?ok=categoria");
    expect(cenario.chamadas.at(-1)?.argumentos).toEqual({ p_categoria: null, p_nome: "Empréstimo", p_ativa: null, p_entra_no_resultado: false });
    cenario.respostas.conta_pagar_categoria_salvar = { data: null, error: { code: "42501", message: "Só o dono ajusta as categorias das contas a pagar" } };
    expect(await destinoDe(salvarCategoria(formulario({ nome: "Do gerente" })))).toBe("/contas-a-pagar?erro=so_dono");
  });
});
