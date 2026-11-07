import { describe, expect, it } from "vitest";

import { avaliarDesconto, limiteDeDesconto, type EntradaDesconto } from "./desconto";
import { pb } from "./dinheiro";

// Parâmetros de EXEMPLO: os reais (margem mínima e teto por categoria) ainda serão definidos.
const politica = { tetoCategoria: pb(10), margemMinima: pb(15) };

describe("limite de desconto por margem", () => {
  it("num cabo barato com margem alta, vale o teto da categoria (10%)", () => {
    const cabo: EntradaDesconto = { preco: 4_990, custo: 1_200, taxaMeioPagamento: 0, politica };
    expect(limiteDeDesconto(cabo)).toEqual({ maximoSemAprovacao: 499, motivoDoLimite: "teto_da_categoria" });
  });

  it("num aparelho caro com margem apertada, a margem mínima limita antes do teto", () => {
    const aparelho: EntradaDesconto = { preco: 349_900, custo: 280_000, taxaMeioPagamento: pb(3), politica };
    const r = limiteDeDesconto(aparelho);
    expect(r.motivoDoLimite).toBe("margem_minima");
    // preço mínimo = 280000 / (1 - 0,03 - 0,15) = 341463,42... -> 341464
    expect(r.maximoSemAprovacao).toBe(349_900 - 341_464);
  });

  it("taxa do meio de pagamento consome margem: crédito parcelado reduz o limite", () => {
    const base: EntradaDesconto = { preco: 199_900, custo: 150_000, taxaMeioPagamento: 0, politica };
    const noCredito = { ...base, taxaMeioPagamento: pb(8) };
    expect(limiteDeDesconto(noCredito).maximoSemAprovacao).toBeLessThan(limiteDeDesconto(base).maximoSemAprovacao);
  });

  it("sem margem nenhuma, nada é permitido sem aprovação", () => {
    const semMargem: EntradaDesconto = { preco: 100_000, custo: 100_000, taxaMeioPagamento: 0, politica };
    expect(limiteDeDesconto(semMargem)).toEqual({ maximoSemAprovacao: 0, motivoDoLimite: "sem_margem" });
  });
});

describe("avaliação do desconto pedido", () => {
  const aparelho: EntradaDesconto = { preco: 349_900, custo: 280_000, taxaMeioPagamento: pb(3), politica };

  it("dentro do limite: o vendedor aplica sozinho", () => {
    expect(avaliarDesconto(aparelho, 5_000).situacao).toBe("dentro_do_limite");
  });

  it("acima do limite: vai para aprovação do gerente ou dono", () => {
    const r = avaliarDesconto(aparelho, 20_000);
    expect(r.situacao).toBe("precisa_aprovacao");
    expect(r.precoFinal).toBe(329_900);
  });

  it("abaixo do custo: sinaliza prejuízo", () => {
    expect(avaliarDesconto(aparelho, 80_000).situacao).toBe("abaixo_do_custo");
  });

  it("recusa desconto negativo ou maior que o preço", () => {
    expect(() => avaliarDesconto(aparelho, -1)).toThrow();
    expect(() => avaliarDesconto(aparelho, 349_901)).toThrow();
  });
});
