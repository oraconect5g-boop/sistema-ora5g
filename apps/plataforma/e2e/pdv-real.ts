// As peças comuns das provas que gravam no site no ar, só na loja de teste (lotes J3-a a J3-c): a hora de Brasília para marcar
// o que a prova grava, um cartão da tela pelo título, o caixa (abrir, o dinheiro da gaveta, fechar sem diferença e a
// conferência por outra pessoa), a tela do PDV pronta, a venda que ficou aberta numa vez que falhou, a venda nova, um produto
// no carrinho e as formas de pagamento.
import { expect, type Locator, type Page } from "@playwright/test";

export const CAPA = { sku: "ACE-0001", nome: "Capa de proteção", preco: "R$ 79,00" };

/** A data e a hora de agora em Brasília ("2026-11-21 09:15"), para marcar o que a prova grava (a observação, o motivo). */
export const horaDeBrasilia = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 16);

/** Um IMEI de teste válido (o último dígito confere os outros 14, como o banco exige), diferente a cada vez. */
export function imeiDeTeste(agora = Date.now()): string {
  const corpo = `3520997${String(Math.floor(agora / 1000) % 10_000_000).padStart(7, "0")}`;
  const soma = [...corpo].reverse().reduce((total, digito, i) => {
    const n = Number(digito) * (i % 2 === 0 ? 2 : 1);
    return total + (n > 9 ? n - 9 : n);
  }, 0);
  return `${corpo}${(10 - (soma % 10)) % 10}`;
}

/** Um cartão da tela pelo título. */
export const cartao = (p: Page, titulo: string | RegExp) =>
  p.getByRole("heading", { level: 2, name: titulo, exact: typeof titulo === "string" }).locator("xpath=ancestor::section[1]");

/** A tela do caixa chega em partes: espera o caixa aberto ou o cartão de abrir. */
export async function abrirTelaDoCaixa(p: Page) {
  await p.goto("/caixa");
  await expect(p.getByRole("heading", { level: 2, name: /^(Abrir caixa|Meu caixa aberto)$/ })).toBeVisible();
}

/** O dinheiro que deve estar na gaveta, como o caixa aberto mostra ("Dinheiro"), em reais com vírgula. */
export async function dinheiroNaGaveta(p: Page): Promise<string> {
  const linha = cartao(p, "Meu caixa aberto").locator("dt", { hasText: /^Dinheiro$/ });
  await expect(linha).toBeVisible();
  const valor = (await linha.locator("xpath=following-sibling::dd[1]").innerText()).trim();
  const achado = /R\$\s*([\d.]+,\d{2})/.exec(valor);
  if (!achado) throw new Error(`o caixa não mostrou o dinheiro da gaveta: "${valor}"`);
  return achado[1] as string;
}

/** Abre o caixa (na tela do Caixa, já aberta e fechada) com o fundo de troco dado. */
export async function abrirCaixaCom(p: Page, troco: string) {
  const abrir = cartao(p, "Abrir caixa");
  await abrir.getByLabel("Fundo de troco (R$)").fill(troco);
  await abrir.getByRole("button", { name: "Abrir caixa" }).click();
  await expect(cartao(p, "Meu caixa aberto")).toBeVisible();
  expect(await dinheiroNaGaveta(p)).toBe(troco);
}

/** Fecha o caixa aberto contando o dinheiro esperado, com a observação dada; devolve o que foi contado. */
export async function fecharSemDiferenca(p: Page, observacao: string) {
  const contado = await dinheiroNaGaveta(p);
  const fechar = cartao(p, "Fechar caixa");
  await fechar.getByLabel("Dinheiro contado (R$)").fill(contado);
  await fechar.getByLabel("Observação").fill(observacao);
  await fechar.getByRole("button", { name: "Fechar caixa" }).click();
  await expect(p.getByText("Caixa fechado.")).toBeVisible();
  return contado;
}

/**
 * Outra pessoa confere, entre os caixas fechados, o que tem a observação dada (só os que a prova fechou: os de outras pessoas
 * ficam como estão) e confere que ficou sem diferença.
 */
export async function conferirCaixa(p: Page, observacao: string, nota: string) {
  await abrirTelaDoCaixa(p);
  const item = cartao(p, "Caixas fechados para conferir").getByRole("listitem").filter({ hasText: observacao });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("sem diferença");
  await item.getByLabel("Observação").fill(nota);
  await item.getByRole("button", { name: "Conferir" }).click();
  await expect(p.getByText("Caixa conferido.")).toBeVisible();
}

/** A tela do PDV chega em partes: espera o conteúdo (a venda aberta ou o botão de nova venda) antes de olhar o resto. */
export async function pdvPronto(p: Page) {
  await expect(p.getByRole("button", { name: "Nova venda" }).or(p.getByText(/Venda nº \d+/)).first()).toBeVisible();
}

/** Abre o PDV com o caixa aberto (abre com troco zero, se estiver fechado). */
export async function pdvComCaixaAberto(p: Page) {
  await p.goto("/vender");
  await pdvPronto(p);
  const abrir = p.getByRole("button", { name: "Abrir caixa" });
  if (await abrir.isVisible()) {
    await abrir.click();
    await expect(abrir).toBeHidden();
    await pdvPronto(p);
  }
  await expect(p.getByText("Abra o seu caixa")).toHaveCount(0);
}

/** A venda que ficou aberta numa vez que falhou é cancelada, com o motivo (os itens voltam ao estoque). */
export async function cancelarVendaAberta(p: Page, motivo: string) {
  const cancelar = p.locator("details").filter({ hasText: "Cancelar esta venda" });
  if (await cancelar.isVisible()) {
    await cancelar.locator("summary").click();
    await cancelar.getByLabel("Motivo").fill(motivo);
    await cancelar.getByRole("button", { name: "Cancelar venda" }).click();
    await expect(p.getByText("Venda cancelada.")).toBeVisible();
    await pdvPronto(p);
  }
}

/** Uma venda nova, com o carrinho vazio. */
export async function novaVenda(p: Page): Promise<Locator> {
  await p.getByRole("button", { name: "Nova venda" }).click();
  await expect(p.getByText(/Venda nº \d+/)).toBeVisible();
  const carrinho = cartao(p, "Carrinho");
  await expect(carrinho).toContainText("Busque um produto para começar.");
  return carrinho;
}

/** Acha o produto pelo SKU na busca do PDV e põe no carrinho a quantidade dada (um, se nada for dito). */
export async function porNoCarrinho(p: Page, produto: { sku: string; preco: string }, quantidade = 1) {
  await p.getByLabel(/Produto, marca, SKU/).fill(produto.sku);
  await p.getByRole("button", { name: "Buscar" }).click();
  const resultado = p.getByRole("listitem").filter({ hasText: produto.sku }).filter({ hasText: "livre(s) aqui" });
  await expect(resultado).toContainText(produto.preco);
  if (quantidade !== 1) await resultado.getByLabel("Qtd.").fill(String(quantidade));
  await resultado.getByRole("button", { name: "Adicionar" }).click();
}

export type Forma = { nome: string; valor: string; comprovante?: string };

/** Acrescenta cada forma de pagamento e preenche o valor (e o comprovante, quando a forma pede). */
export async function pagar(p: Page, formas: readonly Forma[]) {
  for (const [i, forma] of formas.entries()) {
    await p.getByRole("button", { name: "Adicionar forma de pagamento" }).click();
    await p.getByRole("group", { name: "Escolha a forma de pagamento" }).getByRole("button", { name: forma.nome, exact: true }).click();
    const linha = p.locator("fieldset").filter({ has: p.locator("legend", { hasText: `Pagamento ${i + 1} · ` }) });
    await expect(linha).toBeVisible();
    await linha.getByLabel(/^Valor/).fill(forma.valor);
    if (forma.comprovante) await linha.getByLabel(/^Comprovante/).fill(forma.comprovante);
  }
}

/** Conclui a venda e espera o comprovante; devolve o endereço dele. */
export async function concluir(p: Page): Promise<string> {
  await p.getByRole("button", { name: "Concluir venda" }).click();
  await expect(p).toHaveURL(/\/vendas\/[0-9a-f-]{36}\?concluida=1/);
  await expect(p.getByText("Estoque baixado e pagamento registrado no seu caixa.")).toBeVisible();
  return new URL(p.url()).pathname;
}
