// Lote J3-c (21/11/2026; ORA-POS-010, ORA-PAY-003 e ORA-PAY-005; o sim do proprietário de 21/11 à prova "Cancelar e
// devolver"): o cancelamento com estorno e a devolução de um item, de ponta a ponta, no site no ar, num celular de 360 px,
// com três pessoas da loja de teste.
//
// GRAVA de verdade, só na Santa Cândida (teste): o Gerente (teste) abre o caixa com R$ 150,00 de troco (para ter dinheiro
// a devolver). O Vendedor (teste) vende uma capa de proteção (R$ 79,00: R$ 50,00 em dinheiro e R$ 29,00 em Pix direto); o
// gerente cancela com estorno: os R$ 50,00 saem do caixa dele, o Pix fica como estorno a confirmar, e ele confirma com um
// comprovante de teste; a capa volta, ele confere (nova, lacrada) e ela volta ao estoque. O vendedor vende duas capas
// (R$ 158,00 em dinheiro); o gerente devolve uma, com R$ 79,00 em dinheiro do caixa dele, e ela volta ao estoque. No fim, o
// gerente fecha o caixa contando R$ 21,00, sem diferença, e o Dono (teste) confere (quem fecha não confere o próprio). Nenhum
// dinheiro, Pix ou estorno de verdade: os comprovantes são de teste. O caixa do vendedor fica aberto, com o dinheiro das
// vendas (o J3-a fecha e confere quando roda).
//
// Rode sozinho, sem as outras provas que gravam. Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts);
// no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import {
  abrirCaixaCom, abrirTelaDoCaixa, cancelarVendaAberta, CAPA, cartao, concluir, conferirCaixa, fecharSemDiferenca, type Forma,
  horaDeBrasilia, novaVenda, pagar, pdvComCaixaAberto, porNoCarrinho,
} from "./pdv-real";
import { comPessoas, disponivelNaLista, DONO, GERENTE_A, LOJA_A, VENDEDOR } from "./telas-reais";

const MARCA = "teste automático de cancelar e devolver";

/** O vendedor vende capas de proteção e devolve o endereço do comprovante. */
async function venderCapas(v: Page, quantidade: number, formas: readonly Forma[]) {
  await pdvComCaixaAberto(v);
  await cancelarVendaAberta(v, "teste automático: a venda anterior ficou incompleta");
  await novaVenda(v);
  await porNoCarrinho(v, CAPA, quantidade);
  await pagar(v, formas);
  return concluir(v);
}

test.describe("cancelar e devolver na loja de teste (J3-c)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("a gerência cancela uma venda com estorno e recebe a capa de volta; depois devolve uma capa de outra venda", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(300_000);
    const vez = horaDeBrasilia();
    const numero = vez.replace(/\D/g, "");
    await comPessoas(browser, [[VENDEDOR], [GERENTE_A], [DONO, LOJA_A]], async (pessoas) => {
      const v = pessoas[VENDEDOR] as Page;
      const g = pessoas[GERENTE_A] as Page;
      const d = pessoas[DONO] as Page;

      await test.step("o caixa que uma vez anterior deixou aberto com o gerente é fechado, e o dono confere", async () => {
        await abrirTelaDoCaixa(g);
        if (await cartao(g, "Meu caixa aberto").isVisible()) {
          const marca = `${MARCA}: fecha o caixa que ficou aberto (${vez})`;
          await fecharSemDiferenca(g, marca);
          await conferirCaixa(d, marca, `${MARCA}: conferido`);
          await abrirTelaDoCaixa(g);
        }
      });

      await test.step("o gerente abre o caixa com R$ 150,00 de troco, para ter dinheiro a devolver", () => abrirCaixaCom(g, "150,00"));

      const antes = await test.step(`a loja tem pelo menos duas ${CAPA.nome} livres`, async () => {
        const n = await disponivelNaLista(v, CAPA.sku);
        expect(n, `a loja de teste precisa de pelo menos duas ${CAPA.nome} livres`).toBeGreaterThanOrEqual(2);
        return n;
      });

      const vendaCancelada = await test.step("o vendedor vende uma capa: R$ 50,00 em dinheiro e R$ 29,00 em Pix direto", () =>
        venderCapas(v, 1, [{ nome: "Dinheiro", valor: "50,00" }, { nome: "Pix direto", valor: "29,00", comprovante: `PIX-TESTE-${numero}` }]));

      await test.step("o gerente cancela com estorno: o dinheiro sai do caixa dele e o Pix fica como estorno a confirmar", async () => {
        await g.goto(vendaCancelada);
        const cancelar = g.locator("details").filter({ hasText: "Cancelar esta venda (estorno)" });
        await cancelar.locator("summary").click();
        await cancelar.getByLabel("Motivo (fica na auditoria)").fill(`${MARCA}: o cliente desistiu (${vez})`);
        await cancelar.getByRole("button", { name: "Cancelar com estorno" }).click();
        await expect(g.getByText(/Venda cancelada\. O dinheiro saiu do seu caixa/)).toBeVisible();
        await expect(g.getByText(`Motivo: ${MARCA}: o cliente desistiu (${vez})`)).toBeVisible();
        expect(await disponivelNaLista(v, CAPA.sku), "a capa só volta ao estoque depois de conferida").toBe(antes - 1);
      });

      await test.step("o gerente confirma o estorno do Pix com o comprovante", async () => {
        const pix = () => cartao(g, "Estornos de cartão, Pix e financeira").getByRole("listitem").filter({ hasText: "Pix direto · cancelamento" });
        await expect(pix()).toContainText("R$ 29,00");
        await pix().getByLabel("Comprovante do estorno").fill(`ESTORNO-TESTE-${numero}`);
        await pix().getByRole("button", { name: "Confirmar estorno" }).click();
        await expect(g.getByText("Estorno confirmado com o comprovante.")).toBeVisible();
        await expect(pix()).toContainText(`comprovante ESTORNO-TESTE-${numero}`);
      });

      await test.step("a capa volta, o gerente confere (nova, lacrada) e ela volta ao estoque", async () => {
        const retorno = cartao(g, "Itens a receber de volta").getByRole("listitem").filter({ hasText: CAPA.nome });
        await retorno.getByLabel("O item voltou?").selectOption("sim");
        await retorno.getByLabel("Condição").selectOption("novo");
        await retorno.getByRole("button", { name: "Registrar conferência" }).click();
        await expect(g.getByText("Item conferido e de volta ao estoque.")).toBeVisible();
        expect(await disponivelNaLista(v, CAPA.sku)).toBe(antes);
      });

      const vendaDevolvida = await test.step("o vendedor vende duas capas, R$ 158,00 em dinheiro", () =>
        venderCapas(v, 2, [{ nome: "Dinheiro", valor: "158,00" }]));

      await test.step("o gerente devolve uma das capas, com R$ 79,00 em dinheiro do caixa dele, e ela volta ao estoque", async () => {
        await g.goto(vendaDevolvida);
        const devolver = g.locator("details").filter({ hasText: "Devolver ou trocar itens" });
        await devolver.locator("summary").click();
        const linha = devolver.getByRole("listitem").filter({ hasText: CAPA.nome });
        await expect(linha).toContainText("resta 2");
        await linha.getByLabel("Devolver", { exact: true }).fill("1");
        await linha.getByLabel("Condição (obrigatória)").selectOption("novo");
        await devolver.getByLabel("Reembolso 1").selectOption("dinheiro");
        await devolver.getByLabel("Valor (R$)").first().fill("79,00");
        await devolver.getByLabel("Motivo (fica na auditoria)").fill(`${MARCA}: o cliente devolveu uma capa (${vez})`);
        await devolver.getByRole("button", { name: "Registrar devolução" }).click();
        await expect(g.getByText(/Devolução nº \d+ registrada: estoque e caixa atualizados\./)).toBeVisible();
        const devolucoes = cartao(g, "Devoluções");
        await expect(devolucoes).toContainText(`${CAPA.nome} × 1`);
        await expect(devolucoes).toContainText("R$ 79,00");
        expect(await disponivelNaLista(v, CAPA.sku), "vendeu duas e voltou uma").toBe(antes - 1);
      });

      await test.step("o gerente fecha o caixa contando R$ 21,00, sem diferença, e o dono confere", async () => {
        await abrirTelaDoCaixa(g);
        const marca = `${MARCA}: fecha o caixa da prova (${vez})`;
        expect(await fecharSemDiferenca(g, marca), "R$ 150,00 de troco, menos R$ 50,00 e R$ 79,00 devolvidos").toBe("21,00");
        await conferirCaixa(d, marca, `${MARCA}: conferido`);
      });
    });
  });
});
