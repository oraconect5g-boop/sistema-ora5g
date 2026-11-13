// Regras da margem bruta (G2). As respostas abaixo têm o formato exato de public.margem_painel e de
// public.margem_itens para os dias provados no banco (packages/banco/src/margem-painel.test.ts): a
// Loja A em 20, 21 e 22/10 (a venda num dia, a devolução no outro, o cancelamento no terceiro) e o
// dia da rede. Dados fictícios.
import { describe, expect, it } from "vitest";

import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import { lerItensDaMargem, lerMargem, numerosDaMargem, situacaoDaMargem, temCustoGravado, type MargemDoBanco } from "./painel";

const ZERO = {
  itens: 0, vendido: 0, itens_com_custo: 0, vendido_com_custo: 0, custo: 0, itens_sem_custo: 0, vendido_sem_custo: 0,
  itens_devolvidos_com_custo: 0, devolvido_com_custo: 0, custo_devolvido: 0,
  itens_cancelados_com_custo: 0, cancelado_com_custo: 0, custo_cancelado: 0, margem: 0,
};
const DEVOLUCAO = { itens_devolvidos_com_custo: 1, devolvido_com_custo: 7_850, custo_devolvido: 1_800 };
const CANCELAMENTO = { itens_cancelados_com_custo: 1, cancelado_com_custo: 7_900, custo_cancelado: 1_800 };
const DIA_20 = { ...ZERO, itens: 4, vendido: 31_500, itens_com_custo: 4, vendido_com_custo: 31_500, custo: 7_200, margem: 24_300 };
const DIA_21 = { ...ZERO, ...DEVOLUCAO, margem: -6_050 };
const DIA_22 = { ...ZERO, ...CANCELAMENTO, margem: -6_100 };
const TRES_DIAS = {
  totais: { ...DIA_20, ...DEVOLUCAO, ...CANCELAMENTO, margem: 12_150 },
  periodos: [{ periodo: "2025-10-20", ...DIA_20 }, { periodo: "2025-10-21", ...DIA_21 }, { periodo: "2025-10-22", ...DIA_22 }],
  lojas_com_custo: 1, lojas_fora: 0,
};
const VAZIO = { totais: ZERO, periodos: [], lojas_com_custo: 0, lojas_fora: 0 };
// Rede com um item sem custo gravado: 165.700 vendidos, 7.900 deles sem custo (o caso provado no banco).
const COM_ITEM_SEM_CUSTO = {
  ...ZERO, itens: 3, vendido: 165_700, itens_com_custo: 2, vendido_com_custo: 157_800, custo: 111_800, itens_sem_custo: 1, vendido_sem_custo: 7_900, margem: 46_000,
};
const SO_SEM_CUSTO = { ...ZERO, itens: 2, vendido: 15_800, itens_sem_custo: 2, vendido_sem_custo: 15_800 };
const sem = (objeto: Record<string, unknown>, campo: string) => Object.fromEntries(Object.entries(objeto).filter(([k]) => k !== campo));

describe("leitura da resposta de margem_painel", () => {
  it("converte o total e os dias com os nomes do banco", () => {
    const m = lerMargem(TRES_DIAS);
    expect(m.totais).toEqual({
      itens: 4, vendido: 31_500, itensComCusto: 4, vendidoComCusto: 31_500, custo: 7_200, itensSemCusto: 0, vendidoSemCusto: 0,
      itensDevolvidosComCusto: 1, devolvidoComCusto: 7_850, custoDevolvido: 1_800,
      itensCanceladosComCusto: 1, canceladoComCusto: 7_900, custoCancelado: 1_800, margem: 12_150,
    });
    expect(m.periodos.map((p) => [p.periodo, p.margem])).toEqual([["2025-10-20", 24_300], ["2025-10-21", -6_050], ["2025-10-22", -6_100]]);
    expect([m.lojasComCusto, m.lojasFora]).toEqual([1, 0]);
    // Centavos que chegam como texto (bigint grande) continuam inteiros.
    expect(lerMargem({ ...TRES_DIAS, totais: { ...TRES_DIAS.totais, margem: "12150" } }).totais.margem).toBe(12_150);
  });

  it("sem fatos: zeros e lista vazia (é a leitura que deu certo e não achou nada)", () => {
    const m = lerMargem(VAZIO);
    expect(Object.values(m.totais)).toEqual(Object.keys(ZERO).map(() => 0));
    expect([m.periodos, m.lojasComCusto, m.lojasFora]).toEqual([[], 0, 0]);
  });

  it("campo ausente, nulo ou fracionado é erro, não zero", () => {
    for (const campo of Object.keys(ZERO)) {
      expect(() => lerMargem({ ...VAZIO, totais: sem(ZERO, campo) }), campo).toThrow(ValorForaDoLimite);
      expect(() => lerMargem({ ...VAZIO, totais: { ...ZERO, [campo]: null } }), campo).toThrow(ValorForaDoLimite);
    }
    expect(() => lerMargem({ ...VAZIO, totais: { ...ZERO, margem: 0.5 } })).toThrow(ValorForaDoLimite);
    expect(() => lerMargem(sem(VAZIO, "lojas_fora"))).toThrow(ValorForaDoLimite);
    expect(() => lerMargem(sem(VAZIO, "lojas_com_custo"))).toThrow(ValorForaDoLimite);
  });

  it("forma inesperada é erro: resposta que não é objeto, lista que não é lista, dia fora do formato", () => {
    for (const dado of [null, undefined, [], "x", 3]) expect(() => lerMargem(dado)).toThrow(RespostaInesperada);
    expect(() => lerMargem(sem(VAZIO, "totais"))).toThrow(RespostaInesperada);
    expect(() => lerMargem({ ...VAZIO, totais: [] })).toThrow(RespostaInesperada);
    expect(() => lerMargem(sem(VAZIO, "periodos"))).toThrow(RespostaInesperada);
    expect(() => lerMargem({ ...VAZIO, periodos: [3] })).toThrow(RespostaInesperada);
    expect(() => lerMargem({ ...VAZIO, periodos: [{ ...ZERO }] })).toThrow(RespostaInesperada);
    expect(() => lerMargem({ ...VAZIO, periodos: [{ ...ZERO, periodo: "2025-10-20T14" }] })).toThrow(RespostaInesperada);
    expect(() => lerMargem({ ...VAZIO, periodos: [{ ...ZERO, periodo: "20/10/2025" }] })).toThrow(RespostaInesperada);
  });

  it("conta que não fecha com o número do banco é erro: a tela mostra as parcelas ao lado do resultado", () => {
    // Margem diferente de (vendido − custo) − (devolvido − custo devolvido) − (cancelado − custo cancelado).
    expect(() => lerMargem({ ...TRES_DIAS, totais: { ...TRES_DIAS.totais, margem: 12_151 } })).toThrow(RespostaInesperada);
    expect(() => lerMargem({ ...TRES_DIAS, periodos: [{ periodo: "2025-10-21", ...DIA_21, margem: 6_050 }] })).toThrow(RespostaInesperada);
    // Unidades e valor: com custo + sem custo é o total.
    expect(() => lerMargem({ ...VAZIO, totais: { ...COM_ITEM_SEM_CUSTO, itens: 4 } })).toThrow(RespostaInesperada);
    expect(() => lerMargem({ ...VAZIO, totais: { ...COM_ITEM_SEM_CUSTO, vendido: 165_701 } })).toThrow(RespostaInesperada);
    expect(lerMargem({ ...VAZIO, totais: COM_ITEM_SEM_CUSTO, lojas_com_custo: 2 }).totais.margem).toBe(46_000);
  });
});

describe("números da margem", () => {
  const de = (totais: Record<string, unknown>) => numerosDaMargem(lerMargem({ ...VAZIO, totais, lojas_com_custo: 1 }).totais);

  it("M1 e M3: a margem sobre a base líquida (o vendido com custo que continuou vendido)", () => {
    const n = de(TRES_DIAS.totais);
    // 31.500 − 7.850 − 7.900 = 15.750 de base; custo de 7.200 − 1.800 − 1.800 = 3.600; margem de 12.150.
    expect(n).toEqual({ margem: 12_150, base: 15_750, custoLiquido: 3_600, fracao: 12_150 / 15_750, cobertura: 1, temCusto: true });
    expect(n.base - n.custoLiquido).toBe(n.margem);
  });

  it("M2: a cobertura é o vendido com custo sobre o vendido; item sem custo não vira custo zero", () => {
    const n = de(COM_ITEM_SEM_CUSTO);
    expect(n.cobertura).toBe(157_800 / 165_700);
    // A margem só olha os itens com custo: 157.800 − 111.800.
    expect([n.margem, n.base, n.fracao]).toEqual([46_000, 157_800, 46_000 / 157_800]);
  });

  it("dia só com devolução: margem abaixo de zero, sem base e sem percentual", () => {
    const n = de(DIA_21);
    expect(n).toEqual({ margem: -6_050, base: -7_850, custoLiquido: -1_800, fracao: null, cobertura: null, temCusto: true });
  });

  it("venda abaixo do custo: a margem e o percentual ficam abaixo de zero", () => {
    const n = de({ ...ZERO, itens: 1, vendido: 5_000, itens_com_custo: 1, vendido_com_custo: 5_000, custo: 6_000, margem: -1_000 });
    expect([n.margem, n.fracao]).toEqual([-1_000, -0.2]);
  });

  it("só itens sem custo gravado: não há margem para mostrar (não é zero), e a cobertura é 0", () => {
    const n = de(SO_SEM_CUSTO);
    expect(n).toEqual({ margem: 0, base: 0, custoLiquido: 0, fracao: null, cobertura: 0, temCusto: false });
    expect(temCustoGravado(lerMargem({ ...VAZIO, totais: DIA_22 }).totais)).toBe(true);
    expect(temCustoGravado(lerMargem(VAZIO).totais)).toBe(false);
  });
});

describe("situação da margem no período", () => {
  const ler = (dado: Record<string, unknown>): MargemDoBanco => lerMargem(dado);

  it("ok: há item com custo gravado, vendido, devolvido ou cancelado", () => {
    expect(situacaoDaMargem(ler(TRES_DIAS))).toBe("ok");
    expect(situacaoDaMargem(ler({ ...VAZIO, totais: DIA_21, lojas_com_custo: 1 }))).toBe("ok");
    expect(situacaoDaMargem(ler({ ...VAZIO, totais: COM_ITEM_SEM_CUSTO, lojas_com_custo: 2, lojas_fora: 3 }))).toBe("ok");
  });

  it("sem_vendas: nenhum movimento em loja nenhuma", () => {
    expect(situacaoDaMargem(ler(VAZIO))).toBe("sem_vendas");
  });

  it("lojas_fora: houve movimento, mas só em loja em que quem pede não vê custo", () => {
    expect(situacaoDaMargem(ler({ ...VAZIO, lojas_fora: 2 }))).toBe("lojas_fora");
  });

  it("sem_custo: houve movimento nas lojas visíveis e nenhum item tem custo gravado", () => {
    expect(situacaoDaMargem(ler({ ...VAZIO, totais: SO_SEM_CUSTO, lojas_com_custo: 1 }))).toBe("sem_custo");
    expect(situacaoDaMargem(ler({ ...VAZIO, totais: SO_SEM_CUSTO, lojas_com_custo: 1, lojas_fora: 1 }))).toBe("sem_custo");
  });
});

describe("leitura da resposta de margem_itens", () => {
  const ITEM = {
    venda_id: "venda-2", numero: 1002, concluida_em: "2025-10-20T13:15:00+00:00", unidade_id: "loja-a", unidade: "Loja A", situacao: "concluida",
    item_id: "item-2", tipo: "acessorio", variante: "Capa (fictícia)", sku: "CAPA-01",
    quantidade: 2, preco_unitario: 7_900, desconto: 100, valor: 15_700, custo_unitario: 1_800, margem: 12_100, devolvidos: 1,
  };
  const SEM_CUSTO = { ...ITEM, item_id: "item-3", custo_unitario: null, margem: null, devolvidos: 0 };

  it("converte a página com os nomes do banco; custo e margem nulos, juntos, no item sem custo", () => {
    const pagina = lerItensDaMargem({ total: 7, itens: [ITEM, SEM_CUSTO] });
    expect(pagina.total).toBe(7);
    expect(pagina.itens[0]).toEqual({
      vendaId: "venda-2", numero: 1002, concluidaEm: "2025-10-20T13:15:00+00:00", unidadeId: "loja-a", unidade: "Loja A", situacao: "concluida",
      itemId: "item-2", tipo: "acessorio", variante: "Capa (fictícia)", sku: "CAPA-01",
      quantidade: 2, precoUnitario: 7_900, desconto: 100, valor: 15_700, custoUnitario: 1_800, margem: 12_100, devolvidos: 1,
    });
    expect([pagina.itens[1]?.custoUnitario, pagina.itens[1]?.margem]).toEqual([null, null]);
    expect(lerItensDaMargem({ total: 0, itens: [] })).toEqual({ total: 0, itens: [] });
  });

  it("nome que quem pede não lê mais chega nulo (loja inativada, produto sem variante); ausente é erro", () => {
    const item = lerItensDaMargem({ total: 1, itens: [{ ...ITEM, unidade: null, variante: null, sku: null }] }).itens[0];
    expect([item?.unidade, item?.variante, item?.sku]).toEqual([null, null, null]);
    for (const campo of ["unidade", "variante", "sku"]) expect(() => lerItensDaMargem({ total: 1, itens: [sem(ITEM, campo)] }), campo).toThrow(RespostaInesperada);
  });

  it("forma inesperada é erro, não linha em branco", () => {
    for (const dado of [null, [], "x"]) expect(() => lerItensDaMargem(dado)).toThrow(RespostaInesperada);
    expect(() => lerItensDaMargem({ itens: [] })).toThrow(ValorForaDoLimite);
    expect(() => lerItensDaMargem({ total: 1 })).toThrow(RespostaInesperada);
    for (const campo of ["venda_id", "unidade_id", "situacao", "item_id", "tipo", "concluida_em"]) {
      expect(() => lerItensDaMargem({ total: 1, itens: [sem(ITEM, campo)] }), campo).toThrow(RespostaInesperada);
      expect(() => lerItensDaMargem({ total: 1, itens: [{ ...ITEM, [campo]: "" }] }), campo).toThrow(RespostaInesperada);
    }
    for (const campo of ["numero", "quantidade", "preco_unitario", "desconto", "valor", "devolvidos", "custo_unitario", "margem"]) {
      expect(() => lerItensDaMargem({ total: 1, itens: [sem(ITEM, campo)] }), campo).toThrow(ValorForaDoLimite);
    }
    expect(() => lerItensDaMargem({ total: 1, itens: [{ ...ITEM, concluida_em: "ontem" }] })).toThrow(RespostaInesperada);
    // Custo sem margem (ou margem sem custo): a linha não fecha.
    expect(() => lerItensDaMargem({ total: 1, itens: [{ ...ITEM, margem: null }] })).toThrow(RespostaInesperada);
    expect(() => lerItensDaMargem({ total: 1, itens: [{ ...ITEM, custo_unitario: null }] })).toThrow(RespostaInesperada);
  });
});
