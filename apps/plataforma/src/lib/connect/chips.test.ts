// As regras da tela do estoque de chips da Nogle (lote CONNECT-d; ORA-INV-011). ICCIDs FICTÍCIOS.
import { describe, expect, it } from "vitest";

import { abaixoDoMinimo, buscaDeIccid, erroDosChips, iccidEmBlocos, separarPdvs, situacaoDaLeitura, somar, type PdvDaTela } from "./chips";

const pdv = (campos: Partial<PdvDaTela>): PdvDaTela => ({
  pdv_id: 1, nome: "PDV", cidade: null, uf: null, estoque_minimo: null, unidade_id: null, ativo: true, estoque_lido_em: null, fisicos: 0, esims: 0, ...campos,
});

describe("o estoque de chips da Nogle na tela (CONNECT-d)", () => {
  it("o erro da ligação: a loja já ligada, a loja que não é física, sem permissão, o resto", () => {
    expect([{ code: "OR051" }, { code: "22023" }, { code: "42501" }, { code: "PGRST000" }, null].map(erroDosChips))
      .toEqual(["ja_ligada", "so_loja_fisica", "sem_permissao", "falha", "falha"]);
  });

  it("a última leitura: em dia até 45 minutos no horário da leitura; fora dele, a da noite vale até 10 horas", () => {
    // 15:00 em Brasília (18:00 UTC): no horário.
    const tarde = new Date("2026-11-24T18:00:00Z");
    expect(situacaoDaLeitura("2026-11-24T17:30:00Z", tarde)).toBe("em_dia");
    expect(situacaoDaLeitura("2026-11-24T17:10:00Z", tarde)).toBe("atrasada");
    // 06:30 em Brasília (09:30 UTC): fora do horário; a das 22:00 da véspera (01:00 UTC) ainda vale.
    const cedo = new Date("2026-11-25T09:30:00Z");
    expect(situacaoDaLeitura("2026-11-25T01:00:00Z", cedo)).toBe("em_dia");
    expect(situacaoDaLeitura("2026-11-24T21:00:00Z", cedo)).toBe("atrasada");
    expect(situacaoDaLeitura(null, tarde)).toBe("sem_leitura");
  });

  it("o ICCID em blocos de 4 e a busca pelo fim do número", () => {
    expect(iccidEmBlocos("8955170110335507792")).toBe("8955 1701 1033 5507 792");
    expect(buscaDeIccid("5507 792")).toBe("5507792");
    expect(buscaDeIccid("792")).toBeNull();
    expect(buscaDeIccid("abc")).toBeNull();
    expect(buscaDeIccid(undefined)).toBeNull();
    expect(buscaDeIccid("1".repeat(21))).toBeNull();
  });

  it("abaixo do mínimo da Nogle, a separação das lojas e dos outros PDVs e a soma", () => {
    expect(abaixoDoMinimo(pdv({ estoque_minimo: 10, fisicos: 5, esims: 4 }))).toBe(true);
    expect(abaixoDoMinimo(pdv({ estoque_minimo: 10, fisicos: 6, esims: 4 }))).toBe(false);
    expect(abaixoDoMinimo(pdv({ estoque_minimo: 0 }))).toBe(false);
    expect(abaixoDoMinimo(pdv({ estoque_minimo: null }))).toBe(false);
    const nomes: Record<string, string> = { u1: "Água Verde", u2: "Butiatuvinha" };
    const { comLoja, outros } = separarPdvs([
      pdv({ pdv_id: 2, nome: "SUPERCELL BUTIATUVINHA", unidade_id: "u2", fisicos: 1, esims: 5 }),
      pdv({ pdv_id: 1, nome: "SUPERCELL AGUA VERDE", unidade_id: "u1", fisicos: 25 }),
      pdv({ pdv_id: 9, nome: "Revenda B", ativo: false }),
      pdv({ pdv_id: 8, nome: "Revenda C", fisicos: 3 }),
    ], (u) => nomes[u]);
    expect(comLoja.map((p) => [p.pdv_id, p.loja])).toEqual([[1, "Água Verde"], [2, "Butiatuvinha"]]);
    expect(outros.map((p) => p.pdv_id)).toEqual([8, 9]);
    expect(somar(comLoja)).toEqual({ fisicos: 26, esims: 5 });
  });
});
