import { describe, expect, it } from "vitest";

import { erroDasNotas, haQuanto } from "./regras";

describe("fila de notas", () => {
  it("códigos do banco viram mensagens do catálogo", () => {
    expect(erroDasNotas({ code: "OR014" })).toBe("ja_pedida");
    expect(erroDasNotas({ code: "OR015" })).toBe("nota_emitida");
    expect(erroDasNotas({ code: "__proto__" })).toBe("falha");
    expect(erroDasNotas(undefined)).toBe("falha");
  });
  it("tempo desde a venda em palavras", () => {
    expect(haQuanto(5)).toBe("há 5 min");
    expect(haQuanto(60)).toBe("há 1 h");
    expect(haQuanto(130)).toBe("há 2 h 10 min");
    expect(haQuanto(3 * 24 * 60 + 5)).toBe("há 3 d");
  });
});
