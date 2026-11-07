// Regressões dos achados REV-007 e REV-008 do Codex (07/11/2026): leitura de reais e
// validação de valores em tempo de execução em todos os pontos públicos.
import { describe, expect, it } from "vitest";

import { avaliarDesconto, limiteDeDesconto } from "./desconto";
import { aplicarPercentual, exigirCentavos, formatarBRL, lerReais, multiplicarCentavos, pb, somarCentavos } from "./dinheiro";
import { completarComDigitoVerificador } from "./identificadores";
import { conferirPagamentos } from "./pagamento";
import { producaoDaVenda, totaisDaVenda, validarItem, type ItemVenda } from "./venda";

describe("REV-007 — leitura de reais com ponto de milhar", () => {
  it.each([
    ["1.000", 100_000],
    ["1.000.000", 100_000_000],
    ["1.000,50", 100_050],
    ["R$ 2.199,00", 219_900],
    ["1.5", 150],
    ["1.50", 150],
    ["1.500", 150_000],
    ["0,05", 5],
    ["007", 700],
  ])("%s = %i centavos", (texto, esperado) => expect(lerReais(texto)).toBe(esperado));

  it.each(["1.0000", "1.00.000", "1,000.00", "1.000,5.0", "1,234", ",50", "1.", "R$", "١٢٣"])("recusa %s", (texto) => {
    expect(() => lerReais(texto)).toThrow(RangeError);
  });

  it("recusa valores que passam do inteiro seguro", () => {
    expect(() => lerReais("90071992547409,91")).toThrow(RangeError);
    expect(() => lerReais("99999999999999")).toThrow(RangeError);
    expect(lerReais("9999999999999,99")).toBe(999_999_999_999_999);
  });
});

describe("REV-008 — valores inválidos nunca passam", () => {
  it("centavos precisam ser inteiros seguros e não negativos", () => {
    for (const ruim of [0.5, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "10" as unknown as number]) {
      expect(() => exigirCentavos(ruim)).toThrow(RangeError);
    }
  });

  it("operações intermediárias não estouram em silêncio", () => {
    expect(() => somarCentavos(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
    expect(() => multiplicarCentavos(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
    expect(() => aplicarPercentual(Number.MAX_SAFE_INTEGER, pb(50))).toThrow(RangeError);
    expect(() => aplicarPercentual(1_000, 10_001)).toThrow(RangeError);
    expect(() => formatarBRL(Number.NaN)).toThrow(RangeError);
  });

  it("entrada fracionada, negativa ou maior que o financiado é recusada sem valores negativos", () => {
    for (const entrada of [0.5, -100, Number.NaN]) {
      const r = conferirPagamentos(100_000, [{ meio: "aiva", valor: 100_000, entrada }]);
      expect(r.valido).toBe(false);
      expect(r.erros.join(" ")).toMatch(/entrada inválida/);
    }
    const maior = conferirPagamentos(100_000, [{ meio: "aiva", valor: 100_000, entrada: 100_001 }]);
    expect(maior.valido).toBe(false);
    expect(maior.aReceberDeFinanceiras).toBe(0);
  });

  it("valor de pagamento fracionado é recusado e total inválido lança erro", () => {
    expect(conferirPagamentos(1_000, [{ meio: "pix_direto", valor: 999.5 }]).valido).toBe(false);
    expect(() => conferirPagamentos(Number.NaN, [{ meio: "pix_direto", valor: 1 }])).toThrow(RangeError);
    expect(conferirPagamentos(1_000, [{ meio: "inexistente" as "pix_direto", valor: 1_000 }]).valido).toBe(false);
  });

  it("item com desconto negativo, preço NaN ou valor gigante é inválido", () => {
    const base: ItemVenda = { tipo: "acessorio", descricao: "Cabo", quantidade: 1, precoUnitario: 1_000 };
    expect(validarItem({ ...base, desconto: -100 })).toContain("Desconto inválido");
    expect(validarItem({ ...base, desconto: 0.5 })).toContain("Desconto inválido");
    expect(validarItem({ ...base, precoUnitario: Number.NaN })).toContain("Preço inválido");
    expect(validarItem({ ...base, precoUnitario: -1 })).toContain("Preço inválido");
    expect(validarItem({ ...base, quantidade: 3, precoUnitario: Number.MAX_SAFE_INTEGER })).toContain("Valor do item grande demais");
    expect(validarItem({ ...base, tipo: "inexistente" as "acessorio" })).toEqual(["Tipo de item desconhecido"]);
  });

  it("totais e produção lançam erro com item inválido em vez de somar errado", () => {
    expect(() => totaisDaVenda([{ tipo: "acessorio", descricao: "X", quantidade: 1, precoUnitario: 1_000, desconto: -5 }])).toThrow(RangeError);
    expect(() => totaisDaVenda([{ tipo: "acessorio", descricao: "X", quantidade: 1, precoUnitario: Number.NaN }])).toThrow(RangeError);
    expect(() => producaoDaVenda([{ tipo: "acessorio", descricao: "X", quantidade: 0.5, precoUnitario: 1 }])).toThrow(RangeError);
  });

  it("limite de desconto valida preço, custo e percentuais", () => {
    const politica = { tetoCategoria: pb(10), margemMinima: pb(15) };
    expect(() => limiteDeDesconto({ preco: Number.NaN, custo: 1, taxaMeioPagamento: 0, politica })).toThrow(RangeError);
    expect(() => limiteDeDesconto({ preco: 1_000, custo: -1, taxaMeioPagamento: 0, politica })).toThrow(RangeError);
    expect(() => limiteDeDesconto({ preco: 1_000, custo: 1, taxaMeioPagamento: 20_000, politica })).toThrow(RangeError);
    expect(() => avaliarDesconto({ preco: 1_000, custo: 1, taxaMeioPagamento: 0, politica }, 0.5)).toThrow(RangeError);
  });

  it("a venda válida continua funcionando", () => {
    const imei = completarComDigitoVerificador("35209900176148");
    const itens: ItemVenda[] = [{ tipo: "aparelho", descricao: "X", quantidade: 1, precoUnitario: lerReais("1.999,00"), desconto: lerReais("100"), imei }];
    expect(validarItem(itens[0]!)).toEqual([]);
    expect(totaisDaVenda(itens).total).toBe(189_900);
  });
});
