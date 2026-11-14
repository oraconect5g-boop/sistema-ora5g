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

  it("o nome do arquivo: a demonstração com o prefixo dela; as telas reais com \"ora5g\" (L8d)", () => {
    const nomes: string[] = [];
    vi.stubGlobal("URL", { createObjectURL: () => "blob:teste", revokeObjectURL: () => {} });
    vi.stubGlobal("document", { createElement: () => { const link = { click: () => {}, remove: () => {}, href: "", download: "" }; nomes.push(""); return new Proxy(link, { set: (alvo, chave, valor) => { if (chave === "download") nomes[nomes.length - 1] = String(valor); return Reflect.set(alvo, chave, valor); } }); }, body: { append: () => {} } });
    ExportarCsv({ nomeArquivo: "usuarios", colunas: ["Nome"], linhas: [["Ana"]] }).props.onClick();
    ExportarCsv({ nomeArquivo: "previsao-rede-inteira-2026-11-13", colunas: ["Semana"], linhas: [[1]], prefixo: "ora5g" }).props.onClick();
    expect(nomes).toEqual(["ora5g-demonstracao-usuarios.csv", "ora5g-previsao-rede-inteira-2026-11-13.csv"]);
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
