// Lote J1-b (19/11/2026; ORA-POS-002 e ORA-QUAL-010; o sim do proprietário de 19/11 ao teste de ponta a ponta da venda): a
// venda de verdade, num celular de 360 px, com a conta de teste do vendedor na loja de teste Santa Cândida (teste), no site
// no ar. Abre o caixa se precisar, abre a venda, acha a capa pelo SKU, põe no carrinho, tira, põe de novo, paga em dinheiro
// e conclui; confere o comprovante e o estoque da loja (um a menos).
//
// GRAVA de verdade, só na loja de teste: uma venda de R$ 79,00 por vez (a capa de proteção, ACE-0001, paga em dinheiro), e
// deixa o caixa do vendedor de teste aberto para a vez seguinte. A venda que ficou aberta numa vez que falhou é cancelada no
// começo, com o motivo (o item volta ao estoque). Só roda no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts);
// no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, contaDeTeste, entrar, noAr } from "./contas-de-teste";

const SKU = "ACE-0001";
const NOME = "Capa de proteção";
const PRECO = "R$ 79,00";

/** O disponível da capa (físico menos reservado) na lista do Estoque da loja do turno. */
async function disponivelNoEstoque(pagina: Page): Promise<number> {
  await pagina.goto(`/estoque?q=${SKU}`);
  const linha = pagina.getByRole("listitem").filter({ hasText: SKU }).filter({ hasText: "na rede" }).first();
  await expect(linha).toBeVisible();
  const numero = /(\d+)\s*na rede/.exec(await linha.innerText());
  if (!numero) throw new Error(`a linha da ${NOME} no Estoque não mostrou o disponível`);
  return Number(numero[1]);
}

/** A tela do PDV chega em partes: espera o conteúdo (a venda aberta ou o botão de nova venda) antes de olhar o resto. */
async function pdvPronto(pagina: Page) {
  await expect(pagina.getByRole("button", { name: "Nova venda" }).or(pagina.getByText(/Venda nº \d+/)).first()).toBeVisible();
}

/** Acha a capa pelo SKU na busca do PDV e põe uma no carrinho. */
async function porNoCarrinho(pagina: Page) {
  await pagina.getByLabel(/Produto, marca, SKU/).fill(SKU);
  await pagina.getByRole("button", { name: "Buscar" }).click();
  const resultado = pagina.getByRole("listitem").filter({ hasText: SKU }).filter({ hasText: "livre(s) aqui" });
  await expect(resultado).toContainText(PRECO);
  await resultado.getByRole("button", { name: "Adicionar" }).click();
}

test.describe("a venda de verdade na loja de teste (J1-b)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("abre o caixa se precisar, põe a capa, tira, põe de novo, paga em dinheiro e conclui; o estoque baixa um", async ({ page }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(120_000);
    const vendedor = contaDeTeste("Vendedor (teste)");
    const carrinho = page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: "Carrinho", exact: true }) });

    await test.step("entra na loja de teste", async () => {
      await entrar(page, vendedor);
      await expect(page.getByText(vendedor.onde).first()).toBeVisible();
    });

    await test.step("o caixa aberto", async () => {
      await page.goto("/vender");
      await pdvPronto(page);
      const abrir = page.getByRole("button", { name: "Abrir caixa" });
      if (await abrir.isVisible()) {
        await abrir.click();
        await expect(abrir).toBeHidden();
        await pdvPronto(page);
      }
      // Com o caixa aberto, o cartão "Abra o seu caixa" some (sem caixa, a venda não é concluída).
      await expect(page.getByText("Abra o seu caixa")).toHaveCount(0);
    });

    await test.step("a venda que ficou aberta numa vez que falhou é cancelada (o item volta ao estoque)", async () => {
      const cancelar = page.locator("details").filter({ hasText: "Cancelar esta venda" });
      if (await cancelar.isVisible()) {
        await cancelar.locator("summary").click();
        await cancelar.getByLabel("Motivo").fill("teste automático: a venda anterior ficou incompleta");
        await cancelar.getByRole("button", { name: "Cancelar venda" }).click();
        await expect(page.getByText("Venda cancelada.")).toBeVisible();
      }
    });

    let antes = 0;
    await test.step(`a loja tem ${NOME} livre`, async () => {
      antes = await disponivelNoEstoque(page);
      expect(antes, `a loja de teste precisa de pelo menos uma ${NOME} (${SKU}) livre`).toBeGreaterThanOrEqual(1);
    });

    await test.step("uma venda nova", async () => {
      await page.goto("/vender");
      await pdvPronto(page);
      await page.getByRole("button", { name: "Nova venda" }).click();
      await expect(page.getByText(/Venda nº \d+/)).toBeVisible();
      await expect(carrinho).toContainText("Busque um produto para começar.");
    });

    await test.step("põe a capa no carrinho, tira e põe de novo", async () => {
      await porNoCarrinho(page);
      await expect(carrinho).toContainText(NOME);
      await expect(carrinho).toContainText(PRECO);
      await carrinho.getByRole("button", { name: "Tirar" }).click();
      await expect(carrinho).toContainText("Busque um produto para começar.");
      await porNoCarrinho(page);
      await expect(carrinho).toContainText(NOME);
      await expect(carrinho.getByRole("button", { name: "Tirar" })).toHaveCount(1);
    });

    await test.step("paga em dinheiro e conclui", async () => {
      await page.getByRole("button", { name: "Adicionar forma de pagamento" }).click();
      await page.getByRole("group", { name: "Escolha a forma de pagamento" }).getByRole("button", { name: "Dinheiro", exact: true }).click();
      await expect(page.getByLabel("Valor (R$)")).toHaveValue("79,00");
      await page.getByRole("button", { name: "Concluir venda" }).click();
      await expect(page).toHaveURL(/\/vendas\/[0-9a-f-]{36}\?concluida=1/);
      await expect(page.getByText("Estoque baixado e pagamento registrado no seu caixa.")).toBeVisible();
      await expect(page.getByText("concluída", { exact: true })).toBeVisible();
      await expect(page.getByText(PRECO).first()).toBeVisible();
    });

    await test.step("o estoque da loja tem uma capa a menos", async () => {
      expect(await disponivelNoEstoque(page)).toBe(antes - 1);
    });

    await page.goto("/sair");
  });
});
