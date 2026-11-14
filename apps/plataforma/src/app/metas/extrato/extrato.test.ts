// /metas/extrato (lote L9a) com sessão e Supabase SIMULADOS: nenhuma credencial, nenhuma rede. Confere
// de quem é o extrato que vai ao banco em cada perfil (o vendedor só o próprio, mesmo pedindo outro; a
// gestão escolhe o vendedor; o dono, também a loja), o que a tela mostra em cada estado e a planilha.
// A soma está provada em packages/banco/src/bonus.test.ts. Dados fictícios.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const ANA = "00000000-0000-4000-8000-00000000a001";
const BETO = "00000000-0000-4000-8000-00000000a002";
const CAIO = "00000000-0000-4000-8000-00000000a003";
const AGORA = new Date("2026-11-13T15:00:00.000Z");

type Linha = Record<string, unknown>;
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  usuario: "",
  permissoes: new Set<string>(),
  respostas: {} as Record<string, Resposta>,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
class Consulta {
  constructor(private nome: string) {}
  select() { return this; }
  in() { return this; }
  order() { return this; }
  then(resolver: (r: Resposta) => unknown) {
    if (this.nome !== "unidades") throw new Error(`a tela não lê ${this.nome} direto`);
    return Promise.resolve({ data: [{ id: LOJA, nome: "Santa Cândida (teste)", tipo: "loja_fisica" }, { id: OUTRA, nome: "Loja 02 (teste)", tipo: "loja_fisica" }], error: null }).then(resolver);
  }
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

import ExtratoDoBonus from "./page";

const APRESENTACAO = new Set(["ResumoDoBonus", "FatosDoMes", "MedidaDoBonus", "EstadoDoPainel"]);
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
  const arvore = (await ExtratoDoBonus({ searchParams: Promise.resolve(parametros) })) as ReactElement<Linha>;
  const elementos: Elemento[] = [];
  percorrer(arvore, (e) => elementos.push(e));
  const doTipo = (tipo: string) => elementos.filter((e) => e.tipo === tipo).map((e) => e.props);
  return {
    visivel: visivel(arvore.props.children),
    doTipo,
    titulo: doTipo("TituloPagina")[0],
    links: elementos.filter((e) => typeof e.props.href === "string").map((e) => e.props.href as string),
    filtro: (rotulo: string) => doTipo("FiltroSegmentado").find((f) => f.rotulo === rotulo) as { opcoes: { href: string; rotulo: string; ativo: boolean }[] } | undefined,
    chamadas: (nome: string) => cenario.chamadas.filter((c) => c.nome === nome).map((c) => c.argumentos),
  };
}

const fato = (tipo: string, quando: string, extra: Linha) => ({ tipo, quando, venda: null, devolucao: null, operacao: null, servico: null, vendido_liquido: 0, aparelhos: 0, acessorios: 0, connect: 0, ...extra });
const extrato = (vendedor: string, mes = "2026-11-01", unidade = LOJA) => ({
  mes, regra_contagem: 1, unidade_id: unidade, vendedor_id: vendedor, quantidade: 5,
  totais: { vendido_liquido: 157_800, aparelhos: 1, acessorios: 7_900, connect: 1 },
  linhas: [
    fato("connect", `${mes.slice(0, 8)}13T14:05:00+00:00`, { operacao: 45, servico: "ativacao", connect: 1 }),
    fato("devolucao", `${mes.slice(0, 8)}12T18:00:00+00:00`, { venda: 1234, devolucao: 7, vendido_liquido: -7_900, acessorios: -7_900 }),
    fato("cancelamento", `${mes.slice(0, 8)}11T18:00:00+00:00`, { venda: 1235, vendido_liquido: -7_900, acessorios: -7_900 }),
    fato("venda", `${mes.slice(0, 8)}10T18:00:00+00:00`, { venda: 1235, vendido_liquido: 7_900, acessorios: 7_900 }),
    fato("venda", `${mes.slice(0, 8)}09T13:30:00+00:00`, { venda: 1234, vendido_liquido: 165_700, aparelhos: 1, acessorios: 15_800 }),
  ],
});
const BONUS = {
  mes: "2026-11-01", regra_contagem: 1,
  regras: { connect: { vigente_desde: "2026-11-01", versao: 5, faixas: [{ a_partir_de: 50, valor: 5_000 }] } },
  vendedores: [{ vendedor_id: ANA, total: 5_000, medidas: { connect: { meta: 10, realizado: 6, faixa: 1, bonus: 5_000, proxima: null } } }],
};
const EQUIPE = [
  { usuario_id: ANA, nome: "Ana (teste)", na_equipe: true },
  { usuario_id: BETO, nome: "Beto (teste)", na_equipe: true },
  { usuario_id: CAIO, nome: "Caio (teste)", na_equipe: true },
];
const GERENTE = ["metas.gerir", "metas.ver_unidade", "venda.ver_unidade", "venda.registrar"];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, {
    usuario: ANA, permissoes: new Set(["metas.ver_propria", "venda.registrar"]), chamadas: [],
    respostas: { extrato_do_vendedor: { data: extrato(ANA), error: null }, bonus_do_mes: { data: BONUS, error: null }, metas_equipe: { data: EQUIPE, error: null } },
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("/metas/extrato (L9a)", () => {
  it("o vendedor: o próprio extrato, mesmo pedindo o de outro; cada fato, o total, o bônus, a planilha e a impressão", async () => {
    const p = await pagina({ vendedor: BETO });
    expect(p.chamadas("extrato_do_vendedor")).toEqual([{ p_mes: "2026-11-01", p_unidade: LOJA, p_vendedor: ANA }]);
    expect(p.chamadas("bonus_do_mes")).toEqual([{ p_mes: "2026-11-01", p_unidade: LOJA }]);
    expect(p.chamadas("metas_equipe")).toEqual([]);
    expect(p.titulo).toMatchObject({ titulo: "Meu extrato do bônus", sobretitulo: "Santa Cândida (teste)" });
    expect(p.filtro("Vendedor")).toBeUndefined();
    expect(p.visivel).toContain("Bônus de novembro de 2026");
    expect(p.visivel).toContain("R$ 50,00 Ora Connect confirmado R$ 50,00 Faixa 1 de 1: R$ 50,00. Maior faixa alcançada. 6 de 10 operações · 60% da meta");
    expect(p.visivel).toContain([
      "Ativação do Ora Connect nº 45 13/11 às 11:05 +1 Ora Connect",
      "Devolução nº 7 da venda nº 1.234 12/11 às 15:00 −R$ 79,00 em acessórios −R$ 79,00",
      "Cancelamento da venda nº 1.235 11/11 às 15:00 −R$ 79,00 em acessórios −R$ 79,00",
      "Venda nº 1.235 10/11 às 15:00 +R$ 79,00 em acessórios +R$ 79,00",
      "Venda nº 1.234 09/11 às 10:30 +1 aparelho · +R$ 158,00 em acessórios +R$ 1.657,00",
      "Total do mês Vendido líquido R$ 1.578,00 · 1 aparelho · R$ 79,00 em acessórios · 1 Ora Connect",
    ].join(" "));
    const planilha = p.doTipo("ExportarCsv")[0] as { prefixo: string; nomeArquivo: string; colunas: string[]; linhas: unknown[][] };
    expect(planilha).toMatchObject({ prefixo: "ora5g", nomeArquivo: "extrato-do-bonus-2026-11-meu-santa-candida-teste" });
    expect(planilha.colunas).toEqual(["Data", "Fato", "Vendido líquido (R$)", "Aparelhos", "Acessórios (R$)", "Ora Connect"]);
    expect(planilha.linhas[0]).toEqual(["13/11/2026 11:05", "Ativação do Ora Connect nº 45", "0,00", 0, "0,00", 1]);
    expect(planilha.linhas.at(-1)).toEqual(["Total do mês", "", "1578,00", 1, "79,00", 1]);
    expect(p.doTipo("BotaoImprimir")).toHaveLength(1);
    expect(p.doTipo("CarimboDaImpressao")[0]).toMatchObject({ texto: "Ora 5G · extrato do bônus · próprio · Santa Cândida (teste) · novembro de 2026 · impresso em 13/11/2026 12:00" });
  });

  it("a gestão escolhe o vendedor da equipe; o dono escolhe também a loja e o mês", async () => {
    cenario.usuario = CAIO;
    cenario.permissoes = new Set(GERENTE);
    cenario.respostas.extrato_do_vendedor = { data: extrato(BETO), error: null };
    let p = await pagina({ vendedor: BETO });
    expect(p.chamadas("extrato_do_vendedor")).toEqual([{ p_mes: "2026-11-01", p_unidade: LOJA, p_vendedor: BETO }]);
    expect(p.titulo).toMatchObject({ titulo: "Extrato de Beto (teste)" });
    expect(p.filtro("Vendedor")?.opcoes.map((o) => [o.rotulo, o.href, o.ativo])).toEqual([
      ["Ana (teste)", `/metas/extrato?vendedor=${ANA}`, false], ["Beto (teste)", `/metas/extrato?vendedor=${BETO}`, true], ["Caio (teste)", "/metas/extrato", false],
    ]);
    // Beto não tem linha no bônus: zeros, sem meta.
    expect(p.visivel).toContain("Ora Connect confirmado R$ 0,00 Sem meta de ora connect no mês: esta medida não paga bônus.");

    cenario.permissoes = new Set([...GERENTE, "venda.ver_todas"]);
    cenario.respostas.extrato_do_vendedor = { data: extrato(BETO, "2026-10-01", OUTRA), error: null };
    cenario.chamadas = [];
    p = await pagina({ vendedor: BETO, loja: OUTRA, mes: "2026-10" });
    expect(p.chamadas("extrato_do_vendedor")).toEqual([{ p_mes: "2026-10-01", p_unidade: OUTRA, p_vendedor: BETO }]);
    expect(p.titulo).toMatchObject({ sobretitulo: "Loja 02 (teste)" });
    expect(p.filtro("Mês")?.opcoes.find((o) => o.ativo)?.href).toBe(`/metas/extrato?mes=2026-10&loja=${OUTRA}&vendedor=${BETO}`);
    expect(p.links).toContain(`/metas?mes=2026-10&loja=${OUTRA}`);
  });

  it("recusado, indisponível e falha: nenhuma linha, nenhuma planilha, nenhum número inventado", async () => {
    cenario.respostas.extrato_do_vendedor = { data: null, error: { code: "42501" } };
    let p = await pagina();
    expect(p.visivel).toContain("O banco recusou este extrato");
    expect(p.doTipo("ExportarCsv")).toEqual([]);
    expect(p.doTipo("BotaoImprimir")).toEqual([]);
    cenario.respostas.extrato_do_vendedor = { data: null, error: { code: "PGRST202" } };
    expect((await pagina()).visivel).toContain("a leitura do bônus por meta (migration bonus_por_meta)");
    cenario.respostas.extrato_do_vendedor = { data: { ...extrato(ANA), totais: { vendido_liquido: 1, aparelhos: 1, acessorios: 7_900, connect: 1 } }, error: null };
    p = await pagina();
    expect(p.visivel).toContain("Não foi possível ler agora");
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["bonus: resposta inesperada de extrato_do_vendedor"]);
  });

  it("mês sem fato: o aviso vazio; quem não vê metas não pergunta nada ao banco", async () => {
    cenario.respostas.extrato_do_vendedor = { data: { ...extrato(ANA), quantidade: 0, linhas: [], totais: { vendido_liquido: 0, aparelhos: 0, acessorios: 0, connect: 0 } }, error: null };
    expect((await pagina()).visivel).toContain("Nenhum fato em novembro de 2026");
    cenario.permissoes = new Set(["venda.registrar"]);
    cenario.chamadas = [];
    const p = await pagina();
    expect(p.visivel).toContain("Sem permissão");
    expect(cenario.chamadas).toEqual([]);
  });

  it("no mês fechado, o valor aprovado de quem está no extrato, com o motivo do ajuste (L9b)", async () => {
    cenario.respostas.bonus_do_mes = { data: { ...BONUS, mes: "2026-10-01", regras: { connect: { ...BONUS.regras.connect, vigente_desde: "2026-10-01" } } }, error: null };
    cenario.respostas.extrato_do_vendedor = { data: extrato(ANA, "2026-10-01"), error: null };
    cenario.respostas.bonus_fechamento_do_mes = { data: { mes: "2026-10-01", unidade_id: LOJA, fechamento: null, linhas: [
      { vendedor_id: ANA, total_calculado: 5_000, total_aprovado: 8_000, ajuste_motivo: "Ativação do dia 31", aprovado_em: "2026-11-03T12:00:00+00:00", contestacao: null },
    ] }, error: null };
    let p = await pagina({ mes: "2026-10" });
    expect(p.chamadas("bonus_fechamento_do_mes")).toEqual([{ p_mes: "2026-10-01", p_unidade: LOJA }]);
    expect(p.visivel).toContain("Bônus de outubro de 2026 Aprovado pelo dono em 03/11/2026, 09:00. Vale a maior faixa alcançada em cada medida. R$ 80,00 O dono aprovou outro valor Ativação do dia 31 (calculado: R$ 50,00).");
    // Antes do envio: provisório; no mês corrente, nem se pergunta.
    cenario.respostas.bonus_fechamento_do_mes = { data: { mes: "2026-10-01", unidade_id: LOJA, fechamento: null, linhas: [] }, error: null };
    expect((await pagina({ mes: "2026-10" })).visivel).toContain("Bônus de outubro de 2026 Provisório até o fechamento do mês.");
    cenario.chamadas = [];
    cenario.respostas.bonus_do_mes = { data: BONUS, error: null };
    cenario.respostas.extrato_do_vendedor = { data: extrato(ANA), error: null };
    p = await pagina();
    expect(p.chamadas("bonus_fechamento_do_mes")).toEqual([]);
  });
});
