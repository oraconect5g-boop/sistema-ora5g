// Lote J3-f (21/11/2026; ORA-FIN-003, ORA-FIN-004, ORA-FIN-005, ORA-PAY-002 e ORA-PAY-007; o sim do proprietário de 21/11
// às provas "Contas a pagar", "Conciliação de pagamento" e "A receber das financeiras"): o financeiro da loja de teste, no
// site no ar, num celular de 360 px, com duas pessoas.
//
// GRAVA de verdade, só na Santa Cândida (teste):
// - as contas a pagar: o Gerente (teste) lança uma conta fictícia de luz (R$ 100,00) e registra o pagamento, com uma
//   referência de teste; lança outra (R$ 50,00) e cancela, com o motivo;
// - a conciliação: o Vendedor (teste) vende uma capa no cartão da maquininha PicPay (R$ 79,00, comprovante de teste) e o
//   gerente concilia esse pagamento com um extrato fictício (líquido R$ 76,71: R$ 2,29 de taxa);
// - o repasse da financeira: o vendedor vende um Galaxy A15 (R$ 1.299,00) pela PayJoy (R$ 1.099,00 em 12 parcelas, contrato
//   de teste) com R$ 200,00 de entrada em dinheiro, e o gerente registra o repasse fictício da PayJoy (R$ 1.050,00: R$ 49,00
//   de taxa). Nenhum financiamento, cobrança ou repasse de verdade: a PayJoy não é chamada (a integração segue bloqueada).
// Cada vez vende um Galaxy A15 da loja de teste (havia 2 livres em 21/11). O caixa do vendedor fica aberto.
//
// O fechamento do bônus (a quarta prova aprovada) fica de fora: não há regra de bônus (ela vale para a rede inteira e é
// decisão do proprietário), e o fechamento só abre depois que o mês termina.
//
// Rode sozinho, sem as outras provas que gravam. Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts);
// no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { cancelarVendaAberta, CAPA, cartao, concluir, horaDeBrasilia, novaVenda, pagar, pdvComCaixaAberto, porNoCarrinho } from "./pdv-real";
import { comPessoas, disponivelNaLista, GERENTE_A, LOJA_A, VENDEDOR } from "./telas-reais";

const MARCA = "teste automático do financeiro";
const APARELHO = { sku: "APA-0001", nome: "Galaxy A15 128 GB Azul", preco: "R$ 1.299,00" };

/** A data de hoje em Brasília, como o campo de data pede ("2026-11-21"). */
const hoje = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10);

/** Lança uma conta a pagar na loja de teste; devolve o item dela na lista das abertas. */
async function lancarConta(g: Page, descricao: string, valor: string, categoria: string) {
  await g.goto("/contas-a-pagar");
  const lancar = cartao(g, "Lançar conta");
  const nova = lancar.locator("details").filter({ has: g.locator("summary", { hasText: "Nova conta a pagar" }) });
  if ((await nova.getAttribute("open")) === null) await nova.locator("summary").click();
  await nova.getByLabel("Onde fica a conta").selectOption({ label: LOJA_A });
  await nova.getByLabel("Categoria").selectOption({ label: categoria });
  await nova.getByLabel("Descrição").fill(descricao);
  await nova.getByLabel("Valor (R$)").fill(valor);
  await nova.getByLabel("Vencimento (o primeiro)").fill(hoje());
  await nova.getByRole("button", { name: "Lançar", exact: true }).click();
  await expect(g.getByText("Conta lançada.")).toBeVisible();
  const item = g.getByRole("listitem").filter({ hasText: descricao });
  await expect(item).toHaveCount(1);
  return item;
}

/** Põe no carrinho do PDV o primeiro aparelho livre do SKU dado (o botão "IMEI ..." da busca). */
async function porAparelhoNoCarrinho(p: Page, produto: { sku: string; preco: string }) {
  await p.getByLabel(/Produto, marca, SKU/).fill(produto.sku);
  await p.getByRole("button", { name: "Buscar" }).click();
  const resultado = p.getByRole("listitem").filter({ hasText: produto.sku }).filter({ hasText: "livre(s) aqui" });
  await expect(resultado).toContainText(produto.preco);
  await resultado.getByRole("button", { name: /^IMEI / }).first().click();
  await expect(cartao(p, "Carrinho")).toContainText(produto.preco);
}

test.describe("o financeiro da loja de teste (J3-f)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("contas a pagar, a conciliação do cartão com o extrato e o repasse da PayJoy", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(360_000);
    const vez = horaDeBrasilia();
    const numero = vez.replace(/\D/g, "");
    await comPessoas(browser, [[VENDEDOR], [GERENTE_A]], async (pessoas) => {
      const v = pessoas[VENDEDOR] as Page;
      const g = pessoas[GERENTE_A] as Page;

      await test.step("o gerente lança uma conta de luz fictícia e registra o pagamento", async () => {
        const conta = await lancarConta(g, `${MARCA}: conta de luz fictícia (${vez})`, "100,00", "Água, luz e internet");
        const marcarPaga = conta.locator("details").filter({ has: g.locator("summary", { hasText: "Marcar paga" }) });
        await marcarPaga.locator("summary").click();
        await marcarPaga.getByLabel("Pago em").fill(hoje());
        await marcarPaga.getByLabel("Valor pago (R$)").fill("100,00");
        await marcarPaga.getByLabel("Referência").fill(`COMPROVANTE-TESTE-${numero}`);
        await marcarPaga.getByRole("button", { name: "Registrar" }).click();
        await expect(g.getByText("Pagamento registrado.")).toBeVisible();
      });

      await test.step("lança outra conta e cancela, com o motivo", async () => {
        const conta = await lancarConta(g, `${MARCA}: conta lançada em dobro (${vez})`, "50,00", "Outras");
        const cancelar = conta.locator("details").filter({ has: g.locator("summary", { hasText: /^Cancelar$/ }) });
        await cancelar.locator("summary").click();
        await cancelar.getByLabel("Motivo").fill(`${MARCA}: lançada em dobro`);
        await cancelar.getByRole("button", { name: "Cancelar conta" }).click();
        await expect(g.getByText("Conta cancelada; o motivo ficou na auditoria.")).toBeVisible();
      });

      const nsu = `NSU-TESTE-${numero}`;
      await test.step("o vendedor vende uma capa no cartão da maquininha PicPay", async () => {
        expect(await disponivelNaLista(v, CAPA.sku), "a loja de teste precisa de uma capa livre").toBeGreaterThanOrEqual(1);
        await pdvComCaixaAberto(v);
        await cancelarVendaAberta(v, "teste automático: a venda anterior ficou incompleta");
        await novaVenda(v);
        await porNoCarrinho(v, CAPA);
        await pagar(v, [{ nome: "Cartão na maquininha PicPay", valor: "79,00", comprovante: nsu }]);
        await concluir(v);
      });

      await test.step("o gerente concilia o pagamento do cartão com o extrato fictício", async () => {
        await g.goto("/pagamentos/conciliacao");
        const pagamento = () => cartao(g, "Cartão e Pix do período").getByRole("listitem").filter({ hasText: `comprovante ${nsu}` });
        await expect(pagamento()).toContainText("R$ 79,00");
        await pagamento().getByLabel("Referência do extrato").fill(`EXTRATO-TESTE-${numero}`);
        await pagamento().getByLabel("Valor líquido (R$)").fill("76,71");
        await pagamento().getByLabel("Caiu em").fill(hoje());
        await pagamento().getByRole("button", { name: "Conciliar" }).click();
        await expect(g.getByText("Pagamento conciliado com o extrato.")).toBeVisible();
        await expect(pagamento()).toContainText("líquido R$ 76,71");
        await expect(pagamento()).toContainText("taxa R$ 2,29");
      });

      const venda = await test.step("o vendedor vende um Galaxy A15 pela PayJoy, com R$ 200,00 de entrada em dinheiro", async () => {
        await pdvComCaixaAberto(v);
        await cancelarVendaAberta(v, "teste automático: a venda anterior ficou incompleta");
        await novaVenda(v);
        await porAparelhoNoCarrinho(v, APARELHO);
        await v.getByRole("button", { name: "Adicionar forma de pagamento" }).click();
        await v.getByRole("group", { name: "Escolha a forma de pagamento" }).getByRole("button", { name: "Financiamento PayJoy", exact: true }).click();
        const payjoy = v.locator("fieldset").filter({ has: v.locator("legend", { hasText: "Pagamento 1 · " }) });
        await payjoy.getByLabel("Valor financiado (R$)").fill("1.099,00");
        await payjoy.getByLabel(/^Parcelas \(1 a 48\)/).fill("12");
        await payjoy.getByLabel("Nº do contrato (opcional)").fill(`PAYJOY-TESTE-${numero}`);
        await v.getByRole("button", { name: "Adicionar forma de pagamento" }).click();
        await v.getByRole("group", { name: "Escolha a forma de pagamento" }).getByRole("button", { name: "Dinheiro", exact: true }).click();
        const entrada = v.locator("fieldset").filter({ has: v.locator("legend", { hasText: "Pagamento 2 · " }) });
        await entrada.getByLabel(/^Valor/).fill("200,00");
        await entrada.getByLabel("É a entrada da PayJoy ou da Aiva").check();
        const endereco = await concluir(v);
        const titulo = await v.getByRole("heading", { level: 2, name: /^Venda nº \d+$/ }).innerText();
        return { endereco, numero: (/\d+/.exec(titulo) as RegExpExecArray)[0] };
      });

      await test.step("o gerente registra o repasse fictício da PayJoy", async () => {
        await g.goto("/pagamentos/financeiras");
        const conta = () => cartao(g, "Contas").getByRole("listitem").filter({ has: g.getByRole("link", { name: `Venda nº ${venda.numero}`, exact: true }) });
        await expect(conta()).toContainText("a receber R$ 1.099,00");
        await conta().getByLabel("Referência do repasse").fill(`REPASSE-TESTE-${numero}`);
        await conta().getByLabel("Valor que caiu (R$)").fill("1.050,00");
        await conta().getByLabel("Caiu em").fill(hoje());
        await conta().getByRole("button", { name: "Registrar repasse" }).click();
        await expect(g.getByText("Repasse registrado. A diferença para o valor a receber fica como a taxa da financeira.")).toBeVisible();
        await expect(conta()).toContainText("recebido R$ 1.050,00");
        await expect(conta()).toContainText("taxa R$ 49,00");
      });
    });
  });
});
