// Lote POS-015a (24/11/2026; ORA-POS-015: "sem venda presumida como concluída sem confirmação"): a internet cai no meio
// do trabalho de quem está com a sessão aberta. No site no ar, num celular de 360 px, com as contas de teste. NÃO GRAVA
// NADA: o envio feito sem rede é segurado no aparelho pelo próprio sistema, antes de virar pedido; a prova escuta tudo o que
// a página tenta mandar enquanto a rede está desligada e confere que nenhum pedido de gravação chegou a existir (e, se
// existisse, não sairia: a rede da página está cortada).
//
// O Vendedor (teste), na Santa Cândida (teste), com o PDV aberto:
// - a rede cai: a faixa vermelha avisa que nada é gravado até a conexão voltar;
// - ele toca em "Nova venda" (ou busca um produto, se já tem uma venda em andamento): o envio não sai do aparelho, a
//   faixa diz isso, e a tela não mostra venda nenhuma como aberta;
// - ele tenta abrir a lista de Vendas: em vez do erro do navegador, a página "Sem internet agora";
// - a rede volta e ele toca em "Tentar de novo": a lista abre, com a mesma venda mais recente de antes (nada foi
//   presumido nem criado), e o PDV está como estava.
// As entregas do projeto (do dono) mostram o lote POS-015a.
//
// A prova sem login está em e2e/site-instalavel.spec.ts (roda no CI). O "sem internet" do teste é ligado alvo a alvo, e
// o do service worker pode valer alguns milissegundos depois: a prova espera ele ficar sem rede antes de navegar (a
// medida está naquele arquivo).
//
// O que esta prova NÃO faz: a rede cair no meio do "Concluir venda" de uma venda de verdade. Isso pede uma venda em
// andamento com pagamento, que grava. A regra (a mesma chave devolve o mesmo resultado; a venda só aparece concluída depois
// de o banco gravar) está provada em packages/banco/src/vendas.test.ts e nas provas que gravam (J1-b e J3-b).
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, contaDeTeste, entrar, noAr } from "./contas-de-teste";
import { DONO, LOJA_A, VENDEDOR } from "./telas-reais";

const SEM_REDE = "Sem internet: nada é gravado até a conexão voltar.";
const SEGURADO = "Sem internet: o envio não saiu do aparelho e nada foi gravado. Tente de novo quando a conexão voltar.";

/** A venda mais recente da lista de quem está logado ("Nº 23" → 23); nulo sem venda nenhuma. */
async function vendaMaisRecente(pagina: Page): Promise<number | null> {
  await expect(pagina.getByRole("heading", { level: 1, name: /^(Minhas vendas|Vendas da loja)$/ })).toBeVisible();
  const linhas = pagina.getByRole("link", { name: /^Nº \d+/ });
  if (await linhas.count() === 0) return null;
  return Number((/^Nº (\d+)/.exec((await linhas.first().innerText()).trim()) as RegExpExecArray)[1]);
}

test.describe("a internet cai com a sessão aberta: nada é presumido nem gravado (POS-015a)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o vendedor fica sem rede no PDV: o envio é segurado, a navegação mostra \"Sem internet agora\" e, na volta, nada mudou; as entregas mostram o lote", async ({ browser }) => {
    const contexto = await browser.newContext({ ...test.info().project.use });
    const pagina = await contexto.newPage();
    // Só escuta (sem rotas, para não mexer no caminho do service worker): todo pedido que não seja de leitura e que a página
    // tente fazer com a rede desligada fica anotado. O esperado é nenhum: quem segura é o sistema, antes de o pedido existir.
    let semRede = false;
    const barrados: string[] = [];
    pagina.on("request", (pedido) => {
      if (semRede && pedido.method() !== "GET" && pedido.method() !== "HEAD") barrados.push(`${pedido.method()} ${new URL(pedido.url()).pathname}`);
    });
    try {
      await test.step(`o Vendedor (teste) entra na ${LOJA_A}`, () => entrar(pagina, contaDeTeste(VENDEDOR)));

      const antes = await test.step("a venda mais recente dele, antes", async () => {
        await pagina.goto("/vendas?periodo=30");
        return vendaMaisRecente(pagina);
      });

      const novaVenda = pagina.getByRole("button", { name: "Nova venda", exact: true });
      const buscar = pagina.getByRole("search").getByRole("button", { name: "Buscar", exact: true });
      const semVendaAberta = await test.step("o PDV aberto, com o service worker do site no comando da página", async () => {
        await pagina.goto("/vender");
        await expect(pagina.getByRole("heading", { level: 1, name: "Vender", exact: true })).toBeVisible();
        await pagina.evaluate(async () => { await navigator.serviceWorker.ready; });
        if (!(await pagina.evaluate(() => navigator.serviceWorker.controller !== null))) await pagina.reload();
        await expect.poll(() => pagina.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
        await expect(novaVenda.or(buscar).first()).toBeVisible();
        return await novaVenda.count() > 0;
      });

      const servico = contexto.serviceWorkers()[0] ?? await contexto.waitForEvent("serviceworker");
      const redeDoServico = () => servico.evaluate(() => fetch("/saude", { cache: "no-store" }).then(() => "com rede", () => "sem rede"));
      const faixa = (texto: string) => pagina.getByRole("alert").filter({ hasText: texto });

      await test.step("a rede cai: a faixa avisa que nada é gravado", async () => {
        semRede = true;
        await contexto.setOffline(true);
        await expect.poll(redeDoServico, { message: "o service worker sem rede" }).toBe("sem rede");
        await expect(faixa(SEM_REDE)).toBeVisible();
      });

      await test.step(semVendaAberta ? "ele toca em \"Nova venda\": o envio não sai do aparelho e nenhuma venda aparece aberta" : "ele busca um produto: o envio não sai do aparelho", async () => {
        if (semVendaAberta) await novaVenda.click();
        else {
          await pagina.getByRole("search").getByRole("textbox").fill("capa");
          await buscar.click();
        }
        await expect(faixa(SEGURADO)).toBeVisible();
        // A tela segue como estava: o botão não fica "abrindo", e nenhuma venda em andamento aparece.
        if (semVendaAberta) {
          await expect(novaVenda).toBeVisible();
          await expect(novaVenda).toBeEnabled();
          await expect(pagina.getByRole("heading", { level: 2, name: /^Venda nº \d+$/ })).toHaveCount(0);
        }
        expect(barrados, "o sistema segurou o envio antes de ele tentar sair").toEqual([]);
      });

      await test.step("ele toca em Vendas, no menu de baixo: a página \"Sem internet agora\", em vez do erro do navegador", async () => {
        // O toque de quem usa: a troca de tela pelo menu (a navegação do próprio aplicativo), e não o endereço digitado.
        await pagina.getByRole("navigation", { name: "Atalhos" }).getByRole("link", { name: "Vendas", exact: true }).click();
        await expect(pagina.getByRole("heading", { name: "Sem internet agora" })).toBeVisible();
        await expect(pagina.getByText("O que já foi gravado continua no sistema.", { exact: false })).toBeVisible();
      });

      await test.step("a rede volta e ele toca em \"Tentar de novo\": a lista abre com a mesma venda mais recente", async () => {
        await contexto.setOffline(false);
        semRede = false;
        await expect.poll(redeDoServico, { message: "o service worker com rede de novo" }).toBe("com rede");
        await pagina.getByRole("button", { name: "Tentar de novo" }).click();
        await expect(pagina).toHaveURL(/\/vendas(\?|$)/);
        // A lista do menu abre no período padrão; a comparação é com a lista de 30 dias, como antes.
        await pagina.goto("/vendas?periodo=30");
        expect(await vendaMaisRecente(pagina), "nenhuma venda foi criada nem presumida").toBe(antes);
        await expect(pagina.getByRole("alert").filter({ hasText: "Sem internet" })).toHaveCount(0);
      });

      await test.step("o PDV está como estava", async () => {
        await pagina.goto("/vender");
        await expect(pagina.getByRole("heading", { level: 1, name: "Vender", exact: true })).toBeVisible();
        if (semVendaAberta) {
          await expect(novaVenda).toBeVisible();
          await expect(pagina.getByRole("heading", { level: 2, name: /^Venda nº \d+$/ })).toHaveCount(0);
        } else await expect(buscar).toBeVisible();
        expect(barrados, "nenhum pedido de gravação tentou sair durante a prova").toEqual([]);
      });
    } finally {
      await pagina.goto("/sair").catch(() => undefined);
      await contexto.close();
    }

    await test.step("as entregas do projeto (que são do dono) mostram o lote POS-015a", async () => {
      const doDono = await browser.newContext({ ...test.info().project.use });
      const dono = await doDono.newPage();
      try {
        await entrar(dono, contaDeTeste(DONO), LOJA_A);
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        await expect(lotes.filter({ has: dono.getByText("POS-015a", { exact: true }) })).toHaveCount(1);
      } finally {
        await dono.goto("/sair").catch(() => undefined);
        await doDono.close();
      }
    });
  });
});
