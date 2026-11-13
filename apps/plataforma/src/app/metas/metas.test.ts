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
const APRESENTACAO = new Set(["MetasDaGestao", "MinhasMetas", "ResumoDaLoja", "PorVendedor", "EquipeNoMes", "DefinirMetas", "ComoConta", "MinhaMeta", "EstadoDoPainel", "BarrasDoRitmo"]);
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
