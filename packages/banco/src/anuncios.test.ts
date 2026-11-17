// Lote META-a (17/11/2026; ORA-META-001 por arquivo, ORA-META-003, ORA-META-004 e ORA-META-006; migration
// 20261117232910_custo_dos_anuncios): o custo dos anúncios por arquivo e o painel por campanha. Dados FICTÍCIOS
// (campanhas, gastos e vendas inventados aqui); cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

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
let arquivos = 0;
const chave = (p: string) => `${p}:anuncios:${String(++chaves).padStart(5, "0")}`;
const impressao = () => `a${String(++arquivos).padStart(63, "0")}`;
async function erroDe(acao: () => Promise<unknown>): Promise<string | null> {
  await db.exec("savepoint tentativa");
  try {
    await acao();
    await db.exec("release savepoint tentativa");
    return null;
  } catch (e) {
    await db.exec("rollback to savepoint tentativa");
    await db.exec("release savepoint tentativa");
    return (e as { code?: string }).code ?? "sem-codigo";
  }
}
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4c000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const linhas = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows, { criarSessao: false });
const recusa = (s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });
const hoje = async () => (await db.query<{ d: string }>("select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d")).rows[0]?.d ?? "";
const diasAtras = async (n: number) => (await db.query<{ d: string }>("select to_char((now() at time zone 'America/Sao_Paulo')::date - $1::int, 'YYYY-MM-DD') as d", [n])).rows[0]?.d ?? "";

const IMPORTAR = "select public.anuncios_importar('meta', 'relatorio.csv', $1, $2::jsonb, '{}'::jsonb) as v";
type Importado = { importacao: string; numero: number; campanhas: number; dias_de_campanha: number; substituidos: number; repetido: boolean };
const importar = (s: Sessao, l: unknown[], arquivo = impressao()) => valor<Importado>(s, IMPORTAR, [arquivo, JSON.stringify(l)]);
const PAINEL = "select public.anuncios_painel($1::date, $2::date) as v";
type Campanha = Record<string, unknown> & { chave: string };
const painel = async (s: Sessao, inicio: string, fim: string) => (await valor<{ campanhas: Campanha[] } & Record<string, unknown>>(s, PAINEL, [inicio, fim]));

describe("a importação do custo dos anúncios (META-a)", () => {
  it("soma o mesmo dia da mesma campanha; o arquivo novo do mesmo dia substitui; o mesmo arquivo devolve a mesma importação", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const d = await hoje();
    const arquivo = impressao();
    const r = await importar(dono, [
      { numero: 2, dia: d, campanha: "Black Friday — Galaxy", gasto: 5000, impressoes: 1000, cliques: 40, resultados: 4 },
      { numero: 3, dia: d, campanha: "black  friday - galaxy", gasto: 2500, impressoes: 500, cliques: 10 },
      { numero: 4, dia: d, campanha: "Capas", gasto: 1000 },
    ], arquivo);
    expect(r).toMatchObject({ campanhas: 3, dias_de_campanha: 3, substituidos: 0, repetido: false });
    expect(await importar(dono, [{ numero: 1, dia: d, campanha: "X", gasto: 1 }], arquivo)).toMatchObject({ importacao: r.importacao, repetido: true });
    const r2 = await importar(dono, [{ numero: 2, dia: d, campanha: "CAPAS", gasto: 1200, cliques: 7 }]);
    expect(r2).toMatchObject({ campanhas: 1, substituidos: 1 });
    expect(await linhas(dono, "select campanha_chave, gasto_centavos, cliques from public.anuncios_custos order by 1")).toEqual([
      { campanha_chave: "black friday - galaxy", gasto_centavos: 2500, cliques: 10 },
      { campanha_chave: "black friday — galaxy", gasto_centavos: 5000, cliques: 40 },
      { campanha_chave: "capas", gasto_centavos: 1200, cliques: 7 },
    ]);
  });

  it("recusa a linha fora do formato, e quem não vê o resultado da rede", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const d = await hoje();
    for (const l of [{ numero: 1, dia: "17/11/2026", campanha: "A", gasto: 1 }, { numero: 1, dia: d, campanha: " ", gasto: 1 },
      { numero: 1, dia: d, campanha: "A", gasto: -1 }, { numero: 1, dia: d, campanha: "A", gasto: "1,00" }, { numero: 1, dia: "2026-02-30", campanha: "A", gasto: 1 }]) {
      expect(await recusa(dono, IMPORTAR, [impressao(), JSON.stringify([l])]), JSON.stringify(l)).toBe("22023");
    }
    for (const quem of [[ids.gerenteB, ids.lojaB], [ids.vendedorA, ids.lojaA], [ids.administrador, ids.lojaA]] as const) {
      const s = await naLoja(quem[0], quem[1]);
      expect(await recusa(s, IMPORTAR, [impressao(), JSON.stringify([{ numero: 1, dia: d, campanha: "A", gasto: 1 }])]), quem[0]).toBe("42501");
      expect(await recusa(s, PAINEL, [d, d]), quem[0]).toBe("42501");
      expect(await linhas(s, "select * from public.anuncios_custos")).toEqual([]);
    }
  });
});

let telefones = 0;
const telefone = () => `4198766${String(++telefones).padStart(4, "0")}`;
const cliente = async (s: Sessao, nome: string) =>
  (await valor<{ id: string }>(s, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v", [JSON.stringify({ tipo: "pessoa_fisica", nome, telefone: telefone() }), chave("cliente")])).id;
/** Uma venda da capa (R$ 79,00) concluída pela vendedora, para o cliente, com o pagamento dado. */
async function vender(s: Sessao, idDoCliente: string, pagamento: Record<string, unknown>, venda?: string): Promise<string> {
  const v = venda ?? await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  if (!venda) await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [v, cat.capa, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v", [v, JSON.stringify([pagamento]), JSON.stringify({ id: idDoCliente }), chave("concluir")]);
  return v;
}
const oportunidade = async (s: Sessao, idDoCliente: string, campanha: string) =>
  (await valor<{ id: string }>(s, "select public.oportunidade_registrar($1, $2::jsonb, $3) as v",
    [idDoCliente, JSON.stringify({ origem: "instagram", interesse: "Capa do Galaxy", campanha }), chave("oportunidade")])).id;
const ganhar = (s: Sessao, op: string, venda: string) => valor(s, "select public.oportunidade_mover($1, 'ganha', $2::jsonb) as v", [op, JSON.stringify({ venda })]);

describe("o painel por campanha (META-a)", () => {
  it("junta o custo aos contatos e às vendas da campanha; uma venda conta uma vez; receita, margem, recebido e clientes novos", async () => {
    await db.query("update public.produtos set publicar_online = true where id = $1", [cat.produtoCapa]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const ontem = await diasAtras(1);
    const d = await hoje();
    await importar(dono, [
      { numero: 2, dia: ontem, campanha: "Natal 2026", gasto: 10_000, impressoes: 6_000, cliques: 120, resultados: 6 },
      { numero: 3, dia: d, campanha: "Natal 2026", gasto: 5_000, impressoes: 4_000, cliques: 80, resultados: 4 },
      { numero: 4, dia: d, campanha: "Sem Contato", gasto: 2_000 },
    ]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const maria = await cliente(ana, "Maria do Anúncio");
    const joao = await cliente(ana, "João do Anúncio");
    // João já comprou antes (não é cliente novo).
    const antiga = await vender(ana, joao, { meio: "dinheiro", valor: 7_900 });
    await db.query("update public.vendas set concluida_em = now() - interval '30 days' where id = $1", [antiga]);
    // A reserva do site com a campanha do link, atendida e vendida para a Maria (a primeira compra dela).
    const reserva = await comoUsuario(db, null, async () => (await db.query<{ v: { codigo: string } }>(
      "select public.loja_reservar($1, $2, $3, 'Maria do Anúncio', $4, $5, $6::jsonb) as v",
      [ids.organizacao, cat.capa, ids.lojaA, telefone(), chave("reserva"), JSON.stringify({ origem: "instagram", utm_source: "instagram", utm_campaign: "Natal 2026" })])).rows[0]?.v);
    const idDaReserva = (await db.query<{ id: string }>("select id from public.loja_reservas where codigo = $1", [reserva?.codigo])).rows[0]?.id;
    const atendida = await valor<{ venda: string }>(ana, "select public.loja_reserva_atender($1, $2) as v", [idDaReserva, chave("atender")]);
    const venda1 = await vender(ana, maria, { meio: "dinheiro", valor: 7_900 }, atendida.venda);
    // A oportunidade de outra campanha ganha com a MESMA venda: a venda conta uma vez, para a campanha da reserva.
    await ganhar(ana, await oportunidade(ana, maria, "Outra Campanha"), venda1);
    // A oportunidade da campanha (digitada em maiúsculas), ganha com a venda no cartão do João, conciliada depois.
    const venda2 = await vender(ana, joao, { meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-77" });
    await ganhar(ana, await oportunidade(ana, joao, "NATAL 2026"), venda2);
    const pagamento2 = (await db.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1", [venda2])).rows[0]?.id;
    await valor(dono, "select public.pagamento_conciliar($1, 'NSU-77', 7800, $2::date) as v", [pagamento2, d]);
    const margem = Number((await db.query<{ m: string }>(
      "select sum(i.preco_unitario_centavos * i.quantidade - i.desconto_centavos - k.custo_unitario_centavos * i.quantidade) as m from public.venda_itens i join public.venda_itens_custos k on k.item_id = i.id where i.venda_id = any($1)",
      [[venda1, venda2]])).rows[0]?.m);

    const p = await painel(dono, ontem, d);
    const porChave = Object.fromEntries(p.campanhas.map((c) => [c.chave, c]));
    expect(porChave["natal 2026"]).toEqual({
      chave: "natal 2026", campanha: "Natal 2026", gasto: 15_000, impressoes: 10_000, cliques: 200, resultados: 10, dias: 2, reservas: 1, oportunidades: 1,
      vendas: 2, receita: 15_800, margem, vendas_sem_custo: 0, recebido: 7_900 + 7_800, clientes_novos: 1,
    });
    expect(porChave["outra campanha"]).toMatchObject({ gasto: 0, dias: 0, reservas: 0, oportunidades: 1, vendas: 0, receita: 0 });
    expect(porChave["sem contato"]).toMatchObject({ gasto: 2_000, reservas: 0, oportunidades: 0, vendas: 0 });
    expect(p.por_loja).toEqual([
      { chave: "natal 2026", unidade_id: ids.lojaA, loja: "Loja A", contatos: 2, vendas: 2, receita: 15_800 },
      { chave: "outra campanha", unidade_id: ids.lojaA, loja: "Loja A", contatos: 1, vendas: 0, receita: 0 },
    ]);
    expect(p.por_vendedor).toEqual([{ chave: "natal 2026", vendedor_id: ids.vendedorA, vendas: 2, receita: 15_800 }]);
    expect(p).toMatchObject({ contatos_sem_campanha: 0, importado_ate: d });
    // Fora do período, o custo e os contatos somem.
    expect((await painel(dono, await diasAtras(10), await diasAtras(5))).campanhas).toEqual([]);
    expect(await recusa(dono, PAINEL, [d, ontem])).toBe("22023");
  });
});
