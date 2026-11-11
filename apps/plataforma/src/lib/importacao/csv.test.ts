import { describe, expect, it } from "vitest";

import { ErroDoCsv, LIMITES_DO_CSV, lerCabecalho, lerCsv, semAcento } from "./csv";

// Planilhas FICTÍCIAS montadas no teste (nenhum arquivo real da Rein: o formato chega com a pendência B1).
const utf8 = (texto: string) => new TextEncoder().encode(texto);
const latin1 = (texto: string) => Uint8Array.from([...texto].map((c) => c.charCodeAt(0)));
const falha = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof ErroDoCsv ? e.motivo : "outro"; }
  return null;
};

describe("leitura do CSV", () => {
  it("ponto e vírgula, aspas, aspas dobradas e quebra de linha dentro da célula", () => {
    const p = lerCsv(utf8('SKU;Descrição;Preço\r\nAPA-1;"Galaxy ""A15"" 128 GB";1.299,90\r\nACE-1;"Capa\ncom alça";79,90\r\n'));
    expect(p.separador).toBe(";");
    expect(p.codificacao).toBe("utf-8");
    expect(p.cabecalho).toEqual(["SKU", "Descrição", "Preço"]);
    expect(p.linhas).toEqual([["APA-1", 'Galaxy "A15" 128 GB', "1.299,90"], ["ACE-1", "Capa\ncom alça", "79,90"]]);
  });

  it("vírgula e tabulação; BOM; linhas vazias ignoradas; espaços nas pontas aparados", () => {
    expect(lerCsv(utf8("﻿sku,nome\n A1 , Capa \n\n")).linhas).toEqual([["A1", "Capa"]]);
    const tab = lerCsv(utf8("sku\tnome\nA1\tCapa"));
    expect([tab.separador, tab.linhas]).toEqual(["\t", [["A1", "Capa"]]]);
  });

  it("arquivo em Windows-1252 (acentos de sistemas antigos) é lido sem estragar", () => {
    const p = lerCsv(latin1("SKU;Descrição\nA1;Película"));
    expect(p.codificacao).toBe("windows-1252");
    expect(p.cabecalho).toEqual(["SKU", "Descrição"]);
    expect(p.linhas).toEqual([["A1", "Película"]]);
  });

  it("recusa vazio, aspas abertas, cabeçalho repetido ou vazio e passar dos limites", () => {
    expect(falha(() => lerCsv(new Uint8Array()))).toBe("vazio");
    expect(falha(() => lerCsv(utf8('sku;nome\nA1;"sem fim')))).toBe("aspas");
    expect(falha(() => lerCsv(utf8("sku;SKU\nA1;A2")))).toBe("cabecalho");
    expect(falha(() => lerCsv(utf8("sku;;nome\nA1;x;y")))).toBe("cabecalho");
    expect(falha(() => lerCsv(utf8(`sku;nome\nA1;${"x".repeat(LIMITES_DO_CSV.celula + 1)}`)))).toBe("celula");
    expect(falha(() => lerCsv(utf8(`${Array.from({ length: 61 }, (_, i) => `c${i}`).join(";")}\n1`)))).toBe("colunas");
    const muitas = `sku;nome\n${Array.from({ length: LIMITES_DO_CSV.linhas + 1 }, (_, i) => `S${i};n`).join("\n")}`;
    expect(falha(() => lerCsv(utf8(muitas)))).toBe("linhas");
    expect(falha(() => lerCsv(new Uint8Array(LIMITES_DO_CSV.bytes + 1)))).toBe("grande");
  });

  it("lê só o cabeçalho, mesmo com o resto do arquivo cortado no meio", () => {
    const bytes = utf8('Código;"Descrição; completa";Preço\nA1;"texto cortado no mei');
    expect(lerCabecalho(bytes)).toEqual({ separador: ";", colunas: ["Código", "Descrição; completa", "Preço"] });
    expect(lerCabecalho(latin1("SKU;Pre\u00e7o\r\nA1;1"))).toEqual({ separador: ";", colunas: ["SKU", "Preço"] });
  });

  it("compara nomes sem acento nem maiúsculas", () => {
    expect(semAcento("  Preço   de VENDA ")).toBe("preco de venda");
  });
});
