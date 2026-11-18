import { expect, test, type Page } from "@playwright/test";

// DEMO-b (a orientação do proprietário de 18/11: "atualizar a demo dos fluxos novos com dados fictícios isolados"): os
// extratos (EXT-a), a carga do estoque pelo relatório da Rein (REIN-b, REIN-c e AUD-b), a origem das reservas do site
// (MKT-a) e a conciliação da Ora Connect com a Nogle (CONNECT-c), na demonstração. Nada é gravado.

async function usarPerfil(page: Page, perfil: string) {
  await page.goto(`/demo/perfil/usar?p=${perfil}`);
  await expect(page).toHaveURL(/\/demo$/);
}

test("extratos: a gerência concilia as certas e tira o estorno da conta com o motivo", async ({ page }) => {
  await usarPerfil(page, "gerente");
  await page.goto("/demo/financeiro");
  await page.getByRole("link", { name: "Extratos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Extratos da maquininha e do banco" })).toBeVisible();
  const picpay = page.locator("#extrato-picpay-1711");
  await expect(picpay.getByText("4 a conferir")).toBeVisible();

  await picpay.getByRole("button", { name: "Conciliar as certas (mesma referência): 1" }).click();
  await expect(picpay.getByText("3 a conferir")).toBeVisible();
  await expect(picpay.getByText("2 conciliadas")).toBeVisible();

  // O estorno não tem venda: só sai da conta com o motivo (de 3 a 200 letras).
  const estorno = picpay.locator("li", { hasText: "Estorno de venda" });
  await estorno.getByRole("button", { name: "Tirar da conta" }).click();
  const tirar = estorno.getByRole("button", { name: "Tirar da conta" });
  await expect(tirar).toBeDisabled();
  await estorno.getByLabel("Motivo").fill("Estorno da capa devolvida");
  await tirar.click();
  await expect(estorno.getByText("Fora da conta. Motivo: Estorno da capa devolvida.")).toBeVisible();

  // A linha sem venda que bata não tem o botão de conciliar.
  const semVenda = picpay.locator("li", { hasText: "Crédito 1x · Elo" });
  await expect(semVenda.getByText("Nenhuma venda bate com esta linha")).toBeVisible();
  await expect(semVenda.getByRole("button", { name: "Conciliar", exact: true })).toHaveCount(0);
});

test("carga do estoque: aplicar fica travado até decidir as linhas em que o físico passa do disponível", async ({ page }) => {
  await usarPerfil(page, "administrador");
  await page.goto("/demo/estoque");
  await page.getByRole("link", { name: "Carga do estoque pelo relatório da Rein" }).click();
  await expect(page.getByRole("heading", { name: /Carga nº 7 · Santa Cândida/ })).toBeVisible();
  await expect(page.getByText(/era o total do relatório/)).toBeVisible();

  const aplicar = page.getByRole("button", { name: "Aplicar a carga" });
  await expect(aplicar).toBeDisabled();
  await expect(page.getByText("Falta decidir 2 linhas: a carga com linha sem decisão não se aplica.")).toBeVisible();

  // Uma linha a linha (o físico conferido na loja) e a outra pela decisão em bloco (só o disponível).
  const carregador = page.locator("li", { hasText: "Carregador turbo 25 W" });
  await carregador.getByRole("button", { name: "Decidir" }).click();
  await carregador.getByLabel(/Lançar o físico/).check();
  await carregador.getByLabel("Motivo (fica registrado)").fill("Contado na loja hoje");
  await carregador.getByRole("button", { name: "Decidir esta linha" }).click();
  await expect(carregador.getByText(/Lançar o físico · motivo: Contado na loja hoje/)).toBeVisible();
  await expect(page.getByText("Falta decidir 1 linha: a carga com linha sem decisão não se aplica.")).toBeVisible();

  const cabo = page.locator("li", { hasText: "Cabo USB-C 1 m" });
  await cabo.getByRole("button", { name: "Decidir" }).click();
  await cabo.getByLabel(/Lançar só o disponível/).check();
  await cabo.getByLabel("Motivo (fica registrado)").fill("Contar depois");
  await cabo.getByRole("button", { name: "Decidir esta linha" }).click();

  await expect(aplicar).toBeEnabled();
  await expect(page.getByText(/53 unidades de 4 acessórios entram no estoque da Santa Cândida/)).toBeVisible();
  await aplicar.click();
  await expect(page.getByText("Carga aplicada (simulação)")).toBeVisible();
});

test("carga do estoque: o vendedor não vê o link nem a tela", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/estoque");
  await expect(page.getByRole("link", { name: "Carga do estoque pelo relatório da Rein" })).toHaveCount(0);
  await page.goto("/demo/estoque/carga");
  await expect(page.getByRole("button", { name: "Aplicar a carga" })).toHaveCount(0);
});

test("canais: a origem e a campanha das reservas do site, sem somar de novo na receita", async ({ page }) => {
  await usarPerfil(page, "dono");
  await page.goto("/demo/canais");
  const origem = page.getByRole("table", { name: "Reservas do site por origem e campanha" });
  await expect(origem).toBeVisible();
  await expect(origem.getByRole("rowheader", { name: /Instagram/ })).toBeVisible();
  await expect(origem.getByText("campanha: Ofertas de novembro")).toBeVisible();
  await expect(page.getByText(/Reserva não é venda/)).toBeVisible();
});

test("Ora Connect: a conciliação com os relatórios da Nogle na carteira do dono, só com o final dos números", async ({ page }) => {
  await usarPerfil(page, "dono");
  await page.goto("/demo/connect?aba=carteira");
  await expect(page.getByText("Conciliação com os relatórios da Nogle")).toBeVisible();
  const ativacoes = page.getByRole("region", { name: "Conciliação das ativações" });
  await expect(ativacoes.getByText("Com valor diferente").first()).toBeVisible();
  await expect(ativacoes.getByText(/linha final 0912 · ICCID final 1093/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Conciliação das recargas" }).getByText(/renovação feita pelo próprio cliente/).first()).toBeVisible();
});
