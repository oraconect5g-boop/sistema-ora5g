// Lote PAY-011a (24/11/2026; ORA-PAY-011: "gerir chargebacks, estornos, antecipação e ajustes; efeito financeiro e comissão
// não duplicado"): o débito do extrato e o estorno da venda, nas telas do site no ar, num celular de 360 px, com as contas
// de teste. SÓ LÊ: só abre telas (nenhum formulário é enviado e nenhum arquivo é importado).
//
// - O Gerente (teste) abre os extratos da loja: a lista é lida pela função que a migration do lote refez (agora com a
//   contagem dos débitos de estorno). Se a função faltasse ou viesse com outro formato no banco do site, a tela cairia no
//   erro do serviço. Havendo extrato importado, ele abre o primeiro e vê o filtro novo "De estorno" (a tela do extrato
//   lê o resumo, as linhas com o estorno e as sugestões de estorno pelo que o lote criou).
// - Ele abre as vendas canceladas dos últimos 30 dias e, na primeira que tem estorno de cartão ou Pix, lê no cartão dos
//   estornos que o estorno também se confirma pelo débito do extrato importado. Nessa tela roda a leitura do débito que
//   comprova cada estorno confirmado (as colunas novas das linhas do extrato): se ela falhasse, o aviso de falha apareceria.
// - O Vendedor (teste) lê o aviso, sem os extratos.
// - As entregas do projeto (do dono) mostram o lote PAY-011a.
//
// O que esta prova NÃO faz: importar um extrato com um débito e confirmar um estorno por ele. Isso grava e pede o sim do
// proprietário. As regras estão provadas em packages/banco/src/debito-do-extrato-e-estorno*.test.ts e, no banco da
// homologação, numa operação desfeita no fim (docs/aceite/PAY-011a.md).
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, GERENTE_A, LOJA_A, VENDEDOR } from "./telas-reais";

const DOS_ESTORNOS = "Estornos de cartão, Pix e financeira";
const PELO_EXTRATO = "ou com o débito do extrato importado (em Conciliação, Extratos por arquivo)";
const FALHA_DA_LEITURA = "Não deu para ler agora se um débito do extrato comprova estes estornos.";

test.describe("o débito do extrato e o estorno da venda no site no ar, só lendo (PAY-011a)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o gerente abre os extratos e a venda cancelada com estorno; o vendedor lê o aviso; as entregas mostram o lote", async ({ browser }) => {
    await comPessoas(browser, [[DONO, LOJA_A], [GERENTE_A], [VENDEDOR]], async (p) => {
      const dono = p[DONO] as Page;
      const gerente = p[GERENTE_A] as Page;
      const vendedor = p[VENDEDOR] as Page;

      await test.step("os extratos da loja, com a lista lida pela função que o lote refez", async () => {
        await gerente.goto("/pagamentos/extratos");
        await expect(gerente.getByRole("heading", { level: 1, name: "Extratos", exact: true })).toBeVisible();
        const importados = gerente.getByRole("link", { name: /^Extrato nº \d+/ });
        // Sem extrato importado, a tela diz isso; com extrato, mostra a lista. As duas provam que a leitura respondeu.
        await expect(gerente.getByText("Nenhum extrato importado ainda").or(importados.first())).toBeVisible();
        if (await importados.count() === 0) {
          test.info().annotations.push({ type: "sem extrato", description: `nenhum extrato importado na ${LOJA_A}: a tela do extrato não foi aberta` });
          return;
        }
        // Havendo extrato: a tela dele abre com o filtro novo, o que prova o resumo, as linhas e as sugestões de estorno.
        await importados.first().click();
        await expect(gerente.getByRole("heading", { level: 1, name: /^Extrato nº \d+/ })).toBeVisible();
        await expect(gerente.getByRole("navigation", { name: "Situação das linhas" }).getByRole("link", { name: /^De estorno/ })).toBeVisible();
      });

      await test.step("a venda cancelada com estorno diz que ele também se confirma pelo débito do extrato", async () => {
        await gerente.goto("/vendas?periodo=30&situacao=canceladas");
        await expect(gerente.getByRole("heading", { level: 1, name: /^(Minhas vendas|Vendas da loja)$/ })).toBeVisible();
        const enderecos = await gerente.getByRole("link", { name: /^Nº \d+/ }).evaluateAll((links) => links.slice(0, 12).map((a) => a.getAttribute("href") ?? ""));
        let achou = false;
        for (const endereco of enderecos.filter((e) => e.startsWith("/vendas/"))) {
          await gerente.goto(endereco);
          // O comprovante da venda: o título dela é o cartão "Venda nº N".
          await expect(gerente.getByRole("heading", { level: 2, name: /^Venda nº \d+$/ })).toBeVisible();
          if (await gerente.getByRole("heading", { name: DOS_ESTORNOS, exact: true }).count() === 0) continue;
          achou = true;
          await expect(gerente.getByText(PELO_EXTRATO, { exact: false })).toBeVisible();
          // A leitura do débito que comprova o estorno respondeu (sem débito ligado, nada é anotado; com falha, o aviso apareceria).
          await expect(gerente.getByText(FALHA_DA_LEITURA)).toHaveCount(0);
          break;
        }
        if (!achou) test.info().annotations.push({ type: "sem venda", description: `nenhuma venda cancelada com estorno de cartão ou Pix nos últimos 30 dias na ${LOJA_A}` });
      });

      await test.step("o vendedor lê o aviso, sem os extratos", async () => {
        await vendedor.goto("/pagamentos/extratos");
        await expect(vendedor.getByText("Conciliar pagamentos é da gerência da loja.")).toBeVisible();
        await expect(vendedor.getByRole("heading", { level: 1, name: "Extratos", exact: true })).toHaveCount(0);
      });

      await test.step("as entregas do projeto (que são do dono) mostram o lote PAY-011a", async () => {
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        await expect(lotes.filter({ has: dono.getByText("PAY-011a", { exact: true }) })).toHaveCount(1);
      });
    });
  });
});
