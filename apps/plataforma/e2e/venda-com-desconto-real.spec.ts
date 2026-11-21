// Lote J3-b (21/11/2026; ORA-POS-005, ORA-POS-006, ORA-POS-007 e ORA-PAY-001; o sim do proprietário de 21/11 às provas do
// desconto com aprovação e do pagamento misto): a venda com desconto e três formas de pagamento, de ponta a ponta, no site no
// ar, num celular de 360 px, com duas pessoas da loja de teste.
//
// GRAVA de verdade, só na Santa Cândida (teste): o Vendedor (teste) põe uma capa de proteção (R$ 79,00) no carrinho e dá
// R$ 5,00 de desconto; sem a política de desconto da categoria, todo desconto pede aprovação; o vendedor pede, com o motivo,
// e o Gerente (teste) aprova na tela de Aprovações. O cliente paga R$ 74,00 em três formas: R$ 30,00 em dinheiro, R$ 20,00
// em Pix direto e R$ 24,00 no cartão da maquininha PicPay, com comprovantes fictícios (nenhuma cobrança de verdade). A venda
// conclui, o estoque baixa uma capa e o comprovante mostra o desconto e as três formas. O caixa do vendedor fica aberto.
//
// Rode sozinho, sem as outras provas que gravam. Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts);
// no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { cancelarVendaAberta, CAPA, cartao, concluir, horaDeBrasilia, novaVenda, pagar, pdvComCaixaAberto, porNoCarrinho } from "./pdv-real";
import { comPessoas, disponivelNaLista, GERENTE_A, VENDEDOR } from "./telas-reais";

test.describe("a venda com desconto aprovado e pagamento misto na loja de teste (J3-b)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("o desconto passa do limite, o gerente aprova e o cliente paga em dinheiro, Pix e cartão", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
    const vez = horaDeBrasilia();
    const motivo = `teste automático do desconto (${vez})`;
    await comPessoas(browser, [[VENDEDOR], [GERENTE_A]], async (pessoas) => {
      const v = pessoas[VENDEDOR] as Page;
      const g = pessoas[GERENTE_A] as Page;

      const antes = await test.step(`a loja tem ${CAPA.nome} livre`, async () => {
        const n = await disponivelNaLista(v, CAPA.sku);
        expect(n, `a loja de teste precisa de pelo menos uma ${CAPA.nome} livre`).toBeGreaterThanOrEqual(1);
        return n;
      });

      const carrinho = await test.step("o caixa aberto e uma venda nova com a capa", async () => {
        await pdvComCaixaAberto(v);
        await cancelarVendaAberta(v, "teste automático: a venda anterior ficou incompleta");
        const c = await novaVenda(v);
        await porNoCarrinho(v, CAPA);
        await expect(c).toContainText(CAPA.nome);
        return c;
      });

      await test.step("R$ 5,00 de desconto passa do limite e o vendedor pede a aprovação", async () => {
        await carrinho.getByLabel("Desconto (R$)").fill("5,00");
        await carrinho.getByRole("button", { name: "Aplicar" }).click();
        await expect(v.getByText("Esse desconto passa do limite: peça a aprovação do gerente ou do dono.")).toBeVisible();
        const pedir = cartao(v, "Carrinho").locator("details").filter({ hasText: "Pedir aprovação deste desconto" });
        await pedir.locator("summary").click();
        await pedir.getByLabel("Motivo").fill(motivo);
        await pedir.getByRole("button", { name: "Pedir" }).click();
        await expect(cartao(v, "Carrinho").getByText("aprovação pendente")).toBeVisible();
        await expect(v.getByRole("button", { name: "Concluir venda" })).toBeDisabled();
      });

      await test.step("o gerente aprova na tela de Aprovações", async () => {
        await g.goto("/aprovacoes");
        const pedido = g.getByRole("listitem").filter({ hasText: `Motivo: ${motivo}` });
        await expect(pedido).toContainText("desconto pedido R$ 5,00");
        await pedido.getByLabel("Observação").fill("teste automático: aprovado");
        await pedido.getByRole("button", { name: "Aprovar" }).click();
        await expect(g.getByText("Desconto aprovado: o vendedor já pode concluir.")).toBeVisible();
      });

      const endereco = await test.step("o cliente paga R$ 74,00 em dinheiro, Pix e cartão, e a venda conclui", async () => {
        await v.goto("/vender");
        await expect(cartao(v, "Carrinho").getByText("desconto aprovado")).toBeVisible();
        await expect(cartao(v, "Carrinho")).toContainText("R$ 74,00");
        await pagar(v, [
          { nome: "Dinheiro", valor: "30,00" },
          { nome: "Pix direto", valor: "20,00", comprovante: `PIX-TESTE-${vez.replace(/\D/g, "")}` },
          { nome: "Cartão na maquininha PicPay", valor: "24,00", comprovante: `NSU-TESTE-${vez.replace(/\D/g, "")}` },
        ]);
        return concluir(v);
      });

      await test.step("o comprovante mostra o desconto e as três formas; o estoque tem uma capa a menos", async () => {
        await v.goto(endereco);
        for (const texto of ["R$ 74,00", "R$ 5,00", "Dinheiro", "Pix direto", "Cartão na maquininha PicPay", "R$ 30,00", "R$ 20,00", "R$ 24,00"]) {
          await expect(v.getByText(texto, { exact: false }).first(), texto).toBeVisible();
        }
        expect(await disponivelNaLista(v, CAPA.sku)).toBe(antes - 1);
      });
    });
  });
});
