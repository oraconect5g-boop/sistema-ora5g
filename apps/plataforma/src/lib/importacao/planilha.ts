// A planilha da importação (lote CAT-002b: ORA-CAT-002), em CSV ou do Excel (.xlsx): escolhe o leitor pelo começo do
// arquivo (o .xlsx é um ZIP; o .xls antigo, e o .xlsx com senha, um arquivo do Office antigo), e não pelo nome, que a
// pessoa pode trocar. Os dois leitores devolvem a mesma Planilha, com os mesmos limites e erros (lib/importacao/csv.ts).
import { ErroDaPlanilha, LIMITES_DA_PLANILHA, lerCabecalho, lerCsv, type Planilha } from "./csv";
import { lerXlsx, pareceXlsAntigo, pareceXlsx, type Descomprimir } from "./xlsx";

const doExcel = (inicio: Uint8Array) => pareceXlsx(inicio) || pareceXlsAntigo(inicio);

/** O arquivo inteiro (no servidor, que relê tudo antes da prévia). */
export async function lerPlanilha(bytes: Uint8Array, descomprimir: Descomprimir): Promise<Planilha> {
  return doExcel(bytes) ? await lerXlsx(bytes, descomprimir) : lerCsv(bytes);
}

/**
 * Só as colunas, no aparelho, antes do envio: do CSV, o começo do arquivo; do Excel, o arquivo inteiro (até 5 MB),
 * porque o ZIP guarda o índice no fim. `aba` é a aba lida no Excel (nulo no CSV).
 */
export async function lerColunasDoArquivo(arquivo: Blob, descomprimir: Descomprimir): Promise<{ colunas: string[]; aba: string | null }> {
  const inicio = new Uint8Array(await arquivo.slice(0, 8).arrayBuffer());
  if (!doExcel(inicio)) return { colunas: lerCabecalho(new Uint8Array(await arquivo.slice(0, 64 * 1024).arrayBuffer())).colunas, aba: null };
  if (arquivo.size > LIMITES_DA_PLANILHA.bytes) throw new ErroDaPlanilha("grande");
  const planilha = await lerXlsx(new Uint8Array(await arquivo.arrayBuffer()), descomprimir, { soCabecalho: true });
  return { colunas: planilha.cabecalho, aba: planilha.aba ?? null };
}
