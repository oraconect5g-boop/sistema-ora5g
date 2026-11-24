// Lote ONLINE-e (24/11/2026; ORA-ONLINE-001 e ORA-ONLINE-002: a compra com um botão só e o número no Carrinho do topo),
// no site no ar, num celular de 360 px. SÓ LÊ: nenhum pedido é feito. O carrinho é um cookie fictício, só no navegador da
// prova, com dois itens que não existem no site; tirar um item só reescreve esse cookie (não vai ao banco).
//
// - A vitrine abre com o "Carrinho" sem número; com o carrinho de 2 itens, o topo diz "Carrinho, 2 itens" e mostra o 2.
// - No carrinho, os dois itens aparecem como "não está mais à venda nesta loja", sem o formulário de reservar.
// - Tirar um item: o topo passa a 1; tirar o outro: o carrinho fica vazio e o topo volta ao "Carrinho" sem número.
// - As entregas do projeto (do dono, com a conta Dono (teste)) mostram o lote ONLINE-e.
//
// O botão único na página do produto (sem o "Reservar") não aparece aqui: o site ainda não tem produto publicado. Ele está
// provado em src/app/loja/loja.test.ts e, com produtos fictícios, na loja local (docs/aceite/ONLINE-e.md).
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, LOJA_A } from "./telas-reais";

// Dois itens que não existem no site (identificadores fictícios, no formato que o carrinho aceita).
const id = (n: number) => `0a5e0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CARRINHO = JSON.stringify({ l: id(990), i: [[id(991), id(992)], [id(993), id(994)]] });
const carrinhoDoTopo = (p: Page) => p.getByRole("navigation", { name: "Compra" }).getByRole("link").first();

test.describe("a compra com um botão só e o número no Carrinho, no site no ar (ONLINE-e)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o topo conta os itens do carrinho, e tirar um item muda a conta; as entregas mostram o lote", async ({ browser }) => {
    const base = String(test.info().project.use.baseURL ?? "");
    const contexto = await browser.newContext({ baseURL: base, viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
    try {
      const visitante = await contexto.newPage();

      await test.step("sem carrinho, o topo diz só \"Carrinho\"", async () => {
        await visitante.goto("/loja");
        await expect(carrinhoDoTopo(visitante)).toHaveText("Carrinho");
        await expect(carrinhoDoTopo(visitante)).not.toHaveAttribute("aria-label", /.+/);
      });

      await test.step("com o carrinho fictício de 2 itens, o topo diz \"Carrinho, 2 itens\"", async () => {
        await contexto.addCookies([{ name: "ora_carrinho", value: CARRINHO, domain: new URL(base).hostname, path: "/loja", secure: base.startsWith("https://"), httpOnly: true, sameSite: "Lax" }]);
        await visitante.goto("/loja");
        await expect(carrinhoDoTopo(visitante)).toHaveAttribute("aria-label", "Carrinho, 2 itens");
        await expect(carrinhoDoTopo(visitante)).toHaveText(/Carrinho\s*2/);
        expect(await visitante.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      });

      await test.step("no carrinho, os dois itens não estão à venda, e não há como reservar", async () => {
        await visitante.goto("/loja/carrinho");
        await expect(visitante.getByText("Um item não está mais à venda nesta loja.")).toHaveCount(2);
        await expect(visitante.getByText("Tire do carrinho o que não está mais à venda nesta loja para reservar o pedido.")).toBeVisible();
        await expect(visitante.getByRole("button", { name: "Reservar o pedido por 24 horas" })).toHaveCount(0);
      });

      await test.step("tirar um item: o topo passa a 1; tirar o outro: vazio, e o topo volta ao \"Carrinho\"", async () => {
        await visitante.getByRole("button", { name: "Tirar" }).first().click();
        await expect(carrinhoDoTopo(visitante)).toHaveAttribute("aria-label", "Carrinho, 1 item");
        await visitante.getByRole("button", { name: "Tirar" }).first().click();
        await expect(visitante.getByText("O carrinho está vazio")).toBeVisible();
        await expect(carrinhoDoTopo(visitante)).toHaveText("Carrinho");
      });
    } finally {
      await contexto.close();
    }

    await comPessoas(browser, [[DONO, LOJA_A]], async (p) => {
      const dono = p[DONO] as Page;
      await dono.goto("/entregas");
      await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
      const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
      await expect(lotes.filter({ has: dono.getByText("ONLINE-e", { exact: true }) })).toHaveCount(1);
    });
  });
});
