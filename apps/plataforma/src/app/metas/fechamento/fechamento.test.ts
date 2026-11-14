// /metas/fechamento (lote L9b) com sessão e Supabase SIMULADOS: nenhuma credencial, nenhuma rede. Confere
// o que cada perfil vê em cada situação do fechamento (a gerência confere e contesta; o dono decide e
// aprova; aprovado, a planilha), o que vai ao banco nas duas ações e que leitura que falha não mostra
// número. O banco está provado em packages/banco/src/bonus-fechamento.test.ts. Dados fictícios.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const ANA = "00000000-0000-4000-8000-00000000a001";
const BETO = "00000000-0000-4000-8000-00000000a002";
const CAIO = "00000000-0000-4000-8000-00000000a003";
const DONO = "00000000-0000-4000-8000-00000000a004";
const FECHAMENTO = "00000000-0000-4000-8000-0000000000f1";
const AGORA = new Date("2026-11-13T15:00:00.000Z");

type Linha = Record<string, unknown>;
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  usuario: "",
  permissoes: new Set<string>(),
  respostas: {} as Record<string, Resposta>,
  tabelas: {} as Record<string, Linha[]>,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  lidas: [] as string[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
class Consulta {
  private linhas: Linha[];
  constructor(private nome: string) {
    if (nome !== "unidades" && nome !== "bonus_fechamentos") throw new Error(`a tela não lê ${nome} direto`);
    cenario.lidas.push(nome);
    this.linhas = nome === "unidades"
      ? [{ id: LOJA, nome: "Santa Cândida (teste)", tipo: "loja_fisica" }, { id: OUTRA, nome: "Loja 02 (teste)", tipo: "loja_fisica" }]
      : [...(cenario.tabelas[nome] ?? [])];
  }
  select() { return this; }
  in() { return this; }
  order() { return this; }
  limit() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  then(resolver: (r: Resposta) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const supabase = {
  from: (nome: string) => new Consulta(nome),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
    cenario.chamadas.push({ nome, argumentos });
    return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: cenario.usuario },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-13T23:00:00Z" },
    supabase,
  }),
}));

import { aprovarFechamento, enviarFechamento } from "./acoes";
import FechamentoDoBonus from "./page";

const APRESENTACAO = new Set([
  "ConferenciaDaGerencia", "FechamentoEnviado", "FechamentoAprovado", "LojasDoMes", "ComoOFechamentoFunciona", "CabecaDaLinha", "MedidasDaLinha",
  "LinkDoExtrato", "TextoDaContestacao", "Resumo", "RegrasDoMes", "EstadoDoPainel",
]);
type Elemento = { tipo: string; props: Linha };
function percorrer(v: unknown, elemento: (e: Elemento) => void): void {
  if (Array.isArray(v)) for (const x of v) percorrer(x, elemento);
  else if (isValidElement<Linha>(v)) {
    const tipo = typeof v.type === "string" ? v.type : typeof v.type === "function" ? v.type.name : "";
    if (typeof v.type === "function" && APRESENTACAO.has(tipo)) percorrer((v.type as (p: unknown) => unknown)(v.props), elemento);
    else {
      elemento({ tipo, props: v.props });
      percorrer(tipo === "MoldeReal" ? v.props.children : Object.values(v.props), elemento);
    }
  } else if (v && typeof v === "object" && !("$$typeof" in v)) percorrer(Object.values(v), elemento);
}
/** Só o texto que aparece: filhos dos elementos e títulos dos cartões (sem classes nem atributos). */
function visivel(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "function" && APRESENTACAO.has(tipo)) andar((x.type as (p: unknown) => unknown)(x.props));
      else if (typeof x.type === "string") andar(x.props.children);
      else andar([x.props.titulo, x.props.subtitulo, x.props.acao, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ").trim();
}
async function pagina(parametros: Record<string, string> = {}) {
  const arvore = (await FechamentoDoBonus({ searchParams: Promise.resolve(parametros) })) as ReactElement<Linha>;
  const elementos: Elemento[] = [];
  percorrer(arvore, (e) => elementos.push(e));
  const doTipo = (tipo: string) => elementos.filter((e) => e.tipo === tipo).map((e) => e.props);
  return {
    visivel: visivel(arvore.props.children),
    doTipo,
    titulo: doTipo("TituloPagina")[0],
    campos: doTipo("input").map((i) => [i.type, i.name, i.value] as [unknown, unknown, unknown]),
    links: elementos.filter((e) => typeof e.props.href === "string").map((e) => e.props.href as string),
    filtro: (rotulo: string) => doTipo("FiltroSegmentado").find((f) => f.rotulo === rotulo) as { opcoes: { href: string; rotulo: string; ativo: boolean }[] } | undefined,
    chamadas: (nome: string) => cenario.chamadas.filter((c) => c.nome === nome).map((c) => c.argumentos),
  };
}

const APURACAO = {
  mes: "2026-10-01", regra_contagem: 1,
  regras: { connect: { vigente_desde: "2026-10-01", versao: 3, faixas: [{ a_partir_de: 100, valor: 30_000 }, { a_partir_de: 150, valor: 50_000 }] } },
  vendedores: [
    { vendedor_id: ANA, total: 30_000, medidas: { connect: { meta: 2, realizado: 2, faixa: 1, bonus: 30_000, proxima: { faixa: 2, a_partir_de: 150, valor: 50_000, falta: 1 } } } },
    { vendedor_id: BETO, total: 0, medidas: { connect: { meta: 4, realizado: 1, faixa: null, bonus: 0, proxima: { faixa: 1, a_partir_de: 100, valor: 30_000, falta: 3 } } } },
  ],
};
const ENVIADO_EM = "2026-11-02T13:00:00+00:00";
const APROVADO_EM = "2026-11-03T12:00:00+00:00";
const CONTESTACAO = { motivo: "A ativação de 31/10 só confirmou no dia 1º", contestada_em: ENVIADO_EM, decisao: null, resposta: null, decidida_em: null };
const AJUSTE = "A ativação de 31/10 conta em outubro";
const linha = (vendedor: string, total: number, extra: Linha = {}) =>
  ({ vendedor_id: vendedor, total_calculado: total, total_aprovado: null, ajuste_motivo: null, aprovado_em: null, contestacao: null, ...extra });
const NAO_ENVIADO = { mes: "2026-10-01", unidade_id: LOJA, fechamento: null, linhas: [] };
const ENVIADO = {
  mes: "2026-10-01", unidade_id: LOJA,
  fechamento: { id: FECHAMENTO, situacao: "enviado", apuracao: APURACAO, total_calculado: 30_000, total_aprovado: null, enviado_por: CAIO, enviado_em: ENVIADO_EM, aprovado_por: null, aprovado_em: null },
  linhas: [linha(ANA, 30_000), linha(BETO, 0, { contestacao: CONTESTACAO })],
};
const APROVADO = {
  ...ENVIADO,
  fechamento: { ...ENVIADO.fechamento, situacao: "aprovado", total_aprovado: 60_000, aprovado_por: DONO, aprovado_em: APROVADO_EM },
  linhas: [
    linha(ANA, 30_000, { total_aprovado: 30_000, aprovado_em: APROVADO_EM }),
    linha(BETO, 0, { total_aprovado: 30_000, ajuste_motivo: AJUSTE, aprovado_em: APROVADO_EM, contestacao: { ...CONTESTACAO, decisao: "ajustado", resposta: AJUSTE, decidida_em: APROVADO_EM } }),
  ],
};
const EQUIPE = [
  { usuario_id: ANA, nome: "Ana (teste)", na_equipe: true },
  { usuario_id: BETO, nome: "Beto (teste)", na_equipe: true },
  { usuario_id: CAIO, nome: "Caio (teste)", na_equipe: true },
];
const GERENTE = ["metas.gerir", "metas.ver_unidade", "venda.ver_unidade", "venda.registrar", "bonus.conferir"];
const DE_DONO = [...GERENTE, "venda.ver_todas", "bonus.aprovar", "bonus.definir"];
const fechado = (situacao: Linha) => ({ data: situacao, error: null });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, {
    usuario: CAIO, permissoes: new Set(GERENTE), chamadas: [], lidas: [], tabelas: {},
    respostas: { bonus_fechamento_do_mes: fechado(NAO_ENVIADO), bonus_do_mes: { data: APURACAO, error: null }, metas_equipe: { data: EQUIPE, error: null } },
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("/metas/fechamento (L9b)", () => {
  it("a gerente, no mês que terminou e ainda não enviado: confere, com os totais da tela e o campo de contestar", async () => {
    const p = await pagina();
    expect(p.chamadas("bonus_fechamento_do_mes")).toEqual([{ p_mes: "2026-10-01", p_unidade: LOJA }]);
    expect(p.chamadas("bonus_do_mes")).toEqual([{ p_mes: "2026-10-01", p_unidade: LOJA }]);
    expect(cenario.lidas).toEqual([]);
    expect(p.titulo).toMatchObject({ titulo: "Fechamento do bônus", sobretitulo: "Santa Cândida (teste)" });
    expect(p.filtro("Mês")?.opcoes.map((o) => [o.rotulo, o.href, o.ativo])).toEqual([
      ["Maio", "/metas/fechamento?mes=2026-05", false], ["Junho", "/metas/fechamento?mes=2026-06", false], ["Julho", "/metas/fechamento?mes=2026-07", false],
      ["Agosto", "/metas/fechamento?mes=2026-08", false], ["Setembro", "/metas/fechamento?mes=2026-09", false], ["Outubro", "/metas/fechamento", true],
    ]);
    expect(p.filtro("Loja")).toBeUndefined();
    expect(p.visivel).toContain("Conferência de outubro de 2026");
    expect(p.visivel).toContain("Ana (teste) R$ 300,00 Ora Connect: R$ 300,00 (faixa 1) · 100% da meta · faltou 1 operação Ver o extrato Contestar esta linha");
    expect(p.visivel).toContain("Beto (teste) R$ 0,00 Ora Connect: nenhuma faixa · 25% da meta · faltaram 3 operações");
    expect(p.doTipo("Indicador").map((i) => [i.rotulo, i.valor])).toEqual([["Bônus calculado", "R$\u00a0300,00"], ["Com bônus", "1 de 2"]]);
    const form = p.doTipo("form")[0];
    expect(form?.action).toBe(enviarFechamento);
    expect(p.campos.filter(([tipo]) => tipo === "hidden")).toEqual([["hidden", "mes", "2026-10-01"], ["hidden", "loja", LOJA], ["hidden", "totais", JSON.stringify({ [ANA]: 30_000, [BETO]: 0 })]]);
    expect(p.campos.filter(([, nome]) => nome === "contestar")).toEqual([["checkbox", "contestar", ANA], ["checkbox", "contestar", BETO]]);
    expect(p.doTipo("textarea").map((t) => t.name)).toEqual([`motivo_${ANA}`, `motivo_${BETO}`]);
    expect(p.links).toContain(`/metas/extrato?mes=2026-10&vendedor=${ANA}`);
    expect(p.links).toContain("/metas?mes=2026-10");
    expect(p.doTipo("ExportarCsv")).toEqual([]);
  });

  it("sem regra no mês ou sem ninguém com meta: não há o que fechar, e não há formulário", async () => {
    cenario.respostas.bonus_do_mes = { data: { ...APURACAO, regras: {}, vendedores: [] }, error: null };
    let p = await pagina();
    expect(p.visivel).toContain("Nenhuma regra de bônus valia em outubro de 2026");
    expect(p.doTipo("form")).toEqual([]);
    cenario.respostas.bonus_do_mes = { data: { ...APURACAO, vendedores: [] }, error: null };
    p = await pagina();
    expect(p.visivel).toContain("Ninguém teve meta ou venda em outubro de 2026");
    expect(p.doTipo("form")).toEqual([]);
  });

  it("enviado: a gerente acompanha, sem formulário; o dono decide cada contestação e aprova, vendo todas as lojas", async () => {
    cenario.respostas.bonus_fechamento_do_mes = fechado(ENVIADO);
    let p = await pagina();
    expect(p.visivel).toContain("Bônus de outubro de 2026 com o dono Enviado em 02/11/2026, 10:00 por você. 1 linha contestada.");
    expect(p.visivel).toContain(`Contestada pela gerência ${CONTESTACAO.motivo}`);
    expect(p.visivel).toContain("Aguardando a aprovação do dono");
    expect(p.doTipo("form")).toEqual([]);

    cenario.usuario = DONO;
    cenario.permissoes = new Set(DE_DONO);
    cenario.tabelas.bonus_fechamentos = [{ unidade_id: LOJA, mes: "2026-10-01", situacao: "enviado", total_calculado: 30_000, total_aprovado: null, enviado_em: ENVIADO_EM, aprovado_em: null }];
    p = await pagina();
    expect(cenario.lidas).toContain("bonus_fechamentos");
    expect(p.visivel).toContain("Aprovar o bônus de outubro de 2026 Enviado em 02/11/2026, 10:00 por Caio (teste). 1 linha contestada.");
    expect(p.visivel).toContain("As lojas em outubro de 2026 1 fechamento aguarda a sua aprovação.");
    expect(p.visivel).toContain("Santa Cândida (teste) Aguardando a sua aprovação R$ 300,00 Loja 02 (teste) Não enviado");
    expect(p.links).toContain(`/metas/fechamento?loja=${OUTRA}`);
    expect(p.doTipo("form")[0]?.action).toBe(aprovarFechamento);
    // A contestada vem primeiro; cada linha vai junto; a contestada precisa de decisão.
    expect(p.campos.filter(([tipo]) => tipo === "hidden")).toEqual([
      ["hidden", "fechamento", FECHAMENTO], ["hidden", "mes", "2026-10-01"], ["hidden", "loja", LOJA],
      ["hidden", "linhas", ANA], ["hidden", "linhas", BETO], ["hidden", "contestadas", BETO],
    ]);
    expect(p.doTipo("input").filter((i) => i.name === `decisao_${BETO}`).map((i) => [i.type, i.value, i.required ?? false])).toEqual([["radio", "manter", true], ["radio", "ajustar", false]]);
    expect(p.doTipo("input").filter((i) => i.name === `decisao_${ANA}`).map((i) => [i.type, i.value])).toEqual([["checkbox", "ajustar"]]);
    expect(p.doTipo("input").filter((i) => String(i.name).startsWith("valor_")).map((i) => i.name)).toEqual([`valor_${BETO}`, `valor_${ANA}`]);
    // O texto visível junta os espaços (na tela, o "R$" e o valor não se separam).
    expect(p.visivel).toContain("Manter o calculado (R$ 0,00) Pagar outro valor");
    expect(p.visivel).toContain("Aprovar o pagamento");
  });

  it("aprovado: o que vai para o pagamento, com os ajustes, a planilha para a folha e a impressão", async () => {
    cenario.usuario = DONO;
    cenario.permissoes = new Set(DE_DONO);
    cenario.respostas.bonus_fechamento_do_mes = fechado(APROVADO);
    const p = await pagina();
    expect(p.visivel).toContain("Bônus de outubro de 2026 aprovado Enviado em 02/11/2026, 10:00 por Caio (teste); aprovado pelo dono em 03/11/2026, 09:00.");
    expect(p.doTipo("Indicador").map((i) => [i.rotulo, i.valor])).toEqual([["A pagar", "R$\u00a0600,00"], ["Calculado", "R$\u00a0300,00"], ["Ajustes", "1"]]);
    expect(p.visivel).toContain(`Pago outro valor: ${AJUSTE}`);
    expect(p.visivel).toContain(`Contestada pela gerência: ${CONTESTACAO.motivo}`);
    expect(p.doTipo("form")).toEqual([]);
    const planilha = p.doTipo("ExportarCsv")[0] as { prefixo: string; nomeArquivo: string; linhas: unknown[][] };
    expect(planilha).toMatchObject({ prefixo: "ora5g", nomeArquivo: "fechamento-do-bonus-2026-10-santa-candida-teste" });
    expect(planilha.linhas.at(-1)).toEqual(["Total", "300,00", "600,00", "", "", ""]);
    expect(p.doTipo("BotaoImprimir")).toHaveLength(1);
    expect(p.doTipo("CarimboDaImpressao")[0]).toMatchObject({ texto: "Ora 5G · fechamento do bônus · Santa Cândida (teste) · outubro de 2026 · impresso em 13/11/2026 12:00" });
  });

  it("o mês: só os seis que terminaram; o pedido de outro cai no mês passado", async () => {
    let p = await pagina({ mes: "2026-08" });
    expect(p.chamadas("bonus_fechamento_do_mes")).toEqual([{ p_mes: "2026-08-01", p_unidade: LOJA }]);
    expect(p.filtro("Mês")?.opcoes.find((o) => o.ativo)?.rotulo).toBe("Agosto");
    for (const mes of ["2026-11", "2026-12", "2026-04", "outubro"]) {
      cenario.chamadas = [];
      p = await pagina({ mes });
      expect(p.chamadas("bonus_fechamento_do_mes"), mes).toEqual([{ p_mes: "2026-10-01", p_unidade: LOJA }]);
    }
  });

  it("o vendedor não vê o fechamento; leitura indisponível ou com falha não mostra número", async () => {
    cenario.usuario = ANA;
    cenario.permissoes = new Set(["metas.ver_propria", "venda.registrar"]);
    let p = await pagina();
    expect(p.visivel).toContain("Sem permissão");
    expect(cenario.chamadas).toEqual([]);

    cenario.usuario = CAIO;
    cenario.permissoes = new Set(GERENTE);
    cenario.respostas.bonus_fechamento_do_mes = { data: null, error: { code: "PGRST202" } };
    p = await pagina();
    expect(p.visivel).toContain("o fechamento do bônus (migration bonus_fechamento)");
    expect(p.doTipo("form")).toEqual([]);
    cenario.respostas.bonus_fechamento_do_mes = fechado({ ...ENVIADO, fechamento: { ...ENVIADO.fechamento, total_calculado: 1 } });
    p = await pagina();
    expect(p.visivel).toContain("Não foi possível ler agora");
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["bonus: resposta inesperada de bonus_fechamento_do_mes"]);
    cenario.respostas.bonus_fechamento_do_mes = { data: null, error: { code: "42501" } };
    expect((await pagina()).visivel).toContain("O banco recusou a leitura do bônus desta loja para o seu perfil.");
  });

  it("os avisos depois das ações", async () => {
    expect((await pagina({ ok: "enviado" })).visivel).toContain("Fechamento enviado ao dono.");
    expect((await pagina({ erro: "mudou" })).visivel).toContain("Os números do mês mudaram desde que a tela abriu.");
    expect((await pagina({ erro: "ja_enviado" })).doTipo("Aviso").find((a) => a.tom === "aviso")).toBeDefined();
    expect((await pagina({ erro: "inventado" })).visivel).not.toContain("inventado");
  });
});

describe("ações do fechamento", () => {
  const formulario = (valores: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [nome, valor] of Object.entries(valores)) for (const v of Array.isArray(valor) ? valor : [valor]) f.append(nome, v);
    return f;
  };
  const destinoDe = async (acao: Promise<unknown>) => {
    try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
    throw new Error("a ação não redirecionou");
  };
  const TOTAIS = JSON.stringify({ [ANA]: 30_000, [BETO]: 0 });

  it("enviar: os totais da tela e as contestações vão ao banco; a recusa volta como mensagem", async () => {
    cenario.respostas.bonus_fechamento_enviar = { data: FECHAMENTO, error: null };
    const base = { mes: "2026-10-01", loja: LOJA, totais: TOTAIS };
    expect(await destinoDe(enviarFechamento(formulario({ ...base, contestar: BETO, [`motivo_${BETO}`]: "Faltou a ativação de 31/10" })))).toBe(`/metas/fechamento?mes=2026-10&loja=${LOJA}&ok=enviado`);
    expect(cenario.chamadas.at(-1)).toEqual({
      nome: "bonus_fechamento_enviar",
      argumentos: { p_mes: "2026-10-01", p_unidade: LOJA, p_totais: { [ANA]: 30_000, [BETO]: 0 }, p_contestacoes: { [BETO]: "Faltou a ativação de 31/10" } },
    });
    await destinoDe(enviarFechamento(formulario(base)));
    expect(cenario.chamadas.at(-1)?.argumentos.p_contestacoes).toBeNull();
    // Contestação sem motivo nem sai daqui.
    cenario.chamadas = [];
    expect(await destinoDe(enviarFechamento(formulario({ ...base, contestar: BETO })))).toBe(`/metas/fechamento?mes=2026-10&loja=${LOJA}&erro=motivo`);
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.bonus_fechamento_enviar = { data: null, error: { code: "22023", message: "Os números do mês mudaram desde que a tela abriu: confira de novo" } };
    expect(await destinoDe(enviarFechamento(formulario(base)))).toBe(`/metas/fechamento?mes=2026-10&loja=${LOJA}&erro=mudou`);
    cenario.respostas.bonus_fechamento_enviar = { data: null, error: { code: "42501", message: "Sem permissão para conferir o bônus desta loja" } };
    expect(await destinoDe(enviarFechamento(formulario(base)))).toBe(`/metas/fechamento?mes=2026-10&loja=${LOJA}&erro=permissao`);
    expect(await destinoDe(enviarFechamento(formulario({ mes: "x" })))).toBe("/metas/fechamento?erro=dados");
  });

  it("aprovar: a decisão de cada contestação e os ajustes vão ao banco", async () => {
    cenario.respostas.bonus_fechamento_aprovar = { data: 60_000, error: null };
    const base = { fechamento: FECHAMENTO, mes: "2026-10-01", loja: LOJA, linhas: [BETO, ANA], contestadas: BETO };
    expect(await destinoDe(aprovarFechamento(formulario({ ...base, [`decisao_${BETO}`]: "ajustar", [`valor_${BETO}`]: "300,00", [`motivo_${BETO}`]: AJUSTE }))))
      .toBe(`/metas/fechamento?mes=2026-10&loja=${LOJA}&ok=aprovado`);
    expect(cenario.chamadas.at(-1)).toEqual({
      nome: "bonus_fechamento_aprovar",
      argumentos: { p_fechamento: FECHAMENTO, p_decisoes: { [BETO]: { decisao: "ajustar", valor: 30_000, motivo: AJUSTE } } },
    });
    cenario.chamadas = [];
    expect(await destinoDe(aprovarFechamento(formulario(base)))).toBe(`/metas/fechamento?mes=2026-10&loja=${LOJA}&erro=decidir`);
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.bonus_fechamento_aprovar = { data: null, error: { code: "22023", message: "Para pagar o valor calculado, escolha manter" } };
    expect(await destinoDe(aprovarFechamento(formulario({ ...base, [`decisao_${BETO}`]: "ajustar", [`valor_${BETO}`]: "0,00", [`motivo_${BETO}`]: AJUSTE }))))
      .toBe(`/metas/fechamento?mes=2026-10&loja=${LOJA}&erro=igual`);
    cenario.respostas.bonus_fechamento_aprovar = { data: null, error: { code: "22023", message: "Este fechamento já foi aprovado" } };
    expect(await destinoDe(aprovarFechamento(formulario({ ...base, [`decisao_${BETO}`]: "manter" })))).toBe(`/metas/fechamento?mes=2026-10&loja=${LOJA}&erro=ja_aprovado`);
  });
});
