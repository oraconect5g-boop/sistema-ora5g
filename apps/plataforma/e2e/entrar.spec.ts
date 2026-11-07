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
  await page.getByLabel("E-mail", { exact: true }).fill("ninguem@teste.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada-de-teste");
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
});

test("o botão de ver a senha mostra e esconde o que foi digitado", async ({ page }) => {
  test.skip(!supabaseConfigurado, "o formulário só aparece com o login configurado");
  await page.goto("/entrar");
  const senha = page.getByLabel("Senha", { exact: true });
  await senha.fill("abc123");
  await expect(senha).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar a senha" }).click();
  await expect(senha).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar a senha" }).click();
  await expect(senha).toHaveAttribute("type", "password");
});

test("endereço que não existe mostra a página 404 em português", async ({ page }) => {
  const resposta = await page.goto("/nao-existe-esta-pagina");
  expect(resposta?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});
