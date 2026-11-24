// Lote ONLINE-f (24/11/2026; ORA-ONLINE-001: a vitrine com o catálogo inteiro, de 60 em 60, com os disponíveis primeiro),
// no site no ar, num celular de 360 px. SÓ LÊ: nada é pedido nem reservado.
//
// - A vitrine diz quantos produtos há e mostra os 60 primeiros, com "Página 1 de N" e "Próximos" (o catálogo de verdade
//   tem mais de 60 produtos no site desde 24/11).
// - "Próximos" leva à página 2, com outros produtos e "Anteriores"; "Anteriores" volta à primeira. Sem rolagem para o lado.
// - As entregas do projeto (do dono, com a conta Dono (teste)) mostram o lote ONLINE-f.
//
// A ordem (os disponíveis primeiro) e as páginas fora do que existe estão provadas no banco
// (packages/banco/src/loja-online-vitrine.test.ts) e na tela (src/app/loja/loja.test.ts).
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, LOJA_A } from "./telas-reais";

const nomesDosProdutos = (p: Page) => p.locator("main ul li a span.line-clamp-2").allInnerTexts();

test.describe("a vitrine de 60 em 60, no site no ar (ONLINE-f)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("a contagem, a página 2 com outros produtos e a volta; as entregas mostram o lote", async ({ browser }) => {
    const base = String(test.info().project.use.baseURL ?? "");
    const contexto = await browser.newContext({ baseURL: base, viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
    try {
      const visitante = await contexto.newPage();
      let total = 0;

      await test.step("a primeira página: quantos são, os 60 primeiros e o caminho para as outras", async () => {
        await visitante.goto("/loja");
        const contagem = visitante.getByText(/^Mostrando 1–60 de \d+ produtos$/);
        await expect(contagem).toBeVisible();
        total = Number(/de (\d+) produtos/.exec(await contagem.innerText())?.[1]);
        expect(total).toBeGreaterThan(60);
        await expect(visitante.getByText(`Página 1 de ${Math.ceil(total / 60)}`)).toBeVisible();
        expect(await nomesDosProdutos(visitante)).toHaveLength(60);
        await expect(visitante.getByRole("link", { name: "Anteriores" })).toHaveCount(0);
        expect(await visitante.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      });

      await test.step("\"Próximos\": a página 2, com outros produtos; \"Anteriores\" volta", async () => {
        const primeira = await nomesDosProdutos(visitante);
        await visitante.getByRole("link", { name: "Próximos" }).click();
        await expect(visitante).toHaveURL(/\/loja\?pagina=2$/);
        await expect(visitante.getByText(new RegExp(`^Mostrando 61–\\d+ de ${total} produtos$`))).toBeVisible();
        const segunda = await nomesDosProdutos(visitante);
        expect(segunda.length).toBeGreaterThan(0);
        expect(segunda.filter((n) => primeira.includes(n))).toEqual([]);
        expect(await visitante.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
        await visitante.getByRole("link", { name: "Anteriores" }).click();
        await expect(visitante).toHaveURL(/\/loja$/);
        await expect(visitante.getByText(/^Mostrando 1–60 de \d+ produtos$/)).toBeVisible();
      });
    } finally {
      await contexto.close();
    }

    await comPessoas(browser, [[DONO, LOJA_A]], async (p) => {
      const dono = p[DONO] as Page;
      await dono.goto("/entregas");
      await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
      const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
      await expect(lotes.filter({ has: dono.getByText("ONLINE-f", { exact: true }) })).toHaveCount(1);
    });
  });
});
