// Lote CONNECT-f (25/11/2026): a Ora Connect liberada no site no ar, SÓ LEITURA. Com o Vendedor (teste): as três operações
// aparecem liberadas e o formulário traz os planos da lista oficial da Nogle, com o valor de face. Nada é vendido, registrado
// ou enviado à Nogle (cada operação de verdade é do proprietário, pelo roteiro docs/aceite/CONNECT-f.md).
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, VENDEDOR } from "./telas-reais";

test.describe("a Ora Connect liberada, no site no ar (CONNECT-f)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("o vendedor vê as três operações liberadas e os planos da Nogle, pelo valor de face; nada é enviado", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(120_000);
    await comPessoas(browser, [[VENDEDOR]], async (pessoas) => {
      const vendedor = pessoas[VENDEDOR] as Page;
      await vendedor.goto("/connect");
      await expect(vendedor.getByRole("heading", { level: 1, name: "Ora Connect" })).toBeVisible();
      for (const operacao of ["Ativação de chip", "Recarga", "Portabilidade"]) {
        await expect(vendedor.getByText(`${operacao}: liberada`, { exact: true })).toBeVisible();
      }
      await expect(vendedor.getByText(/aguardando homologação/)).toHaveCount(0);
      // Os planos da lista oficial no formulário (o valor vem da Nogle, nunca da tela).
      const planos = vendedor.getByLabel("Plano (lista da Nogle)").first().locator("option");
      await expect(planos.filter({ hasText: /^10 GB · R\$\s54,90$/ })).toHaveCount(1);
      await expect(planos.filter({ hasText: /^45 GB · R\$\s94,90$/ })).toHaveCount(1);
    });
  });
});
