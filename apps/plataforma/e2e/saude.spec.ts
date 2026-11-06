import { expect, test } from "@playwright/test";

test("responde 200 e informa que o sistema esta no ar", async ({ page }) => {
  const resposta = await page.goto("/saude");

  expect(resposta?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Sistema no ar" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
});

test("calcula o horario no acesso, nao na construcao do aplicativo", async ({ page }) => {
  const antes = Date.now();
  await page.goto("/saude");
  const verificadoEm = await page.locator("time").getAttribute("datetime");

  expect(verificadoEm).not.toBeNull();
  const instante = Date.parse(verificadoEm as string);
  expect(instante).toBeGreaterThanOrEqual(antes - 1_000);
  expect(instante).toBeLessThanOrEqual(Date.now() + 1_000);
});

test("cabe na largura da tela, sem rolagem lateral", async ({ page }) => {
  await page.goto("/saude");

  const { conteudo, tela } = await page.evaluate(() => ({
    conteudo: document.documentElement.scrollWidth,
    tela: document.documentElement.clientWidth,
  }));
  expect(conteudo).toBeLessThanOrEqual(tela);
});

test("nao revela o framework no cabecalho de resposta", async ({ request }) => {
  const resposta = await request.get("/saude");

  expect(resposta.headers()["x-powered-by"]).toBeUndefined();
});

test("endereco inexistente responde 404", async ({ request }) => {
  const resposta = await request.get("/nao-existe");

  expect(resposta.status()).toBe(404);
});
