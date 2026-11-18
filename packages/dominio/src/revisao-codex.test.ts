// Regressões dos achados REV-007 e REV-008 do Codex (07/11/2026): leitura de reais e
// validação de valores em tempo de execução em todos os pontos públicos.
import { describe, expect, it } from "vitest";

import { avaliarDesconto, limiteDeDesconto, type EntradaDesconto } from "./desconto";
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
      const r = conferirPagamentos(100_000, [{ meio: "aiva", valor: 100_000, entrada, parcelas: 10 }]);
      expect(r.valido).toBe(false);
      expect(r.erros.join(" ")).toMatch(/entrada inválida/);
    }
    const maior = conferirPagamentos(100_000, [{ meio: "aiva", valor: 100_000, entrada: 100_001, parcelas: 10 }]);
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

// Resíduo da #10 apontado na conferência do Codex (07/11/2026): em valores altos, custo × 10000
// passa de 2^53 e a divisão em ponto flutuante arredondava ANTES do Math.ceil, liberando
// 1 centavo a mais de desconto. Centavos e pontos-base; os valores cabem no numeric(14,2).
describe("REV-008 (resíduo) — aritmética inteira exata em valores altos", () => {
  const casoDoCodex: EntradaDesconto = {
    preco: 2_000_000_000_012,
    custo: 1_999_800_000_001,
    taxaMeioPagamento: 0,
    politica: { tetoCategoria: 1, margemMinima: 1 },
  };
  // Margem mínima mantida com o desconto d: (preço − d) × fator líquido >= custo × 10000.
  const mantemMargem = (e: EntradaDesconto, d: number) =>
    (BigInt(e.preco) - BigInt(d)) * BigInt(10_000 - e.taxaMeioPagamento - e.politica.margemMinima) >= BigInt(e.custo) * 10_000n;

  it("no caso do Codex o teto exato é 10 centavos, não 11", () => {
    expect(limiteDeDesconto(casoDoCodex)).toEqual({ maximoSemAprovacao: 10, motivoDoLimite: "margem_minima" });
    expect(mantemMargem(casoDoCodex, 10)).toBe(true);
    expect(mantemMargem(casoDoCodex, 11)).toBe(false);
  });

  it("no limite exato o vendedor aplica sozinho; 1 centavo acima pede aprovação", () => {
    expect(avaliarDesconto(casoDoCodex, 10).situacao).toBe("dentro_do_limite");
    expect(avaliarDesconto(casoDoCodex, 11).situacao).toBe("precisa_aprovacao");
  });

  // Família de casos difíceis: custo × 10000 deixa resto 1 na divisão pelo fator líquido, então o
  // preço mínimo exato é o quociente + 1. No ponto flutuante a fração 1/fator sumia (resultado 11).
  it.each([9_999, 9_997, 9_973, 8_001, 7_001])("fator líquido %i com resto 1: o limite continua exato", (fator) => {
    let inverso = 1;
    while ((10_000 * inverso) % fator !== 1) inverso++;
    const custo = inverso + fator * 300_000_007;
    const precoMinimo = (BigInt(custo) * 10_000n - 1n) / BigInt(fator) + 1n;
    const entrada: EntradaDesconto = {
      preco: Number(precoMinimo) + 10,
      custo,
      taxaMeioPagamento: 0,
      politica: { tetoCategoria: 1, margemMinima: 10_000 - fator },
    };
    expect(limiteDeDesconto(entrada)).toEqual({ maximoSemAprovacao: 10, motivoDoLimite: "margem_minima" });
  });

  it("em 2.000 casos de valor alto, o limite é sempre o maior desconto que mantém a margem", () => {
    const sortear = geradorDeterministico(20_261_107);
    const falhas: string[] = [];
    for (let i = 0; i < 2_000; i++) {
      const preco = sortear(1_000_000_000_000, 9_000_000_000_000);
      const entrada: EntradaDesconto = {
        preco,
        custo: sortear(Math.floor(preco / 2), preco),
        taxaMeioPagamento: sortear(0, 900),
        politica: { tetoCategoria: sortear(0, 1_000), margemMinima: sortear(0, 3_000) },
      };
      const { maximoSemAprovacao: d, motivoDoLimite } = limiteDeDesconto(entrada);
      const certo =
        motivoDoLimite === "margem_minima"
          ? mantemMargem(entrada, d) && !mantemMargem(entrada, d + 1)
          : motivoDoLimite === "teto_da_categoria"
            ? d === aplicarPercentual(entrada.preco, entrada.politica.tetoCategoria) && (d === 0 || mantemMargem(entrada, d))
            : d === 0 && !mantemMargem(entrada, 1);
      if (!certo) falhas.push(JSON.stringify({ entrada, d, motivoDoLimite }));
    }
    expect(falhas).toEqual([]);
  });

  it("a margem resultante é arredondada para baixo sem o erro do ponto flutuante", () => {
    // lucro 3.333.000.003.332 × 10000 / preço 10.000.000.009.997 = 3332,99999999999990...
    // O ponto flutuante chegava a 3333 (33,33%); o certo é 3332 (33,32%).
    const entrada: EntradaDesconto = { preco: 10_000_000_009_997, custo: 6_667_000_006_665, taxaMeioPagamento: 0, politica: { tetoCategoria: 1, margemMinima: 0 } };
    expect(avaliarDesconto(entrada, 0).margemResultante).toBe(3_332);
  });

  it("margem negativa enorme continua um inteiro seguro", () => {
    const entrada: EntradaDesconto = { preco: Number.MAX_SAFE_INTEGER, custo: Number.MAX_SAFE_INTEGER, taxaMeioPagamento: 0, politica: { tetoCategoria: 1, margemMinima: 0 } };
    const r = avaliarDesconto(entrada, Number.MAX_SAFE_INTEGER - 1);
    expect(r.situacao).toBe("abaixo_do_custo");
    expect(r.margemResultante).toBe(Number.MIN_SAFE_INTEGER);
  });
});

// Sorteio reproduzível (mulberry32): mesma semente, mesmos casos em qualquer máquina.
function geradorDeterministico(semente: number) {
  let estado = semente >>> 0;
  const proximo = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  // 53 bits de sorteio: cobre também os algarismos finais dos valores altos.
  return (minimo: number, maximo: number) => minimo + ((Math.floor(proximo() * 2 ** 32) * 2 ** 21 + Math.floor(proximo() * 2 ** 21)) % (maximo - minimo + 1));
}
