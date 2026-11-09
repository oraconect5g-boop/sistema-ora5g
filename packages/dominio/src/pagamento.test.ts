import { describe, expect, it } from "vitest";

import { conferirPagamentos } from "./pagamento";

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
      [{ meio: "payjoy", valor: 199_900, entrada: 40_000 }],
      { email: "cliente@exemplo.invalid" },
    );
    expect(r).toMatchObject({ valido: true, recebidoNaLoja: 40_000, aReceberDeFinanceiras: 159_900 });
  });

  it("PayJoy sem e-mail do cliente é recusada (DEC-U30); Aiva não exige", () => {
    expect(conferirPagamentos(100_000, [{ meio: "payjoy", valor: 100_000, entrada: 0 }]).erros).toContain(
      "PayJoy exige o e-mail do cliente",
    );
    expect(conferirPagamentos(100_000, [{ meio: "aiva", valor: 100_000, entrada: 10_000 }]).valido).toBe(true);
  });

  it("entrada da financeira paga em outro meio também fecha a conta", () => {
    const r = conferirPagamentos(
      150_000,
      [
        { meio: "aiva", valor: 120_000, entrada: 0 },
        { meio: "pix_direto", valor: 30_000 },
      ],
    );
    expect(r).toMatchObject({ valido: true, recebidoNaLoja: 30_000, aReceberDeFinanceiras: 120_000 });
  });

  it("entrada maior que o financiado é erro", () => {
    expect(conferirPagamentos(100_000, [{ meio: "aiva", valor: 100_000, entrada: 100_001 }]).valido).toBe(false);
  });
});
