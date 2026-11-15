// /previsao (lote L8c) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados fictícios. O que o dono
// vê na rede e numa loja, o que vai ao banco, os estados (sem a migration, falha, resposta fora do lugar, quem
// não é o dono), a leitura estrita e as contas da estimativa, da simulação e do saldo previsto. As regras do
// banco (quem vê, cada fato) estão em packages/banco/src/previsao-de-caixa.test.ts.
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA_A = "00000000-0000-4000-8000-0000000000aa";
const LOJA_B = "00000000-0000-4000-8000-0000000000bb";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  rede: null as unknown,
  loja: null as unknown,
  erro: null as null | { code: string },
  recusarLoja: false,
  chamadas: [] as Record<string, unknown>[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
const supabase = {
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome !== "previsao_de_caixa") return { data: null, error: { code: "PGRST202" } };
    cenario.chamadas.push(argumentos);
    if (cenario.erro) return { data: null, error: cenario.erro };
    if (argumentos.p_unidade) return cenario.recusarLoja ? { data: null, error: { code: "42501" } } : { data: cenario.loja, error: null };
    return { data: cenario.rede, error: null };
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

import { lerPrevisao } from "../../lib/previsao/consulta";
import { estimativa, horizonteDoEndereco, lerSaldo, projetar, somarDias, type SemanaBase } from "../../lib/previsao/regras";
import { enderecoDaPrevisao } from "./ConteudoPrevisao";
import Previsao from "./page";
import { gerarCsvEmSecoes, textoDaCelula, type SecaoCsv } from "../../lib/csv";
import { planilhaDaPrevisao } from "../../lib/previsao/planilha";
import { BotaoImprimir } from "../../componentes/BotaoImprimir";
import { Simulador } from "./Simulador";

// ---------------------------------------------------------------------------------------------
// Leitura da árvore (como em contas.test.ts). O simulador roda no navegador: o teste confere as
// propriedades que ele recebe e o desenha à parte, com renderToStaticMarkup.
// ---------------------------------------------------------------------------------------------
const LOCAIS = new Set(["ConteudoPrevisao", "Painel", "Fatos", "Base", "Premissas", "EstadoDoPainel"]);
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
const pagina = async (parametros: Record<string, string> = {}) => (await Previsao({ searchParams: Promise.resolve(parametros) })) as ReactElement;
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/\s+/g, " ");

// ---------------------------------------------------------------------------------------------
// Fatos fictícios de 13/11/2026: contas nas próximas semanas, uma vencida, 8 semanas de recebimentos.
// ---------------------------------------------------------------------------------------------
const HOJE = "2026-11-13";
const semanasFuturas = (contas: number[]) => contas.map((c, i) => ({ inicio: somarDias(HOJE, 7 * i), fim: somarDias(HOJE, 7 * i + 6), contas: c, quantidade: c === 0 ? 0 : 1 }));
const semanasBase = (recebidos: number[]) => recebidos.map((r, k) => ({ inicio: somarDias(HOJE, -56 + 7 * k), fim: somarDias(HOJE, -50 + 7 * k), recebido: r, devolvido: 0, saidas_caixa: 0 }));
const REDE = {
  hoje: HOJE, unidade: null,
  semanas: semanasFuturas([800_000, 300_000, 1_500_000, 0, 400_000, 0, 200_000, 0]),
  vencidas: { valor: 120_000, quantidade: 2 },
  base: semanasBase([0, 0, 900_000, 1_000_000, 1_100_000, 1_000_000, 950_000, 1_050_000]).map((b, k) => (k === 7 ? { ...b, devolvido: 30_000, saidas_caixa: 20_000 } : b)),
  financeiras: { valor: 2_598_000, quantidade: 2 },
  a_conciliar: { valor: 754_000, quantidade: 12 },
  gavetas: { valor: 183_400, caixas: 3 },
  lojas: [{ id: LOJA_A, nome: "Loja A (teste)" }, { id: LOJA_B, nome: "Loja B (teste)" }],
};
const LOJA = { ...REDE, unidade: LOJA_A, semanas: semanasFuturas([500_000, 0, 0, 0, 0, 0, 0, 0]), vencidas: { valor: 0, quantidade: 0 } };
const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, { rede: copia(REDE), loja: copia(LOJA), erro: null, recusarLoja: false, chamadas: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("/previsao: o dono vê a rede e cada loja (L8c)", () => {
  it("a rede: horizonte e lojas, o simulador com os fatos e a estimativa, os fatos de hoje, a base e as premissas", async () => {
    const tela = await pagina();
    const t = visivel(tela);
    expect(cenario.chamadas).toEqual([{ p_semanas: 8, p_unidade: null }]);
    expect(t).toContain("Rede inteira Previsão de caixa");
    expect(doTipo(tela, "FiltroSegmentado").map((f) => (f.opcoes as { rotulo: string; href: string }[]).map((o) => `${o.rotulo} ${o.href}`))).toEqual([
      ["4 semanas /previsao?semanas=4", "8 semanas /previsao", "13 semanas /previsao?semanas=13"],
      ["Rede inteira /previsao", `Loja A (teste) /previsao?loja=${LOJA_A}`, `Loja B (teste) /previsao?loja=${LOJA_B}`],
    ]);
    const [simulador] = doTipo(tela, "Simulador");
    expect(simulador?.vencidas).toEqual({ valor: 120_000, quantidade: 2 });
    expect(simulador).toMatchObject({ onde: "Rede inteira", hoje: HOJE, fatos: { financeiras: { valor: 2_598_000, quantidade: 2 }, aConciliar: { valor: 754_000, quantidade: 12 }, gavetas: { valor: 183_400, caixas: 3 } } });
    expect(doTipo(tela, "BotaoImprimir")).toHaveLength(1);
    expect((simulador?.semanas as { contas: number }[]).map((s) => s.contas)).toEqual([800_000, 300_000, 1_500_000, 0, 400_000, 0, 200_000, 0]);
    // A média começa na primeira semana com movimento: 6 semanas, (6.000.000 − 50.000) ÷ 6.
    expect(simulador?.estimativa).toEqual({ media: 991_667, semanas: 6, de: "2026-10-02", ate: "2026-11-12" });
    expect(t).toContain("Contas a pagar no período 5 contas em aberto, pelo vencimento (lojas e rede) R$ 32.000,00");
    expect(t).toContain("Contas já vencidas 2 contas ainda em aberto: entram na primeira semana R$ 1.200,00");
    expect(t).toContain("A receber das financeiras 2 vendas, sem data: falta o prazo da PayJoy e da Aiva R$ 25.980,00");
    expect(t).toContain("Cartão e Pix a conciliar 12 pagamentos dos últimos 60 dias: parte pode já estar no banco R$ 7.540,00");
    expect(t).toContain("Dinheiro nas gavetas agora 3 caixas abertos R$ 1.834,00");
    // Banco sem a correção #82: sem a linha dos estornos a confirmar (não vira zero).
    expect(t).not.toContain("Estornos de Pix e cartão a confirmar");
    expect(t).toContain("Os três últimos não entram na previsão");
    expect((doTipo(tela, "ColunasComSinal")[0]?.dados as { valor: number }[]).map((d) => d.valor)).toEqual([0, 0, 900_000, 1_000_000, 1_100_000, 1_000_000, 950_000, 1_000_000]);
    expect(t).toContain("a média de 6 semanas (de 02/10 a 12/11)");
    expect(t).toContain("das lojas e da rede");
  });

  it("#82: os estornos de Pix e cartão a confirmar aparecem à parte, fora da conta, e vão para a planilha", async () => {
    (cenario.rede as Record<string, unknown>).estornos_a_confirmar = { valor: 12_900, quantidade: 2 };
    const tela = await pagina();
    const t = visivel(tela);
    expect(t).toContain("Estornos de Pix e cartão a confirmar 2 pedidos de estorno ainda sem comprovante: devem sair do banco, mas ainda não saíram R$ 129,00");
    expect(t).toContain("Os quatro últimos não entram na previsão");
    expect(t).toContain("o estorno de Pix e de cartão só quando confirmado com o comprovante, no dia da confirmação");
    expect(doTipo(tela, "Simulador")[0]).toMatchObject({ fatos: { estornosAConfirmar: { valor: 12_900, quantidade: 2 } } });
    (cenario.rede as Record<string, unknown>).estornos_a_confirmar = { valor: 0, quantidade: 0 };
    expect(visivel(await pagina())).toContain("Estornos de Pix e cartão a confirmar Nenhum pedido de estorno aberto R$ 0,00");
    for (const quebrado of [{ valor: -1, quantidade: 1 }, { valor: 100, quantidade: 0 }, null]) {
      const r = { ...copia(REDE), estornos_a_confirmar: quebrado };
      expect(() => lerPrevisao(r, { semanas: 8, unidade: null }), JSON.stringify(quebrado)).toThrow();
    }
  });

  it("uma loja e outro horizonte: a pergunta leva os dois; loja recusada cai na rede; quem não é o dono vê o aviso", async () => {
    cenario.loja = { ...copia(LOJA), semanas: semanasFuturas(Array<number>(13).fill(0)) };
    const t = visivel(await pagina({ loja: LOJA_A, semanas: "13" }));
    expect(cenario.chamadas).toEqual([{ p_semanas: 13, p_unidade: LOJA_A }]);
    expect(t).toContain("Loja A (teste) Previsão de caixa");
    expect(t).toContain("só as da loja (as da rede aparecem na rede inteira)");
    Object.assign(cenario, { chamadas: [], recusarLoja: true });
    const fora = visivel(await pagina({ loja: "00000000-0000-4000-8000-0000000000ff" }));
    expect(cenario.chamadas.map((c) => c.p_unidade)).toEqual(["00000000-0000-4000-8000-0000000000ff", null]);
    expect(fora).toContain("Rede inteira Previsão de caixa");
    Object.assign(cenario, { chamadas: [], erro: { code: "42501" } });
    const tela = await pagina({ semanas: "99" });
    expect(cenario.chamadas[0]?.p_semanas).toBe(8);
    expect(visivel(tela)).toContain("A previsão de caixa é só do dono");
    expect(doTipo(tela, "Simulador")).toEqual([]);
  });

  it("banco sem a migration, falha e resposta fora do lugar: nenhum número, e o registro leva só o código", async () => {
    cenario.erro = { code: "PGRST202" };
    const tela = await pagina();
    expect(visivel(tela)).toContain("a leitura da previsão de caixa (migration previsao_de_caixa)");
    expect(doTipo(tela, "Simulador")).toEqual([]);
    expect(vi.mocked(console.error)).not.toHaveBeenCalled();
    cenario.erro = { code: "57014" };
    expect(visivel(await pagina())).toContain("Não foi possível ler agora");
    expect(vi.mocked(console.error)).toHaveBeenCalledWith("previsão de caixa: falha ao consultar previsao_de_caixa", { codigo: "57014" });
    cenario.erro = null;
    (cenario.rede as typeof REDE).semanas[1]!.inicio = "2026-11-21";
    expect(visivel(await pagina())).toContain("Não foi possível ler agora");
  });
});

describe("leitura estrita da previsão (L8c)", () => {
  it("aceita a resposta certa e recusa janela fora do lugar, valor negativo e contagem sem valor", () => {
    const pedido = { semanas: 8, unidade: null };
    expect(lerPrevisao(copia(REDE), pedido).base).toHaveLength(8);
    const quebras: [string, (r: typeof REDE) => void][] = [
      ["semanas a mais", (r) => { r.semanas.push({ ...r.semanas[0]!, inicio: somarDias(HOJE, 56), fim: somarDias(HOJE, 62) }); }],
      ["semana fora do lugar", (r) => { r.semanas[2]!.fim = somarDias(r.semanas[2]!.inicio, 7); }],
      ["conta negativa", (r) => { r.semanas[0]!.contas = -1; }],
      ["contagem sem valor", (r) => { r.semanas[3]!.quantidade = 1; }],
      ["base curta", (r) => { r.base.pop(); }],
      ["base fora do lugar", (r) => { r.base[0]!.inicio = somarDias(HOJE, -57); }],
      ["recebido negativo", (r) => { r.base[4]!.recebido = -5; }],
      ["vencidas sem contagem", (r) => { r.vencidas.quantidade = 0; }],
      ["financeiras negativas", (r) => { r.financeiras.valor = -1; }],
      ["gaveta sem caixa", (r) => { r.gavetas.caixas = 0; }],
      ["outra loja", (r) => { (r as { unidade: string | null }).unidade = LOJA_B; }],
      ["valor fracionado", (r) => { r.a_conciliar.valor = 754_000.5; }],
    ];
    for (const [nome, quebrar] of quebras) {
      const r = copia(REDE);
      quebrar(r);
      expect(() => lerPrevisao(r, pedido), nome).toThrow();
    }
  });
});

describe("estimativa, simulação e saldo previsto (L8c)", () => {
  const base = (valores: [number, number, number][]): SemanaBase[] => valores.map(([recebido, devolvido, saidasCaixa], k) => ({
    inicio: somarDias(HOJE, -56 + 7 * k), fim: somarDias(HOJE, -50 + 7 * k), recebido, devolvido, saidasCaixa,
  }));
  it("a média começa na primeira semana com movimento; sem movimento, não há estimativa", () => {
    expect(estimativa(base(Array(8).fill([0, 0, 0])))).toBeNull();
    expect(estimativa(base([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [100_000, 10_000, 0], [100_001, 0, 0]])))
      .toEqual({ media: 95_001, semanas: 2, de: somarDias(HOJE, -14), ate: somarDias(HOJE, -1) });
    // Uma semana só com devolução também conta (é movimento).
    expect(estimativa(base([[0, 0, 0], [0, 5_000, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [70_000, 0, 0]]))?.semanas).toBe(7);
  });

  it("a projeção: a entrada com a simulação igual toda semana; as vencidas na primeira; o saldo acumulado", () => {
    const semanas = [
      { inicio: HOJE, fim: somarDias(HOJE, 6), contas: 50_000, quantidade: 1 },
      { inicio: somarDias(HOJE, 7), fim: somarDias(HOJE, 13), contas: 0, quantidade: 0 },
      { inicio: somarDias(HOJE, 14), fim: somarDias(HOJE, 20), contas: 300_000, quantidade: 2 },
    ];
    expect(projetar(semanas, 20_000, 100_000, 0.1, 10_000).map((l) => [l.entra, l.sai, l.vencidas, l.diferenca, l.saldo])).toEqual([
      [110_000, 70_000, 20_000, 40_000, 50_000], [110_000, 0, 0, 110_000, 160_000], [110_000, 300_000, 0, -190_000, -30_000],
    ]);
    expect(projetar(semanas, 0, 100_000, -0.3, null).map((l) => [l.entra, l.saldo])).toEqual([[70_000, null], [70_000, null], [70_000, null]]);
    expect(projetar(semanas, 0, null, 0.3, 0).map((l) => l.entra)).toEqual([0, 0, 0]);
  });

  it("o saldo digitado, o horizonte do endereço e o endereço da tela", () => {
    expect(lerSaldo("")).toBeNull();
    expect(lerSaldo(" 25.000,00 ")).toBe(2_500_000);
    expect(lerSaldo("R$ 1.234,5")).toBe(123_450);
    expect(lerSaldo("-1.500,00")).toBe(-150_000);
    expect(lerSaldo("−300")).toBe(-30_000);
    expect(lerSaldo("-0")).toBe(0);
    expect(Object.is(lerSaldo("-0"), -0)).toBe(false);
    for (const invalido of ["abc", "12,345", "1.2.3", "--5"]) expect(lerSaldo(invalido), invalido).toBeUndefined();
    expect([horizonteDoEndereco("4"), horizonteDoEndereco("13"), horizonteDoEndereco("7"), horizonteDoEndereco(undefined)]).toEqual([4, 13, 8, 8]);
    expect(enderecoDaPrevisao(8, { tipo: "rede" })).toBe("/previsao");
    expect(enderecoDaPrevisao(4, { tipo: "loja", id: LOJA_B })).toBe(`/previsao?semanas=4&loja=${LOJA_B}`);
  });

  it("o simulador começa sem saldo: indicadores, a semana apertada e a tabela, sem o gráfico do saldo", () => {
    const html = renderToStaticMarkup(createElement(Simulador, {
      semanas: [{ inicio: HOJE, fim: somarDias(HOJE, 6), contas: 50_000, quantidade: 1 }, { inicio: somarDias(HOJE, 7), fim: somarDias(HOJE, 13), contas: 300_000, quantidade: 1 }],
      vencidas: { valor: 20_000, quantidade: 1 },
      estimativa: { media: 100_000, semanas: 8, de: somarDias(HOJE, -56), ate: somarDias(HOJE, -1) },
      onde: "Rede inteira", hoje: HOJE,
      fatos: { estornosAConfirmar: null, financeiras: { valor: 0, quantidade: 0 }, aConciliar: { valor: 0, quantidade: 0 }, gavetas: { valor: 0, caixas: 0 } },
    }));
    const t = texto(html);
    expect(t).toContain("Saldo no banco hoje (opcional)");
    expect(t).toContain("Contas no período R$ 3.700,00 3 contas · R$ 200,00 já vencidas");
    expect(t).toContain("Entrada estimada por semana R$ 1.000,00 Média de 8 semanas");
    expect(t).toContain("Diferença no período −R$ 1.700,00");
    expect(t).toContain("Saldo previsto ao fim — Digite o saldo de hoje");
    expect(t).toContain("Na semana de 20/11 a 26/11, as contas passam a entrada estimada em R$ 2.000,00.");
    expect(html).toContain('aria-pressed="true"');
    expect(t).not.toContain("Saldo previsto R$");
    expect(t).toContain("Baixar planilha");
  });

  it("a planilha da previsão (L8d): semana a semana com a simulação e o saldo da tela, os fatos fora da conta e as premissas", () => {
    const semanas = [
      { inicio: HOJE, fim: somarDias(HOJE, 6), contas: 50_000, quantidade: 1 },
      { inicio: somarDias(HOJE, 7), fim: somarDias(HOJE, 13), contas: 300_000, quantidade: 1 },
    ];
    const linhas = projetar(semanas, 20_000, 100_000, -0.2, 150_000);
    const fatos = { estornosAConfirmar: { valor: 12_900, quantidade: 2 }, financeiras: { valor: 2_598_000, quantidade: 2 }, aConciliar: { valor: 754_000, quantidade: 12 }, gavetas: { valor: 183_400, caixas: 3 } };
    const estimativaDaTela = { media: 100_000, semanas: 8, de: somarDias(HOJE, -56), ate: somarDias(HOJE, -1) };
    const p = planilhaDaPrevisao({ onde: "Rede inteira", linhas, estimativa: estimativaDaTela, ajuste: -0.2, comSaldo: true, fatos, gerado: "13/11/2026 12:00" });
    // FIN-009c: três partes (as semanas, os fatos e as premissas), com o tipo de cada célula; o texto é o do CSV.
    const [semanasDaPlanilha] = p;
    const todas = (s: readonly SecaoCsv[]) => s.flatMap((x) => [...(x.colunas ? [x.colunas] : []), ...x.linhas]).map((l) => l.map(textoDaCelula));
    expect(p.map((s) => s.colunas?.[0])).toEqual(["Semana", "Fatos fora da conta", "Premissas"]);
    expect(semanasDaPlanilha?.colunas).toEqual(["Semana", "De", "Até", "Entrada estimada", "Contas (fato)", "Vencidas incluídas", "Diferença", "Saldo previsto"]);
    expect(semanasDaPlanilha?.linhas[0]?.slice(0, 4)).toEqual([1, { dia: HOJE }, { dia: somarDias(HOJE, 6) }, { centavos: 80_000 }]);
    expect(semanasDaPlanilha?.linhas.slice(0, 2).map((l) => l.map(textoDaCelula))).toEqual([
      [1, "13/11/2026", "19/11/2026", "800,00", "700,00", "200,00", "100,00", "1600,00"],
      [2, "20/11/2026", "26/11/2026", "800,00", "3000,00", "0,00", "-2200,00", "-600,00"],
    ]);
    expect(todas(p)).toContainEqual(["A receber das financeiras (sem data)", "25980,00", "2 vendas"]);
    // Correção #82: os estornos a confirmar ficam fora da conta, e a premissa diz quando a devolução sai.
    expect(todas(p)).toContainEqual(["Estornos de Pix e cartão a confirmar (ainda não saíram)", "129,00", "2 pedidos"]);
    expect(todas(p)).toContainEqual(["Devoluções pagas", "o dinheiro devolvido no dia em que saiu do caixa; Pix e cartão só quando o estorno é confirmado, no dia da confirmação"]);
    expect(todas(planilhaDaPrevisao({ onde: "x", linhas, estimativa: null, ajuste: 0, comSaldo: false, fatos: { ...fatos, estornosAConfirmar: null }, gerado: "x" }))
      .some((l) => String(l[0]).startsWith("Estornos"))).toBe(false);
    expect(todas(p)).toContainEqual(["Simulação", "menos 20% sobre a média"]);
    expect(todas(p)).toContainEqual(["Saldo de partida", "digitado na tela (não fica gravado no sistema)"]);
    expect(todas(p).at(-1)).toEqual(["Previsão de caixa", "Rede inteira", "gerada em 13/11/2026 12:00"]);
    // no CSV, a linha em branco separa as partes, como antes
    expect(gerarCsvEmSecoes(p)).toContain(";-600,00\r\n\r\nFatos fora da conta;Valor;Detalhe\r\n");
    const semSaldo = planilhaDaPrevisao({ onde: "Loja A (teste)", linhas: projetar(semanas, 0, null, 0, null), estimativa: null, ajuste: 0, comSaldo: false, fatos, gerado: "x" });
    expect(semSaldo[0]?.linhas[0]?.[7]).toBeNull();
    expect(todas(semSaldo)).toContainEqual(["Entrada estimada", "sem estimativa: sem recebimento nas 8 semanas anteriores"]);
  });

  it("o botão de imprimir não sai no papel", () => {
    const html = renderToStaticMarkup(createElement(BotaoImprimir));
    expect(texto(html)).toContain("Imprimir ou salvar em PDF");
    expect(html).toContain("nao-imprimir");
  });
});
