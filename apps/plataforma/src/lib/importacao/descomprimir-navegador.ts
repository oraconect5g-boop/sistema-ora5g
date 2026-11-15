// O deflate cru da planilha do Excel no navegador (lote CAT-002b), pelo DecompressionStream ("deflate-raw": Chrome e
// Edge desde a versão 103, Firefox desde a 113, Safari desde a 16.4). Navegador sem ele: ErroDaPlanilha("navegador"),
// e a tela pede para atualizar o navegador ou salvar a planilha como CSV. A saída nunca passa do tamanho declarado no ZIP.
import { ErroDaPlanilha } from "./csv";
import type { Descomprimir } from "./xlsx";

export const descomprimirNoNavegador: Descomprimir = async (dados, tamanho) => {
  let fluxo: DecompressionStream;
  try {
    fluxo = new DecompressionStream("deflate-raw");
  } catch {
    throw new ErroDaPlanilha("navegador");
  }
  const leitor = new Blob([new Uint8Array(dados)]).stream().pipeThrough(fluxo).getReader();
  const saida = new Uint8Array(tamanho);
  let usado = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (usado + value.byteLength > tamanho) {
      await leitor.cancel().catch(() => undefined);
      throw new ErroDaPlanilha("xlsx");
    }
    saida.set(value, usado);
    usado += value.byteLength;
  }
  return saida.subarray(0, usado);
};
