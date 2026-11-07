import { describe, expect, it } from "vitest";

import { ehPerfil, PERFIL_PADRAO, podeAcessar } from "./perfis";

describe("REV-010 — perfil da demonstração", () => {
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "desconhecido", "", "DONO"])("%s não é perfil", (valor) => {
    expect(ehPerfil(valor)).toBe(false);
  });

  it.each(["dono", "gerente", "vendedor", "administrador"])("%s é perfil", (valor) => expect(ehPerfil(valor)).toBe(true));

  it("valores que não são texto não são perfil", () => {
    for (const valor of [undefined, null, 1, {}, []]) expect(ehPerfil(valor)).toBe(false);
  });

  it("o perfil padrão existe e segue a matriz do ADR-002", () => {
    expect(ehPerfil(PERFIL_PADRAO)).toBe(true);
    expect(podeAcessar("vendedor", "aprovacoes")).toBe(false);
    expect(podeAcessar("administrador", "vender")).toBe(false);
  });
});
