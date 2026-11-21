// Lote J3-a (21/11/2026; ORA-PAY-004, ORA-PAY-005 e ORA-PAY-006; o sim do proprietário de 21/11 à prova do caixa): o caixa
// de ponta a ponta, no site no ar, num celular de 360 px, com duas pessoas da loja de teste.
//
// GRAVA de verdade, só na Santa Cândida (teste): o Vendedor (teste) abre o caixa com R$ 50,00 de troco, lança R$ 10,00 de
// suprimento e R$ 20,00 de sangria e pede uma saída de R$ 5,00, que o Gerente (teste) autoriza; o vendedor fecha contando
// R$ 35,00, sem diferença, e o gerente confere. O caixa que a venda de teste (J1-b) deixou aberto é fechado e conferido
// antes. O gerente só confere os caixas que esta prova fechou (marcados na observação): os de outras pessoas ficam como
// estão. No fim, o caixa do vendedor fica fechado; a venda de teste abre de novo quando precisar.
//
// Rode sozinho, sem as outras provas que gravam. Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts);
// no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { abrirCaixaCom, abrirTelaDoCaixa, cartao, conferirCaixa, dinheiroNaGaveta, fecharSemDiferenca, horaDeBrasilia } from "./pdv-real";
import { comPessoas, GERENTE_A, VENDEDOR } from "./telas-reais";

const MARCA = "teste automático do caixa";

test.describe("o caixa de ponta a ponta na loja de teste (J3-a)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("abre, lança suprimento e sangria, pede e autoriza uma saída, fecha sem diferença e outra pessoa confere", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
    const vez = horaDeBrasilia();
    await comPessoas(browser, [[VENDEDOR], [GERENTE_A]], async (pessoas) => {
      const v = pessoas[VENDEDOR] as Page;
      const g = pessoas[GERENTE_A] as Page;

      await test.step("o caixa que uma vez anterior deixou aberto é fechado e conferido", async () => {
        await abrirTelaDoCaixa(v);
        if (await cartao(v, "Meu caixa aberto").isVisible()) {
          const marca = `${MARCA}: fecha o caixa que ficou aberto (${vez})`;
          await fecharSemDiferenca(v, marca);
          await conferirCaixa(g, marca, `${MARCA}: conferido`);
          await abrirTelaDoCaixa(v);
        }
      });

      await test.step("o vendedor abre o caixa com R$ 50,00 de troco", () => abrirCaixaCom(v, "50,00"));

      await test.step("lança R$ 10,00 de suprimento e R$ 20,00 de sangria", async () => {
        for (const [tipo, valor, aviso] of [["suprimento", "10,00", "Suprimento lançado."], ["sangria", "20,00", "Sangria lançada."]] as const) {
          const quadro = cartao(v, "Suprimento ou sangria");
          await quadro.getByLabel("Tipo").selectOption(tipo);
          await quadro.getByLabel("Valor (R$)").fill(valor);
          await quadro.getByLabel("Motivo").fill(`${MARCA}: ${tipo} (${vez})`);
          await quadro.getByRole("button", { name: "Lançar" }).click();
          await expect(v.getByText(aviso)).toBeVisible();
        }
        expect(await dinheiroNaGaveta(v)).toBe("40,00");
      });

      const motivoDaSaida = `${MARCA}: saída para o motoboy (${vez})`;
      await test.step("pede uma saída de R$ 5,00, e o gerente autoriza", async () => {
        const saida = cartao(v, "Saída de dinheiro");
        await saida.getByLabel("Valor (R$)").fill("5,00");
        await saida.getByLabel("Motivo").fill(motivoDaSaida);
        await saida.getByRole("button", { name: "Pedir autorização" }).click();
        await expect(v.getByText(/Pedido de saída enviado/)).toBeVisible();
        await abrirTelaDoCaixa(g);
        const pedido = cartao(g, "Saídas para autorizar").getByRole("listitem").filter({ hasText: motivoDaSaida });
        await expect(pedido).toContainText("R$ 5,00");
        await pedido.getByRole("button", { name: "Autorizar" }).click();
        await expect(g.getByText(/Saída autorizada/)).toBeVisible();
        await abrirTelaDoCaixa(v);
        expect(await dinheiroNaGaveta(v)).toBe("35,00");
      });

      await test.step("o vendedor fecha contando R$ 35,00, sem diferença, e o gerente confere", async () => {
        const marca = `${MARCA}: fecha o caixa da prova (${vez})`;
        expect(await fecharSemDiferenca(v, marca)).toBe("35,00");
        await conferirCaixa(g, marca, `${MARCA}: conferido`);
      });
    });
  });
});
