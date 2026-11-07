import { describe, expect, it } from "vitest";

import { completarComDigitoVerificador, iccidValido, imeiValido, mascararIdentificador } from "./identificadores";

// Identificadores FICTÍCIOS gerados com dígito verificador válido.
const imei = completarComDigitoVerificador("35209900176148");
const iccid = completarComDigitoVerificador("895510000000000001");

describe("IMEI", () => {
  it("aceita IMEI com dígito verificador correto, com ou sem separadores", () => {
    expect(imeiValido(imei)).toBe(true);
    expect(imeiValido(`${imei.slice(0, 2)}-${imei.slice(2, 8)}-${imei.slice(8)}`)).toBe(true);
  });

  it("recusa erro de digitação em qualquer posição", () => {
    for (let i = 0; i < 15; i++) {
      const errado = imei.slice(0, i) + ((Number(imei[i]) + 1) % 10) + imei.slice(i + 1);
      expect(imeiValido(errado)).toBe(false);
    }
  });

  it("recusa tamanho errado e números repetidos", () => {
    expect(imeiValido(imei.slice(0, 14))).toBe(false);
    expect(imeiValido("000000000000000")).toBe(false);
  });
});

describe("ICCID", () => {
  it("aceita ICCID de 19 dígitos começando com 89", () => expect(iccidValido(iccid)).toBe(true));
  it("recusa ICCID com dígito trocado ou prefixo errado", () => {
    expect(iccidValido(iccid.slice(0, -1) + ((Number(iccid.at(-1)) + 1) % 10))).toBe(false);
    expect(iccidValido("1" + iccid.slice(1))).toBe(false);
  });
});

it("mostra só o final do identificador", () => {
  expect(mascararIdentificador(imei)).toBe(`•••• ${imei.slice(-4)}`);
});
