// REV-037 / #39 (prova do Codex na PR #33, 2026-11-08-setores/navegador.repro.ts), agora regressão
// permanente da DEMONSTRAÇÃO. A prova original fazia 34 ativações seguidas e esperava o botão
// sempre habilitado; com a correção, ele trava quando o saldo acaba. Por isso o laço vai "até o
// botão travar", e as asserções do Codex continuam: saldo nunca negativo e ação bloqueada.
// Controle: houve ativações com saldo. Só no computador (o fluxo é o mesmo no celular).
import { expect, test, type Page } from "@playwright/test";

async function prepararAtivacao(page: Page) {
  await page.getByRole("radio", { name: "eSIM (chip virtual)", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("CPF do titular", { exact: true }).fill("000.000.001-91");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: /20 GB/ }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
}

test("ativação por SALDO não permite carteira negativa (#39)", async ({ page }) => {
  test.skip(test.info().project.name !== "computador", "basta uma vez");
  test.setTimeout(150_000);
  await page.goto("/demo/perfil/usar?p=vendedor");
  await page.goto("/demo/connect?aba=ativar");
  const conferir = page.getByRole("button", { name: "Conferir e ativar", exact: true });
  let ativacoes = 0;
  for (; ativacoes < 60; ativacoes++) {
    await prepararAtivacao(page);
    if (await conferir.isDisabled()) break;
    await conferir.click();
    await page.getByRole("dialog").getByRole("button", { name: "Solicitar ativação", exact: true }).click();
    await page.getByRole("button", { name: "Nova ativação", exact: true }).click();
  }
  expect(ativacoes).toBeGreaterThan(0);
  expect(ativacoes).toBeLessThan(60);
  await expect(page.getByText(/Saldo da carteira:/)).not.toContainText(/[-−]/);
  await expect(page.getByRole("alert")).toContainText("Saldo da carteira insuficiente");
  await expect(conferir).toBeDisabled();
});
