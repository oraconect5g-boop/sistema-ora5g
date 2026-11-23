// Lotes TRF-d e AUD-d (23/11/2026; ORA-INV-007; o achado F21-04 da auditoria integral do Codex de 21/11, PR #105): a tela
// de Transferências no site no ar, num celular de 360 px, com as contas de teste. SÓ LÊ: só abre telas (nenhum formulário é
// enviado, nenhuma transferência é pedida, recebida nem resolvida).
//
// - A tela lê a função que a migration do TRF-d refez (transferencias_tela, com as resoluções do que faltou): se ela
//   faltasse ou viesse com outro formato no banco do site, a tela cairia no erro do serviço.
// - As duas transferências de teste que saíram para a Muffato Santa em 17/11 (nº 1, uma capa; nº 2, um Galaxy A15) foram
//   regularizadas em 23/11, com o sim do proprietário (lote AUD-d): recebidas com zero na Muffato Santa e devolvidas à
//   Santa Cândida (teste) como "voltou para a origem". A prova confere isso dos dois lados: na loja de teste (a origem) e
//   na Muffato Santa (o destino), onde não sobra nenhuma chegada a receber.
// - O Gerente 2 (teste) abre a tela na Loja de teste 2, e as entregas do projeto mostram os lotes TRF-d e AUD-d.
//
// O que esta prova NÃO faz: receber com divergência e resolver no site. Isso grava e pede o sim do proprietário. A regra do
// banco está provada em packages/banco/src/transferencia-divergencia*.test.ts.
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, GERENTE_B, LOJA_A } from "./telas-reais";

const MUFFATO = "Muffato Santa";

async function abrirTransferencias(pagina: Page) {
  await pagina.goto("/transferencias");
  await expect(pagina.getByRole("heading", { level: 1, name: "Transferências", exact: true })).toBeVisible();
}
/** O cartão da transferência de uma unidade com esse número (sozinha ou dentro de uma remessa). */
const cartao = (pagina: Page, numero: number): Locator =>
  pagina.locator("section").filter({ has: pagina.getByRole("heading", { name: new RegExp(`(^|· )Nº ${numero} · .+ × 1$`) }) });
/** A transferência regularizada: recebida com divergência, o que faltou voltou para a origem e não há mais o que fazer. */
async function confereRegularizada(pagina: Page, numero: number) {
  const c = cartao(pagina, numero);
  await expect(c).toBeVisible();
  await expect(c.getByText(`${LOJA_A} → ${MUFFATO}`, { exact: false }).first()).toBeVisible();
  await expect(c.getByText("Recebida com divergência", { exact: true })).toBeVisible();
  await expect(c.getByText("Faltou 1: 1 voltou para a origem.")).toBeVisible();
  for (const botao of ["Receber e conferir", "Dar a entrada de volta", "Dar a entrada do que chegou", "Confirmar a baixa"]) {
    await expect(c.getByRole("button", { name: botao })).toHaveCount(0);
  }
}

test.describe("a tela de Transferências no site no ar, só lendo (TRF-d e AUD-d)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("a tela abre com a leitura nova; as duas transferências de teste da Muffato Santa estão regularizadas; as entregas mostram os lotes", async ({ browser }) => {
    await comPessoas(browser, [[DONO, LOJA_A], [GERENTE_B]], async (p) => {
      const dono = p[DONO] as Page;
      const gerente = p[GERENTE_B] as Page;

      await test.step("na Santa Cândida (teste), a origem: as nº 1 e nº 2 voltaram para a origem", async () => {
        await abrirTransferencias(dono);
        for (const numero of [1, 2]) await confereRegularizada(dono, numero);
      });

      await test.step("o gerente da Loja de teste 2 abre a tela dele", async () => {
        await abrirTransferencias(gerente);
        await expect(gerente.getByText("Pedir vários produtos de uma vez (nova remessa)")).toBeVisible();
      });

      await test.step("as entregas do projeto mostram os lotes TRF-d e AUD-d", async () => {
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        for (const lote of ["TRF-d", "AUD-d"]) await expect(lotes.filter({ has: dono.getByText(lote, { exact: true }) })).toHaveCount(1);
      });
    });

    // O outro lado: a Muffato Santa, uma loja de verdade. Só leitura, com o Dono (teste).
    await comPessoas(browser, [[DONO, MUFFATO]], async (p) => {
      const dono = p[DONO] as Page;
      await test.step("na Muffato Santa, o destino: as duas aparecem recebidas com zero, e não sobra chegada a receber", async () => {
        await abrirTransferencias(dono);
        await expect(dono.getByText(MUFFATO, { exact: true }).first()).toBeVisible();
        for (const numero of [1, 2]) await confereRegularizada(dono, numero);
        await expect(dono.getByRole("button", { name: "Receber e conferir" })).toHaveCount(0);
      });
    });
  });
});
