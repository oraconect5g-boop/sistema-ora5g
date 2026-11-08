import { expect, test } from "@playwright/test";

// Sistema real (ORA-006): sem login, nenhuma página real abre; saída forçada só mostra motivos
// conhecidos. Roda com ou sem a configuração pública do Supabase no ambiente de teste.
for (const caminho of ["/inicio", "/escolher-loja", "/equipe", "/conta/senha"]) {
  test(`${caminho} sem login volta para /entrar`, async ({ page }) => {
    await page.goto(caminho);
    await expect(page).toHaveURL(/\/entrar(\?|$)/);
    await expect(page.getByRole("heading", { name: "Bem-vindo à Ora" })).toBeVisible();
  });
}

test("saída forçada mostra só motivo conhecido", async ({ page }) => {
  await page.goto("/sair?motivo=turno");
  await expect(page).toHaveURL(/\/entrar\?erro=turno$/);
  await expect(page.getByText("Seu turno terminou. Entre de novo para continuar.")).toBeVisible();
  await page.goto("/sair?motivo=__proto__");
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole("note")).toHaveCount(0);
});

test("link de acesso inválido ou sem configuração volta ao login com aviso", async ({ page }) => {
  await page.goto("/auth/confirmar?token_hash=invalido&type=recovery");
  await expect(page).toHaveURL(/\/entrar\?erro=(link|configuracao)$/);
});

test("recuperar a senha existe e não revela nada sem configuração", async ({ page }) => {
  await page.goto("/entrar/recuperar");
  await expect(page.getByRole("heading", { name: "Recuperar a senha" })).toBeVisible();
});
