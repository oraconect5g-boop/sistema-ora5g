// Lote CONNECT-g (25/11/2026; ORA-CONNECT-007 e ORA-CONNECT-009): as consultas da Nogle que só leem, no site no ar. O Dono
// (teste) consulta o saldo da carteira da Ora na Nogle (uma consulta de verdade, SÓ LEITURA, pela decisão D-056: "só
// consultas"; fica o registro da consulta, e a resposta é apagada em 24 horas); o Vendedor (teste) vê as consultas da loja,
// sem a carteira. Nenhuma linha ou chip de cliente é consultado aqui.
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, LOJA_A, VENDEDOR } from "./telas-reais";

test.describe("as consultas da Nogle, no site no ar (CONNECT-g)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("o dono consulta o saldo da carteira e a resposta chega em segundos; o vendedor vê as consultas da loja, sem a carteira", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(180_000);
    await comPessoas(browser, [[DONO, LOJA_A], [VENDEDOR]], async (pessoas) => {
      const dono = pessoas[DONO] as Page;
      await dono.goto("/connect/linha");
      await expect(dono.getByRole("heading", { level: 2, name: "Consultar linha", exact: true })).toBeVisible();
      await dono.getByRole("button", { name: "Consultar o saldo" }).click();
      const consulta = dono.getByRole("list", { name: "Minhas consultas" }).getByRole("listitem").first();
      await expect(consulta).toContainText("Saldo da carteira da Ora");
      // O worker olha a fila a cada 2 segundos; a tela se atualiza sozinha enquanto espera.
      await expect(consulta).toContainText("Respondida", { timeout: 90_000 });
      await expect(consulta).toContainText(/Saldo: R\$\s[\d.]+,\d{2}/);

      const vendedor = pessoas[VENDEDOR] as Page;
      await vendedor.goto("/connect/linha");
      await expect(vendedor.getByRole("heading", { level: 2, name: "O que consultar" })).toBeVisible();
      await expect(vendedor.getByRole("heading", { level: 2, name: "Carteira da Ora na Nogle" })).toHaveCount(0);
      // A consulta do dono não aparece para o vendedor (só quem pediu vê).
      await expect(vendedor.getByText("Saldo da carteira da Ora")).toHaveCount(0);
    });
  });
});
