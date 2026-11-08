import { expect, it } from "vitest";

import { avaliarDesconto } from "./desconto";
import { aplicarPercentual } from "./dinheiro";

// ORA-POS-005: confere a desigualdade da margem e o teto em 1000 entradas determinísticas.
it("mil casos de desconto mantêm teto e margem mínima", () => {
  for (let i = 1; i <= 1000; i++) {
    const preco = 10000 + i * 113;
    const custo = Math.floor(preco * (30 + (i % 35)) / 100);
    const taxa = (i % 12) * 100;
    const margem = 1000 + (i % 15) * 100;
    const teto = 1000;
    const entrada = {
      preco, custo, taxaMeioPagamento: taxa,
      politica: { tetoCategoria: teto, margemMinima: margem },
    };
    const desconto = avaliarDesconto(entrada, 1).maximoSemAprovacao;
    const liquido = preco - desconto;
    const taxaAplicada = aplicarPercentual(liquido, taxa);

    expect(desconto).toBeLessThanOrEqual(Math.floor(preco * teto / 10000));
    if (desconto > 0) {
      expect(BigInt(liquido - taxaAplicada - custo) * 10000n)
        .toBeGreaterThanOrEqual(BigInt(liquido) * BigInt(margem));
    }
  }
});
