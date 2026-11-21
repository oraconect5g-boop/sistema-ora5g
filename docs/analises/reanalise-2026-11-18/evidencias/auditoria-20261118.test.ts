// Provas independentes da revisão de 18/11. Arquivos inteiramente sintéticos.
// As expectativas expressam o comportamento seguro; falham no commit auditado.
import { expect, it } from 'vitest';
import { gerarXlsx } from '../xlsx-servidor';
import { lerPlanilha } from './planilha';
import { descomprimirNoServidor } from './descomprimir-servidor';
import { rodapeDaPlanilha } from './catalogo';
import { linhasDaCarga } from '../estoque/carga';

it('F18-01: quantidade numérica fracionária do XLSX deve exigir conferência', async () => {
  const bytes = gerarXlsx([{ nome: 'Produtos', secoes: [{
    colunas: ['Código', 'Descrição', 'Santa Cândida Qtd.', 'Santa Cândida Qtd. Disponível'],
    linhas: [['ACE-1', 'Cabo de teste', 0.625, 0.625]],
  }] }]);
  const planilha = await lerPlanilha(bytes, descomprimirNoServidor);
  expect(planilha.linhas[0]?.[2]).toBe('0.625');
  const carga = linhasDaCarga(planilha, { sku: 0, nome: 1, lojas: { loja: { fisico: 2, disponivel: 3 } } });
  expect(carga.porLoja.loja?.[0]?.fisico).toBeNull();
  expect(carga.porLoja.loja?.[0]?.problema).toBeTruthy();
});

it('F18-02: última linha incompleta com EAN e preço não pode desaparecer como total', async () => {
  const bytes = gerarXlsx([{ nome: 'Produtos', secoes: [{
    colunas: ['Código', 'Descrição', 'EAN', 'Preço'],
    linhas: [['ACE-1', 'Cabo de teste', '7890000000001', 10], ['', '', '7890000000002', 49]],
  }] }]);
  const planilha = await lerPlanilha(bytes, descomprimirNoServidor);
  expect(rodapeDaPlanilha(planilha, { sku: 0, nome: 1, codigo_barras: 2, preco: 3 })).toBeNull();
});
