// Prova da reanálise do Codex de 18/11 (docs/analises/reanalise-2026-11-18/evidencias/, PR #104) com o arquivo ORIGINAL
// da Rein (relatorioProdutos131258.xlsx, posição de 10/11/2026 às 13:20). O arquivo é privado e não entra no repositório
// público: a prova roda quando ARQUIVO_ESTOQUE_AUDITORIA aponta para ele (no servidor, depois da entrega privada) e pula
// sem ele (no CI). As expectativas são as da auditoria, sem mudança: 83 colunas, 2.271 produtos, o rodapé da linha 2.273
// de fora e as partes de 2.000 e 271.
//
// REIN-d (23/11/2026): o arquivo chegou ao servidor (~/entrada/rein/, fora do repositório) e a prova acima REPROVOU: os
// totais do rodapé estão deslocados (ver rein-relatorio-original.test.ts). A segunda prova confere, com o original, o que
// a correção promete, só pela forma do arquivo (nenhum número comercial fica escrito aqui).
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { linhasDaCarga, sugerirMapaDaCarga } from '../estoque/carga';
import { lerPlanilha } from './planilha';
import { descomprimirNoServidor } from './descomprimir-servidor';
import { candidatoARodape, codigosDeBarrasEmBranco, dividirEmPartes, linhaDeTotal, montarLinhas, rodapeDaPlanilha, sugerirMapeamento, valoresArredondados } from './catalogo';

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

it.skipIf(!process.env.ARQUIVO_ESTOQUE_AUDITORIA)('REIN-d: no arquivo original, o rodapé sai pelas somas de outras colunas, as colunas são sugeridas e a carga não leva linha com problema', async () => {
  const p = await lerPlanilha(new Uint8Array(readFileSync(process.env.ARQUIVO_ESTOQUE_AUDITORIA!)), descomprimirNoServidor);
  const mapa = sugerirMapeamento(p.cabecalho);
  // O catálogo: o código (4 dígitos), o nome, a família como categoria, a marca, o código de barras e o custo; o preço
  // não é sugerido (são três tabelas).
  expect(Object.fromEntries(Object.entries(mapa).map(([campo, coluna]) => [campo, p.cabecalho[coluna as number]]))).toEqual({
    sku: 'Codigo', nome: 'Produto', categoria: 'Familia', marca: 'Marca', codigo_barras: 'Codigo Barras', custo: 'Custo Unit. (R$)' });
  expect(mapa.preco).toBeUndefined();
  // O rodapé: a linha 2.273 da folha, comprovada por 15 dos 18 números, que são a soma de OUTRA coluna.
  const rodape = rodapeDaPlanilha(p, mapa);
  expect(rodape?.posicao).toBe(2271);
  expect(p.numeros[2271]).toBe(2273);
  expect(rodape?.motivo).toBe(
    'rodapé de totais no fim da planilha (sem código e sem nome, só números em 18 colunas, 18 delas escritas com vírgula numa célula de número e lidas como estão; '
    + 'em 15 delas o número é a soma de outra coluna (o relatório escreve os totais deslocados))');
  expect(candidatoARodape(p, mapa)).toBeNull();
  // As linhas do catálogo, com o preço de uma das três tabelas: todas com o código e o nome; o código nunca se repete;
  // nenhuma linha com erro de leitura.
  const comPreco = { ...mapa, preco: p.cabecalho.indexOf('Preco Original (R$) TABELA NORMAL') };
  expect(comPreco.preco).toBeGreaterThan(0);
  const linhas = montarLinhas(p, comPreco, { tipo: 'acessorio', categoria: 'Acessórios' }).filter((_, i) => i !== rodape?.posicao);
  expect(linhas).toHaveLength(2271);
  expect(linhas.filter((l) => l.sku === null || l.nome === null)).toEqual([]);
  expect(new Set(linhas.map((l) => l.sku)).size).toBe(2271);
  expect(linhas.filter((l) => l.erros.length > 0).map((l) => l.erros)).toEqual([]);
  // Os ajustes da leitura, que a prévia mostra: os custos médios e os preços calculados com mais de duas casas,
  // arredondados ao centavo, e os códigos de barras de 15 dígitos, em branco. "SEM GTIN" não vira código de barras.
  expect(valoresArredondados(p, comPreco, 'custo', rodape?.posicao)?.celulas).toBe(38);
  expect(valoresArredondados(p, comPreco, 'preco', rodape?.posicao)?.celulas).toBe(5);
  expect(codigosDeBarrasEmBranco(p, comPreco, rodape?.posicao)?.celulas).toBe(4);
  expect(linhas.filter((l) => l.codigo_barras !== null && !/^\d{8,14}$/.test(l.codigo_barras))).toEqual([]);
  // A carga do estoque: os 12 locais do relatório com o físico e o disponível sugeridos; as lojas de teste, sem coluna.
  const lojas = ['Santa Felicidade', 'Água Verde', 'Colônia', 'Almirante Tamandaré', 'DEFEITOS', 'Dubai', 'Colombo', 'Muffato Santa', 'Butiatuvinha', 'Ventania', 'Balneário',
    'Santa Cândida', 'Santa Cândida (teste)', 'Loja de teste 2'].map((nome) => ({ id: nome, nome }));
  const sugestao = sugerirMapaDaCarga(p.cabecalho, lojas);
  expect(Object.keys(sugestao.lojas).sort()).toEqual(lojas.slice(0, 12).map((l) => l.id).sort());
  for (const [loja, colunas] of Object.entries(sugestao.lojas)) {
    expect(p.cabecalho[colunas.fisico as number]?.toLowerCase(), loja).toMatch(/^qtd\. (?!disponivel)/);
    expect(p.cabecalho[colunas.disponivel as number]?.toLowerCase(), loja).toMatch(/^qtd\. disponivel /);
  }
  const carga = linhasDaCarga(p, { sku: sugestao.sku as number, nome: sugestao.nome as number, lojas: sugestao.lojas as Record<string, { fisico: number; disponivel: number }> });
  expect(carga.deFora?.posicao).toBe(2271);
  expect(carga.candidato).toBeNull();
  expect(carga.foraDoPadrao).toEqual({});
  for (const [loja, daLoja] of Object.entries(carga.porLoja)) {
    expect(daLoja.length, loja).toBeGreaterThan(0);
    expect(daLoja.filter((l) => l.numero === 2273 || l.sku === '' || l.problema !== undefined), loja).toEqual([]);
  }
});

