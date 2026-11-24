// Lote FIN-002a (24/11/2026; ORA-FIN-002: "DRE/margem gerencial com custo, taxa e desconto"): a taxa observada da PayJoy e
// da Aiva no resultado do mês, no site no ar, num celular de 360 px, com as contas de teste. SÓ LÊ: só abre telas e baixa a
// planilha (nenhum formulário é enviado).
//
// - O Dono (teste) abre Gestão → Resultado do mês, em novembro de 2026, e escolhe a Santa Cândida (teste). Lá há uma venda
//   financiada pela PayJoy (a nº 23, de 21/11: R$ 1.099,00 financiados) com o repasse registrado (R$ 1.050,00): o
//   demonstrativo mostra a linha "Taxas da PayJoy e da Aiva" com os R$ 49,00 que a financeira não repassou, separada da
//   linha das taxas de cartão e Pix. A planilha (CSV) do mesmo mês e da mesma loja traz a mesma linha.
// - Na rede inteira, a linha também aparece (o valor depende das lojas da rede).
// - O Gerente (teste) não vê o resultado (é só do dono).
// - As entregas do projeto (do dono) mostram o lote FIN-002a.
//
// Os números vêm do banco do site (public.resultado_do_mes, refeita pela migration do lote). Se o repasse da venda nº 23
// for desfeito ou mudado na tela das financeiras, o valor desta prova muda junto.
//
// Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { comPessoas, DONO, GERENTE_A, LOJA_A } from "./telas-reais";

const LINHA = "Taxas da PayJoy e da Aiva";
const degrau = (pagina: Page, rotulo: string) =>
  pagina.getByRole("list", { name: "Demonstrativo do resultado do mês" }).getByRole("listitem").filter({ has: pagina.getByText(rotulo, { exact: true }) });

test.describe("a taxa das financeiras no resultado do mês, no site no ar, só lendo (FIN-002a)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o dono vê a taxa da PayJoy na Santa Cândida (teste), na tela e na planilha; o gerente não vê o resultado; as entregas mostram o lote", async ({ browser }) => {
    await comPessoas(browser, [[DONO, LOJA_A], [GERENTE_A]], async (p) => {
      const dono = p[DONO] as Page;
      const gerente = p[GERENTE_A] as Page;

      await test.step("o resultado de novembro de 2026, na rede inteira: a linha das financeiras, separada da de cartão e Pix", async () => {
        await dono.goto("/resultado?mes=2026-11");
        await expect(dono.getByRole("heading", { level: 1, name: "Resultado do mês", exact: true })).toBeVisible();
        await expect(degrau(dono, "Taxas de cartão e Pix")).toHaveCount(1);
        await expect(degrau(dono, LINHA)).toHaveCount(1);
        await expect(dono.getByText("Taxas da PayJoy e da Aiva: a diferença entre o valor financiado e o que a financeira repassou", { exact: false })).toBeAttached();
      });

      await test.step(`na ${LOJA_A}: os R$ 49,00 da venda nº 23 (PayJoy), com o repasse registrado`, async () => {
        await dono.getByRole("navigation", { name: "Onde" }).getByRole("link", { name: LOJA_A, exact: true }).click();
        await expect(dono).toHaveURL(/[?&]loja=[0-9a-f-]{36}/);
        await expect(dono.getByText(LOJA_A, { exact: true }).first()).toBeVisible();
        const linha = degrau(dono, LINHA);
        await expect(linha).toContainText("−R$ 49,00");
        await expect(linha).toContainText("1 repasse registrado");
      });

      await test.step("a planilha (CSV) do mesmo mês e da mesma loja traz a mesma linha", async () => {
        const loja = new URL(dono.url()).searchParams.get("loja") as string;
        const resposta = await dono.request.get(`/resultado/exportar?mes=2026-11&loja=${loja}&formato=csv`);
        expect(resposta.status()).toBe(200);
        const csv = await resposta.text();
        expect(csv).toContain("Taxas da PayJoy e da Aiva (observadas no repasse);49,00");
        expect(csv).toContain("Taxa da PayJoy e da Aiva;a observada no repasse;");
        expect(csv).not.toContain("falta o contrato");
      });

      await test.step("o gerente não vê o resultado do mês", async () => {
        await gerente.goto("/resultado?mes=2026-11");
        await expect(gerente.getByText("O resultado do mês é só do dono")).toBeVisible();
        await expect(gerente.getByText(LINHA)).toHaveCount(0);
      });

      await test.step("as entregas do projeto (que são do dono) mostram o lote FIN-002a", async () => {
        await dono.goto("/entregas");
        await expect(dono.getByRole("heading", { level: 1, name: "Entregas do projeto", exact: true })).toBeVisible();
        const lotes = dono.getByRole("listitem").filter({ has: dono.getByRole("link", { name: "Ver o roteiro de aceite" }) });
        await expect(lotes.filter({ has: dono.getByText("FIN-002a", { exact: true }) })).toHaveCount(1);
      });
    });
  });
});
