// Prova da reanálise do Codex de 18/11 (docs/analises/reanalise-2026-11-18/evidencias/, PR #104) com o arquivo ORIGINAL
// da Rein (relatorioProdutos131258.xlsx, posição de 10/11/2026 às 13:20). O arquivo é privado e não entra no repositório
// público: a prova roda quando ARQUIVO_ESTOQUE_AUDITORIA aponta para ele (no servidor, depois da entrega privada) e pula
// sem ele (no CI). As expectativas são as da auditoria, sem mudança: 83 colunas, 2.271 produtos, o rodapé da linha 2.273
// de fora e as partes de 2.000 e 271.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { lerPlanilha } from './planilha';
import { descomprimirNoServidor } from './descomprimir-servidor';
import { dividirEmPartes, linhaDeTotal, sugerirMapeamento } from './catalogo';

it.skipIf(!process.env.ARQUIVO_ESTOQUE_AUDITORIA)('lê o arquivo original enviado pelo proprietário e preserva os 2271 produtos', async () => {
  const path = process.env.ARQUIVO_ESTOQUE_AUDITORIA;
  expect(path).toBeTruthy();
  const p = await lerPlanilha(new Uint8Array(readFileSync(path!)), descomprimirNoServidor);
  const mapa = sugerirMapeamento(p.cabecalho);
  const total = linhaDeTotal(p, mapa);
  const produtos = p.linhas.filter((_, i) => i !== total);
  expect(p.cabecalho).toHaveLength(83);
  expect(produtos).toHaveLength(2271);
  expect(total).not.toBeNull();
  expect(dividirEmPartes(produtos).map(x => x.length)).toEqual([2000,271]);
});
