import { describe, expect, it } from "vitest";

import { erroDoEstoque, identificadorDigitado, inicioDoDiaEmSaoPaulo, nomeDe, NOMES_DAS_SITUACOES } from "./regras";

describe("tela de estoque", () => {
  it("o dia começa à meia-noite de São Paulo, também perto da virada em UTC", () => {
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-11-08T15:00:00Z"))).toBe("2026-11-08T03:00:00.000Z");
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-11-09T01:30:00Z"))).toBe("2026-11-08T03:00:00.000Z");
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-11-09T03:00:00Z"))).toBe("2026-11-09T03:00:00.000Z");
  });
  it("IMEI com 15 e ICCID com 19 ou 20 dígitos; espaços e pontos saem", () => {
    expect(identificadorDigitado("35 2099 0017 0001 0")).toBe("352099001700010");
    expect(identificadorDigitado("8955 1000 0000 0000 013")).toBe("8955100000000000013");
    expect(identificadorDigitado("12345")).toBeNull();
    expect(identificadorDigitado("Galaxy A15")).toBeNull();
  });
  it("nomes e mensagens só do catálogo", () => {
    expect(nomeDe(NOMES_DAS_SITUACOES, "reservado")).toBe("Reservado (numa venda)");
    expect(nomeDe(NOMES_DAS_SITUACOES, "__proto__")).toBe("__proto__");
    expect(erroDoEstoque({ code: "P0002" })).toBe("nao_encontrado");
    expect(erroDoEstoque({ code: "42501" })).toBe("sem_permissao");
    expect(erroDoEstoque(null)).toBe("falha");
  });
});
