// Lote CONNECT-d (24/11/2026; ORA-INV-011): a prova de leitura do estoque de chips da Nogle, no site no ar, num celular de
// 360 px. SÓ LÊ: não liga PDV a loja e não chama a Nogle (a tela lê o banco, que o worker do servidor preenche). Com as
// contas de teste:
// - o Dono (teste), na rede inteira: as 11 lojas ligadas aos PDVs delas, a hora da leitura, os chips da Santa Cândida e a
//   busca pelo fim do ICCID, que diz onde o chip está;
// - o Administrador (teste): os PDVs e as contagens, mas não a lista dos chips (a RLS do banco);
// - o Gerente (teste), na Santa Cândida (teste), que não tem PDV na Nogle: nada da rede.
// CONNECT-e: o formulário "Transferir chips" aparece só para o dono; a prova NÃO pede transferência (moveria chips de verdade
// na Nogle: cada uma pede o sim do proprietário). CONNECT-f: o cartão "Chips para conferir" também é só do dono.
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { ADMINISTRADOR, comPessoas, DONO, GERENTE_A, LOJA_A } from "./telas-reais";

const secao = (p: Page, titulo: string) => p.locator("section").filter({ has: p.getByRole("heading", { level: 2, name: titulo, exact: true }) });

test.describe("os chips na Nogle, no site no ar (CONNECT-d)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("o dono vê as lojas, os chips e onde está um chip; o administrador, só as contagens; o gerente da loja de teste, nada", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(180_000);
    await comPessoas(browser, [[DONO, LOJA_A], [ADMINISTRADOR, LOJA_A], [GERENTE_A]], async (pessoas) => {
      const dono = pessoas[DONO] as Page;
      await dono.goto("/connect/chips");
      await expect(dono.getByRole("heading", { level: 2, name: "Chips na Nogle", exact: true })).toBeVisible();
      await expect(dono.getByText(/Última leitura da Nogle: \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}\./)).toBeVisible();
      await expect(dono.getByText("Estoque geral da Ora", { exact: true })).toBeVisible();
      const lojas = secao(dono, "Lojas");
      await expect(lojas.getByRole("link", { name: "Ver os chips" })).toHaveCount(11);
      const santaCandida = lojas.getByRole("listitem").filter({ has: dono.getByText("Santa Cândida", { exact: true }) });
      await santaCandida.getByRole("link", { name: "Ver os chips" }).click();
      await expect(dono.getByRole("heading", { level: 2, name: "Chips de Santa Cândida" })).toBeVisible();
      const chips = dono.getByRole("list", { name: "Chips", exact: true }).getByRole("listitem");
      await expect(chips.first()).toBeVisible();
      // A busca pelo fim do ICCID do primeiro chip da lista diz que ele está na Santa Cândida.
      const iccid = ((await chips.first().locator(".numeros").textContent()) ?? "").replace(/\D/g, "");
      expect(iccid).toMatch(/^89\d{17,18}$/);
      await dono.getByLabel("Fim do ICCID (4 dígitos ou mais)").fill(iccid.slice(-6));
      await dono.getByRole("button", { name: "Buscar" }).click();
      await expect(dono.getByRole("list", { name: "Chips achados" }).getByRole("listitem").filter({ hasText: /na loja Santa Cândida \(PDV \d+\)/ })).toHaveCount(1);
      // O formulário da transferência, com as lojas como destino (sem enviar nada).
      const transferir = secao(dono, "Transferir chips");
      await expect(transferir.getByRole("button", { name: "Pedir a transferência" })).toBeVisible();
      await expect(transferir.getByLabel("Para onde").locator("option", { hasText: /^Santa Cândida \(PDV \d+\)$/ })).toHaveCount(1);
      // CONNECT-f: os chips no estoque de uma loja e fora do PDV dela na Nogle (com ou sem algum, o cartão aparece).
      await expect(dono.getByRole("heading", { level: 2, name: "Chips para conferir" })).toBeVisible();

      const administrador = pessoas[ADMINISTRADOR] as Page;
      await administrador.goto("/connect/chips?pdv=mvno");
      await expect(secao(administrador, "Lojas").getByRole("link", { name: "Ver os chips" })).toHaveCount(11);
      await expect(administrador.getByText("A lista dos chips é de quem gere a Ora Connect na rede ou opera esta loja.")).toBeVisible();
      await expect(administrador.getByRole("heading", { level: 2, name: "Transferir chips" })).toHaveCount(0);
      await expect(administrador.getByRole("heading", { level: 2, name: "Chips para conferir" })).toHaveCount(0);

      const gerente = pessoas[GERENTE_A] as Page;
      await gerente.goto("/connect/chips");
      await expect(gerente.getByRole("heading", { level: 2, name: "Nenhum PDV da Nogle para mostrar" })).toBeVisible();
      await expect(gerente.getByText("Estoque geral da Ora", { exact: true })).toHaveCount(0);
      await expect(gerente.getByRole("heading", { level: 2, name: "Transferir chips" })).toHaveCount(0);
      await expect(gerente.getByRole("heading", { level: 2, name: "Chips para conferir" })).toHaveCount(0);
    });
  });
});
