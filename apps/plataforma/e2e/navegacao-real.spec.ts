// Lote VEL-h (19/11/2026; ORA-QUAL-010; o sim do proprietário de 19/11 a medir e deixar mais leve a pré-carga do menu): a
// navegação no celular, no site no ar, com as contas de teste. SÓ LÊ.
//
// - Nenhuma tela principal passa da largura do celular (360 px), e a barra de baixo fica à vista, inclusive com o nome de
//   loja mais longo ("Santa Cândida (teste)"). Antes, o botão da loja no topo não encolhia: a página ficava com 406 px, e a
//   barra de baixo (com o "Mais") saía da vista em todas as telas.
// - Cada tela aberta pré-carrega só os atalhos: no máximo 10 pedidos de pré-carga nos 4 s depois de abrir (eram de 17 a 22 no
//   celular). Cada pré-carga monta o molde da sessão no banco.
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, contaDeTeste, entrar, noAr } from "./contas-de-teste";
import { ADMINISTRADOR, comPessoas, GERENTE_A, GERENTE_B, LOJA_A, VENDEDOR } from "./telas-reais";

const TELAS = ["/inicio", "/vender", "/vendas", "/caixa", "/estoque", "/transferencias", "/catalogo", "/financeiro", "/relatorios", "/metas"];
const LIMITE_DE_PRE_CARGAS = 10;

/** A largura da página e se a barra de baixo está inteira à vista. */
const medida = (pagina: Page) => pagina.evaluate(() => {
  const barra = document.querySelector('nav[aria-label="Atalhos"]')?.getBoundingClientRect();
  return { largura: innerWidth, barraAVista: barra !== undefined && barra.bottom <= (visualViewport?.height ?? innerHeight) + 1 };
});

test.describe("a navegação no celular, só lendo (VEL-h)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "o celular de 360 px");
    test.setTimeout(240_000);
  });

  test("nenhuma tela principal passa da largura do celular, e a barra de baixo fica à vista", async ({ browser }) => {
    await comPessoas(browser, [[GERENTE_A], [VENDEDOR], [GERENTE_B], [ADMINISTRADOR, LOJA_A]], async (p) => {
      for (const [nome, pagina] of Object.entries(p)) {
        for (const tela of TELAS) {
          await test.step(`${nome} em ${tela}`, async () => {
            await pagina.goto(tela);
            await expect(pagina.getByRole("navigation", { name: "Atalhos" })).toBeVisible();
            expect(await medida(pagina), `${nome} em ${tela}`).toEqual({ largura: 360, barraAVista: true });
          });
        }
      }
    });
  });

  test(`cada tela pré-carrega só os atalhos (no máximo ${LIMITE_DE_PRE_CARGAS} pedidos)`, async ({ browser }) => {
    // Um celular sem a recusa da pré-carga das outras provas (comPessoas): aqui ela é o que se mede.
    const contexto = await browser.newContext({ ...test.info().project.use });
    const pagina = await contexto.newPage();
    const preCargas: string[] = [];
    pagina.on("request", (r) => { if (r.headers()["next-router-prefetch"]) preCargas.push(r.url()); });
    try {
      await entrar(pagina, contaDeTeste(GERENTE_A));
      for (const tela of ["/inicio", "/vendas?periodo=30", "/estoque"]) {
        await test.step(`as pré-cargas de ${tela}`, async () => {
          await pagina.goto(tela, { waitUntil: "load" });
          preCargas.length = 0;
          await pagina.waitForTimeout(4000);
          expect(preCargas.length, `${tela}: ${preCargas.join(" ")}`).toBeLessThanOrEqual(LIMITE_DE_PRE_CARGAS);
        });
      }
    } finally {
      await pagina.goto("/sair").catch(() => undefined);
      await contexto.close();
    }
  });
});
