// Lote CONNECT-k (25/11/2026; a D-060): o relatório do vendedor e da loja da Ora Connect, no site no ar, SÓ LEITURA. O Dono
// (teste) vê o relatório da loja de teste, com a escolha da loja e do vendedor; o Vendedor (teste) vê só o próprio. Nada é
// gravado. Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, LOJA_A, VENDEDOR } from "./telas-reais";

test.describe("o relatório do vendedor e da loja, no site no ar (CONNECT-k)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("o dono escolhe a loja e o vendedor; o vendedor vê só o próprio relatório", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(120_000);
    await comPessoas(browser, [[DONO, LOJA_A], [VENDEDOR]], async (pessoas) => {
      const dono = pessoas[DONO] as Page;
      await dono.goto("/connect/relatorio?periodo=30");
      await expect(dono.getByRole("heading", { level: 2, name: "Relatório da Ora Connect", exact: true })).toBeVisible();
      // O subtítulo inteiro: o cabeçalho da impressão (escondido na tela) também diz "<loja> · 30 dias".
      await expect(dono.getByText(`${LOJA_A} · 30 dias · as operações registradas no período`, { exact: true })).toBeVisible();
      await expect(dono.getByLabel("Loja")).toBeVisible();
      await expect(dono.getByLabel("Vendedor")).toBeVisible();
      await expect(dono.getByText("Ativações confirmadas", { exact: true })).toBeVisible();

      const vendedor = pessoas[VENDEDOR] as Page;
      await vendedor.goto("/connect/relatorio");
      await expect(vendedor.getByRole("heading", { level: 2, name: "Relatório da Ora Connect", exact: true })).toBeVisible();
      await expect(vendedor.getByLabel("Loja")).toHaveCount(0);
      await expect(vendedor.getByText("Recargas confirmadas", { exact: true })).toBeVisible();
    });
  });
});
