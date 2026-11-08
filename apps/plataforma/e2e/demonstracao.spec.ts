import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

type Tela = readonly [string, string | RegExp];

const SAUDACAO = /(Bom dia|Boa tarde|Boa noite)/;

const TELAS: Record<string, readonly Tela[]> = {
  dono: [
    ["/demo", "Visão geral da rede"], ["/demo/vender", "Nova venda"], ["/demo/vendas", "Vendas de hoje"], ["/demo/estoque", "Estoque e rastreio por IMEI"],
    ["/demo/connect", "Ora Connect"], ["/demo/assistencia", "Assistência técnica (ordens de serviço)"], ["/demo/aprovacoes", "Aprovações"],
    ["/demo/metas", "Metas e desempenho da equipe"], ["/demo/financeiro", "Caixa, financeiro e notas"], ["/demo/relatorios", "Relatórios"],
    ["/demo/clientes", "Clientes e atendimento"], ["/demo/produtos", "Produtos e preços"], ["/demo/canais", "Canais online e campanhas"],
    ["/demo/lojas", "Lojas e usuários"], ["/demo/importacao", "Importar estoque da Rein (prévia)"], ["/demo/auditoria", "Auditoria"],
    ["/demo/perfil", "Escolha o perfil da demonstração"],
  ],
  gerente: [
    ["/demo", "Gestão da loja · Santa Cândida"], ["/demo/vender", "Nova venda"], ["/demo/vendas", "Vendas de hoje"], ["/demo/metas", "Metas e desempenho da equipe"],
    ["/demo/financeiro", "Caixa, financeiro e notas"], ["/demo/relatorios", "Relatórios"], ["/demo/aprovacoes", "Aprovações"], ["/demo/auditoria", "Auditoria"],
  ],
  vendedor: [
    ["/demo", new RegExp(`${SAUDACAO.source}, Ana!`)], ["/demo/vender", "Nova venda"], ["/demo/vendas", "Minhas vendas de hoje"], ["/demo/estoque", "Estoque e rastreio por IMEI"],
    ["/demo/metas", "Minhas metas"], ["/demo/connect", "Ora Connect"], ["/demo/clientes", "Clientes e atendimento"], ["/demo/produtos", "Produtos e preços"],
    ["/demo/assistencia", "Assistência técnica (ordens de serviço)"],
  ],
  administrador: [
    ["/demo", "Usuários, lojas e integrações"], ["/demo/lojas", "Lojas e usuários"], ["/demo/importacao", "Importar estoque da Rein (prévia)"], ["/demo/auditoria", "Auditoria"],
    ["/demo/relatorios", "Relatórios"], ["/demo/produtos", "Produtos e preços"], ["/demo/vendas", "Vendas de hoje"], ["/demo/estoque", "Estoque e rastreio por IMEI"], ["/demo/canais", "Canais online e campanhas"],
    ["/demo/connect", "Ora Connect"],
  ],
  tecnico: [["/demo", new RegExp(`${SAUDACAO.source}, Téo!`)], ["/demo/assistencia", "Assistência técnica (ordens de serviço)"]],
};

// Matriz do ADR-002: estes endereços mostram "Sem permissão" mesmo digitados à mão.
const PROIBIDAS: Record<string, readonly string[]> = {
  vendedor: ["/demo/aprovacoes", "/demo/financeiro", "/demo/relatorios", "/demo/lojas", "/demo/auditoria", "/demo/importacao"],
  gerente: ["/demo/lojas", "/demo/importacao", "/demo/canais"],
  administrador: ["/demo/vender", "/demo/aprovacoes", "/demo/financeiro", "/demo/metas", "/demo/clientes"],
  tecnico: ["/demo/vender", "/demo/vendas", "/demo/estoque", "/demo/metas", "/demo/connect"],
};

async function usarPerfil(page: Page, perfil: string) {
  await page.goto(`/demo/perfil/usar?p=${perfil}`);
  await expect(page).toHaveURL(/\/demo$/);
}

async function semRolagemLateral(page: Page, onde: string) {
  const { conteudo, tela } = await page.evaluate(() => ({ conteudo: document.documentElement.scrollWidth, tela: document.documentElement.clientWidth }));
  expect(conteudo, `rolagem lateral em ${onde}`).toBeLessThanOrEqual(tela);
}

const botaoExato = (page: Page, nome: string) => page.getByRole("button", { name: nome, exact: true });

async function adicionarProduto(page: Page, busca: string, nome: string) {
  await page.getByLabel("Buscar produto").fill(busca);
  await page.getByRole("button", { name: `Adicionar ${nome}` }).click();
}

async function concluirVenda(page: Page) {
  await botaoExato(page, "Conferir e concluir venda").click();
  const dialogo = page.getByRole("dialog", { name: "Conferir antes de concluir" });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole("button", { name: "Confirmar venda" }).click();
  await expect(page.getByRole("heading", { name: "Venda concluída na demonstração" })).toBeVisible();
}

for (const [perfil, telas] of Object.entries(TELAS)) {
  test(`perfil ${perfil}: as telas abrem, avisam que é demonstração, cabem na tela e respeitam a matriz`, async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (erro) => erros.push(erro.message));
    await usarPerfil(page, perfil);
    for (const [caminho, titulo] of telas) {
      const resposta = await page.goto(caminho);
      expect(resposta?.status(), caminho).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: titulo }), caminho).toBeVisible();
      await expect(page.getByRole("note", { name: "Aviso de demonstração" })).toContainText("dados fictícios · nada é gravado");
      await semRolagemLateral(page, caminho);
    }
    for (const caminho of PROIBIDAS[perfil] ?? []) {
      await page.goto(caminho);
      await expect(page.getByRole("heading", { name: "Sem permissão" }), caminho).toBeVisible();
    }
    expect(erros, "erros de JavaScript na página").toEqual([]);
  });
}

test("REV-015: desconto maior que o item mostra o erro, mantém o carrinho e a venda se recupera", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (erro) => erros.push(erro.message));
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vender");
  await adicionarProduto(page, "capa", "Capa de proteção");
  const desconto = page.getByLabel("Desconto R$");

  await desconto.fill("100,00");
  await expect(page.getByText("Desconto maior que o item")).toBeVisible();
  await expect(page.getByText("Corrija os itens destacados no carrinho")).toBeVisible();
  await expect(botaoExato(page, "Conferir e concluir venda")).toBeDisabled();

  // Formatos intermediários ou malformados enquanto a pessoa digita: erro no campo, nunca tela quebrada.
  for (const valor of ["1,", "abc", "-5", "10,999", "1.0.0", "R$"]) {
    await desconto.fill(valor);
    await expect(page.getByText("Desconto inválido: use só números, como 50,00"), valor).toBeVisible();
  }

  // Diminuir a quantidade também pode deixar o desconto maior que o item.
  await desconto.fill("");
  await page.getByRole("button", { name: "Aumentar quantidade de Capa de proteção" }).click();
  await desconto.fill("120,00");
  await expect(page.getByText("Desconto maior que o item")).toHaveCount(0);
  await page.getByRole("button", { name: "Diminuir quantidade de Capa de proteção" }).click();
  await expect(page.getByText("Desconto maior que o item")).toBeVisible();

  // Corrigindo, a venda segue normalmente até o fim.
  await desconto.fill("5,00");
  await expect(page.getByText("Desconto maior que o item")).toHaveCount(0);
  await expect(page.getByText("Desconto inválido")).toHaveCount(0);
  await botaoExato(page, "Pix na maquininha PicPay").click();
  await expect(botaoExato(page, "Conferir e concluir venda")).toBeEnabled();
  await concluirVenda(page);
  await expect(page.getByText("R$ 74,00").first()).toBeVisible();
  expect(erros).toEqual([]);
});

test("venda no celular: aparelho com IMEI, Pix na maquininha, confirmação e comprovante", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vender");
  await adicionarProduto(page, "galaxy", "Galaxy A55 256 GB");
  await page.getByRole("button", { name: /^IMEI/ }).first().click();
  await expect(page.getByText("reservado para esta venda")).toBeVisible();

  const concluir = botaoExato(page, "Conferir e concluir venda");
  await expect(concluir).toBeDisabled();
  await botaoExato(page, "Pix na maquininha PicPay").click();
  await expect(page.getByText("Pagamento confere com o total")).toBeVisible();
  await concluirVenda(page);
  await expect(page.getByText("R$ 2.199,00").first()).toBeVisible();
  await page.getByRole("button", { name: "Pedir por WhatsApp" }).click();
  await expect(page.getByText("Pedido de nota enviado")).toBeVisible();
  await page.getByRole("button", { name: "Nova venda" }).click();
  await expect(page.getByText("Busque um produto acima")).toBeVisible();
});

function completarImei(base14: string) {
  for (let d = 0; d <= 9; d++) {
    const texto = base14 + d;
    const soma = [...texto].reverse().reduce((s, c, i) => {
      let n = Number(c);
      if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
      return s + n;
    }, 0);
    if (soma % 10 === 0) return texto;
  }
  throw new Error("base inválida");
}

test("IMEI digitado à mão: dígito errado é recusado; IMEI que não está na loja também", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vender");
  await adicionarProduto(page, "galaxy", "Galaxy A55 256 GB");
  const campo = page.getByLabel("Ou digite o IMEI completo");
  const valido = completarImei("35209900179999");
  const errado = valido.slice(0, 14) + String((Number(valido.at(-1)) + 1) % 10);
  await campo.fill(errado);
  await botaoExato(page, "Usar").click();
  await expect(page.getByText(/IMEI inválido/)).toBeVisible();
  await campo.fill(valido);
  await botaoExato(page, "Usar").click();
  await expect(page.getByText(/não está disponível para venda em Santa Cândida/)).toBeVisible();
});

test("desconto acima do limite: pede aprovação, recebe a resposta (simulada) e conclui", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vender");
  await adicionarProduto(page, "iphone", "iPhone 15 128 GB");
  await page.getByRole("button", { name: /^IMEI/ }).first().click();
  await page.getByLabel("Desconto R$").fill("400,00");
  await expect(page.getByText("Precisa de aprovação do gerente ou dono")).toBeVisible();
  await botaoExato(page, "Pix na maquininha PicPay").click();
  await expect(botaoExato(page, "Conferir e concluir venda")).toBeDisabled();

  await page.getByRole("button", { name: "Pedir aprovação do desconto" }).click();
  const pedido = page.getByRole("dialog", { name: "Pedir aprovação do desconto" });
  await expect(pedido.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
  await pedido.getByLabel("Motivo (fica na auditoria)").fill("Cliente trouxe orçamento da concorrência");
  await pedido.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(page.getByText("Desconto enviado para aprovação")).toBeVisible();

  await botaoExato(page, "Aprovado").click();
  await expect(page.getByText("Desconto aprovado (simulação)")).toBeVisible();

  // Mudar o desconto depois da aprovação cancela o pedido.
  await page.getByLabel("Desconto R$").fill("450,00");
  await expect(page.getByText("O carrinho mudou depois do pedido anterior")).toBeVisible();
  await page.getByLabel("Desconto R$").fill("400,00");
  await expect(page.getByText("Desconto aprovado (simulação)")).toBeVisible();
  await page.getByLabel("Valor R$").fill("4.599,00");
  await concluirVenda(page);
  await expect(page.getByText("(aprovado)")).toBeVisible();
});

test("pagamento misto mostra troco e o que falta", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vender");
  await adicionarProduto(page, "capa", "Capa de proteção");
  await botaoExato(page, "Dinheiro").click();
  await page.getByLabel("Valor R$").fill("100,00");
  await expect(page.getByText("Troco: R$ 21,00")).toBeVisible();
  await page.getByLabel("Valor R$").fill("50,00");
  await expect(page.getByText("Falta receber R$ 29,00")).toBeVisible();
});

test("REV-019: acessório não passa do estoque da loja (limite exato e tentativa acima)", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vender");
  // Fixture: o Cabo USB-C 1 m tem 3 unidades na Santa Cândida. Zero e uma unidade: estoque.test.ts.
  await page.getByLabel("Buscar produto").fill("cabo usb");
  await expect(page.getByText("ACE-0004 · 3 em estoque")).toBeVisible();
  await page.getByRole("button", { name: "Adicionar Cabo USB-C 1 m" }).click();
  const aumentar = page.getByRole("button", { name: "Aumentar quantidade de Cabo USB-C 1 m" });
  const quantidade = page.locator('[aria-label="Quantidade de Cabo USB-C 1 m"]');
  await aumentar.click();
  await aumentar.click();
  await expect(quantidade).toHaveText("3");
  await expect(aumentar).toBeDisabled();
  await expect(page.getByText("3 em estoque nesta loja")).toBeVisible();

  // Adicionar de novo pela busca também não passa do limite: avisa e mantém 3.
  await adicionarProduto(page, "cabo usb", "Cabo USB-C 1 m");
  await expect(page.getByRole("status").filter({ hasText: "o carrinho já tem todo o estoque desta loja (3 unidades)" })).toBeVisible();
  await expect(quantidade).toHaveText("3");

  // No limite exato a venda segue normalmente.
  await botaoExato(page, "Dinheiro").click();
  await expect(botaoExato(page, "Conferir e concluir venda")).toBeEnabled();
  // O aviso some quando a pessoa começa uma nova busca.
  await page.getByLabel("Buscar produto").fill("capa");
  await expect(page.getByRole("status").filter({ hasText: "todo o estoque" })).toHaveCount(0);
});

test("atalhos do início do vendedor já montam a venda de chip e de recarga", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vender?item=chip");
  await expect(page.getByText("Chip Ora Connect", { exact: true })).toBeVisible();
  await expect(page.getByText("Ativação de linha Ora Connect", { exact: true })).toBeVisible();
  await page.goto("/demo/vender?item=recarga");
  await expect(page.getByText("Recarga Ora Connect", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveValue("3000");
});

// Varredura do #16: parâmetro repetido chega à página como lista; o .trim() da busca derrubava
// estas telas ("Algo deu errado nesta tela", com HTTP 200 porque a página já estava sendo enviada).
test("parâmetros repetidos ou com nome herdado no endereço não derrubam as telas com filtro", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (erro) => erros.push(erro.message));
  await usarPerfil(page, "dono");
  for (const [caminho, titulo] of [
    ["/demo/produtos?busca=capa&busca=cabo&categoria=a&categoria=b", "Produtos e preços"],
    ["/demo/clientes?busca=a&busca=b", "Clientes e atendimento"],
    ["/demo/vendas?busca=a&busca=b&situacao=constructor&vendedor=a&vendedor=b", "Vendas de hoje"],
    ["/demo/estoque?busca=a&busca=b&aba=__proto__&situacao=a&situacao=b", "Estoque e rastreio por IMEI"],
    ["/demo/relatorios?periodo=toString", "Relatórios"],
    ["/demo/auditoria?tipo=valueOf", "Auditoria"],
    ["/demo/connect?aba=a&aba=b&filtro=__proto__", "Ora Connect"],
  ] as const) {
    const resposta = await page.goto(caminho);
    expect(resposta?.status(), caminho).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: titulo }), caminho).toBeVisible();
    await expect(page.getByText("Algo deu errado nesta tela"), caminho).toHaveCount(0);
  }
  expect(erros, "erros de JavaScript na página").toEqual([]);
});

test("REV-010: cookie de perfil adulterado não derruba a demonstração", async ({ page, context, baseURL }) => {
  for (const valor of ["constructor", "__proto__", "toString", "inexistente"]) {
    await context.clearCookies();
    await context.addCookies([{ name: "ora_demo_perfil", value: valor, url: baseURL }]);
    const resposta = await page.goto("/demo");
    expect(resposta?.status(), valor).toBe(200);
    await expect(page.getByRole("heading", { name: "Visão geral da rede" })).toBeVisible();
  }
});

test("REV-013: vendedor não vê margem; gerente vê", async ({ page }) => {
  const pedirDescontoAlto = async () => {
    await page.goto("/demo/vender");
    await adicionarProduto(page, "iphone", "iPhone 15 128 GB");
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

test("REV-013: busca de cliente só exata (telefone completo ou CPF) e cadastro na hora", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vender");
  const campo = page.getByLabel("Telefone com DDD ou CPF do cliente (busca exata)");
  await campo.fill("0001");
  await botaoExato(page, "Buscar").click();
  await expect(page.getByText("A busca nunca é parcial.")).toBeVisible();
  await campo.fill("(41) 9 0000-0001");
  await botaoExato(page, "Buscar").click();
  await expect(page.getByText("Mariana S. (fictícia)")).toBeVisible();
  await botaoExato(page, "Trocar").click();
  await campo.fill("000.000.002-72");
  await botaoExato(page, "Buscar").click();
  await expect(page.getByText("Carlos L. (fictício)")).toBeVisible();
  await botaoExato(page, "Trocar").click();
  await campo.fill("(41) 9 1234-5678");
  await botaoExato(page, "Buscar").click();
  await expect(page.getByText("Nenhum cliente com esse telefone ou CPF.")).toBeVisible();
  await page.getByRole("button", { name: "Cadastrar agora" }).click();
  const dialogo = page.getByRole("dialog", { name: "Cadastrar cliente" });
  await dialogo.getByLabel("Nome completo").fill("Cliente Novo Fictício");
  await dialogo.getByRole("button", { name: "Usar este cliente" }).click();
  await expect(page.getByText("Cadastro novo (não gravado)")).toBeVisible();
});

async function contagemDeTodas(page: Page) {
  const texto = await page.getByRole("navigation", { name: "Situação da venda" }).getByRole("link", { name: /^Todas/ }).innerText();
  return Number(texto.replace(/\D/g, ""));
}

test("vendedor vê só as próprias vendas e metas; gerente vê todos os vendedores", async ({ page }) => {
  await usarPerfil(page, "vendedor");
  await page.goto("/demo/vendas");
  const minhas = await contagemDeTodas(page);
  expect(minhas).toBeGreaterThan(0);
  await expect(page.getByLabel("Vendedor", { exact: true })).toHaveCount(0);
  await page.goto("/demo/metas");
  await expect(page.getByRole("heading", { level: 1, name: "Minhas metas" })).toBeVisible();
  await expect(page.getByText("Lucas Pereira")).toHaveCount(0);

  await usarPerfil(page, "gerente");
  await page.goto("/demo/vendas?vendedor=ana");
  expect(await contagemDeTodas(page)).toBe(minhas);
  await page.goto("/demo/vendas");
  expect(await contagemDeTodas(page)).toBeGreaterThan(minhas);
  await page.goto("/demo/metas");
  await expect(page.getByText("Lucas Pereira").first()).toBeVisible();
});

test("vendedor com duas lojas troca a loja da sessão; loja sem vínculo é ignorada", async ({ page, context, request, baseURL }) => {
  await usarPerfil(page, "vendedor");
  await page.getByRole("button", { name: /^Loja da sessão: Santa Cândida/ }).click();
  await page.getByRole("link", { name: /^Loja 03/ }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("button", { name: /^Loja da sessão: Loja 03/ })).toBeVisible();
  await page.goto("/demo/vender");
  await expect(page.getByText("Loja da sessão · Loja 03")).toBeVisible();

  // Loja sem vínculo (cookie forjado ou endereço digitado): volta para a loja padrão.
  await context.addCookies([{ name: "ora_demo_loja", value: "loja-07", url: baseURL }]);
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: /^Loja da sessão: Santa Cândida/ })).toBeVisible();

  // O retorno da troca de loja não aceita endereço de fora (sem redirecionamento aberto).
  for (const voltar of ["https://exemplo.invalid", "//exemplo.invalid", "/demo/../entrar"]) {
    const resposta = await request.get(`/demo/loja/usar?l=loja-03&voltar=${encodeURIComponent(voltar)}`, { maxRedirects: 0 });
    expect(resposta.status(), voltar).toBe(303);
    expect(resposta.headers()["location"], voltar).toBe("/demo");
  }
});

test("menu Mais do celular fecha ao trocar de tela", async ({ page }) => {
  test.skip(test.info().project.name !== "celular-360", "a barra inferior só existe no celular");
  await usarPerfil(page, "vendedor");
  await botaoExato(page, "Mais").click();
  const lista = page.getByRole("dialog", { name: "Todas as telas" });
  await expect(lista).toBeVisible();
  await lista.getByRole("link", { name: "Vendas", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/vendas$/);
  await expect(lista).toBeHidden();
});

test("aprovações: negar exige justificativa e aprovar fica registrado", async ({ page }) => {
  await usarPerfil(page, "gerente");
  await page.goto("/demo/aprovacoes");
  await page.getByRole("button", { name: /^Negar PV-/ }).first().click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("button", { name: "Confirmar negativa" })).toBeDisabled();
  await dialogo.getByLabel(/Justificativa/).fill("Margem baixa demais para este meio");
  await dialogo.getByRole("button", { name: "Confirmar negativa" }).click();
  await expect(page.getByText("Negado: Margem baixa demais para este meio")).toBeVisible();
  await page.getByRole("button", { name: /^Aprovar PV-/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar aprovação" }).click();
  await expect(page.getByText(/Registrado na auditoria/)).toHaveCount(2);
});

test("dono olhando a rede escolhe a loja antes de vender", async ({ page }) => {
  await usarPerfil(page, "dono");
  await page.goto("/demo/vender");
  await expect(page.getByRole("heading", { name: "Escolha a loja" })).toBeVisible();
  await page.getByRole("link", { name: "Santa Cândida (piloto)" }).click();
  await expect(page).toHaveURL(/\/demo\/vender$/);
  await expect(page.getByText("Loja da sessão · Santa Cândida")).toBeVisible();
});

test("técnico registra o orçamento da OS", async ({ page }) => {
  await usarPerfil(page, "tecnico");
  await page.goto("/demo/assistencia");
  await page.getByRole("button", { name: "Registrar orçamento" }).first().click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Valor do conserto (R$)").fill("415,00");
  await dialogo.getByRole("button", { name: "Registrar orçamento" }).click();
  await expect(page.getByText("orçamento R$ 415,00")).toBeVisible();
});

test("relatórios exportam CSV que abre no Excel em português", async ({ page }) => {
  test.skip(test.info().project.name !== "computador", "basta uma vez");
  await usarPerfil(page, "dono");
  await page.goto("/demo/relatorios");
  const baixando = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const arquivo = await baixando;
  expect(arquivo.suggestedFilename()).toBe("ora5g-demonstracao-relatorio-14-dias.csv");
  const texto = readFileSync(await arquivo.path(), "utf8");
  expect(texto.startsWith("﻿Dia;Faturamento (R$);Vendas")).toBe(true);
  expect(texto.trim().split("\r\n")).toHaveLength(15);
});
