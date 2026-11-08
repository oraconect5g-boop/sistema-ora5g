import { expect, test } from "@playwright/test";

test("eSIM: não transfere mais do que as quatro unidades do estoque central", async ({ page }) => {
  await page.goto("/demo/perfil/usar?p=gerente");
  await page.goto("/demo/connect?aba=chips");
  await page.getByRole("button", { name: "eSIM", exact: true }).click();
  await expect(page.getByText("Estoque virgem: 6 físicos · 4 eSIM.")).toBeVisible();
  await page.getByLabel("Quantidade de eSIM").fill("5");
  await page.getByRole("button", { name: /^Transferir para/ }).click();
  await expect(page.getByText("5 eSIM transferidos para Santa Cândida.")).toHaveCount(0);
});

test("recarga LINK paga conserva o meio de pagamento e não vira recebimento na loja", async ({ page }) => {
  await page.goto("/demo/perfil/usar?p=vendedor");
  await page.goto("/demo/connect?aba=recarga");
  await page.getByLabel("Número da linha", { exact: true }).fill("(41) 9 0000-0101");
  await page.getByLabel("Link de pagamento", { exact: true }).check();
  await page.getByRole("button", { name: "Solicitar recarga", exact: true }).click();
  await page.getByRole("dialog", { name: "Conferir a recarga" }).getByRole("button", { name: "Solicitar recarga" }).click();
  await expect(page.getByText(/aguardando pagamento do link/)).toBeVisible();
  await page.getByRole("button", { name: "Cliente pagou (simulação)" }).click();
  await expect(page.getByText(/feita pelo saldo/)).toHaveCount(0);
});
