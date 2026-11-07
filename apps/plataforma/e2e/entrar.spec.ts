import { expect, test } from "@playwright/test";

const supabaseConfigurado = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

test("a página de entrada abre e oferece a demonstração", async ({ page }) => {
  const resposta = await page.goto("/entrar");
  expect(resposta?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Bem-vindo à Ora" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver a demonstração" })).toBeVisible();
});

test("a conta exige login", async ({ page }) => {
  await page.goto("/conta");
  await expect(page).toHaveURL(/\/entrar/);
});

test("login real recusa credenciais erradas com mensagem neutra", async ({ page }) => {
  test.skip(!supabaseConfigurado, "Supabase não configurado neste ambiente");
  test.skip(test.info().project.name !== "computador", "basta uma tentativa por execução");
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill("ninguem@teste.invalid");
  await page.getByLabel("Senha").fill("senha-errada-de-teste");
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
});
