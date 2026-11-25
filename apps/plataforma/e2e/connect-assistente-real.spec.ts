// Lote CONNECT-n (25/11/2026): o assistente de ativação (o formato da demonstração), no site no ar, SÓ LEITURA. O Vendedor
// (teste) percorre os 5 passos com um eSIM e um cliente FICTÍCIO (o CPF de exemplo, com o dígito verificador), confere o resumo
// e PARA antes de "Registrar ativação": nada é registrado nem enviado à Nogle (cada ativação de verdade é do proprietário).
// Também confere o aviso de cada passo e o Pix da Nogle como o padrão do pagamento (a D-062).
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, VENDEDOR } from "./telas-reais";

test.describe("o assistente de ativação, no site no ar (CONNECT-n)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("o vendedor percorre os 5 passos e confere o resumo, sem registrar", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(120_000);
    await comPessoas(browser, [[VENDEDOR]], async (pessoas) => {
      const v = pessoas[VENDEDOR] as Page;
      const continuar = v.getByRole("button", { name: "Continuar" });
      const passo = (texto: string) => expect(v.getByText(texto, { exact: true })).toBeVisible();
      await v.goto("/connect/ativar");
      await passo("Etapa 1 de 5: Chip");
      // Sem o chip, o aviso, e o passo não muda.
      await continuar.click();
      await expect(v.getByRole("alert").getByText(/^Digite o ICCID do chip/)).toBeVisible();
      await passo("Etapa 1 de 5: Chip");
      await v.getByText("eSIM (chip virtual)", { exact: true }).click();
      await continuar.click();

      await passo("Etapa 2 de 5: Cliente");
      await v.getByLabel("Nome completo do cliente").fill("Cliente Fictício");
      await v.getByLabel("CPF ou CNPJ").fill("529.982.247-24");
      await continuar.click();
      await expect(v.getByRole("alert").getByText(/CPF \(11 dígitos\) ou CNPJ/)).toBeVisible();
      await v.getByLabel("CPF ou CNPJ").fill("529.982.247-25");
      await v.getByLabel("CEP").fill("80000-000");
      await v.getByLabel("Cidade").selectOption({ label: "Curitiba (PR)" });
      await v.getByLabel("Rua").fill("Rua Fictícia");
      await v.getByLabel("Número", { exact: true }).fill("100");
      await v.getByLabel("Bairro").fill("Centro");
      await continuar.click();

      await passo("Etapa 3 de 5: Plano e DDD");
      await v.getByRole("group", { name: "Plano (lista da Nogle)" }).getByRole("radio", { name: /^10 GB\s*R\$\s54,90$/ }).check({ force: true });
      await v.getByLabel("DDD da linha nova").selectOption("41");
      await continuar.click();

      await passo("Etapa 4 de 5: Pagamento");
      const pagamento = v.getByRole("group", { name: "Pagamento à Nogle" });
      await expect(pagamento.getByRole("radio", { name: /^Pix da Nogle/ })).toBeChecked();
      await expect(pagamento.getByRole("radio", { name: /^Crédito da carteira/ })).not.toBeChecked();
      await expect(pagamento.getByRole("combobox")).toHaveValue("");
      await continuar.click();

      await passo("Etapa 5 de 5: Conferir");
      for (const [nome, valor] of [["Chip", "eSIM (chip virtual)"], ["Titular", "Cliente Fictício · •••.•••.247-25"], ["DDD", "41"],
        ["Pagamento à Nogle", "Pix da Nogle: o cliente paga direto, na hora"], ["Serviço pago no caixa", "Nenhum"]] as const) {
        await expect(v.getByRole("definition").filter({ hasText: valor }), nome).toBeVisible();
      }
      await expect(v.getByRole("definition").filter({ hasText: /^10 GB · R\$\s54,90$/ })).toBeVisible();
      // O botão existe, mas a prova PARA aqui: nada é registrado nem enviado à Nogle.
      await expect(v.getByRole("button", { name: "Registrar ativação" })).toBeVisible();
      await v.getByRole("button", { name: "Voltar" }).click();
      await passo("Etapa 4 de 5: Pagamento");
    });
  });
});
