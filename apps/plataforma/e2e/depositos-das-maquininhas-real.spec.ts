// Lote FIN-006a (24/11/2026; ORA-FIN-006: "conciliação bancária e contas multiempresa"): o depósito agrupado da maquininha
// conferido com o extrato do banco, no site no ar, num celular de 360 px, com as contas de teste. SÓ LÊ: só abre telas
// (nenhum formulário é enviado e nenhum arquivo é importado).
//
// - O Dono (teste) abre os extratos e, pelo atalho novo, a tela "Depósitos das maquininhas" de 01/11 a 24/11/2026. Na loja
//   de teste há um pagamento conciliado pelo extrato da maquininha (a venda nº 22: cartão PicPay de R$ 79,00, R$ 76,71
//   líquidos, com o dinheiro para 21/11): a tela mostra o depósito da PicPay desse dia, esperado R$ 76,71, sem linha no
//   extrato (o banco do site não tem extrato do banco importado), e conta os pagamentos das maquininhas ainda sem
//   conciliação. A tela lê a função que a migration do lote criou: se ela faltasse ou viesse com outro formato, a tela
//   cairia no erro do serviço.
// - O Gerente (teste) concilia na loja, mas os depósitos são da rede inteira: lê o aviso. O Vendedor (teste) também.
// - As entregas do projeto (do dono) mostram o lote FIN-006a.
//
// O que esta prova NÃO faz: importar um extrato do banco e casar um depósito. Isso grava e pede o sim do proprietário. As
// regras estão provadas em packages/banco/src/deposito-da-maquininha*.test.ts e, no banco da homologação, numa operação
// desfeita no fim (docs/aceite/FIN-006a.md). Se a conciliação da venda nº 22 for desfeita, o depósito some desta tela.
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, GERENTE_A, LOJA_A, VENDEDOR } from "./telas-reais";

const AVISO = "Os depósitos das maquininhas são de quem concilia pela rede inteira (o dono).";

test.describe("os depósitos das maquininhas no site no ar, só lendo (FIN-006a)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o dono abre os depósitos pelo atalho dos extratos e vê o da PicPay de 21/11; o gerente e o vendedor leem o aviso; as entregas mostram o lote", async ({ browser }) => {
    await comPessoas(browser, [[DONO, LOJA_A], [GERENTE_A], [VENDEDOR]], async (p) => {
      const dono = p[DONO] as Page;
      const gerente = p[GERENTE_A] as Page;
      const vendedor = p[VENDEDOR] as Page;

      await test.step("o atalho nos extratos leva à tela dos depósitos", async () => {
        await dono.goto("/pagamentos/extratos");
        await expect(dono.getByRole("heading", { level: 1, name: "Extratos", exact: true })).toBeVisible();
        await dono.getByRole("link", { name: "Depósitos das maquininhas" }).click();
        await expect(dono.getByRole("heading", { level: 1, name: "Depósitos das maquininhas", exact: true })).toBeVisible();
      });

      await test.step("de 01/11 a 24/11/2026: o depósito da PicPay de 21/11, sem linha no extrato do banco", async () => {
        await dono.goto("/pagamentos/depositos?inicio=2026-11-01&fim=2026-11-24");
        await expect(dono.getByRole("heading", { level: 1, name: "Depósitos das maquininhas", exact: true })).toBeVisible();
        const deposito = dono.getByRole("listitem").filter({ hasText: "PicPay · dinheiro de 21/11/2026" });
        await expect(deposito).toHaveCount(1);
        await expect(deposito).toContainText("esperado R$ 76,71");
        await expect(deposito).toContainText("sem linha no extrato");
        await expect(deposito).toContainText("Nenhuma linha de crédito livre no extrato do banco da rede");
        await expect(dono.getByText("ainda sem conciliação", { exact: false })).toBeVisible();
      });

      await test.step("o gerente e o vendedor leem o aviso, sem os depósitos", async () => {
        for (const pessoa of [gerente, vendedor]) {
          await pessoa.goto("/pagamentos/depositos");
          await expect(pessoa.getByText(AVISO)).toBeVisible();
          await expect(pessoa.getByRole("heading", { level: 1, name: "Depósitos das maquininhas", exact: true })).toHaveCount(0);
        }
      });

      await test.step("as entregas do projeto (que são do dono) mostram o lote FIN-006a", async () => {
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        await expect(lotes.filter({ has: dono.getByText("FIN-006a", { exact: true }) })).toHaveCount(1);
      });
    });
  });
});
