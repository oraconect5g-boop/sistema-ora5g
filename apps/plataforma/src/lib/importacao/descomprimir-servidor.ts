// O deflate cru da planilha do Excel no servidor (lote CAT-002b), pelo node:zlib. Só para rotas e código do servidor;
// no navegador, descomprimir-navegador.ts. A saída nunca passa do tamanho declarado no ZIP: passou, o zlib para e lança.
import { inflateRawSync } from "node:zlib";

import type { Descomprimir } from "./xlsx";

export const descomprimirNoServidor: Descomprimir = async (dados, tamanho) => inflateRawSync(dados, { maxOutputLength: Math.max(1, tamanho) });
