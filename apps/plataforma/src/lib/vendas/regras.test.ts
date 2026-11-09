import { describe, expect, it } from "vitest";

import { erroDaVenda, lerPagamentos, lerValor, pareceIdentificador } from "./regras";

const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });

describe("formulário de pagamento", () => {
  it("lê dinheiro, cartão com comprovante e ignora linha vazia", () => {
    expect(lerPagamentos(formulario({
      pagamento_1_meio: "dinheiro", pagamento_1_valor: "50,00",
      pagamento_2_meio: "cartao_picpay", pagamento_2_valor: "1.249,90", pagamento_2_comprovante: " 123456 ",
      pagamento_3_meio: "pix_direto", pagamento_3_valor: "",
    }))).toEqual({ ok: true, pagamentos: [{ meio: "dinheiro", valor: 5_000 }, { meio: "cartao_picpay", valor: 124_990, comprovante: "123456" }] });
  });

  it("financiamento leva a entrada e o meio dela (dinheiro se não vier)", () => {
    expect(lerPagamentos(formulario({ pagamento_1_meio: "payjoy", pagamento_1_valor: "1.499,00", pagamento_1_entrada: "300" }))).toEqual({
      ok: true, pagamentos: [{ meio: "payjoy", valor: 149_900, entrada: 30_000, meio_entrada: "dinheiro" }],
    });
    expect(lerPagamentos(formulario({ pagamento_1_meio: "aiva", pagamento_1_valor: "1000", pagamento_1_entrada: "100", pagamento_1_meio_entrada: "payjoy" })))
      .toMatchObject({ ok: true, pagamentos: [{ meio_entrada: "dinheiro" }] });
  });

  it("recusa meio desconhecido, valor inválido e formulário sem pagamento", () => {
    expect(lerPagamentos(formulario({ pagamento_1_meio: "__proto__", pagamento_1_valor: "10" }))).toEqual({ ok: false, erro: "pagamento" });
    expect(lerPagamentos(formulario({ pagamento_1_meio: "dinheiro", pagamento_1_valor: "dez reais" }))).toEqual({ ok: false, erro: "valor" });
    expect(lerPagamentos(formulario({}))).toEqual({ ok: false, erro: "pagamento" });
  });
});

describe("erros e busca", () => {
  it("código do banco vira código da tela; desconhecido vira falha", () => {
    expect(erroDaVenda({ code: "OR010" })).toBe("aprovacao");
    expect(erroDaVenda({ code: "OR008" })).toBe("sem_caixa");
    expect(erroDaVenda({ code: "toString" })).toBe("falha");
  });
  it("valor em reais e identificador", () => {
    expect(lerValor("R$ 1.299,90")).toBe(129_990);
    expect(lerValor("abc")).toBeNull();
    expect(pareceIdentificador("352099001800010")).toBe(true);
    expect(pareceIdentificador("Galaxy 15")).toBe(false);
  });
});
