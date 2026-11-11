import { completarComDigitoVerificador } from "@ora5g/dominio";
import { describe, expect, it } from "vitest";

import { erroDaEntrada, separarIdentificadores, validarEntrada } from "./entrada";

// IMEIs e ICCIDs FICTÍCIOS com dígito verificador válido.
const IMEI_1 = completarComDigitoVerificador("35209900180001");
const IMEI_2 = completarComDigitoVerificador("35209900180002");
const ICCID_1 = completarComDigitoVerificador("895510000000000501");
const LOJA = "00000000-0000-4000-8000-000000000020";
const FORN = "00000000-0000-4000-9000-000000000060";
const APARELHO = "00000000-0000-4000-9000-000000000030";
const CHIP = "00000000-0000-4000-9000-000000000032";
const CAPA = "00000000-0000-4000-9000-000000000031";
const formulario = (campos: Record<string, unknown>) => (n: string) => (campos[n] ?? null) as unknown;
const base = (itens: object[], extra: Record<string, unknown> = {}) => formulario({
  unidade: LOJA, tipo: "compra", fornecedor: FORN, documento: "NF 1234", chave: "form:abc12345", motivo: "Pedido da semana", itens: JSON.stringify(itens), ...extra,
});

describe("entrada de mercadoria", () => {
  it("aparelho e chip pelo IMEI/ICCID (um por linha), acessório por quantidade, custo em centavos", () => {
    const r = validarEntrada(base([
      { variante: APARELHO, tipo: "aparelho", identificadores: `${IMEI_1}\n ${IMEI_2.slice(0, 2)}-${IMEI_2.slice(2)} `, custo: "1.050,00" },
      { variante: CHIP, tipo: "chip", identificadores: ICCID_1 },
      { variante: CAPA, tipo: "acessorio", quantidade: "20", custo: "17,00" },
    ]));
    expect(r).toEqual({
      ok: true,
      dados: {
        unidade: LOJA, tipo: "compra", fornecedor: FORN, documento: "NF 1234", chave: "form:abc12345", motivo: "Pedido da semana",
        itens: [
          { variante: APARELHO, identificadores: [IMEI_1, IMEI_2], condicao: "novo", custo: 105_000 },
          { variante: CHIP, identificadores: [ICCID_1], condicao: "novo" },
          { variante: CAPA, quantidade: 20, condicao: "novo", custo: 1_700 },
        ],
      },
    });
  });

  it("recusa IMEI inválido ou repetido, quantidade e custo errados, compra sem fornecedor e carga com fornecedor", () => {
    expect(validarEntrada(base([{ variante: APARELHO, tipo: "aparelho", identificadores: "352099001800001" }]))).toEqual({ ok: false, erro: "identificador" });
    expect(validarEntrada(base([{ variante: APARELHO, tipo: "aparelho", identificadores: `${IMEI_1} ${IMEI_1}` }]))).toEqual({ ok: false, erro: "identificador" });
    expect(validarEntrada(base([{ variante: APARELHO, tipo: "aparelho", identificadores: "" }]))).toEqual({ ok: false, erro: "identificador" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "acessorio", quantidade: "0" }]))).toEqual({ ok: false, erro: "quantidade" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "acessorio", quantidade: "2", custo: "dez" }]))).toEqual({ ok: false, erro: "custo" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "recarga", quantidade: "1" }]))).toEqual({ ok: false, erro: "linhas" });
    expect(validarEntrada(base([]))).toEqual({ ok: false, erro: "linhas" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "acessorio", quantidade: "1" }], { fornecedor: "" }))).toEqual({ ok: false, erro: "fornecedor" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "acessorio", quantidade: "1" }], { tipo: "carga_inicial" }))).toEqual({ ok: false, erro: "fornecedor" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "acessorio", quantidade: "1" }], { motivo: "ok" }))).toEqual({ ok: false, erro: "motivo" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "acessorio", quantidade: "1" }], { itens: "{quebrado" }))).toEqual({ ok: false, erro: "dados" });
  });

  it("separa identificadores digitados de qualquer jeito", () => {
    expect(separarIdentificadores(" 3520-9900 ; 123,456\n\n789 ")).toEqual(["35209900", "123", "456", "789"]);
  });

  it("erros do banco viram mensagens do catálogo", () => {
    expect(erroDaEntrada({ code: "42501" })).toBe("permissao");
    expect(erroDaEntrada({ code: "OR004" })).toBe("repetida");
    expect(erroDaEntrada({ code: "OR002" })).toBe("em_uso");
    expect(erroDaEntrada({ code: "OR001" })).toBe("sem_saldo");
    expect(erroDaEntrada({ code: "23505", message: "IMEI/ICCID 35... já cadastrado" })).toBe("ja_cadastrado");
    expect(erroDaEntrada({ code: "23505", message: "Este CNPJ já está em outro fornecedor" })).toBe("cnpj");
    expect(erroDaEntrada({ code: "22023", message: "Linha 2 (APA-1): IMEI inválido: 123" })).toBe("identificador");
    expect(erroDaEntrada({ code: "22023", message: "Escolha um fornecedor ativo desta rede" })).toBe("fornecedor");
    expect(erroDaEntrada({ code: "22023", message: "Entrada só em loja física ou depósito ativos" })).toBe("loja");
    expect(erroDaEntrada({ code: "XX000" })).toBe("falha");
  });
});
