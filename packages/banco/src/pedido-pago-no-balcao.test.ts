// Lote PAY-014b (24/11/2026; ORA-PAY-014 e ORA-ONLINE-002; ADR-025, item 9): no balcão, a venda que atende o pedido pago
// pelo site registra o "pago pelo site" sem cobrar de novo. O item do pedido pago vale o preço pago; a linha do link é
// posta pelo banco na conclusão; o pedido pago sai inteiro (o item pago não sai, o desconto que deixa o total abaixo do
// pago é recusado e a venda aberta não se cancela enquanto o dinheiro não voltar). Token, links e pagamentos FICTÍCIOS;
// cada teste numa transação desfeita.
import { createHash } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

const TOKEN = "token-ficticio-do-aviso-da-asaas-0123456789abcdef";
const IMPRESSAO = createHash("sha256").update(TOKEN, "utf8").digest("hex");

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
});
beforeEach(async () => {
  await db.exec("begin");
  await db.query("update public.produtos set publicar_online = true where id = any($1)", [[cat.produtoAparelho, cat.produtoCapa]]);
});
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
let whatsapps = 0;
let eventos = 0;
const chave = (p: string) => `${p}:balcao:${String(++chaves).padStart(5, "0")}`;
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
  const s = { usuario, sessao: `4e300000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const comoLoja = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const recusaALoja = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });
const visitante = <T>(sql: string, params: unknown[]) => comoUsuario(db, null, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
async function servico<T>(sql: string, params: unknown[] = []): Promise<T> {
  await db.exec("set role service_role");
  try { return (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T; } finally { await db.exec("reset role"); }
}

type PedidoDoSite = { codigo: string; total_centavos: number };
/** Um pedido do site pago pela Asaas (fictícia): o visitante pede, o worker cria o link, o aviso chega e a reconsulta confirma. */
async function pedidoPago(itens: string[]) {
  await servico("select public.pagamento_ligar('sandbox', 'wh_ficticio_1', $1) as v", [IMPRESSAO]);
  const whatsapp = `419877${String(++whatsapps).padStart(5, "0")}`;
  const p = await visitante<PedidoDoSite>("select public.loja_pedir($1, $2, $3::jsonb, $4, $5, $6) as v",
    [ids.organizacao, ids.lojaA, JSON.stringify(itens.map((v) => ({ variante: v }))), "Cliente do Site", whatsapp, chave("p")]);
  await visitante("select public.loja_pagamento_pedir($1, $2, $3) as v", [ids.organizacao, p.codigo, whatsapp]);
  const lote = await servico<{ id: string; codigo: string }[]>("select public.pagamentos_a_criar(10) as v");
  const pagamento = lote.find((x) => x.codigo === p.codigo)?.id as string;
  const link = `lnk_balcao_${++eventos}`;
  expect(await servico("select public.pagamento_link_registrar($1, $2, $3) as v", [pagamento, link, `https://sandbox.asaas.com/c/${link}`])).toBe("registrado");
  const evento = `evt_balcao_${eventos}`;
  const id = `pay_balcao_${eventos}`;
  expect(await visitante("select public.pagamento_aviso_receber($1, $2::jsonb) as v", [TOKEN, JSON.stringify({
    id: evento, evento: "PAYMENT_RECEIVED", pagamento: id, link, valor: p.total_centavos / 100, situacao: "RECEIVED" })])).toBe("guardado");
  expect(await servico("select public.pagamento_consulta_aplicar($1, $2::jsonb) as v",
    [evento, JSON.stringify({ situacao: "pago", valor_centavos: p.total_centavos, link, id_no_provedor: id })])).toBe("confirmado");
  const pedido = (await db.query<{ id: string }>("select id from public.loja_pedidos where codigo = $1", [p.codigo])).rows[0]?.id as string;
  return { ...p, whatsapp, pedido, pagamento, link, id };
}
/** O estorno feito no painel da Asaas, avisado e reconsultado. */
async function estornar(p: { total_centavos: number; link: string; id: string }) {
  const evento = `evt_estorno_${++eventos}`;
  await visitante("select public.pagamento_aviso_receber($1, $2::jsonb) as v", [TOKEN, JSON.stringify({
    id: evento, evento: "PAYMENT_REFUNDED", pagamento: p.id, link: p.link, valor: p.total_centavos / 100, situacao: "REFUNDED" })]);
  expect(await servico("select public.pagamento_consulta_aplicar($1, $2::jsonb) as v",
    [evento, JSON.stringify({ situacao: "estornado", valor_centavos: p.total_centavos, link: p.link, id_no_provedor: p.id })])).toBe("estorno_registrado");
}

type Atendido = { venda: string; repetida: boolean; total_reservado_centavos: number; total_atual_centavos: number; pago_pelo_site_centavos: number | null };
const atender = (s: Sessao, pedido: string, k = chave("atender")) => comoLoja<Atendido>(s, "select public.loja_pedido_atender($1, $2) as v", [pedido, k]);
const CONCLUIR = "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v";
type Concluida = { venda: string; total: number; troco: number; recebido: number; a_receber: number; pago_pelo_site: number; repetida: boolean };
const concluir = (s: Sessao, venda: string, pagamentos: object[], k = chave("concluir")) =>
  comoLoja<Concluida>(s, CONCLUIR, [venda, JSON.stringify(pagamentos), k]);
const recusaAoConcluir = (s: Sessao, venda: string, pagamentos: object[]) => recusaALoja(s, CONCLUIR, [venda, JSON.stringify(pagamentos), chave("concluir")]);
type ItemDaVenda = { id: string; variante_id: string; preco_unitario_centavos: number; preco_id: string | null; loja_reserva_id: string | null; reserva_id: string | null };
const itensDa = async (venda: string) => (await db.query<ItemDaVenda>(
  "select id, variante_id, preco_unitario_centavos::int, preco_id, loja_reserva_id, reserva_id from public.venda_itens where venda_id = $1 order by criado_em, id", [venda])).rows;
const pagamentosDa = async (venda: string) => (await db.query<{ ordem: number; meio: string; valor_centavos: number; confirmacao: string; comprovante: string | null; loja_pagamento_id: string | null; situacao: string }>(
  "select ordem, meio, valor_centavos::int, confirmacao, comprovante, loja_pagamento_id, situacao from public.venda_pagamentos where venda_id = $1 order by ordem", [venda])).rows;
const saldo = async (variante: string) =>
  (await db.query<{ quantidade: number; reservado: number }>("select quantidade, reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [ids.lojaA, variante])).rows[0];
const subirOPreco = (variante: string, centavos: number) => db.query(
  "insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem) values ($1, $2, $3, $4, now(), 'manual')",
  [ids.organizacao, variante, ids.lojaA, centavos]);
async function vendedoraComCaixa() {
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  await comoLoja(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  return ana;
}

describe("o pedido pago pelo site no balcão (PAY-014b)", () => {
  it("atender: os itens com o preço pago e ligados às reservas do site, a reserva da venda dura o pedido pago e o PDV vê o pago; concluir sem outra forma põe a linha do link", async () => {
    const p = await pedidoPago([cat.capa, cat.aparelho]);
    expect(p.total_centavos).toBe(7_900 + 149_900);
    await subirOPreco(cat.capa, 9_900); // depois do pagamento, a capa sobe: o pago vale
    const capaAntes = await saldo(cat.capa);
    const ana = await vendedoraComCaixa();
    const k = chave("atender");
    const r = await atender(ana, p.pedido, k);
    expect(r).toMatchObject({ repetida: false, total_reservado_centavos: 157_800, total_atual_centavos: 159_800, pago_pelo_site_centavos: 157_800 });
    expect(await atender(ana, p.pedido, k)).toMatchObject({ venda: r.venda, repetida: true, pago_pelo_site_centavos: 157_800 });
    const itens = await itensDa(r.venda);
    expect(itens.map((i) => [i.variante_id, i.preco_unitario_centavos, i.preco_id, i.loja_reserva_id !== null]).sort()).toEqual([
      [cat.aparelho, 149_900, null, true], [cat.capa, 7_900, null, true]].sort());
    const reservas = (await db.query<{ ok: boolean }>(`
      select bool_and(er.expira_em = p.expira_em and er.situacao = 'ativa') as ok
      from public.venda_itens i join public.estoque_reservas er on er.id = i.reserva_id join public.loja_pedidos p on p.venda_id = i.venda_id
      where i.venda_id = $1`, [r.venda])).rows[0];
    expect(reservas).toEqual({ ok: true });
    const tela = await comoLoja<{ venda: { pago_pelo_site_centavos: number }; itens: { loja_reserva_id: string | null }[] }>(ana, "select public.pdv_tela() as v");
    expect(tela.venda.pago_pelo_site_centavos).toBe(157_800);
    expect(tela.itens.every((i) => i.loja_reserva_id !== null)).toBe(true);

    const kc = chave("concluir");
    const c = await concluir(ana, r.venda, [], kc);
    expect(c).toMatchObject({ total: 157_800, troco: 0, recebido: 157_800, a_receber: 0, pago_pelo_site: 157_800, repetida: false });
    expect(await concluir(ana, r.venda, [], kc)).toMatchObject({ venda: r.venda, repetida: true });
    expect(await pagamentosDa(r.venda)).toEqual([
      { ordem: 1, meio: "link_pagamento", valor_centavos: 157_800, confirmacao: "provedor", comprovante: p.id, loja_pagamento_id: p.pagamento, situacao: "confirmado" }]);
    expect((await db.query("select tipo, meio, valor_centavos::int as valor from public.caixa_movimentos where venda_id = $1", [r.venda])).rows)
      .toEqual([{ tipo: "recebimento", meio: "link_pagamento", valor: 157_800 }]);
    expect(await saldo(cat.capa)).toEqual({ quantidade: (capaAntes?.quantidade ?? 0) - 1, reservado: (capaAntes?.reservado ?? 0) - 1 });
  });

  it("o item a mais no balcão se paga à parte; o desconto que deixa o total abaixo do pago é recusado; o item pago não sai e a venda aberta não se cancela (OR048)", async () => {
    const p = await pedidoPago([cat.capa]);
    const ana = await vendedoraComCaixa();
    const { venda } = await atender(ana, p.pedido);
    const [pago] = await itensDa(venda);
    expect(await recusaALoja(ana, "select public.remover_item($1)", [pago?.id])).toBe("OR048");
    expect(await recusaALoja(ana, "select public.cancelar_venda($1, 'Cliente desistiu')", [venda])).toBe("OR048");
    // A política da categoria da capa (até 10% sem aprovação): o desconto entra sem pedir aprovação, e a regra do pago decide.
    await db.query(`update public.categorias c set desconto_teto_pb = 1000, margem_minima_pb = 0 from public.variantes v
      join public.produtos p on p.id = v.produto_id where v.id = $1 and c.id = p.categoria_id`, [cat.capa]);
    expect(await comoLoja(ana, "select public.aplicar_desconto($1, 300) as v", [pago?.id])).toBe("dentro_do_limite");
    expect(await recusaAoConcluir(ana, venda, [])).toBe("OR009");
    await comoLoja(ana, "select public.aplicar_desconto($1, 0) as v", [pago?.id]);
    await comoLoja(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    expect(await recusaAoConcluir(ana, venda, [])).toBe("OR009"); // falta pagar a capa a mais
    const c = await concluir(ana, venda, [{ meio: "dinheiro", valor: 10_000 }]);
    expect(c).toMatchObject({ total: 15_800, troco: 2_100, recebido: 15_800, pago_pelo_site: 7_900 });
    expect((await pagamentosDa(venda)).map((x) => [x.ordem, x.meio, x.valor_centavos])).toEqual([[1, "link_pagamento", 7_900], [2, "dinheiro", 10_000]]);
  });

  it("a tela não declara o link: digitado, segue recusado; a venda comum sem pagamento segue recusada; o pedido não pago segue com o preço do dia e sem ligação", async () => {
    const ana = await vendedoraComCaixa();
    const venda = await comoLoja<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await comoLoja(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    expect(await recusaAoConcluir(ana, venda, [])).toBe("OR009");
    expect(await recusaAoConcluir(ana, venda, [{ meio: "link_pagamento", valor: 7_900 }])).toBe("OR009");
    await comoLoja(ana, "select public.cancelar_venda($1, 'Teste da venda comum') as v", [venda]);

    const naoPago = await visitante<PedidoDoSite>("select public.loja_pedir($1, $2, $3::jsonb, $4, $5, $6) as v",
      [ids.organizacao, ids.lojaA, JSON.stringify([{ variante: cat.capa }]), "Cliente do Site", "41987799999", chave("p")]);
    await subirOPreco(cat.capa, 9_900);
    const id = (await db.query<{ id: string }>("select id from public.loja_pedidos where codigo = $1", [naoPago.codigo])).rows[0]?.id;
    const r = await atender(ana, id as string);
    expect(r).toMatchObject({ total_reservado_centavos: 7_900, total_atual_centavos: 9_900, pago_pelo_site_centavos: null });
    expect((await itensDa(r.venda)).map((i) => [i.preco_unitario_centavos, i.loja_reserva_id])).toEqual([[9_900, null]]);
    expect(await recusaAoConcluir(ana, r.venda, [])).toBe("OR009");
  });

  it("o estorno com a venda aberta: o item com o preço pago não conclui (OR007), sai da venda e a venda se cancela; concluída, cancelar põe o link como estorno externo a confirmar", async () => {
    const p = await pedidoPago([cat.capa]);
    const ana = await vendedoraComCaixa();
    const { venda } = await atender(ana, p.pedido);
    await estornar(p);
    expect(await comoLoja<{ venda: { pago_pelo_site_centavos: number | null } }>(ana, "select public.pdv_tela() as v")).toMatchObject({ venda: { pago_pelo_site_centavos: null } });
    expect(await recusaAoConcluir(ana, venda, [{ meio: "dinheiro", valor: 7_900 }])).toBe("OR007");
    const [item] = await itensDa(venda);
    expect(await comoLoja(ana, "select public.remover_item($1) as v", [item?.id])).toBe(true);
    expect(await comoLoja(ana, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [venda])).toBe(true);

    const outro = await pedidoPago([cat.capa]);
    const { venda: concluida } = await atender(ana, outro.pedido);
    await concluir(ana, concluida, []);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await comoLoja(dono, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    expect(await comoLoja(dono, "select public.cancelar_venda($1, 'Cliente devolveu na hora') as v", [concluida])).toBe(true);
    expect((await pagamentosDa(concluida)).map((x) => [x.meio, x.situacao])).toEqual([["link_pagamento", "estorno_pendente"]]);
    expect((await db.query("select meio, valor_centavos::int as valor, situacao from public.estornos_externos where venda_id = $1", [concluida])).rows)
      .toEqual([{ meio: "link_pagamento", valor: 7_900, situacao: "pendente" }]);
  });

  it("a PayJoy e a Aiva não financiam de novo o celular pago pelo site; o mesmo pagamento do site não paga duas vendas", async () => {
    const p = await pedidoPago([cat.aparelho]);
    const ana = await vendedoraComCaixa();
    const { venda } = await atender(ana, p.pedido);
    await comoLoja(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    expect(await recusaAoConcluir(ana, venda, [{ meio: "payjoy", valor: 7_900, parcelas: 10 }])).toBe("OR009");
    await concluir(ana, venda, [{ meio: "dinheiro", valor: 7_900 }]);
    const linha = await db.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1 and meio = 'link_pagamento'", [venda]);
    expect(linha.rows).toHaveLength(1);
    expect(await erroDe(() => db.query(`insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, confirmacao, loja_pagamento_id)
      values ($1, $2, 9, 'link_pagamento', 100, 'provedor', $3)`, [ids.organizacao, venda, p.pagamento]))).toBe("23505");
    expect(await erroDe(() => db.query(`insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, confirmacao)
      values ($1, $2, 9, 'link_pagamento', 100, 'provedor')`, [ids.organizacao, venda]))).toBe("23514");
  });
});
