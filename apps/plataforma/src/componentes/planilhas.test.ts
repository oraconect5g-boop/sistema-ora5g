// Os botões das planilhas (lote FIN-009c: ORA-FIN-009): o Excel e o CSV do mesmo endereço, para as que vêm do servidor,
// e os dois botões das montadas no navegador, que ficam desligados sem nenhuma linha. Dados fictícios.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { comFormato, formatoPedido } from "../lib/csv";
import { BaixarPlanilha } from "./BaixarPlanilha";
import { ExportarPlanilha } from "./ExportarPlanilha";

describe("botões das planilhas (FIN-009c)", () => {
  it("o mesmo endereço nos dois formatos, sem perder o filtro; o formato que vier no endereço é trocado", () => {
    expect(comFormato("/financeiro/exportar?ver=pagamentos&periodo=7", "xlsx")).toBe("/financeiro/exportar?ver=pagamentos&periodo=7&formato=xlsx");
    expect(comFormato("/resultado/exportar", "csv")).toBe("/resultado/exportar?formato=csv");
    expect(comFormato("/estoque/exportar?formato=xlsx&loja=rede", "csv")).toBe("/estoque/exportar?formato=csv&loja=rede");
    expect([formatoPedido("xlsx", "csv"), formatoPedido("csv", "xlsx"), formatoPedido(null, "csv"), formatoPedido("pdf", "xlsx")]).toEqual(["xlsx", "csv", "csv", "xlsx"]);
  });

  it("do servidor: o Excel em destaque e o CSV ao lado, os dois para baixar e fora do papel", () => {
    const html = renderToStaticMarkup(createElement(BaixarPlanilha, { endereco: "/relatorios/exportar?periodo=7", rotulo: "Exportar por dia" }));
    expect(html).toContain('href="/relatorios/exportar?periodo=7&amp;formato=xlsx"');
    expect(html).toContain('href="/relatorios/exportar?periodo=7&amp;formato=csv"');
    expect(html).toContain("Exportar por dia (Excel)</a>");
    expect(html).toContain('aria-label="Exportar por dia em CSV"');
    expect(html.match(/download=""/g)).toHaveLength(2);
    expect(html).toContain("nao-imprimir");
  });

  it("do navegador: os dois botões; sem nenhuma linha nas tabelas, desligados", () => {
    const com = renderToStaticMarkup(createElement(ExportarPlanilha, {
      nomeArquivo: "recebiveis-2026-11-15", aba: "Recebíveis", rotulo: "Planilha",
      secoes: [{ colunas: ["Quem deve", "A receber (R$)"], linhas: [["PicPay", { centavos: 7_900 }]] }],
    }));
    expect(com).toContain("Planilha (Excel)</button>");
    expect(com).toContain('aria-label="Planilha em CSV"');
    expect(com).not.toContain('disabled=""');
    const sem = renderToStaticMarkup(createElement(ExportarPlanilha, {
      nomeArquivo: "x", aba: "x", rotulo: "Planilha", secoes: [{ linhas: [["Título"]] }, { colunas: ["A"], linhas: [] }],
    }));
    expect(sem.match(/disabled=""/g)).toHaveLength(2);
  });
});
