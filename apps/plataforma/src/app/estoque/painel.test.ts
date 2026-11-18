// Aba "Painel" do /estoque (lote G3) com sessão e Supabase simulados: QUAIS perguntas vão ao banco
// (um local ou todos, e o recorte escolhido) e o que a tela mostra em cada estado. A soma no banco
// está provada em packages/banco/src/estoque-painel.test.ts e as regras puras em
// src/lib/estoque/painel.test.ts. Dados fictícios.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const DEFEITOS = "00000000-0000-4000-8000-0000000000d0";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  /** Resposta de estoque_painel por recorte ("rede" quando sem p_unidade). */
  respostas: {} as Record<string, unknown>,
  erro: null as null | { code: string },
  chamadas: [] as Record<string, unknown>[],
  /** G3b: a resposta de estoque_valor_em_custo (o padrão é a função ausente). */
  valor: null as unknown,
  erroDoValor: { code: "PGRST202" } as null | { code: string },
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
const supabase = {
  from: () => { throw new Error("o painel não lê tabela direto"); },
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
    if (nome === "estoque_painel") {
      cenario.chamadas.push(argumentos);
      if (cenario.erro) return { data: null, error: cenario.erro };
      return { data: cenario.respostas[String(argumentos.p_unidade ?? "rede")] ?? null, error: null };
    }
    if (nome === "estoque_valor_em_custo") return cenario.erroDoValor ? { data: null, error: cenario.erroDoValor } : { data: cenario.valor, error: null };
    return { data: null, error: { code: "PGRST202" } };
  },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    // VEL-b: as permissões vêm no molde da sessão, pela mesma regra do rpc simulado.
    molde: { permissoes: { has: (p: string) => Boolean(cenario.permissoes.has(p)) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-10T23:00:00Z" },
    supabase,
  }),
}));

import Estoque from "./page";

// Só os componentes de apresentação do painel são executados; os compartilhados ficam como elementos.
const APRESENTACAO = new Set(["PainelDoEstoque", "EstadoDoPainel", "Indicadores", "CartaoDoValorDoEstoque", "CartaoDasPlanilhas"]);
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
async function pagina(parametros: Record<string, string> = {}) {
  const lida = ler((await Estoque({ searchParams: Promise.resolve({ aba: "painel", ...parametros }) })) as ReactElement);
  const cartoes = lida.doTipo("Cartao");
  return {
    ...lida,
    cartoes: cartoes.map((c) => String(c.titulo)),
    cartao: (titulo: string) => {
      const c = cartoes.find((x) => x.titulo === titulo);
      if (!c) throw new Error(`a tela não tem "${titulo}"`);
      return ler(c);
    },
    indicador: (rotulo: string) => lida.doTipo("Indicador").find((i) => i.rotulo === rotulo),
    filtro: lida.doTipo("FiltroSegmentado").find((f) => f.rotulo === "Local"),
    titulo: lida.doTipo("TituloPagina")[0],
  };
}

const ZERO = { fisico: 0, reservado: 0, disponivel: 0, abaixo_do_minimo: 0, parado: 0, chegando: 0 };
const SEM = { a_separar: 0, a_enviar: 0, a_receber: 0, inventarios_abertos: 0, retornos_a_conferir: 0, sem_conferencia_hoje: 0 };
const LOCAL_A = { unidade_id: LOJA, nome: "Santa Cândida (teste)", tipo: "loja_fisica", vende: true, fisico: 13, reservado: 2, disponivel: 11, abaixo_do_minimo: 1, parado: 1, chegando: 0, ...SEM, a_separar: 1, sem_conferencia_hoje: 3 };
const LOCAL_B = { unidade_id: OUTRA, nome: "Loja 02 (teste)", tipo: "loja_fisica", vende: true, fisico: 4, reservado: 0, disponivel: 4, abaixo_do_minimo: 2, parado: 3, chegando: 2, ...SEM, a_receber: 1 };
const LOCAL_D = { unidade_id: DEFEITOS, nome: "DEFEITOS (teste)", tipo: "excecao", vende: false, ...ZERO, fisico: 5, ...SEM };
const CAPA = { produto_id: "p-capa", produto: "Capa de proteção", tipo: "acessorio", categoria_id: "c-ace", categoria: "Acessórios", fisico: 10, reservado: 2, disponivel: 8, minimo: 5, abaixo_do_minimo: 0, parado: 0, chegando: 0 };
const A15 = { produto_id: "p-a15", produto: "Galaxy A15", tipo: "aparelho", categoria_id: "c-cel", categoria: "Celulares", fisico: 3, reservado: 0, disponivel: 3, minimo: 4, abaixo_do_minimo: 1, parado: 1, chegando: 0 };
const DA_LOJA = {
  totais: { fisico: 13, reservado: 2, disponivel: 11, abaixo_do_minimo: 1, parado: 1, chegando: 0, fora_da_venda: 0 },
  locais: [LOCAL_A],
  modelos: [CAPA, A15],
  categorias: [
    { categoria_id: "c-ace", categoria: "Acessórios", fisico: 10, reservado: 2, disponivel: 8, abaixo_do_minimo: 0, parado: 0, chegando: 0 },
    { categoria_id: "c-cel", categoria: "Celulares", fisico: 3, reservado: 0, disponivel: 3, abaixo_do_minimo: 1, parado: 1, chegando: 0 },
  ],
};
const DA_REDE = {
  totais: { fisico: 17, reservado: 2, disponivel: 15, abaixo_do_minimo: 3, parado: 4, chegando: 2, fora_da_venda: 5 },
  locais: [LOCAL_A, LOCAL_B, LOCAL_D],
  modelos: [{ ...CAPA, fisico: 13, disponivel: 11, minimo: 10, abaixo_do_minimo: 1, parado: 3, chegando: 2 }, { ...A15, fisico: 4, disponivel: 4, minimo: 8, abaixo_do_minimo: 2 }],
  categorias: [
    { categoria_id: "c-ace", categoria: "Acessórios", fisico: 13, reservado: 2, disponivel: 11, abaixo_do_minimo: 1, parado: 3, chegando: 2 },
    { categoria_id: "c-cel", categoria: "Celulares", fisico: 4, reservado: 0, disponivel: 4, abaixo_do_minimo: 2, parado: 1, chegando: 0 },
  ],
};
const errosRegistrados = () => vi.mocked(console.error).mock.calls;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, { permissoes: new Set(["estoque.consultar"]), respostas: { rede: DA_LOJA }, erro: null, chamadas: [], valor: null, erroDoValor: { code: "PGRST202" } });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("/estoque, aba Painel (G3)", () => {
  it("quem consulta um local só: uma pergunta ao banco, sem filtro de local, e os números da loja", async () => {
    const p = await pagina();
    expect(cenario.chamadas).toEqual([{}]);
    expect(p.filtro).toBeUndefined();
    expect(p.titulo).toMatchObject({ sobretitulo: "Santa Cândida (teste)", titulo: "Estoque" });
    expect(p.cartoes).toEqual(["Disponível por modelo", "Por categoria", "Pendências", "Planilhas do estoque"]);
    // FIN-009b: as planilhas do recorte; com um local só, sem escolher local (a rota usa a loja do turno)
    expect(p.doTipo("LinksDaPlanilha")).toEqual([{ parte: "saldo", loja: null, rotulo: "Saldo" }, { parte: "itens", loja: null, rotulo: "Aparelhos e chips" }]);
    expect(p.indicador("Disponível para vender")).toMatchObject({ valor: "11", detalhe: "Físico 13 · reservado 2" });
    expect(p.indicador("Abaixo do mínimo")).toMatchObject({ valor: "1", tom: "atencao" });
    expect(p.indicador("Parado há mais de 60 dias")).toMatchObject({ valor: "1", tom: "atencao" });
    expect(p.indicador("Pendências")).toMatchObject({ valor: "4", detalhe: "1 transferência a separar · 3 itens sem conferência hoje" });
    const modelos = p.cartao("Disponível por modelo");
    expect(modelos.doTipo("BarrasHorizontais")[0]).toMatchObject({
      nomeSerie: "Disponível", nomeMeta: "Mínimo",
      dados: [{ rotulo: "Capa de proteção", valor: 8, meta: 5, detalhe: "2 reservado" }, { rotulo: "Galaxy A15", valor: 3, meta: 4, detalhe: "1 abaixo do mínimo" }],
    });
    // Cada modelo da tabela abre a busca do saldo daquele modelo.
    expect(modelos.elementos.map((e) => e.props.href)).toContain("/estoque?q=Galaxy%20A15");
    expect(p.cartao("Por categoria").doTipo("BarraSegmentada")[0]).toMatchObject({ partes: [{ nome: "Acessórios", valor: 8, serie: 1 }, { nome: "Celulares", valor: 3, serie: 2 }] });
    expect(p.cartao("Pendências").elementos.map((e) => e.props.href)).toEqual(expect.arrayContaining(["/transferencias", "/estoque?aba=conferencia"]));
  });

  it("quem consulta vários locais: o padrão é a loja do turno, somada de novo no banco, com o filtro dos locais", async () => {
    cenario.respostas = { rede: DA_REDE, [LOJA]: DA_LOJA };
    const p = await pagina();
    expect(cenario.chamadas).toEqual([{}, { p_unidade: LOJA }]);
    expect(p.filtro).toMatchObject({ opcoes: [
      { href: "/estoque?aba=painel&loja=rede", rotulo: "Rede inteira", ativo: false },
      { href: "/estoque?aba=painel", rotulo: "Santa Cândida (teste)", ativo: true },
      { href: `/estoque?aba=painel&loja=${OUTRA}`, rotulo: "Loja 02 (teste)", ativo: false },
      { href: `/estoque?aba=painel&loja=${DEFEITOS}`, rotulo: "DEFEITOS (teste)", ativo: false },
    ] });
    expect(p.cartoes).not.toContain("Por local");
    expect(p.indicador("Disponível para vender")).toMatchObject({ valor: "11" });
    expect(p.doTipo("LinksDaPlanilha").map((l) => l.loja)).toEqual([LOJA, LOJA]);
  });

  it("rede inteira: uma pergunta só, o painel por local e o que está fora da venda", async () => {
    cenario.respostas = { rede: DA_REDE };
    const p = await pagina({ loja: "rede" });
    expect(cenario.chamadas).toEqual([{}]);
    expect(p.titulo).toMatchObject({ sobretitulo: "Rede inteira" });
    expect(p.cartoes).toEqual(["Disponível por modelo", "Por categoria", "Por local", "Pendências", "Planilhas do estoque"]);
    expect(p.doTipo("LinksDaPlanilha").map((l) => l.loja)).toEqual(["rede", "rede"]);
    expect(p.indicador("Fora da venda")).toMatchObject({ valor: "5" });
    expect(p.indicador("Abaixo do mínimo")).toMatchObject({ detalhe: "Variações abaixo do mínimo, contando cada loja" });
    const locais = p.cartao("Por local");
    expect(locais.doTipo("BarrasHorizontais")[0]).toMatchObject({ dados: [{ rotulo: "Santa Cândida (teste)", valor: 11 }, { rotulo: "Loja 02 (teste)", valor: 4, detalhe: "2 chegando" }] });
    expect(locais.texto).toContain("DEFEITOS (teste) (não vende)");
    expect(locais.elementos.map((e) => e.props.href)).toEqual(expect.arrayContaining(["/estoque?aba=painel", `/estoque?aba=painel&loja=${OUTRA}`]));
  });

  it("local que a pessoa não consulta, pedido no endereço, cai na loja do turno", async () => {
    cenario.respostas = { rede: DA_REDE, [LOJA]: DA_LOJA };
    await pagina({ loja: "00000000-0000-4000-8000-000000000999" });
    expect(cenario.chamadas).toEqual([{}, { p_unidade: LOJA }]);
  });

  it("banco sem a função, falha ou forma inesperada: nenhum número, com o motivo; o registro leva só o código", async () => {
    cenario.erro = { code: "PGRST202" };
    let p = await pagina();
    expect(p.doTipo("Aviso")).toMatchObject([{ tom: "aviso", titulo: "Indisponível neste ambiente" }]);
    expect(p.texto).toContain("migration estoque_painel");
    expect(p.doTipo("Indicador")).toEqual([]);
    expect(errosRegistrados()).toEqual([]);
    // sem o painel, a planilha ainda sai (da loja do turno)
    expect(p.cartoes).toContain("Planilhas do estoque");

    cenario.erro = { code: "57014" };
    p = await pagina({ loja: "rede" });
    expect(p.doTipo("Aviso")).toMatchObject([{ tom: "perigo", titulo: "Não foi possível ler agora" }]);
    expect(p.elementos.map((e) => e.props.href)).toContain("/estoque?aba=painel");
    expect(errosRegistrados()).toEqual([["estoque: falha ao consultar estoque_painel", { codigo: "57014" }]]);
    // com a falha, a rota não saberia o recorte: as planilhas somem
    expect(p.cartoes).not.toContain("Planilhas do estoque");

    cenario.erro = null;
    cenario.respostas = { rede: { ...DA_LOJA, totais: { ...DA_LOJA.totais, disponivel: 12 } } };
    p = await pagina();
    expect(p.doTipo("Aviso")).toMatchObject([{ tom: "perigo" }]);
    expect(errosRegistrados().at(-1)).toEqual(["estoque: resposta inesperada de estoque_painel"]);
  });

  it("sem estoque.consultar: a mensagem de sempre, e o painel nem é pedido", async () => {
    cenario.permissoes = new Set();
    const p = await pagina();
    expect(p.texto).toContain("Seu papel não consulta estoque nesta loja.");
    expect(cenario.chamadas).toEqual([]);
  });

  it("valor a custo (G3b): quem vê o custo vê o bloco e o que ficou fora; sem permissão ou sem a função, some; falha aparece sem número", async () => {
    cenario.erroDoValor = null;
    cenario.valor = {
      unidade: null,
      resumo: { valor: 353_400, itens_com_custo: 16, itens_sem_custo: 1, variacoes_sem_custo: 1, valor_chegando: 6_000, chegando_sem_custo: 2, valor_fora_da_venda: 3_600,
        itens_fora_da_venda_sem_custo: 0 },
      por_local: [
        { unidade: LOJA, nome: "Santa Cândida (teste)", vende: true, valor: 353_400, itens_com_custo: 16, itens_sem_custo: 1, valor_chegando: 6_000, chegando_sem_custo: 2 },
        { unidade: "00000000-0000-4000-8000-0000000000ee", nome: "DEFEITOS (teste)", vende: false, valor: 3_600, itens_com_custo: 2, itens_sem_custo: 0, valor_chegando: 0,
          chegando_sem_custo: 0 },
      ],
    };
    const indicadores = (q: Awaited<ReturnType<typeof pagina>>) => q.cartao("Valor do estoque a custo").doTipo("Indicador")
      .map((i) => [i.rotulo, String(i.valor).replace(/\s+/g, " "), i.detalhe, i.tom]);
    let p = await pagina();
    expect(p.cartoes).toContain("Valor do estoque a custo");
    // O sem custo é contado no estoque, no que está chegando e no que está fora da venda (nunca vira zero calado).
    expect(indicadores(p)).toEqual([
      ["No estoque", "R$ 3.534,00", "1 item de 1 variação sem custo ficou fora", "atencao"],
      ["Chegando", "R$ 60,00", "2 itens sem custo ficaram fora", "atencao"],
      ["Fora da venda", "R$ 36,00", "DEFEITOS (teste)", "neutro"],
    ]);
    // Só a loja (o gerente): sem o indicador do que está fora da venda, que ele não vê.
    cenario.valor = {
      unidade: LOJA,
      resumo: { valor: 353_400, itens_com_custo: 16, itens_sem_custo: 0, variacoes_sem_custo: 0, valor_chegando: 0, chegando_sem_custo: 0, valor_fora_da_venda: 0,
        itens_fora_da_venda_sem_custo: 0 },
      por_local: [{ unidade: LOJA, nome: "Santa Cândida (teste)", vende: true, valor: 353_400, itens_com_custo: 16, itens_sem_custo: 0, valor_chegando: 0, chegando_sem_custo: 0 }],
    };
    expect(indicadores(await pagina())).toEqual([
      ["No estoque", "R$ 3.534,00", "16 itens, todos com custo", "neutro"],
      ["Chegando", "R$ 0,00", "em transferências enviadas e ainda não recebidas", "neutro"],
    ]);
    cenario.erroDoValor = { code: "42501" };
    expect((await pagina()).cartoes).not.toContain("Valor do estoque a custo");
    cenario.erroDoValor = { code: "PGRST202" };
    expect((await pagina()).cartoes).not.toContain("Valor do estoque a custo");
    cenario.erroDoValor = { code: "57014" };
    p = await pagina();
    expect(p.cartoes).toContain("Valor do estoque a custo");
    expect(p.cartao("Valor do estoque a custo").texto).not.toContain("R$");
  });

  it("a aba Painel aparece entre as abas do estoque e marca a atual", async () => {
    const p = await pagina();
    const abas = p.doTipo("Link").length ? p.doTipo("Link") : p.elementos.filter((e) => typeof e.props.href === "string" && String(e.props.href).startsWith("/estoque")).map((e) => e.props);
    expect(abas.map((a) => [a.href, a["aria-current"]])).toEqual(expect.arrayContaining([["/estoque", undefined], ["/estoque?aba=painel", "page"]]));
  });
});
