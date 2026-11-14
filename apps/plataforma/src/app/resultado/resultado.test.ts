// /resultado (lote L8b) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados fictícios. O que o dono
// vê na rede e numa loja, o que vai ao banco, o mês do endereço, os estados (sem a migration, falha, resposta
// que não fecha, quem não é o dono) e a leitura estrita da resposta. As regras do banco (quem vê, cada linha,
// a divisão das contas da rede) estão em packages/banco/src/resultado-do-mes.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA_A = "00000000-0000-4000-8000-0000000000aa";
const LOJA_B = "00000000-0000-4000-8000-0000000000bb";
const CAT_ALUGUEL = "00000000-0000-4000-9000-0000000000c1";
const CAT_LUZ = "00000000-0000-4000-9000-0000000000c2";
const CAT_IMPOSTO = "00000000-0000-4000-9000-0000000000c3";
const CAT_MARKETING = "00000000-0000-4000-9000-0000000000c4";
const CAT_MERCADORIA = "00000000-0000-4000-9000-0000000000c5";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  rede: null as unknown,
  lojaA: null as unknown,
  erro: null as null | { code: string },
  /** O banco recusa (42501) só o pedido de uma loja (fora da rede de quem pede). */
  recusarLoja: false,
  chamadas: [] as Record<string, unknown>[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
const supabase = {
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome !== "resultado_do_mes") return { data: null, error: { code: "PGRST202" } };
    cenario.chamadas.push(argumentos);
    if (cenario.erro) return { data: null, error: cenario.erro };
    // A série tem o tamanho pedido (a exportação pede só o mês: p_meses = 1).
    const corte = (dado: unknown) => (dado && typeof dado === "object" ? { ...dado, meses: (dado as { meses: unknown[] }).meses.slice(-Number(argumentos.p_meses ?? 6)) } : dado);
    if (argumentos.p_unidade) return cenario.recusarLoja ? { data: null, error: { code: "42501" } } : { data: corte(cenario.lojaA), error: null };
    return { data: corte(cenario.rede), error: null };
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

import { geometriaDaCascata } from "../../componentes/graficos";
import { lerResultadoDoMes } from "../../lib/resultado/consulta";
import { daReceita, filtroDoResultado, mesCurto, mesDoResultado } from "../../lib/resultado/regras";
import { enderecoDoResultado } from "./ConteudoResultado";
import { GET as exportar } from "./exportar/route";
import Resultado from "./page";

// ---------------------------------------------------------------------------------------------
// Leitura da árvore (como em contas.test.ts): os componentes desta tela são executados; os
// compartilhados ficam como elementos, para o teste conferir as propriedades.
// ---------------------------------------------------------------------------------------------
const LOCAIS = new Set(["ConteudoResultado", "PassoDoMes", "Painel", "Despesas", "PorLoja", "ComoLer", "EstadoDoPainel"]);
const local = (x: ReactElement<Linha>) => typeof x.type === "function" && LOCAIS.has(x.type.name);
const executar = (x: ReactElement<Linha>) => (x.type as (p: unknown) => unknown)(x.props);
const nomeDoTipo = (x: ReactElement<Linha>) => (typeof x.type === "function" ? x.type.name : typeof x.type === "object" && x.type ? String((x.type as { displayName?: string }).displayName ?? "objeto") : String(x.type));
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
const enderecos = (v: unknown) => elementos(v).map((e) => e.props.href).filter((h): h is string => typeof h === "string" && h.startsWith("/resultado"));
const pagina = async (parametros: Record<string, string> = {}) => (await Resultado({ searchParams: Promise.resolve(parametros) })) as ReactElement;

// ---------------------------------------------------------------------------------------------
// Um mês fictício que fecha (os números do teste do banco): a rede e a loja A em novembro de 2026.
// ---------------------------------------------------------------------------------------------
type Mes = { mes: string; receita_liquida: number; cmv: number; taxas: number; despesas: number; saidas_caixa: number; rede: number; resultado?: number };
const comResultado = (m: Mes) => ({ ...m, resultado: m.receita_liquida - m.cmv - m.taxas - m.despesas - m.saidas_caixa - m.rede });
const ANTERIORES: Mes[] = [
  { mes: "2026-06-01", receita_liquida: 1_800_000, cmv: 1_250_000, taxas: 18_000, despesas: 300_000, saidas_caixa: 4_000, rede: 100_000 },
  { mes: "2026-07-01", receita_liquida: 1_950_000, cmv: 1_350_000, taxas: 19_000, despesas: 300_000, saidas_caixa: 3_000, rede: 100_000 },
  { mes: "2026-08-01", receita_liquida: 2_100_000, cmv: 1_450_000, taxas: 21_000, despesas: 310_000, saidas_caixa: 5_000, rede: 100_000 },
  { mes: "2026-09-01", receita_liquida: 1_700_000, cmv: 1_200_000, taxas: 17_000, despesas: 400_000, saidas_caixa: 2_000, rede: 120_000 },
  { mes: "2026-10-01", receita_liquida: 2_000_000, cmv: 1_400_000, taxas: 20_000, despesas: 300_000, saidas_caixa: 5_000, rede: 100_000 },
];
const LINHAS_DA_REDE = {
  vendas: 6, bruto: 479_200, descontos: 100, vendido: 479_100, devolvido: 7_850, cancelado: 7_900, receita_liquida: 463_350,
  custo_vendido: 339_000, custo_devolvido: 1_800, custo_cancelado: 1_800, cmv: 335_400, margem_bruta: 127_950,
  vendido_com_custo: 479_100, vendido_sem_custo: 0, itens_sem_custo: 0,
  taxas: 500, pagamentos_conciliados: 1, a_conciliar: 2, a_conciliar_valor: 63_500,
  despesas: 330_500, despesas_em_aberto: 310_000, saidas_quantidade: 1, saidas_caixa: 2_500,
  rede: 100_000, rede_em_aberto: 100_000, nao_dividido: 0, peso: 463_350, peso_da_rede: 463_350, resultado: -305_550,
};
const LINHAS_DA_LOJA_A = {
  ...LINHAS_DA_REDE, vendas: 5, bruto: 339_300, vendido: 339_200, receita_liquida: 323_450, custo_vendido: 229_000, cmv: 225_400, margem_bruta: 98_050,
  vendido_com_custo: 339_200, despesas: 320_500, despesas_em_aberto: 300_000, rede: 69_807, rede_em_aberto: 0, peso: 323_450, resultado: -295_257,
};
const ultimoMes = (l: typeof LINHAS_DA_REDE): Mes => ({
  mes: "2026-11-01", receita_liquida: l.receita_liquida, cmv: l.cmv, taxas: l.taxas, despesas: l.despesas, saidas_caixa: l.saidas_caixa, rede: l.rede,
});
const LOJAS = [{ id: LOJA_A, nome: "Loja A (teste)" }, { id: LOJA_B, nome: "Loja B (teste)" }];
const REDE = {
  mes: "2026-11-01", hoje: "2026-11-13", em_andamento: true, unidade: null,
  linhas: LINHAS_DA_REDE,
  meses: [...ANTERIORES, ultimoMes(LINHAS_DA_REDE)].map(comResultado),
  por_categoria: [
    { categoria: CAT_ALUGUEL, nome: "Aluguel e condomínio", valor: 300_000, em_aberto: 300_000 },
    { categoria: CAT_IMPOSTO, nome: "Impostos e taxas", valor: 100_000, em_aberto: 100_000 },
    { categoria: CAT_LUZ, nome: "Água, luz e internet", valor: 20_500, em_aberto: 0 },
    { categoria: CAT_MARKETING, nome: "Marketing", valor: 10_000, em_aberto: 10_000 },
  ],
  fora_do_resultado: [{ categoria: CAT_MERCADORIA, nome: "Mercadoria (fornecedor)", valor: 100_000 }],
  por_loja: [
    { unidade: LOJA_B, nome: "Loja B (teste)", receita_liquida: 139_900, cmv: 110_000, margem_bruta: 29_900, taxas: 0, despesas: 10_000, saidas_caixa: 0, rede: 30_193, resultado: -10_293 },
    { unidade: LOJA_A, nome: "Loja A (teste)", receita_liquida: 323_450, cmv: 225_400, margem_bruta: 98_050, taxas: 500, despesas: 320_500, saidas_caixa: 2_500, rede: 69_807, resultado: -295_257 },
  ],
  lojas: LOJAS,
};
const LOJA = {
  ...REDE, unidade: LOJA_A, linhas: LINHAS_DA_LOJA_A,
  meses: [...ANTERIORES.map((m) => ({ ...m, receita_liquida: m.receita_liquida / 2, cmv: m.cmv / 2 })), ultimoMes(LINHAS_DA_LOJA_A)].map(comResultado),
  por_categoria: [
    { categoria: CAT_ALUGUEL, nome: "Aluguel e condomínio", valor: 300_000, em_aberto: 300_000 },
    { categoria: CAT_LUZ, nome: "Água, luz e internet", valor: 20_500, em_aberto: 0 },
  ],
  por_loja: [],
};
const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, { rede: copia(REDE), lojaA: copia(LOJA), erro: null, recusarLoja: false, chamadas: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("/resultado: o dono vê a rede e cada loja (L8b)", () => {
  it("a rede: indicadores, o demonstrativo em cascata, os seis meses, as contas por categoria e o resultado de cada loja", async () => {
    const tela = await pagina();
    const t = visivel(tela);
    expect(cenario.chamadas).toEqual([{ p_mes: "2026-11-01", p_unidade: null, p_meses: 6 }]);
    expect(t).toContain("Rede inteira Resultado do mês");
    expect(doTipo(tela, "FiltroSegmentado")[0]?.opcoes).toEqual([
      { href: "/resultado", rotulo: "Rede inteira", ativo: true },
      { href: `/resultado?loja=${LOJA_A}`, rotulo: "Loja A (teste)", ativo: false },
      { href: `/resultado?loja=${LOJA_B}`, rotulo: "Loja B (teste)", ativo: false },
    ]);
    // O mês: volta para outubro; não avança além do mês atual.
    expect(t).toContain("Novembro de 2026 até hoje");
    expect(enderecos(tela)).toContain("/resultado?mes=2026-10");
    expect(enderecos(tela)).not.toContain("/resultado?mes=2026-12");
    expect(t).toContain("Receita líquida R$ 4.633,50 6 vendas");
    expect(t).toContain("Margem bruta R$ 1.279,50 27,6% da receita");
    expect(t).toContain("Taxas e contas R$ 4.335,00 Taxas, contas, caixa e rede");
    expect(t).toContain("Resultado −R$ 3.055,50 Prejuízo · −65,9% da receita");
    expect(doTipo(tela, "Indicador").find((i) => i.rotulo === "Resultado")?.tom).toBe("ruim");
    const degraus = doTipo(tela, "Cascata")[0]?.degraus as { rotulo: string; valor: number; total?: boolean; detalhe?: string }[];
    expect(degraus.map((d) => [d.rotulo, d.valor, Boolean(d.total)])).toEqual([
      ["Vendas concluídas", 479_100, true], ["Devoluções e cancelamentos", -15_750, false], ["Receita líquida", 463_350, true],
      ["Custo das mercadorias", -335_400, false], ["Margem bruta", 127_950, true], ["Taxas de cartão e Pix", -500, false],
      ["Contas das lojas", -330_500, false], ["Dinheiro do caixa", -2_500, false], ["Contas da rede (central)", -100_000, false],
      ["Resultado do mês", -305_550, true],
    ]);
    expect(degraus[0]?.detalhe).toBe("6 vendas · R$ 1,00 de desconto já abatido");
    expect(degraus[6]?.detalhe).toBe("Pelo vencimento · R$ 3.100,00 ainda em aberto");
    expect(t).toContain("Taxas a conferir 2 pagamentos de cartão e Pix (R$ 635,00) ainda sem conciliação");
    expect(t).not.toContain("Custo faltando");
    const [meses] = doTipo(tela, "ColunasComSinal");
    expect((meses?.dados as { rotulo: string; valor: number }[]).map((m) => [m.rotulo, m.valor])).toEqual([
      ["jun/26", 128_000], ["jul/26", 178_000], ["ago/26", 214_000], ["set/26", -39_000], ["out/26", 175_000], ["nov/26", -305_550],
    ]);
    expect(doTipo(tela, "BarrasHorizontais")[0]?.dados).toEqual([
      { rotulo: "Aluguel e condomínio", valor: 300_000 }, { rotulo: "Impostos e taxas", valor: 100_000 },
      { rotulo: "Água, luz e internet", valor: 20_500 }, { rotulo: "Marketing", valor: 10_000 },
    ]);
    expect(t).toContain("Fora do resultado Mercadoria (fornecedor): R$ 1.000,00");
    expect((doTipo(tela, "BarrasComSinal")[0]?.dados as { rotulo: string; valor: number; detalhe: string }[])).toEqual([
      { rotulo: "Loja B (teste)", valor: -10_293, detalhe: "Receita R$ 1.399,00 · margem 21,4%" },
      { rotulo: "Loja A (teste)", valor: -295_257, detalhe: "Receita R$ 3.234,50 · margem 30,3%" },
    ]);
    expect(enderecos(tela)).toContain(`/resultado?loja=${LOJA_A}`);
    expect(t).toContain("Não é a contabilidade");
  });

  it("uma loja: a pergunta leva a loja; a parte da rede diz quanto da receita a loja fez; sem o quadro das lojas", async () => {
    const tela = await pagina({ loja: LOJA_A });
    const t = visivel(tela);
    expect(cenario.chamadas).toEqual([{ p_mes: "2026-11-01", p_unidade: LOJA_A, p_meses: 6 }]);
    expect(t).toContain("Loja A (teste) Resultado do mês");
    const degraus = doTipo(tela, "Cascata")[0]?.degraus as { rotulo: string; valor: number; detalhe?: string }[];
    expect(degraus.find((d) => d.rotulo === "Parte das contas da rede")).toMatchObject({ valor: -69_807, detalhe: "A loja fez 69,8% da receita da rede no mês" });
    expect(degraus.find((d) => d.rotulo === "Contas da loja")?.valor).toBe(-320_500);
    expect(doTipo(tela, "BarrasComSinal")).toEqual([]);
    expect(t).toContain("A parte da rede está no demonstrativo");
  });

  it("loja que o banco recusa cai na rede inteira; quem não é o dono vê o aviso, sem número", async () => {
    cenario.recusarLoja = true;
    const fora = visivel(await pagina({ loja: "00000000-0000-4000-8000-0000000000ff" }));
    expect(cenario.chamadas.map((c) => c.p_unidade)).toEqual(["00000000-0000-4000-8000-0000000000ff", null]);
    expect(fora).toContain("Rede inteira Resultado do mês");
    Object.assign(cenario, { chamadas: [], erro: { code: "42501" } });
    const tela = await pagina();
    expect(visivel(tela)).toContain("O resultado do mês é só do dono");
    expect(doTipo(tela, "Indicador")).toEqual([]);
  });

  it("o mês do endereço: de 24 meses atrás até o atual; fora disso, o mês atual", async () => {
    cenario.rede = { ...copia(REDE), mes: "2026-09-01", em_andamento: false, meses: copia(REDE).meses.map((m: Mes, i: number) => ({ ...m, mes: `2026-0${4 + i}-01`.replace("2026-010", "2026-10") })) };
    const setembro = await pagina({ mes: "2026-09" });
    expect(cenario.chamadas.at(-1)).toEqual({ p_mes: "2026-09-01", p_unidade: null, p_meses: 6 });
    expect(enderecos(setembro)).toEqual(expect.arrayContaining(["/resultado?mes=2026-08", "/resultado?mes=2026-10"]));
    for (const mes of ["2026-12", "2024-10", "2026-13", "lixo"]) {
      await pagina({ mes });
      expect(cenario.chamadas.at(-1)?.p_mes, mes).toBe("2026-11-01");
    }
    expect(mesDoResultado("2024-11", new Date("2026-11-13T15:00:00Z"))).toBe("2024-11-01");
  });
});

describe("/resultado: estados e avisos (L8b)", () => {
  it("banco sem a migration: indisponível, sem número; falha: não foi possível ler, com o código só no registro", async () => {
    cenario.erro = { code: "PGRST202" };
    const tela = await pagina();
    const t = visivel(tela);
    expect(t).toContain("Indisponível neste ambiente");
    expect(t).toContain("a leitura do resultado do mês (migration resultado_do_mes)");
    expect(doTipo(tela, "Indicador")).toEqual([]);
    expect(vi.mocked(console.error)).not.toHaveBeenCalled();
    cenario.erro = { code: "57014" };
    expect(visivel(await pagina())).toContain("Não foi possível ler agora");
    expect(vi.mocked(console.error)).toHaveBeenCalledWith("resultado do mês: falha ao consultar resultado_do_mes", { codigo: "57014" });
  });

  it("resposta que não fecha (um centavo a mais no resultado) é falha, não número", async () => {
    (cenario.rede as { linhas: { resultado: number } }).linhas.resultado += 1;
    const t = visivel(await pagina());
    expect(t).toContain("Não foi possível ler agora");
    expect(t).not.toContain("−R$ 3.055,50");
  });

  it("custo faltando e contas da rede sem divisão aparecem como aviso", async () => {
    const rede = cenario.rede as typeof REDE;
    Object.assign(rede.linhas, { vendido_com_custo: 471_200, vendido_sem_custo: 7_900, itens_sem_custo: 1 });
    const t = visivel(await pagina());
    expect(t).toContain("Custo faltando R$ 79,00 vendidos sem custo cadastrado (1 item)");
    const semVenda = { ...copia(REDE) };
    const zero = { vendas: 0, bruto: 0, descontos: 0, vendido: 0, devolvido: 0, cancelado: 0, receita_liquida: 0, custo_vendido: 0, custo_devolvido: 0, custo_cancelado: 0, cmv: 0, margem_bruta: 0, vendido_com_custo: 0, taxas: 0, pagamentos_conciliados: 0, a_conciliar: 0, a_conciliar_valor: 0, despesas: 0, despesas_em_aberto: 0, saidas_quantidade: 0, saidas_caixa: 0, rede_em_aberto: 0, peso: 0, peso_da_rede: 0 };
    Object.assign(semVenda.linhas, zero, { rede: 3_000, nao_dividido: 3_000, resultado: -3_000 });
    semVenda.meses = [...ANTERIORES, { mes: "2026-11-01", receita_liquida: 0, cmv: 0, taxas: 0, despesas: 0, saidas_caixa: 0, rede: 3_000 }].map(comResultado);
    semVenda.por_categoria = [{ categoria: CAT_IMPOSTO, nome: "Impostos e taxas", valor: 3_000, em_aberto: 0 }];
    semVenda.por_loja = [];
    cenario.rede = semVenda;
    const vazio = await pagina();
    expect(visivel(vazio)).toContain("Contas da rede sem divisão Sem vendas no mês, R$ 30,00 das contas da rede");
    expect(visivel(vazio)).toContain("Margem bruta R$ 0,00 Sem receita no mês");
  });
});

describe("leitura estrita do resultado (L8b)", () => {
  const pedido = { mes: "2026-11-01", unidade: null, meses: 6 };
  it("aceita a resposta que fecha e recusa cada parte que não bate com as outras", () => {
    expect(lerResultadoDoMes(copia(REDE), pedido).linhas.resultado).toBe(-305_550);
    expect(lerResultadoDoMes(copia(LOJA), { ...pedido, unidade: LOJA_A }).linhas.rede).toBe(69_807);
    const quebras: [string, (r: typeof REDE) => void][] = [
      ["receita", (r) => { r.linhas.receita_liquida += 1; }],
      ["custo", (r) => { r.linhas.cmv += 1; }],
      ["bruto", (r) => { r.linhas.bruto += 1; }],
      ["com e sem custo", (r) => { r.linhas.vendido_sem_custo = 1; }],
      ["taxa negativa", (r) => { r.linhas.taxas = -500; r.linhas.resultado += 1_000; }],
      ["não dividido maior que a rede", (r) => { r.linhas.nao_dividido = 100_001; }],
      ["lojas", (r) => { r.por_loja.pop(); }],
      ["categorias", (r) => { r.por_categoria.pop(); }],
      ["em aberto", (r) => { r.por_categoria[2]!.em_aberto = 1; }],
      ["série curta", (r) => { r.meses.shift(); }],
      ["último mês", (r) => { r.meses[5]!.taxas += 1; r.meses[5]!.resultado! -= 1; }],
      ["mês fora de ordem", (r) => { r.meses[0]!.mes = "2026-05-01"; }],
      ["outro mês", (r) => { r.mes = "2026-10-01"; }],
      ["em andamento", (r) => { r.em_andamento = false; }],
      ["loja inválida", (r) => { r.por_loja[0]!.unidade = "x"; }],
      ["valor fracionado", (r) => { (r.linhas as Record<string, number>).despesas = 330_500.5; }],
    ];
    for (const [nome, quebrar] of quebras) {
      const r = copia(REDE);
      quebrar(r);
      expect(() => lerResultadoDoMes(r, pedido), nome).toThrow();
    }
    // A loja: sem quadro das lojas e sem "não dividido".
    const loja = copia(LOJA);
    (loja as { por_loja: unknown[] }).por_loja = copia(REDE).por_loja;
    expect(() => lerResultadoDoMes(loja, { ...pedido, unidade: LOJA_A })).toThrow();
    expect(() => lerResultadoDoMes(copia(LOJA), pedido)).toThrow();
  });
});

describe("regras da tela do resultado (L8b)", () => {
  it("mês, filtro, rótulos, percentual sobre a receita e o endereço", () => {
    const agora = new Date("2026-11-13T15:00:00Z");
    expect(mesDoResultado(undefined, agora)).toBe("2026-11-01");
    expect(mesDoResultado("2026-01", agora)).toBe("2026-01-01");
    expect(mesDoResultado("2024-10", agora)).toBe("2026-11-01");
    expect(mesDoResultado("2026-12", agora)).toBe("2026-11-01");
    expect(mesCurto("2026-06-01")).toBe("jun/26");
    expect(mesCurto("2025-12-01")).toBe("dez/25");
    expect(filtroDoResultado(LOJA_A)).toEqual({ tipo: "loja", id: LOJA_A });
    expect(filtroDoResultado("rede")).toEqual({ tipo: "rede" });
    expect(filtroDoResultado(undefined)).toEqual({ tipo: "rede" });
    expect(daReceita(50, 200)).toBe(0.25);
    expect(daReceita(50, 0)).toBeNull();
    expect(daReceita(50, -10)).toBeNull();
    expect(enderecoDoResultado("2026-11-01", "2026-11-01", { tipo: "rede" })).toBe("/resultado");
    expect(enderecoDoResultado("2026-09-01", "2026-11-01", { tipo: "loja", id: LOJA_B })).toBe(`/resultado?mes=2026-09&loja=${LOJA_B}`);
  });

  it("a cascata: subtotais desde o zero, o resto a partir do acumulado; o eixo inclui o zero e o negativo", () => {
    expect(geometriaDaCascata([
      { rotulo: "Receita", valor: 100, total: true }, { rotulo: "Custo", valor: -30 }, { rotulo: "Margem", valor: 70, total: true },
      { rotulo: "Contas", valor: -80 }, { rotulo: "Devolução de custo", valor: 5 }, { rotulo: "Resultado", valor: -5, total: true },
    ])).toEqual({
      piso: -10, topo: 100,
      barras: [{ de: 0, ate: 100 }, { de: 100, ate: 70 }, { de: 0, ate: 70 }, { de: 70, ate: -10 }, { de: -10, ate: -5 }, { de: 0, ate: -5 }],
    });
    expect(geometriaDaCascata([])).toEqual({ piso: 0, topo: 0, barras: [] });
  });
});

describe("planilha e impressão do resultado (L8d)", () => {
  const baixar = (consulta: string) => exportar(new Request(`http://localhost/resultado/exportar?${consulta}`));
  it("a tela oferece a planilha do mesmo mês e da mesma loja, e o botão de imprimir", async () => {
    const tela = await pagina({ mes: "2026-11", loja: LOJA_A });
    expect(enderecos(tela)).toContain(`/resultado/exportar?mes=2026-11&loja=${LOJA_A}`);
    expect(doTipo(tela, "BotaoImprimir")).toHaveLength(1);
    expect(doTipo(tela, "CarimboDaImpressao")[0]?.texto).toBe("Ora 5G · resultado do mês · Loja A (teste) · impresso em 13/11/2026 12:00");
    cenario.erro = { code: "PGRST202" };
    const semLeitura = await pagina();
    expect(doTipo(semLeitura, "BotaoImprimir")).toEqual([]);
    expect(enderecos(semLeitura).filter((e) => e.includes("exportar"))).toEqual([]);
  });

  it("a rede: o demonstrativo com uma coluna por loja, as categorias, o que ficou fora e as observações", async () => {
    const resposta = await baixar("mes=2026-11");
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-disposition")).toBe('attachment; filename="ora5g-resultado-2026-11-rede-inteira.csv"');
    expect(cenario.chamadas.at(-1)).toEqual({ p_mes: "2026-11-01", p_unidade: null, p_meses: 1 });
    // O BOM (para o Excel ler os acentos) está nos bytes; o text() do teste o remove ao decodificar.
    expect([...new Uint8Array(await resposta.clone().arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = await resposta.text();
    expect(csv.startsWith("Resultado do mês;Novembro de 2026 (até 13/11/2026);Rede inteira\r\nGerado em;13/11/2026 12:00;")).toBe(true);
    for (const linha of [
      "Linha;Rede inteira;Loja A (teste);Loja B (teste)",
      "Vendas concluídas (desconto já abatido);4791,00;;",
      "Devoluções e cancelamentos;157,50;;",
      "Receita líquida;4633,50;3234,50;1399,00",
      "Custo das mercadorias;3354,00;2254,00;1100,00",
      "Contas da rede (nas lojas, a parte de cada uma);1000,00;698,07;301,93",
      "Resultado do mês;-3055,50;-2952,57;-102,93",
      "Contas por categoria (pelo vencimento);Valor;Em aberto\r\nAluguel e condomínio;3000,00;3000,00",
      "Fora do resultado (compra de mercadoria e outras);Valor\r\nMercadoria (fornecedor);1000,00",
      "Cartão e Pix ainda sem conciliação: a taxa deles não entra;635,00;2 pagamentos",
    ]) expect(csv, linha).toContain(linha);
  });

  it("uma loja: valor e parte da rede; quem não é o dono, banco sem a leitura e falha", async () => {
    const loja = await (await baixar(`mes=2026-11&loja=${LOJA_A}`)).text();
    expect(loja).toContain("Linha;Valor\r\n");
    expect(loja).toContain("Parte das contas da rede;698,07");
    expect(loja).toContain("Parte da loja na receita líquida da rede (divide as contas da rede);69,8%");
    cenario.recusarLoja = true;
    expect((await baixar(`mes=2026-11&loja=${LOJA_A}`)).status).toBe(403);
    cenario.erro = { code: "42501" };
    expect((await baixar("mes=2026-11")).status).toBe(403);
    cenario.erro = { code: "PGRST202" };
    expect((await baixar("mes=2026-11")).status).toBe(503);
    cenario.erro = { code: "57014" };
    await expect(baixar("mes=2026-11")).rejects.toThrow();
  });
});
