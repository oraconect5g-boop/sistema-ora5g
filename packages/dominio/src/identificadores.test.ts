import { describe, expect, it } from "vitest";

import { cnpjValido, completarComDigitoVerificador, cpfValido, formatarCnpj, iccidValido, imeiValido, mascararIdentificador, normalizarTelefone } from "./identificadores";

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

describe("CPF", () => {
  // CPFs FICTÍCIOS com dígitos verificadores válidos (base 000.000.00X).
  it("aceita CPF com dígitos verificadores corretos, com ou sem pontuação", () => {
    expect(cpfValido("000.000.001-91")).toBe(true);
    expect(cpfValido("00000000272")).toBe(true);
  });

  it("recusa dígito trocado, tamanho errado e números repetidos", () => {
    expect(cpfValido("000.000.001-92")).toBe(false);
    expect(cpfValido("000.000.001-9")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("")).toBe(false);
  });
});

describe("telefone", () => {
  it("normaliza celular e fixo com DDD, com ou sem +55", () => {
    expect(normalizarTelefone("(41) 9 0000-0001")).toBe("41900000001");
    expect(normalizarTelefone("+55 41 3333-4444")).toBe("4133334444");
  });

  it("recusa número incompleto ou sem DDD (a busca é exata, nunca parcial)", () => {
    expect(normalizarTelefone("0001")).toBeNull();
    expect(normalizarTelefone("90000-0001")).toBeNull();
    expect(normalizarTelefone("(01) 9 0000-0001")).toBeNull();
  });
});

describe("CNPJ", () => {
  // CNPJs FICTÍCIOS gerados (raiz 11.222.333, a mesma dos testes do banco).
  it("aceita CNPJ com dígitos verificadores corretos, com ou sem pontuação", () => {
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.444.777/0001-61")).toBe(true);
  });

  it("recusa dígito trocado, tamanho errado e números repetidos", () => {
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
    expect(cnpjValido("")).toBe(false);
  });

  it("formata para exibir e deixa como está o que não tem 14 dígitos", () => {
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("123")).toBe("123");
  });
});
