// Regras dos Relatórios (G2a): recortes de tempo, endereços, séries por dia e tabelas da exportação.
// As respostas passam pelos leitores de verdade (lerVendas, lerMargem, lerItensDaMargem), no formato
// de public.vendas_painel, public.margem_painel e public.margem_itens. Dados fictícios.
import { describe, expect, it } from "vitest";

import { gerarCsvEmSecoes, textoDaCelula, type Celula } from "../csv";
import { lerVendas } from "../inicio/painel";
import { lerItensDaMargem, lerMargem } from "../margem/painel";
import {
  diasDeMargem, diasDeVendas, enderecoDaExportacao, enderecoDosRelatorios, janelasDoRelatorio, ORDEM_DOS_RELATORIOS, paginaDoRelatorio, percentualCsv,
  PERIODO_NO_FINANCEIRO, periodoDoRelatorio, PERIODOS_DOS_RELATORIOS, tabelaDosDias, tabelaDosItens, textosDoRelatorio, visaoDaExportacao,
} from "./painel";

// Terça-feira, 10/11/2026, 15h em São Paulo: os sete dias vão de 04/11 a 10/11.
const AGORA = new Date("2026-11-10T15:00:00-03:00");
const SETE = janelasDoRelatorio("7", AGORA).atual;

const SEM_ESTORNO = { cancelamentos: 0, cancelado: 0, devolucoes: 0, devolvido: 0 };
const LISTAS = { tipos: [], categorias: [], lojas: [], vendedores: [] };
// 05/11: quatro vendas, uma com desconto. 06/11: só a devolução de uma venda do dia 05. 07/11: uma
// venda de itens sem custo gravado. 10/11: duas vendas e o cancelamento de uma venda anterior.
const VENDAS = lerVendas({
  totais: { vendas: 7, vendido: 494_900, subtotal: 495_000, descontos: 100, vendas_com_desconto: 1, cancelamentos: 1, cancelado: 7_900, devolucoes: 1, devolvido: 7_850 },
  periodos: [
    { periodo: "2026-11-05", vendas: 4, vendido: 339_200, subtotal: 339_300, descontos: 100, ...SEM_ESTORNO },
    { periodo: "2026-11-06", vendas: 0, vendido: 0, subtotal: 0, descontos: 0, cancelamentos: 0, cancelado: 0, devolucoes: 1, devolvido: 7_850 },
    { periodo: "2026-11-07", vendas: 1, vendido: 15_800, subtotal: 15_800, descontos: 0, ...SEM_ESTORNO },
    { periodo: "2026-11-10", vendas: 2, vendido: 139_900, subtotal: 139_900, descontos: 0, cancelamentos: 1, cancelado: 7_900, devolucoes: 0, devolvido: 0 },
  ],
  ...LISTAS,
});
const SEM_VENDAS = lerVendas({ totais: { vendas: 0, vendido: 0, subtotal: 0, descontos: 0, vendas_com_desconto: 0, ...SEM_ESTORNO }, periodos: [], ...LISTAS });

const ZERO = {
  itens: 0, vendido: 0, itens_com_custo: 0, vendido_com_custo: 0, custo: 0, itens_sem_custo: 0, vendido_sem_custo: 0,
  itens_devolvidos_com_custo: 0, devolvido_com_custo: 0, custo_devolvido: 0,
  itens_cancelados_com_custo: 0, cancelado_com_custo: 0, custo_cancelado: 0, margem: 0,
};
const DEVOLUCAO = { itens_devolvidos_com_custo: 1, devolvido_com_custo: 7_850, custo_devolvido: 1_800 };
const CANCELAMENTO = { itens_cancelados_com_custo: 1, cancelado_com_custo: 7_900, custo_cancelado: 1_800 };
const DIA_05 = { ...ZERO, itens: 5, vendido: 339_200, itens_com_custo: 4, vendido_com_custo: 331_300, custo: 230_000, itens_sem_custo: 1, vendido_sem_custo: 7_900, margem: 101_300 };
const DIA_06 = { ...ZERO, ...DEVOLUCAO, margem: -6_050 };
const DIA_07 = { ...ZERO, itens: 2, vendido: 15_800, itens_sem_custo: 2, vendido_sem_custo: 15_800 };
const DIA_10 = { ...ZERO, itens: 2, vendido: 139_900, itens_com_custo: 2, vendido_com_custo: 139_900, custo: 100_000, ...CANCELAMENTO, margem: 33_800 };
const TOTAIS_DA_MARGEM = {
  itens: 9, vendido: 494_900, itens_com_custo: 6, vendido_com_custo: 471_200, custo: 330_000, itens_sem_custo: 3, vendido_sem_custo: 23_700,
  ...DEVOLUCAO, ...CANCELAMENTO, margem: 129_050,
};
const DIAS_DA_MARGEM = [{ periodo: "2026-11-05", ...DIA_05 }, { periodo: "2026-11-06", ...DIA_06 }, { periodo: "2026-11-07", ...DIA_07 }, { periodo: "2026-11-10", ...DIA_10 }];
const MARGEM = lerMargem({ totais: TOTAIS_DA_MARGEM, periodos: DIAS_DA_MARGEM, lojas_com_custo: 1, lojas_fora: 0 });
const MARGEM_SEM_FATOS = lerMargem({ totais: ZERO, periodos: [], lojas_com_custo: 0, lojas_fora: 0 });
const MARGEM_SO_LOJAS_FORA = lerMargem({ totais: ZERO, periodos: [], lojas_com_custo: 0, lojas_fora: 2 });
const MARGEM_SEM_CUSTO = lerMargem({ totais: DIA_07, periodos: [{ periodo: "2026-11-07", ...DIA_07 }], lojas_com_custo: 1, lojas_fora: 0 });

/** FIN-009c: as células com tipo, como o CSV as escreve (o texto de antes do tipo). */
const emTexto = (linhas: readonly (readonly Celula[])[]) => linhas.map((l) => l.map(textoDaCelula));

describe("recorte de tempo", () => {
  it("7, 14 e 30 dias; o padrão é 14 e o que a tela não conhece cai nele", () => {
    expect(ORDEM_DOS_RELATORIOS).toEqual(["7", "14", "30"]);
    expect(ORDEM_DOS_RELATORIOS.map((p) => PERIODOS_DOS_RELATORIOS[p].rotulo)).toEqual(["7 dias", "14 dias", "30 dias"]);
    expect([periodoDoRelatorio("7"), periodoDoRelatorio("14"), periodoDoRelatorio("30")]).toEqual(["7", "14", "30"]);
    for (const valor of [undefined, null, "", "hoje", "15", 7, ["7"]]) expect(periodoDoRelatorio(valor)).toBe("14");
  });

  it("janelas: os últimos N dias até agora e os N anteriores na mesma hora do dia, sempre dia a dia", () => {
    const j = janelasDoRelatorio("14", AGORA);
    expect(j.porHora).toBe(false);
    expect([j.atual.inicio.toISOString(), j.atual.fim.toISOString()]).toEqual(["2026-10-28T03:00:00.000Z", "2026-11-10T18:00:00.000Z"]);
    expect([j.anterior.inicio.toISOString(), j.anterior.fim.toISOString()]).toEqual(["2026-10-14T03:00:00.000Z", "2026-10-27T18:00:00.000Z"]);
    expect(SETE.inicio.toISOString()).toBe("2026-11-04T03:00:00.000Z");
    expect(janelasDoRelatorio("30", AGORA).atual.inicio.toISOString()).toBe("2026-10-12T03:00:00.000Z");
    for (const p of ORDEM_DOS_RELATORIOS) {
      const { atual, anterior } = janelasDoRelatorio(p, AGORA);
      expect(diasDeVendas(SEM_VENDAS, atual), p).toHaveLength(PERIODOS_DOS_RELATORIOS[p].dias);
      expect(diasDeVendas(SEM_VENDAS, anterior), p).toHaveLength(PERIODOS_DOS_RELATORIOS[p].dias);
    }
  });

  it("os textos dos painéis de vendas falam do recorte do relatório", () => {
    expect(textosDoRelatorio("14")).toEqual({
      series: { atual: "Estes 14 dias", anterior: "14 dias anteriores" },
      antes: "nos 14 dias anteriores", comparacao: "os 14 dias anteriores", quando: "no período",
    });
    expect(textosDoRelatorio("7").series).toEqual({ atual: "Estes 7 dias", anterior: "7 dias anteriores" });
  });

  it("no financeiro (hoje, 7 e 30 dias), o relatório de 14 dias abre o de 30, o menor que cobre os 14", () => {
    expect(PERIODO_NO_FINANCEIRO).toEqual({ "7": "7", "14": "30", "30": "30" });
  });
});

describe("endereços", () => {
  it("o padrão (14 dias, sem loja, primeira página, uma linha por dia) fica fora do endereço", () => {
    expect(enderecoDosRelatorios("14", null)).toBe("/relatorios");
    expect(enderecoDosRelatorios("14", null, 1)).toBe("/relatorios");
    expect(enderecoDosRelatorios("7", null)).toBe("/relatorios?periodo=7");
    expect(enderecoDosRelatorios("30", "loja-a")).toBe("/relatorios?periodo=30&loja=loja-a");
    expect(enderecoDosRelatorios("14", "loja-a", 3)).toBe("/relatorios?loja=loja-a&pagina=3");
    expect(enderecoDaExportacao("14", null, "dias")).toBe("/relatorios/exportar");
    expect(enderecoDaExportacao("7", null, "dias")).toBe("/relatorios/exportar?periodo=7");
    expect(enderecoDaExportacao("30", "loja-a", "itens")).toBe("/relatorios/exportar?periodo=30&loja=loja-a&ver=itens");
  });

  it("visão do arquivo: só \"itens\" muda o padrão", () => {
    expect(["itens", "dias", undefined, null, "vendas", ["itens"]].map(visaoDaExportacao)).toEqual(["itens", "dias", "dias", "dias", "dias", "dias"]);
  });

  it("página: de 1 a 10.000; qualquer outra coisa é a primeira", () => {
    expect(["1", "2", "37", "10000"].map(paginaDoRelatorio)).toEqual([1, 2, 37, 10_000]);
    expect([undefined, "", "0", "-3", "abc"].map(paginaDoRelatorio)).toEqual([1, 1, 1, 1, 1]);
    expect(paginaDoRelatorio("99999")).toBe(10_000);
  });
});

describe("vendas por dia", () => {
  const dias = diasDeVendas(VENDAS, SETE);

  it("uma linha por dia da janela, com zero onde não houve fato", () => {
    expect(dias.map((d) => d.chave)).toEqual(["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]);
    expect(dias.map((d) => d.rotulo)).toEqual(["04/11", "05/11", "06/11", "07/11", "08/11", "09/11", "10/11"]);
    expect(dias.map((d) => d.vendas)).toEqual([0, 4, 0, 1, 0, 0, 2]);
    expect(dias.map((d) => d.vendido)).toEqual([0, 339_200, 0, 15_800, 0, 0, 139_900]);
    expect(dias[0]).toEqual({
      chave: "2026-11-04", rotulo: "04/11", vendas: 0, vendido: 0, subtotal: 0, descontos: 0, ...SEM_ESTORNO,
      desfeito: 0, liquido: 0, ticket: null, fracaoDeDesconto: null,
    });
  });

  it("dia sem venda não tem ticket nem percentual de desconto (não é zero)", () => {
    expect(dias.map((d) => d.ticket)).toEqual([null, 84_800, null, 15_800, null, null, 69_950]);
    expect(dias.map((d) => d.fracaoDeDesconto)).toEqual([null, 100 / 339_300, null, 0, null, null, 0]);
  });

  it("o desfeito conta no dia em que aconteceu, e o líquido do dia pode ficar abaixo de zero", () => {
    expect(dias.map((d) => d.desfeito)).toEqual([0, 0, 7_850, 0, 0, 0, 7_900]);
    expect(dias.map((d) => d.liquido)).toEqual([0, 339_200, -7_850, 15_800, 0, 0, 132_000]);
    expect(dias[2]).toMatchObject({ devolucoes: 1, devolvido: 7_850, cancelamentos: 0, cancelado: 0 });
    expect(dias[6]).toMatchObject({ devolucoes: 0, devolvido: 0, cancelamentos: 1, cancelado: 7_900 });
  });

  it("as linhas fecham com os totais do banco", () => {
    const soma = (valor: (d: (typeof dias)[number]) => number) => dias.reduce((s, d) => s + valor(d), 0);
    expect([soma((d) => d.vendas), soma((d) => d.vendido), soma((d) => d.descontos), soma((d) => d.desfeito)]).toEqual([7, 494_900, 100, 15_750]);
  });

  it("fato fora da janela não entra em linha nenhuma", () => {
    const comOutroDia = lerVendas({
      totais: { vendas: 1, vendido: 5_000, subtotal: 5_000, descontos: 0, vendas_com_desconto: 0, ...SEM_ESTORNO },
      periodos: [{ periodo: "2026-10-01", vendas: 1, vendido: 5_000, subtotal: 5_000, descontos: 0, ...SEM_ESTORNO }], ...LISTAS,
    });
    expect(diasDeVendas(comOutroDia, SETE).every((d) => d.vendas === 0 && d.vendido === 0)).toBe(true);
  });
});

describe("margem por dia", () => {
  const dias = diasDeMargem(MARGEM, SETE);

  it("dia sem fato nenhum: margem zero; dia com fato e nenhum custo gravado: margem desconhecida (nula)", () => {
    expect(dias.map((d) => d.chave)).toEqual(["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]);
    expect(dias.map((d) => d.margem)).toEqual([0, 101_300, -6_050, null, 0, 0, 33_800]);
    expect(dias[0]).toEqual({ chave: "2026-11-04", rotulo: "04/11", margem: 0, base: 0, custo: 0, fracao: null, cobertura: null, itensSemCusto: 0, vendidoSemCusto: 0 });
    expect(dias[3]).toEqual({ chave: "2026-11-07", rotulo: "07/11", margem: null, base: 0, custo: 0, fracao: null, cobertura: 0, itensSemCusto: 2, vendidoSemCusto: 15_800 });
  });

  it("base e custo são líquidos de devolução e cancelamento, cada um no seu dia: base − custo = margem", () => {
    expect(dias.map((d) => d.base)).toEqual([0, 331_300, -7_850, 0, 0, 0, 132_000]);
    expect(dias.map((d) => d.custo)).toEqual([0, 230_000, -1_800, 0, 0, 0, 98_200]);
    for (const d of dias) if (d.margem !== null) expect(d.base - d.custo, d.chave).toBe(d.margem);
  });

  it("percentual só com base positiva; cobertura só com venda no dia", () => {
    expect(dias.map((d) => d.fracao)).toEqual([null, 101_300 / 331_300, null, null, null, null, 33_800 / 132_000]);
    expect(dias.map((d) => d.cobertura)).toEqual([null, 331_300 / 339_200, null, 0, null, null, 1]);
    expect(dias.map((d) => d.itensSemCusto)).toEqual([0, 1, 0, 2, 0, 0, 0]);
  });

  it("os dias com margem conhecida fecham com o total do banco", () => {
    expect(dias.reduce((s, d) => s + (d.margem ?? 0), 0)).toBe(MARGEM.totais.margem);
  });

  it("sem fato nenhum, todos os dias valem zero", () => {
    expect(diasDeMargem(MARGEM_SEM_FATOS, SETE).map((d) => d.margem)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("exportação: uma linha por dia", () => {
  const COLUNAS_DE_VENDAS = ["Dia", "Vendas", "Vendido (R$)", "Ticket médio (R$)", "Valor de tabela (R$)", "Descontos (R$)", "Cancelamentos", "Cancelado (R$)", "Devoluções", "Devolvido (R$)", "Líquido (R$)"];
  const COLUNAS_DE_MARGEM = ["Margem bruta (R$)", "Vendido com custo, líquido (R$)", "Custo (R$)", "Margem (%)", "Cobertura do custo (%)", "Itens sem custo", "Vendido sem custo (R$)"];

  it("percentual do arquivo: uma casa, com vírgula; sem base, célula vazia", () => {
    expect([0.3241, 1, 0, -0.0512, 0.99949, null].map(percentualCsv)).toEqual(["32,4", "100,0", "0,0", "-5,1", "99,9", ""]);
  });

  it("sem a margem (quem não tem custo.ver): só as colunas de vendas, e nenhuma coluna de custo", () => {
    const t = tabelaDosDias(VENDAS, null, SETE);
    expect(t.colunas).toEqual(COLUNAS_DE_VENDAS);
    // FIN-009c: o dia e o dinheiro com tipo (o Excel guarda data e número); o total no rodapé, abaixo da tabela
    expect(t.linhas[1]?.slice(0, 4)).toEqual([{ dia: "2026-11-05" }, 4, { centavos: 339_200 }, { centavos: 84_800 }]);
    expect(t.rodape).toHaveLength(1);
    expect([...emTexto(t.linhas), ...emTexto(t.rodape)]).toEqual([
      ["04/11/2026", 0, "0,00", "", "0,00", "0,00", 0, "0,00", 0, "0,00", "0,00"],
      ["05/11/2026", 4, "3392,00", "848,00", "3393,00", "1,00", 0, "0,00", 0, "0,00", "3392,00"],
      ["06/11/2026", 0, "0,00", "", "0,00", "0,00", 0, "0,00", 1, "78,50", "-78,50"],
      ["07/11/2026", 1, "158,00", "158,00", "158,00", "0,00", 0, "0,00", 0, "0,00", "158,00"],
      ["08/11/2026", 0, "0,00", "", "0,00", "0,00", 0, "0,00", 0, "0,00", "0,00"],
      ["09/11/2026", 0, "0,00", "", "0,00", "0,00", 0, "0,00", 0, "0,00", "0,00"],
      ["10/11/2026", 2, "1399,00", "699,50", "1399,00", "0,00", 1, "79,00", 0, "0,00", "1320,00"],
      ["Total", 7, "4949,00", "707,00", "4950,00", "1,00", 1, "79,00", 1, "78,50", "4791,50"],
    ]);
    expect(JSON.stringify(t)).not.toMatch(/[Cc]usto|[Mm]argem/);
  });

  it("com a margem: sete colunas a mais; dia sem custo gravado fica com a margem vazia, não zero", () => {
    const t = tabelaDosDias(VENDAS, MARGEM, SETE);
    expect(t.colunas).toEqual([...COLUNAS_DE_VENDAS, ...COLUNAS_DE_MARGEM]);
    expect(t.linhas[1]?.slice(14, 16)).toEqual([{ fracao: expect.closeTo(0.3058, 3) }, { fracao: expect.closeTo(0.977, 3) }]);
    expect([...emTexto(t.linhas), ...emTexto(t.rodape)].map((l) => l.slice(11))).toEqual([
      ["0,00", "0,00", "0,00", "", "", 0, "0,00"],
      ["1013,00", "3313,00", "2300,00", "30,6", "97,7", 1, "79,00"],
      ["-60,50", "-78,50", "-18,00", "", "", 0, "0,00"],
      ["", "0,00", "0,00", "", "0,0", 2, "158,00"],
      ["0,00", "0,00", "0,00", "", "", 0, "0,00"],
      ["0,00", "0,00", "0,00", "", "", 0, "0,00"],
      ["338,00", "1320,00", "982,00", "25,6", "100,0", 0, "0,00"],
      ["1290,50", "4554,50", "3264,00", "28,3", "95,2", 3, "237,00"],
    ]);
    // As colunas de vendas são as mesmas do arquivo sem margem.
    expect(t.linhas.map((l) => l.slice(0, 11))).toEqual(tabelaDosDias(VENDAS, null, SETE).linhas);
    expect(t.linhas.every((l) => l.length === t.colunas.length)).toBe(true);
  });

  it("a linha Total repete os totais do banco, não a soma refeita das linhas", () => {
    // Totais com uma venda concluída antes da janela dos dias (o banco é quem diz o total).
    const vendas = lerVendas({
      totais: { vendas: 3, vendido: 30_000, subtotal: 30_000, descontos: 0, vendas_com_desconto: 0, ...SEM_ESTORNO },
      periodos: [{ periodo: "2026-11-10", vendas: 2, vendido: 20_000, subtotal: 20_000, descontos: 0, ...SEM_ESTORNO }], ...LISTAS,
    });
    expect(emTexto(tabelaDosDias(vendas, null, SETE).rodape)[0]).toEqual(["Total", 3, "300,00", "100,00", "300,00", "0,00", 0, "0,00", 0, "0,00", "300,00"]);
  });

  it("sem fato nenhum: a margem do período é zero; só sem custo gravado: é vazia (desconhecida)", () => {
    const semFatos = tabelaDosDias(SEM_VENDAS, MARGEM_SEM_FATOS, SETE);
    expect(semFatos.colunas).toHaveLength(18);
    expect(emTexto(semFatos.rodape)[0]).toEqual(["Total", 0, "0,00", "", "0,00", "0,00", 0, "0,00", 0, "0,00", "0,00", "0,00", "0,00", "0,00", "", "", 0, "0,00"]);
    const semCusto = tabelaDosDias(VENDAS, MARGEM_SEM_CUSTO, SETE);
    expect(emTexto(semCusto.rodape)[0]?.slice(11)).toEqual(["", "0,00", "0,00", "", "0,0", 2, "158,00"]);
    expect(emTexto(semCusto.linhas)[3]?.slice(11)).toEqual(["", "0,00", "0,00", "", "0,0", 2, "158,00"]);
    expect(emTexto(semCusto.linhas)[0]?.slice(11)).toEqual(["0,00", "0,00", "0,00", "", "", 0, "0,00"]);
  });

  it("movimento só em loja em que quem pede não vê o custo: arquivo sem as colunas de margem, e o aviso na última linha", () => {
    const t = tabelaDosDias(VENDAS, MARGEM_SO_LOJAS_FORA, SETE);
    expect(t.colunas).toEqual(COLUNAS_DE_VENDAS);
    expect(t.linhas).toEqual(tabelaDosDias(VENDAS, null, SETE).linhas);
    expect(t.rodape[0]).toEqual(tabelaDosDias(VENDAS, null, SETE).rodape[0]);
    expect(t.rodape.at(-1)).toEqual(["Atenção: arquivo sem as colunas de margem, porque o movimento do período foi só em loja em que você não vê o custo."]);
  });

  it("loja com movimento fora da margem: a última linha avisa quantas", () => {
    const com = (lojasFora: number) => tabelaDosDias(VENDAS, lerMargem({ totais: TOTAIS_DA_MARGEM, periodos: DIAS_DA_MARGEM, lojas_com_custo: 1, lojas_fora: lojasFora }), SETE).rodape.at(-1);
    expect(com(1)).toEqual(["Atenção: a margem considera só as lojas em que você vê o custo; 1 loja com movimento ficou fora."]);
    expect(com(3)).toEqual(["Atenção: a margem considera só as lojas em que você vê o custo; 3 lojas com movimento ficaram fora."]);
    expect(com(0)?.[0]).toBe("Total");
  });

  it("o arquivo abre no Excel em português: ponto e vírgula, e negativo como número", () => {
    const t = tabelaDosDias(VENDAS, MARGEM, SETE);
    const linhas = gerarCsvEmSecoes([{ colunas: t.colunas, linhas: t.linhas }, { linhas: t.rodape }]).split("\r\n");
    // o cabeçalho, os sete dias, a linha em branco e o total (FIN-009c: o total abaixo da tabela)
    expect(linhas).toHaveLength(10);
    expect(linhas[8]).toBe("");
    expect(linhas[9]?.startsWith("Total;7;4949,00;707,00;")).toBe(true);
    expect(linhas[3]).toBe("06/11/2026;0;0,00;;0,00;0,00;0;0,00;1;78,50;-78,50;-60,50;-78,50;-18,00;;;0;0,00");
    // "Vendido com custo, líquido (R$)" tem vírgula, não ponto e vírgula: não precisa de aspas.
    expect(linhas[0]?.split(";")).toHaveLength(18);
  });
});

describe("exportação: uma linha por item (detalhe da margem)", () => {
  const ITEM = {
    venda_id: "venda-2", numero: 1002, concluida_em: "2026-11-05T13:15:00+00:00", unidade_id: "loja-a", unidade: "Loja A", situacao: "concluida",
    item_id: "item-2", tipo: "acessorio", variante: "Capa (fictícia)", sku: "CAPA-01",
    quantidade: 2, preco_unitario: 7_900, desconto: 100, valor: 15_700, custo_unitario: 1_800, margem: 12_100, devolvidos: 1,
  };
  const COLUNAS = ["Venda", "Concluída em", "Loja", "Situação da venda", "Tipo", "Produto", "SKU", "Quantidade", "Preço unitário (R$)", "Desconto (R$)", "Valor (R$)", "Custo unitário (R$)", "Margem bruta (R$)", "Unidades devolvidas"];

  it("as colunas e os valores do item, com a hora de São Paulo", () => {
    const t = tabelaDosItens(lerItensDaMargem({ total: 1, itens: [ITEM] }).itens);
    expect(t.colunas).toEqual(COLUNAS);
    expect(t.linhas[0]?.[1]).toEqual({ instante: "2026-11-05T13:15:00+00:00" });
    expect(emTexto(t.linhas)).toEqual([[1002, "05/11/2026 10:15", "Loja A", "concluída", "Acessório", "Capa (fictícia)", "CAPA-01", 2, "79,00", "1,00", "157,00", "18,00", "121,00", 1]]);
  });

  it("item sem custo gravado: custo e margem vazios, nunca zero; textos ausentes ficam vazios", () => {
    const itens = lerItensDaMargem({ total: 2, itens: [
      { ...ITEM, item_id: "item-3", custo_unitario: null, margem: null, devolvidos: 0 },
      { ...ITEM, item_id: "item-4", situacao: "cancelada", tipo: "tipo_novo", unidade: null, variante: null, sku: null, custo_unitario: 20_000, margem: -24_300 },
    ] }).itens;
    const [semCusto, comPrejuizo] = emTexto(tabelaDosItens(itens).linhas);
    expect(semCusto?.slice(11)).toEqual(["", "", 0]);
    expect(comPrejuizo).toEqual([1002, "05/11/2026 10:15", "", "cancelada", "tipo_novo", "", "", 2, "79,00", "1,00", "157,00", "200,00", "-243,00", 1]);
  });

  it("sem itens: só o cabeçalho", () => {
    expect(tabelaDosItens([])).toEqual({ colunas: COLUNAS, linhas: [], rodape: [] });
  });
});
