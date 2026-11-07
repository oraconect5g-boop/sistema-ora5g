import { describe, expect, it } from "vitest";

import { formatarHorario, obterEstadoSaude } from "./estado";
import pacote from "../../package.json";

describe("obterEstadoSaude", () => {
  it("informa servico, versao do pacote e o instante recebido", () => {
    const agora = new Date("2026-11-06T22:00:00.000Z");

    expect(obterEstadoSaude(agora)).toEqual({
      status: "ok",
      servico: "plataforma",
      versao: pacote.version,
      verificadoEm: "2026-11-06T22:00:00.000Z",
    });
  });

  it("usa o instante atual quando nenhum e informado", () => {
    const antes = Date.now();
    const verificadoEm = Date.parse(obterEstadoSaude().verificadoEm);

    expect(verificadoEm).toBeGreaterThanOrEqual(antes);
    expect(verificadoEm).toBeLessThanOrEqual(Date.now());
  });
});

describe("formatarHorario", () => {
  it("mostra o horario de Sao Paulo, nao o do servidor", () => {
    expect(formatarHorario("2026-11-06T22:00:00.000Z")).toBe("06/11/2026, 19:00:00");
  });

  it("muda de dia conforme o fuso de Sao Paulo", () => {
    expect(formatarHorario("2026-11-07T01:30:00.000Z")).toBe("06/11/2026, 22:30:00");
  });
});
