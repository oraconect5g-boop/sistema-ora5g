// Lote TRF-d (23/11/2026; ORA-INV-007; o achado F21-04 da auditoria integral do Codex de 21/11, PR #105): a tela de
// Transferências no site no ar, num celular de 360 px, com as contas de teste. SÓ LÊ: só abre telas (nenhum formulário é
// enviado, nenhuma transferência é pedida, recebida nem resolvida).
//
// - A tela lê a função que a migration do lote refez (transferencias_tela, agora com as resoluções do que faltou): se ela
//   faltasse ou viesse com outro formato no banco do site, a tela cairia no erro do serviço.
// - O Dono (teste), na Santa Cândida (teste), vê as duas transferências de teste que saíram para a Muffato Santa em 17/11
//   (nº 1 e nº 2): continuam lá, à espera da decisão do proprietário. A prova não mexe nelas.
// - O Gerente 2 (teste) abre a tela na Loja de teste 2, e as entregas do projeto mostram o lote TRF-d.
//
// O que esta prova NÃO faz: receber com divergência e resolver no site. Isso grava e pede o sim do proprietário. A regra do
// banco está provada em packages/banco/src/transferencia-divergencia*.test.ts e, no banco da homologação, numa operação
// desfeita no fim (docs/aceite/TRF-d.md).
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, GERENTE_B, LOJA_A } from "./telas-reais";

test.describe("a tela de Transferências no site no ar, só lendo (TRF-d)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("a tela abre com a leitura nova; as duas transferências de teste para a Muffato Santa seguem à espera; as entregas mostram o TRF-d", async ({ browser }) => {
    await comPessoas(browser, [[DONO, LOJA_A], [GERENTE_B]], async (p) => {
      const dono = p[DONO] as Page;
      const gerente = p[GERENTE_B] as Page;

      await test.step("o dono, na Santa Cândida (teste), vê as transferências nº 1 e nº 2 para a Muffato Santa", async () => {
        await dono.goto("/transferencias");
        await expect(dono.getByRole("heading", { level: 1, name: "Transferências", exact: true })).toBeVisible();
        for (const numero of [1, 2]) {
          const cartao = dono.locator("section").filter({ has: dono.getByRole("heading", { name: new RegExp(`(^|· )Nº ${numero} · .+ × 1$`) }) });
          await expect(cartao).toBeVisible();
          await expect(cartao.getByText("Muffato Santa", { exact: false }).first()).toBeVisible();
          // Enquanto o proprietário não decide, seguem em trânsito; depois da regularização, recebidas com divergência.
          await expect(cartao.getByText(/^(Em trânsito|Recebida com divergência)$/).first()).toBeVisible();
        }
      });

      await test.step("o gerente da Loja de teste 2 abre a tela dele", async () => {
        await gerente.goto("/transferencias");
        await expect(gerente.getByRole("heading", { level: 1, name: "Transferências", exact: true })).toBeVisible();
        await expect(gerente.getByText("Pedir vários produtos de uma vez (nova remessa)")).toBeVisible();
      });

      await test.step("as entregas do projeto mostram o lote TRF-d", async () => {
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        await expect(lotes.filter({ has: dono.getByText("TRF-d", { exact: true }) })).toHaveCount(1);
      });
    });
  });
});
