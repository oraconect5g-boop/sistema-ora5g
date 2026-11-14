// Janelas dos alertas do Início (L12f).
import { describe, expect, it } from "vitest";

import { janelasDosAlertas } from "./alertas";

describe("janelas dos alertas", () => {
  it("7 dias e um dia antes de agora, em ISO", () => {
    expect(janelasDosAlertas(new Date("2026-11-10T18:30:00.000Z"))).toEqual({ haSeteDias: "2026-11-03T18:30:00.000Z", haUmDia: "2026-11-09T18:30:00.000Z" });
  });
});
