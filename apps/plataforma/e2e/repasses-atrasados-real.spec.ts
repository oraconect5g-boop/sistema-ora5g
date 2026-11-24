// Lote FIN-007a (23/11/2026; ORA-FIN-007, a primeira parte, e o vencimento do ORA-FIN-003): o cartão "O que está atrasado"
// da tela "A receber das financeiras" no site no ar, num celular de 360 px, com as contas de teste. SÓ LÊ: só abre telas
// (nenhum formulário é enviado: nenhum prazo é gravado, nenhuma cobrança é registrada, nenhum repasse é registrado).
//
// - O cartão lê a função que a migration do lote criou (repasses_atrasados): sem ela no banco do site, o cartão não
//   apareceria; com outro formato, ou com totais que não somam, o cartão diria que não deu para ler.
// - O Gerente (teste), na Santa Cândida (teste): vê o cartão e o prazo de cada financeira, sem o formulário do prazo (quem
//   define é quem concilia pela rede inteira) e sem o resumo da rede; cada conta em aberto da lista tem as suas cobranças;
//   sem nenhum prazo definido, nada na tela é chamado de atrasado.
// - O Dono (teste), na mesma loja: vê os dois formulários do prazo (a PayJoy e a Aiva) e o resumo da rede inteira.
// - O Vendedor (teste): não chega à tela.
// - As entregas do projeto mostram o lote FIN-007a.
//
// O que esta prova NÃO faz: gravar um prazo, registrar uma cobrança ou criar uma conta atrasada. Isso grava e pede o sim do
// proprietário. A regra está provada em packages/banco/src/repasses-atrasados.test.ts; a tela com atraso, sem prazo e em
// falha, em src/app/pagamentos/financeiras.test.ts; e o caminho inteiro foi provado no banco do site em 23/11, sem gravar
// (docs/aceite/FIN-007a.md).
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, GERENTE_A, LOJA_A, VENDEDOR } from "./telas-reais";

const TITULO = "O que está atrasado";
const SO_O_DONO = "Quem define o prazo é quem concilia pela rede inteira (o dono).";
const REDE_SEM_CONTA = "Nenhuma loja da rede tem conta em aberto com as financeiras.";

/** A tela "A receber das financeiras"; devolve o cartão dos atrasados, que só aparece com a função instalada no banco. */
async function abrirOsAtrasados(pagina: Page): Promise<Locator> {
  await pagina.goto("/pagamentos/financeiras");
  await expect(pagina.getByRole("heading", { level: 1, name: "A receber das financeiras", exact: true })).toBeVisible();
  const cartao = pagina.getByRole("heading", { level: 2, name: TITULO, exact: true }).locator("xpath=ancestor::section[1]");
  await expect(cartao, "o cartão só aparece com a função instalada no banco").toBeVisible();
  await expect(cartao.getByText("Não deu para ler os repasses atrasados agora.", { exact: false })).toHaveCount(0);
  return cartao;
}

/** O prazo de cada financeira (a primeira lista do cartão): as duas, cada uma com o prazo em dias ou "sem prazo definido". Devolve se alguma tem prazo. */
async function confereOsPrazos(cartao: Locator): Promise<boolean> {
  await expect(cartao.getByRole("heading", { level: 3, name: "O prazo de repasse de cada financeira", exact: true })).toBeVisible();
  const prazos = cartao.locator("ul").first().getByRole("listitem");
  await expect(prazos).toHaveCount(2);
  const textos = await prazos.allInnerTexts();
  for (const financeira of ["PayJoy", "Aiva"]) expect(textos.filter((t) => t.includes(financeira)), `o prazo da ${financeira}`).toHaveLength(1);
  for (const t of textos) expect(t, "o prazo em dias, ou a falta dele").toMatch(/sem prazo definido|\d+ dias? corridos/);
  return textos.some((t) => !t.includes("sem prazo definido"));
}

/** As contas em aberto da lista (as que têm o formulário do repasse): cada uma tem as suas cobranças; sem prazo, nada é atrasado. */
async function confereAsContas(pagina: Page, cartao: Locator, haPrazo: boolean): Promise<number> {
  const abertas = await pagina.getByRole("button", { name: "Registrar repasse", exact: true }).count();
  const cobrancas = pagina.locator("details > summary").filter({ hasText: /^(Registrar cobrança feita à financeira|Cobranças feitas à financeira \(\d+\))$/ });
  await expect(cobrancas, "cada conta em aberto tem as suas cobranças").toHaveCount(abertas);
  if (abertas === 0) await expect(cartao.getByText("Nenhuma conta em aberto com as financeiras.", { exact: true })).toBeVisible();
  if (!haPrazo) {
    // Sem nenhum prazo definido, o sistema não chama nenhuma conta de atrasada.
    await expect(pagina.getByText(/atrasada há \d/)).toHaveCount(0);
    await expect(cartao.getByText(/pass(ou|aram) do prazo; a mais atrasada/)).toHaveCount(0);
    await expect(cartao.getByRole("heading", { level: 3, name: "Há quanto tempo está atrasado", exact: true })).toHaveCount(0);
  }
  return abertas;
}

test.describe("os repasses atrasados das financeiras no site no ar, só lendo (FIN-007a)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o gerente vê o que está atrasado e o prazo de cada financeira; o dono vê também os formulários do prazo e a rede; o vendedor não chega; as entregas mostram o lote", async ({ browser }) => {
    await comPessoas(browser, [[GERENTE_A], [VENDEDOR], [DONO, LOJA_A]], async (p) => {
      const gerente = p[GERENTE_A] as Page;
      const vendedor = p[VENDEDOR] as Page;
      const dono = p[DONO] as Page;

      await test.step(`o Gerente (teste), na ${LOJA_A}: o cartão, os prazos sem formulário e as cobranças de cada conta em aberto`, async () => {
        const cartao = await abrirOsAtrasados(gerente);
        const haPrazo = await confereOsPrazos(cartao);
        await confereAsContas(gerente, cartao, haPrazo);
        // Quem concilia só na loja não define o prazo nem lê a rede.
        await expect(cartao.getByText(SO_O_DONO, { exact: true })).toBeVisible();
        await expect(cartao.getByRole("button", { name: "Gravar", exact: true })).toHaveCount(0);
        await expect(cartao.getByLabel("De onde veio o prazo", { exact: true })).toHaveCount(0);
        await expect(cartao.getByRole("heading", { level: 3, name: "Na rede inteira", exact: true })).toHaveCount(0);
      });

      await test.step(`o Dono (teste), na ${LOJA_A}: os dois formulários do prazo e o resumo da rede inteira, sem enviar nada`, async () => {
        const cartao = await abrirOsAtrasados(dono);
        const haPrazo = await confereOsPrazos(cartao);
        await confereAsContas(dono, cartao, haPrazo);
        await expect(cartao.getByText(SO_O_DONO, { exact: true })).toHaveCount(0);
        await expect(cartao.getByRole("button", { name: "Gravar", exact: true })).toHaveCount(2);
        await expect(cartao.getByLabel("Dias", { exact: true })).toHaveCount(2);
        await expect(cartao.getByLabel("De onde veio o prazo", { exact: true })).toHaveCount(2);
        // A rede inteira, lida pela mesma função sem a loja: ou nenhuma loja tem conta em aberto, ou a lista das que têm.
        const rede = cartao.getByRole("heading", { level: 3, name: "Na rede inteira", exact: true }).locator("xpath=..");
        await expect(rede).toBeVisible();
        await expect(rede.getByText("Não deu para ler as outras lojas agora.", { exact: false })).toHaveCount(0);
        await expect(rede.getByText(REDE_SEM_CONTA, { exact: true }).or(rede.getByRole("listitem").first())).toBeVisible();
      });

      await test.step("o Vendedor (teste) não chega à tela", async () => {
        await vendedor.goto("/pagamentos/financeiras");
        await expect(vendedor.getByText("Os valores a receber das financeiras são da gerência da loja.", { exact: true })).toBeVisible();
        await expect(vendedor.getByRole("heading", { level: 2, name: TITULO, exact: true })).toHaveCount(0);
      });

      await test.step("as entregas do projeto mostram o lote FIN-007a", async () => {
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        await expect(lotes.filter({ has: dono.getByText("FIN-007a", { exact: true }) })).toHaveCount(1);
      });
    });
  });
});
