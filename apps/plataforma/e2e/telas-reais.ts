// As peças comuns das provas que leem as telas no site no ar com as contas de teste (lotes J2-a e J2-b): as lojas e as
// contas de teste, abrir um celular por pessoa (e sair de todas no fim), os filtros, o resumo do período, as tabelas dos
// gráficos e o disponível da lista do Estoque. Só leem.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { contaDeTeste, entrar } from "./contas-de-teste";

export const LOJA_A = "Santa Cândida (teste)";
export const LOJA_B = "Loja de teste 2";
export const CAPA = { sku: "ACE-0001", nome: "Capa de proteção" };
export const GERENTE_A = "Gerente (teste)";
export const GERENTE_B = "Gerente 2 (teste)";
export const VENDEDOR = "Vendedor (teste)";
export const ADMINISTRADOR = "Administrador (teste)";
/** O papel de dono na rede inteira (criada em 21/11, com o sim do proprietário): entra escolhendo a loja. */
export const DONO = "Dono (teste)";

export type Pessoas = Record<string, Page>;

/**
 * Abre um celular para cada conta, já na loja (a do arquivo, ou a dada); no fim, sai de todas e fecha.
 *
 * Sem a pré-carga do menu: cada tela aberta pré-carrega as telas do menu (até 17), e cada pré-carga lê a sessão no banco. Em
 * 19/11, abrir umas 20 telas em um minuto com quatro pessoas deu 702 pedidos ao Supabase de teste (o plano Micro), que parou
 * por dois minutos (até 17 s por pedido e 6 erros 500). O navegador do teste recusa só os pedidos de pré-carga
 * (Next-Router-Prefetch); a tela é a mesma, e o clique busca o que a pré-carga traria.
 */
export async function comPessoas(browser: Browser, contas: readonly (readonly [string, string?])[], corpo: (p: Pessoas) => Promise<void>) {
  const contextos: BrowserContext[] = [];
  const pessoas: Pessoas = {};
  try {
    for (const [nome, loja] of contas) {
      const contexto = await browser.newContext({ ...test.info().project.use });
      await contexto.route("**/*", (rota) => (rota.request().headers()["next-router-prefetch"] ? rota.abort() : rota.continue()));
      contextos.push(contexto);
      const pagina = await contexto.newPage();
      await test.step(`${nome} entra${loja ? ` na ${loja}` : ""}`, () => entrar(pagina, contaDeTeste(nome), loja));
      pessoas[nome] = pagina;
    }
    await corpo(pessoas);
  } finally {
    // O /sair encerra as sessões da conta: nada fica aberto depois da prova.
    for (const pagina of Object.values(pessoas)) await pagina.goto("/sair").catch(() => undefined);
    for (const contexto of contextos) await contexto.close();
  }
}

/** O número inteiro do começo de um texto ("1.234 vendas" → 1234). */
export function inteiro(texto: string): number {
  const achado = /^\s*([\d.]+)/.exec(texto);
  if (!achado) throw new Error(`sem número em "${texto}"`);
  return Number((achado[1] as string).replace(/\./g, ""));
}

/** Escolhe a opção de um filtro da tela (Período ou Loja) e espera a tela mudar. */
export async function escolher(pagina: Page, filtro: string, opcao: string) {
  const link = pagina.getByRole("navigation", { name: filtro, exact: true }).getByRole("link", { name: opcao, exact: true });
  if ((await link.getAttribute("aria-current")) !== "true") {
    await link.click();
    await expect(link).toHaveAttribute("aria-current", "true");
  }
}

/** Um indicador do resumo do período (Início, Relatórios e Financeiro): o valor e o detalhe, como a tela mostra. */
export async function indicador(pagina: Page, rotulo: string) {
  const cartao = pagina.getByRole("region", { name: "Resumo do período" }).locator(":scope > div")
    .filter({ has: pagina.getByText(rotulo, { exact: true }) });
  await expect(cartao).toHaveCount(1);
  const textos = cartao.locator("p");
  return { valor: (await textos.nth(1).innerText()).trim(), detalhe: (await textos.last().innerText()).trim() };
}

/** O resumo das vendas como a tela mostra: a quantidade, o vendido, os descontos e o devolvido ou cancelado. */
export async function resumoDasVendas(pagina: Page, rotuloDasVendas = "Vendas realizadas") {
  const vendas = await indicador(pagina, rotuloDasVendas);
  return {
    vendas: inteiro(vendas.valor),
    // "R$ 237 vendidos", sem o aviso da comparação que pode vir depois do " · ".
    vendido: vendas.detalhe.split(" · ")[0],
    descontos: (await indicador(pagina, "Descontos concedidos")).valor,
    desfeito: (await indicador(pagina, "Devoluções e cancelamentos")).valor,
  };
}

/** A tabela de um cartão (o "Ver dados em tabela"), linha a linha: a primeira coluna e as outras. */
export async function tabelaDoCartao(pagina: Page, titulo: string, resumo: string | RegExp = "Ver dados em tabela") {
  const cartao = pagina.getByRole("heading", { level: 2, name: titulo, exact: true }).locator("xpath=ancestor::section[1]");
  const detalhes = cartao.locator("details").filter({ has: pagina.locator("summary").filter({ hasText: resumo }) });
  await detalhes.locator("summary").click();
  await expect(detalhes.locator("tbody tr").first()).toBeVisible();
  const linhas = new Map<string, string[]>();
  for (const tr of await detalhes.locator("tbody tr").all()) {
    const [primeira, ...outras] = (await tr.locator("td").allInnerTexts()).map((c) => c.trim());
    linhas.set(primeira as string, outras);
  }
  return linhas;
}

/** O Início no período (e, para quem vê a rede, na loja do filtro), já com os painéis na tela. */
export async function abrirInicio(pagina: Page, periodo: "Hoje" | "7 dias" | "30 dias", loja?: string) {
  await pagina.goto("/inicio");
  await expect(pagina.getByRole("heading", { level: 2, name: /^(Acompanhamento das vendas|Meus resultados)$/ })).toBeVisible();
  await escolher(pagina, "Período", periodo);
  if (loja) await escolher(pagina, "Loja", loja);
}

/** O disponível do produto na lista do Estoque da loja do turno (o número antes do "na rede"). */
export async function disponivelNaLista(pagina: Page, sku: string): Promise<number> {
  await pagina.goto(`/estoque?q=${sku}`);
  const linha = pagina.getByRole("listitem").filter({ hasText: sku }).filter({ hasText: "na rede" }).first();
  await expect(linha).toBeVisible();
  const achado = /(\d+)\s*na rede/.exec(await linha.innerText());
  if (!achado) throw new Error(`a linha de ${sku} no Estoque não mostrou o disponível`);
  return Number(achado[1]);
}
