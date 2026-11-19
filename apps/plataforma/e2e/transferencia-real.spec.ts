// Lotes J1-c e J1-d (19/11/2026; ORA-INV-007 e ORA-QUAL-010; o ponto T4 dos pontos em aberto, "a jornada com pessoas
// diferentes"; os sins do proprietário de 19/11 aos testes da transferência e à conta Gerente 2 (teste)): a transferência de
// verdade entre as duas lojas de teste, com duas pessoas, cada uma num celular de 360 px, no site no ar.
//
// J1-c, a capa (acessório, pela quantidade). Ida: o Gerente (teste) pede na Santa Cândida (teste) uma capa de proteção da Loja
// de teste 2; o Gerente 2 (teste) separa e envia de lá; o Gerente (teste) recebe e confere. Volta: o contrário. A cada passo,
// o disponível das duas lojas é conferido; no fim, é o de antes.
// J1-d, o aparelho (pelo IMEI). O mesmo caminho com um Moto G24: na ida, a origem escolhe o aparelho pelo IMEI ao separar e o
// destino recebe lendo esse número; na volta, a outra loja separa o MESMO aparelho. A busca pelo IMEI no Estoque confere onde
// ele está a cada perna; no fim, está na loja onde começou, disponível e no estoque.
//
// GRAVA de verdade, só nas duas lojas de teste: duas transferências recebidas por caso, com o estoque igual ao do começo. Se o
// teste parar no meio (num pico do banco, por exemplo), o fim dele arruma: cancela a ida que ainda não saiu da origem ou
// termina a volta, para o produto não ficar na outra loja. O que ainda sobrar de uma vez anterior é recebido (o acessório em
// trânsito) ou cancelado (o que está na origem) no começo; o aparelho em trânsito precisa do IMEI lido na mão, e o teste para
// dizendo qual transferência é.
// Só roda no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Browser, type Page } from "@playwright/test";

import { arquivoDasContas, contaDeTeste, entrar, noAr, type Conta } from "./contas-de-teste";

type Produto = { sku: string; nome: string };
const CAPA: Produto = { sku: "ACE-0001", nome: "Capa de proteção" };
const MOTO: Produto = { sku: "APA-0002", nome: "Moto G24 128 GB Grafite" };
const LOJA_A = "Santa Cândida (teste)";
const LOJA_B = "Loja de teste 2";
const MARCA = "teste automático da transferência";
const LEITURA = "IMEI/ICCID lidos nos itens que chegaram (um por linha)";

/** A lista das transferências chega em partes (primeiro o esqueleto): espera o texto que só a tela pronta tem. */
async function abrirTransferencias(pagina: Page) {
  await pagina.goto("/transferencias");
  await expect(pagina.getByText("Para pedir, abra o produto no estoque")).toBeVisible();
}

const ondeTem = (pagina: Page, produto: Produto) =>
  pagina.locator("section").filter({ has: pagina.getByRole("heading", { name: `Onde tem: ${produto.nome}` }) });
/** A linha de uma loja no "Onde tem", pelo nome exato (a linha da própria loja tem "Mandar para" com o nome das outras). */
const linhaDaLoja = (pagina: Page, produto: Produto, loja: string) => {
  const nome = new RegExp(`^${loja.replace(/[()]/g, "\\$&")}( \\(esta loja\\))?$`);
  return ondeTem(pagina, produto).getByRole("listitem").filter({ has: pagina.locator("span.font-medium").filter({ hasText: nome }) });
};
const cartao = (pagina: Page, motivo: string) => pagina.locator("section").filter({ hasText: `Motivo: ${motivo}` });

/** Abre o "Onde tem" do produto: o Estoque com a busca pelo SKU e o "na rede" da linha. */
async function abrirNaRede(pagina: Page, produto: Produto) {
  await pagina.goto(`/estoque?q=${produto.sku}`);
  await pagina.getByRole("listitem").filter({ hasText: produto.sku }).getByRole("link", { name: "na rede" }).first().click();
  await expect(ondeTem(pagina, produto)).toBeVisible();
}

/** O disponível do produto nas duas lojas de teste, pelo "Onde tem". */
async function disponiveis(pagina: Page, produto: Produto): Promise<{ a: number; b: number }> {
  await abrirNaRede(pagina, produto);
  const de = async (loja: string) => {
    const linha = linhaDaLoja(pagina, produto, loja);
    await expect(linha).toHaveCount(1);
    const numero = /(\d+)\s*disponível/.exec(await linha.innerText());
    if (!numero) throw new Error(`o "Onde tem" não mostrou o disponível da ${loja}`);
    return Number(numero[1]);
  };
  return { a: await de(LOJA_A), b: await de(LOJA_B) };
}

/** Pede uma unidade do produto da outra loja, pelo "Onde tem"; volta à lista das transferências. */
async function pedir(pagina: Page, produto: Produto, origem: string, motivo: string) {
  await abrirNaRede(pagina, produto);
  const linha = linhaDaLoja(pagina, produto, origem);
  await expect(linha).toHaveCount(1);
  await linha.getByLabel("Quantidade").fill("1");
  await linha.getByLabel("Motivo").fill(motivo);
  await linha.getByRole("button", { name: "Pedir desta loja" }).click();
  await expect(pagina).toHaveURL(/\/transferencias\?ok=pedida/);
  await expect(cartao(pagina, motivo)).toContainText("Pedida");
}

/**
 * Na origem: separa e envia o pedido. No aparelho, marca o IMEI pedido (ou, sem ele, o primeiro livre, lendo o número) e
 * devolve o IMEI que saiu; no acessório, devolve nulo. Se o pedido já estava separado (uma vez que parou no meio), só envia.
 */
async function separarEEnviar(pagina: Page, motivo: string, imei: string | null = null): Promise<string | null> {
  await abrirTransferencias(pagina);
  const c = cartao(pagina, motivo);
  let saiu: string | null = imei;
  const separar = c.getByRole("button", { name: "Separar" });
  if (await separar.count()) {
    // Cada aparelho livre aparece como um rótulo "IMEI <número>" com a caixa de marcar dentro.
    const rotulos = c.locator("label").filter({ has: pagina.getByRole("checkbox") });
    if (await rotulos.count()) {
      const rotulo = imei ? rotulos.filter({ hasText: `IMEI ${imei}` }) : rotulos.first();
      await expect(rotulo).toHaveCount(1);
      const numero = /IMEI (\d+)/.exec(await rotulo.innerText());
      if (!numero) throw new Error("a separação não mostrou o IMEI do aparelho");
      saiu = numero[1] as string;
      await rotulo.getByRole("checkbox").check();
    }
    await separar.click();
    await expect(pagina).toHaveURL(/\/transferencias\?ok=separada/);
    if (saiu) await expect(cartao(pagina, motivo)).toContainText("1 IMEI/ICCID separado(s)");
  }
  await cartao(pagina, motivo).getByRole("button", { name: "Enviar (sai do estoque desta loja)" }).click();
  await expect(pagina).toHaveURL(/\/transferencias\?ok=enviada/);
  await expect(cartao(pagina, motivo)).toContainText("Em trânsito");
  return saiu;
}

/** Cancela um pedido deste teste que ainda está na origem (pedido ou separado). */
async function cancelar(pagina: Page, motivo: string) {
  await abrirTransferencias(pagina);
  const c = cartao(pagina, motivo);
  await c.locator("summary").click();
  await c.getByLabel("Motivo").fill(`${MARCA}: parou no meio, cancelado pelo próprio teste`);
  await c.getByRole("button", { name: "Confirmar" }).click();
  await expect(pagina).toHaveURL(/ok=cancelada/);
}

/** No destino: recebe e confere. O acessório pela quantidade contada; o aparelho, lendo o IMEI que chegou. */
async function receber(pagina: Page, motivo: string, imei: string | null = null) {
  await abrirTransferencias(pagina);
  const c = cartao(pagina, motivo);
  if (imei) await c.getByLabel(LEITURA).fill(imei);
  else await expect(c.getByLabel("Quantidade contada")).toHaveValue("1");
  await c.getByRole("button", { name: "Receber e conferir" }).click();
  await expect(pagina).toHaveURL(/\/transferencias\?ok=recebida/);
  await expect(cartao(pagina, motivo).getByText("Recebida", { exact: true })).toBeVisible();
}

/** Pela busca do IMEI no Estoque: o aparelho está na loja, disponível e no estoque. */
async function aparelhoEsta(pagina: Page, imei: string, loja: string) {
  await pagina.goto(`/estoque?q=${imei}`);
  const c = pagina.locator("section").filter({ hasText: `IMEI ${imei}` });
  await expect(c).toContainText(`${MOTO.sku} · ${loja}`);
  await expect(c.getByText("Disponível", { exact: true })).toBeVisible();
  await expect(c.getByText("no estoque", { exact: true })).toBeVisible();
}

/**
 * Fecha o que uma vez anterior deste teste deixou pelo caminho: recebe o acessório em trânsito e cancela o que está na origem.
 * O aparelho em trânsito só se recebe lendo o IMEI: o teste para dizendo qual transferência é.
 */
async function fecharPendentes(pagina: Page) {
  for (let volta = 0; volta < 10; volta++) {
    await abrirTransferencias(pagina);
    const doTeste = pagina.locator("section").filter({ hasText: `Motivo: ${MARCA}` });
    const aReceber = doTeste.filter({ has: pagina.getByRole("button", { name: "Receber e conferir" }) }).first();
    if (await aReceber.isVisible()) {
      if (await aReceber.getByLabel(LEITURA).count()) {
        const titulo = await aReceber.getByRole("heading", { level: 2 }).innerText();
        throw new Error(`um aparelho de uma vez anterior ficou em trânsito (${titulo}): receba pela tela Transferências, lendo o IMEI`);
      }
      await aReceber.getByRole("button", { name: "Receber e conferir" }).click();
      await expect(pagina).toHaveURL(/ok=recebida/);
      continue;
    }
    const aCancelar = doTeste.filter({ has: pagina.locator("summary") }).first();
    if (await aCancelar.isVisible()) {
      await aCancelar.locator("summary").click();
      await aCancelar.getByLabel("Motivo").fill(`${MARCA}: a vez anterior ficou pelo caminho`);
      await aCancelar.getByRole("button", { name: "Confirmar" }).click();
      await expect(pagina).toHaveURL(/ok=cancelada/);
      continue;
    }
    return;
  }
  throw new Error("transferências deste teste demais pelo caminho");
}

type Etapa = "ida_pedida" | "ida_enviada" | "ida_recebida" | "volta_pedida" | "volta_enviada" | "fim";

/**
 * Ida e volta de uma unidade do produto, com as duas pessoas: na ida, o Gerente (teste) pede da Loja de teste 2, o Gerente 2
 * (teste) separa e envia, e o Gerente (teste) recebe; na volta, o contrário. Se parar no meio, o fim arruma: cancela a ida que
 * não saiu da origem, ou termina a volta, para o produto não ficar na outra loja. No aparelho, a volta leva o MESMO IMEI.
 */
async function idaEVolta(page: Page, pageB: Page, produto: Produto, rotulo: string, gerenteA: Conta, gerenteB: Conta) {
  const quando = new Date().toISOString().slice(0, 19);
  const ida = `${MARCA}, ${rotulo}ida, ${quando}`;
  const volta = `${MARCA}, ${rotulo}volta, ${quando}`;
  let etapa: Etapa | null = null;
  let imei: string | null = null;
  const confereOndeEsta = async (pagina: Page, loja: string) => { if (imei) await aparelhoEsta(pagina, imei, loja); };
  try {
    let antes = { a: 0, b: 0 };
    await test.step(`as duas lojas têm o produto (${produto.nome})`, async () => {
      antes = await disponiveis(page, produto);
      expect(antes.b, `a ${LOJA_B} precisa de pelo menos uma unidade livre de ${produto.nome}`).toBeGreaterThanOrEqual(1);
    });
    await test.step(`ida: o ${gerenteA.nome} pede da ${LOJA_B} (sai do disponível de lá na hora)`, async () => {
      await pedir(page, produto, LOJA_B, ida);
      etapa = "ida_pedida";
      expect(await disponiveis(page, produto)).toEqual({ a: antes.a, b: antes.b - 1 });
    });
    await test.step(`ida: o ${gerenteB.nome} separa e envia`, async () => {
      imei = await separarEEnviar(pageB, ida);
      etapa = "ida_enviada";
    });
    await test.step(`ida: o ${gerenteA.nome} recebe e confere (entra no destino)`, async () => {
      await receber(page, ida, imei);
      etapa = "ida_recebida";
      await confereOndeEsta(page, LOJA_A);
      expect(await disponiveis(page, produto)).toEqual({ a: antes.a + 1, b: antes.b - 1 });
    });
    await test.step(`volta: o ${gerenteB.nome} pede da ${LOJA_A}`, async () => {
      await pedir(pageB, produto, LOJA_A, volta);
      etapa = "volta_pedida";
    });
    await test.step(`volta: o ${gerenteA.nome} separa${imei ? " o MESMO aparelho" : ""} e envia`, async () => {
      expect(await separarEEnviar(page, volta, imei)).toBe(imei);
      etapa = "volta_enviada";
    });
    await test.step(`volta: o ${gerenteB.nome} recebe e confere; o estoque das duas lojas é o de antes`, async () => {
      await receber(pageB, volta, imei);
      etapa = "fim";
      await confereOndeEsta(pageB, LOJA_B);
      expect(await disponiveis(page, produto)).toEqual(antes);
    });
  } finally {
    const parou = etapa as Etapa | null;
    if (parou && parou !== "fim") {
      // Parou no meio: arruma, sem esconder a falha (o erro do passo segue para o relatório).
      await (async () => {
        if (parou === "ida_pedida") return cancelar(page, ida);
        if (parou === "ida_enviada") await receber(page, ida, imei);
        if (parou === "ida_enviada" || parou === "ida_recebida") await pedir(pageB, produto, LOJA_A, volta);
        if (parou !== "volta_enviada") await separarEEnviar(page, volta, imei);
        await receber(pageB, volta, imei);
      })().catch((falha: unknown) => console.warn(`o teste parou em ${parou} e não conseguiu arrumar: ${String(falha)}`));
    }
  }
}

/** As duas pessoas, cada uma no seu celular (o segundo com as mesmas opções do projeto), já nas suas lojas e sem pendências. */
async function duasPessoas(page: Page, browser: Browser) {
  const gerenteA: Conta = contaDeTeste("Gerente (teste)");
  const gerenteB: Conta = contaDeTeste("Gerente 2 (teste)");
  const contextoB = await browser.newContext({ ...test.info().project.use });
  const pageB = await contextoB.newPage();
  const sair = async () => {
    await page.goto("/sair");
    await pageB.goto("/sair");
    await contextoB.close();
  };
  try {
    await test.step("as duas pessoas entram, cada uma na sua loja", async () => {
      await entrar(page, gerenteA);
      await expect(page.getByText(LOJA_A).first()).toBeVisible();
      await entrar(pageB, gerenteB);
      await expect(pageB.getByText(LOJA_B).first()).toBeVisible();
    });
    await test.step("fecha o que uma vez anterior deixou pelo caminho", async () => {
      await fecharPendentes(pageB);
      await fecharPendentes(page);
      await fecharPendentes(pageB);
    });
  } catch (erro) {
    await sair();
    throw erro;
  }
  return { gerenteA, gerenteB, pageB, sair };
}

test.describe("a transferência de verdade entre as lojas de teste (J1-c e J1-d)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("ida e volta de uma capa entre as duas lojas de teste, com duas pessoas; o estoque das duas volta ao de antes", async ({ page, browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
    const { gerenteA, gerenteB, pageB, sair } = await duasPessoas(page, browser);
    try {
      await idaEVolta(page, pageB, CAPA, "", gerenteA, gerenteB);
    } finally {
      await sair();
    }
  });

  test("ida e volta de um aparelho pelo IMEI, com duas pessoas; ele termina na loja onde começou (J1-d)", async ({ page, browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
    const { gerenteA, gerenteB, pageB, sair } = await duasPessoas(page, browser);
    try {
      await idaEVolta(page, pageB, MOTO, "aparelho, ", gerenteA, gerenteB);
    } finally {
      await sair();
    }
  });
});
