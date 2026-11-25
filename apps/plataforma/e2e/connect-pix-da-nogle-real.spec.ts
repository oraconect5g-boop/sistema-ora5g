// Lote CONNECT-l (25/11/2026; a D-062): o Pix da Nogle na loja, no site no ar, SÓ LEITURA. Com o Vendedor (teste): o
// formulário da ativação e o da recarga (desde o CONNECT-m, nas abas Ativar chip e Recarga) trazem o "Pagamento à Nogle" com o Pix da Nogle marcado (o padrão, "não com o
// crédito da Nogle") e o crédito da carteira como a outra escolha; o serviço pago no caixa começa em "Nenhum" (o cliente
// paga direto à Nogle). Nada é vendido, registrado ou enviado à Nogle (a operação de verdade é do proprietário, pelo
// roteiro docs/aceite/CONNECT-l.md).
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, VENDEDOR } from "./telas-reais";

test.describe("o Pix da Nogle na loja, no site no ar (CONNECT-l)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("o vendedor vê o Pix da Nogle como o padrão na ativação e na recarga; nada é enviado", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(120_000);
    await comPessoas(browser, [[VENDEDOR]], async (pessoas) => {
      const vendedor = pessoas[VENDEDOR] as Page;
      for (const [aba, endereco] of [["Ativar chip", "/connect/ativar"], ["Recarga", "/connect/recarga"]] as const) {
        await vendedor.goto(endereco);
        await expect(vendedor.getByRole("heading", { level: 1, name: "Ora Connect" })).toBeVisible();
        await expect(vendedor.getByRole("navigation", { name: "Funções da Ora Connect" }).getByRole("link", { name: aba, exact: true })).toHaveAttribute("aria-current", "true");
        const pagamento = vendedor.getByRole("group", { name: "Pagamento à Nogle" });
        await expect(pagamento.getByRole("radio", { name: /^Pix da Nogle/ })).toBeChecked();
        await expect(pagamento.getByRole("radio", { name: /^Crédito da carteira/ })).not.toBeChecked();
        // A lista do serviço pago (o texto da opção da carteira também fala do "serviço pago no caixa": pelo papel, não pelo rótulo).
        const servico = pagamento.getByRole("combobox");
        await expect(servico).toHaveValue("");
        await expect(servico.locator("option").first()).toHaveText("Nenhum: o cliente paga o Pix da Nogle direto");
      }
    });
  });
});
