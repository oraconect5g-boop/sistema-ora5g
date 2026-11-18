import { describe, expect, it } from "vitest";

import { conferirPagamentos, ehMeioDaEntrada, nomeDoPagamento, textoDasParcelas } from "./pagamento";

describe("pagamento misto", () => {
  it("dinheiro + Pix PicPay + cartão fecha o total", () => {
    const r = conferirPagamentos(357_800, [
      { meio: "dinheiro", valor: 50_000 },
      { meio: "pix_picpay", valor: 100_000 },
      { meio: "cartao_picpay", valor: 207_800 },
    ]);
    expect(r).toMatchObject({ valido: true, falta: 0, troco: 0, recebidoNaLoja: 357_800 });
  });

  it("aponta quanto falta", () => {
    const r = conferirPagamentos(10_000, [{ meio: "pix_direto", valor: 6_000 }]);
    expect(r).toMatchObject({ valido: false, falta: 4_000 });
  });

  it("dá troco só do dinheiro", () => {
    const r = conferirPagamentos(7_900, [{ meio: "dinheiro", valor: 10_000 }]);
    expect(r).toMatchObject({ valido: true, troco: 2_100, recebidoNaLoja: 7_900 });
  });

  it("recusa pagar a mais no cartão (não existe troco de cartão)", () => {
    const r = conferirPagamentos(7_900, [{ meio: "cartao_picpay", valor: 10_000 }]);
    expect(r.valido).toBe(false);
    expect(r.erros).toContain("Pagamento maior que o total sem dinheiro para dar troco");
  });

  it("vale-troca paga parte e a diferença sai em dinheiro; vale não dá troco", () => {
    expect(conferirPagamentos(149_900, [{ meio: "vale_troca", valor: 7_900 }, { meio: "dinheiro", valor: 142_000 }]))
      .toMatchObject({ valido: true, troco: 0, falta: 0 });
    const r = conferirPagamentos(7_900, [{ meio: "vale_troca", valor: 10_000 }]);
    expect(r.valido).toBe(false);
    expect(r.erros).toContain("Pagamento maior que o total sem dinheiro para dar troco");
  });
});

describe("venda financiada (DEC-U38)", () => {
  it("lança o preço do aparelho: entrada na loja e o restante a receber da financeira", () => {
    const r = conferirPagamentos(
      199_900,
      [{ meio: "payjoy", valor: 199_900, entrada: 40_000, parcelas: 12 }],
    );
    expect(r).toMatchObject({ valido: true, recebidoNaLoja: 40_000, aReceberDeFinanceiras: 159_900 });
  });

  it("e-mail sempre opcional, também na PayJoy (16/11: a regra de 12/11, #76, substitui a DEC-U30); Aiva igual", () => {
    // A prova do diagnóstico de 16/11 achava "PayJoy exige o e-mail do cliente"; agora a PayJoy sem e-mail fecha.
    expect(conferirPagamentos(100_000, [{ meio: "payjoy", valor: 100_000, entrada: 0, parcelas: 12 }])).toMatchObject({ valido: true, erros: [] });
    expect(conferirPagamentos(100_000, [{ meio: "aiva", valor: 100_000, entrada: 10_000, parcelas: 10 }]).valido).toBe(true);
  });

  it("entrada da financeira paga em outro meio também fecha a conta", () => {
    const r = conferirPagamentos(
      150_000,
      [
        { meio: "aiva", valor: 120_000, entrada: 0, parcelas: 10 },
        { meio: "pix_direto", valor: 30_000, entradaDoFinanciamento: true },
      ],
    );
    expect(r).toMatchObject({ valido: true, recebidoNaLoja: 30_000, aReceberDeFinanceiras: 120_000 });
  });

  it("entrada maior que o financiado é erro", () => {
    expect(conferirPagamentos(100_000, [{ meio: "aiva", valor: 100_000, entrada: 100_001, parcelas: 10 }]).valido).toBe(false);
  });
});

// PDV-c (pedido do proprietário de 18/11): as parcelas, a entrada à parte e o financiamento só do celular (a mesma regra
// da concluir_venda).
describe("PDV-c — as parcelas, a entrada à parte e o financiamento só do celular", () => {
  it("as parcelas: obrigatórias na PayJoy e na Aiva (1 a 48); no cartão, de 1 a 24; nos outros meios, nenhuma", () => {
    expect(conferirPagamentos(100_000, [{ meio: "payjoy", valor: 100_000 }]).erros).toEqual(["Financiamento PayJoy: informe as parcelas (de 1 a 48)"]);
    expect(conferirPagamentos(100_000, [{ meio: "aiva", valor: 100_000, parcelas: 49 }]).valido).toBe(false);
    expect(conferirPagamentos(100_000, [{ meio: "cartao_picpay", valor: 100_000, parcelas: 25 }]).erros).toEqual(["Cartão na maquininha PicPay: de 1 a 24 parcelas"]);
    expect(conferirPagamentos(100_000, [{ meio: "cartao_picpay", valor: 100_000, parcelas: 12 }]).valido).toBe(true);
    expect(conferirPagamentos(100_000, [{ meio: "dinheiro", valor: 100_000, parcelas: 2 }]).erros).toEqual(["Dinheiro não tem parcelas"]);
  });

  it("a entrada à parte: em dinheiro, Pix ou cartão, e só com a PayJoy ou a Aiva", () => {
    expect(conferirPagamentos(149_900, [{ meio: "payjoy", valor: 119_900, parcelas: 12 }, { meio: "dinheiro", valor: 30_000, entradaDoFinanciamento: true }]))
      .toMatchObject({ valido: true, recebidoNaLoja: 30_000, aReceberDeFinanceiras: 119_900 });
    expect(conferirPagamentos(30_000, [{ meio: "dinheiro", valor: 30_000, entradaDoFinanciamento: true }]).erros).toEqual(["A entrada só existe numa venda com a PayJoy ou a Aiva"]);
    expect(conferirPagamentos(149_900, [{ meio: "payjoy", valor: 149_900, parcelas: 12, entradaDoFinanciamento: true }]).valido).toBe(false);
  });

  it("o financiamento só do celular: acima do valor dos celulares, ou sem celular, não confere", () => {
    const venda = [{ meio: "aiva" as const, valor: 149_900, parcelas: 10 }, { meio: "dinheiro" as const, valor: 1_000 }];
    expect(conferirPagamentos(150_900, venda, { valorDosCelulares: 149_900 }).valido).toBe(true);
    expect(conferirPagamentos(150_900, venda, { valorDosCelulares: 140_000 }).erros)
      .toEqual(["A PayJoy e a Aiva financiam só o valor do celular: o chip, os acessórios e os serviços são pagos à parte"]);
    expect(conferirPagamentos(150_900, venda, { valorDosCelulares: 0 }).erros).toEqual(["A PayJoy e a Aiva financiam só o celular: esta venda não tem celular"]);
  });
});

describe("PDV-c — o nome do pagamento e as parcelas no comprovante", () => {
  it("a PayJoy e a Aiva aparecem como o recebimento via a financeira; a entrada, à parte, com o meio", () => {
    expect(nomeDoPagamento({ meio: "payjoy" })).toBe("Recebimento via PayJoy");
    expect(nomeDoPagamento({ meio: "aiva", entradaDoFinanciamento: true })).toBe("Recebimento via Aiva");
    expect(nomeDoPagamento({ meio: "dinheiro", entradaDoFinanciamento: true })).toBe("Entrada do financiamento (Dinheiro)");
    expect(nomeDoPagamento({ meio: "pix_picpay", entradaDoFinanciamento: null })).toBe("Pix na maquininha PicPay");
    expect(nomeDoPagamento({ meio: "meio_que_nao_existe" })).toBe("meio_que_nao_existe");
  });
  it("as parcelas: em Nx; 1x só no meio que parcela; nada no resto ou em número inválido", () => {
    expect(textoDasParcelas("payjoy", 12)).toBe(" em 12x");
    expect(textoDasParcelas("cartao_picpay", 1)).toBe(" (1x)");
    expect(textoDasParcelas("dinheiro", 1)).toBe("");
    expect(textoDasParcelas("payjoy", null)).toBe("");
    expect(textoDasParcelas("payjoy", 0)).toBe("");
    expect(textoDasParcelas("payjoy", 2.5)).toBe("");
  });
  it("a entrada é paga em dinheiro, Pix ou cartão; nunca na financeira, no vale ou no link", () => {
    expect(["dinheiro", "pix_direto", "pix_picpay", "cartao_picpay", "cartao_pagseguro"].every((m) => ehMeioDaEntrada(m as never))).toBe(true);
    expect(["payjoy", "aiva", "vale_troca", "link_pagamento"].some((m) => ehMeioDaEntrada(m as never))).toBe(false);
  });
});
