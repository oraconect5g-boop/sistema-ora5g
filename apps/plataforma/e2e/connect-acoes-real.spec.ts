// Lote CONNECT-j (25/11/2026; a D-061): as ações na Nogle, no site no ar, SÓ LEITURA. O Dono (teste) abre a tela com as ações
// da linha, do cliente, a compra de chip com entrega e os PDVs; o Vendedor (teste) vê só o aviso de que as ações são do dono e
// dos gerentes. NENHUMA ação é pedida aqui: cada uma muda algo de verdade na Nogle (a primeira é a do roteiro de aceite).
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, LOJA_A, VENDEDOR } from "./telas-reais";

test.describe("as ações na Nogle, no site no ar (CONNECT-j)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("o dono vê as ações e os pedidos, sem pedir nenhuma; o vendedor vê só o aviso", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(120_000);
    await comPessoas(browser, [[DONO, LOJA_A], [VENDEDOR]], async (pessoas) => {
      const dono = pessoas[DONO] as Page;
      await dono.goto("/connect");
      // CONNECT-m: as ações ficam na aba "Bloqueio e atendimento" (as abas da demonstração).
      await dono.getByRole("navigation", { name: "Funções da Ora Connect" }).getByRole("link", { name: "Bloqueio e atendimento", exact: true }).click();
      await expect(dono.getByRole("heading", { level: 2, name: "Ações na Nogle", exact: true })).toBeVisible();
      for (const secao of ["Linha do cliente", "Cliente na Nogle", "Compra de chip com entrega", "PDVs da Nogle", "Pedidos"]) {
        await expect(dono.getByRole("heading", { level: 2, name: secao, exact: true })).toBeVisible();
      }
      // As ações ficam fechadas até o toque (o título de cada uma; o botão de dentro repete o nome); nada é enviado aqui.
      await expect(dono.locator("summary").filter({ hasText: /^Bloquear a linha$/ })).toBeVisible();
      await expect(dono.locator("summary").filter({ hasText: /^Inativar um PDV \(e os usuários dele\)$/ })).toBeVisible();

      const vendedor = pessoas[VENDEDOR] as Page;
      await vendedor.goto("/connect/acoes-na-nogle");
      await expect(vendedor.getByText("As ações na Nogle são do dono e dos gerentes.", { exact: true })).toBeVisible();
      await expect(vendedor.getByRole("heading", { level: 2, name: "Linha do cliente" })).toHaveCount(0);
    });
  });
});
