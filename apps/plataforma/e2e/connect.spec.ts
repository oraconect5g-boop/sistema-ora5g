import { expect, test, type Page } from "@playwright/test";

// Ora Connect: funções da API NOGLE (Contel) na demonstração. Tudo simulado no formato da documentação oficial.

async function usarPerfil(page: Page, perfil: string) {
  await page.goto(`/demo/perfil/usar?p=${perfil}`);
  await expect(page).toHaveURL(/\/demo$/);
}

const abas = (page: Page) => page.getByRole("navigation", { name: "Funções da Ora Connect" });

/** Completa o dígito verificador (Luhn) de um ICCID fictício, como os dados da demonstração. */
function iccid(base18: string) {
  for (let d = 0; d <= 9; d++) {
    const texto = base18 + d;
    const soma = [...texto].reverse().reduce((s, c, i) => {
      let n = Number(c);
      if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
      return s + n;
    }, 0);
    if (soma % 10 === 0) return texto;
  }
  throw new Error("base inválida");
}

test("cada perfil vê as funções certas da Ora Connect", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/connect");
  for (const nome of ["Operações do dia", "Ativar chip", "Consultar linha", "Recarga", "Portabilidade", "Bloqueio e atendimento", "Chips e entrega"]) {
    await expect(abas(page).getByRole("link", { name: nome, exact: true }), nome).toBeVisible();
  }
  await expect(abas(page).getByRole("link", { name: "Carteira e relatórios" })).toHaveCount(0);
  await expect(abas(page).getByRole("link", { name: "Integração Nogle" })).toHaveCount(0);
  await page.goto("/demo/connect?aba=carteira");
  await expect(abas(page).getByRole("link", { name: "Operações do dia" })).toHaveAttribute("aria-current", "true");

  await usarPerfil(page, "administrador");
  await page.goto("/demo/connect");
  await expect(abas(page).getByRole("link")).toHaveCount(2);

  await usarPerfil(page, "dono");
  await page.goto("/demo/connect");
  await expect(abas(page).getByRole("link")).toHaveCount(9);
});

test("ativação: só chip virgem segue, em processamento não se reenvia e a linha só conta depois da confirmação", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/connect?aba=ativar");
  const campo = page.getByLabel("ICCID do chip");

  await campo.fill("8955");
  await page.getByRole("button", { name: "Validar" }).click();
  await expect(page.getByText("ICCID inválido (código 99)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();

  await campo.fill(iccid("895510000000003901"));
  await page.getByRole("button", { name: "Validar" }).click();
  await expect(page.getByText("Ativação em processamento (código 33)", { exact: true })).toBeVisible();
  await expect(page.getByText("Não reenvie a ativação.")).toBeVisible();

  await page.getByRole("button", { name: /^•••• \d{4}$/ }).first().click();
  await page.getByRole("button", { name: "Validar" }).click();
  await expect(page.getByText("Chip virgem (código 88)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("CPF do titular").fill("000.000.001-91");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("Mariana S. (fictícia)")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("button", { name: "Conferir e ativar" }).click();
  await page.getByRole("dialog", { name: "Conferir antes de ativar" }).getByRole("button", { name: "Solicitar ativação" }).click();
  await expect(page.getByText(/A ativação só conta na produção depois que a operadora confirmar/)).toBeVisible();
  await page.getByRole("button", { name: "Consultar ativação" }).click();
  await expect(page.getByText("Linha ativa (confirmada pela operadora · simulação)")).toBeVisible();
});

test("ativação com cliente novo exige os dados que a Contel pede", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/connect?aba=ativar");
  await page.getByRole("radio", { name: "eSIM (chip virtual)" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("CPF do titular").fill("000.000.004-34");
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("button", { name: "Usar este cadastro" }).click();
  await expect(page.getByText("Informe o nome completo, como no documento.")).toBeVisible();
  await page.getByLabel("Nome completo").fill("Cliente Novo Fictício");
  await page.getByLabel("Data de nascimento").fill("1990-05-20");
  await page.getByLabel("CEP").fill("82000-000");
  await page.getByLabel("Número", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Usar este cadastro" }).click();
  await expect(page.getByText("Cadastro novo (não gravado)")).toBeVisible();
});

test("consultar linha: saldo, consumo e titularidade", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/connect?aba=linha");
  await page.getByRole("button", { name: "(41) 9 0000-0101" }).click();
  await expect(page.getByText("Pessoal · Mariana S. (fictícia)")).toBeVisible();
  await expect(page.getByText("Ilimitados")).toBeVisible();
  await expect(page.getByText(/Consumo de internet · últimos 30 dias/)).toBeVisible();

  const cpf = page.getByLabel("CPF do cliente");
  await cpf.fill("000.000.002-72");
  await page.getByRole("button", { name: "Conferir" }).click();
  await expect(page.getByText("Não é o titular da linha")).toBeVisible();
  await cpf.fill("000.000.001-91");
  await page.getByRole("button", { name: "Conferir" }).click();
  await expect(page.getByText("É o titular da linha")).toBeVisible();

  await page.getByLabel("Número da linha ou ICCID").fill("(41) 9 1111-2222");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByText("Linha não encontrada")).toBeVisible();
});

test("recarga pelo saldo e pelo link, conferindo antes de pedir de novo", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/connect?aba=recarga");
  await page.getByLabel("Número da linha").fill("(41) 9 0000-0101");
  await page.getByRole("button", { name: "Solicitar recarga" }).click();
  await page.getByRole("dialog", { name: "Conferir a recarga" }).getByRole("button", { name: "Solicitar recarga" }).click();
  await expect(page.getByText(/feita pelo saldo \(simulação\)/)).toBeVisible();

  await page.getByRole("button", { name: "Nova recarga" }).click();
  await page.getByLabel("Número da linha").fill("(41) 9 0000-0202");
  await page.getByRole("radio", { name: "Link de pagamento" }).check();
  await page.getByRole("button", { name: "Solicitar recarga" }).click();
  await page.getByRole("dialog", { name: "Conferir a recarga" }).getByRole("button", { name: "Solicitar recarga" }).click();
  await expect(page.getByText(/aguardando pagamento do link/)).toBeVisible();
  await page.getByRole("button", { name: "Conferir na operadora" }).click();
  await expect(page.getByText(/Ainda não paga/)).toBeVisible();
});

test("portabilidade: pedido e acompanhamento do status", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/connect?aba=portabilidade");
  await page.getByLabel("Linha Ora Connect (nova)").fill("(41) 9 0000-0909");
  await page.getByLabel("Número que vai ser trazido").fill("(41) 9 8888-7777");
  await page.getByLabel("Operadora atual").selectOption({ label: "VIVO" });
  await page.getByRole("button", { name: "Solicitar portabilidade" }).click();
  await expect(page.getByText(/Portabilidade pedida: \(41\) 9 8888-7777 \(VIVO\)/)).toBeVisible();
  await page.getByRole("button", { name: "Consultar status de (41) 9 8888-7777" }).click();
  await expect(page.getByText("Status atualizado (simulação): Portabilidade em andamento.")).toBeVisible();
});

test("bloqueio de linha só para gerente e dono, com confirmação", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/connect?aba=atendimento");
  await expect(page.getByText("Só gerente ou dono bloqueiam e desbloqueiam")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bloquear linha", exact: true })).toBeDisabled();

  await usarPerfil(page, "gerente");
  await page.goto("/demo/connect?aba=atendimento");
  await page.getByLabel("Número da linha").fill("(41) 9 0000-0101");
  await page.getByLabel("Motivo do bloqueio").selectOption("ROUBO");
  await page.getByRole("button", { name: "Bloquear linha", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar bloqueio" }).click();
  await expect(page.getByText(/Bloqueada às \d{2}:\d{2} \(simulação\)/)).toBeVisible();
});

test("chips: gerente leva chip do estoque central para a loja; vendedor só consulta", async ({ page }) => {
  await usarPerfil(page, "gerente");
  await page.goto("/demo/connect?aba=chips");
  const select = page.getByLabel("ICCID do chip");
  const primeiro = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(primeiro ?? "");
  await page.getByRole("button", { name: /^Transferir para/ }).click();
  await expect(page.getByText("1 chip transferido para Santa Cândida.")).toBeVisible();

  await usarPerfil(page, "vendedor");
  await page.goto("/demo/connect?aba=chips");
  await expect(page.getByText(/é feita pelo gerente ou pelo dono/)).toBeVisible();
});

test("a aba Integração mostra as 62 funções da documentação oficial e o que falta", async ({ page }) => {
  await usarPerfil(page, "dono");
  await page.goto("/demo/connect?aba=integracao");
  await expect(page.getByText("Funções na documentação")).toBeVisible();
  await expect(page.getByText("62", { exact: true })).toBeVisible();
  for (const rota of ["/ativacao/solicitar", "/recarga/solicitar", "/portabilidade/solicitar", "/atendimento/bloqueio", "/pdv/transferir-chip-esim"]) {
    await expect(page.getByText(rota, { exact: true }).first(), rota).toBeVisible();
  }
  await expect(page.getByText("Tipo da chave da Ora (decisão P9).")).toBeVisible();
});

// Regressões da auditoria do Codex de 08/11 (docs/analises/evidencias/2026-11-08/telas.repro.ts).
test("REV-024: eSIM não passa do estoque virgem e sai dele ao ser transferido", async ({ page }) => {
  await usarPerfil(page, "gerente");
  await page.goto("/demo/connect?aba=chips");
  await page.getByRole("button", { name: "eSIM", exact: true }).click();
  await expect(page.getByText("Estoque virgem: 6 físicos · 4 eSIM.")).toBeVisible();
  await expect(page.getByText("15", { exact: true })).toBeVisible();
  await page.getByLabel("Quantidade de eSIM").fill("5");
  await page.getByRole("button", { name: /^Transferir para/ }).click();
  await expect(page.getByText("Só há 4 eSIM no estoque virgem da Ora. Nada foi transferido.")).toBeVisible();
  await expect(page.getByText("5 eSIM transferidos para Santa Cândida.")).toHaveCount(0);
  await expect(page.getByText("15", { exact: true })).toBeVisible();

  await page.getByLabel("Quantidade de eSIM").fill("4");
  await page.getByRole("button", { name: /^Transferir para/ }).click();
  await expect(page.getByText("4 eSIM transferidos para Santa Cândida.")).toBeVisible();
  await expect(page.getByText("19", { exact: true })).toBeVisible();
  await expect(page.getByText("Estoque virgem: 6 físicos · 0 eSIM.")).toBeVisible();
  await page.getByLabel("Quantidade de eSIM").fill("1");
  await page.getByRole("button", { name: /^Transferir para/ }).click();
  await expect(page.getByText("Não há eSIM no estoque virgem da Ora.")).toBeVisible();
  await expect(page.getByText("19", { exact: true })).toBeVisible();
});

test("REV-025: recarga paga pelo LINK continua LINK e não mexe no caixa nem no saldo da Ora", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/connect?aba=recarga");
  const saldo = page.getByRole("heading", { name: "Saldo da Ora na Contel" }).locator("xpath=ancestor::section[1]").locator("p.numeros");
  const saldoAntes = await saldo.textContent();
  await page.getByLabel("Número da linha", { exact: true }).fill("(41) 9 0000-0101");
  await page.getByLabel("Link de pagamento", { exact: true }).check();
  await page.getByRole("button", { name: "Solicitar recarga", exact: true }).click();
  await page.getByRole("dialog", { name: "Conferir a recarga" }).getByRole("button", { name: "Solicitar recarga" }).click();
  await expect(page.getByText(/aguardando pagamento do link/)).toBeVisible();
  await page.getByRole("button", { name: "Cliente pagou (simulação)" }).click();
  await expect(page.getByText(/paga pelo link \(simulação\)/)).toBeVisible();
  await expect(page.getByText(/feita pelo saldo/)).toHaveCount(0);
  await expect(page.getByText(/O cliente pagou.*na loja/)).toHaveCount(0);
  expect(await saldo.textContent()).toBe(saldoAntes);
});
