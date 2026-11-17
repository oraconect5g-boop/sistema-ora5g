// A leitura do arquivo de custo dos anúncios (lote META-a: ORA-META-001 por arquivo e ORA-META-003; ADR-017). Arquivos
// FICTÍCIOS montados no teste, com nomes de coluna em português e em inglês (as duas línguas do Gerenciador de Anúncios);
// nada é suposto do formato: a pessoa confirma a coluna de cada campo.
import { describe, expect, it } from "vitest";

import { lerCsv } from "../importacao/csv";
import { descomprimirNoServidor } from "../importacao/descomprimir-servidor";
import { lerPlanilha } from "../importacao/planilha";
import { gerarXlsx } from "../xlsx-servidor";
import { lerContagem, lerMapaDosAnuncios, mapaDosAnunciosParaGravar, montarLinhasDosAnuncios, sugerirMapaDosAnuncios } from "./leitura";

const utf8 = (t: string) => new TextEncoder().encode(t);

describe("as colunas do arquivo de anúncios", () => {
  it("sugere pelo nome, em português e em inglês, na ordem de preferência", () => {
    expect(sugerirMapaDosAnuncios(["Início dos relatórios", "Término dos relatórios", "Nome da campanha", "Dia", "Valor usado (BRL)", "Impressões",
      "Cliques (todos)", "Cliques no link", "Resultados"]))
      .toEqual({ dia: 3, fim: 1, campanha: 2, gasto: 4, impressoes: 5, cliques: 7, resultados: 8 });
    expect(sugerirMapaDosAnuncios(["Reporting starts", "Reporting ends", "Campaign name", "Amount spent (BRL)", "Impressions", "Link clicks", "Results"]))
      .toEqual({ dia: 0, fim: 1, campanha: 2, gasto: 3, impressoes: 4, cliques: 5, resultados: 6 });
  });

  it("o formulário: dia, campanha e gasto obrigatórios, cada coluna uma vez", () => {
    const de = (campos: Record<string, string>) => (nome: string) => campos[nome] ?? null;
    expect(lerMapaDosAnuncios(de({ coluna_dia: "0", coluna_campanha: "1", coluna_gasto: "2" }), 3)).toEqual({ dia: 0, campanha: 1, gasto: 2 });
    expect(lerMapaDosAnuncios(de({ coluna_dia: "0", coluna_campanha: "1" }), 3)).toBeNull();
    expect(lerMapaDosAnuncios(de({ coluna_dia: "0", coluna_campanha: "0", coluna_gasto: "2" }), 3)).toBeNull();
    expect(mapaDosAnunciosParaGravar(["Dia", "Campanha", "Valor"], { dia: 0, campanha: 1, gasto: 2 })).toEqual({ colunas: { dia: "Dia", campanha: "Campanha", gasto: "Valor" } });
  });

  it("a contagem com ou sem milhar; o que não é número inteiro é recusado", () => {
    expect(["1234", "1.234", "1,234", "1 234", "12.345.678", "7.0"].map(lerContagem)).toEqual([1234, 1234, 1234, 1234, 12_345_678, 7]);
    for (const t of ["", "1,5", "abc", "-3", "1.23"]) expect(() => lerContagem(t), t).toThrow(RangeError);
  });
});

describe("as linhas do arquivo de anúncios", () => {
  it("cada dia de cada campanha; a linha de total e a sem dia ficam de fora; o gasto vazio é zero", () => {
    const planilha = lerCsv(utf8([
      "Início dos relatórios;Término dos relatórios;Nome da campanha;Valor usado (BRL);Impressões;Cliques no link;Resultados",
      "17/11/2026;17/11/2026;Black Friday Galaxy;R$ 150,25;12.345;321;12",
      "17/11/2026;17/11/2026;Capas;;800;;",
      ";;Total;150,25;13.145;321;12",
      ";;Sem dia;1,00;;;",
    ].join("\n")));
    expect(montarLinhasDosAnuncios(planilha, sugerirMapaDosAnuncios(planilha.cabecalho))).toEqual({
      linhas: [
        { numero: 2, dia: "2026-11-17", campanha: "Black Friday Galaxy", gasto: 15_025, impressoes: 12_345, cliques: 321, resultados: 12 },
        { numero: 3, dia: "2026-11-17", campanha: "Capas", gasto: 0, impressoes: 800 },
      ],
      deFora: 2,
      problemas: [],
    });
  });

  it("o arquivo que não é por dia é apontado, e o valor que não dá para ler também", () => {
    const planilha = lerCsv(utf8("Reporting starts;Reporting ends;Campaign name;Amount spent (BRL)\n2026-11-01;2026-11-30;Natal;1500.00\n2026-11-17;2026-11-17;Capas;dez reais\n"));
    expect(montarLinhasDosAnuncios(planilha, sugerirMapaDosAnuncios(planilha.cabecalho)).problemas).toEqual([
      { numero: 2, campo: "por_dia", texto: "2026-11-01 a 2026-11-30" },
      { numero: 3, campo: "gasto", texto: "dez reais" },
    ]);
  });

  it("do Excel: o dia de verdade e o valor como número", async () => {
    const bytes = gerarXlsx([{ nome: "Relatório", secoes: [{
      colunas: ["Dia", "Nome da campanha", "Valor usado (BRL)", "Impressões"],
      linhas: [[{ dia: "2026-11-17" }, "Capas", { centavos: 1_999 }, 1500]],
    }] }]);
    const planilha = await lerPlanilha(bytes, descomprimirNoServidor);
    expect(montarLinhasDosAnuncios(planilha, sugerirMapaDosAnuncios(planilha.cabecalho)).linhas).toEqual([
      { numero: 2, dia: "2026-11-17", campanha: "Capas", gasto: 1_999, impressoes: 1500 },
    ]);
  });
});
