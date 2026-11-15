// A planilha do Excel no servidor (lote FIN-009c): a mesma de lib/xlsx, com cada arquivo do pacote comprimido pelo
// deflate do node:zlib (a planilha fica muito menor: o XML se repete muito). Só para rotas e código do servidor.
import { deflateRawSync } from "node:zlib";

import { gerarCsvEmSecoes, type FormatoDaPlanilha, type SecaoCsv } from "./csv";
import { montarXlsx, TIPO_XLSX, type Aba } from "./xlsx";

export const gerarXlsx = (abas: readonly Aba[]) => montarXlsx(abas, (dados) => deflateRawSync(dados));

/**
 * A resposta da rota de exportação no formato pedido: as mesmas seções no Excel (uma aba com o nome dado) ou no CSV.
 * `arquivo` é o nome sem a extensão; nunca fica guardada em cache.
 */
export function respostaDaPlanilha(formato: FormatoDaPlanilha, arquivo: string, aba: string, secoes: readonly SecaoCsv[]): Response {
  const csv = formato === "csv";
  return new Response(csv ? gerarCsvEmSecoes(secoes) : gerarXlsx([{ nome: aba, secoes }]), {
    headers: {
      "content-type": csv ? "text/csv; charset=utf-8" : TIPO_XLSX,
      "content-disposition": `attachment; filename="${arquivo}.${formato}"`,
      "cache-control": "no-store",
    },
  });
}
