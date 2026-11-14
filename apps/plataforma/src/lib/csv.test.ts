// Planilhas em CSV (ORA-FIN-009; partes e nomes de arquivo desde o L8d): o arquivo em várias partes, o
// instante de geração em São Paulo, o nome do arquivo sem acento e a data no formato do Brasil.
import { describe, expect, it } from "vitest";

import { centavosCsv, diaCsv, geradoEm, gerarCsvEmSecoes, parteDoNome } from "./csv";

describe("planilhas em CSV (L8d)", () => {
  it("várias partes separadas por uma linha em branco, cada uma com o cabeçalho, com a mesma proteção contra fórmula", () => {
    const csv = gerarCsvEmSecoes([
      { linhas: [["Resultado do mês", "Outubro de 2026", "Rede inteira"]] },
      { colunas: ["Linha", "Valor"], linhas: [["Receita líquida", centavosCsv(463_350)], ["Resultado", centavosCsv(-305_550)]] },
      { colunas: ["Observações"], linhas: [["=1+1", "texto; com ponto e vírgula"]] },
    ]);
    expect(csv).toBe("﻿Resultado do mês;Outubro de 2026;Rede inteira\r\n\r\nLinha;Valor\r\nReceita líquida;4633,50\r\nResultado;-3055,50\r\n\r\nObservações\r\n'=1+1;\"texto; com ponto e vírgula\"");
  });

  it("o instante em São Paulo, o nome do arquivo e a data", () => {
    expect(geradoEm(new Date("2026-11-14T01:05:00Z"))).toBe("13/11/2026 22:05");
    expect(parteDoNome("São José dos Pinhais")).toBe("sao-jose-dos-pinhais");
    expect(parteDoNome("Rede (central)")).toBe("rede-central");
    expect(parteDoNome("???")).toBe("arquivo");
    expect(diaCsv("2026-11-05")).toBe("05/11/2026");
  });
});
