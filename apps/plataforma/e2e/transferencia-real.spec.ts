// Lote J1-c (19/11/2026; ORA-INV-007 e ORA-QUAL-010; o ponto T4 dos pontos em aberto, "a jornada com pessoas diferentes";
// o sim do proprietário de 19/11 ao teste da transferência e à conta Gerente 2 (teste)): a transferência de verdade entre as
// duas lojas de teste, com duas pessoas, cada uma num celular de 360 px, no site no ar.
//
// Ida: o Gerente (teste) pede na Santa Cândida (teste) uma capa de proteção da Loja de teste 2; o Gerente 2 (teste) separa e
// envia de lá; o Gerente (teste) recebe e confere. Volta: o Gerente 2 (teste) pede de volta, o Gerente (teste) separa e envia,
// o Gerente 2 (teste) recebe. A cada passo, o disponível das duas lojas é conferido; no fim, é o de antes.
//
// GRAVA de verdade, só nas duas lojas de teste: duas transferências recebidas por vez, com o estoque igual ao do começo. Uma
// transferência deste teste deixada pelo caminho numa vez que falhou é recebida (se já estava em trânsito) ou cancelada (se
// ainda estava na origem) no começo. Só roda no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, contaDeTeste, entrar, noAr } from "./contas-de-teste";

const SKU = "ACE-0001";
const NOME = "Capa de proteção";
const LOJA_A = "Santa Cândida (teste)";
const LOJA_B = "Loja de teste 2";
const MARCA = "teste automático da transferência";

/** A lista das transferências chega em partes (primeiro o esqueleto): espera o texto que só a tela pronta tem. */
async function abrirTransferencias(pagina: Page) {
  await pagina.goto("/transferencias");
  await expect(pagina.getByText("Para pedir, abra o produto no estoque")).toBeVisible();
}

const ondeTem = (pagina: Page) => pagina.locator("section").filter({ has: pagina.getByRole("heading", { name: `Onde tem: ${NOME}` }) });
/** A linha de uma loja no "Onde tem", pelo nome exato (a linha da própria loja tem "Mandar para" com o nome das outras). */
const linhaDaLoja = (pagina: Page, loja: string) => {
  const nome = new RegExp(`^${loja.replace(/[()]/g, "\\$&")}( \\(esta loja\\))?$`);
  return ondeTem(pagina).getByRole("listitem").filter({ has: pagina.locator("span.font-medium").filter({ hasText: nome }) });
};
const cartao = (pagina: Page, motivo: string) => pagina.locator("section").filter({ hasText: `Motivo: ${motivo}` });

/** Abre o "Onde tem" da capa: o Estoque com a busca pelo SKU e o "na rede" da linha. */
async function abrirNaRede(pagina: Page) {
  await pagina.goto(`/estoque?q=${SKU}`);
  await pagina.getByRole("listitem").filter({ hasText: SKU }).getByRole("link", { name: "na rede" }).first().click();
  await expect(ondeTem(pagina)).toBeVisible();
}

/** O disponível da capa nas duas lojas de teste, pelo "Onde tem". */
async function disponiveis(pagina: Page): Promise<{ a: number; b: number }> {
  await abrirNaRede(pagina);
  const de = async (loja: string) => {
    const linha = linhaDaLoja(pagina, loja);
    await expect(linha).toHaveCount(1);
    const texto = await linha.innerText();
    const numero = /(\d+)\s*disponível/.exec(texto);
    if (!numero) throw new Error(`o "Onde tem" não mostrou o disponível da ${loja}`);
    return Number(numero[1]);
  };
  return { a: await de(LOJA_A), b: await de(LOJA_B) };
}

/** Pede uma capa da outra loja, pelo "Onde tem"; volta à lista das transferências. */
async function pedir(pagina: Page, origem: string, motivo: string) {
  await abrirNaRede(pagina);
  const linha = linhaDaLoja(pagina, origem);
  await expect(linha).toHaveCount(1);
  await linha.getByLabel("Quantidade").fill("1");
  await linha.getByLabel("Motivo").fill(motivo);
  await linha.getByRole("button", { name: "Pedir desta loja" }).click();
  await expect(pagina).toHaveURL(/\/transferencias\?ok=pedida/);
  await expect(cartao(pagina, motivo)).toContainText("Pedida");
}

/** Na origem: separa e envia o pedido. */
async function separarEEnviar(pagina: Page, motivo: string) {
  await abrirTransferencias(pagina);
  await cartao(pagina, motivo).getByRole("button", { name: "Separar" }).click();
  await expect(pagina).toHaveURL(/\/transferencias\?ok=separada/);
  await cartao(pagina, motivo).getByRole("button", { name: "Enviar (sai do estoque desta loja)" }).click();
  await expect(pagina).toHaveURL(/\/transferencias\?ok=enviada/);
  await expect(cartao(pagina, motivo)).toContainText("Em trânsito");
}

/** No destino: recebe e confere a quantidade que veio. */
async function receber(pagina: Page, motivo: string) {
  await abrirTransferencias(pagina);
  const c = cartao(pagina, motivo);
  await expect(c.getByLabel("Quantidade contada")).toHaveValue("1");
  await c.getByRole("button", { name: "Receber e conferir" }).click();
  await expect(pagina).toHaveURL(/\/transferencias\?ok=recebida/);
  await expect(cartao(pagina, motivo)).toContainText("Recebida");
}

/** Fecha o que uma vez anterior deste teste deixou pelo caminho: recebe o que está em trânsito e cancela o que está na origem. */
async function fecharPendentes(pagina: Page) {
  for (let volta = 0; volta < 10; volta++) {
    await abrirTransferencias(pagina);
    const doTeste = pagina.locator("section").filter({ hasText: `Motivo: ${MARCA}` });
    const aReceber = doTeste.filter({ has: pagina.getByRole("button", { name: "Receber e conferir" }) }).first();
    if (await aReceber.isVisible()) {
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

test.describe("a transferência de verdade entre as lojas de teste (J1-c)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("ida e volta de uma capa entre as duas lojas de teste, com duas pessoas; o estoque das duas volta ao de antes", async ({ page, browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
    const gerenteA = contaDeTeste("Gerente (teste)");
    const gerenteB = contaDeTeste("Gerente 2 (teste)");
    // A segunda pessoa, noutro celular igual (as mesmas opções do projeto: tela, toque e o endereço do site).
    const contextoB = await browser.newContext({ ...test.info().project.use });
    const pageB = await contextoB.newPage();
    const quando = new Date().toISOString().slice(0, 19);
    const ida = `${MARCA}, ida, ${quando}`;
    const volta = `${MARCA}, volta, ${quando}`;

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

      let antes = { a: 0, b: 0 };
      await test.step("as duas lojas têm a capa livre", async () => {
        antes = await disponiveis(page);
        expect(antes.b, `a ${LOJA_B} precisa de pelo menos uma ${NOME} livre`).toBeGreaterThanOrEqual(1);
      });

      await test.step(`ida: o ${gerenteA.nome} pede da ${LOJA_B} (sai do disponível de lá na hora)`, async () => {
        await pedir(page, LOJA_B, ida);
        expect(await disponiveis(page)).toEqual({ a: antes.a, b: antes.b - 1 });
      });
      await test.step(`ida: o ${gerenteB.nome} separa e envia`, async () => separarEEnviar(pageB, ida));
      await test.step(`ida: o ${gerenteA.nome} recebe e confere (entra no destino)`, async () => {
        await receber(page, ida);
        expect(await disponiveis(page)).toEqual({ a: antes.a + 1, b: antes.b - 1 });
      });

      await test.step(`volta: o ${gerenteB.nome} pede da ${LOJA_A}`, async () => pedir(pageB, LOJA_A, volta));
      await test.step(`volta: o ${gerenteA.nome} separa e envia`, async () => separarEEnviar(page, volta));
      await test.step(`volta: o ${gerenteB.nome} recebe e confere; o estoque das duas é o de antes`, async () => {
        await receber(pageB, volta);
        expect(await disponiveis(page)).toEqual(antes);
      });
    } finally {
      await page.goto("/sair");
      await pageB.goto("/sair");
      await contextoB.close();
    }
  });
});
