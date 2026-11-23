// Lote FIN-001b (ORA-FIN-001; a segunda parte da conta do período): public.financeiro_conferencia_do_desfeito, a conta que diz
// se o que foi desfeito no período (cancelamentos de venda concluída e devoluções) tem destino para o valor, está no livro
// do caixa e está no livro do estoque, fato a fato. Banco em memória com todas as migrations; dados FICTÍCIOS. Cada teste
// numa transação desfeita.
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
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = (prefixo: string) => `${prefixo}:${++chaves}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `6e000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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
  valor<{ devolucao: string; vale: number | null }>(s, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, $4, $5) as v",
    [venda, JSON.stringify(itensDevolvidos), JSON.stringify(reembolsos), "Cliente desistiu", chave("dev")]);
const cancelar = (s: Sessao, venda: string) => valor<boolean>(s, "select public.cancelar_venda($1, 'Cliente desistiu da compra') as v", [venda]);
const retornosDe = async (venda: string) => (await db.query<{ id: string }>("select id from public.venda_retornos where venda_id = $1 order by id", [venda])).rows.map((r) => r.id);
const estornosDe = async (coluna: "venda_id" | "devolucao_id", id: string) =>
  (await db.query<{ id: string }>(`select id from public.estornos_externos where ${coluna} = $1 order by numero`, [id])).rows.map((r) => r.id);
const numeroDe = async (venda: string) => Number((await db.query<{ numero: string }>("select numero from public.vendas where id = $1", [venda])).rows[0]?.numero);

type Exemplo = { id: string; numero: number };
type Parte = { diferenca: number; vendas_com_diferenca: number; exemplos: Exemplo[] };
type Desfeito = {
  cancelamentos: number; cancelado: number; devolucoes: number; devolvido: number;
  destino: Parte & { em_dinheiro: number; por_fora: number; a_confirmar: number; vale_troca: number };
  caixa: Parte & { esperado: number; no_livro: number };
  estoque: Parte & { unidades: number; voltaram: number; esperando: number; nao_voltaram: number; no_livro: number };
};
const INICIO = new Date(Date.now() - 2 * 86_400_000).toISOString();
const FIM = new Date(Date.now() + 2 * 86_400_000).toISOString();
const CONFERIR = "select public.financeiro_conferencia_do_desfeito($1, $2, $3) as v";
const conferir = (s: Sessao, unidade: string | null = null, inicio = INICIO, fim = FIM) => valor<Desfeito>(s, CONFERIR, [inicio, fim, unidade]);
const FECHA = { diferenca: 0, vendas_com_diferenca: 0, exemplos: [] };

/**
 * A loja A desfaz de tudo um pouco:
 *  X1 capa em dinheiro com troco, cancelada (o retorno espera a conferência);
 *  X2 duas capas no Pix, cancelada (o estorno do Pix a confirmar; as duas capas voltaram e foram conferidas);
 *  X3 aparelho pela PayJoy com entrada em dinheiro, cancelado (a entrada volta em dinheiro; o contrato, por fora; o aparelho não voltou);
 *  X4 duas capas em dinheiro, uma devolvida em dinheiro;
 *  X5 capa no Pix, devolvida no Pix (o estorno confirmado com o comprovante);
 *  X6 capa em dinheiro, devolvida em vale-troca;
 *  X7 duas capas pagas com o vale e o cartão, cancelada (o saldo volta ao vale; o cartão, por fora; o retorno espera).
 */
async function diaComDesfeitos() {
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  await abrirCaixa(ana, 10_000);
  const dono = await naLoja(ids.dono, ids.lojaA);
  await abrirCaixa(dono, 200_000);

  const x1 = await novaVenda(ana);
  await adicionar(ana, x1, cat.capa, null);
  await concluir(ana, x1, [{ meio: "dinheiro", valor: 10_000 }]);
  await cancelar(dono, x1);

  const x2 = await novaVenda(ana);
  await adicionar(ana, x2, cat.capa, null, 2);
  await concluir(ana, x2, [{ meio: "pix_direto", valor: 15_800, comprovante: "PIX-X2" }]);
  await cancelar(dono, x2);
  for (const r of await retornosDe(x2)) await valor(dono, "select public.conferir_retorno($1, true, null, 'novo', null) as v", [r]);

  const x3 = await novaVenda(ana);
  await adicionar(ana, x3, cat.aparelho, itens.a1);
  await concluir(ana, x3, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: "dinheiro", parcelas: 12 }], { nome: "Cliente Teste", email: "cliente@teste.invalid" });
  await cancelar(dono, x3);
  for (const r of await retornosDe(x3)) await valor(dono, "select public.conferir_retorno($1, false, null, null, 'O cliente não trouxe o aparelho de volta') as v", [r]);

  const x4 = await novaVenda(ana);
  const itemX4 = await adicionar(ana, x4, cat.capa, null, 2);
  await concluir(ana, x4, [{ meio: "dinheiro", valor: 15_800 }]);
  await devolver(dono, x4, [{ item: itemX4, quantidade: 1, condicao: "novo" }], [{ meio: "dinheiro", valor: 7_900 }]);

  const x5 = await novaVenda(ana);
  const itemX5 = await adicionar(ana, x5, cat.capa, null);
  await concluir(ana, x5, [{ meio: "pix_direto", valor: 7_900, comprovante: "PIX-X5" }]);
  const devX5 = await devolver(dono, x5, [{ item: itemX5, quantidade: 1, condicao: "novo" }], [{ meio: "pix_direto", valor: 7_900 }]);
  for (const e of await estornosDe("devolucao_id", devX5.devolucao)) await valor(dono, "select public.confirmar_estorno_externo($1, 'PIX-DEVOLVIDO-X5', null) as v", [e]);

  const x6 = await novaVenda(ana);
  const itemX6 = await adicionar(ana, x6, cat.capa, null);
  await concluir(ana, x6, [{ meio: "dinheiro", valor: 7_900 }], { nome: "Cliente Fictício" });
  const troca = await devolver(dono, x6, [{ item: itemX6, quantidade: 1, condicao: "novo" }], [{ meio: "vale_troca", valor: 7_900 }]);

  const x7 = await novaVenda(ana);
  await adicionar(ana, x7, cat.capa, null, 2);
  await concluir(ana, x7, [{ meio: "vale_troca", valor: 7_900, comprovante: `VT-${troca.vale}` }, { meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-X7", parcelas: 2 }]);
  await cancelar(dono, x7);
  return { ana, dono, x1, x2, x3, x4, x5, x6, x7 };
}
const CANCELADO = 7_900 + 15_800 + 149_900 + 15_800;
const DEVOLVIDO = 7_900 + 7_900 + 7_900;

describe("financeiro_conferencia_do_desfeito: o que foi desfeito no período fecha, fato a fato (FIN-001b)", () => {
  it("cancelamentos e devoluções em dinheiro, por fora e em vale: o valor tem destino, o dinheiro está no caixa e o que voltou está no estoque", async () => {
    const { dono } = await diaComDesfeitos();
    const c = await conferir(dono, ids.lojaA);
    expect(c).toMatchObject({ cancelamentos: 4, cancelado: CANCELADO, devolucoes: 3, devolvido: DEVOLVIDO });
    // Em dinheiro: a capa da X1 (o troco não volta: ele nunca ficou), a entrada da X3 e a devolução da X4.
    // Por fora: o Pix da X2, o contrato da X3, o cartão da X7 e o Pix da X5 (este, já confirmado).
    // Em vale: o vale gerado na X6 e o saldo devolvido ao vale que pagou a X7.
    expect(c.destino).toEqual({
      em_dinheiro: 7_900 + 20_000 + 7_900, por_fora: 15_800 + 129_900 + 7_900 + 7_900, a_confirmar: 15_800 + 129_900 + 7_900,
      vale_troca: 7_900 + 7_900, ...FECHA });
    expect(c.destino.em_dinheiro + c.destino.por_fora + c.destino.vale_troca).toBe(c.cancelado + c.devolvido);
    expect(c.caixa).toEqual({ esperado: 35_800, no_livro: 35_800, ...FECHA });
    // No estoque: 6 unidades de venda cancelada (2 voltaram e foram conferidas, 3 esperam a conferência, 1 não voltou) e
    // 3 devolvidas (voltam na hora). Só o que voltou está no livro.
    expect(c.estoque).toEqual({ unidades: 9, voltaram: 5, esperando: 3, nao_voltaram: 1, no_livro: 5, ...FECHA });
  });

  it("acusa a volta ao estoque sem retorno conferido, o dinheiro devolvido fora da conta e o estorno por fora que não soma", async () => {
    const { dono, x1, x2, x4 } = await diaComDesfeitos();
    // A capa da X1 "volta" ao estoque por fora, sem o retorno conferido.
    await db.query("select privado.lancar_movimento($1, $2, 1, 'devolucao', null, null, 'venda', $3, 'defeito:volta-sem-conferir')", [ids.lojaA, cat.capa, x1]);
    // Um estorno em dinheiro a mais na X2 (paga no Pix: nenhum dinheiro tinha de sair do caixa por ela).
    const pagamentoX2 = (await db.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1", [x2])).rows[0]?.id;
    const caixaDoDono = (await db.query<{ id: string }>("select id from public.caixas where operador_id = $1 and situacao = 'aberto'", [ids.dono])).rows[0]?.id;
    await db.query(
      `insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, motivo, usuario_id, chave_idempotencia)
       values ($1, $2, 'estorno', 'dinheiro', -500, $3, $4, 'por fora', $5, 'defeito:estorno-a-mais')`, [ids.organizacao, caixaDoDono, x2, pagamentoX2, ids.dono]);
    // Um estorno por fora a mais na devolução da X4 (devolvida em dinheiro): o destino passa do valor devolvido.
    const devolucaoX4 = (await db.query<{ id: string }>("select id from public.venda_devolucoes where venda_id = $1", [x4])).rows[0]?.id;
    await db.query(
      `insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, devolucao_id, meio, valor_centavos, solicitado_por)
       values ($1, $2, $3, $4, 'pix_direto', 100, $5)`, [ids.organizacao, ids.lojaA, x4, devolucaoX4, ids.dono]);
    const c = await conferir(dono, ids.lojaA);
    expect(c.estoque).toMatchObject({ no_livro: 6, voltaram: 5, diferenca: 1, vendas_com_diferenca: 1, exemplos: [{ id: x1, numero: await numeroDe(x1) }] });
    expect(c.caixa).toMatchObject({ esperado: 35_800, no_livro: 36_300, diferenca: 500, vendas_com_diferenca: 1, exemplos: [{ id: x2, numero: await numeroDe(x2) }] });
    expect(c.destino).toMatchObject({ diferenca: 100, vendas_com_diferenca: 1, exemplos: [{ id: x4, numero: await numeroDe(x4) }] });
  });

  it("duas devoluções da mesma venda são dois fatos, mas uma venda só; o retorno que falta e o reembolso em dinheiro sem lançamento são acusados", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana, 10_000);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono, 200_000);
    // Y1: três capas em dinheiro; duas devoluções de uma capa cada, em dinheiro. Dois fatos, uma venda.
    const y1 = await novaVenda(ana);
    const itemY1 = await adicionar(ana, y1, cat.capa, null, 3);
    await concluir(ana, y1, [{ meio: "dinheiro", valor: 23_700 }]);
    await devolver(dono, y1, [{ item: itemY1, quantidade: 1, condicao: "novo" }], [{ meio: "dinheiro", valor: 7_900 }]);
    await devolver(dono, y1, [{ item: itemY1, quantidade: 1, condicao: "seminovo" }], [{ meio: "dinheiro", valor: 7_900 }]);
    const certo = await conferir(dono, ids.lojaA);
    expect(certo).toMatchObject({ cancelamentos: 0, cancelado: 0, devolucoes: 2, devolvido: 15_800,
      destino: { em_dinheiro: 15_800, por_fora: 0, a_confirmar: 0, vale_troca: 0, ...FECHA }, caixa: { esperado: 15_800, no_livro: 15_800, ...FECHA },
      estoque: { unidades: 2, voltaram: 2, esperando: 0, nao_voltaram: 0, no_livro: 2, ...FECHA } });
    // Y2: uma capa em dinheiro, cancelada. Por fora, some o registro do retorno: a unidade fica sem destino.
    const y2 = await novaVenda(ana);
    await adicionar(ana, y2, cat.capa, null);
    await concluir(ana, y2, [{ meio: "dinheiro", valor: 7_900 }]);
    await cancelar(dono, y2);
    await db.exec("alter table public.venda_retornos disable trigger venda_retornos_fixos");
    await db.query("delete from public.venda_retornos where venda_id = $1", [y2]);
    await db.exec("alter table public.venda_retornos enable trigger venda_retornos_fixos");
    const c = await conferir(dono, ids.lojaA);
    expect(c).toMatchObject({ cancelamentos: 1, cancelado: 7_900, devolucoes: 2, devolvido: 15_800 });
    // A soma das unidades no livro confere (nada voltou, nada devia ter voltado), mas a venda fica acusada: uma unidade sem retorno.
    expect(c.estoque).toMatchObject({ unidades: 3, voltaram: 2, esperando: 0, nao_voltaram: 0, no_livro: 2, diferenca: 0, vendas_com_diferenca: 1, exemplos: [{ id: y2, numero: await numeroDe(y2) }] });
    expect(c.caixa).toMatchObject({ esperado: 15_800 + 7_900, no_livro: 15_800 + 7_900, ...FECHA });
    expect(c.destino).toMatchObject(FECHA);
    // Por fora, some do livro do caixa o estorno em dinheiro da primeira devolução da Y1: o dinheiro devolvido não está no livro.
    const primeira = (await db.query<{ id: string }>("select id from public.venda_devolucoes where venda_id = $1 order by numero limit 1", [y1])).rows[0]?.id;
    await db.exec("alter table public.caixa_movimentos disable trigger caixa_movimentos_sem_alteracao");
    await db.query("delete from public.caixa_movimentos where chave_idempotencia = $1", [`devolucao:${primeira}:reembolso:dinheiro`]);
    await db.exec("alter table public.caixa_movimentos enable trigger caixa_movimentos_sem_alteracao");
    const semLancamento = await conferir(dono, ids.lojaA);
    expect(semLancamento.caixa).toMatchObject({ esperado: 23_700, no_livro: 15_800, diferenca: -7_900, vendas_com_diferenca: 1, exemplos: [{ id: y1, numero: await numeroDe(y1) }] });
  });

  it("o período e a loja limitam a conta: cada fato entra na data dele; a rede soma as lojas de quem vê a rede", async () => {
    const { dono } = await diaComDesfeitos();
    const vazio = await conferir(dono, ids.lojaA, new Date(Date.now() - 10 * 86_400_000).toISOString(), new Date(Date.now() - 9 * 86_400_000).toISOString());
    expect(vazio).toEqual({
      cancelamentos: 0, cancelado: 0, devolucoes: 0, devolvido: 0,
      destino: { em_dinheiro: 0, por_fora: 0, a_confirmar: 0, vale_troca: 0, ...FECHA },
      caixa: { esperado: 0, no_livro: 0, ...FECHA },
      estoque: { unidades: 0, voltaram: 0, esperando: 0, nao_voltaram: 0, no_livro: 0, ...FECHA } });
    expect((await conferir(dono, ids.lojaB)).cancelamentos).toBe(0);
    expect(await conferir(dono, null)).toEqual(await conferir(dono, ids.lojaA));
    expect(await conferir(await naLoja(ids.administrador, ids.lojaA), null)).toEqual(await conferir(dono, null));
  });

  it("só quem vê as vendas da loja confere, e só as lojas dele; período inválido é recusado", async () => {
    const { ana, dono } = await diaComDesfeitos();
    expect(await erroDe(ana, CONFERIR, [INICIO, FIM, ids.lojaA])).toBe("42501");
    expect(await erroDe(ana, CONFERIR, [INICIO, FIM, null])).toBe("42501");
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await erroDe(gerenteB, CONFERIR, [INICIO, FIM, ids.lojaA])).toBe("42501");
    expect((await conferir(gerenteB, null)).cancelamentos).toBe(0);
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await erroDe(outraRede, CONFERIR, [INICIO, FIM, ids.lojaA])).toBe("42501");
    expect((await conferir(outraRede, null)).devolucoes).toBe(0);
    for (const [inicio, fim] of [[FIM, INICIO], [INICIO, INICIO], [null, FIM], [new Date(Date.now() - 500 * 86_400_000).toISOString(), FIM]]) {
      expect(await erroDe(dono, CONFERIR, [inicio, fim, ids.lojaA])).toBe("22023");
    }
  });
});
