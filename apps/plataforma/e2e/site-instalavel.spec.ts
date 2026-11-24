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
  // O "sem internet" do teste é ligado alvo a alvo (a página e o service worker), e o do service worker pode passar a valer
  // alguns milissegundos depois de o setOffline voltar. Medido em 23/11/2026, na build de produção: em 1 de 4.000 repetições
  // o service worker ainda tinha rede (por 7 ms). Nesse instante ele buscava a página no servidor, e a página, já sem rede,
  // não carregava os scripts e mostrava "Algo deu errado nesta tela": 1 falha em 1.951 repetições, e uma no CI do lote
  // FIN-007a. Num aparelho sem internet de verdade ninguém tem rede; por isso a prova espera o service worker ficar sem
  // rede (um pedido feito de dentro dele falha) antes de navegar, e voltar a ter rede antes do "Tentar de novo".
  const servico = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const redeDoServico = () => servico.evaluate(() => fetch("/saude", { cache: "no-store" }).then(() => "com rede", () => "sem rede"));
  await context.setOffline(true);
  await expect.poll(redeDoServico, { message: "o service worker sem rede" }).toBe("sem rede");
  await page.goto("/entrar");
  await expect(page.getByRole("heading", { name: "Sem internet agora" })).toBeVisible();
  await context.setOffline(false);
  await expect.poll(redeDoServico, { message: "o service worker com rede de novo" }).toBe("com rede");
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByRole("heading", { name: "Sem internet agora" })).toHaveCount(0);
});
