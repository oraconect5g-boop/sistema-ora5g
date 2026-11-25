// Lote CONNECT-i (25/11/2026): as outras consultas da Nogle, no site no ar. O Dono (teste) pede as dúvidas frequentes (uma
// consulta de verdade, SÓ LEITURA, pela decisão D-056: "só consultas"; sem dado de cliente nenhum) e a resposta chega em
// segundos; vê a gerência, a carteira e os relatórios da rede. O Vendedor (teste) vê o titular da linha e as informações da
// Nogle, sem a gerência, a carteira nem os relatórios da rede. Nenhuma linha, CPF ou cliente é consultado aqui.
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, LOJA_A, VENDEDOR } from "./telas-reais";

test.describe("as outras consultas da Nogle, no site no ar (CONNECT-i)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("o dono pede as dúvidas frequentes e a resposta chega; cada papel vê só o que pode pedir", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(180_000);
    await comPessoas(browser, [[DONO, LOJA_A], [VENDEDOR]], async (pessoas) => {
      const dono = pessoas[DONO] as Page;
      await dono.goto("/connect/linha");
      await expect(dono.getByRole("heading", { level: 2, name: "Consultar linha", exact: true })).toBeVisible();
      for (const secao of ["O titular da linha", "Pagamento de uma solicitação", "Informações da Nogle", "Da gerência", "Carteira da Ora na Nogle",
        "Relatórios da rede na Nogle"]) {
        await expect(dono.getByRole("heading", { level: 2, name: secao, exact: true })).toBeVisible();
      }
      await dono.getByRole("button", { name: "Dúvidas frequentes", exact: true }).click();
      const consulta = dono.getByRole("list", { name: "Minhas consultas" }).getByRole("listitem").first();
      await expect(consulta).toContainText("Dúvidas frequentes");
      // O worker olha a fila a cada 2 segundos; a tela se atualiza sozinha enquanto espera.
      await expect(consulta).toContainText(/Respondida|Não encontrada|Falhou/, { timeout: 90_000 });
      await expect(consulta).toContainText("Respondida");
      await expect(consulta).toContainText(/categoria/);

      const vendedor = pessoas[VENDEDOR] as Page;
      await vendedor.goto("/connect/linha");
      await expect(vendedor.getByRole("heading", { level: 2, name: "O titular da linha", exact: true })).toBeVisible();
      await expect(vendedor.getByRole("heading", { level: 2, name: "Pagamento de uma solicitação", exact: true })).toBeVisible();
      await expect(vendedor.getByRole("heading", { level: 2, name: "Informações da Nogle", exact: true })).toBeVisible();
      for (const fora of ["Da gerência", "Carteira da Ora na Nogle", "Relatórios da rede na Nogle"]) {
        await expect(vendedor.getByRole("heading", { level: 2, name: fora, exact: true })).toHaveCount(0);
      }
    });
  });
});
