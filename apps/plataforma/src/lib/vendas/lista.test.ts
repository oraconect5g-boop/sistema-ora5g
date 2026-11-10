import { describe, expect, it } from "vitest";

import { inicioDoPeriodo, resumoDasVendas, situacaoDaVenda } from "./lista";

describe("lista real de vendas", () => {
  it("o período começa à meia-noite de São Paulo: hoje, 7 e 30 dias contando hoje", () => {
    const agora = new Date("2026-11-10T14:00:00Z"); // 11h em São Paulo
    expect(inicioDoPeriodo("hoje", agora)).toBe("2026-11-10T03:00:00.000Z");
    expect(inicioDoPeriodo("7", agora)).toBe("2026-11-04T03:00:00.000Z");
    expect(inicioDoPeriodo("30", agora)).toBe("2026-10-12T03:00:00.000Z");
    // 01h UTC ainda é o dia anterior em São Paulo.
    expect(inicioDoPeriodo("hoje", new Date("2026-11-10T01:00:00Z"))).toBe("2026-11-09T03:00:00.000Z");
  });

  it("só a concluída conta como vendida; a devolução abate; cancelada e em aberto só contam", () => {
    expect(resumoDasVendas([
      { situacao: "concluida", total_centavos: "149900", devolvido_centavos: 0 },
      { situacao: "concluida", total_centavos: 7900, devolvido_centavos: "7900" },
      { situacao: "cancelada", total_centavos: 50000, devolvido_centavos: 0 },
      { situacao: "rascunho", total_centavos: null, devolvido_centavos: 0 },
      { situacao: "aguardando_aprovacao", total_centavos: 1000, devolvido_centavos: 0 },
    ])).toEqual({ concluidas: 2, vendido: 157_800, devolvido: 7_900, liquido: 149_900, abertas: 2, canceladas: 1 });
  });

  it("valor fora do inteiro seguro é recusado, nunca arredondado", () => {
    expect(() => resumoDasVendas([{ situacao: "concluida", total_centavos: "9007199254740993", devolvido_centavos: 0 }])).toThrow();
  });

  it("situação desconhecida aparece com o próprio código, em tom neutro", () => {
    expect(situacaoDaVenda("concluida")).toEqual({ nome: "concluída", tom: "sucesso" });
    expect(situacaoDaVenda("outra")).toEqual({ nome: "outra", tom: "neutro" });
  });
});
