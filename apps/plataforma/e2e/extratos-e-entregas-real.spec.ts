// Lote AUD-c (23/11/2026; a auditoria integral do Codex de 21/11, PR #105; ORA-PAY-009, ORA-FIN-006, ORA-MKTPL-005,
// ORA-CAT-002 e ORA-INV-004): as telas que o lote mudou, abertas no site no ar, num celular de 360 px, com as contas de
// teste. SÓ LÊ: só abre telas (nenhum formulário é enviado e nenhum arquivo é importado).
//
// - O Dono (teste) abre os extratos e os repasses dos marketplaces: as duas telas leem funções que a migration do lote
//   refez (extratos_recentes, com a contagem das linhas de repasse, e marketplace_repasses_painel, que só oferece linha
//   sem uso). Se uma delas faltasse ou viesse com outro formato no banco do site, a tela cairia no erro do serviço.
// - Ele abre também a importação da planilha e a carga do estoque (o leitor da planilha mudou) e as entregas do projeto,
//   que passam a mostrar os lotes que faltavam (do J1-a ao J3-f) e o próprio AUD-c, esperando o aceite.
// - O Gerente (teste) abre os extratos da loja dele; o Vendedor (teste) lê o aviso, sem os dados.
//
// O que esta prova NÃO faz: importar um extrato e casar um repasse no site. Isso grava e pede o sim do proprietário. A regra
// do banco (a linha do extrato com um uso só) está provada em packages/banco/src/linha-do-extrato-um-uso*.test.ts e, no
// banco da homologação, numa operação desfeita no fim (docs/aceite/AUD-c.md).
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, GERENTE_A, LOJA_A, VENDEDOR } from "./telas-reais";

/** Abre a tela e confere o título dela: a tela que cai no erro do serviço não mostra o título. */
async function abrir(pagina: Page, caminho: string, titulo: string) {
  await pagina.goto(caminho);
  await expect(pagina.getByRole("heading", { level: 1, name: titulo, exact: true })).toBeVisible();
}

test.describe("as telas do lote AUD-c no site no ar, só lendo", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o dono abre os extratos, os repasses, a importação, a carga e as entregas; o gerente, os extratos; o vendedor lê o aviso", async ({ browser }) => {
    await comPessoas(browser, [[DONO, LOJA_A], [GERENTE_A], [VENDEDOR]], async (p) => {
      const dono = p[DONO] as Page;
      const gerente = p[GERENTE_A] as Page;
      const vendedor = p[VENDEDOR] as Page;

      await test.step("os extratos, com a lista lida pela função nova do banco", async () => {
        await abrir(dono, "/pagamentos/extratos", "Extratos");
        // Sem extrato importado, a tela diz isso; com extrato, mostra a lista. As duas provam que a leitura respondeu.
        await expect(dono.getByText("Nenhum extrato importado ainda").or(dono.getByRole("link", { name: /^Extrato nº \d+/ })).first()).toBeVisible();
        await expect(dono.getByRole("link", { name: "Importar extrato" })).toBeVisible();
      });

      await test.step("os repasses dos marketplaces, com o painel lido pela função nova do banco", async () => {
        await abrir(dono, "/relatorios/marketplaces/repasses", "Repasses dos marketplaces");
        await expect(dono.getByText("Nenhum repasse no período").or(dono.getByRole("button", { name: "Casar" }))
          .or(dono.getByText("Desfazer", { exact: true })).first()).toBeVisible();
      });

      await test.step("a importação da planilha e a carga do estoque abrem", async () => {
        await abrir(dono, "/produtos/importar", "Importar planilha");
        await abrir(dono, "/estoque/carga", "Carga do estoque por loja");
      });

      await test.step("as entregas do projeto mostram o AUD-c e os lotes que faltavam", async () => {
        await abrir(dono, "/entregas", "Entregas do projeto");
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        expect(await lotes.count()).toBeGreaterThanOrEqual(64);
        const audC = lotes.filter({ has: dono.getByText("AUD-c", { exact: true }) });
        await expect(audC).toHaveCount(1);
        await expect(audC.getByText("Esperando o seu aceite")).toBeVisible();
        for (const lote of ["J1-a", "J3-f"]) await expect(lotes.filter({ has: dono.getByText(lote, { exact: true }) })).toHaveCount(1);
        // O texto antigo prometia o registro da publicação "no próximo lote" (F21-03).
        await expect(dono.getByText("o registro da publicação entra no próximo lote")).toHaveCount(0);
      });

      await test.step("o gerente abre os extratos da loja; o vendedor lê o aviso, sem os dados", async () => {
        await abrir(gerente, "/pagamentos/extratos", "Extratos");
        await vendedor.goto("/pagamentos/extratos");
        await expect(vendedor.getByText("Conciliar pagamentos é da gerência da loja.")).toBeVisible();
        await expect(vendedor.getByRole("heading", { level: 1, name: "Extratos", exact: true })).toHaveCount(0);
        await vendedor.goto("/relatorios/marketplaces/repasses");
        await expect(vendedor.getByText("Só quem vê o resultado e concilia pela rede (o dono) casa o repasse com o extrato.")).toBeVisible();
      });
    });
  });
});
