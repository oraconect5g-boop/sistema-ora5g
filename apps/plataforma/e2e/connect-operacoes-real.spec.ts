// Lote CONNECT-f (25/11/2026): a Ora Connect liberada no site no ar, SÓ LEITURA. Desde o CONNECT-m, nas abas da demonstração:
// o Dono (teste) vê, na aba Integração Nogle, as três operações liberadas, as listas oficiais carregadas e as funções da Nogle;
// o Vendedor (teste) vê as suas abas, o formulário de cada operação (só aparece liberado; a ativação é o assistente do
// CONNECT-n, percorrido em e2e/connect-assistente-real.spec.ts) e os planos da lista oficial da Nogle, com o valor de face. Nada é vendido, registrado ou enviado à Nogle (cada operação de verdade é do proprietário, pelo
// roteiro docs/aceite/CONNECT-f.md).
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, LOJA_A, VENDEDOR } from "./telas-reais";

const abas = (p: Page) => p.getByRole("navigation", { name: "Funções da Ora Connect" });

test.describe("a Ora Connect liberada, no site no ar (CONNECT-f e CONNECT-m)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("o dono vê as operações liberadas; o vendedor, as suas abas, os formulários e os planos da Nogle; nada é enviado", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(120_000);
    await comPessoas(browser, [[DONO, LOJA_A], [VENDEDOR]], async (pessoas) => {
      const dono = pessoas[DONO] as Page;
      await dono.goto("/connect");
      await expect(dono.getByRole("heading", { level: 1, name: "Ora Connect" })).toBeVisible();
      await expect(abas(dono).getByRole("link")).toHaveCount(9);
      await abas(dono).getByRole("link", { name: "Integração Nogle", exact: true }).click();
      const situacao = dono.locator("section").filter({ has: dono.getByRole("heading", { level: 2, name: "Situação da integração" }) });
      for (const operacao of ["Ativação de chip", "Recarga", "Portabilidade"]) {
        await expect(situacao.getByRole("listitem").filter({ hasText: operacao })).toContainText("liberada");
      }
      await expect(situacao.getByText("aguardando liberação")).toHaveCount(0);
      await expect(situacao.getByText(/^Listas oficiais carregadas: [1-9]\d* planos/)).toBeVisible();
      await expect(dono.getByText(/^As \d+ funções da coleção oficial/)).toBeVisible();

      const vendedor = pessoas[VENDEDOR] as Page;
      await vendedor.goto("/connect");
      await expect(vendedor.getByRole("heading", { level: 1, name: "Ora Connect" })).toBeVisible();
      await expect(abas(vendedor).getByRole("link")).toHaveText(["Operações do dia", "Ativar chip", "Consultar linha", "Recarga", "Portabilidade", "Chips e entrega", "Carteira e relatórios"]);
      await abas(vendedor).getByRole("link", { name: "Ativar chip", exact: true }).click();
      await expect(vendedor.getByRole("heading", { level: 2, name: "Ativar chip na operadora" })).toBeVisible();
      await expect(vendedor.getByText(/ainda não foi liberada/)).toHaveCount(0);
      await expect(vendedor.getByText("Etapa 1 de 5: Chip", { exact: true })).toBeVisible();
      await abas(vendedor).getByRole("link", { name: "Recarga", exact: true }).click();
      // Os planos da lista oficial, em cartões (o valor vem da Nogle, nunca da tela).
      const planos = vendedor.getByRole("group", { name: "Plano (lista da Nogle)" });
      await expect(planos.getByRole("radio", { name: /^10 GB\s*R\$\s54,90$/ })).toHaveCount(1);
      await expect(planos.getByRole("radio", { name: /^45 GB\s*R\$\s94,90$/ })).toHaveCount(1);
      await expect(vendedor.getByRole("button", { name: "Solicitar recarga" })).toBeVisible();
      await abas(vendedor).getByRole("link", { name: "Portabilidade", exact: true }).click();
      await expect(vendedor.getByRole("button", { name: "Solicitar portabilidade" })).toBeVisible();
    });
  });
});
