// Lote CRM-009a (ORA-CRM-009: "pedido externo e venda vinculados sem sobrescrever origem"): a venda do balcão que atendeu
// um pedido ou uma reserva do site. Nenhuma migration: a ligação já existe desde o ONLINE-b e o ONLINE-d (venda_id no
// pedido e em cada reserva). Este teste prova, com as regras de leitura de cada pessoa, o que a ficha do cliente e a tela
// da venda leem (apps/plataforma/src/lib/loja/vendas-do-site.ts): a venda segue do canal "loja", a origem fica no pedido
// e na reserva, e quem vende na loja lê a ligação pela venda. Dados FICTÍCIOS; cada teste numa transação desfeita.
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
const chave = (p: string) => `${p}:crm9:${String(++chaves).padStart(5, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `9a000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const comoLoja = <T>(s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const publicar = () => db.query("update public.produtos set publicar_online = true where id = any($1)", [[cat.produtoAparelho, cat.produtoCapa]]);
const ORIGEM = { origem: "instagram", utm_source: "instagram", utm_campaign: "novembro" };

// As mesmas leituras da tela (colunas e filtros de lerVendasDoSite), com as regras de leitura de quem pergunta.
type DaReserva = { venda_id: string; numero: number; codigo: string; criada_em: string; origem: string | null; pedido_id: string | null };
type DoPedido = { id: string; codigo: string; criado_em: string };
const reservasDasVendas = (s: Sessao, vendas: string[]) => comoLoja<DaReserva[]>(s,
  `select coalesce(jsonb_agg(jsonb_build_object('venda_id', r.venda_id, 'numero', r.numero, 'codigo', r.codigo, 'criada_em', r.criada_em, 'origem', r.origem, 'pedido_id', r.pedido_id) order by r.numero), '[]'::jsonb) as v
   from public.loja_reservas r where r.venda_id = any($1) and r.situacao = 'atendida'`, [vendas]);
const pedidosDasVendas = (s: Sessao, vendas: string[]) => comoLoja<DoPedido[]>(s,
  "select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'codigo', p.codigo, 'criado_em', p.criado_em)), '[]'::jsonb) as v from public.loja_pedidos p where p.venda_id = any($1)", [vendas]);

describe("a venda que atendeu um pedido do site (CRM-009a)", () => {
  it("o pedido com duas unidades: a venda é do balcão, o pedido e as reservas apontam para ela, e a origem fica onde estava, antes e depois de concluir", async () => {
    await publicar();
    const pedido = await comoUsuario(db, null, async () => (await db.query<{ v: { codigo: string } }>(
      "select public.loja_pedir($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb) as v",
      [ids.organizacao, ids.lojaA, JSON.stringify([{ variante: cat.capa }, { variante: cat.capa }]), "Cliente do Site", "41987650031", chave("pedir"), JSON.stringify(ORIGEM)])).rows[0]?.v as { codigo: string });
    const linha = (await db.query<{ id: string; criado_em: string }>("select id, criado_em from public.loja_pedidos where codigo = $1", [pedido.codigo])).rows[0] as { id: string; criado_em: string };
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await comoLoja(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const atendido = await comoLoja<{ venda: string }>(ana, "select public.loja_pedido_atender($1, $2) as v", [linha.id, chave("atender")]);

    // A venda nasce do balcão (quem atende é a loja): o canal não vira "online".
    expect((await db.query("select canal, situacao, unidade_id from public.vendas where id = $1", [atendido.venda])).rows).toEqual([{ canal: "loja", situacao: "rascunho", unidade_id: ids.lojaA }]);
    // O que a tela lê, como a vendedora da loja: as duas unidades e o pedido, pela venda.
    const reservas = await reservasDasVendas(ana, [atendido.venda]);
    expect(reservas).toHaveLength(2);
    expect(reservas.every((r) => r.venda_id === atendido.venda && r.pedido_id === linha.id && r.origem === "instagram")).toBe(true);
    expect(await pedidosDasVendas(ana, [atendido.venda])).toEqual([{ id: linha.id, codigo: pedido.codigo, criado_em: expect.any(String) }]);

    // Concluir a venda não mexe na origem: o pedido segue atendido, com o código, a data e a venda; as reservas, com a origem.
    await comoLoja(ana, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v", [atendido.venda, JSON.stringify([{ meio: "dinheiro", valor: 15_800 }]), "{}", chave("concluir")]);
    expect((await db.query("select canal, situacao from public.vendas where id = $1", [atendido.venda])).rows).toEqual([{ canal: "loja", situacao: "concluida" }]);
    expect((await db.query("select situacao, venda_id, codigo from public.loja_pedidos where id = $1", [linha.id])).rows).toEqual([{ situacao: "atendido", venda_id: atendido.venda, codigo: pedido.codigo }]);
    expect((await db.query("select origem, utm_campaign, situacao from public.loja_reservas where pedido_id = $1 order by numero", [linha.id])).rows)
      .toEqual([{ origem: "instagram", utm_campaign: "novembro", situacao: "atendida" }, { origem: "instagram", utm_campaign: "novembro", situacao: "atendida" }]);
    expect(await reservasDasVendas(ana, [atendido.venda])).toHaveLength(2);

    // Quem lê: o dono (a rede inteira) lê; o gerente de outra loja não; o administrador vê a venda, mas não vende, e não
    // lê a reserva (a tela não mostra a anotação a ele: a regra de leitura das reservas do site não mudou neste lote).
    expect(await reservasDasVendas(await naLoja(ids.dono, ids.lojaB), [atendido.venda])).toHaveLength(2);
    expect(await pedidosDasVendas(await naLoja(ids.dono, ids.lojaB), [atendido.venda])).toHaveLength(1);
    expect(await reservasDasVendas(await naLoja(ids.gerenteB, ids.lojaB), [atendido.venda])).toEqual([]);
    expect(await pedidosDasVendas(await naLoja(ids.gerenteB, ids.lojaB), [atendido.venda])).toEqual([]);
    const administrador = await naLoja(ids.administrador, ids.lojaA);
    expect(await comoLoja<number>(administrador, "select count(*)::int as v from public.vendas where id = $1", [atendido.venda])).toBe(1);
    expect(await reservasDasVendas(administrador, [atendido.venda])).toEqual([]);
  });

  it("a reserva avulsa: a venda guarda a ligação pela reserva, com o código que o visitante recebeu; a venda comum não tem ligação nenhuma", async () => {
    await publicar();
    const reserva = await comoUsuario(db, null, async () => (await db.query<{ v: { codigo: string } }>(
      "select public.loja_reservar($1, $2, $3, $4, $5, $6) as v", [ids.organizacao, cat.capa, ids.lojaA, "Cliente do Site", "41987650032", chave("reservar")])).rows[0]?.v as { codigo: string });
    const linha = (await db.query<{ id: string }>("select id from public.loja_reservas where codigo = $1", [reserva.codigo])).rows[0] as { id: string };
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await comoLoja(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const atendida = await comoLoja<{ venda: string }>(ana, "select public.loja_reserva_atender($1, $2) as v", [linha.id, chave("atender")]);
    expect(await reservasDasVendas(ana, [atendida.venda])).toEqual([
      { venda_id: atendida.venda, numero: expect.any(Number), codigo: reserva.codigo, criada_em: expect.any(String), origem: null, pedido_id: null }]);
    expect(await pedidosDasVendas(ana, [atendida.venda])).toEqual([]);
    // Uma venda comum do balcão, feita pela mesma vendedora: sem reserva e sem pedido.
    const comum = await comoLoja<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await comoLoja(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [comum, cat.capa, chave("item")]);
    expect(await reservasDasVendas(ana, [comum])).toEqual([]);
    expect(await pedidosDasVendas(ana, [comum])).toEqual([]);
    // A reserva cancelada não é de venda nenhuma.
    const outra = await comoUsuario(db, null, async () => (await db.query<{ v: { codigo: string } }>(
      "select public.loja_reservar($1, $2, $3, $4, $5, $6) as v", [ids.organizacao, cat.capa, ids.lojaA, "Cliente do Site", "41987650033", chave("reservar")])).rows[0]?.v as { codigo: string });
    const daOutra = (await db.query<{ id: string }>("select id from public.loja_reservas where codigo = $1", [outra.codigo])).rows[0] as { id: string };
    await comoLoja(ana, "select public.loja_reserva_cancelar($1, 'Cliente desistiu') as v", [daOutra.id]);
    expect((await db.query("select venda_id from public.loja_reservas where id = $1", [daOutra.id])).rows).toEqual([{ venda_id: null }]);
  });
});
