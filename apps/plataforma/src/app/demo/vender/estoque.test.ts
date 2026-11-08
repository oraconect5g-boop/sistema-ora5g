import { describe, expect, it } from "vitest";

import { avisoDeLimite, conferirQuantidade, podeAumentar } from "./estoque";

// REV-019 / #18: zero, uma unidade, limite exato e acima do limite.
describe("quantidade de acessório contra o saldo da loja", () => {
  it("saldo zero: nenhuma quantidade é aceita e não dá para aumentar", () => {
    expect(conferirQuantidade(1, 0)).toBe("Sem estoque deste acessório nesta loja");
    expect(podeAumentar(1, 0)).toBe(false);
    expect(avisoDeLimite("Cabo", 0)).toBe("Cabo: sem estoque nesta loja.");
  });

  it("uma unidade em estoque: aceita 1, recusa 2 e trava o botão de aumentar", () => {
    expect(conferirQuantidade(1, 1)).toBeNull();
    expect(conferirQuantidade(2, 1)).toBe("Só há 1 unidade em estoque nesta loja");
    expect(podeAumentar(1, 1)).toBe(false);
    expect(avisoDeLimite("Cabo", 1)).toMatch(/\(1 unidade\)/);
  });

  it("limite exato é aceito; acima do limite é recusado", () => {
    expect(conferirQuantidade(3, 3)).toBeNull();
    expect(podeAumentar(2, 3)).toBe(true);
    expect(podeAumentar(3, 3)).toBe(false);
    expect(conferirQuantidade(4, 3)).toBe("Só há 3 unidades em estoque nesta loja");
  });

  it("quantidade ou saldo fora do formato nunca passam", () => {
    for (const quantidade of [0, -1, 1.5, Number.NaN]) expect(conferirQuantidade(quantidade, 10), String(quantidade)).toBe("Quantidade inválida");
    expect(conferirQuantidade(1, Number.NaN)).toBe("Sem estoque deste acessório nesta loja");
    expect(podeAumentar(1, Number.NaN)).toBe(false);
  });
});
