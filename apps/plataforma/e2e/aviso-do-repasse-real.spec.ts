// Lote FIN-007b (23/11/2026; ORA-FIN-007, a segunda parte, e a previsão de caixa do ORA-FIN-010): o aviso do repasse
// atrasado e da cobrança a retomar no Início e no sino, e a previsão de caixa com o vencimento das financeiras, no site no
// ar, num celular de 360 px, com as contas de teste. SÓ LÊ: só abre telas e lê a resposta do sino (nenhum formulário é
// enviado: nenhum prazo, cobrança ou repasse é gravado).
//
// - As duas funções do banco que o lote refez (pendencias_da_loja e previsao_de_caixa) são as que o Início, o sino e a
//   Previsão leem: se uma delas falhasse no banco do site, o Início diria que não leu o que espera a pessoa, o sino
//   responderia 503 e a Previsão diria que não foi possível ler.
// - O Gerente (teste), na Santa Cândida (teste): o que a tela "A receber das financeiras" mostra como atrasado e como
//   cobrança a retomar é o que o Início e o sino avisam, com o mesmo número; sem nada atrasado, os dois alertas não
//   aparecem (alerta com zero não é pendência de ninguém). A previsão não é dele.
// - O Vendedor (teste): o sino dele nunca traz esses dois alertas.
// - O Dono (teste): a Previsão de caixa abre com os fatos; a linha das financeiras diz o que entra pelo vencimento, ou
//   "Nada em aberto" quando a rede não tem conta em aberto (o que a tela das financeiras também diz).
// - As entregas do projeto mostram o lote FIN-007b.
//
// O que esta prova NÃO faz: criar uma conta atrasada para ver o alerta aceso no site. Isso grava e pede o sim do
// proprietário. A regra está provada em packages/banco/src/aviso-do-repasse-e-previsao.test.ts; as telas, em
// src/lib/inicio/pendencias.test.ts, src/app/pagamentos/financeiras.test.ts e src/app/previsao/previsao.test.ts; e o
// caminho inteiro foi provado no banco do site em 23/11, sem gravar (docs/aceite/FIN-007b.md).
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, GERENTE_A, LOJA_A, VENDEDOR } from "./telas-reais";

const ATRASADOS = "Repasses atrasados";
const A_RETOMAR = "Cobranças a retomar";
type ItemDoSino = { rotulo: string; quantidade: number; alerta: boolean; href: string };

/** Na tela das financeiras: quantas contas da lista estão atrasadas e quantas têm a cobrança a retomar (os selos). */
async function contarNasFinanceiras(pagina: Page) {
  await pagina.goto("/pagamentos/financeiras");
  await expect(pagina.getByRole("heading", { level: 1, name: "A receber das financeiras", exact: true })).toBeVisible();
  await expect(pagina.getByRole("heading", { level: 2, name: "O que está atrasado", exact: true })).toBeVisible();
  await expect(pagina.getByText("Não deu para ler os repasses atrasados agora.", { exact: false })).toHaveCount(0);
  return { atrasadas: await pagina.getByText(/^atrasada há \d+ dias?$/).count(), aRetomar: await pagina.getByText(/^retomar a cobrança/).count() };
}

/** O número do cartão de um alerta no Início; nulo quando o cartão não está lá. */
async function alertaNoInicio(pagina: Page, rotulo: string): Promise<number | null> {
  const cartao = pagina.getByRole("region", { name: "O que espera você" }).getByRole("link").filter({ has: pagina.getByText(rotulo, { exact: true }) });
  if (await cartao.count() === 0) return null;
  const numero = /\d+/.exec(await cartao.innerText());
  if (!numero) throw new Error(`o cartão "${rotulo}" não mostrou o número`);
  return Number(numero[0]);
}

/** O que o sino lê (a mesma leitura do Início, pedida com a sessão da pessoa). Falha de leitura é 503: a prova reprova. */
async function sino(pagina: Page): Promise<ItemDoSino[]> {
  const resposta = await pagina.request.get("/api/pendencias", { headers: { accept: "application/json" } });
  expect(resposta.status(), "o sino leu as pendências").toBe(200);
  const corpo = (await resposta.json()) as { pendencias?: ItemDoSino[] };
  expect(Array.isArray(corpo.pendencias), "o sino devolveu a lista").toBe(true);
  return corpo.pendencias as ItemDoSino[];
}
const doSino = (itens: ItemDoSino[], rotulo: string) => itens.find((i) => i.rotulo === rotulo) ?? null;

test.describe("o aviso do repasse atrasado e a previsão com o vencimento no site no ar, só lendo (FIN-007b)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o Início e o sino avisam o mesmo que a tela das financeiras mostra; a previsão do dono abre com as financeiras pelo vencimento; as entregas mostram o lote", async ({ browser }) => {
    await comPessoas(browser, [[GERENTE_A], [VENDEDOR], [DONO, LOJA_A]], async (p) => {
      const gerente = p[GERENTE_A] as Page;
      const vendedor = p[VENDEDOR] as Page;
      const dono = p[DONO] as Page;

      await test.step(`o Gerente (teste), na ${LOJA_A}: o Início e o sino avisam o que a tela das financeiras mostra`, async () => {
        const nasFinanceiras = await contarNasFinanceiras(gerente);
        await gerente.goto("/inicio");
        await expect(gerente.getByRole("region", { name: "O que espera você" })).toBeVisible();
        await expect(gerente.getByText("Não deu para ler agora o que espera você nesta loja", { exact: false })).toHaveCount(0);
        // Alerta com zero não aparece; com número, é o mesmo da tela das financeiras.
        expect(await alertaNoInicio(gerente, ATRASADOS), "os repasses atrasados no Início").toBe(nasFinanceiras.atrasadas || null);
        expect(await alertaNoInicio(gerente, A_RETOMAR), "as cobranças a retomar no Início").toBe(nasFinanceiras.aRetomar || null);
        const itens = await sino(gerente);
        expect(itens.length, "o gerente tem filas no sino").toBeGreaterThan(0);
        expect(doSino(itens, ATRASADOS)?.quantidade ?? 0, "os repasses atrasados no sino").toBe(nasFinanceiras.atrasadas);
        expect(doSino(itens, A_RETOMAR)?.quantidade ?? 0, "as cobranças a retomar no sino").toBe(nasFinanceiras.aRetomar);
        for (const rotulo of [ATRASADOS, A_RETOMAR]) {
          const item = doSino(itens, rotulo);
          if (item) expect(item, rotulo).toMatchObject({ alerta: true, href: "/pagamentos/financeiras" });
        }
      });

      await test.step("o Vendedor (teste): o sino dele não traz os alertas de quem concilia", async () => {
        const itens = await sino(vendedor);
        expect(doSino(itens, ATRASADOS)).toBeNull();
        expect(doSino(itens, A_RETOMAR)).toBeNull();
      });

      await test.step(`o Dono (teste), na ${LOJA_A}: a Previsão de caixa abre com as financeiras pelo vencimento`, async () => {
        // O que a rede tem em aberto, pela tela das financeiras (a parte "Na rede inteira", que só o dono vê).
        await contarNasFinanceiras(dono);
        const redeSemConta = await dono.getByText("Nenhuma loja da rede tem conta em aberto com as financeiras.", { exact: true }).count() > 0;
        await dono.goto("/previsao");
        await expect(dono.getByRole("heading", { level: 1, name: "Previsão de caixa", exact: true })).toBeVisible();
        await expect(dono.getByText("Não foi possível ler agora", { exact: false })).toHaveCount(0);
        const fatos = dono.getByRole("heading", { level: 2, name: "Fatos de hoje", exact: true }).locator("xpath=ancestor::section[1]");
        await expect(fatos).toBeVisible();
        const linha = fatos.getByRole("listitem").filter({ has: dono.getByText("A receber das financeiras", { exact: true }) });
        await expect(linha).toHaveCount(1);
        // O texto de um banco sem a função nova não aparece mais.
        await expect(linha.getByText("falta o prazo da PayJoy e da Aiva", { exact: false })).toHaveCount(0);
        if (redeSemConta) await expect(linha.getByText("Nada em aberto", { exact: true })).toBeVisible();
        else await expect(linha.getByText(/vencem no período|já passaram do prazo|vencem depois do período|sem prazo gravado|grave o prazo de repasse/)).toBeVisible();
        // O dono também lê o sino da loja do turno sem falha.
        await sino(dono);
      });

      await test.step("o Gerente (teste) não vê a previsão: é só do dono", async () => {
        await gerente.goto("/previsao");
        await expect(gerente.getByText("A previsão de caixa é só do dono", { exact: true })).toBeVisible();
      });

      await test.step("as entregas do projeto mostram o lote FIN-007b", async () => {
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        await expect(lotes.filter({ has: dono.getByText("FIN-007b", { exact: true }) })).toHaveCount(1);
      });
    });
  });
});
