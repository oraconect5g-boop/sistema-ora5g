// Lote J3-e (21/11/2026; ORA-POS-011, ORA-FISC-001, ORA-FISC-002, ORA-PERF-003, ORA-PERF-004 e ORA-PERF-005; o sim do
// proprietário de 21/11 às provas "Pedido de nota fiscal" e "Metas do mês"): o pedido de nota, sem emitir, e as metas do
// mês, no site no ar, num celular de 360 px, com duas pessoas da loja de teste.
//
// GRAVA de verdade, só na Santa Cândida (teste):
// - a nota: o Vendedor (teste) vende uma capa (R$ 79,00 em dinheiro) e pede a nota no comprovante, sem nome nem CPF; o
//   Gerente (teste) aprova na fila de Notas fiscais e depois cancela o pedido, com o motivo. Nenhuma nota é emitida: o
//   sistema não fala com o fisco (a emissão é registrada à mão, com a chave de acesso, e a prova não registra nenhuma);
// - as metas: o gerente define a meta de novembro da loja (R$ 5.000,00 de vendido líquido) e a do vendedor (R$ 2.000,00),
//   com o motivo; o vendedor vê a meta no painel de Metas e as vendas, os cancelamentos e as devoluções do mês no extrato.
// O caixa do vendedor fica aberto.
//
// Rode sozinho, sem as outras provas que gravam. Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts);
// no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { cancelarVendaAberta, CAPA, cartao, concluir, horaDeBrasilia, novaVenda, pagar, pdvComCaixaAberto, porNoCarrinho } from "./pdv-real";
import { comPessoas, GERENTE_A, LOJA_A, VENDEDOR } from "./telas-reais";

const MARCA = "teste automático da nota e das metas";

/** Abre a meta de um alvo (a loja inteira ou uma pessoa), preenche o vendido líquido e salva, com o motivo. */
async function definirVendidoLiquido(g: Page, alvo: string | RegExp, valor: string, motivo: string) {
  await g.goto("/metas");
  const definir = cartao(g, /^Definir as metas de /);
  const item = definir.locator("details").filter({ has: g.locator("summary").filter({ hasText: alvo }) });
  if ((await item.getAttribute("open")) === null) await item.locator("summary").click();
  await item.getByLabel("Vendido líquido (R$)").fill(valor);
  await item.getByLabel("Motivo (para mudar ou retirar)").fill(motivo);
  await item.getByRole("button", { name: "Salvar" }).click();
  await expect(g.getByText(/^(Metas salvas\.|Nada mudou: os valores enviados já eram os vigentes\.)/)).toBeVisible();
  await expect(cartao(g, /^Definir as metas de /).locator("summary").filter({ hasText: alvo })).toContainText(`R$ ${valor}`);
}

test.describe("o pedido de nota sem emitir e as metas do mês na loja de teste (J3-e)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("o vendedor pede a nota, o gerente aprova e cancela o pedido; o gerente define as metas e o vendedor confere", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(300_000);
    const vez = horaDeBrasilia();
    await comPessoas(browser, [[VENDEDOR], [GERENTE_A]], async (pessoas) => {
      const v = pessoas[VENDEDOR] as Page;
      const g = pessoas[GERENTE_A] as Page;

      const { endereco, numero } = await test.step("o vendedor vende uma capa em dinheiro", async () => {
        await pdvComCaixaAberto(v);
        await cancelarVendaAberta(v, "teste automático: a venda anterior ficou incompleta");
        await novaVenda(v);
        await porNoCarrinho(v, CAPA);
        await pagar(v, [{ nome: "Dinheiro", valor: "79,00" }]);
        const caminho = await concluir(v);
        const titulo = await v.getByRole("heading", { level: 2, name: /^Venda nº \d+$/ }).innerText();
        return { endereco: caminho, numero: (/\d+/.exec(titulo) as RegExpExecArray)[0] };
      });

      await test.step("o vendedor pede a nota no comprovante, sem nome nem CPF", async () => {
        await v.goto(endereco);
        await cartao(v, "Nota fiscal").getByRole("button", { name: "Pedir nota fiscal" }).click();
        await expect(v.getByText("Nota pedida: aparece na fila do dono e do gerente.")).toBeVisible();
      });

      await test.step("o gerente aprova na fila de Notas fiscais, sem emitir, e cancela o pedido", async () => {
        await g.goto("/notas");
        const pedido = () => cartao(g, "Fila").getByRole("listitem").filter({ has: g.getByRole("link", { name: new RegExp(`^Venda nº ${numero} · `) }) });
        await expect(pedido()).toHaveCount(1);
        await pedido().getByRole("button", { name: "Aprovar" }).click();
        await expect(g.getByText("Nota aprovada. Emita no portal e registre a chave de acesso aqui.")).toBeVisible();
        await expect(pedido().getByRole("button", { name: "Aprovar" })).toHaveCount(0);
        const cancelar = pedido().locator("details").filter({ hasText: "Cancelar pedido" });
        await cancelar.locator("summary").click();
        await cancelar.getByLabel("Motivo").fill(`${MARCA}: a prova não emite nota (${vez})`);
        await cancelar.getByRole("button", { name: "Cancelar" }).click();
        await expect(g.getByText("Pedido de nota cancelado.")).toBeVisible();
        await expect(pedido()).toHaveCount(0);
      });

      await test.step("o gerente define a meta de novembro da loja e a do vendedor", async () => {
        await definirVendidoLiquido(g, `Loja inteira (${LOJA_A})`, "5.000,00", `${MARCA}: a meta de novembro da loja de teste`);
        await definirVendidoLiquido(g, VENDEDOR, "2.000,00", `${MARCA}: a meta de novembro do vendedor de teste`);
      });

      await test.step("o vendedor vê a meta dele e, no extrato, as vendas, os cancelamentos e as devoluções do mês", async () => {
        await v.goto("/metas");
        await expect(v.getByText("R$ 2.000,00").first()).toBeVisible();
        await v.goto("/metas/extrato");
        await expect(v.getByRole("heading", { level: 1, name: "Meu extrato do bônus" })).toBeVisible();
        await expect(v.getByText(`Venda nº ${numero}`, { exact: true }).first()).toBeVisible();
        await expect(v.getByText(/^Cancelamento da venda nº \d+/).first()).toBeVisible();
        await expect(v.getByText(/^Devolução nº \d+ da venda nº \d+/).first()).toBeVisible();
      });
    });
  });
});
