// Lote ONLINE-g (24/11/2026; ORA-ONLINE-001: a cara de loja da loja online, a pedido do proprietário: "a loja tem que ficar
// melhor do que [o site antigo] visualmente"), no site no ar. SÓ LÊ: nada é pedido nem reservado.
//
// - No celular (360 px): o topo com o título novo e a busca, as três vantagens, as categorias em blocos com ícone ("Tudo"
//   marcado), "Todos os produtos" com a contagem e o rodapé com "Como comprar"; sem rolagem para o lado.
// - No computador (1280 px): os atalhos ilustrados das categorias no topo, que levam à categoria.
// - Na busca, os resultados com o título dela, sem as vantagens.
// - As entregas do projeto (do dono, com a conta Dono (teste)) mostram o lote ONLINE-g.
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, LOJA_A } from "./telas-reais";

const semRolagemParaOLado = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("a cara de loja da loja online, no site no ar (ONLINE-g)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o topo, as vantagens, as categorias em blocos, a seção e o rodapé; os atalhos no computador; as entregas mostram o lote", async ({ browser }) => {
    const base = String(test.info().project.use.baseURL ?? "");
    const celular = await browser.newContext({ baseURL: base, viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
    const computador = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 820 } });
    try {
      const p = await celular.newPage();
      await test.step("no celular: o topo, as vantagens, as categorias, a seção e o rodapé", async () => {
        await p.goto("/loja");
        await expect(p.getByRole("heading", { level: 1, name: "Tudo para o seu celular, com retirada na loja" })).toBeVisible();
        const vantagens = p.getByRole("list", { name: "Como funciona" });
        for (const titulo of ["Retire na loja", "Reserva por 24 horas", "Pague na retirada"]) await expect(vantagens.getByText(titulo)).toBeVisible();
        const categorias = p.getByRole("navigation", { name: "Categorias" });
        await expect(categorias.getByRole("link", { name: "Tudo" })).toHaveAttribute("aria-current", "page");
        expect(await categorias.getByRole("link").count()).toBeGreaterThan(5);
        await expect(p.getByRole("heading", { level: 2, name: "Todos os produtos" })).toBeVisible();
        await expect(p.getByText(/^Mostrando 1–60 de \d+ produtos$/)).toBeVisible();
        await expect(p.getByRole("contentinfo").getByText("Como comprar")).toBeVisible();
        expect(await semRolagemParaOLado(p)).toBe(0);
      });

      await test.step("na busca: o título dela, sem as vantagens", async () => {
        await p.goto("/loja?busca=fone");
        await expect(p.getByRole("heading", { level: 2, name: "Resultados para \"fone\"" })).toBeVisible();
        await expect(p.getByRole("list", { name: "Como funciona" })).toHaveCount(0);
        expect(await semRolagemParaOLado(p)).toBe(0);
      });

      await test.step("no computador: os atalhos das categorias no topo levam à categoria", async () => {
        const c = await computador.newPage();
        await c.goto("/loja");
        const atalhos = c.getByRole("list", { name: "Atalhos das categorias" }).getByRole("link");
        await expect(atalhos.first()).toBeVisible();
        expect(await atalhos.count()).toBeGreaterThanOrEqual(1);
        await atalhos.first().click();
        await expect(c).toHaveURL(/\/loja\?categoria=[0-9a-f-]{36}$/);
        await expect(c.getByRole("list", { name: "Como funciona" })).toHaveCount(0);
      });
    } finally {
      await celular.close();
      await computador.close();
    }

    await comPessoas(browser, [[DONO, LOJA_A]], async (pessoas) => {
      const dono = pessoas[DONO] as Page;
      await dono.goto("/entregas");
      await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
      const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
      await expect(lotes.filter({ has: dono.getByText("ONLINE-g", { exact: true }) })).toHaveCount(1);
    });
  });
});
