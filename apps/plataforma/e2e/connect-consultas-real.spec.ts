// Lote CONNECT-g (25/11/2026; ORA-CONNECT-007 e ORA-CONNECT-009): as consultas da Nogle que só leem, no site no ar. O Dono
// (teste) consulta o saldo da carteira da Ora na Nogle (uma consulta de verdade, SÓ LEITURA, pela decisão D-056: "só
// consultas"; fica o registro da consulta, e a resposta é apagada em 24 horas), desde o CONNECT-o na aba Carteira e relatórios,
// e o cartão "Saldo na Nogle" mostra o valor; o Vendedor (teste) vê as consultas da loja, sem a carteira. Nenhuma linha ou chip
// de cliente é consultado aqui.
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, LOJA_A, VENDEDOR } from "./telas-reais";

test.describe("as consultas da Nogle, no site no ar (CONNECT-g)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("o dono consulta o saldo na aba Carteira e relatórios e o valor chega em segundos; o vendedor vê as consultas da loja, sem a carteira", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(180_000);
    await comPessoas(browser, [[DONO, LOJA_A], [VENDEDOR]], async (pessoas) => {
      const dono = pessoas[DONO] as Page;
      await dono.goto("/connect/carteira");
      await expect(dono.getByRole("heading", { level: 2, name: "Consultar na Nogle", exact: true })).toBeVisible();
      // A hora desta consulta (o minuto de agora ou o seguinte), para não confundir com uma consulta de antes (a resposta fica 24 horas).
      const em = (minutos: number) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
        .format(new Date(Date.now() + minutos * 60_000)).replace(",", " às");
      const desta = new RegExp(`consultado em (${[em(0), em(1)].map((m) => m.replace(/[/.]/g, "\\$&")).join("|")})`);
      await dono.getByRole("button", { name: "Consultar o saldo" }).click();
      // O worker olha a fila a cada 2 segundos; a aba se atualiza sozinha enquanto espera.
      const saldo = dono.getByText("Saldo na Nogle", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-cartao')][1]");
      await expect(saldo).toContainText(desta, { timeout: 90_000 });
      await expect(saldo).toContainText(/R\$\s[\d.]+,\d{2}/);
      // A consulta mais nova do dono é esta, respondida (Consultar linha lista as dele).
      await dono.goto("/connect/linha");
      const consulta = dono.getByRole("list", { name: "Minhas consultas" }).getByRole("listitem").first();
      await expect(consulta).toContainText("Saldo da carteira da Ora");
      await expect(consulta).toContainText("Respondida", { timeout: 90_000 });
      await expect(consulta).toContainText(/Saldo: R\$\s[\d.]+,\d{2}/);

      const vendedor = pessoas[VENDEDOR] as Page;
      await vendedor.goto("/connect/carteira");
      await expect(vendedor.getByText(/são de quem gere a Ora Connect na rede/)).toBeVisible();
      await expect(vendedor.getByRole("button", { name: "Consultar o saldo" })).toHaveCount(0);
      await expect(vendedor.getByRole("heading", { level: 2, name: "Minhas ativações e recargas", exact: true })).toBeVisible();
      await vendedor.goto("/connect/linha");
      await expect(vendedor.getByRole("heading", { level: 2, name: "O que consultar" })).toBeVisible();
      // A consulta do dono não aparece para o vendedor (só quem pediu vê).
      await expect(vendedor.getByText("Saldo da carteira da Ora")).toHaveCount(0);
    });
  });
});
