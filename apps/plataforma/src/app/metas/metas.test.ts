// /metas (lote G4b) com sessão e Supabase SIMULADOS: nenhuma credencial, nenhuma rede. Confere QUAIS
// perguntas vão ao banco em cada perfil (gestão, dono escolhendo a loja, vendedor), o que a tela
// mostra em cada estado (falha e fonte ausente nunca viram zero) e o que a ação do formulário manda
// ao banco. A soma está provada em packages/banco/src/metas.test.ts e as regras puras em
// src/lib/metas/painel.test.ts. Dados fictícios.
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
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: cenario.usuario },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-13T23:00:00Z" },
    supabase,
  }),
}));

import { definirMetas } from "./acoes";
import Metas from "./page";

// Só os componentes de apresentação das metas são executados; os compartilhados ficam como elementos.
const APRESENTACAO = new Set([
  "MetasDaGestao", "MinhasMetas", "ResumoDaLoja", "PorVendedor", "EquipeNoMes", "DefinirMetas", "ComoConta", "MinhaMeta", "EstadoDoPainel", "BarrasDoRitmo",
  // Bônus por meta (L9a).
  "BonusDaEquipe", "MeuBonus", "MedidaDoBonus", "RegrasDoMes", "SemRegra", "CelulaDaMedida", "EstadoDoBonus", "ComoOBonusConta",
  // Fechamento do bônus (L9b).
  "SituacaoDoFechamento",
]);
type Elemento = { tipo: string; props: Linha };
function percorrer(v: unknown, elemento: (e: Elemento) => void, folha: (t: string) => void): void {
  if (Array.isArray(v)) for (const x of v) percorrer(x, elemento, folha);
  else if (typeof v === "string" || typeof v === "number") folha(String(v));
  else if (isValidElement<Linha>(v)) {
    const tipo = typeof v.type === "string" ? v.type : typeof v.type === "function" ? v.type.name : "";
    if (typeof v.type === "function" && APRESENTACAO.has(tipo)) percorrer((v.type as (p: unknown) => unknown)(v.props), elemento, folha);
    else {
      elemento({ tipo, props: v.props });
      percorrer(tipo === "MoldeReal" ? v.props.children : Object.values(v.props), elemento, folha);
    }
  } else if (v && typeof v === "object" && !("$$typeof" in v)) percorrer(Object.values(v), elemento, folha);
}
function ler(v: unknown) {
  const pedacos: string[] = [];
  const elementos: Elemento[] = [];
  percorrer(v, (e) => elementos.push(e), (t) => pedacos.push(t));
  return { texto: pedacos.join(" ").replace(/\s+/g, " "), elementos, doTipo: (tipo: string) => elementos.filter((e) => e.tipo === tipo).map((e) => e.props) };
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
      else andar([x.props.titulo, x.props.subtitulo, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ").trim();
}
async function pagina(parametros: Record<string, string> = {}) {
  const lida = ler((await Metas({ searchParams: Promise.resolve(parametros) })) as ReactElement);
  const cartoes = lida.doTipo("Cartao");
  return {
    ...lida,
    cartoes: cartoes.map((c) => String(c.titulo)),
    cartao: (titulo: string) => {
      const c = cartoes.find((x) => x.titulo === titulo);
      if (!c) throw new Error(`a tela não tem "${titulo}"`);
      return { ...ler(c), props: c, visivel: visivel(c.children) };
    },
    indicador: (rotulo: string) => lida.doTipo("Indicador").find((i) => i.rotulo === rotulo),
    filtro: (rotulo: string) => lida.doTipo("FiltroSegmentado").find((f) => f.rotulo === rotulo) as { opcoes: { href: string; rotulo: string; ativo: boolean }[] } | undefined,
    titulo: lida.doTipo("TituloPagina")[0],
    chamadas: (nome: string) => cenario.chamadas.filter((c) => c.nome === nome).map((c) => c.argumentos),
  };
}

const PAINEL = {
  mes: "2026-11-01", dias_no_mes: 30, dias_decorridos: 13, regra_contagem: 1,
  loja: { metas: { vendido_liquido: "5000000", aparelhos: 40 }, realizado: { vendido_liquido: "2600000", aparelhos: 12, acessorios: 150000, connect: 9 } },
  vendedores: [
    { vendedor_id: ANA, metas: { vendido_liquido: 2000000, connect: 10 }, realizado: { vendido_liquido: 1200000, aparelhos: 7, acessorios: 90000, connect: 6 } },
    { vendedor_id: BETO, metas: {}, realizado: { vendido_liquido: 1400000, aparelhos: 5, acessorios: 60000, connect: 3 } },
  ],
};
const EQUIPE = [
  { usuario_id: ANA, nome: "Ana (teste)", na_equipe: true },
  { usuario_id: BETO, nome: "Beto (teste)", na_equipe: false },
  { usuario_id: CAIO, nome: "Caio (teste)", na_equipe: true },
];
const DESFEITO = { cancelamentos: 0, cancelado: 0, devolucoes: 0, devolvido: 0 };
const VENDAS_DA_ANA = {
  totais: { vendas: 3, vendido: 1200000, subtotal: 1200000, descontos: 0, vendas_com_desconto: 0, ...DESFEITO },
  periodos: [], tipos: [], categorias: [], vendedores: [],
  lojas: [{ unidade_id: LOJA, nome: "Santa Cândida (teste)", vendas: 2, vendido: 900000, ...DESFEITO }, { unidade_id: OUTRA, nome: "Loja 02 (teste)", vendas: 1, vendido: 300000, ...DESFEITO }],
};
const GERENTE = ["metas.gerir", "metas.ver_unidade", "venda.ver_unidade", "venda.registrar"];
const DONO = [...GERENTE, "metas.ver_propria", "venda.ver_todas"];
const errosRegistrados = () => vi.mocked(console.error).mock.calls;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, {
    usuario: ANA, permissoes: new Set(GERENTE), chamadas: [],
    respostas: { metas_painel: { data: PAINEL, error: null }, metas_equipe: { data: EQUIPE, error: null }, vendas_painel: { data: VENDAS_DA_ANA, error: null } },
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("/metas, gestão (G4b)", () => {
  it("o gerente: o mês de hoje e a loja do turno vão ao banco; quatro indicadores com a meta, o atingimento e o ritmo", async () => {
    const p = await pagina();
    expect(p.chamadas("metas_painel")).toEqual([{ p_mes: "2026-11-01", p_unidade: LOJA }]);
    expect(p.chamadas("metas_equipe")).toEqual([{ p_mes: "2026-11-01", p_unidade: LOJA }]);
    expect(p.chamadas("vendas_painel")).toEqual([]);
    expect(p.titulo).toMatchObject({ titulo: "Metas e desempenho", sobretitulo: "Santa Cândida (teste)" });
    expect(p.indicador("Valor vendido líquido")).toMatchObject({ valor: "R$ 26 mil", detalhe: "52% de R$ 50 mil · No ritmo", tom: "bom" });
    expect(p.indicador("Aparelhos")).toMatchObject({ valor: "12", detalhe: "30% de 40 · Abaixo do ritmo", tom: "atencao" });
    expect(p.indicador("Acessórios")).toMatchObject({ valor: "R$ 1.500,00", detalhe: "Meta não definida", tom: "neutro" });
    expect(p.indicador("Ora Connect confirmado")).toMatchObject({ valor: "9", detalhe: "Meta não definida" });
    // Sem a rede, não há escolha de loja; o mês tem as quatro opções.
    expect(p.filtro("Loja")).toBeUndefined();
    expect(p.filtro("Mês")?.opcoes.map((o) => [o.rotulo, o.href, o.ativo])).toEqual([
      ["Setembro", "/metas?mes=2026-09", false], ["Outubro", "/metas?mes=2026-10", false], ["Este mês", "/metas", true], ["Dezembro", "/metas?mes=2026-12", false],
    ]);
  });

  it("ritmo da loja: barra do atingimento e traço do ritmo esperado hoje, só das medidas com meta, com a tabela", async () => {
    const c = (await pagina()).cartao("Ritmo da loja em novembro de 2026");
    expect(String(c.props.subtitulo)).toContain("ritmo esperado até hoje (13 de 30 dias)");
    const barras = c.doTipo("BarrasHorizontais")[0] as { dados: { rotulo: string; valor: number; meta: number; detalhe: unknown }[]; nomeMeta: string };
    expect(barras.nomeMeta).toBe("Ritmo esperado hoje");
    expect(barras.dados.map((d) => [d.rotulo, d.valor, Math.round(d.meta * 10) / 10, visivel(d.detalhe)])).toEqual([
      ["Vendido líquido", 52, 43.3, "R$ 26 mil de R$ 50 mil"], ["Aparelhos", 30, 42.5, "12 de 40"],
    ]);
    expect((c.doTipo("TabelaDoGrafico")[0] as { linhas: unknown[][] }).linhas[1]).toEqual(["Aparelhos", "12", "40", "30%", "17", "Abaixo do ritmo"]);
  });

  it("por vendedor: quem tem meta primeiro, com o traço da meta; a medida escolhida no endereço; a equipe inteira na tabela", async () => {
    let p = await pagina();
    let barras = p.cartao("Valor vendido líquido por vendedor").doTipo("BarrasHorizontais")[0] as { dados: { rotulo: string; valor: number; meta?: number; detalhe: string }[] };
    expect(barras.dados).toEqual([
      { rotulo: "Ana (teste)", valor: 1_200_000, meta: 2_000_000, detalhe: "60%" },
      { rotulo: "Beto (teste)", valor: 1_400_000, meta: undefined, detalhe: "sem meta" },
    ]);
    expect(p.filtro("Medida")?.opcoes.map((o) => [o.rotulo, o.href, o.ativo])).toEqual([
      ["Vendido líquido", "/metas#por-vendedor", true], ["Aparelhos", "/metas?medida=aparelhos#por-vendedor", false],
      ["Acessórios", "/metas?medida=acessorios#por-vendedor", false], ["Ora Connect", "/metas?medida=connect#por-vendedor", false],
    ]);
    const equipe = p.cartao("Equipe no mês");
    expect(equipe.visivel).toContain("Ana (teste) R$ 12.000,00 de R$ 20.000,00 · 60% 7 sem meta R$ 900,00 sem meta 6 de 10 · 60%");
    expect(equipe.visivel).toContain("Beto (teste) fora da equipe atual R$ 14.000,00 sem meta");
    expect(equipe.visivel).toContain("Caio (teste) R$ 0,00 sem meta 0 sem meta R$ 0,00 sem meta 0 sem meta");

    // Ora Connect confirmado por vendedor (linha 24 da matriz): do vendedor de origem, com a meta.
    p = await pagina({ medida: "connect" });
    barras = p.cartao("Ora Connect confirmado por vendedor").doTipo("BarrasHorizontais")[0] as typeof barras;
    expect(barras.dados.map((d) => [d.rotulo, d.valor, d.meta])).toEqual([["Ana (teste)", 6, 10], ["Beto (teste)", 3, undefined]]);
  });

  it("definir: a loja inteira e cada pessoa da equipe, com os valores vigentes nos campos; quem saiu só aparece se ainda tem meta", async () => {
    const c = (await pagina()).cartao("Definir as metas de novembro de 2026");
    const formularios = c.doTipo("form");
    expect(formularios).toHaveLength(3);
    const campos = c.doTipo("input").map((i) => [i.name, i.defaultValue ?? i.value]);
    expect(campos.filter(([nome]) => nome === "alvo").map(([, v]) => v)).toEqual(["loja", ANA, CAIO]);
    expect(campos.slice(0, 9)).toEqual([
      ["unidade", LOJA], ["alvo", "loja"], ["mes", "2026-11-01"],
      ["meta_vendido_liquido", "50.000,00"], ["meta_aparelhos", "40"], ["meta_acessorios", ""], ["meta_connect", ""], ["motivo", undefined],
      ["unidade", LOJA],
    ]);
    expect(c.visivel).toContain("Loja inteira (Santa Cândida (teste)) Vendido líquido: R$ 50.000,00 · Aparelhos: 40 Editar");
    expect(c.visivel).toContain("Ana (teste) Vendido líquido: R$ 20.000,00 · Ora Connect: 10");
    expect(c.visivel).toContain("Caio (teste) Sem metas definidas");
    // Ninguém abre aberto sem erro; com erro, abre o alvo que voltou.
    expect(c.doTipo("details").map((d) => d.open)).toEqual([false, false, false]);
    const comErro = await pagina({ erro: "motivo", alvo: ANA });
    expect(comErro.cartao("Definir as metas de novembro de 2026").doTipo("details").map((d) => d.open)).toEqual([false, true, false]);
    expect(comErro.texto).toContain("Para mudar ou retirar uma meta já definida, diga o motivo");
  });

  it("quem só acompanha (metas.ver_unidade) não recebe o formulário", async () => {
    cenario.permissoes = new Set(["metas.ver_unidade", "venda.ver_unidade"]);
    const p = await pagina();
    expect(p.cartoes).not.toContain("Definir as metas de novembro de 2026");
    expect(p.doTipo("form")).toEqual([]);
    expect(p.cartoes).toContain("Equipe no mês");
  });

  it("o dono escolhe a loja: a pergunta vai para a loja escolhida e o formulário volta para ela", async () => {
    cenario.permissoes = new Set(DONO);
    const p = await pagina({ loja: OUTRA });
    expect(p.chamadas("metas_painel")).toEqual([{ p_mes: "2026-11-01", p_unidade: OUTRA }]);
    expect(p.chamadas("metas_equipe")).toEqual([{ p_mes: "2026-11-01", p_unidade: OUTRA }]);
    expect(p.titulo).toMatchObject({ sobretitulo: "Loja 02 (teste)" });
    expect(p.filtro("Loja")?.opcoes.map((o) => [o.rotulo, o.href, o.ativo])).toEqual([["Santa Cândida (teste)", "/metas", false], ["Loja 02 (teste)", `/metas?loja=${OUTRA}`, true]]);
    const campos = p.cartao("Definir as metas de novembro de 2026").doTipo("input").map((i) => [i.name, i.value]);
    expect(campos.filter(([nome]) => nome === "loja").map(([, v]) => v)).toEqual([OUTRA, OUTRA, OUTRA]);
    expect(campos.filter(([nome]) => nome === "unidade").map(([, v]) => v)).toEqual([OUTRA, OUTRA, OUTRA]);
    // Loja que não está no cadastro lido fica na do turno.
    expect((await pagina({ loja: "00000000-0000-4000-8000-0000000000ee" })).chamadas("metas_painel").at(-1)).toEqual({ p_mes: "2026-11-01", p_unidade: LOJA });
  });

  it("o mês do endereço: o que terminou não muda; o que não começou mostra as metas; fora do limite volta para este mês", async () => {
    cenario.respostas.metas_painel = { data: { ...PAINEL, mes: "2026-10-01", dias_no_mes: 31, dias_decorridos: 31 }, error: null };
    let p = await pagina({ mes: "2026-10" });
    expect(p.chamadas("metas_painel")).toEqual([{ p_mes: "2026-10-01", p_unidade: LOJA }]);
    expect(p.indicador("Aparelhos")).toMatchObject({ detalhe: "30% de 40 · Meta não batida", tom: "ruim" });
    expect(p.cartao("Definir as metas de outubro de 2026").texto).toContain("O mês que já terminou não muda");
    expect(p.doTipo("form")).toEqual([]);

    cenario.respostas.metas_painel = { data: { ...PAINEL, mes: "2026-12-01", dias_no_mes: 31, dias_decorridos: 0, loja: { ...PAINEL.loja, realizado: { vendido_liquido: 0, aparelhos: 0, acessorios: 0, connect: 0 } } }, error: null };
    p = await pagina({ mes: "2026-12" });
    expect(p.cartao("Ritmo da loja em dezembro de 2026").doTipo("ListaDados")[0]).toMatchObject({ itens: [["Valor vendido líquido", "R$ 50.000,00"], ["Aparelhos", "40"]] });
    expect(p.indicador("Aparelhos")).toMatchObject({ detalhe: "0% de 40 · O mês ainda não começou" });
    expect(p.doTipo("form")).toHaveLength(3);

    cenario.chamadas = [];
    p = await pagina({ mes: "2030-01" });
    expect(p.chamadas("metas_painel")).toEqual([{ p_mes: "2026-11-01", p_unidade: LOJA }]);
  });

  it("falha e fonte ausente nunca viram zero; a equipe que falha não derruba os números da loja", async () => {
    cenario.respostas.metas_painel = { data: null, error: { code: "PGRST202" } };
    let p = await pagina();
    expect(p.texto).toContain("Indisponível neste ambiente");
    expect(p.texto).toContain("a leitura das metas (migration metas)");
    expect(p.doTipo("Indicador")).toEqual([]);
    expect(p.doTipo("form")).toEqual([]);

    cenario.respostas.metas_painel = { data: null, error: { code: "XX000", message: "detalhe interno" } };
    p = await pagina();
    expect(p.texto).toContain("Não foi possível ler agora");
    expect(errosRegistrados()).toContainEqual(["metas: falha ao consultar metas_painel", { codigo: "XX000" }]);
    expect(JSON.stringify(errosRegistrados())).not.toContain("detalhe interno");

    cenario.respostas.metas_painel = { data: { ...PAINEL, regra_contagem: 2 }, error: null };
    expect((await pagina()).texto).toContain("Não foi possível ler agora");
    expect(errosRegistrados()).toContainEqual(["metas: resposta inesperada de metas_painel"]);

    cenario.respostas.metas_painel = { data: PAINEL, error: null };
    cenario.respostas.metas_equipe = { data: [{ usuario_id: ANA }], error: null };
    p = await pagina();
    expect(p.indicador("Valor vendido líquido")).toMatchObject({ valor: "R$ 26 mil" });
    expect(p.cartao("Equipe no mês").texto).toContain("Não foi possível ler agora");
    expect(p.cartoes).not.toContain("Valor vendido líquido por vendedor");
    expect(p.doTipo("form")).toEqual([]);
  });

  it("quem não tem permissão de metas não pergunta nada ao banco", async () => {
    cenario.permissoes = new Set(["venda.registrar"]);
    const p = await pagina();
    expect(p.texto).toContain("Sem permissão");
    expect(cenario.chamadas).toEqual([]);
  });
});

describe("/metas, vendedor (G4b)", () => {
  beforeEach(() => {
    cenario.permissoes = new Set(["metas.ver_propria", "venda.registrar"]);
    cenario.respostas.metas_painel = { data: { ...PAINEL, loja: null, vendedores: [PAINEL.vendedores[0]] }, error: null };
  });

  it("as próprias metas, com o medidor, o ritmo e o que falta por dia; sem meta, \"meta não definida\"; onde vendeu no mês", async () => {
    const p = await pagina();
    expect(p.titulo).toMatchObject({ titulo: "Minhas metas" });
    expect(p.chamadas("metas_painel")).toEqual([{ p_mes: "2026-11-01", p_unidade: LOJA }]);
    expect(p.chamadas("metas_equipe")).toEqual([]);
    expect(p.chamadas("vendas_painel")).toEqual([{ p_inicio: "2026-11-01T03:00:00.000Z", p_fim: AGORA.toISOString(), p_por_hora: false, p_vendedor: ANA }]);
    const vendido = p.cartao("Valor vendido líquido");
    // 60% no dia 13 de 30 está adiantado: o medidor segue o ritmo (azul), não o corte fixo de 80%.
    expect(vendido.doTipo("Medidor")[0]).toMatchObject({ percentual: 60, tom: "marca" });
    expect(vendido.visivel).toContain("R$ 12.000,00 de R$ 20.000,00");
    expect(vendido.visivel).toContain("Esperado até hoje: R$ 8.666,67 (13 de 30 dias)");
    expect(vendido.visivel).toContain("Faltam R$ 8.000,00 · R$ 444,45 por dia (18 dias, contando hoje)");
    expect(p.cartao("Ora Connect confirmado").visivel).toContain("Faltam 4 operações · 1 operação por dia (18 dias, contando hoje)");
    const aparelhos = p.cartao("Aparelhos");
    expect(aparelhos.doTipo("Medidor")).toEqual([]);
    expect(aparelhos.visivel).toBe("7 no mês · nenhuma meta definida para você nesta medida");
    expect(String((aparelhos.props.acao as ReactElement<{ children: unknown }>).props.children)).toBe("Meta não definida");
    expect(p.doTipo("PainelDasLojas")[0]).toMatchObject({ doVendedor: true, vendas: { estado: "ok" } });
    expect(p.doTipo("form")).toEqual([]);
    expect(p.doTipo("Indicador")).toEqual([]);
  });

  it("sem linha própria no mês: zeros lidos e nenhuma meta; o mês que não começou não pergunta as vendas", async () => {
    cenario.respostas.metas_painel = { data: { ...PAINEL, loja: null, vendedores: [] }, error: null };
    let p = await pagina();
    expect(p.cartao("Valor vendido líquido").visivel).toBe("R$ 0,00 no mês · nenhuma meta definida para você nesta medida");
    cenario.chamadas = [];
    cenario.respostas.metas_painel = { data: { ...PAINEL, mes: "2026-12-01", dias_no_mes: 31, dias_decorridos: 0, loja: null, vendedores: [] }, error: null };
    p = await pagina({ mes: "2026-12" });
    expect(p.chamadas("vendas_painel")).toEqual([]);
    expect(p.cartao("Onde vendi").texto).toContain("O mês ainda não começou");
  });
});

describe("ação: definir as metas de um alvo (G4b)", () => {
  const formulario = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [chave, valor] of Object.entries({ unidade: LOJA, alvo: "loja", mes: "2026-11-01", meta_vendido_liquido: "50.000,00", meta_aparelhos: "40", meta_acessorios: "", meta_connect: "", motivo: "", ...campos })) f.set(chave, valor);
    return f;
  };
  async function destinoDe(acao: Promise<unknown>) {
    try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
    throw new Error("a ação não redirecionou");
  }

  it("manda as quatro medidas numa chamada só (tudo ou nada) e volta com o resultado", async () => {
    cenario.respostas.metas_definir = { data: 2, error: null };
    expect(await destinoDe(definirMetas(formulario({})))).toBe("/metas?mes=2026-11&ok=salvas");
    expect(cenario.chamadas).toEqual([{ nome: "metas_definir", argumentos: {
      p_unidade: LOJA, p_vendedor: null, p_mes: "2026-11-01", p_valores: { vendido_liquido: 5_000_000, aparelhos: 40, acessorios: null, connect: null }, p_motivo: null,
    } }]);
    cenario.respostas.metas_definir = { data: 0, error: null };
    expect(await destinoDe(definirMetas(formulario({ alvo: ANA, motivo: "Campanha", loja: OUTRA, unidade: OUTRA })))).toBe(`/metas?mes=2026-11&loja=${OUTRA}&ok=sem_mudanca`);
    expect(cenario.chamadas.at(-1)?.argumentos).toMatchObject({ p_unidade: OUTRA, p_vendedor: ANA, p_motivo: "Campanha" });
  });

  it("valor inválido volta antes do banco; o erro do banco vira a mensagem e abre o alvo", async () => {
    expect(await destinoDe(definirMetas(formulario({ alvo: ANA, meta_aparelhos: "0" })))).toBe(`/metas?mes=2026-11&erro=valor&alvo=${ANA}`);
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.metas_definir = { data: null, error: { code: "22023", message: "Diga o motivo de mudar ou retirar a meta" } };
    expect(await destinoDe(definirMetas(formulario({})))).toBe("/metas?mes=2026-11&erro=motivo&alvo=loja");
    cenario.respostas.metas_definir = { data: null, error: { code: "42501", message: "Sem permissão para definir metas nesta loja" } };
    expect(await destinoDe(definirMetas(formulario({})))).toBe("/metas?mes=2026-11&erro=permissao&alvo=loja");
    expect(await destinoDe(definirMetas(formulario({ alvo: "<script>", mes: "x" })))).toBe("/metas?erro=dados");
  });
});

// ---------------------------------------------------------------------------------------------
// Bônus por meta (L9a; decisão do proprietário de 13/11/2026, D-014)
// ---------------------------------------------------------------------------------------------
const fb = (a_partir_de: number, valor: number) => ({ a_partir_de, valor });
const BONUS = {
  mes: "2026-11-01", regra_contagem: 1,
  regras: {
    vendido_liquido: { vigente_desde: "2026-10-01", versao: 3, faixas: [fb(100, 30_000), fb(120, 50_000)] },
    connect: { vigente_desde: "2026-11-01", versao: 5, faixas: [fb(50, 5_000)] },
  },
  vendedores: [
    { vendedor_id: BETO, total: 0, medidas: {
      vendido_liquido: { meta: null, realizado: 1_400_000, faixa: null, bonus: 0, proxima: null },
      connect: { meta: null, realizado: 3, faixa: null, bonus: 0, proxima: null },
    } },
    { vendedor_id: ANA, total: 5_000, medidas: {
      vendido_liquido: { meta: 2_000_000, realizado: 1_200_000, faixa: null, bonus: 0, proxima: { faixa: 1, a_partir_de: 100, valor: 30_000, falta: 800_000 } },
      connect: { meta: 10, realizado: 6, faixa: 1, bonus: 5_000, proxima: null },
    } },
  ],
};
const links = (l: { elementos: Elemento[] }) => l.elementos.filter((e) => typeof e.props.href === "string").map((e) => e.props.href as string);

describe("/metas, bônus por meta (L9a)", () => {
  beforeEach(() => { cenario.respostas.bonus_do_mes = { data: BONUS, error: null }; });

  it("a gestão: o bônus de cada vendedor, do maior para o menor, com as faixas que valem e o link do extrato", async () => {
    const p = await pagina();
    expect(p.chamadas("bonus_do_mes")).toEqual([{ p_mes: "2026-11-01", p_unidade: LOJA }]);
    const c = p.cartao("Bônus de novembro de 2026");
    expect(String(c.props.subtitulo)).toContain("Provisório até o fechamento do mês");
    expect(p.indicador("Bônus até agora")).toMatchObject({ valor: "R$\u00a050,00" });
    expect(p.indicador("Com bônus")).toMatchObject({ valor: "1 de 2", detalhe: "vendedores" });
    expect(c.visivel).toContain("Valor vendido líquido 100%: R$ 300,00 · 120%: R$ 500,00 (desde outubro de 2026) Aparelhos sem bônus Acessórios sem bônus Ora Connect confirmado 50%: R$ 50,00");
    expect(c.visivel).toContain("Ana (teste) nenhuma faixa 60% da meta · faltam R$ 8.000,00 R$ 50,00 · faixa 1 60% da meta R$ 50,00 Extrato");
    expect(c.visivel).toContain("Beto (teste) sem meta sem meta R$ 0,00 Extrato");
    expect(c.doTipo("Tabela")[0]).toMatchObject({ colunas: ["Vendedor", "Vendido líquido", "Ora Connect", "Bônus", ""] });
    // No celular, a lista; do sm em diante, a tabela: os dois com o extrato de cada um.
    expect(links(c)).toEqual([`/metas/extrato?vendedor=${ANA}`, `/metas/extrato?vendedor=${BETO}`, `/metas/extrato?vendedor=${ANA}`, `/metas/extrato?vendedor=${BETO}`]);
    expect(c.visivel).toContain("Ana (teste) R$ 50,00 Vendido líquido: nenhuma faixa · 60% da meta · faltam R$ 8.000,00 Ora Connect: R$ 50,00 (faixa 1) · 60% da meta Ver o extrato");
    // O gerente não define as regras: sem o botão.
    expect(links(c)).not.toContain("/metas/bonus");
  });

  it("o dono escolhe a loja: o bônus da loja escolhida, o botão das regras e o extrato com a loja no endereço", async () => {
    cenario.permissoes = new Set([...DONO, "bonus.definir"]);
    const p = await pagina({ loja: OUTRA, mes: "2026-10" });
    expect(p.chamadas("bonus_do_mes")).toEqual([{ p_mes: "2026-10-01", p_unidade: OUTRA }]);
    // A resposta é de novembro: mês diferente do pedido vira falha, nunca bônus.
    expect(p.cartao("Bônus de outubro de 2026").texto).toContain("Não foi possível ler agora");
    // Em outubro, a regra do Ora Connect (que só vale de novembro em diante) ainda não existe.
    cenario.respostas.bonus_do_mes = { data: {
      ...BONUS, mes: "2026-10-01", regras: { vendido_liquido: BONUS.regras.vendido_liquido },
      vendedores: BONUS.vendedores.map((v) => ({ ...v, total: 0, medidas: { vendido_liquido: v.medidas.vendido_liquido } })),
    }, error: null };
    cenario.respostas.metas_painel = { data: { ...PAINEL, mes: "2026-10-01", dias_no_mes: 31, dias_decorridos: 31 }, error: null };
    const c = (await pagina({ loja: OUTRA, mes: "2026-10" })).cartao("Bônus de outubro de 2026");
    const extratos = [`/metas/extrato?mes=2026-10&loja=${OUTRA}&vendedor=${ANA}`, `/metas/extrato?mes=2026-10&loja=${OUTRA}&vendedor=${BETO}`];
    expect(links(c)).toEqual(["/metas/bonus", ...extratos, ...extratos]);
    expect(c.doTipo("Indicador")[0]).toMatchObject({ rotulo: "Bônus do mês", valor: "R$\u00a00,00" });
    expect(c.visivel).toContain("Ana (teste) nenhuma faixa 60% da meta · faltaram R$ 8.000,00");
  });

  it("sem regra no mês: o convite para o dono definir; para a gerência, o aviso", async () => {
    cenario.respostas.bonus_do_mes = { data: { ...BONUS, regras: {}, vendedores: BONUS.vendedores.map((v) => ({ ...v, total: 0, medidas: {} })) }, error: null };
    let c = (await pagina()).cartao("Bônus de novembro de 2026");
    expect(c.visivel).toContain("Nenhuma regra de bônus vale em novembro de 2026");
    expect(c.visivel).toContain("Quando o dono definir as faixas");
    cenario.permissoes = new Set([...DONO, "bonus.definir"]);
    c = (await pagina()).cartao("Bônus de novembro de 2026");
    expect(c.visivel).toContain("Defina as faixas");
    expect(links(c)).toEqual(["/metas/bonus", "/metas/bonus"]);
  });

  it("o vendedor: o próprio bônus, com a régua de cada medida, a faixa alcançada e o que falta", async () => {
    cenario.permissoes = new Set(["metas.ver_propria", "venda.registrar"]);
    cenario.respostas.metas_painel = { data: { ...PAINEL, loja: null, vendedores: [PAINEL.vendedores[0]] }, error: null };
    cenario.respostas.bonus_do_mes = { data: { ...BONUS, vendedores: [BONUS.vendedores[1]] }, error: null };
    const p = await pagina();
    const c = p.cartao("Meu bônus em novembro de 2026");
    expect(links(c)).toEqual(["/metas/extrato"]);
    expect(c.visivel).toContain("Bônus até agora R$ 50,00");
    expect(c.visivel).toContain("Valor vendido líquido R$ 0,00 Faltam R$ 8.000,00 para 100% da meta (R$ 300,00). R$ 12.000,00 de R$ 20.000,00 · 60% da meta 1 100% da meta: R$ 300,00 2 120% da meta: R$ 500,00");
    expect(c.visivel).toContain("Ora Connect confirmado R$ 50,00 Faixa 1 de 1: R$ 50,00. Maior faixa alcançada. 6 de 10 operações · 60% da meta 50% da meta: R$ 50,00 (alcançada)");
    expect(c.doTipo("ReguaDoBonus").map((r) => [r.rotulo, r.atingido, r.alcancada])).toEqual([["Valor vendido líquido", 60, null], ["Ora Connect confirmado", 60, 1]]);
    // Sem linha própria (nem meta nem fato no mês): zeros, sem meta em nenhuma medida.
    cenario.respostas.bonus_do_mes = { data: { ...BONUS, vendedores: [] }, error: null };
    expect((await pagina()).cartao("Meu bônus em novembro de 2026").visivel).toContain("Bônus até agora R$ 0,00");
  });

  it("falha e fonte ausente nunca viram bônus; o resto da tela continua", async () => {
    cenario.respostas.bonus_do_mes = { data: null, error: { code: "PGRST202" } };
    let p = await pagina();
    expect(p.cartao("Bônus de novembro de 2026").texto).toContain("a leitura do bônus por meta (migration bonus_por_meta)");
    expect(p.cartoes).toContain("Equipe no mês");
    cenario.respostas.bonus_do_mes = { data: null, error: { code: "42501" } };
    expect((await pagina()).cartao("Bônus de novembro de 2026").texto).toContain("O banco recusou a leitura do bônus desta loja para o seu perfil.");
    // A conta que não fecha (bônus numa faixa não alcançada) é falha, com o registro só do nome da leitura.
    const errado = JSON.parse(JSON.stringify(BONUS)) as typeof BONUS;
    errado.vendedores[1]!.medidas.vendido_liquido.bonus = 30_000;
    errado.vendedores[1]!.total = 35_000;
    cenario.respostas.bonus_do_mes = { data: errado, error: null };
    p = await pagina();
    expect(p.cartao("Bônus de novembro de 2026").texto).toContain("Não foi possível ler agora");
    expect(errosRegistrados()).toContainEqual(["bonus: resposta inesperada de bonus_do_mes"]);
    expect(p.doTipo("Indicador").map((i) => i.rotulo)).not.toContain("Bônus até agora");
  });
});

describe("/metas, fechamento do bônus (L9b)", () => {
  const OUTUBRO = {
    ...BONUS, mes: "2026-10-01", regras: { vendido_liquido: BONUS.regras.vendido_liquido },
    vendedores: BONUS.vendedores.map((v) => ({ ...v, total: 0, medidas: { vendido_liquido: v.medidas.vendido_liquido } })),
  };
  const APROVADO_EM = "2026-11-03T12:00:00+00:00";
  const linhaDe = (vendedor: string, extra: Linha = {}) =>
    ({ vendedor_id: vendedor, total_calculado: 0, total_aprovado: null, ajuste_motivo: null, aprovado_em: null, contestacao: null, ...extra });
  const cabeca = (extra: Linha = {}) => ({
    id: "00000000-0000-4000-8000-0000000000f1", situacao: "enviado", apuracao: OUTUBRO, total_calculado: 0, total_aprovado: null,
    enviado_por: CAIO, enviado_em: "2026-11-02T13:00:00+00:00", aprovado_por: null, aprovado_em: null, ...extra,
  });
  const fechamento = (f: Linha | null, linhas: Linha[]) => ({ data: { mes: "2026-10-01", unidade_id: LOJA, fechamento: f, linhas }, error: null });
  beforeEach(() => {
    cenario.respostas.bonus_do_mes = { data: OUTUBRO, error: null };
    cenario.respostas.metas_painel = { data: { ...PAINEL, mes: "2026-10-01", dias_no_mes: 31, dias_decorridos: 31 }, error: null };
  });

  it("a gestão, no mês que terminou: onde está o fechamento, com o caminho para ele; no mês corrente, nada se pergunta", async () => {
    cenario.permissoes = new Set([...GERENTE, "bonus.conferir"]);
    cenario.respostas.bonus_fechamento_do_mes = fechamento(null, []);
    let p = await pagina({ mes: "2026-10" });
    expect(p.chamadas("bonus_fechamento_do_mes")).toEqual([{ p_mes: "2026-10-01", p_unidade: LOJA }]);
    let c = p.cartao("Bônus de outubro de 2026");
    expect(c.visivel).toContain("O mês terminou Confira o bônus de cada vendedor e envie o fechamento ao dono. Conferir e enviar");
    // O botão do cartão e o aviso levam ao fechamento do mês escolhido.
    expect(links(c).filter((l) => l.startsWith("/metas/fechamento"))).toEqual(["/metas/fechamento?mes=2026-10", "/metas/fechamento?mes=2026-10"]);
    // Enviado: com o dono.
    cenario.respostas.bonus_fechamento_do_mes = fechamento(cabeca(), [linhaDe(BETO), linhaDe(ANA)]);
    c = (await pagina({ mes: "2026-10" })).cartao("Bônus de outubro de 2026");
    expect(c.visivel).toContain("Fechamento com o dono Enviado em 02/11/2026, 10:00. Ver o fechamento");
    // Aprovado com ajuste: o total aprovado, o calculado e o caminho.
    cenario.respostas.bonus_fechamento_do_mes = fechamento(cabeca({ situacao: "aprovado", total_aprovado: 10_000, aprovado_por: CAIO, aprovado_em: APROVADO_EM }),
      [linhaDe(BETO, { total_aprovado: 0, aprovado_em: APROVADO_EM }), linhaDe(ANA, { total_aprovado: 10_000, ajuste_motivo: "Venda do dia 31", aprovado_em: APROVADO_EM })]);
    c = (await pagina({ mes: "2026-10" })).cartao("Bônus de outubro de 2026");
    expect(String(c.props.subtitulo)).toContain("Fechado e aprovado pelo dono");
    expect(c.visivel).toContain("Bônus aprovado O dono aprovou R$ 100,00 em 03/11/2026, 09:00 (calculado: R$ 0,00).");
    // O dono, com o fechamento à espera: o caminho para decidir.
    cenario.permissoes = new Set([...DONO, "bonus.conferir", "bonus.aprovar"]);
    cenario.respostas.bonus_fechamento_do_mes = fechamento(cabeca(), [linhaDe(BETO), linhaDe(ANA)]);
    c = (await pagina({ mes: "2026-10" })).cartao("Bônus de outubro de 2026");
    expect(c.visivel).toContain("Fechamento à espera da sua aprovação Enviado em 02/11/2026, 10:00. Decidir e aprovar");
    // Banco sem o fechamento: o cartão segue sem aviso (a tela do fechamento explica); leitura com falha avisa.
    cenario.respostas.bonus_fechamento_do_mes = { data: null, error: { code: "XX000" } };
    c = (await pagina({ mes: "2026-10" })).cartao("Bônus de outubro de 2026");
    expect(c.visivel).toContain("Não deu para ler o fechamento agora Os valores abaixo são os calculados; o aprovado pode ser outro. Abrir o fechamento");
    cenario.respostas.bonus_fechamento_do_mes = { data: null, error: { code: "PGRST202" } };
    c = (await pagina({ mes: "2026-10" })).cartao("Bônus de outubro de 2026");
    expect(c.visivel).not.toContain("O mês terminou");
    expect(c.visivel).not.toContain("Não deu para ler o fechamento");
    expect(c.doTipo("Indicador")[0]).toMatchObject({ rotulo: "Bônus do mês", valor: "R$\u00a00,00" });
    // No mês corrente, não há fechamento a perguntar.
    cenario.chamadas = [];
    cenario.respostas.bonus_do_mes = { data: BONUS, error: null };
    cenario.respostas.metas_painel = { data: PAINEL, error: null };
    p = await pagina();
    expect(p.chamadas("bonus_fechamento_do_mes")).toEqual([]);
    // O botão do cartão leva ao fechamento do mês passado (o padrão da tela).
    expect(links(p.cartao("Bônus de novembro de 2026"))).toContain("/metas/fechamento");
  });

  it("o vendedor, no mês fechado: o valor aprovado, com o motivo do ajuste; antes disso, em aprovação", async () => {
    cenario.permissoes = new Set(["metas.ver_propria", "venda.registrar"]);
    cenario.respostas.metas_painel = { data: { ...PAINEL, mes: "2026-10-01", dias_no_mes: 31, dias_decorridos: 31, loja: null, vendedores: [PAINEL.vendedores[0]] }, error: null };
    cenario.respostas.bonus_do_mes = { data: { ...OUTUBRO, vendedores: [OUTUBRO.vendedores[1]] }, error: null };
    cenario.respostas.bonus_fechamento_do_mes = fechamento(null, [linhaDe(ANA, { total_aprovado: 10_000, ajuste_motivo: "Venda do dia 31", aprovado_em: APROVADO_EM })]);
    const p = await pagina({ mes: "2026-10" });
    expect(p.chamadas("bonus_fechamento_do_mes")).toEqual([{ p_mes: "2026-10-01", p_unidade: LOJA }]);
    let c = p.cartao("Meu bônus em outubro de 2026");
    expect(String(c.props.subtitulo)).toContain("Aprovado pelo dono");
    expect(c.visivel).toContain("Bônus aprovado R$ 100,00 Aprovado em 03/11/2026, 09:00");
    expect(c.visivel).toContain("O dono aprovou outro valor Venda do dia 31 (calculado: R$ 0,00).");
    cenario.respostas.bonus_fechamento_do_mes = fechamento(null, [linhaDe(ANA)]);
    c = (await pagina({ mes: "2026-10" })).cartao("Meu bônus em outubro de 2026");
    expect(c.visivel).toContain("Bônus do mês R$ 0,00 O fechamento está com o dono para aprovação");
    // A linha de outra pessoa na resposta é falha: o cartão segue com o provisório, sem valor aprovado.
    cenario.respostas.bonus_fechamento_do_mes = fechamento(null, [linhaDe(BETO)]);
    c = (await pagina({ mes: "2026-10" })).cartao("Meu bônus em outubro de 2026");
    expect(String(c.props.subtitulo)).toContain("Provisório até o fechamento do mês");
    expect(c.visivel).toContain("Não deu para ler o fechamento agora O valor acima é o calculado; o aprovado pelo dono pode ser outro.");
    expect(errosRegistrados()).toContainEqual(["bonus: resposta inesperada de bonus_fechamento_do_mes"]);
  });
});
