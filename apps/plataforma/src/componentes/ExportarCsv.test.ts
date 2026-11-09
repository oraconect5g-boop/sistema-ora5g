// REV-036 / #38 (prova do Codex na PR #33, 2026-11-08-setores/csv.repro.ts), agora regressão
// permanente: texto que a planilha leria como fórmula sai neutralizado; número fica igual.
import { afterEach, describe, expect, it, vi } from "vitest";

import { celulaCsv, ExportarCsv } from "./ExportarCsv";

afterEach(() => vi.unstubAllGlobals());

describe("exportação CSV", () => {
  it("neutraliza =, +, -, @, tabulação e retorno no começo do texto", async () => {
    let salvo: Blob | undefined;
    vi.stubGlobal("URL", { createObjectURL: (b: Blob) => { salvo = b; return "blob:teste"; }, revokeObjectURL: () => {} });
    vi.stubGlobal("document", { createElement: () => ({ click: () => {}, remove: () => {}, href: "", download: "" }), body: { append: () => {} } });
    const botao = ExportarCsv({ nomeArquivo: "teste", colunas: ["Nome"], linhas: [["=1+1"], ["+1+1"], ["@SUM(1)"], ["-2+3"], ["\tx"]] });
    botao.props.onClick();
    const csv = await salvo!.text();
    expect(csv).not.toMatch(/\r\n[=+@\-\t]/);
    expect(csv).toContain("\r\n'=1+1\r\n'+1+1\r\n'@SUM(1)\r\n'-2+3\r\n'\tx");
  });

  it("controle: número, número negativo, valor em reais e texto comum não mudam; aspas e ponto e vírgula continuam protegidos", () => {
    expect(celulaCsv(-12)).toBe("-12");
    expect(celulaCsv("-12,50")).toBe("-12,50");
    expect(celulaCsv("1.299,90")).toBe("1.299,90");
    expect(celulaCsv("Capa de silicone")).toBe("Capa de silicone");
    expect(celulaCsv('Cabo "USB-C"; 1 m')).toBe('"Cabo ""USB-C""; 1 m"');
    expect(celulaCsv('=HYPERLINK("x";"y")')).toBe(`"'=HYPERLINK(""x"";""y"")"`);
  });
});
