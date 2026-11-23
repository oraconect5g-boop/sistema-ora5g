// Lote FIN-001a (23/11/2026; ORA-FIN-001): o cartão "A conta do período" do Financeiro no site no ar, num celular de 360 px,
// com as contas de teste. SÓ LÊ: só abre telas (nenhum formulário é enviado, nada é vendido, pago nem corrigido).
//
// - O cartão lê a função que a migration do lote criou (financeiro_conferencia): se ela faltasse no banco do site, o cartão
//   não apareceria; se viesse com outro formato, o cartão diria que não deu para conferir.
// - O Gerente (teste), na Santa Cândida (teste), em 30 dias: a conta fecha; o número de vendas da frase é o do indicador
//   "Vendas concluídas"; os três lados dizem "fecha"; as parcelas do lado dos pagamentos somam o vendido; o caixa e o estoque
//   mostram o mesmo número dos dois lados.
// - O Gerente 2 (teste), na Loja de teste 2: o cartão aparece e não acusa diferença (sem venda, diz que não há o que conferir).
// - O Dono (teste), na rede inteira: o mesmo.
// - As entregas do projeto mostram o lote FIN-001a.
//
// O que esta prova NÃO faz: provocar uma diferença. Isso pediria gravar por fora do sistema; o cartão com diferença está
// provado em src/app/financeiro/financeiro.test.ts, e a conta do banco, em packages/banco/src/financeiro-conferencia.test.ts.
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, escolher, GERENTE_A, GERENTE_B, indicador, inteiro, LOJA_A } from "./telas-reais";

const TITULO = "A conta do período";
const SEM_VENDA = "Nenhuma venda concluída no período: não há o que conferir.";

/** Os valores em reais de um texto, em centavos, na ordem em que aparecem ("R$ 1.099,00" → 109900). */
function reais(texto: string): number[] {
  return [...texto.matchAll(/(-?)R\$\s?([\d.]+),(\d{2})/g)].map((m) => (m[1] ? -1 : 1) * (Number((m[2] as string).replace(/\./g, "")) * 100 + Number(m[3])));
}
/** As quantidades de um texto ("19 unidades" → 19), na ordem em que aparecem. */
function unidades(texto: string): number[] {
  return [...texto.matchAll(/([\d.]+) unidades?/g)].map((m) => Number((m[1] as string).replace(/\./g, "")));
}

/** O Financeiro no período de 30 dias (e, para quem vê a rede, na loja do filtro); devolve o cartão da conta do período. */
async function abrirAConta(pagina: Page, loja?: string): Promise<Locator> {
  await pagina.goto("/financeiro");
  await expect(pagina.getByRole("heading", { level: 1, name: "Financeiro", exact: true })).toBeVisible();
  await escolher(pagina, "Período", "30 dias");
  if (loja) await escolher(pagina, "Loja", loja);
  const cartao = pagina.getByRole("heading", { level: 2, name: TITULO, exact: true }).locator("xpath=ancestor::section[1]");
  await expect(cartao, "o cartão só aparece com a função instalada no banco").toBeVisible();
  return cartao;
}

/** A conta sem diferença: nunca "não fecha"; com venda, a frase, os três lados e as contas de cada lado. Devolve as vendas. */
async function confereQueFecha(pagina: Page, cartao: Locator): Promise<number> {
  await expect(cartao.getByText("Não deu para conferir a conta do período agora.", { exact: false })).toHaveCount(0);
  await expect(cartao.getByText("não fecha", { exact: false })).toHaveCount(0);
  await expect(cartao.getByText("Isto não deveria acontecer")).toHaveCount(0);

  const vendas = inteiro((await indicador(pagina, "Vendas concluídas")).detalhe);
  if (vendas === 0) {
    await expect(cartao.getByText(SEM_VENDA)).toBeVisible();
    return 0;
  }
  const frase = cartao.getByText(/^A conta fecha: /);
  await expect(frase).toBeVisible();
  // A mesma quantidade do indicador do resumo, lido de outra função do banco (financeiro_painel).
  expect(inteiro((await frase.innerText()).replace("A conta fecha: ", "")), "as vendas da conta são as do resumo").toBe(vendas);
  const vendido = reais(await frase.innerText())[0] as number;

  const lado = (titulo: string) => cartao.getByRole("listitem").filter({ has: pagina.getByText(titulo, { exact: true }) });
  for (const titulo of ["Pagamentos", "Livro do caixa", "Livro do estoque"]) {
    await expect(lado(titulo)).toHaveCount(1);
    await expect(lado(titulo).getByText("fecha", { exact: true })).toBeVisible();
  }
  // Pagamentos: o primeiro valor é o vendido; os outros são as parcelas, que somam o vendido.
  const [total, ...parcelas] = reais(await lado("Pagamentos").innerText());
  expect(total, "o vendido do lado dos pagamentos").toBe(vendido);
  expect(parcelas.length, "as parcelas do vendido").toBeGreaterThan(0);
  expect(parcelas.reduce((a, b) => a + b, 0), "as parcelas somam o vendido").toBe(vendido);
  // Caixa e estoque: o que as vendas dizem e o que o livro diz, lado a lado, iguais.
  const caixa = reais(await lado("Livro do caixa").innerText());
  expect(caixa).toHaveLength(2);
  expect(caixa[1], "o livro do caixa").toBe(caixa[0]);
  const estoque = unidades(await lado("Livro do estoque").innerText());
  expect(estoque).toHaveLength(2);
  expect(estoque[1], "o livro do estoque").toBe(estoque[0]);
  // O limite da conta fica dito na tela.
  await expect(cartao.getByText("o estoque que voltou e o dinheiro devolvido ainda não são conferidos aqui", { exact: false })).toBeVisible();
  return vendas;
}

test.describe("a conta do período no Financeiro do site no ar, só lendo (FIN-001a)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("a conta fecha na loja de teste, na Loja de teste 2 e na rede inteira; as entregas mostram o lote", async ({ browser }) => {
    await comPessoas(browser, [[GERENTE_A], [GERENTE_B], [DONO, LOJA_A]], async (p) => {
      const gerente = p[GERENTE_A] as Page;
      const gerente2 = p[GERENTE_B] as Page;
      const dono = p[DONO] as Page;

      const daLoja = await test.step(`o Gerente (teste), na ${LOJA_A}, em 30 dias: a conta fecha`, async () => {
        const vendas = await confereQueFecha(gerente, await abrirAConta(gerente));
        expect(vendas, "a loja de teste tem vendas de teste nos últimos 30 dias").toBeGreaterThan(0);
        return vendas;
      });

      await test.step("o Gerente 2 (teste), na Loja de teste 2: o cartão aparece e não acusa diferença", async () => {
        await confereQueFecha(gerente2, await abrirAConta(gerente2));
      });

      await test.step("o Dono (teste), na rede inteira: a conta fecha, com pelo menos as vendas da loja de teste", async () => {
        const vendas = await confereQueFecha(dono, await abrirAConta(dono, "Rede inteira"));
        expect(vendas).toBeGreaterThanOrEqual(daLoja);
      });

      await test.step("as entregas do projeto mostram o lote FIN-001a", async () => {
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        await expect(lotes.filter({ has: dono.getByText("FIN-001a", { exact: true }) })).toHaveCount(1);
      });
    });
  });
});
