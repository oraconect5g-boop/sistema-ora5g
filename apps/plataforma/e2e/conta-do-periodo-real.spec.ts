// Lotes FIN-001a e FIN-001b (23/11/2026; ORA-FIN-001): o cartão "A conta do período" do Financeiro no site no ar, num celular
// de 360 px, com as contas de teste. SÓ LÊ: só abre telas (nenhum formulário é enviado, nada é vendido, pago nem corrigido).
//
// - O cartão lê as funções que as migrations dos lotes criaram (financeiro_conferencia e financeiro_conferencia_do_desfeito):
//   sem a primeira no banco do site, o cartão não apareceria; sem a segunda, a parte do desfeito não apareceria; com outro
//   formato, o cartão diria que não deu para conferir.
// - O Gerente (teste), na Santa Cândida (teste), em 30 dias: a conta fecha; o número de vendas da frase é o do indicador
//   "Vendas concluídas"; os três lados dizem "fecha"; as parcelas do lado dos pagamentos somam o vendido; o caixa e o estoque
//   mostram o mesmo número dos dois lados. E o desfeito fecha: os destinos somam o valor desfeito, o dinheiro devolvido é o
//   do livro do caixa e o que voltou é o que está no livro do estoque.
// - O Gerente 2 (teste), na Loja de teste 2: o cartão aparece e não acusa diferença (sem venda, diz que não há o que conferir).
// - O Dono (teste), na rede inteira: o mesmo.
// - As entregas do projeto mostram os lotes FIN-001a e FIN-001b.
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
const SEM_DESFEITO = "Nenhum cancelamento nem devolução no período.";

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

  // FIN-001b: a parte do desfeito existe (a função está no banco), e o limite antigo saiu da tela.
  const desfeito = cartao.locator("div").filter({ has: pagina.getByRole("heading", { level: 3, name: "O que foi desfeito no período", exact: true }) }).last();
  await expect(desfeito).toBeVisible();
  await expect(desfeito.getByText("Não deu para conferir o que foi desfeito agora.", { exact: false })).toHaveCount(0);
  await expect(cartao.getByText("ainda não são conferidos aqui", { exact: false })).toHaveCount(0);
  await expect(cartao.getByText("As duas contas conferem o que o sistema registrou", { exact: false })).toBeVisible();
  await confereODesfeito(pagina, desfeito);

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

  // Os três lados das vendas são a primeira lista do cartão (a segunda é a do desfeito).
  const lado = (titulo: string) => cartao.locator("ul").first().getByRole("listitem").filter({ has: pagina.getByText(titulo, { exact: true }) });
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
  return vendas;
}

/** O desfeito sem diferença: sem nada desfeito, a frase; senão, os destinos somam o desfeito e os livros conferem. Devolve os fatos. */
async function confereODesfeito(pagina: Page, desfeito: Locator): Promise<number> {
  if (await desfeito.getByText(SEM_DESFEITO).count() > 0) return 0;
  const frase = desfeito.getByText(/^O desfeito fecha: /);
  await expect(frase).toBeVisible();
  const texto = await frase.innerText();
  const fatos = [...texto.matchAll(/([\d.]+) (?:cancelamentos?|devoluç(?:ão|ões))/g)].reduce((soma, m) => soma + Number((m[1] as string).replace(/\./g, "")), 0);
  expect(fatos, "os cancelamentos e as devoluções da frase").toBeGreaterThan(0);
  const valor = reais(texto)[0] as number;
  const lado = (titulo: string) => desfeito.getByRole("listitem").filter({ has: pagina.getByText(titulo, { exact: true }) });
  for (const titulo of ["Destino do valor", "Livro do caixa", "Livro do estoque"]) {
    await expect(lado(titulo)).toHaveCount(1);
    await expect(lado(titulo).getByText("fecha", { exact: true })).toBeVisible();
  }
  // Destino: o primeiro valor do texto é o desfeito; os outros, até o ponto final da soma, são os destinos, que somam o desfeito.
  const soma = ((await lado("Destino do valor").locator("p").nth(1).innerText()).split(". ")[0] ?? "");
  const [total, ...destinos] = reais(soma);
  expect(total, "o valor desfeito no lado do destino").toBe(valor);
  expect(destinos.reduce((a, b) => a + b, 0), "os destinos somam o desfeito").toBe(valor);
  // Caixa: o dinheiro devolvido e o que está no livro, iguais.
  const caixa = reais(await lado("Livro do caixa").locator("p").nth(1).innerText());
  expect(caixa).toHaveLength(2);
  expect(caixa[1], "o estorno no livro do caixa").toBe(caixa[0]);
  // Estoque: o que voltou é o que está no livro (as unidades do texto: desfeitas, voltaram, no livro, ...).
  const estoque = unidades(await lado("Livro do estoque").locator("p").nth(1).innerText());
  expect(estoque.length).toBeGreaterThanOrEqual(3);
  expect(estoque[2], "a volta no livro do estoque").toBe(estoque[1]);
  return fatos;
}

test.describe("a conta do período no Financeiro do site no ar, só lendo (FIN-001a e FIN-001b)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("a conta das vendas e a do desfeito fecham na loja de teste, na Loja de teste 2 e na rede inteira; as entregas mostram os lotes", async ({ browser }) => {
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

      await test.step("as entregas do projeto mostram os lotes FIN-001a e FIN-001b", async () => {
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        for (const lote of ["FIN-001a", "FIN-001b"]) await expect(lotes.filter({ has: dono.getByText(lote, { exact: true }) })).toHaveCount(1);
      });
    });
  });
});
