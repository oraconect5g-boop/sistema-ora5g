// Lote TRF-f (24/11/2026; ORA-INV-007; os achados F24-01 a F24-04 da revisão do Codex de 24/11): a tela de Transferências
// e a de Estoque no site no ar, num celular de 360 px, com a conta Dono (teste) na Santa Cândida (teste). SÓ LÊ: só abre
// telas e busca (nenhum formulário de pedido, envio ou recebimento é enviado).
//
// - Transferências: as em andamento e o histórico aparecem cada um com o seu título e a contagem; a busca pelo número
//   acha a nº 1 (regularizada em 23/11, lote AUD-d) e mostra só ela, com "Ver todas" para voltar.
// - Estoque: o primeiro produto da lista abre "onde tem" pelo nome, mantendo a página da lista, e "fechar" volta a ela.
// - As entregas do projeto mostram o lote TRF-f.
//
// O desaparecimento da pedida antiga atrás de 50 canceladas está provado no banco (packages/banco/src/transferencias-tela.test.ts,
// o teste do Codex), sem gravar 51 transferências no site.
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, LOJA_A } from "./telas-reais";

test.describe("as em andamento, o histórico e a busca pelo número, no site no ar (TRF-f)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("as duas partes com a contagem; a busca pelo número; o estoque abre o produto e volta à lista; as entregas mostram o lote", async ({ browser }) => {
    await comPessoas(browser, [[DONO, LOJA_A]], async (p) => {
      const dono = p[DONO] as Page;

      await test.step("Transferências: as em andamento e o histórico, cada um com a contagem", async () => {
        await dono.goto("/transferencias");
        await expect(dono.getByRole("heading", { level: 1, name: "Transferências", exact: true })).toBeVisible();
        await expect(dono.getByRole("heading", { level: 2, name: /^Em andamento \(\d+\)$/ })).toBeVisible();
        await expect(dono.getByRole("heading", { level: 2, name: /^Histórico \(\d+\)$/ })).toBeVisible();
        await expect(dono.getByText(/^Os passos: pedir/)).toBeVisible();
      });

      await test.step("a busca pelo número 1 mostra só ela, e \"Ver todas\" volta", async () => {
        await dono.getByLabel("Achar pelo número").fill("1");
        await dono.getByRole("button", { name: "Achar", exact: true }).click();
        await expect(dono).toHaveURL(/\/transferencias\?numero=1$/);
        await expect(dono.getByRole("heading", { level: 2, name: "Transferência Nº 1", exact: true })).toBeVisible();
        await expect(dono.getByRole("heading", { name: /(^|· )Nº 1 · .+ × 1$/ })).toBeVisible();
        await expect(dono.getByRole("heading", { level: 2, name: /^Em andamento/ })).toHaveCount(0);
        await dono.getByRole("link", { name: "Ver todas", exact: true }).click();
        await expect(dono).toHaveURL(/\/transferencias$/);
      });

      await test.step("Estoque: o nome do produto abre \"onde tem\" e \"fechar\" volta à lista", async () => {
        await dono.goto("/estoque");
        const nomes = dono.locator("ul li a[href*='variante=']");
        test.skip((await nomes.count()) === 0, "a loja de teste está sem saldo para abrir");
        const nome = (await nomes.first().innerText()).split("\n")[0]?.trim() ?? "";
        await nomes.first().click();
        await expect(dono).toHaveURL(/variante=/);
        await expect(dono.getByText(`Onde tem: ${nome}`)).toBeVisible();
        await dono.getByRole("link", { name: "fechar", exact: true }).click();
        await expect(dono).not.toHaveURL(/variante=/);
      });

      await test.step("as entregas do projeto mostram o lote TRF-f", async () => {
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        await expect(lotes.filter({ has: dono.getByText("TRF-f", { exact: true }) })).toHaveCount(1);
      });
    });
  });
});
