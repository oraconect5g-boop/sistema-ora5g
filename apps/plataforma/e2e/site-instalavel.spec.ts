import { expect, test } from "@playwright/test";

// O site instalável (lote PWA-a; plano de 16/11, Onda 1, item 7), na versão de produção que o E2E sobe: o manifesto,
// o service worker registrado e a página "sem internet" quando a conexão cai. Sem login.
test("o manifesto responde e a página aponta para ele", async ({ page, request }) => {
  const resposta = await request.get("/manifest.webmanifest");
  expect(resposta.status()).toBe(200);
  const manifesto = (await resposta.json()) as { start_url?: string; display?: string; icons?: { src: string }[] };
  expect(manifesto).toMatchObject({ start_url: "/inicio", display: "standalone" });
  for (const icone of manifesto.icons ?? []) expect((await request.get(icone.src)).status(), icone.src).toBe(200);
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test("o service worker não fica em cache e só a página sem internet é guardada", async ({ request }) => {
  const resposta = await request.get("/sw.js");
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()["cache-control"]).toContain("no-cache");
  expect((await request.get("/sem-internet.html")).status()).toBe(200);
});

test("sem internet, a navegação mostra a página 'Sem internet agora' em vez do erro do navegador", async ({ page, context }) => {
  await page.goto("/");
  // O service worker se registra, instala e passa a controlar a página.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.goto("/entrar");
  await expect(page.getByRole("heading", { name: "Sem internet agora" })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByRole("heading", { name: "Sem internet agora" })).toHaveCount(0);
});
