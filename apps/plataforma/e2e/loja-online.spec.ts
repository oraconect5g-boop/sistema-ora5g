import { expect, test } from "@playwright/test";

// A loja online (ONLINE-a; ADR-009) é pública: responde sem login, sem levar ao /entrar. Neste ambiente de teste ela não
// está ligada (sem LOJA_ONLINE_ORGANIZACAO e sem o Supabase), então mostra o aviso, e não quebra.
test("a vitrine responde sem login e, desligada, avisa que ainda não está no ar", async ({ page }) => {
  const resposta = await page.goto("/loja");
  expect(resposta?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/loja");
  await expect(page.getByText("A loja online ainda não está no ar")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("o produto responde sem login; endereço que não é de produto é não encontrado", async ({ page }) => {
  const produto = await page.goto("/loja/00000000-0000-4000-8000-000000000001");
  expect(produto?.status()).toBe(200);
  await expect(page.getByText("A loja online ainda não está no ar")).toBeVisible();
  const invalido = await page.goto("/loja/nao-e-produto");
  expect(invalido?.status()).toBe(404);
});

test("a vitrine cabe na tela do celular, sem rolagem lateral", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/loja");
  const { conteudo, tela } = await page.evaluate(() => ({ conteudo: document.documentElement.scrollWidth, tela: document.documentElement.clientWidth }));
  expect(conteudo).toBeLessThanOrEqual(tela);
});
