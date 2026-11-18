import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { lerPlanilha } from './planilha';
import { descomprimirNoServidor } from './descomprimir-servidor';
import { dividirEmPartes, linhaDeTotal, sugerirMapeamento } from './catalogo';

it('lê o arquivo original enviado pelo proprietário e preserva os 2271 produtos', async () => {
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
