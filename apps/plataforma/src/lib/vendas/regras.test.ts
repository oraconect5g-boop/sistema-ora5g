import { describe, expect, it } from "vitest";

import { identificadorDigitado } from "../catalogo/termos";
import { erroDaVenda, lerDevolucao, lerPagamentos, lerValor } from "./regras";

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
    // Meio inválido na entrada é recusado, não trocado por dinheiro (#52).
    expect(lerPagamentos(formulario({ pagamento_1_meio: "aiva", pagamento_1_valor: "1000", pagamento_1_entrada: "100", pagamento_1_meio_entrada: "payjoy" })))
      .toEqual({ ok: false, erro: "pagamento" });
  });

  it("entrada por Pix ou cartão exige o comprovante da entrada (#46)", () => {
    const linha = { pagamento_1_meio: "payjoy", pagamento_1_valor: "1.499,00", pagamento_1_entrada: "200,00", pagamento_1_meio_entrada: "pix_direto" };
    expect(lerPagamentos(formulario(linha))).toEqual({ ok: false, erro: "pagamento" });
    expect(lerPagamentos(formulario({ ...linha, pagamento_1_comprovante: "12" }))).toEqual({ ok: false, erro: "pagamento" });
    expect(lerPagamentos(formulario({ ...linha, pagamento_1_comprovante: "PIX-1234" }))).toEqual({
      ok: true, pagamentos: [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: "pix_direto", comprovante: "PIX-1234" }],
    });
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
    expect(erroDaVenda({ code: "OR013" })).toBe("connect");
    expect(erroDaVenda({ code: "OR015" })).toBe("nota_emitida");
    expect(erroDaVenda({ code: "toString" })).toBe("falha");
  });
  it("valor em reais e identificador", () => {
    expect(lerValor("R$ 1.299,90")).toBe(129_990);
    expect(lerValor("abc")).toBeNull();
    expect(identificadorDigitado("352099001800010")).toBe("352099001800010");
    expect(identificadorDigitado("Galaxy 15")).toBeNull();
  });
});

describe("vale-troca e devolução (adendo do ADR-004)", () => {
  const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });

  it("vale-troca: o número do vale vem do comprovante, normalizado; sem número não sai; entrada nunca é vale", () => {
    expect(lerPagamentos(formulario({ pagamento_1_meio: "vale_troca", pagamento_1_valor: "79,00", pagamento_1_comprovante: "vale 0012" })))
      .toEqual({ ok: true, pagamentos: [{ meio: "vale_troca", valor: 7_900, comprovante: "VT-12" }] });
    expect(lerPagamentos(formulario({ pagamento_1_meio: "vale_troca", pagamento_1_valor: "79,00" }))).toEqual({ ok: false, erro: "vale_numero" });
    expect(lerPagamentos(formulario({ pagamento_1_meio: "aiva", pagamento_1_valor: "1000,00", pagamento_1_entrada: "100,00", pagamento_1_meio_entrada: "vale_troca" })))
      .toEqual({ ok: false, erro: "pagamento" });
    expect(erroDaVenda({ code: "OR018" })).toBe("vale");
    expect(erroDaVenda({ code: "OR017" })).toBe("com_devolucao");
    expect(erroDaVenda({ code: "OR016" })).toBe("financiada");
  });

  it("devolução: quantidade até o que resta, condição nos itens físicos, reembolso em até 3 meios (vale incluso)", () => {
    const itens = [{ id: "a", restante: 1, fisico: true }, { id: "b", restante: 3, fisico: false }];
    expect(lerDevolucao(formulario({ devolver_a: "1", condicao_a: "seminovo", devolver_b: "2", reembolso_1_meio: "dinheiro", reembolso_1_valor: "10,00", reembolso_2_meio: "vale_troca", reembolso_2_valor: "5,00" }), itens))
      .toEqual({ ok: true, pedido: { itens: [{ item: "a", quantidade: 1, condicao: "seminovo" }, { item: "b", quantidade: 2 }], reembolsos: [{ meio: "dinheiro", valor: 1_000 }, { meio: "vale_troca", valor: 500 }] } });
    expect(lerDevolucao(formulario({ devolver_a: "2", condicao_a: "novo", reembolso_1_meio: "dinheiro", reembolso_1_valor: "1,00" }), itens)).toEqual({ ok: false, erro: "dados" });
    // Sem condição o item físico não volta (ORA-INV-010): a tela não sugere "novo".
    expect(lerDevolucao(formulario({ devolver_a: "1", reembolso_1_meio: "dinheiro", reembolso_1_valor: "1,00" }), itens)).toEqual({ ok: false, erro: "condicao" });
    expect(lerDevolucao(formulario({ devolver_a: "1", condicao_a: "", reembolso_1_meio: "dinheiro", reembolso_1_valor: "1,00" }), itens)).toEqual({ ok: false, erro: "condicao" });
    expect(lerDevolucao(formulario({ reembolso_1_meio: "dinheiro", reembolso_1_valor: "1,00" }), itens)).toEqual({ ok: false, erro: "sem_item" });
    expect(lerDevolucao(formulario({ devolver_b: "1", reembolso_1_meio: "payjoy", reembolso_1_valor: "1,00" }), itens)).toEqual({ ok: false, erro: "reembolso" });
    expect(lerDevolucao(formulario({ devolver_b: "1" }), itens)).toEqual({ ok: false, erro: "reembolso" });
  });

  it("aparelho e chip devolvidos levam o IMEI/ICCID conferido no balcão (#51)", () => {
    const aparelho = [{ id: "c", restante: 1, fisico: true, serializado: true }];
    const base = { devolver_c: "1", condicao_c: "novo", reembolso_1_meio: "dinheiro", reembolso_1_valor: "1.499,00" };
    expect(lerDevolucao(formulario(base), aparelho)).toEqual({ ok: false, erro: "conferencia" });
    expect(lerDevolucao(formulario({ ...base, identificador_c: "1234" }), aparelho)).toEqual({ ok: false, erro: "conferencia" });
    expect(lerDevolucao(formulario({ ...base, identificador_c: "35-209900-176148-7" }), aparelho)).toEqual({
      ok: true, pedido: { itens: [{ item: "c", quantidade: 1, condicao: "novo", identificador: "352099001761487" }], reembolsos: [{ meio: "dinheiro", valor: 149_900 }] },
    });
  });
});
