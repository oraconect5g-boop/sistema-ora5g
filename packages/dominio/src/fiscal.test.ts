import { describe, expect, it } from "vitest";

import { chaveDeAcessoValida, chaveEmGrupos, digitoDaChave, EMISSOR_BLOQUEADO, partesDaChave, tempoNaFila } from "./fiscal";

// Chaves FICTÍCIAS montadas pelo padrão (UF, AAMM, CNPJ, modelo, série, número, emissão, código, DV).
const montar = (base43: string) => base43 + String(digitoDaChave(base43));

describe("chave de acesso", () => {
  it("dígito verificador módulo 11 (casos calculados à mão)", () => {
    expect(digitoDaChave(`1${"0".repeat(42)}`)).toBe(7);
    expect(digitoDaChave("1".repeat(43))).toBe(2);
    expect(chaveDeAcessoValida(`1${"0".repeat(42)}7`)).toBe(true);
    expect(chaveDeAcessoValida(`1${"0".repeat(42)}6`)).toBe(false);
    expect(chaveDeAcessoValida("123")).toBe(false);
    expect(() => digitoDaChave("1")).toThrow();
  });

  it("partes: UF, ano/mês, CNPJ, modelo, série e número; aceita espaços e pontos", () => {
    const chave = montar(`43${"2611"}${"12345678000195"}65${"001"}${"000000123"}1${"12345678"}`);
    expect(partesDaChave(chaveEmGrupos(chave))).toEqual({
      uf: "43", anoMes: "2611", cnpj: "12345678000195", modelo: "65", nomeDoModelo: "NFC-e", serie: 1, numero: 123,
    });
    expect(chaveEmGrupos(chave).split(" ")).toHaveLength(11);
    expect(partesDaChave(montar(`43${"2611"}${"12345678000195"}99${"001"}${"000000123"}1${"12345678"}`))?.nomeDoModelo).toBe("modelo 99");
    expect(partesDaChave(`${chave.slice(0, 43)}${(Number(chave[43]) + 1) % 10}`)).toBeNull();
  });
});

describe("fila e emissor", () => {
  it("tempo desde a venda; sem prazo registrado nunca fica atrasada", () => {
    const venda = new Date("2026-11-08T12:00:00Z");
    expect(tempoNaFila(venda, new Date("2026-11-08T12:45:30Z"), null)).toEqual({ minutos: 45, atrasada: false });
    expect(tempoNaFila(venda, new Date("2026-11-08T12:45:30Z"), 30)).toEqual({ minutos: 45, atrasada: true });
    expect(tempoNaFila(venda, new Date("2026-11-08T11:00:00Z"), 30)).toEqual({ minutos: 0, atrasada: false });
  });

  it("sem emissor contratado, nenhuma nota sai do sistema", async () => {
    expect(await EMISSOR_BLOQUEADO.emitir({ pedidoId: "p", vendaId: "v", unidadeCnpj: "12345678000195", destinatarioDocumento: null }))
      .toMatchObject({ situacao: "bloqueada" });
    expect(await EMISSOR_BLOQUEADO.consultar("p")).toMatchObject({ situacao: "bloqueada" });
  });
});
