// Contrato dos números do financeiro real (#65). A resposta abaixo tem o formato exato de
// public.financeiro_painel para o mesmo dia provado no banco (packages/banco/src/financeiro-painel.test.ts):
// três vendas, devolução parcial em dinheiro, pagamento misto, PayJoy com entrada e um Pix cancelado.
import { describe, expect, it } from "vitest";

import { chavesDaJanela, conciliacaoDoPainel, janelasDoPeriodo, lerPainel, MEIOS_CONCILIAVEIS, RespostaInesperada, resumoDoPainel, seriesDoPainel, variacaoFinanceira } from "./painel";

const RESPOSTA = {
  periodos: [
    { periodo: "2026-11-10", vendas: 4, vendido: 181_500, cancelamentos: 1, cancelado: 7_900, devolucoes: 1, devolvido: 7_900 },
  ],
  pagamentos: [
    { meio: "dinheiro", situacao: "confirmado", meio_entrada: null, quantidade: 2, valor: 20_000, entrada: 0, troco: 2_100 },
    { meio: "payjoy", situacao: "confirmado", meio_entrada: "dinheiro", quantidade: 1, valor: 149_900, entrada: 20_000, troco: 0 },
    { meio: "pix_direto", situacao: "estorno_pendente", meio_entrada: null, quantidade: 1, valor: 7_900, entrada: 0, troco: 0 },
    { meio: "pix_picpay", situacao: "confirmado", meio_entrada: null, quantidade: 1, valor: 5_800, entrada: 0, troco: 0 },
    { meio: "vale_troca", situacao: "confirmado", meio_entrada: null, quantidade: 1, valor: 3_000, entrada: 0, troco: 0 },
  ],
  reembolsos: [{ meio: "dinheiro", quantidade: 1, valor: 7_900 }],
  estornos: [{ situacao: "pendente", quantidade: 1, valor: 7_900 }],
  a_receber: [{ devedor: "payjoy", situacao: "aberta", quantidade: 1, valor: 129_900 }],
  movimentos: [
    { periodo: "2026-11-10", tipo: "fundo", meio: "dinheiro", quantidade: 2, valor: 20_000 },
    { periodo: "2026-11-10", tipo: "recebimento", meio: "dinheiro", quantidade: 3, valor: 40_000 },
    { periodo: "2026-11-10", tipo: "recebimento", meio: "pix_picpay", quantidade: 1, valor: 5_800 },
    { periodo: "2026-11-10", tipo: "troco", meio: "dinheiro", quantidade: 1, valor: -2_100 },
    { periodo: "2026-11-10", tipo: "estorno", meio: "dinheiro", quantidade: 1, valor: -7_900 },
  ],
  caixas: { abertos_agora: 2, fechados: 1, conferidos: 0, com_diferenca: 1, diferenca: -500, diferenca_absoluta: 500 },
};

describe("leitura da resposta do banco", () => {
  it("converte cada fato; forma inesperada é erro, não zero", () => {
    const p = lerPainel(RESPOSTA);
    // Resposta sem os números da conciliação (banco sem a migration do G2b): a conciliação fica nula.
    expect(p.pagamentos[1]).toEqual({ meio: "payjoy", situacao: "confirmado", meioEntrada: "dinheiro", quantidade: 1, valor: 149_900, entrada: 20_000, troco: 0, conciliacao: null });
    expect(p.caixas.diferencaAbsoluta).toBe(500);
    expect(() => lerPainel(null)).toThrow(RespostaInesperada);
    expect(() => lerPainel({ ...RESPOSTA, pagamentos: "x" })).toThrow(RespostaInesperada);
    expect(() => lerPainel({ ...RESPOSTA, periodos: [{ periodo: "2026-11-10", vendido: 1.5 }] })).toThrow();
  });
});

describe("resumo: cada fato separado, nada contado duas vezes", () => {
  const r = resumoDoPainel(lerPainel(RESPOSTA));

  it("vendido, cancelado e devolvido, cada um na sua data; o líquido abate uma vez", () => {
    expect([r.vendas, r.vendido, r.cancelado, r.devolvido, r.liquido]).toEqual([4, 181_500, 7_900, 7_900, 165_700]);
  });

  it("recebido na loja: dinheiro menos o troco, Pix e a entrada do financiamento; sem a parte financiada nem o vale", () => {
    expect(r.meios).toEqual([
      { meio: "dinheiro", nome: "Dinheiro", valor: 20_000 - 2_100 + 20_000, quantidade: 2, entradas: 20_000 },
      { meio: "pix_picpay", nome: "Pix na maquininha PicPay", valor: 5_800, quantidade: 1, entradas: 0 },
    ]);
    expect(r.recebido).toBe(43_700);
    expect(r.entradasDeFinanciamento).toBe(20_000);
    expect(r.financiado).toEqual([{ devedor: "payjoy", nome: "Financiamento PayJoy", valor: 129_900 }]);
    expect(r.aReceberAberto).toBe(129_900);
    expect(r.valeUsado).toBe(3_000);
  });

  it("pagamento de venda cancelada sai do recebido e aparece como desfeito; estorno pendente não é reembolso feito", () => {
    expect(r.pagamentosDesfeitos).toEqual({ quantidade: 1, valor: 7_900 });
    expect(r.estornoPendente).toEqual({ quantidade: 1, valor: 7_900 });
    expect(r.estornoConfirmado).toEqual({ quantidade: 0, valor: 0 });
  });

  it("gaveta: só dinheiro, por tipo; fundo não vira receita e Pix não entra na gaveta", () => {
    expect(r.gaveta).toEqual([
      { tipo: "fundo", nome: "Fundo de abertura", valor: 20_000 },
      { tipo: "recebimento", nome: "Recebimentos em dinheiro", valor: 40_000 },
      { tipo: "troco", nome: "Troco", valor: -2_100 },
      { tipo: "estorno", nome: "Estornos e reembolsos", valor: -7_900 },
    ]);
    expect(r.saldoDaGaveta).toBe(50_000);
    expect(r.reembolsos[0]?.nome).toBe("Dinheiro (sai da gaveta)");
  });

  it("sem fatos: tudo zero e listas vazias", () => {
    const vazio = resumoDoPainel(lerPainel({ ...RESPOSTA, periodos: [], pagamentos: [], reembolsos: [], estornos: [], a_receber: [], movimentos: [] }));
    expect([vazio.vendido, vazio.recebido, vazio.meios.length, vazio.gaveta.length]).toEqual([0, 0, 0, 0]);
  });
});

describe("comparação e janelas no horário de São Paulo", () => {
  it("sem nada no período anterior não há variação (não é +100% nem infinito)", () => {
    expect(variacaoFinanceira(100, 0)).toBeNull();
    expect(variacaoFinanceira(150, 100)).toBe(0.5);
  });

  it("hoje vai da meia-noite de São Paulo até agora; o anterior é ontem até a mesma hora", () => {
    const agora = new Date("2026-11-10T22:30:00Z"); // 19h30 em SP
    const j = janelasDoPeriodo("hoje", agora);
    expect(j.atual.inicio.toISOString()).toBe("2026-11-10T03:00:00.000Z");
    expect(j.anterior).toEqual({ inicio: new Date("2026-11-09T03:00:00Z"), fim: new Date("2026-11-09T22:30:00Z") });
    expect(j.porHora).toBe(true);
  });

  it("7 dias: seis dias inteiros e hoje; o anterior são os 7 dias antes, na mesma hora", () => {
    const agora = new Date("2026-11-11T01:30:00Z"); // 10/11, 22h30 em SP: o dia ainda é 10
    const j = janelasDoPeriodo("7", agora);
    expect(j.atual.inicio.toISOString()).toBe("2026-11-04T03:00:00.000Z");
    expect(j.anterior.inicio.toISOString()).toBe("2026-10-28T03:00:00.000Z");
    expect(chavesDaJanela(j.atual, false)).toEqual(["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]);
  });

  it("por hora: das 7h (ou antes, se houve fato) até a hora atual", () => {
    const j = janelasDoPeriodo("hoje", new Date("2026-11-10T13:10:00Z")); // 10h10 em SP
    expect(chavesDaJanela(j.atual, true)).toEqual(["2026-11-10T07", "2026-11-10T08", "2026-11-10T09", "2026-11-10T10"]);
    expect(chavesDaJanela(j.atual, true, ["2026-11-10T05"])[0]).toBe("2026-11-10T05");
  });

  it("as séries preenchem com zero os dias sem fato e separam entradas e saídas da gaveta", () => {
    const p = lerPainel(RESPOSTA);
    const j = janelasDoPeriodo("7", new Date("2026-11-10T22:30:00Z"));
    const s = seriesDoPainel(p, j.atual, false);
    expect(s.vendas).toHaveLength(7);
    expect(s.vendas.at(-1)).toEqual({ chave: "2026-11-10", rotulo: "10/11", vendido: 181_500, desfeito: 15_800, vendas: 4 });
    expect(s.vendas[0]).toEqual({ chave: "2026-11-04", rotulo: "04/11", vendido: 0, desfeito: 0, vendas: 0 });
    expect(s.gaveta.at(-1)).toEqual({ chave: "2026-11-10", rotulo: "10/11", entrada: 60_000, saida: 10_000 });
  });
});

// ---------------------------------------------------------------------------------------------
// Lote G2b: situação da conciliação por meio (P5). Os mesmos pagamentos, agora com os três números da
// conciliação manual que public.financeiro_painel devolve desde a migration financeiro_conciliacao.
// ---------------------------------------------------------------------------------------------
describe("conciliação de cartão e Pix (G2b, P5)", () => {
  const SEM = { conciliados: 0, conciliado: 0, liquido: 0 };
  // Dois cartões PicPay (um conciliado: caiu R$ 76,50 pelos R$ 79,00), o Pix PicPay a conciliar, a PayJoy
  // com R$ 200,00 de entrada no Pix PicPay e o Pix direto de uma venda cancelada (fora: não está confirmado).
  const COM_CONCILIACAO = {
    ...RESPOSTA,
    pagamentos: [
      { meio: "cartao_picpay", situacao: "confirmado", meio_entrada: null, quantidade: 2, valor: 15_800, entrada: 0, troco: 0, conciliados: 1, conciliado: 7_900, liquido: 7_650 },
      { meio: "dinheiro", situacao: "confirmado", meio_entrada: null, quantidade: 2, valor: 20_000, entrada: 0, troco: 2_100, ...SEM },
      { meio: "payjoy", situacao: "confirmado", meio_entrada: "pix_picpay", quantidade: 1, valor: 149_900, entrada: 20_000, troco: 0, ...SEM },
      { meio: "pix_direto", situacao: "estorno_pendente", meio_entrada: null, quantidade: 1, valor: 7_900, entrada: 0, troco: 0, conciliados: 1, conciliado: 7_900, liquido: 7_900 },
      { meio: "pix_picpay", situacao: "confirmado", meio_entrada: null, quantidade: 1, valor: 5_800, entrada: 0, troco: 0, ...SEM },
    ],
  };

  it("por meio: conciliado, a conciliar, líquido e a diferença observada; o total soma os meios", () => {
    const c = conciliacaoDoPainel(lerPainel(COM_CONCILIACAO));
    expect(c?.meios).toEqual([
      { meio: "cartao_picpay", nome: "Cartão na maquininha PicPay", quantidade: 2, valor: 15_800, conciliados: 1, conciliado: 7_900, liquido: 7_650, aConciliar: 7_900, pagamentosAConciliar: 1, diferenca: 250 },
      { meio: "pix_picpay", nome: "Pix na maquininha PicPay", quantidade: 1, valor: 5_800, conciliados: 0, conciliado: 0, liquido: 0, aConciliar: 5_800, pagamentosAConciliar: 1, diferenca: 0 },
    ]);
    expect(c?.total).toEqual({ quantidade: 3, valor: 21_600, conciliados: 1, conciliado: 7_900, liquido: 7_650, aConciliar: 13_700, pagamentosAConciliar: 2, diferenca: 250 });
    // A entrada da PayJoy paga no Pix PicPay está no recebido do Pix, mas não se concilia: a tela diz quanto é.
    expect(c?.entradasForaDaConciliacao).toBe(20_000);
    expect(resumoDoPainel(lerPainel(COM_CONCILIACAO)).meios.find((m) => m.meio === "pix_picpay")?.valor).toBe(25_800);
  });

  it("dinheiro, financeira e vale não entram, nem pagamento desfeito; sem cartão nem Pix, a lista fica vazia", () => {
    const c = conciliacaoDoPainel(lerPainel(COM_CONCILIACAO));
    expect(c?.meios.map((m) => m.meio)).not.toContain("pix_direto");
    const soDinheiro = { ...COM_CONCILIACAO, pagamentos: [COM_CONCILIACAO.pagamentos[1]] };
    expect(conciliacaoDoPainel(lerPainel(soDinheiro))).toEqual({ meios: [], total: { quantidade: 0, valor: 0, conciliados: 0, conciliado: 0, liquido: 0, aConciliar: 0, pagamentosAConciliar: 0, diferenca: 0 }, entradasForaDaConciliacao: 0 });
  });

  it("banco sem a migration do G2b: a conciliação é nula (indisponível), e o resto do resumo continua", () => {
    const r = resumoDoPainel(lerPainel(RESPOSTA));
    expect(r.conciliacao).toBeNull();
    expect(r.recebido).toBe(resumoDoPainel(lerPainel({ ...RESPOSTA, pagamentos: RESPOSTA.pagamentos.map((x) => ({ ...x, ...SEM })) })).recebido);
  });

  it("número da conciliação pela metade ou que não fecha é falha, não zero", () => {
    const com = (mudanca: Record<string, unknown>) => ({ ...COM_CONCILIACAO, pagamentos: [{ ...COM_CONCILIACAO.pagamentos[0], ...mudanca }] });
    const semLiquido: Record<string, unknown> = { ...COM_CONCILIACAO.pagamentos[0] };
    delete semLiquido.liquido;
    expect(() => lerPainel({ ...COM_CONCILIACAO, pagamentos: [semLiquido] })).toThrow(RespostaInesperada);
    expect(() => lerPainel(com({ liquido: 8_000 }))).toThrow(RespostaInesperada);
    expect(() => lerPainel(com({ conciliado: 16_000, liquido: 0 }))).toThrow(RespostaInesperada);
    expect(() => lerPainel(com({ conciliados: 3 }))).toThrow(RespostaInesperada);
    expect(lerPainel(com({})).pagamentos[0]?.conciliacao).toEqual({ conciliados: 1, conciliado: 7_900, liquido: 7_650 });
  });

  it("os meios que se conciliam são os mesmos do banco (privado.meio_liquidavel)", () => {
    expect([...MEIOS_CONCILIAVEIS].sort()).toEqual(["cartao_pagseguro", "cartao_picpay", "pix_direto", "pix_picpay"]);
  });
});
