// Lote PAY-015b (25/11/2026; ORA-PAY-001, ORA-PAY-008 e ORA-PAY-014; a decisão D-062): o cartão pela Asaas no caixa. A
// vendedora pede o link de pagamento no cartão da sua venda aberta (até o que falta pagar, contando o Pix); o worker cria o
// link na Asaas e confere as cobranças de cartão; só a consulta confirma (com os 4 últimos dígitos e a bandeira); a
// conclusão põe a linha "Cartão pela Asaas" sozinha, e a venda não conclui com um link esperando. Links e cobranças
// FICTÍCIOS; cada teste numa transação desfeita.
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
let links = 0;
const chave = (p: string) => `${p}:cartao:${String(++chaves).padStart(5, "0")}`;
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
  const s = { usuario, sessao: `4e600000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const comoLoja = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const recusaALoja = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });
async function servico<T>(sql: string, params: unknown[] = []): Promise<T> {
  await db.exec("set role service_role");
  try { return (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T; } finally { await db.exec("reset role"); }
}

// O erro do worker (service_role) dentro de um savepoint: a transação do teste segue usável.
async function recusaAoServico(sql: string, params: unknown[] = []): Promise<string | null> {
  await db.exec("savepoint servico");
  await db.exec("set role service_role");
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "sem-codigo";
  } finally {
    await db.exec("rollback to savepoint servico");
    await db.exec("release savepoint servico");
    await db.exec("reset role");
  }
}

const ligar = () => servico("select public.caixa_cartao_situacao(true, null) as v");
const pedir = (s: Sessao, venda: string, valor: number, k = chave("link")) =>
  comoLoja<{ id: string; situacao: string; repetido?: boolean }>(s, "select public.caixa_cartao_pedir($1, $2, $3) as v", [venda, valor, k]);
const recusaAoPedir = (s: Sessao, venda: string, valor: number, k = chave("link")) => recusaALoja(s, "select public.caixa_cartao_pedir($1, $2, $3)", [venda, valor, k]);
type ACriar = { id: string; valor_centavos: number; tentativa: number; venda_numero: number; validade_segundos: number };
const aCriar = () => servico<ACriar[]>("select public.caixa_cartao_a_criar(10) as v");
const registrar = (id: string, link = `lnk${++links}`, expira = "now() + interval '30 minutes'") =>
  servico<string>(`select public.caixa_cartao_link_registrar($1, $2, $3, ${expira}) as v`, [id, link, `https://sandbox.asaas.invalid/c/${link}`]);
const aConferir = () => servico<{ id: string; link_id: string; situacao: string; valor_centavos: number; desde: string }[]>("select public.caixa_cartao_a_conferir(20) as v");
const aplicar = (id: string, consulta: object) => servico<string>("select public.caixa_cartao_consulta_aplicar($1, $2::jsonb) as v", [id, JSON.stringify(consulta)]);
const cartao = async (id: string) => (await db.query<{ situacao: string; link_id: string | null; id_no_provedor: string | null; divergencia: string | null; link_desativado_em: string | null; cartao_final: string | null; cartao_bandeira: string | null }>(
  "select situacao, link_id, id_no_provedor, divergencia, link_desativado_em, cartao_final, cartao_bandeira from public.caixa_cartao where id = $1", [id])).rows[0];
/** Um link pedido, criado pelo worker e esperando o pagamento. */
async function linkEsperando(s: Sessao, venda: string, valor: number) {
  const { id } = await pedir(s, venda, valor);
  expect((await aCriar()).map((x) => x.id)).toContain(id);
  const link = `lnk${++links}`;
  expect(await registrar(id, link)).toBe("registrado");
  return { id, link };
}
/** Um link pago (o worker conferiu na Asaas). */
async function linkPago(s: Sessao, venda: string, valor: number) {
  const l = await linkEsperando(s, venda, valor);
  const cobranca = `pay_cartao_${l.link}`;
  expect(await aplicar(l.id, { link_id: l.link, situacao: "pago", id_no_provedor: cobranca, valor_centavos: valor, cartao_final: "8829", cartao_bandeira: "VISA" }))
    .toBe("confirmado");
  return { ...l, cobranca };
}
const ligarOPix = () => servico("select public.caixa_pix_situacao(true, null) as v");

const CONCLUIR = "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v";
type Concluida = { venda: string; total: number; troco: number; recebido: number; pago_no_pix: number; pago_no_cartao: number; repetida: boolean };
const concluir = (s: Sessao, venda: string, pagamentos: object[], k = chave("concluir")) => comoLoja<Concluida>(s, CONCLUIR, [venda, JSON.stringify(pagamentos), k]);
const recusaAoConcluir = (s: Sessao, venda: string, pagamentos: object[]) => recusaALoja(s, CONCLUIR, [venda, JSON.stringify(pagamentos), chave("concluir")]);
const pagamentosDa = async (venda: string) => (await db.query<{ ordem: number; meio: string; valor_centavos: number; confirmacao: string; comprovante: string | null; caixa_cartao_id: string | null; situacao: string }>(
  "select ordem, meio, valor_centavos::int, confirmacao, comprovante, caixa_cartao_id, situacao from public.venda_pagamentos where venda_id = $1 order by ordem", [venda])).rows;
async function vendaCom(s: Sessao, variantes: string[]) {
  const venda = await comoLoja<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  for (const v of variantes) await comoLoja(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, v, chave("item")]);
  return venda;
}
async function vendedoraComCaixa() {
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  await comoLoja(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  return ana;
}

describe("o cartão pela Asaas no caixa (PAY-015b)", () => {
  it("desligado até o worker falar com a Asaas; ligado, a vendedora pede o link da sua venda, até o que falta pagar (o Pix pedido conta); o clique repetido devolve o mesmo", async () => {
    const ana = await vendedoraComCaixa();
    const venda = await vendaCom(ana, [cat.capa, cat.capa]);
    expect(await recusaAoPedir(ana, venda, 7_900)).toBe("OR058");
    await ligar();
    const k = chave("link");
    const primeiro = await pedir(ana, venda, 7_900, k);
    expect(primeiro).toMatchObject({ situacao: "criando" });
    expect(await pedir(ana, venda, 7_900, k)).toMatchObject({ id: primeiro.id, repetido: true });
    expect(await recusaAoPedir(ana, venda, 7_000, k)).toBe("OR004");
    expect(await recusaAoPedir(ana, venda, 0)).toBe("22023");
    // O Pix pedido conta para o cartão, e o cartão pedido conta para o Pix: nada passa do que falta.
    await ligarOPix();
    await comoLoja(ana, "select public.caixa_pix_pedir($1, 7000, $2) as v", [venda, chave("qr")]);
    expect(await recusaAoPedir(ana, venda, 1_000)).toBe("OR009");
    expect(await recusaALoja(ana, "select public.caixa_pix_pedir($1, 1000, $2)", [venda, chave("qr")])).toBe("OR009");
    expect((await pedir(ana, venda, 900)).situacao).toBe("criando");
    // A venda é da vendedora: a colega da mesma loja não pede o link para ela.
    expect(await recusaAoPedir(await naLoja(ids.vendedorAB, ids.lojaA), venda, 100)).toBe("P0002");
    // A Asaas sem responder, ou o worker parado por mais de 5 minutos: desligado.
    await servico("select public.caixa_cartao_situacao(false, 'a Asaas não respondeu') as v");
    const outra = await vendaCom(ana, [cat.capa]);
    // Numa transação o now() é um só: as vendas ganham horas diferentes, como teriam no caixa de verdade.
    await db.query("update public.vendas set criado_em = now() + interval '1 second' where id = $1", [outra]);
    expect(await recusaAoPedir(ana, outra, 7_900)).toBe("OR058");
    await ligar();
    await db.query("update privado.pagamento_pelo_site set caixa_cartao_conferido_em = now() - interval '6 minutes'");
    expect(await recusaAoPedir(ana, outra, 7_900)).toBe("OR058");
    expect(await comoLoja(ana, "select public.caixa_cartao_da_venda($1) as v", [outra])).toEqual({ ligado: false, venda: outra, cartoes: [] });
    // Sem a venda: a aberta da tela do PDV (a mais nova da vendedora na loja do turno).
    expect(await comoLoja<{ venda: string }>(ana, "select public.caixa_cartao_da_venda() as v")).toMatchObject({ venda: outra, cartoes: [] });
    const bia = await naLoja(ids.vendedorAB, ids.lojaA);
    expect(await comoLoja(bia, "select public.caixa_cartao_da_venda() as v")).toEqual({ ligado: false, venda: null, cartoes: [] });
    expect(await recusaALoja(await naLoja(ids.tecnico, ids.assistencia), "select public.caixa_cartao_da_venda()")).toBe("42501");
  });

  it("o worker cria o link; a venda não conclui com link esperando; só a consulta confirma (com o final e a bandeira); a conclusão põe a linha do cartão", async () => {
    const ana = await vendedoraComCaixa();
    await ligar();
    const venda = await vendaCom(ana, [cat.capa]);
    const { id } = await pedir(ana, venda, 7_900);
    expect((await aCriar()).find((x) => x.id === id)).toMatchObject({ valor_centavos: 7_900, tentativa: 1, validade_segundos: 1_800 });
    expect(await aCriar()).toEqual([]); // reservado por 1 minuto
    expect(await registrar(id, "lnk_unico_1")).toBe("registrado");
    expect(await registrar(id, "lnk_unico_1")).toBe("repetido");
    const tela = await comoLoja<{ cartoes: { situacao: string; link_url: string | null }[] }>(ana, "select public.caixa_cartao_da_venda($1) as v", [venda]);
    expect(tela.cartoes).toMatchObject([{ situacao: "aguardando", link_url: "https://sandbox.asaas.invalid/c/lnk_unico_1" }]);
    expect(await recusaAoConcluir(ana, venda, [{ meio: "dinheiro", valor: 7_900 }])).toBe("OR059");

    const lote = await aConferir();
    expect(lote.map((x) => [x.id, x.link_id])).toEqual([[id, "lnk_unico_1"]]);
    expect(lote[0]?.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await aConferir()).toEqual([]); // reservado por 30 segundos
    expect(await aplicar(id, { link_id: "lnk_unico_1", situacao: "nenhum" })).toBe("pendente");
    expect(await aplicar(id, { link_id: "lnk_outro", situacao: "pago", id_no_provedor: "pay_x", valor_centavos: 7_900 })).toBe("link_desconhecido");
    expect(await aplicar(id, { link_id: "lnk_unico_1", situacao: "pago", id_no_provedor: "pay_x", valor_centavos: 7_000 })).toBe("divergencia");
    expect(await cartao(id)).toMatchObject({ situacao: "aguardando", divergencia: "o valor pago é outro" });
    expect(await recusaAoServico("select public.caixa_cartao_consulta_aplicar($1, $2::jsonb)",
      [id, JSON.stringify({ link_id: "lnk_unico_1", situacao: "pago", id_no_provedor: "pay_1", valor_centavos: 7_900, cartao_final: "88" })])).toBe("22023");
    expect(await aplicar(id, { link_id: "lnk_unico_1", situacao: "pago", id_no_provedor: "pay_unico_1", valor_centavos: 7_900, cartao_final: "8829", cartao_bandeira: "VISA" }))
      .toBe("confirmado");
    expect(await aplicar(id, { link_id: "lnk_unico_1", situacao: "pago", id_no_provedor: "pay_unico_1", valor_centavos: 7_900 })).toBe("ja_registrado");
    expect(await cartao(id)).toMatchObject({ situacao: "pago", cartao_final: "8829", cartao_bandeira: "VISA" });
    expect((await comoLoja<{ cartoes: { situacao: string; link_url: string | null; cartao_final: string }[] }>(ana, "select public.caixa_cartao_da_venda($1) as v", [venda])).cartoes)
      .toMatchObject([{ situacao: "pago", link_url: null, cartao_final: "8829" }]);

    const k = chave("concluir");
    expect(await concluir(ana, venda, [], k)).toMatchObject({ total: 7_900, troco: 0, recebido: 7_900, pago_no_cartao: 7_900, pago_no_pix: 0, repetida: false });
    expect(await concluir(ana, venda, [], k)).toMatchObject({ venda, repetida: true });
    expect(await pagamentosDa(venda)).toEqual([
      { ordem: 1, meio: "cartao_asaas", valor_centavos: 7_900, confirmacao: "provedor", comprovante: "pay_unico_1", caixa_cartao_id: id, situacao: "confirmado" }]);
    expect((await db.query("select tipo, meio, valor_centavos::int as valor from public.caixa_movimentos where venda_id = $1", [venda])).rows)
      .toEqual([{ tipo: "recebimento", meio: "cartao_asaas", valor: 7_900 }]);
    const outra = await vendaCom(ana, [cat.capa]);
    expect(await recusaAoConcluir(ana, outra, [{ meio: "cartao_asaas", valor: 7_900 }])).toBe("OR009");
  });

  it("o pagamento misto: Pix pela Asaas, cartão pela Asaas e dinheiro com troco, na ordem; a venda aberta com cartão pago não se cancela (OR048)", async () => {
    const ana = await vendedoraComCaixa();
    await ligar();
    await ligarOPix();
    const venda = await vendaCom(ana, [cat.capa, cat.capa]);
    const l = await linkPago(ana, venda, 6_000);
    const { id: pixId } = await comoLoja<{ id: string }>(ana, "select public.caixa_pix_pedir($1, 5000, $2) as v", [venda, chave("qr")]);
    await servico("select public.caixa_pix_a_criar(10) as v");
    expect(await servico("select public.caixa_pix_qr_registrar($1, 'qr_misto', $2, $3, now() + interval '30 minutes') as v",
      [pixId, "00020126580014br.gov.bcb.pix0136ficticio-0000-4000-8000-0000000000005204000053039865802BR5925ORA5G6009CURITIBA6304ABCD", "iVBORw0KGgo".padEnd(400, "A")]))
      .toBe("registrado");
    expect(await servico("select public.caixa_pix_consulta_aplicar($1, $2::jsonb) as v",
      [pixId, JSON.stringify({ qr_id: "qr_misto", situacao: "pago", id_no_provedor: "pay_misto", valor_centavos: 5_000 })])).toBe("confirmado");
    expect(await recusaALoja(ana, "select public.caixa_cartao_cancelar($1)", [l.id])).toBe("OR048");
    expect(await recusaALoja(ana, "select public.cancelar_venda($1, 'Cliente desistiu')", [venda])).toBe("OR048");
    expect(await concluir(ana, venda, [{ meio: "dinheiro", valor: 5_000 }])).toMatchObject({ total: 15_800, troco: 200, pago_no_pix: 5_000, pago_no_cartao: 6_000 });
    expect((await pagamentosDa(venda)).map((x) => [x.ordem, x.meio, x.valor_centavos])).toEqual([[1, "pix_asaas", 5_000], [2, "cartao_asaas", 6_000], [3, "dinheiro", 5_000]]);
  });

  it("cancelar: o link que o worker não pediu sai na hora; o que está na Asaas o worker confere antes de desativar (o pago no meio tempo fica pago); o vencido sai; cancelar a venda leva os links", async () => {
    const ana = await vendedoraComCaixa();
    await ligar();
    const venda = await vendaCom(ana, [cat.capa, cat.capa, cat.capa]);
    const a = await pedir(ana, venda, 1_000);
    expect(await comoLoja(ana, "select public.caixa_cartao_cancelar($1) as v", [a.id])).toBe("cancelado");
    const b = await pedir(ana, venda, 1_000);
    await aCriar();
    expect(await comoLoja(ana, "select public.caixa_cartao_cancelar($1) as v", [b.id])).toBe("cancelando");
    expect(await registrar(b.id, "lnk_b")).toBe("cancelar");
    expect(await aplicar(b.id, { link_id: "lnk_b", situacao: "nenhum" })).toBe("pode_desativar");
    expect(await servico("select public.caixa_cartao_link_desativado($1) as v", [b.id])).toBe("cancelado");
    const c = await linkEsperando(ana, venda, 2_000);
    expect(await comoLoja(ana, "select public.caixa_cartao_cancelar($1) as v", [c.id])).toBe("cancelando");
    expect(await aplicar(c.id, { link_id: c.link, situacao: "pago", id_no_provedor: "pay_c", valor_centavos: 2_000 })).toBe("confirmado");
    expect(await cartao(c.id)).toMatchObject({ situacao: "pago", divergencia: null });
    const d = await linkEsperando(ana, venda, 3_000);
    await db.query("update public.caixa_cartao set expira_em = now() - interval '3 minutes' where id = $1", [d.id]);
    expect(await aplicar(d.id, { link_id: d.link, situacao: "nenhum" })).toBe("vencido");
    expect(await servico("select public.caixa_cartao_a_desativar(20) as v")).toEqual([{ id: d.id, link_id: d.link }]);
    expect(await servico("select public.caixa_cartao_link_desativado($1) as v", [d.id])).toBe("vencido");
    expect((await cartao(d.id))?.link_desativado_em).not.toBeNull();
    expect(await concluir(ana, venda, [{ meio: "dinheiro", valor: 21_700 }])).toMatchObject({ total: 23_700, pago_no_cartao: 2_000 });

    const outra = await vendaCom(ana, [cat.capa]);
    const e = await linkEsperando(ana, outra, 1_000);
    const f = await pedir(ana, outra, 1_000);
    expect(await comoLoja(ana, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [outra])).toBe(true);
    expect((await cartao(e.id))?.situacao).toBe("cancelando");
    expect((await cartao(f.id))?.situacao).toBe("cancelado");
    expect(await aplicar(e.id, { link_id: e.link, situacao: "pago", id_no_provedor: "pay_e", valor_centavos: 1_000 })).toBe("confirmado");
    expect(await cartao(e.id)).toMatchObject({ situacao: "pago", divergencia: "pago depois de a venda ser cancelada: devolva pela Asaas" });
  });

  it("o estorno e quem pode: estornado, sai da conta; concluída, cancelar põe o cartão como estorno externo; as funções do worker são só do servidor; a outra loja não lê", async () => {
    const ana = await vendedoraComCaixa();
    await ligar();
    const venda = await vendaCom(ana, [cat.capa]);
    const l = await linkPago(ana, venda, 7_900);
    await db.query("update public.caixa_cartao set conferido_em = now() - interval '2 minutes' where id = $1", [l.id]);
    expect((await aConferir()).map((x) => [x.id, x.situacao])).toEqual([[l.id, "pago"]]);
    expect(await aplicar(l.id, { link_id: l.link, situacao: "estornado", id_no_provedor: l.cobranca, valor_centavos: 7_900 })).toBe("estorno_registrado");
    expect(await recusaAoConcluir(ana, venda, [])).toBe("OR009");
    expect(await comoLoja(ana, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [venda])).toBe(true);

    const concluida = await vendaCom(ana, [cat.capa]);
    const p = await linkPago(ana, concluida, 7_900);
    await concluir(ana, concluida, []);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await comoLoja(dono, "select public.abrir_caixa(0, $1) as v", [chave("caixa")]);
    expect(await comoLoja(dono, "select public.cancelar_venda($1, 'Cliente desistiu da capa') as v", [concluida])).toBe(true);
    expect((await pagamentosDa(concluida)).map((x) => [x.meio, x.situacao])).toEqual([["cartao_asaas", "estorno_pendente"]]);
    expect((await db.query("select meio, valor_centavos::int as valor from public.estornos_externos where venda_id = $1", [concluida])).rows)
      .toEqual([{ meio: "cartao_asaas", valor: 7_900 }]);

    for (const sql of ["select public.caixa_cartao_situacao(true, null)", "select public.caixa_cartao_a_criar(10)", "select public.caixa_cartao_a_conferir(10)",
      "select public.caixa_cartao_a_desativar(10)"]) {
      expect(await recusaALoja(ana, sql), sql).toBe("42501");
    }
    expect(await recusaALoja(ana, "select public.caixa_cartao_consulta_aplicar($1, '{}'::jsonb)", [p.id])).toBe("42501");
    expect(await recusaALoja(ana, "select public.caixa_cartao_link_desativado($1)", [p.id])).toBe("42501");
    expect(await recusaALoja(ana, "select public.caixa_cartao_link_registrar($1, 'x', 'https://x.invalid/abc', now())", [p.id])).toBe("42501");
    const colega = await naLoja(ids.vendedorAB, ids.lojaA);
    expect(await recusaALoja(colega, "select public.caixa_cartao_cancelar($1)", [p.id])).toBe("P0002");
    const ve = async (s: Sessao) => (await comoUsuario(db, s, () => db.query("select id from public.caixa_cartao where id = $1", [p.id]), { criarSessao: false })).rows.length;
    expect(await ve(colega)).toBe(1);
    expect(await ve(await naLoja(ids.gerenteB, ids.lojaB))).toBe(0);
    // O worker não registra link fora da forma (sem https, com espaço).
    const q = await pedir(ana, await vendaCom(ana, [cat.capa]), 1_000);
    await aCriar();
    for (const url of ["http://sandbox.asaas.invalid/c/x", "https://sandbox.asaas.invalid/c x"]) {
      expect(await recusaAoServico("select public.caixa_cartao_link_registrar($1, 'lnk_x', $2, now() + interval '1 hour')", [q.id, url]), url).toBe("22023");
    }
  });
});
