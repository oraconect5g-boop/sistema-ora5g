// Previsão de caixa (lote L8c: ORA-FIN-010; decisões do proprietário de 13/11/2026, D-038): só o dono vê;
// o banco devolve só FATOS (contas em aberto por semana de vencimento, as vencidas, as 8 semanas anteriores
// de recebido, devolvido e saídas do caixa, o que as financeiras devem, cartão e Pix a conciliar e o dinheiro
// nas gavetas); a estimativa e o saldo são contas da tela. Banco em memória com todas as migrations; dados
// FICTÍCIOS. Cada teste numa transação desfeita.
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
const chave = (prefixo: string) => `l8c:${prefixo}:${++chaves}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `7a000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string; mensagem: string }> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return { v };
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      return { codigo: (e as { code?: string }).code ?? "sem-codigo", mensagem: (e as Error).message };
    }
  }, { criarSessao: false });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.codigo} ${r.mensagem}`);
  return r.v;
}
const codigo = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

const PREVISAO = "select public.previsao_de_caixa($1, $2) as v";
type Soma = { valor: number; quantidade: number };
type Semana = { inicio: string; fim: string; contas: number; quantidade: number };
type Base = { inicio: string; fim: string; recebido: number; devolvido: number; saidas_caixa: number };
type Previsao = {
  hoje: string; unidade: string | null; semanas: Semana[]; vencidas: Soma; base: Base[];
  estornos_a_confirmar: Soma; financeiras: Soma; a_conciliar: Soma; gavetas: { valor: number; caixas: number }; lojas: { id: string; nome: string }[];
};
const previsao = (s: Sessao, semanas = 8, unidade: string | null = null) => valor<Previsao>(s, PREVISAO, [semanas, unidade]);
const n = (x: Record<string, unknown>) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === "number" || typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : v]));

const dia = async (deslocamento = 0) => (await db.query<{ v: string }>("select ((now() at time zone 'America/Sao_Paulo')::date + $1::int)::text as v", [deslocamento])).rows[0]?.v ?? "";
/** Meio-dia de São Paulo, `dias` antes ou depois de hoje. */
const AO_DIA = "((((now() at time zone 'America/Sao_Paulo')::date + $2::int) + time '12:00') at time zone 'America/Sao_Paulo')";
const pagamentosNoDia = (venda: string, dias: number) => db.query(`update public.venda_pagamentos set criado_em = ${AO_DIA} where venda_id = $1`, [venda, dias]);
// A devolução só aceita inserção: a data é fabricada com as travas desligadas só neste comando (como em
// margem-painel.test.ts); o fato em si é real.
// Desde a correção #82 o dinheiro devolvido sai pelo estorno lançado no caixa: ele vai junto para o mesmo dia.
async function devolucaoNoDia(venda: string, dias: number) {
  await db.exec("set session_replication_role = replica");
  await db.query(`update public.venda_devolucoes set criado_em = ${AO_DIA} where venda_id = $1`, [venda, dias]);
  await db.query(`update public.caixa_movimentos set ocorrido_em = ${AO_DIA} where venda_id = $1 and tipo = 'estorno'`, [venda, dias]);
  await db.exec("set session_replication_role = origin");
}
async function cancelamentoNoDia(venda: string, dias: number) {
  await db.exec("set session_replication_role = replica");
  await db.query(`update public.vendas set cancelada_em = ${AO_DIA} where id = $1`, [venda, dias]);
  await db.query(`update public.caixa_movimentos set ocorrido_em = ${AO_DIA} where venda_id = $1 and tipo = 'estorno'`, [venda, dias]);
  await db.exec("set session_replication_role = origin");
}
/** A confirmação do estorno externo com a data fabricada (a tabela só muda pela confirmação). */
async function confirmarEstornoNoDia(dono: Sessao, estorno: string, comprovante: string, dias: number) {
  expect(await valor(dono, "select public.confirmar_estorno_externo($1, $2, null) as v", [estorno, comprovante])).toBe("confirmado");
  await db.exec("set session_replication_role = replica");
  await db.query(`update public.estornos_externos set confirmado_em = ${AO_DIA} where id = $1`, [estorno, dias]);
  await db.exec("set session_replication_role = origin");
}
const estornoDa = async (venda: string, meio: string) =>
  (await db.query<{ id: string }>("select id from public.estornos_externos where venda_id = $1 and meio = $2", [venda, meio])).rows[0]?.id ?? "";
const saidaNoDia = (saida: string, dias: number) => db.query(`update public.caixa_saidas set decidida_em = ${AO_DIA} where id = $1`, [saida, dias]);

const abrirCaixa = (s: Sessao, fundo = 10_000) => valor<string>(s, "select public.abrir_caixa($1, $2) as v", [fundo, chave("caixa")]);
const novaVenda = (s: Sessao) => valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
const adicionar = (s: Sessao, venda: string, variante: string, item: string | null, quantidade = 1) =>
  valor<string>(s, "select public.adicionar_item($1, $2, $3, $4, $5) as v", [venda, variante, item, quantidade, chave("item")]);
const concluir = (s: Sessao, venda: string, pagamentos: object[], cliente: object = {}) =>
  valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v", [venda, JSON.stringify(pagamentos), JSON.stringify(cliente), chave("concluir")]);
const devolver = (s: Sessao, venda: string, itensDevolvidos: object[], reembolsos: object[]) =>
  valor<{ vale?: number }>(s, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, $4, $5) as v", [venda, JSON.stringify(itensDevolvidos), JSON.stringify(reembolsos), "Cliente desistiu", chave("dev")]);
async function vendaDeCapa(s: Sessao, pagamentos: object[]) {
  const venda = await novaVenda(s);
  const item = await adicionar(s, venda, cat.capa, null);
  await concluir(s, venda, pagamentos);
  return { venda, item };
}
const pagamentoDa = async (venda: string, meio: string) =>
  (await db.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1 and meio = $2", [venda, meio])).rows[0]?.id ?? "";
const categoria = async (nome: string) =>
  (await db.query<{ id: string }>("select id from public.contas_pagar_categorias where organizacao_id = $1 and nome = $2", [ids.organizacao, nome])).rows[0]?.id ?? "";
async function lancar(dono: Sessao, unidade: string | null, valorDaConta: number, dias: number) {
  const grupo = await valor<string>(dono, "select public.conta_pagar_lancar($1::jsonb, $2) as v", [JSON.stringify({
    unidade, categoria: await categoria("Outras"), descricao: "Conta do teste", valor: valorDaConta, vencimento: await dia(dias), forma: "unica",
  }), chave("conta")]);
  return (await db.query<{ id: string }>("select id from public.contas_a_pagar where grupo_id = $1", [grupo])).rows[0]?.id ?? "";
}
const dinheiroNasGavetas = async (unidade: string | null) => Number((await db.query<{ v: string }>(
  "select coalesce(sum(privado.dinheiro_no_caixa(c.id)), 0)::text as v from public.caixas c where c.organizacao_id = $1 and c.situacao = 'aberto' and ($2::uuid is null or c.unidade_id = $2)",
  [ids.organizacao, unidade])).rows[0]?.v);

// As semanas da rede (dias contados a partir de hoje, em São Paulo). Capa R$ 79,00; aparelho R$ 1.499,00.
//   Loja A: S1 capa em dinheiro (10.000, troco 2.100) há 10 dias, devolvida em dinheiro há 3 dias;
//   S2 aparelho PayJoy com 20.000 de entrada em dinheiro há 3 dias (a PayJoy deve 129.900);
//   S3 capa em Pix PicPay há 30 dias (a conciliar); S4 capa em cartão PicPay há 30 dias (conciliada),
//   devolvida em vale-troca há 3 dias; S8 capa paga com esse vale há 3 dias; S5 capa em Pix direto há 70
//   dias (fora da base e do "a conciliar"); S7 capa em dinheiro hoje (fora da base); saída autorizada de
//   2.500 há 3 dias. Loja B: S6 aparelho em dinheiro há 50 dias.
async function semanasDaRede() {
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  await abrirCaixa(ana);
  const s1 = await vendaDeCapa(ana, [{ meio: "dinheiro", valor: 10_000 }]);
  const s2 = await novaVenda(ana);
  await adicionar(ana, s2, cat.aparelho, itens.a1);
  await concluir(ana, s2, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: "dinheiro" }], { nome: "Cliente Teste", email: "cliente@teste.invalid" });
  const s3 = await vendaDeCapa(ana, [{ meio: "pix_picpay", valor: 7_900, comprovante: "111111" }]);
  const s4 = await vendaDeCapa(ana, [{ meio: "cartao_picpay", valor: 7_900, comprovante: "222222" }]);
  const s5 = await vendaDeCapa(ana, [{ meio: "pix_direto", valor: 7_900, comprovante: "E2E-FICTICIO-L8C" }]);
  await vendaDeCapa(ana, [{ meio: "dinheiro", valor: 7_900 }]);
  const dono = await naLoja(ids.dono, ids.lojaA);
  await abrirCaixa(dono);
  expect(await valor(dono, "select public.pagamento_conciliar($1, $2, $3, $4::date) as v", [await pagamentoDa(s4.venda, "cartao_picpay"), "EXTRATO-L8C", 7_650, await dia()])).toBe(true);
  await devolver(dono, s1.venda, [{ item: s1.item, quantidade: 1, condicao: "novo" }], [{ meio: "dinheiro", valor: 7_900 }]);
  const troca = await devolver(dono, s4.venda, [{ item: s4.item, quantidade: 1, condicao: "novo" }], [{ meio: "vale_troca", valor: 7_900 }]);
  const s8 = await vendaDeCapa(ana, [{ meio: "vale_troca", valor: 7_900, comprovante: `VT-${troca.vale}` }]);
  const saida = await valor<string>(ana, "select public.caixa_pedir_saida($1, $2, $3) as v", [2_500, "Motoboy da entrega", chave("saida")]);
  expect(await valor(dono, "select public.caixa_decidir_saida($1, $2, $3) as v", [saida, true, null])).toBe("autorizada");
  const betoB = await naLoja(ids.vendedorAB, ids.lojaB);
  await abrirCaixa(betoB);
  const s6 = await novaVenda(betoB);
  await adicionar(betoB, s6, cat.aparelho, itens.b1);
  await concluir(betoB, s6, [{ meio: "dinheiro", valor: 139_900 }]);

  await pagamentosNoDia(s1.venda, -10);
  await pagamentosNoDia(s2, -3);
  await pagamentosNoDia(s3.venda, -30);
  await pagamentosNoDia(s4.venda, -30);
  await pagamentosNoDia(s5.venda, -70);
  await pagamentosNoDia(s8.venda, -3);
  await pagamentosNoDia(s6, -50);
  await devolucaoNoDia(s1.venda, -3);
  await devolucaoNoDia(s4.venda, -3);
  await saidaNoDia(saida, -3);
  return { dono };
}
/** As contas: vencida, desta semana (A e B), da próxima, da rede, paga, cancelada e uma depois de 8 semanas. */
async function contasDaRede(dono: Sessao) {
  await lancar(dono, ids.lojaA, 30_000, -5);
  await lancar(dono, ids.lojaA, 50_000, 3);
  await lancar(dono, ids.lojaB, 20_000, 6);
  await lancar(dono, ids.lojaA, 40_000, 10);
  await lancar(dono, null, 100_000, 20);
  const paga = await lancar(dono, ids.lojaA, 15_000, 4);
  expect(await valor(dono, "select public.conta_pagar_pagar($1, $2::date, $3, $4) as v", [paga, await dia(), 15_000, "COMPROVANTE-L8C"])).toBe(true);
  const cancelada = await lancar(dono, ids.lojaA, 25_000, 4);
  expect(await valor(dono, "select public.conta_pagar_cancelar($1, $2, $3) as v", [cancelada, "Lançada em dobro", false])).toBe(1);
  await lancar(dono, ids.lojaA, 70_000, 60);
}

describe("previsão de caixa: quem vê (L8c)", () => {
  it("só o dono vê, da rede e de cada loja; gerente, administrador e vendedor são recusados; outra rede vê só a dela", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await previsao(dono)).unidade).toBeNull();
    expect((await previsao(dono, 8, ids.lojaB)).unidade).toBe(ids.lojaB);
    for (const [usuario, unidade] of [[ids.gerenteB, ids.lojaB], [ids.administrador, ids.lojaA], [ids.vendedorA, ids.lojaA]] as const) {
      expect(await codigo(await naLoja(usuario, unidade), PREVISAO, [8, null]), usuario).toBe("42501");
    }
    const outra = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect((await previsao(outra)).lojas.map((l) => l.nome)).toEqual(["Loja X"]);
    expect(await codigo(outra, PREVISAO, [8, ids.lojaA])).toBe("42501");
    expect(await codigo(dono, PREVISAO, [8, ids.lojaOutraOrg])).toBe("42501");
  });

  it("sem uma das permissões das partes, nem o dono vê; horizonte fora de 1 a 13 semanas é recusado", async () => {
    for (const permissao of ["previsao.ver", "venda.ver_todas", "conta_pagar.gerir", "caixa.conferir"]) {
      await db.exec("savepoint sem_permissao");
      await db.query("select set_config('ora.motivo', 'Teste da previsão sem uma das permissões', true)");
      await db.query("delete from public.papel_permissoes where papel = 'dono' and permissao = $1", [permissao]);
      expect(await codigo(await naLoja(ids.dono, ids.lojaA), PREVISAO, [8, null]), permissao).toBe("42501");
      await db.exec("rollback to savepoint sem_permissao");
      await db.exec("release savepoint sem_permissao");
    }
    const dono = await naLoja(ids.dono, ids.lojaA);
    for (const semanas of [0, 14, null]) expect(await codigo(dono, PREVISAO, [semanas, null]), String(semanas)).toBe("22023");
    expect((await previsao(dono, 13)).semanas).toHaveLength(13);
    expect((await previsao(dono, 1)).semanas).toHaveLength(1);
  });
});

describe("previsão de caixa: os fatos (L8c)", () => {
  it("contas em aberto por semana de vencimento e as vencidas; paga, cancelada e depois do horizonte ficam fora; a rede só na rede inteira", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await contasDaRede(dono);
    const hoje = await dia();
    const rede = await previsao(dono);
    expect(rede.hoje).toBe(hoje);
    expect(rede.semanas.map((s) => [s.inicio, s.fim])).toEqual(await Promise.all(Array.from({ length: 8 }, async (_, i) => [await dia(7 * i), await dia(7 * i + 6)])));
    expect(rede.semanas.map((s) => [Number(s.contas), Number(s.quantidade)])).toEqual([[70_000, 2], [40_000, 1], [100_000, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
    expect(n(rede.vencidas)).toEqual({ valor: 30_000, quantidade: 1 });
    expect((await previsao(dono, 13)).semanas.map((s) => Number(s.contas)).slice(8)).toEqual([70_000, 0, 0, 0, 0]);
    const a = await previsao(dono, 8, ids.lojaA);
    expect(a.semanas.map((s) => Number(s.contas)).slice(0, 3)).toEqual([50_000, 40_000, 0]);
    expect(n(a.vencidas)).toEqual({ valor: 30_000, quantidade: 1 });
    const b = await previsao(dono, 8, ids.lojaB);
    expect(b.semanas.map((s) => Number(s.contas)).slice(0, 3)).toEqual([20_000, 0, 0]);
    expect(n(b.vencidas)).toEqual({ valor: 0, quantidade: 0 });
  });

  it("as 8 semanas anteriores: recebido (troco, entrada da financeira, sem vale-troca), devolvido (sem vale-troca) e saídas do caixa; hoje fica fora", async () => {
    const { dono } = await semanasDaRede();
    const rede = await previsao(dono);
    expect(rede.base.map((b) => [b.inicio, b.fim])).toEqual(await Promise.all(Array.from({ length: 8 }, async (_, k) => [await dia(-56 + 7 * k), await dia(-50 + 7 * k)])));
    const zero = { recebido: 0, devolvido: 0, saidas_caixa: 0 };
    const semInicio = (b: Base) => ({ recebido: Number(b.recebido), devolvido: Number(b.devolvido), saidas_caixa: Number(b.saidas_caixa) });
    expect(rede.base.map(semInicio)).toEqual([
      { ...zero, recebido: 139_900 }, zero, zero, { ...zero, recebido: 15_800 }, zero, zero, { ...zero, recebido: 7_900 },
      { recebido: 20_000, devolvido: 7_900, saidas_caixa: 2_500 },
    ]);
    expect((await previsao(dono, 8, ids.lojaA)).base.map(semInicio)).toEqual([
      zero, zero, zero, { ...zero, recebido: 15_800 }, zero, zero, { ...zero, recebido: 7_900 }, { recebido: 20_000, devolvido: 7_900, saidas_caixa: 2_500 },
    ]);
    expect((await previsao(dono, 8, ids.lojaB)).base.map(semInicio)).toEqual([{ ...zero, recebido: 139_900 }, zero, zero, zero, zero, zero, zero, zero]);
  });

  it("o que as financeiras devem, cartão e Pix a conciliar dos últimos 60 dias e o dinheiro nas gavetas dos caixas abertos", async () => {
    const { dono } = await semanasDaRede();
    const rede = await previsao(dono);
    expect(n(rede.financeiras)).toEqual({ valor: 129_900, quantidade: 1 });
    // S3 (Pix PicPay, há 30 dias); S4 está conciliada e S5 tem mais de 60 dias.
    expect(n(rede.a_conciliar)).toEqual({ valor: 7_900, quantidade: 1 });
    expect(n(rede.gavetas)).toEqual({ valor: await dinheiroNasGavetas(null), caixas: 3 });
    const b = await previsao(dono, 8, ids.lojaB);
    expect(n(b.financeiras)).toEqual({ valor: 0, quantidade: 0 });
    expect(n(b.a_conciliar)).toEqual({ valor: 0, quantidade: 0 });
    expect(n(b.gavetas)).toEqual({ valor: await dinheiroNasGavetas(ids.lojaB), caixas: 1 });
    expect(Number(b.gavetas.valor)).toBe(149_900);
  });

  it("as listas de meios da função são as do banco (financeiras e conciliáveis)", async () => {
    const texto = (await db.query<{ v: string }>("select pg_get_functiondef('public.previsao_de_caixa(integer,uuid)'::regprocedure) as v")).rows[0]?.v ?? "";
    const lista = (m: RegExpMatchArray) => (m[1] ?? "").split(",").map((x) => x.trim().replace(/'/g, "")).sort();
    const listas = [...texto.matchAll(/p\.meio in \(([^)]*)\)/g)].map(lista);
    // Correção #82: os estornos da financeira ficam fora do devolvido e dos estornos a confirmar.
    const foraDoEstorno = [...texto.matchAll(/e\.meio not in \(([^)]*)\)/g)].map(lista);
    const todos = ["dinheiro", "pix_direto", "pix_picpay", "cartao_picpay", "cartao_pagseguro", "link_pagamento", "payjoy", "aiva", "vale_troca"];
    const comRegra = async (regra: string) => (await db.query<{ m: string }>(`select m from unnest($1::text[]) as m where privado.${regra}(m) order by m`, [todos])).rows.map((r) => r.m);
    expect(listas).toEqual([await comRegra("meio_financeira"), await comRegra("meio_liquidavel")]);
    expect(foraDoEstorno).toEqual([await comRegra("meio_financeira"), await comRegra("meio_financeira")]);
  });
});

// Correção de 14/11/2026 (#82, REV-PLAN-001, migration 20261114145418_previsao_correcoes): o devolvido da base é só
// o dinheiro que saiu, na data em que saiu. Aqui o resultado seguro, não a reprodução do defeito.
describe("previsão de caixa: devolvido só quando o dinheiro sai (#82)", () => {
  const semana = (deslocamento: number) => Math.floor((deslocamento + 56) / 7); // índice da semana da base
  const devolvidos = (p: Previsao) => p.base.map((b) => Number(b.devolvido));
  const recebidos = (p: Previsao) => p.base.map((b) => Number(b.recebido));
  const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

  it("Pix devolvido: pendente não sai; confirmado em outra semana sai nela, uma vez, mesmo confirmando de novo", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await vendaDeCapa(ana, [{ meio: "pix_direto", valor: 7_900, comprovante: "E2E-FICTICIO-B3-1" }]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    await devolver(dono, venda.venda, [{ item: venda.item, quantidade: 1, condicao: "novo" }], [{ meio: "pix_direto", valor: 7_900 }]);
    await pagamentosNoDia(venda.venda, -20);
    await devolucaoNoDia(venda.venda, -16);
    let p = await previsao(dono);
    expect(recebidos(p)[semana(-20)]).toBe(7_900);
    expect(soma(devolvidos(p))).toBe(0); // o pedido de estorno não é dinheiro que saiu
    expect(n(p.estornos_a_confirmar)).toEqual({ valor: 7_900, quantidade: 1 });
    const estorno = await estornoDa(venda.venda, "pix_direto");
    await confirmarEstornoNoDia(dono, estorno, "COMPROVANTE-PIX-B3", -2);
    p = await previsao(dono);
    expect(devolvidos(p)[semana(-2)]).toBe(7_900);
    expect(soma(devolvidos(p))).toBe(7_900);
    expect(n(p.estornos_a_confirmar)).toEqual({ valor: 0, quantidade: 0 });
    // Reprocessar a confirmação (mesmo comprovante) não muda nada; outro comprovante é recusado.
    expect(await valor(dono, "select public.confirmar_estorno_externo($1, $2, null) as v", [estorno, "COMPROVANTE-PIX-B3"])).toBe("confirmado");
    expect(await codigo(dono, "select public.confirmar_estorno_externo($1, $2, null) as v", [estorno, "OUTRO-COMPROVANTE"])).toBe("OR004");
    expect(soma(devolvidos(await previsao(dono)))).toBe(7_900);
  });

  it("reembolso misto, cancelamentos em cartão e em dinheiro e financeira: cada dinheiro na semana em que saiu", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const mista = await vendaDeCapa(ana, [{ meio: "dinheiro", valor: 3_000 }, { meio: "pix_direto", valor: 4_900, comprovante: "E2E-FICTICIO-B3-2" }]);
    const cartao = await vendaDeCapa(ana, [{ meio: "cartao_pagseguro", valor: 7_900, comprovante: "333333" }]);
    const dinheiro = await vendaDeCapa(ana, [{ meio: "dinheiro", valor: 7_900 }]);
    const financiada = await novaVenda(ana);
    await adicionar(ana, financiada, cat.aparelho, itens.a1);
    await concluir(ana, financiada, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: "pix_direto", comprovante: "E2E-FICTICIO-B3-3" }],
      { nome: "Cliente Teste", email: "cliente@teste.invalid" });
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono, 50_000);
    await devolver(dono, mista.venda, [{ item: mista.item, quantidade: 1, condicao: "novo" }], [{ meio: "dinheiro", valor: 3_000 }, { meio: "pix_direto", valor: 4_900 }]);
    for (const v of [cartao.venda, dinheiro.venda, financiada]) expect(await valor(dono, "select public.cancelar_venda($1, $2) as v", [v, "Cliente desistiu"])).toBe(true);
    await pagamentosNoDia(mista.venda, -30);
    for (const v of [cartao.venda, dinheiro.venda, financiada]) await pagamentosNoDia(v, -12);
    await devolucaoNoDia(mista.venda, -9);
    await cancelamentoNoDia(dinheiro.venda, -5);
    await cancelamentoNoDia(cartao.venda, -5);
    await cancelamentoNoDia(financiada, -5);

    let p = await previsao(dono, 8, ids.lojaA);
    // Recebido: venda cancelada depois continua na semana em que o dinheiro entrou (a financiada, só a entrada).
    expect(recebidos(p)[semana(-30)]).toBe(7_900);
    expect(recebidos(p)[semana(-12)]).toBe(7_900 + 7_900 + 20_000);
    // Devolvido: só o dinheiro (3.000 da devolução mista e 7.900 do cancelamento em dinheiro), cada um no seu dia.
    expect(devolvidos(p)[semana(-9)]).toBe(3_000);
    expect(devolvidos(p)[semana(-5)]).toBe(7_900);
    expect(soma(devolvidos(p))).toBe(10_900);
    // A confirmar: o Pix da devolução mista, o cartão cancelado e a entrada em Pix da financiada; o contrato da PayJoy não.
    expect(n(p.estornos_a_confirmar)).toEqual({ valor: 4_900 + 7_900 + 20_000, quantidade: 3 });

    await confirmarEstornoNoDia(dono, await estornoDa(cartao.venda, "cartao_pagseguro"), "COMPROVANTE-CARTAO-B3", -1);
    await confirmarEstornoNoDia(dono, await estornoDa(financiada, "payjoy"), "PROTOCOLO-PAYJOY-B3", -1);
    p = await previsao(dono, 8, ids.lojaA);
    // Na semana de -7 a -1: o dinheiro do cancelamento (-5) e o cartão confirmado (-1); o contrato na financeira não é dinheiro da loja.
    expect(devolvidos(p)[semana(-1)]).toBe(7_900 + 7_900);
    expect(soma(devolvidos(p))).toBe(18_800);
    expect(n(p.estornos_a_confirmar)).toEqual({ valor: 4_900 + 20_000, quantidade: 2 });
    // A loja B não vê nada disso; a rede vê igual à loja A.
    const b = await previsao(dono, 8, ids.lojaB);
    expect(soma(devolvidos(b))).toBe(0);
    expect(n(b.estornos_a_confirmar)).toEqual({ valor: 0, quantidade: 0 });
    expect(soma(devolvidos(await previsao(dono)))).toBe(18_800);
  });
});
