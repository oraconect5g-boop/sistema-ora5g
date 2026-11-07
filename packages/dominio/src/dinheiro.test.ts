import { describe, expect, it } from "vitest";

import { aplicarPercentual, centavos, formatarBRL, lerReais, pb } from "./dinheiro";

describe("dinheiro em centavos", () => {
  it.each([
    ["1.299,90", 129_990],
    ["1299,9", 129_990],
    ["1299.90", 129_990],
    ["R$ 79", 7_900],
    ["0,05", 5],
  ])("lê %s", (texto, esperado) => expect(lerReais(texto)).toBe(esperado));

  it.each(["", "abc", "1,999", "-5", "1.2.3,00"])("recusa %s", (texto) => expect(() => lerReais(texto)).toThrow());

  it("formata em reais no padrão brasileiro", () => {
    expect(formatarBRL(357_800)).toBe("R$ 3.578,00");
    expect(formatarBRL(5)).toBe("R$ 0,05");
  });

  it("não aceita centavos fracionados", () => {
    expect(() => centavos(10.5)).toThrow();
  });

  it("aplica percentual arredondando para baixo", () => {
    expect(aplicarPercentual(349_900, pb(10))).toBe(34_990);
    expect(aplicarPercentual(999, pb(3.5))).toBe(34);
  });
});
