import { describe, expect, it } from "vitest";

import { textoDaVersao } from "./versao";

describe("versão visível nas telas", () => {
  it("número, commit curto e hora da build no horário de São Paulo", () => {
    expect(textoDaVersao({ numero: "0.1.0", commit: "eb0a947", build: "2026-11-10T21:05:00.000Z" })).toBe("v0.1.0 · eb0a947 · build 10/11/2026 18:05");
  });

  it("virada do dia também segue São Paulo (UTC já é dia seguinte)", () => {
    expect(textoDaVersao({ numero: "0.1.0", commit: "abc1234", build: "2026-11-11T01:30:00.000Z" })).toBe("v0.1.0 · abc1234 · build 10/11/2026 22:30");
  });

  it("sem hora de build (ou inválida) mostra só número e commit", () => {
    expect(textoDaVersao({ numero: "0.1.0", commit: "local", build: "" })).toBe("v0.1.0 · local");
    expect(textoDaVersao({ numero: "0.1.0", commit: "local", build: "ontem" })).toBe("v0.1.0 · local");
  });
});
