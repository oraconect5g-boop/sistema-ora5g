// As regras da tela do estoque de chips da Nogle (lote CONNECT-d; ORA-INV-011). ICCIDs FICTÍCIOS.
import { describe, expect, it } from "vitest";

import {
  abaixoDoMinimo, buscaDeIccid, chipsQueChegaram, erroDaTransferencia, erroDosChips, iccidEmBlocos, lerPedidoDeTransferencia, separarPdvs,
  situacaoDaLeitura, somar, type PdvDaTela,
} from "./chips";

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

describe("o pedido de transferência de chips na tela (CONNECT-e)", () => {
  const CHAVE = "00000000-0000-4000-9000-0000000000c1";
  const I = (n: number) => `895517011000000${String(n).padStart(3, "0")}1`;
  const form = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });

  it("lê o pedido de cada tipo e ignora os campos do outro tipo", () => {
    expect(lerPedidoDeTransferencia(form({ tipo: "esim", pdv: "5233", quantidade: "2", iccid: I(1), chave: CHAVE, motivo: " Reposição " })))
      .toEqual({ ok: true, pedido: { tipo: "esim", pdv: 5233, iccid: null, iccidFinal: null, quantidade: 2, motivo: "Reposição", chave: CHAVE } });
    expect(lerPedidoDeTransferencia(form({ tipo: "unidade", pdv: "5233", iccid: `${I(1).slice(0, 4)} ${I(1).slice(4)}`, quantidade: "9", chave: CHAVE })))
      .toEqual({ ok: true, pedido: { tipo: "unidade", pdv: 5233, iccid: I(1), iccidFinal: null, quantidade: null, motivo: null, chave: CHAVE } });
    expect(lerPedidoDeTransferencia(form({ tipo: "lote", pdv: "5233", iccid: I(1), iccid_final: I(4), chave: CHAVE })))
      .toMatchObject({ ok: true, pedido: { tipo: "lote", iccid: I(1), iccidFinal: I(4) } });
  });

  it("recusa o pedido fora da forma antes de ir ao banco", () => {
    const casos: Record<string, string>[] = [
      { tipo: "chip", pdv: "5233", quantidade: "1", chave: CHAVE },
      { tipo: "esim", pdv: "x", quantidade: "1", chave: CHAVE },
      { tipo: "esim", pdv: "5233", quantidade: "0", chave: CHAVE },
      { tipo: "esim", pdv: "5233", quantidade: "501", chave: CHAVE },
      { tipo: "esim", pdv: "5233", quantidade: "1", chave: "outra" },
      { tipo: "unidade", pdv: "5233", iccid: "123", chave: CHAVE },
      { tipo: "lote", pdv: "5233", iccid: I(4), iccid_final: I(1), chave: CHAVE },
      { tipo: "lote", pdv: "5233", iccid: I(1), iccid_final: `${I(4)}0`, chave: CHAVE },
    ];
    for (const campos of casos) expect(lerPedidoDeTransferencia(form(campos)), JSON.stringify(campos)).toEqual({ ok: false, erro: "dados" });
  });

  it("os erros do banco viram mensagens; os chips que chegaram saem do resultado", () => {
    expect([{ code: "OR052" }, { code: "OR053" }, { code: "OR054" }, { code: "OR004" }, { code: "42501" }, { code: "22023" }, { code: "X" }].map(erroDaTransferencia))
      .toEqual(["sem_estoque", "em_andamento", "ja_saiu", "chave", "sem_permissao", "dados", "falha"]);
    expect(chipsQueChegaram({ novos: [I(1), 2, I(3)] })).toEqual([I(1), I(3)]);
    expect(chipsQueChegaram(null)).toEqual([]);
  });
});
