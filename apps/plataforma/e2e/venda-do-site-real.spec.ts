// Lote CRM-009a (24/11/2026; ORA-CRM-009): a venda que atendeu um pedido ou uma reserva do site diz de onde veio, na tela da
// venda e na ficha do cliente. No site no ar, num celular de 360 px, com as contas de teste. SÓ LÊ: só abre telas (nenhum
// formulário é enviado, e nenhuma busca de cliente é feita: a busca fica registrada, e esta prova não grava nada).
//
// - A tela da venda passou a fazer duas leituras a mais (as reservas e os pedidos do site que a venda atendeu), com as regras
//   de leitura de quem abre. Se uma delas falhasse no banco do site, a tela diria que não deu para ler de onde a venda veio.
// - O Gerente (teste) e o Vendedor (teste), na Santa Cândida (teste): abrem as vendas mais recentes da lista; o comprovante
//   abre e a leitura da origem não falha. A venda que veio do site mostra o selo e a frase; a venda comum não diz nada.
// - O Dono (teste) abre a venda mais recente da loja (ele lê as reservas do site da rede inteira) e as entregas do projeto,
//   que mostram o lote CRM-009a.
//
// O que esta prova NÃO faz: criar um pedido no site e atendê-lo na loja para ver a frase. Isso grava (e hoje nenhum produto
// está marcado para o site): pede o sim do proprietário. A regra está provada em
// packages/banco/src/venda-do-site-no-historico.test.ts; as telas, em src/lib/loja/vendas-do-site.test.ts,
// src/app/clientes/clientes.test.ts e src/app/vendas/comprovante-rodadas.test.ts.
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, GERENTE_A, LOJA_A, VENDEDOR } from "./telas-reais";

const FALHA = "Não deu para ler agora se esta venda veio de um pedido do site.";

/** Abre as vendas mais recentes da lista (até `quantas`) e confere o comprovante de cada uma. Devolve quantas vieram do site. */
async function abrirAsVendas(pagina: Page, quantas: number): Promise<{ abertas: number; doSite: number }> {
  await pagina.goto("/vendas?periodo=30");
  const linhas = pagina.getByRole("link", { name: /^Nº \d+/ });
  await expect(linhas.first(), "a loja de teste tem vendas nos últimos 30 dias").toBeVisible();
  const numeros = (await linhas.allInnerTexts()).slice(0, quantas).map((t) => (/^Nº (\d+)/.exec(t.trim()) as RegExpExecArray)[1] as string);
  let doSite = 0;
  for (const numero of numeros) {
    await pagina.goto("/vendas?periodo=30");
    await pagina.getByRole("link", { name: new RegExp(`^Nº ${numero}\\b`) }).first().click();
    await expect(pagina.getByRole("heading", { level: 2, name: `Venda nº ${numero}`, exact: true })).toBeVisible();
    await expect(pagina.getByText(FALHA, { exact: true }), `a origem da venda nº ${numero} foi lida`).toHaveCount(0);
    // A venda que atendeu um pedido do site traz o selo e a frase juntos; a venda comum, nenhum dos dois.
    const selo = await pagina.getByText("veio do site", { exact: true }).count();
    const frase = await pagina.getByText(/^Esta venda atendeu (o pedido|a reserva) do site/).count();
    expect(frase, `o selo e a frase da venda nº ${numero} andam juntos`).toBe(selo);
    doSite += selo;
  }
  return { abertas: numeros.length, doSite };
}

test.describe("a venda que veio do site, no site no ar, só lendo (CRM-009a)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o gerente, o vendedor e o dono abrem as vendas recentes: o comprovante lê a origem no site sem falha; as entregas mostram o lote", async ({ browser }) => {
    await comPessoas(browser, [[GERENTE_A], [VENDEDOR], [DONO, LOJA_A]], async (p) => {
      const gerente = p[GERENTE_A] as Page;
      const vendedor = p[VENDEDOR] as Page;
      const dono = p[DONO] as Page;

      await test.step(`o Gerente (teste), na ${LOJA_A}: as três vendas mais recentes da loja`, async () => {
        const r = await abrirAsVendas(gerente, 3);
        expect(r.abertas).toBeGreaterThan(0);
      });

      await test.step("o Vendedor (teste): as duas vendas mais recentes dele", async () => {
        const r = await abrirAsVendas(vendedor, 2);
        expect(r.abertas).toBeGreaterThan(0);
      });

      await test.step(`o Dono (teste), na ${LOJA_A}: a venda mais recente da loja`, async () => {
        const r = await abrirAsVendas(dono, 1);
        expect(r.abertas).toBe(1);
      });

      await test.step("as entregas do projeto (que são do dono) mostram o lote CRM-009a", async () => {
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        await expect(lotes.filter({ has: dono.getByText("CRM-009a", { exact: true }) })).toHaveCount(1);
      });
    });
  });
});
