// #99: a identidade da versão no ar só sai completa; commit curto ou estranho vira vazio (o conferidor reprova).
import { describe, expect, it } from "vitest";

import { identidadeDaVersao } from "./versao-no-ar";

const SHA = "ad6beb4" + "0".repeat(33);

describe("a identidade da versão no ar (#99)", () => {
  it("o commit inteiro, a versão, a build e o ambiente; sem o commit inteiro, vazio", () => {
    expect(identidadeDaVersao({ ORA_COMMIT_COMPLETO: SHA, NEXT_PUBLIC_ORA_BUILD: "2026-11-16T09:46:00.000Z", APP_ENV: "homologacao" }))
      .toMatchObject({ commit: SHA, build: "2026-11-16T09:46:00.000Z", ambiente: "homologacao" });
    for (const estranho of ["ad6beb4", "", "z".repeat(40), `${SHA}\n`]) expect(identidadeDaVersao({ ORA_COMMIT_COMPLETO: estranho }).commit).toBe("");
    expect(identidadeDaVersao({})).toMatchObject({ commit: "", build: "", ambiente: "" });
  });
});
