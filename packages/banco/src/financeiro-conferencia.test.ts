// Lote FIN-001a (ORA-FIN-001; a ordem recomendada da auditoria do Codex de 21/11/2026, item 6): public.financeiro_conferencia,
// a conta que diz se as vendas concluídas no período fecham com os pagamentos, com o livro do caixa e com o livro do estoque,
// venda a venda. Banco em memória com todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  // A recarga (serviço, sem estoque) ganha preço para entrar numa venda: ela fica fora da conferência do estoque.
  await db.query(
    "insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem) values ($1, $2, null, 4990, now() - interval '1 day', 'manual')",
    [ids.organizacao, cat.recarga]);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = (prefixo: string) => `${prefixo}:${++chaves}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `6f000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return v;
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      throw new Error(`${sql.slice(0, 70)} → ${(e as Error).message} (${(e as { code?: string }).code})`, { cause: e });
    }
  });
const erroDe = (s: Sessao, sql: string, params: unknown[]) =>
  comoUsuario(db, s, async () => {
    await db.exec("savepoint tentativa");
    try {
      await db.query(sql, params);
      await db.exec("release savepoint tentativa");
      return null;
    } catch (e) {
      await db.exec("rollback to savepoint tentativa");
      await db.exec("release savepoint tentativa");
      return (e as { code?: string }).code ?? "sem-codigo";
    }
  });

const abrirCaixa = (s: Sessao, fundo = 10_000) => valor<string>(s, "select public.abrir_caixa($1, $2) as v", [fundo, chave("caixa")]);
const novaVenda = (s: Sessao) => valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
const adicionar = (s: Sessao, venda: string, variante: string, item: string | null, quantidade = 1) =>
  valor<string>(s, "select public.adicionar_item($1, $2, $3, $4, $5) as v", [venda, variante, item, quantidade, chave("item")]);
const concluir = (s: Sessao, venda: string, pagamentos: object[], cliente: object = {}) =>
  valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v", [venda, JSON.stringify(pagamentos), JSON.stringify(cliente), chave("concluir")]);
const devolver = (s: Sessao, venda: string, itensDevolvidos: object[], reembolsos: object[]) =>
  valor(s, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, $4, $5) as v", [venda, JSON.stringify(itensDevolvidos), JSON.stringify(reembolsos), "Cliente desistiu", chave("dev")]);
const cancelar = (s: Sessao, venda: string) => valor<boolean>(s, "select public.cancelar_venda($1, 'Cliente desistiu da compra') as v", [venda]);

type Exemplo = { id: string; numero: number };
type Conferencia = {
  vendas: number; vendido: number;
  pagamentos: { recebido_na_loja: number; financiado: number; vale_troca: number; desfeitos: number; diferenca: number; vendas_com_diferenca: number; exemplos: Exemplo[] };
  caixa: { esperado: number; no_livro: number; diferenca: number; vendas_com_diferenca: number; exemplos: Exemplo[] };
  estoque: { unidades: number; no_livro: number; diferenca: number; vendas_com_diferenca: number; exemplos: Exemplo[] };
};
// Janela em volta de "agora" (as vendas do teste são gravadas com now()); o máximo é 400 dias.
const INICIO = new Date(Date.now() - 2 * 86_400_000).toISOString();
const FIM = new Date(Date.now() + 2 * 86_400_000).toISOString();
const CONFERIR = "select public.financeiro_conferencia($1, $2, $3) as v";
const conferir = (s: Sessao, unidade: string | null = null, inicio = INICIO, fim = FIM) => valor<Conferencia>(s, CONFERIR, [inicio, fim, unidade]);
const numeroDe = async (venda: string) => Number((await db.query<{ numero: string }>("select numero from public.vendas where id = $1", [venda])).rows[0]?.numero);

/**
 * O dia da loja A, pelo vendedor: uma capa em dinheiro com troco; duas capas em Pix na maquininha e dinheiro; um aparelho
 * financiado com a entrada em dinheiro; uma recarga (serviço, sem estoque) no Pix; e uma capa no Pix cancelada depois.
 * A gerência devolve uma das duas capas (o reembolso e a volta ao estoque não entram nesta conferência).
 */
async function diaDaLojaA() {
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  await abrirCaixa(ana, 10_000);
  const v1 = await novaVenda(ana);
  await adicionar(ana, v1, cat.capa, null);
  await concluir(ana, v1, [{ meio: "dinheiro", valor: 10_000 }]);
  const v2 = await novaVenda(ana);
  const itemV2 = await adicionar(ana, v2, cat.capa, null, 2);
  await concluir(ana, v2, [{ meio: "pix_picpay", valor: 5_800, comprovante: "123456" }, { meio: "dinheiro", valor: 10_000 }]);
  const v3 = await novaVenda(ana);
  await adicionar(ana, v3, cat.aparelho, itens.a1);
  await concluir(ana, v3, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: "dinheiro", parcelas: 12 }], { nome: "Cliente Teste", email: "cliente@teste.invalid" });
  const v4 = await novaVenda(ana);
  await adicionar(ana, v4, cat.recarga, null);
  await concluir(ana, v4, [{ meio: "pix_direto", valor: 4_990, comprovante: "PIX-RECARGA" }]);
  const v5 = await novaVenda(ana);
  await adicionar(ana, v5, cat.capa, null);
  await concluir(ana, v5, [{ meio: "pix_direto", valor: 7_900, comprovante: "PIX-CANCELADA" }]);
  const dono = await naLoja(ids.dono, ids.lojaA);
  await abrirCaixa(dono, 10_000);
  await devolver(dono, v2, [{ item: itemV2, quantidade: 1, condicao: "novo" }], [{ meio: "dinheiro", valor: 7_900 }]);
  await cancelar(dono, v5);
  return { ana, dono, v1, v2, v3, v4, v5 };
}
const VENDIDO = 7_900 + 15_800 + 149_900 + 4_990 + 7_900;
const FECHA = { diferenca: 0, vendas_com_diferenca: 0, exemplos: [] };

describe("financeiro_conferencia: a conta do período fecha, venda a venda (FIN-001a)", () => {
  it("vendas com troco, pagamento misto, financiamento com entrada, serviço e venda cancelada depois: os três lados fecham", async () => {
    const { dono } = await diaDaLojaA();
    const c = await conferir(dono, ids.lojaA);
    expect(c.vendas).toBe(5);
    expect(c.vendido).toBe(VENDIDO);
    // O dinheiro com o troco descontado, os dois Pix que seguem confirmados e a entrada do financiamento; a financeira
    // deve o resto do aparelho; o Pix da venda cancelada depois aparece como desfeito. A soma é o vendido.
    expect(c.pagamentos).toEqual({
      recebido_na_loja: (10_000 - 2_100) + (5_800 + 10_000) + 20_000 + 4_990, financiado: 129_900, vale_troca: 0, desfeitos: 7_900, ...FECHA });
    expect(c.pagamentos.recebido_na_loja + c.pagamentos.financiado + c.pagamentos.vale_troca + c.pagamentos.desfeitos).toBe(c.vendido);
    // No livro do caixa: tudo o que entrou na loja por essas vendas, com o troco que saiu (o estorno da cancelada é outro lançamento).
    const noCaixa = (10_000 - 2_100) + 15_800 + 20_000 + 4_990 + 7_900;
    expect(c.caixa).toEqual({ esperado: noCaixa, no_livro: noCaixa, ...FECHA });
    // No livro do estoque: 1 + 2 capas, o aparelho e a capa da venda cancelada depois (a volta dela é outro lançamento).
    // A recarga é serviço e fica fora.
    expect(c.estoque).toEqual({ unidades: 5, no_livro: 5, ...FECHA });
  });

  it("vale-troca, a entrada do financiamento como lançamento à parte, cartão parcelado e venda em dinheiro com troco cancelada depois: fecha; o gerente da loja lê a mesma conta", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana, 10_000);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono, 200_000);
    // W1: uma capa em dinheiro, devolvida depois em vale-troca (o vale nasce da devolução; o pagamento dela segue confirmado).
    const w1 = await novaVenda(ana);
    const capaW1 = await adicionar(ana, w1, cat.capa, null);
    await concluir(ana, w1, [{ meio: "dinheiro", valor: 7_900 }], { nome: "Cliente Fictício" });
    const troca = (await devolver(dono, w1, [{ item: capaW1, quantidade: 1, condicao: "novo" }], [{ meio: "vale_troca", valor: 7_900 }])) as { vale: number };
    // W2: duas capas pagas com o vale e o resto no cartão, em 2 vezes.
    const w2 = await novaVenda(ana);
    await adicionar(ana, w2, cat.capa, null, 2);
    await concluir(ana, w2, [{ meio: "vale_troca", valor: 7_900, comprovante: `VT-${troca.vale}` }, { meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-0001", parcelas: 2 }]);
    // W3: o aparelho pela Aiva, com a entrada como um lançamento à parte, em dinheiro (a forma nova, do PDV-c).
    const w3 = await novaVenda(ana);
    await adicionar(ana, w3, cat.aparelho, itens.a1);
    await concluir(ana, w3, [{ meio: "aiva", valor: 119_900, parcelas: 10 }, { meio: "dinheiro", valor: 30_000, entrada_do_financiamento: true }],
      { nome: "Cliente Teste", email: "cliente@teste.invalid" });
    // W4: uma capa em dinheiro com troco, cancelada depois: o dinheiro e o troco dela viram o desfeito (o total da venda).
    const w4 = await novaVenda(ana);
    await adicionar(ana, w4, cat.capa, null);
    await concluir(ana, w4, [{ meio: "dinheiro", valor: 10_000 }]);
    await cancelar(dono, w4);

    const c = await conferir(dono, ids.lojaA);
    expect(c.vendas).toBe(4);
    expect(c.vendido).toBe(7_900 + 15_800 + 149_900 + 7_900);
    expect(c.pagamentos).toEqual({ recebido_na_loja: 7_900 + 7_900 + 30_000, financiado: 119_900, vale_troca: 7_900, desfeitos: 10_000 - 2_100, ...FECHA });
    expect(c.pagamentos.recebido_na_loja + c.pagamentos.financiado + c.pagamentos.vale_troca + c.pagamentos.desfeitos).toBe(c.vendido);
    // No livro do caixa, o vale-troca também é um lançamento da venda (não é dinheiro; o fechamento da gaveta conta só o dinheiro).
    const noCaixa = 7_900 + (7_900 + 7_900) + 30_000 + (10_000 - 2_100);
    expect(c.caixa).toEqual({ esperado: noCaixa, no_livro: noCaixa, ...FECHA });
    expect(c.estoque).toEqual({ unidades: 5, no_livro: 5, ...FECHA });

    // Uma venda na loja B (quem vende nas duas lojas, com a loja B no turno): o gerente da loja B, com a loja escolhida,
    // confere a loja dele, com ou sem dizer a loja; o dono e o administrador, sem dizer a loja, somam as duas.
    const bia = await naLoja(ids.vendedorAB, ids.lojaB);
    await abrirCaixa(bia, 10_000);
    const w5 = await novaVenda(bia);
    await adicionar(bia, w5, cat.capa, null);
    await concluir(bia, w5, [{ meio: "pix_direto", valor: 7_900, comprovante: "PIX-LOJA-B" }]);
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    const daLojaB = await conferir(gerenteB, ids.lojaB);
    expect(daLojaB).toEqual({
      vendas: 1, vendido: 7_900, pagamentos: { recebido_na_loja: 7_900, financiado: 0, vale_troca: 0, desfeitos: 0, ...FECHA },
      caixa: { esperado: 7_900, no_livro: 7_900, ...FECHA }, estoque: { unidades: 1, no_livro: 1, ...FECHA } });
    expect(await conferir(gerenteB, null)).toEqual(daLojaB);
    expect(await conferir(dono, ids.lojaA)).toEqual(c); // a venda da loja B não entra na conta da loja A
    const daRede = await conferir(dono, null);
    expect(daRede).toMatchObject({ vendas: 5, vendido: c.vendido + 7_900, caixa: { esperado: noCaixa + 7_900, no_livro: noCaixa + 7_900 }, estoque: { unidades: 6, no_livro: 6 } });
    expect(await conferir(await naLoja(ids.administrador, ids.lojaA), null)).toEqual(daRede);
  });

  it("acusa a baixa de estoque em dobro e diz em qual venda", async () => {
    const { dono, v1 } = await diaDaLojaA();
    await db.query("select privado.lancar_movimento($1, $2, -1, 'venda', null, null, 'venda', $3, 'defeito:baixa-em-dobro')", [ids.lojaA, cat.capa, v1]);
    const c = await conferir(dono, ids.lojaA);
    expect(c.estoque).toEqual({ unidades: 5, no_livro: 6, diferenca: 1, vendas_com_diferenca: 1, exemplos: [{ id: v1, numero: await numeroDe(v1) }] });
    expect(c.pagamentos).toMatchObject(FECHA);
    expect(c.caixa).toMatchObject(FECHA);
  });

  it("acusa o pagamento que não soma o total e o dinheiro que não está no livro do caixa; duas diferenças opostas não se escondem na soma", async () => {
    const { dono, v1, v2 } = await diaDaLojaA();
    // Um pagamento a mais na V1 (gravado por fora, sem o lançamento no caixa) e R$ 1,00 a menos no Pix da V2.
    await db.query(
      `insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, comprovante, confirmacao, confirmado_por)
       values ($1, $2, 9, 'pix_direto', 100, 0, 'POR-FORA', 'manual', $3)`, [ids.organizacao, v1, ids.dono]);
    await db.query("update public.venda_pagamentos set valor_centavos = valor_centavos - 100 where venda_id = $1 and meio = 'pix_picpay'", [v2]);
    const c = await conferir(dono, ids.lojaA);
    const exemplos = [{ id: v1, numero: await numeroDe(v1) }, { id: v2, numero: await numeroDe(v2) }].sort((a, b) => a.numero - b.numero);
    // Somadas, as duas diferenças dão zero; a contagem das vendas é que acusa.
    expect(c.pagamentos).toMatchObject({ diferenca: 0, vendas_com_diferenca: 2, exemplos });
    // O livro do caixa tem o que as vendas lançaram de verdade: agora ele difere do que os pagamentos dizem, nas duas.
    expect(c.caixa).toMatchObject({ diferenca: 0, vendas_com_diferenca: 2, exemplos });
    expect(c.estoque).toMatchObject(FECHA);
  });

  it("o período e a loja limitam a conta: fora do período não há venda; a rede soma as lojas de quem vê a rede", async () => {
    const { dono } = await diaDaLojaA();
    const vazio = await conferir(dono, ids.lojaA, new Date(Date.now() - 10 * 86_400_000).toISOString(), new Date(Date.now() - 9 * 86_400_000).toISOString());
    expect(vazio).toEqual({
      vendas: 0, vendido: 0, pagamentos: { recebido_na_loja: 0, financiado: 0, vale_troca: 0, desfeitos: 0, ...FECHA },
      caixa: { esperado: 0, no_livro: 0, ...FECHA }, estoque: { unidades: 0, no_livro: 0, ...FECHA } });
    expect((await conferir(dono, ids.lojaB)).vendas).toBe(0);
    // Sem loja: todas as que o dono vê (a rede dele). Aqui, só a loja A vendeu.
    expect(await conferir(dono, null)).toEqual(await conferir(dono, ids.lojaA));
  });

  it("só quem vê as vendas da loja confere, e só as lojas dele; período inválido é recusado", async () => {
    const { ana, dono } = await diaDaLojaA();
    // O vendedor vê as próprias vendas, mas a conferência é da gestão.
    expect(await erroDe(ana, CONFERIR, [INICIO, FIM, ids.lojaA])).toBe("42501");
    expect(await erroDe(ana, CONFERIR, [INICIO, FIM, null])).toBe("42501");
    // O gerente da loja B não confere a loja A; sem dizer a loja, confere só a dele.
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await erroDe(gerenteB, CONFERIR, [INICIO, FIM, ids.lojaA])).toBe("42501");
    expect((await conferir(gerenteB, null)).vendas).toBe(0);
    expect((await conferir(gerenteB, ids.lojaB)).vendas).toBe(0);
    // A outra rede não alcança a loja A; a conta dela é só a dela.
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await erroDe(outraRede, CONFERIR, [INICIO, FIM, ids.lojaA])).toBe("42501");
    expect((await conferir(outraRede, null)).vendas).toBe(0);
    for (const [inicio, fim] of [[FIM, INICIO], [INICIO, INICIO], [null, FIM], [new Date(Date.now() - 500 * 86_400_000).toISOString(), FIM]]) {
      expect(await erroDe(dono, CONFERIR, [inicio, fim, ids.lojaA])).toBe("22023");
    }
  });
});
