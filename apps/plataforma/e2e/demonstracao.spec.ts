import { expect, test, type Page } from "@playwright/test";

const PAGINAS_DO_DONO = [
  ["/demo", "Visão geral da Ora"],
  ["/demo/aprovacoes", "Aprovações"],
  ["/demo/lojas", "Lojas e usuários"],
  ["/demo/metas", "Metas e desempenho"],
  ["/demo/financeiro", "Caixa, financeiro e notas"],
  ["/demo/estoque", "Estoque e rastreio por IMEI"],
  ["/demo/connect", "Ora Connect"],
  ["/demo/assistencia", "Assistência técnica (Ordem de Serviço)"],
  ["/demo/clientes", "Clientes e atendimento"],
  ["/demo/canais", "Canais online e campanhas"],
  ["/demo/vender", "Nova venda"],
] as const;

async function usarPerfil(page: Page, perfil: string) {
  await page.goto(`/demo/perfil/usar?p=${perfil}`);
  await expect(page).toHaveURL(/\/demo$/);
}

async function semRolagemLateral(page: Page) {
  const { conteudo, tela } = await page.evaluate(() => ({
    conteudo: document.documentElement.scrollWidth,
    tela: document.documentElement.clientWidth,
  }));
  expect(conteudo).toBeLessThanOrEqual(tela);
}

test("todas as telas do dono abrem, avisam que é demonstração e cabem na tela", async ({ page }) => {
  await usarPerfil(page, "dono");
  for (const [caminho, titulo] of PAGINAS_DO_DONO) {
    const resposta = await page.goto(caminho);
    expect(resposta?.status(), caminho).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
    await expect(page.getByText("DEMONSTRAÇÃO · dados fictícios · nada é gravado")).toBeVisible();
    await semRolagemLateral(page);
  }
});

test("vendedor vê o início do celular e não acessa aprovações", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await expect(page.getByRole("heading", { name: "Bom dia, Ana!" })).toBeVisible();
  await page.goto("/demo/aprovacoes");
  await expect(page.getByRole("heading", { name: "Sem permissão" })).toBeVisible();
});

test("administrador não vende (ADR-002, teste T8)", async ({ page }) => {
  await usarPerfil(page, "administrador");
  await page.goto("/demo/vender");
  await expect(page.getByRole("heading", { name: "Sem permissão" })).toBeVisible();
  await page.goto("/demo/importacao");
  await expect(page.getByText("IMEI repetido (linha 3)")).toBeVisible();
  await expect(page.getByText("IMEI com dígito verificador inválido")).toBeVisible();
});

test("venda no celular: aparelho com IMEI, Pix na maquininha e conclusão", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vender");
  await page.getByLabel("Buscar produto").fill("galaxy");
  await page.getByRole("button", { name: "Adicionar Galaxy A55 256 GB" }).click();
  await page.getByRole("button", { name: /^IMEI/ }).first().click();
  await expect(page.getByText("reservado para esta venda")).toBeVisible();

  const concluir = page.getByRole("button", { name: "Conferir e concluir venda" });
  await expect(concluir).toBeDisabled();
  await page.getByRole("button", { name: "Pix na maquininha PicPay" }).click();
  await concluir.click();

  await expect(page.getByRole("heading", { name: "Venda concluída na demonstração" })).toBeVisible();
  await expect(page.getByText("R$ 2.199,00").first()).toBeVisible();
});

test("desconto acima do limite exige aprovação do gerente", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vender");
  await page.getByLabel("Buscar produto").fill("iphone");
  await page.getByRole("button", { name: "Adicionar iPhone 15 128 GB" }).click();
  await page.getByRole("button", { name: /^IMEI/ }).first().click();
  await page.getByLabel("Desconto R$").fill("400,00");
  await expect(page.getByText("Precisa de aprovação do gerente ou dono")).toBeVisible();
  await page.getByRole("button", { name: "Pedir aprovação do desconto" }).click();
  await expect(page.getByText("Desconto enviado para aprovação")).toBeVisible();
});

test("pagamento misto mostra troco e o que falta", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vender");
  await page.getByLabel("Buscar produto").fill("capa");
  await page.getByRole("button", { name: "Adicionar Capa de proteção" }).click();
  await page.getByRole("button", { name: "Dinheiro" }).click();
  await page.getByLabel("Valor R$").fill("100,00");
  await expect(page.getByText("Troco: R$ 21,00")).toBeVisible();
  await page.getByLabel("Valor R$").fill("50,00");
  await expect(page.getByText("Falta receber R$ 29,00")).toBeVisible();
});

test("REV-010: cookie de perfil adulterado não derruba a demonstração", async ({ page, context }) => {
  for (const valor of ["constructor", "__proto__", "toString", "inexistente"]) {
    await context.clearCookies();
    await context.addCookies([{ name: "ora_demo_perfil", value: valor, url: "http://127.0.0.1:3180" }]);
    const resposta = await page.goto("/demo");
    expect(resposta?.status(), valor).toBe(200);
    await expect(page.getByRole("heading", { name: "Visão geral da Ora" })).toBeVisible();
  }
});

test("REV-013: vendedor não vê margem; gerente vê", async ({ page }) => {
  const pedirDescontoAlto = async () => {
    await page.goto("/demo/vender");
    await page.getByLabel("Buscar produto").fill("iphone");
    await page.getByRole("button", { name: "Adicionar iPhone 15 128 GB" }).click();
    await page.getByRole("button", { name: /^IMEI/ }).first().click();
    await page.getByLabel("Desconto R$").fill("400,00");
    await expect(page.getByText("Precisa de aprovação do gerente ou dono")).toBeVisible();
  };
  await usarPerfil(page, "vendedor");
  await pedirDescontoAlto();
  await expect(page.getByText(/margem que sobra/)).toHaveCount(0);
  await expect(page.getByText(/Limite sem aprovação/)).toHaveCount(0);

  await usarPerfil(page, "gerente");
  await pedirDescontoAlto();
  await expect(page.getByText(/margem que sobra/)).toBeVisible();
});

test("REV-013: busca de cliente só pelo telefone completo", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vender");
  const campo = page.getByLabel("Telefone do cliente com DDD (busca exata)");
  await campo.fill("0001");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("Nenhum cliente com esse telefone exato.")).toBeVisible();
  await campo.fill("(41) 9 0000-0001");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("Mariana S. (fictícia)")).toBeVisible();
});
