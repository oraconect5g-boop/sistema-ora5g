"use client";

import { Download } from "lucide-react";

import { gerarCsvEmSecoes, type FormatoDaPlanilha, type SecaoCsv } from "../lib/csv";
import { montarXlsx, TIPO_XLSX } from "../lib/xlsx";
import { classeBotao } from "./ui";

// A planilha que está na tela, montada no navegador (lote FIN-009c: ORA-FIN-009), no Excel ou em CSV. Serve ao que
// não vai ao servidor (a simulação e o saldo digitados na previsão) e às tabelas que a tela já leu. Só exporta o que
// o perfil já está vendo: o filtro de permissão acontece antes, no servidor. O Excel vai sem compressão (o navegador
// não tem o deflate do servidor à mão): o arquivo fica maior, mas são poucas linhas. As telas da demonstração seguem
// com o ExportarCsv.
export function ExportarPlanilha({ nomeArquivo, aba, secoes, rotulo }: {
  /** Sem o "ora5g-" e sem a extensão. */
  nomeArquivo: string;
  /** O nome da aba no Excel. */
  aba: string;
  secoes: readonly SecaoCsv[];
  rotulo: string;
}) {
  function baixar(formato: FormatoDaPlanilha) {
    const arquivo = formato === "xlsx"
      ? new Blob([montarXlsx([{ nome: aba, secoes }], null)], { type: TIPO_XLSX })
      : new Blob([gerarCsvEmSecoes(secoes)], { type: "text/csv;charset=utf-8" });
    const endereco = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = endereco;
    link.download = `ora5g-${nomeArquivo}.${formato}`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(endereco);
  }
  // Sem nenhuma linha nas tabelas, não há o que baixar.
  const vazia = !secoes.some((s) => s.colunas && s.linhas.length > 0);
  return (
    <span className="nao-imprimir inline-flex flex-wrap items-center gap-x-3 gap-y-2">
      <button type="button" onClick={() => baixar("xlsx")} disabled={vazia} className={classeBotao("secundario", "md")}>
        <Download aria-hidden className="size-4" />
        {rotulo} (Excel)
      </button>
      <button type="button" onClick={() => baixar("csv")} disabled={vazia} aria-label={`${rotulo} em CSV`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-acao hover:underline disabled:cursor-not-allowed disabled:opacity-50">CSV</button>
    </span>
  );
}
