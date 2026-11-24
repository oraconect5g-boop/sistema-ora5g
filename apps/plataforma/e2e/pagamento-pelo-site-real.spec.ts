// Lote PAY-014a (24/11/2026; ORA-PAY-014 e ORA-ONLINE-002: o pagamento pelo site com Pix pela Asaas), no site no ar, num
// celular de 360 px. SÓ LÊ: o pagamento pelo site está DESLIGADO (sem a chave da Asaas e sem o worker agendado); nenhum
// pedido é feito, nada é guardado.
//
// - O aviso da Asaas (/api/pagamentos/asaas) recusa sem o token (401) e com um token fictício (401: o banco não confere;
//   sem o segredo do aviso, nenhum token passa). O evento é fictício, no formato da documentação oficial.
// - "Meu pedido" com ?codigo= (a volta da página de pagamento da Asaas) abre com o código preenchido; código estranho, vazio.
// - Na loja de teste, o Gerente (teste) abre "Reservas do site" sem erro (a tela lê o Pix dos pedidos, que não há).
// - As entregas do projeto (do dono, com a conta Dono (teste)) mostram o lote PAY-014a.
//
// O Pix na página do pedido (pagar, esperar o link, pago) está provado em src/app/loja/carrinho/pagamento.test.ts e
// carrinho.test.ts; o caminho inteiro, com o banco de teste e uma Asaas de mentira, em
// apps/worker/src/pagamentos/ponta-a-ponta.test.ts. O ensaio com a Asaas de verdade espera a chave de teste (sandbox).
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, GERENTE_A, LOJA_A } from "./telas-reais";

// Um evento fictício no formato da documentação da Asaas (o id do evento traz "&", como no exemplo oficial).
const EVENTO = {
  id: "evt_prova_do_pay014a_000000000000&000000001", event: "PAYMENT_RECEIVED", dateCreated: "2026-11-24 12:00:00",
  payment: { object: "payment", id: "pay_000000000001", paymentLink: "000000000001", value: 1, billingType: "PIX", status: "RECEIVED" },
};

test.describe("o pagamento pelo site, desligado, no site no ar (PAY-014a)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o aviso recusa sem o token certo; a volta da Asaas preenche o código; a loja abre as reservas; as entregas mostram o lote", async ({ browser }) => {
    const base = String(test.info().project.use.baseURL ?? "");
    const contexto = await browser.newContext({ baseURL: base, viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
    try {
      const visitante = await contexto.newPage();

      await test.step("o aviso da Asaas: sem o token, 401; com um token fictício, 401 (o banco não confere)", async () => {
        const semToken = await visitante.request.post("/api/pagamentos/asaas", { data: EVENTO });
        expect(semToken.status()).toBe(401);
        const comToken = await visitante.request.post("/api/pagamentos/asaas", {
          data: EVENTO, headers: { "asaas-access-token": "token-ficticio-da-prova-do-pay014a-0000000000000000" },
        });
        expect(comToken.status()).toBe(401);
        expect(await comToken.json()).toEqual({ erro: "token" });
      });

      await test.step("\"Meu pedido\" com ?codigo= abre com o código preenchido; código estranho, vazio", async () => {
        await visitante.goto("/loja/pedido?codigo=abc234");
        await expect(visitante.getByRole("heading", { level: 1, name: "Meu pedido", exact: true })).toBeVisible();
        await expect(visitante.getByLabel("Código do pedido")).toHaveValue("ABC234");
        await expect(visitante.getByLabel("WhatsApp do pedido, com DDD")).toHaveValue("");
        await visitante.goto("/loja/pedido?codigo=1");
        await expect(visitante.getByLabel("Código do pedido")).toHaveValue("");
        expect(await visitante.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      });
    } finally {
      await contexto.close();
    }

    await comPessoas(browser, [[GERENTE_A, LOJA_A], [DONO, LOJA_A]], async (p) => {
      const gerente = p[GERENTE_A] as Page;
      await gerente.goto("/reservas-do-site");
      await expect(gerente.getByRole("heading", { level: 1, name: "Reservas do site", exact: true })).toBeVisible();
      await expect(gerente.getByText("Não deu para concluir agora")).toHaveCount(0);

      const dono = p[DONO] as Page;
      await dono.goto("/entregas");
      await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
      const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
      await expect(lotes.filter({ has: dono.getByText("PAY-014a", { exact: true }) })).toHaveCount(1);
    });
  });
});
