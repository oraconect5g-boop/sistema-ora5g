// Lote QUAL-006a (24/11/2026; ORA-QUAL-006 e ORA-QUAL-013: o aviso no celular quando há erro do servidor), no site no ar,
// num celular de 360 px, com as contas de teste. SÓ LÊ: só abre telas e pede o endereço do relato pelo domínio.
//
// - Pelo domínio, /saude/erros dá 404: o relato dos erros só responde dentro do servidor, onde o worker dos avisos o lê.
//   (Contra o servidor local, sem o Apache no caminho, ele responde: é o que o worker vê.)
// - O Dono (teste) abre a Saúde da operação: no cartão "Erros do servidor", o aviso no celular está ligado, com o worker
//   conferindo o site há pouco (ele roda a cada minuto e, depois da publicação, relata ao banco). A tela lê a função que a
//   migration do lote criou: se ela faltasse, o bloco não apareceria; se o worker não relatasse, a tela diria "parado".
//   Contra o servidor local, onde o worker não roda, basta o bloco aparecer (ligado ou "ainda não começou").
// - O Gerente (teste) não vê o cartão (os erros são da rede inteira).
// - As entregas do projeto (do dono) mostram o lote QUAL-006a.
//
// O que esta prova NÃO faz: provocar um erro no site para ver o alerta chegar (ele iria para o celular do proprietário). A
// regra está provada em packages/banco/src/aviso-do-erro-do-servidor.test.ts, de ponta a ponta no worker
// (apps/worker/src/avisos/erros-do-site.test.ts) e, no banco da homologação, numa operação desfeita no fim
// (docs/aceite/QUAL-006a.md).
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, GERENTE_A, LOJA_A } from "./telas-reais";

/** Pelo domínio (https, com o Apache no caminho) ou contra o servidor local. */
const peloDominio = () => String(test.info().project.use.baseURL ?? "").startsWith("https://");

test.describe("o aviso no celular do erro do servidor no site no ar, só lendo (QUAL-006a)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o relato não sai pelo domínio; o dono vê o aviso ligado na Saúde da operação; o gerente não vê o cartão; as entregas mostram o lote", async ({ browser }) => {
    await comPessoas(browser, [[DONO, LOJA_A], [GERENTE_A]], async (p) => {
      const dono = p[DONO] as Page;
      const gerente = p[GERENTE_A] as Page;

      await test.step("pelo domínio, /saude/erros dá 404 (só responde dentro do servidor)", async () => {
        const resposta = await dono.request.get("/saude/erros", { maxRedirects: 0 });
        if (peloDominio()) {
          expect(resposta.status()).toBe(404);
        } else {
          expect(resposta.status()).toBe(200);
          expect(Object.keys(await resposta.json() as object).sort()).toEqual(["desde", "erros", "ultimo"]);
        }
      });

      await test.step("o dono vê, no cartão dos erros, o aviso no celular ligado", async () => {
        await dono.goto("/operacao");
        await expect(dono.getByRole("heading", { level: 1, name: "Saúde da operação", exact: true })).toBeVisible();
        await expect(dono.getByText("Erros do servidor", { exact: true })).toBeVisible();
        const ligado = dono.getByText(/Aviso no celular ligado: o worker dos avisos confere o site a cada minuto \(a última vez (agora há pouco|há \d+ min)\)/);
        await expect(peloDominio() ? ligado : ligado.or(dono.getByText("O aviso no celular dos erros ainda não começou"))).toBeVisible();
        await expect(dono.getByText("O aviso no celular dos erros está parado")).toHaveCount(0);
      });

      await test.step("o gerente não vê o cartão dos erros (são da rede inteira)", async () => {
        await gerente.goto("/operacao");
        await expect(gerente.getByRole("heading", { level: 1, name: "Saúde da operação", exact: true })).toBeVisible();
        await expect(gerente.getByText("Erros do servidor", { exact: true })).toHaveCount(0);
        await expect(gerente.getByText(/Aviso no celular/)).toHaveCount(0);
      });

      await test.step("as entregas do projeto (que são do dono) mostram o lote QUAL-006a", async () => {
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        await expect(lotes.filter({ has: dono.getByText("QUAL-006a", { exact: true }) })).toHaveCount(1);
      });
    });
  });
});
