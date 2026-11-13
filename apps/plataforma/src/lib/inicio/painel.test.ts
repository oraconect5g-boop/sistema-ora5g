// Regras dos painéis do Início (G1). A resposta abaixo tem o formato exato de public.vendas_painel
// para o dia provado no banco (packages/banco/src/vendas-painel.test.ts, "o dia da rede"): seis
// vendas em duas lojas, uma com desconto, uma devolução parcial e um cancelamento. Dados fictícios.
import { describe, expect, it } from "vitest";

import { ValorForaDoLimite } from "../dinheiro";
import { janelasDoPeriodo, lerPainel, RespostaInesperada, resumoDoPainel } from "../financeiro/painel";
import {
  categoriasDoMix, comparacaoDasVendas, enderecoDoFinanceiro, enderecoDoInicio, escopoDoInicio, lerVendas, lojasDoFiltro, lojasDoPainel,
  mixPorGrupo, numerosDasVendas, partesRecebidas, serieDeVendas, ticketMedio, vendedoresDoPainel, visaoDoInicio, type VendasDoBanco,
} from "./painel";

const SEM_ESTORNO = { cancelamentos: 0, cancelado: 0, devolucoes: 0, devolvido: 0 };
const ITENS_SEM_ESTORNO = { itens_cancelados: 0, cancelado: 0, itens_devolvidos: 0, devolvido: 0 };
const ACESSORIOS = { itens: 5, vendido: 39_400, itens_cancelados: 1, cancelado: 7_900, itens_devolvidos: 1, devolvido: 7_850 };
const APARELHOS = { itens: 3, vendido: 439_700, ...ITENS_SEM_ESTORNO };
const TOTAIS = { vendas: 6, vendido: 479_100, subtotal: 479_200, descontos: 100, vendas_com_desconto: 1, cancelamentos: 1, cancelado: 7_900, devolucoes: 1, devolvido: 7_850 };
const RESPOSTA = {
  totais: TOTAIS,
  periodos: [{ periodo: "2026-11-10", vendas: 6, vendido: 479_100, subtotal: 479_200, descontos: 100, cancelamentos: 1, cancelado: 7_900, devolucoes: 1, devolvido: 7_850 }],
  tipos: [{ tipo: "acessorio", ...ACESSORIOS }, { tipo: "aparelho", ...APARELHOS }],
  categorias: [
    { categoria_id: "cat-acessorios", categoria: "Acessórios", ...ACESSORIOS },
    { categoria_id: "cat-celulares", categoria: "Celulares", ...APARELHOS },
  ],
  lojas: [
    { unidade_id: "loja-a", nome: "Loja A", vendas: 5, vendido: 339_200, cancelamentos: 1, cancelado: 7_900, devolucoes: 1, devolvido: 7_850 },
    { unidade_id: "loja-b", nome: "Loja B", vendas: 1, vendido: 139_900, ...SEM_ESTORNO },
  ],
  vendedores: [
    { vendedor_id: "ana", vendas: 4, vendido: 331_300, cancelamentos: 0, cancelado: 0, devolucoes: 1, devolvido: 7_850 },
    { vendedor_id: "beto", vendas: 2, vendido: 147_800, cancelamentos: 1, cancelado: 7_900, devolucoes: 0, devolvido: 0 },
  ],
};
const SEM_FATOS = {
  totais: { vendas: 0, vendido: 0, subtotal: 0, descontos: 0, vendas_com_desconto: 0, ...SEM_ESTORNO },
  periodos: [], tipos: [], categorias: [], lojas: [], vendedores: [],
};
const sem = (objeto: Record<string, unknown>, campo: string) => Object.fromEntries(Object.entries(objeto).filter(([k]) => k !== campo));
const soma = <T>(linhas: readonly T[], valor: (l: T) => number) => linhas.reduce((s, l) => s + valor(l), 0);

describe("leitura da resposta de vendas_painel", () => {
  it("converte cada grão com os nomes do banco", () => {
    const v = lerVendas(RESPOSTA);
    expect(v.totais).toEqual({ vendas: 6, vendido: 479_100, subtotal: 479_200, descontos: 100, vendasComDesconto: 1, cancelamentos: 1, cancelado: 7_900, devolucoes: 1, devolvido: 7_850 });
    expect(v.periodos).toEqual([{ periodo: "2026-11-10", vendas: 6, vendido: 479_100, subtotal: 479_200, descontos: 100, cancelamentos: 1, cancelado: 7_900, devolucoes: 1, devolvido: 7_850 }]);
    expect(v.tipos[0]).toEqual({ tipo: "acessorio", itens: 5, vendido: 39_400, itensCancelados: 1, cancelado: 7_900, itensDevolvidos: 1, devolvido: 7_850 });
    expect(v.categorias[1]).toEqual({ categoriaId: "cat-celulares", categoria: "Celulares", itens: 3, vendido: 439_700, itensCancelados: 0, cancelado: 0, itensDevolvidos: 0, devolvido: 0 });
    expect(v.lojas[1]).toEqual({ unidadeId: "loja-b", nome: "Loja B", vendas: 1, vendido: 139_900, ...SEM_ESTORNO });
    expect(v.vendedores[0]).toEqual({ vendedorId: "ana", vendas: 4, vendido: 331_300, cancelamentos: 0, cancelado: 0, devolucoes: 1, devolvido: 7_850 });
    // Centavos que chegam como texto (bigint grande) continuam inteiros.
    expect(lerVendas({ ...RESPOSTA, totais: { ...TOTAIS, vendido: "479100" } }).totais.vendido).toBe(479_100);
  });

  it("sem fatos: zeros e listas vazias (é a leitura que deu certo e não achou nada)", () => {
    const v = lerVendas(SEM_FATOS);
    expect(v.totais.vendas).toBe(0);
    expect([v.periodos, v.tipos, v.categorias, v.lojas, v.vendedores]).toEqual([[], [], [], [], []]);
  });

  it("forma inesperada é erro, nunca zero", () => {
    for (const dado of [null, undefined, "texto", [], { ...RESPOSTA, totais: null }, { ...RESPOSTA, totais: [] }, sem(RESPOSTA, "totais")]) {
      expect(() => lerVendas(dado)).toThrow(RespostaInesperada);
    }
    // Lista que falta, que não é lista ou que traz o que não é linha.
    for (const campo of ["periodos", "tipos", "categorias", "lojas", "vendedores"]) {
      expect(() => lerVendas(sem(RESPOSTA, campo))).toThrow(RespostaInesperada);
      expect(() => lerVendas({ ...RESPOSTA, [campo]: "x" })).toThrow(RespostaInesperada);
      expect(() => lerVendas({ ...RESPOSTA, [campo]: [null] })).toThrow(RespostaInesperada);
    }
    // Número que falta, nulo ou quebrado não vira zero.
    expect(() => lerVendas({ ...RESPOSTA, totais: sem(TOTAIS, "vendido") })).toThrow(ValorForaDoLimite);
    expect(() => lerVendas({ ...RESPOSTA, totais: { ...TOTAIS, descontos: null } })).toThrow(ValorForaDoLimite);
    expect(() => lerVendas({ ...RESPOSTA, totais: { ...TOTAIS, vendido: 1.5 } })).toThrow(ValorForaDoLimite);
    expect(() => lerVendas({ ...RESPOSTA, tipos: [sem(RESPOSTA.tipos[0] ?? {}, "itens_devolvidos")] })).toThrow(ValorForaDoLimite);
    expect(() => lerVendas({ ...RESPOSTA, lojas: [{ ...RESPOSTA.lojas[0], vendas: "cinco" }] })).toThrow(ValorForaDoLimite);
    // Identificador e período são obrigatórios.
    expect(() => lerVendas({ ...RESPOSTA, vendedores: [{ ...RESPOSTA.vendedores[0], vendedor_id: null }] })).toThrow(RespostaInesperada);
    expect(() => lerVendas({ ...RESPOSTA, lojas: [{ ...RESPOSTA.lojas[0], unidade_id: "" }] })).toThrow(RespostaInesperada);
    expect(() => lerVendas({ ...RESPOSTA, periodos: [{ ...RESPOSTA.periodos[0], periodo: 20261110 }] })).toThrow(RespostaInesperada);
    expect(() => lerVendas({ ...RESPOSTA, tipos: [sem(RESPOSTA.tipos[0] ?? {}, "tipo")] })).toThrow(RespostaInesperada);
  });

  it("nome da loja e categoria podem vir nulos do banco, mas não podem faltar", () => {
    const v = lerVendas({
      ...RESPOSTA,
      lojas: [{ ...RESPOSTA.lojas[0], nome: null }],
      categorias: [{ ...RESPOSTA.categorias[0], categoria_id: null, categoria: null }],
    });
    expect(v.lojas[0]?.nome).toBeNull();
    expect(v.categorias[0]).toMatchObject({ categoriaId: null, categoria: null });
    expect(() => lerVendas({ ...RESPOSTA, lojas: [sem(RESPOSTA.lojas[0] ?? {}, "nome")] })).toThrow(RespostaInesperada);
    expect(() => lerVendas({ ...RESPOSTA, categorias: [sem(RESPOSTA.categorias[0] ?? {}, "categoria")] })).toThrow(RespostaInesperada);
    expect(() => lerVendas({ ...RESPOSTA, categorias: [{ ...RESPOSTA.categorias[0], categoria_id: 7 }] })).toThrow(RespostaInesperada);
  });
});

describe("quem vê o quê, e de qual loja", () => {
  const TURNO = { id: "loja-a", nome: "Loja A" };
  const LOJAS = [{ id: "loja-c", nome: "Loja C" }, { id: "loja-a", nome: "Loja A" }, { id: "loja-b", nome: "Água Verde" }];

  it("a visão é a mais ampla que a permissão dá", () => {
    expect(visaoDoInicio({ verTodas: true, verUnidade: true, verPropria: true })).toBe("rede");
    expect(visaoDoInicio({ verTodas: true, verUnidade: false, verPropria: false })).toBe("rede");
    expect(visaoDoInicio({ verTodas: false, verUnidade: true, verPropria: true })).toBe("loja");
    expect(visaoDoInicio({ verTodas: false, verUnidade: false, verPropria: true })).toBe("vendedor");
    expect(visaoDoInicio({ verTodas: false, verUnidade: false, verPropria: false })).toBe("nenhuma");
  });

  it("quem vê a rede começa pela rede inteira e pode escolher uma loja que lê", () => {
    const rede = { unidade: null, nome: "Rede inteira", chave: "rede" };
    expect(escopoDoInicio(undefined, LOJAS, TURNO, true)).toEqual(rede);
    expect(escopoDoInicio("rede", LOJAS, TURNO, true)).toEqual(rede);
    expect(escopoDoInicio("loja-b", LOJAS, TURNO, true)).toEqual({ unidade: "loja-b", nome: "Água Verde", chave: "loja-b" });
    // Loja que não está entre as que a pessoa lê: volta para o padrão, não inventa escopo.
    expect(escopoDoInicio("loja-de-outra-rede", LOJAS, TURNO, true)).toEqual(rede);
    // A loja do turno vale mesmo se o cadastro lido não a trouxer (depósito, por exemplo).
    expect(escopoDoInicio("deposito", LOJAS, { id: "deposito", nome: "Depósito" }, true)).toEqual({ unidade: "deposito", nome: "Depósito", chave: "deposito" });
  });

  it("gerente e vendedor ficam na loja do turno, qualquer que seja o endereço", () => {
    const doTurno = { unidade: "loja-a", nome: "Loja A", chave: "loja-a" };
    expect(escopoDoInicio(undefined, [], TURNO, false)).toEqual(doTurno);
    expect(escopoDoInicio("loja-b", LOJAS, TURNO, false)).toEqual(doTurno);
    expect(escopoDoInicio("rede", LOJAS, TURNO, false)).toEqual(doTurno);
  });

  it("filtro de loja: a rede, a loja do turno e as demais em ordem alfabética", () => {
    expect(lojasDoFiltro(LOJAS, TURNO).map((l) => l.id)).toEqual(["rede", "loja-a", "loja-b", "loja-c"]);
    expect(lojasDoFiltro([], TURNO)).toEqual([{ id: "rede", nome: "Rede inteira" }, TURNO]);
  });

  it("o endereço guarda só o que foge do padrão", () => {
    expect(enderecoDoInicio("hoje", null)).toBe("/inicio");
    expect(enderecoDoInicio("7", null)).toBe("/inicio?periodo=7");
    expect(enderecoDoInicio("hoje", "loja-b")).toBe("/inicio?loja=loja-b");
    expect(enderecoDoInicio("30", "loja-b")).toBe("/inicio?periodo=30&loja=loja-b");
  });

  it("o mesmo recorte no financeiro, onde o padrão é a loja do turno", () => {
    const rede = escopoDoInicio(undefined, LOJAS, TURNO, true);
    const outra = escopoDoInicio("loja-b", LOJAS, TURNO, true);
    const doTurno = escopoDoInicio("loja-a", LOJAS, TURNO, true);
    expect(enderecoDoFinanceiro("hoje", rede, TURNO.id, true)).toBe("/financeiro?loja=rede");
    expect(enderecoDoFinanceiro("7", outra, TURNO.id, true)).toBe("/financeiro?periodo=7&loja=loja-b");
    expect(enderecoDoFinanceiro("hoje", doTurno, TURNO.id, true)).toBe("/financeiro");
    // Gerente: sempre a loja do turno.
    expect(enderecoDoFinanceiro("30", escopoDoInicio("loja-b", LOJAS, TURNO, false), TURNO.id, false)).toBe("/financeiro?periodo=30");
    // Direto nos registros de pagamentos, no mesmo recorte.
    expect(enderecoDoFinanceiro("7", outra, TURNO.id, true, "pagamentos")).toBe("/financeiro?periodo=7&loja=loja-b&ver=pagamentos");
    expect(enderecoDoFinanceiro("hoje", doTurno, TURNO.id, false, "pagamentos")).toBe("/financeiro?ver=pagamentos");
  });
});

describe("números do período", () => {
  it("ticket, líquido e desconto do dia da rede", () => {
    const n = numerosDasVendas(lerVendas(RESPOSTA));
    expect(n).toMatchObject({ vendas: 6, vendido: 479_100, descontos: 100, vendasComDesconto: 1, cancelamentos: 1, devolucoes: 1 });
    expect(n.ticket).toBe(79_850); // 479.100 ÷ 6
    expect(n.desfeito).toBe(15_750); // 7.900 cancelados + 7.850 devolvidos
    expect(n.liquido).toBe(463_350); // 479.100 − 15.750
    expect(n.fracaoDeDesconto).toBeCloseTo(100 / 479_200, 12);
  });

  it("sem venda não há ticket nem percentual de desconto (não é zero)", () => {
    const n = numerosDasVendas(lerVendas(SEM_FATOS));
    expect(n.ticket).toBeNull();
    expect(n.fracaoDeDesconto).toBeNull();
    expect([n.vendas, n.vendido, n.liquido]).toEqual([0, 0, 0]);
    expect(ticketMedio(0, 0)).toBeNull();
    expect(ticketMedio(10_001, 3)).toBe(3_334); // arredonda no centavo
  });

  it("devolução de venda antiga pode deixar o líquido negativo: o número não é escondido", () => {
    const n = numerosDasVendas(lerVendas({ ...SEM_FATOS, totais: { ...SEM_FATOS.totais, devolucoes: 1, devolvido: 5_000 } }));
    expect(n.liquido).toBe(-5_000);
    expect(n.ticket).toBeNull();
  });

  it("comparação: só há percentual quando o período anterior foi lido e teve venda", () => {
    expect(comparacaoDasVendas({ estado: "ok", dados: lerVendas(RESPOSTA) })).toBe("ok");
    expect(comparacaoDasVendas({ estado: "ok", dados: lerVendas(SEM_FATOS) })).toBe("sem_historico");
    expect(comparacaoDasVendas({ estado: "falha" })).toBe("nao_lida");
    expect(comparacaoDasVendas({ estado: "indisponivel" })).toBe("nao_lida");
  });
});

describe("série de vendas: o período atual e o anterior, ponto a ponto", () => {
  const AGORA = new Date("2026-11-12T17:30:00Z"); // 14h30 em São Paulo
  const p = (periodo: string, vendas: number, vendido: number) => ({ periodo, vendas, vendido, subtotal: vendido, descontos: 0, ...SEM_ESTORNO });
  const comPeriodos = (periodos: ReturnType<typeof p>[]): VendasDoBanco => lerVendas({ ...SEM_FATOS, periodos });

  it("hoje × ontem: a mesma hora, de 7h até agora", () => {
    const janelas = janelasDoPeriodo("hoje", AGORA);
    const serie = serieDeVendas(comPeriodos([p("2026-11-12T09", 2, 20_000), p("2026-11-12T14", 1, 5_000)]), comPeriodos([p("2026-11-11T09", 1, 9_000), p("2026-11-11T13", 2, 4_000)]), janelas);
    expect(serie.map((x) => x.rotulo)).toEqual(["07h", "08h", "09h", "10h", "11h", "12h", "13h", "14h"]);
    expect(serie[2]).toEqual({ chave: "2026-11-12T09", rotulo: "09h", vendas: 2, vendido: 20_000, chaveAnterior: "2026-11-11T09", rotuloAnterior: "09h", vendasAntes: 1, vendidoAntes: 9_000 });
    expect(serie[6]).toMatchObject({ rotulo: "13h", vendas: 0, vendido: 0, vendasAntes: 2, vendidoAntes: 4_000 });
    expect(serie.at(-1)).toMatchObject({ rotulo: "14h", vendas: 1, vendido: 5_000, vendasAntes: 0, vendidoAntes: 0 });
    // Nada some no caminho: a soma dos pontos é o total de cada período.
    expect([soma(serie, (x) => x.vendido), soma(serie, (x) => x.vendidoAntes)]).toEqual([25_000, 13_000]);
    expect([soma(serie, (x) => x.vendas), soma(serie, (x) => x.vendasAntes)]).toEqual([3, 3]);
  });

  it("fato antes das 7h, de hoje ou de ontem, abre a hora no eixo", () => {
    const janelas = janelasDoPeriodo("hoje", AGORA);
    const serie = serieDeVendas(comPeriodos([p("2026-11-12T06", 1, 1_000)]), comPeriodos([p("2026-11-11T05", 1, 3_000)]), janelas);
    expect(serie.map((x) => x.rotulo)).toEqual(["05h", "06h", "07h", "08h", "09h", "10h", "11h", "12h", "13h", "14h"]);
    expect(serie[0]).toEqual({ chave: "2026-11-12T05", rotulo: "05h", vendas: 0, vendido: 0, chaveAnterior: "2026-11-11T05", rotuloAnterior: "05h", vendasAntes: 1, vendidoAntes: 3_000 });
    expect(serie[1]).toMatchObject({ rotulo: "06h", vendas: 1, vendido: 1_000, vendasAntes: 0 });
    expect(soma(serie, (x) => x.vendidoAntes)).toBe(3_000);
  });

  it("logo depois da meia-noite, o eixo é só a hora que já passou", () => {
    const serie = serieDeVendas(comPeriodos([]), comPeriodos([]), janelasDoPeriodo("hoje", new Date("2026-11-12T03:10:00Z")));
    expect(serie.map((x) => [x.chave, x.chaveAnterior])).toEqual([["2026-11-12T00", "2026-11-11T00"]]);
  });

  it("sem o período anterior, a série atual continua inteira e o anterior fica sem valor", () => {
    const janelas = janelasDoPeriodo("hoje", AGORA);
    const serie = serieDeVendas(comPeriodos([p("2026-11-12T09", 2, 20_000)]), null, janelas);
    expect(serie).toHaveLength(8);
    expect(soma(serie, (x) => x.vendido)).toBe(20_000);
    expect(serie.every((x) => x.vendasAntes === 0 && x.vendidoAntes === 0)).toBe(true);
  });

  it("7 dias: cada dia com o dia na mesma posição dos 7 anteriores", () => {
    const janelas = janelasDoPeriodo("7", AGORA);
    const serie = serieDeVendas(comPeriodos([p("2026-11-06", 1, 1_000), p("2026-11-12", 2, 2_000)]), comPeriodos([p("2026-10-30", 3, 3_000), p("2026-11-05", 4, 4_000)]), janelas);
    expect(serie.map((x) => x.rotulo)).toEqual(["06/11", "07/11", "08/11", "09/11", "10/11", "11/11", "12/11"]);
    expect(serie.map((x) => x.rotuloAnterior)).toEqual(["30/10", "31/10", "01/11", "02/11", "03/11", "04/11", "05/11"]);
    expect(serie[0]).toEqual({ chave: "2026-11-06", rotulo: "06/11", vendas: 1, vendido: 1_000, chaveAnterior: "2026-10-30", rotuloAnterior: "30/10", vendasAntes: 3, vendidoAntes: 3_000 });
    expect(serie[6]).toMatchObject({ vendas: 2, vendido: 2_000, vendasAntes: 4, vendidoAntes: 4_000 });
    expect(serie.slice(1, 6).every((x) => x.vendido === 0 && x.vendidoAntes === 0)).toBe(true);
  });

  it("30 dias: trinta pontos, cada um com o seu par", () => {
    const janelas = janelasDoPeriodo("30", AGORA);
    const serie = serieDeVendas(comPeriodos([p("2026-10-14", 1, 700), p("2026-11-12", 1, 300)]), comPeriodos([p("2026-09-14", 2, 900), p("2026-10-13", 1, 100)]), janelas);
    expect(serie).toHaveLength(30);
    expect(serie[0]).toMatchObject({ chave: "2026-10-14", chaveAnterior: "2026-09-14", vendido: 700, vendidoAntes: 900 });
    expect(serie[29]).toMatchObject({ chave: "2026-11-12", chaveAnterior: "2026-10-13", vendido: 300, vendidoAntes: 100 });
    expect(new Set(serie.map((x) => x.chaveAnterior)).size).toBe(30);
    expect([soma(serie, (x) => x.vendido), soma(serie, (x) => x.vendidoAntes)]).toEqual([1_000, 1_000]);
  });
});

describe("mix de vendas", () => {
  const item = (tipo: string, itens: number, vendido: number, desfeito = 0) => ({ tipo, itens, vendido, itens_cancelados: 0, cancelado: 0, itens_devolvidos: desfeito ? 1 : 0, devolvido: desfeito });

  it("os grupos somam o total vendido; cada grupo tem a sua cor", () => {
    const grupos = mixPorGrupo(lerVendas(RESPOSTA).tipos);
    expect(grupos.map((g) => [g.nome, g.serie, g.itens, g.vendido])).toEqual([
      ["Aparelhos", 1, 3, 439_700], ["Acessórios", 2, 5, 39_400], ["Ora Connect", 3, 0, 0], ["Serviços", 4, 0, 0],
    ]);
    expect(grupos[1]).toMatchObject({ itensDesfeitos: 2, desfeito: 15_750 });
    expect(soma(grupos, (g) => g.vendido)).toBe(TOTAIS.vendido);
  });

  it("chip, ativação, portabilidade e recarga formam o grupo Ora Connect", () => {
    const tipos = lerVendas({ ...SEM_FATOS, tipos: [item("chip", 2, 2_000), item("ativacao", 1, 3_000), item("portabilidade", 1, 0), item("recarga", 4, 8_000, 2_000), item("servico", 1, 5_000)] }).tipos;
    const grupos = mixPorGrupo(tipos);
    expect(grupos.find((g) => g.chave === "connect")).toEqual({ chave: "connect", nome: "Ora Connect", serie: 3, itens: 8, vendido: 13_000, itensDesfeitos: 1, desfeito: 2_000 });
    expect(grupos.find((g) => g.chave === "servicos")).toMatchObject({ itens: 1, vendido: 5_000 });
    expect(grupos).toHaveLength(4);
  });

  it("tipo que a tela ainda não conhece vai para Outros: a soma continua igual ao total", () => {
    const tipos = lerVendas({ ...SEM_FATOS, tipos: [item("aparelho", 1, 100_000), item("seguro", 2, 9_000), item("garantia", 1, 1_000)] }).tipos;
    const grupos = mixPorGrupo(tipos);
    expect(grupos.at(-1)).toEqual({ chave: "outros", nome: "Outros", serie: 5, itens: 3, vendido: 10_000, itensDesfeitos: 0, desfeito: 0 });
    expect(soma(grupos, (g) => g.vendido)).toBe(110_000);
    // A cor é do grupo, não da posição: aparelhos continuam na cor 1 com ou sem os outros.
    expect(grupos[0]).toMatchObject({ nome: "Aparelhos", serie: 1 });
  });

  const categoria = (id: string | null, nome: string | null, vendido: number, itens = 1) => ({ categoria_id: id, categoria: nome, itens, vendido, ...ITENS_SEM_ESTORNO });

  it("categorias: da maior para a menor; a tabela tem todas", () => {
    const { barras, todas } = categoriasDoMix(lerVendas(RESPOSTA).categorias);
    expect(todas.map((c) => [c.chave, c.nome, c.itens, c.vendido])).toEqual([["cat-celulares", "Celulares", 3, 439_700], ["cat-acessorios", "Acessórios", 5, 39_400]]);
    expect(barras).toEqual(todas);
    expect(soma(todas, (c) => c.vendido)).toBe(TOTAIS.vendido);
  });

  it("muitas categorias: as seis maiores e o resto junto em Outras categorias, sem perder valor", () => {
    const linhas = Array.from({ length: 9 }, (_, i) => categoria(`c${i + 1}`, `Categoria ${i + 1}`, (9 - i) * 1_000, i + 1));
    const { barras, todas } = categoriasDoMix(lerVendas({ ...SEM_FATOS, categorias: linhas }).categorias);
    expect(todas).toHaveLength(9);
    expect(barras.map((c) => c.nome)).toEqual(["Categoria 1", "Categoria 2", "Categoria 3", "Categoria 4", "Categoria 5", "Categoria 6", "Outras categorias"]);
    expect(barras.at(-1)).toMatchObject({ chave: "outras", vendido: 3_000 + 2_000 + 1_000, itens: 7 + 8 + 9 });
    expect(soma(barras, (c) => c.vendido)).toBe(soma(todas, (c) => c.vendido));
    // Sobrando uma só, ela aparece com o próprio nome.
    const sete = categoriasDoMix(lerVendas({ ...SEM_FATOS, categorias: linhas.slice(0, 7) }).categorias);
    expect(sete.barras.map((c) => c.nome).at(-1)).toBe("Categoria 7");
    expect(sete.barras).toHaveLength(7);
  });

  it("categoria sem venda no período (só devolução) fica na tabela e fora do gráfico", () => {
    const soDevolucao = { categoria_id: "c-dev", categoria: "Películas", itens: 0, vendido: 0, itens_cancelados: 0, cancelado: 0, itens_devolvidos: 1, devolvido: 2_500 };
    const { barras, todas } = categoriasDoMix(lerVendas({ ...SEM_FATOS, categorias: [soDevolucao, categoria("c1", "Capas", 4_000)] }).categorias);
    expect(todas.map((c) => c.nome)).toEqual(["Capas", "Películas"]);
    expect(todas[1]).toMatchObject({ itensDesfeitos: 1, desfeito: 2_500 });
    expect(barras.map((c) => c.nome)).toEqual(["Capas"]);
  });

  it("produto sem categoria e categoria que não pôde ser lida têm rótulo próprio; nome repetido ganha número", () => {
    const linhas = [
      categoria(null, null, 5_000), categoria("c-oculta", null, 4_000), categoria("c-oculta-2", null, 3_000),
      categoria("c1", "Outras categorias", 9_000), categoria("c2", "B", 2_500), categoria("c3", "C", 2_400), categoria("c4", "D", 2_300), categoria("c5", "E", 2_200),
    ];
    const { barras, todas } = categoriasDoMix(lerVendas({ ...SEM_FATOS, categorias: linhas }).categorias);
    expect(todas.map((c) => c.nome)).toEqual(["Outras categorias", "Sem categoria", "Categoria não identificada", "Categoria não identificada (2)", "B", "C", "D", "E"]);
    expect(todas[1]?.chave).toBe("sem-categoria");
    // Uma categoria que se chama "Outras categorias" não se confunde com o agrupamento.
    expect(barras.map((c) => c.nome)).toEqual(["Outras categorias", "Sem categoria", "Categoria não identificada", "Categoria não identificada (2)", "B", "C", "Outras categorias (2)"]);
    expect(new Set(barras.map((c) => c.nome)).size).toBe(barras.length);
    expect(barras.at(-1)).toMatchObject({ chave: "outras", vendido: 4_500 });
  });
});

describe("desempenho das lojas e da equipe", () => {
  it("a venda fica na loja em que foi feita; loja do cadastro sem venda entra com zero", () => {
    const cadastro = [{ id: "loja-a", nome: "Loja A" }, { id: "loja-b", nome: "Loja B" }, { id: "loja-c", nome: "Loja C" }, { id: "loja-d", nome: "Bairro Alto" }];
    const lojas = lojasDoPainel(lerVendas(RESPOSTA).lojas, cadastro);
    expect(lojas.map((l) => [l.nome, l.vendas, l.vendido])).toEqual([["Loja A", 5, 339_200], ["Loja B", 1, 139_900], ["Bairro Alto", 0, 0], ["Loja C", 0, 0]]);
    expect(lojas[0]).toEqual({ id: "loja-a", nome: "Loja A", vendas: 5, vendido: 339_200, desfeito: 15_750, liquido: 323_450, ticket: 67_840 });
    expect(lojas[2]).toEqual({ id: "loja-d", nome: "Bairro Alto", vendas: 0, vendido: 0, desfeito: 0, liquido: 0, ticket: null });
    expect(soma(lojas, (l) => l.vendido)).toBe(TOTAIS.vendido);
    expect(soma(lojas, (l) => l.vendas)).toBe(TOTAIS.vendas);
  });

  it("loja que a pessoa não lê mais aparece sem o nome, numerada se houver mais de uma; o valor não some", () => {
    const fatos = lerVendas({ ...RESPOSTA, lojas: [
      { ...RESPOSTA.lojas[0] }, { unidade_id: "antiga-1", nome: null, vendas: 1, vendido: 9_000, ...SEM_ESTORNO }, { unidade_id: "antiga-2", nome: null, vendas: 1, vendido: 8_000, ...SEM_ESTORNO },
    ] }).lojas;
    const lojas = lojasDoPainel(fatos, [{ id: "loja-a", nome: "Loja A" }]);
    expect(lojas.map((l) => [l.id, l.nome])).toEqual([["loja-a", "Loja A"], ["antiga-1", "Loja inativa"], ["antiga-2", "Loja inativa (2)"]]);
    expect(soma(lojas, (l) => l.vendido)).toBe(339_200 + 17_000);
    // Sem o nome na resposta, vale o do cadastro lido.
    expect(lojasDoPainel(fatos, [{ id: "antiga-1", nome: "Depósito" }]).find((l) => l.id === "antiga-1")?.nome).toBe("Depósito");
  });

  it("sem cadastro (escopo de uma loja), só as lojas com fato", () => {
    expect(lojasDoPainel(lerVendas(RESPOSTA).lojas).map((l) => l.id)).toEqual(["loja-a", "loja-b"]);
    expect(lojasDoPainel([])).toEqual([]);
  });

  it("vendedor de origem, do maior para o menor, com o nome do ranking e a marca de quem consulta", () => {
    const nomes = new Map([["ana", "Ana Souza"], ["beto", "Beto Lima"]]);
    const equipe = vendedoresDoPainel(lerVendas(RESPOSTA).vendedores, nomes, "beto");
    expect(equipe.map((v) => [v.nome, v.eu, v.vendas, v.vendido])).toEqual([["Ana Souza", false, 4, 331_300], ["Beto Lima (você)", true, 2, 147_800]]);
    expect(equipe[0]).toMatchObject({ id: "ana", desfeito: 7_850, liquido: 323_450, ticket: 82_825 });
    expect(equipe[1]).toMatchObject({ desfeito: 7_900, liquido: 139_900, ticket: 73_900 });
    expect(soma(equipe, (v) => v.vendido)).toBe(TOTAIS.vendido);
  });

  it("sem nome, ninguém é inventado: a pessoa vira Você e os demais, não identificados e numerados", () => {
    const fatos = lerVendas({ ...RESPOSTA, vendedores: [...RESPOSTA.vendedores, { vendedor_id: "caio", vendas: 1, vendido: 500, ...SEM_ESTORNO }] }).vendedores;
    const equipe = vendedoresDoPainel(fatos, new Map(), "beto");
    expect(equipe.map((v) => v.nome)).toEqual(["Vendedor não identificado", "Você", "Vendedor não identificado (2)"]);
    // Dois vendedores com o mesmo nome não viram um só.
    const homonimos = vendedoresDoPainel(fatos, new Map([["ana", "Ana"], ["beto", "Ana"], ["caio", "Ana"]]), "ninguem");
    expect(homonimos.map((v) => v.nome)).toEqual(["Ana", "Ana (2)", "Ana (3)"]);
    expect(homonimos.map((v) => v.id)).toEqual(["ana", "beto", "caio"]);
  });
});

describe("recebimentos por meio", () => {
  const pagamento = (meio: string, valor: number, extra: Record<string, unknown> = {}) => ({ meio, situacao: "confirmado", meio_entrada: null, quantidade: 1, valor, entrada: 0, troco: 0, ...extra });
  const financeiro = (pagamentos: object[]) => resumoDoPainel(lerPainel({
    periodos: [], pagamentos, reembolsos: [], estornos: [], a_receber: [], movimentos: [],
    caixas: { abertos_agora: 0, fechados: 0, conferidos: 0, com_diferenca: 0, diferenca: 0, diferenca_absoluta: 0 },
  }));
  const TODOS = [
    pagamento("dinheiro", 20_000, { quantidade: 2, troco: 2_100 }), pagamento("pix_picpay", 5_800), pagamento("cartao_picpay", 30_000), pagamento("pix_direto", 7_900),
    pagamento("cartao_pagseguro", 12_000), pagamento("link_pagamento", 4_000), pagamento("payjoy", 149_900, { entrada: 20_000, meio_entrada: "dinheiro" }), pagamento("vale_troca", 3_000),
  ];

  it("cada meio na sua cor e na ordem fixa; a soma das partes é o recebido do financeiro", () => {
    const r = financeiro(TODOS);
    const partes = partesRecebidas(r.meios);
    expect(partes.map((x) => [x.chave, x.nome, x.serie, x.valor])).toEqual([
      ["pix_picpay", "Pix PicPay", 1, 5_800], ["cartao_picpay", "Cartão PicPay", 2, 30_000], ["dinheiro", "Dinheiro", 3, 37_900],
      ["pix_direto", "Pix direto", 4, 7_900], ["cartao_pagseguro", "Cartão PagSeguro", 5, 12_000], ["link_pagamento", "Link de pagamento", 6, 4_000],
    ]);
    // Dinheiro: 20.000 − 2.100 de troco + 20.000 de entrada do financiamento. A parte financiada e o vale não entram.
    expect(partes[2]).toMatchObject({ nomeInteiro: "Dinheiro", quantidade: 2, entradas: 20_000 });
    expect(partes[0]?.nomeInteiro).toBe("Pix na maquininha PicPay");
    expect(soma(partes, (x) => x.valor)).toBe(r.recebido);
    expect(r.recebido).toBe(97_600);
  });

  it("a cor é do meio, não da posição: com dois meios, cada um continua na sua", () => {
    const partes = partesRecebidas(financeiro([pagamento("pix_direto", 1_000), pagamento("dinheiro", 9_000)]).meios);
    expect(partes.map((x) => [x.chave, x.serie])).toEqual([["dinheiro", 3], ["pix_direto", 4]]);
  });

  it("meio que a tela ainda não conhece junta com o link de pagamento, sem perder valor", () => {
    const r = financeiro([...TODOS, pagamento("boleto", 9_000), pagamento("cripto", 1_000, { quantidade: 2 })]);
    const partes = partesRecebidas(r.meios);
    expect(partes).toHaveLength(6);
    expect(partes.at(-1)).toEqual({ chave: "outros", nome: "Outros meios", nomeInteiro: "Outros meios (Link de pagamento, boleto, cripto)", valor: 14_000, quantidade: 4, entradas: 0, serie: 6 });
    expect(soma(partes, (x) => x.valor)).toBe(r.recebido);
    // Sem link de pagamento no período, o desconhecido fica sozinho na sexta cor.
    const semLink = partesRecebidas(financeiro([pagamento("dinheiro", 1_000), pagamento("boleto", 9_000)]).meios);
    expect(semLink.map((x) => [x.nome, x.serie, x.valor])).toEqual([["Dinheiro", 3, 1_000], ["Outros meios", 6, 9_000]]);
  });

  it("sem pagamento confirmado não há parte nenhuma", () => {
    expect(partesRecebidas(financeiro([]).meios)).toEqual([]);
    expect(partesRecebidas(financeiro([pagamento("pix_direto", 7_900, { situacao: "estorno_pendente" })]).meios)).toEqual([]);
  });
});
