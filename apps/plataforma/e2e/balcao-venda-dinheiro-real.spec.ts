// Aceite do lote B (#114), PREPARADO para DEPOIS da publicação (não rodar antes): UMA venda fictícia em dinheiro no celular,
// como o Vendedor (teste), só na Santa Cândida (teste). Confere o comprovante (a capa, o dinheiro e os atalhos "Ver vendas" e
// "Ver meu caixa"), o caixa do mesmo turno ("Dinheiro esperado na gaveta" sobe R$ 79,00) e o estoque do SKU antes e depois
// (uma capa a menos). "A conta do período" do Financeiro de teste corrobora, em leitura: o Gerente (teste), na mesma loja,
// vê a conta fechar.
//
// GRAVA só a venda: uma capa (ACE-0001, R$ 79,00) paga em dinheiro. Nada de cliente, cartão, Pix, nota, estoque comercial nem
// REIN. Como as outras provas do PDV: o caixa do vendedor abre com troco zero se estiver fechado, e uma venda aberta de outra
// rodada é cancelada com o motivo antes de começar (o estoque "antes" é medido depois disso, para a reserva dela não contar).
//
// Rodar sozinho, depois de publicado o #114:
//   ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt \
//   npx playwright test e2e/balcao-venda-dinheiro-real.spec.ts --project=celular-360 --workers=1
// No CI, fica pulado (só no servidor).
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import {
  abrirTelaDoCaixa, CAPA, cancelarVendaAberta, cartao, concluir, dinheiroNaGaveta, horaDeBrasilia, novaVenda, pagar, pdvComCaixaAberto, porNoCarrinho,
} from "./pdv-real";
import { comPessoas, disponivelNaLista, escolher, GERENTE_A, VENDEDOR } from "./telas-reais";

/** O dinheiro esperado na gaveta, em reais; o caixa sem lançamento ("Sem lançamento" no lote B, "Sem lançamentos." antes) é zero. */
async function gaveta(p: Page): Promise<number> {
  await abrirTelaDoCaixa(p);
  const cartaoDoCaixa = cartao(p, "Meu caixa aberto");
  await expect(cartaoDoCaixa).toBeVisible();
  if ((await cartaoDoCaixa.getByText(/^Sem lançamentos?\.?$/).filter({ visible: true }).count()) > 0) return 0;
  return Number((await dinheiroNaGaveta(p)).replace(/\./g, "").replace(",", "."));
}

test.describe("o balcão do lote B no site no ar: uma venda fictícia em dinheiro (#114)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("Vender → Comprovante → Caixa e Estoque, com A conta do período em leitura", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
    const vez = horaDeBrasilia();
    await comPessoas(browser, [[VENDEDOR], [GERENTE_A]], async (pessoas) => {
      const v = pessoas[VENDEDOR] as Page;
      const g = pessoas[GERENTE_A] as Page;
      for (const p of [v, g]) p.setDefaultTimeout(30_000);

      await pdvComCaixaAberto(v);
      await cancelarVendaAberta(v, `aceite do #114: venda aberta de outra rodada (${vez})`);
      const antes = await test.step(`o estoque de ${CAPA.nome} (${CAPA.sku}) antes`, () => disponivelNaLista(v, CAPA.sku));
      const gavetaAntes = await gaveta(v);
      await pdvComCaixaAberto(v);

      await test.step("Vender: uma capa pela busca do SKU exato, paga em dinheiro", async () => {
        await novaVenda(v);
        await porNoCarrinho(v, CAPA);
        await pagar(v, [{ nome: "Dinheiro", valor: "79,00" }]);
        await concluir(v);
      });

      await test.step("Comprovante: a capa, o dinheiro e os atalhos para Vendas e para o caixa", async () => {
        await expect(v.getByText(CAPA.nome).first()).toBeVisible();
        await expect(v.getByText(/R\$\s?79,00/).first()).toBeVisible();
        await expect(v.getByRole("link", { name: "Ver vendas" })).toBeVisible();
        await expect(v.getByRole("link", { name: "Ver meu caixa" })).toBeVisible();
      });

      await test.step("Caixa do mesmo turno: o dinheiro esperado na gaveta sobe R$ 79,00", async () => {
        expect((await gaveta(v)) - gavetaAntes).toBeCloseTo(79, 2);
      });

      await test.step(`Estoque: uma ${CAPA.nome} a menos`, async () => {
        expect(await disponivelNaLista(v, CAPA.sku)).toBe(antes - 1);
      });

      await test.step("A conta do período no Financeiro de teste (só leitura): a conta fecha", async () => {
        await g.goto("/financeiro");
        await expect(g.getByRole("heading", { level: 1, name: "Financeiro", exact: true })).toBeVisible();
        await escolher(g, "Período", "30 dias");
        const conta = cartao(g, "A conta do período");
        await expect(conta).toBeVisible();
        await expect(conta.getByText("não fecha", { exact: false })).toHaveCount(0);
        await expect(conta.getByText("Não deu para conferir a conta do período agora.", { exact: false })).toHaveCount(0);
      });
    });
  });
});
