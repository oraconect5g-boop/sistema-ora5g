// Lote PAY-014a (24/11/2026; ORA-PAY-014, ORA-ONLINE-002 e ORA-PAY-008; ADR-025; migration do pagamento pelo site): o
// pagamento do pedido do site pela Asaas, com o Pix pelo link de pagamento. O visitante pede para pagar; o worker cria o
// link, recebe os avisos (só com o token conferido) e pergunta de novo à Asaas; só a reconsulta confirma, e o banco confere
// o link, o valor e a passagem da situação. Token, links e pagamentos FICTÍCIOS; cada teste numa transação desfeita.
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
const chave = (p: string) => `${p}:pagamento:${String(++chaves).padStart(5, "0")}`;
const novoWhatsapp = () => `419876${String(++whatsapps).padStart(5, "0")}`;
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
  const s = { usuario, sessao: `4e200000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
type Pagamento = { disponivel: boolean; situacao: string | null; link: string | null; valor_centavos: number | null; pago_em: string | null };
type Pedido = { codigo: string; situacao: string; expira_em: string; total_centavos: number; pagamento: Pagamento };
/** Um pedido do site (o visitante), com o WhatsApp dele. */
async function pedido(itens: string[] = [cat.capa], loja = ids.lojaA) {
  const whatsapp = novoWhatsapp();
  const p = await comoUsuario(db, null, async () => (await db.query<{ v: Pedido }>("select public.loja_pedir($1, $2, $3::jsonb, $4, $5, $6) as v",
    [ids.organizacao, loja, JSON.stringify(itens.map((v) => ({ variante: v }))), "Cliente do Site", whatsapp, chave("p")])).rows[0]?.v as Pedido);
  return { ...p, whatsapp };
}
const visitante = <T>(sql: string, params: unknown[]) => comoUsuario(db, null, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const recusaAoVisitante = (sql: string, params: unknown[]) => comoUsuario(db, null, () => erroDe(() => db.query(sql, params)));
const PAGAR = "select public.loja_pagamento_pedir($1, $2, $3) as v";
const pagar = (p: { codigo: string; whatsapp: string }) => visitante<Pedido | null>(PAGAR, [ids.organizacao, p.codigo, p.whatsapp]);
const consultar = (p: { codigo: string; whatsapp: string }) =>
  visitante<Pedido | null>("select public.loja_pedido_consultar($1, $2, $3) as v", [ids.organizacao, p.codigo, p.whatsapp]);
const RECEBER = "select public.pagamento_aviso_receber($1, $2::jsonb) as v";
const receber = (aviso: Record<string, unknown>, token = TOKEN) => visitante<string>(RECEBER, [token, JSON.stringify(aviso)]);
/** O worker dos pagamentos (a chave secreta do servidor). */
async function servico<T>(sql: string, params: unknown[] = []): Promise<T> {
  await db.exec("set role service_role");
  try { return (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T; } finally { await db.exec("reset role"); }
}
async function recusaAoServico(sql: string, params: unknown[] = []) {
  await db.exec("set role service_role");
  try { return await erroDe(() => db.query(sql, params)); } finally { await db.exec("reset role"); }
}
const ligar = () => servico<boolean>("select public.pagamento_ligar('sandbox', 'wh_ficticio_1', $1) as v", [IMPRESSAO]);
type ACriar = { id: string; valor_centavos: number; tentativa: number; codigo: string; vence_em: string };
const aCriar = () => servico<ACriar[]>("select public.pagamentos_a_criar(10) as v");
const registrarLink = (id: string, link: string) => servico<string>("select public.pagamento_link_registrar($1, $2, $3) as v", [id, link, `https://sandbox.asaas.com/c/${link}`]);
/** O id do pedido (para a loja cancelar). */
const idDoPedido = async (codigo: string) => (await db.query<{ id: string }>("select id from public.loja_pedidos where codigo = $1", [codigo])).rows[0]?.id as string;
const pagamentoDo = async (codigo: string) => (await db.query<Record<string, unknown>>(
  "select pg.* from public.loja_pagamentos pg join public.loja_pedidos p on p.id = pg.pedido_id where p.codigo = $1", [codigo])).rows[0];
/** O pedido pago a caminho: ligado, o visitante pediu, o worker criou o link. Devolve o pedido e o id do pagamento. */
async function aguardando(link: string, itens: string[] = [cat.capa]) {
  const p = await pedido(itens);
  await pagar(p);
  const lote = await aCriar();
  const item = lote.find((x) => x.codigo === p.codigo) as ACriar;
  expect(await registrarLink(item.id, link)).toBe("registrado");
  return { ...p, pagamento: item.id };
}
type Consulta = { situacao: string; valor_centavos: number; link: string; id_no_provedor: string };
const aplicar = (aviso: string, consulta: Consulta) => servico<string>("select public.pagamento_consulta_aplicar($1, $2::jsonb) as v", [aviso, JSON.stringify(consulta)]);
const avisoDe = (id: string, link: string, evento = "PAYMENT_RECEIVED", valor: number | null = 79, pagamento = `pay_${id}`) =>
  ({ id, evento, pagamento, link, valor, situacao: evento === "PAYMENT_REFUNDED" ? "REFUNDED" : "RECEIVED" });

describe("o pagamento pelo site desligado e o ligar (PAY-014a)", () => {
  it("desligado: a visão do pedido diz que não está disponível e pedir para pagar é recusado (OR049); ligar só pelo worker e com dados válidos", async () => {
    const p = await pedido();
    expect((await consultar(p))?.pagamento).toEqual({ disponivel: false, situacao: null, link: null, valor_centavos: null, pago_em: null });
    const DISPONIVEL = "select public.loja_pagamento_disponivel() as v";
    expect(await visitante<boolean>(DISPONIVEL, [])).toBe(false);
    expect(await recusaAoVisitante(PAGAR, [ids.organizacao, p.codigo, p.whatsapp])).toBe("OR049");
    expect(await recusaAoVisitante("select public.pagamento_ligar('sandbox', 'wh_1', $1)", [IMPRESSAO])).toBe("42501");
    for (const [ambiente, webhook, impressao] of [["teste", "wh_1", IMPRESSAO], ["sandbox", "wh com espaço", IMPRESSAO], ["sandbox", "wh_1", "abc"]]) {
      expect(await recusaAoServico("select public.pagamento_ligar($1, $2, $3)", [ambiente, webhook, impressao]), String(ambiente)).toBe("22023");
    }
    expect(await servico("select public.pagamento_configuracao() as v")).toEqual({ ligado: false, ambiente: null, webhook_id: null });
    expect(await ligar()).toBe(true);
    expect(await servico("select public.pagamento_configuracao() as v")).toEqual({ ligado: true, ambiente: "sandbox", webhook_id: "wh_ficticio_1" });
    expect((await consultar(p))?.pagamento.disponivel).toBe(true);
    expect(await visitante<boolean>(DISPONIVEL, [])).toBe(true);
  });
});

describe("o visitante pede para pagar (PAY-014a)", () => {
  it("com o código e o WhatsApp do pedido: o pagamento a criar, do valor do pedido; repetir não cria outro; o par errado não acha", async () => {
    await ligar();
    const p = await pedido([cat.capa, cat.capa]);
    const visto = await pagar(p);
    expect(visto?.pagamento).toEqual({ disponivel: true, situacao: "criando", link: null, valor_centavos: 7_900 * 2, pago_em: null });
    expect((await pagar(p))?.pagamento.situacao).toBe("criando");
    expect((await db.query("select count(*)::int as n from public.loja_pagamentos")).rows).toEqual([{ n: 1 }]);
    expect(await pagar({ codigo: p.codigo, whatsapp: "41900000000" })).toBeNull();
    expect(await pagar({ codigo: "AAAAAA", whatsapp: p.whatsapp })).toBeNull();
  });

  it("o pedido vencido, cancelado ou atendido não se paga pelo site (OR050)", async () => {
    await ligar();
    const vencido = await pedido();
    await db.query("update public.loja_pedidos set expira_em = now() - interval '1 minute' where codigo = $1", [vencido.codigo]);
    expect(await recusaAoVisitante(PAGAR, [ids.organizacao, vencido.codigo, vencido.whatsapp])).toBe("OR050");
    const cancelado = await pedido();
    const dono = await naLoja(ids.dono, ids.lojaA);
    const linha = await idDoPedido(cancelado.codigo);
    await comoUsuario(db, dono, () => db.query("select public.loja_pedido_cancelar($1, 'Cliente desistiu')", [linha]), { criarSessao: false });
    expect(await recusaAoVisitante(PAGAR, [ids.organizacao, cancelado.codigo, cancelado.whatsapp])).toBe("OR050");
  });
});
describe("o worker cria o link (PAY-014a)", () => {
  it("os pagamentos a criar vêm reservados, com o código e o dia do vencimento; o link registrado aparece na visão do pedido; repetir o mesmo link não muda", async () => {
    await ligar();
    const p = await pedido();
    await pagar(p);
    const lote = await aCriar();
    expect(lote).toHaveLength(1);
    const vence = (await db.query<{ v: string }>("select to_char((expira_em at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as v from public.loja_pedidos where codigo = $1", [p.codigo])).rows[0]?.v;
    expect(lote[0]).toMatchObject({ valor_centavos: 7_900, tentativa: 1, codigo: p.codigo, vence_em: vence });
    expect(await aCriar()).toEqual([]);
    const id = lote[0]?.id as string;
    expect(await registrarLink(id, "lnk_1")).toBe("registrado");
    expect(await registrarLink(id, "lnk_1")).toBe("repetido");
    expect(await recusaAoServico("select public.pagamento_link_registrar($1, 'lnk_2', 'https://sandbox.asaas.com/c/lnk_2')", [id])).toBe("P0002");
    expect(await recusaAoServico("select public.pagamento_link_registrar($1, 'lnk_3', 'http://inseguro.invalid/x')", [id])).toBe("22023");
    expect((await consultar(p))?.pagamento).toMatchObject({ situacao: "aguardando", link: "https://sandbox.asaas.com/c/lnk_1" });
  });

  it("a falha volta para a fila; a recusa da Asaas para de vez; sem motivo, recusada", async () => {
    await ligar();
    const p = await pedido();
    await pagar(p);
    const [item] = await aCriar();
    expect(await servico("select public.pagamento_criacao_falhou($1, 'tempo esgotado', false) as v", [item?.id])).toBe("criando");
    const [de_novo] = await aCriar();
    expect(de_novo).toMatchObject({ id: item?.id, tentativa: 2 });
    expect(await recusaAoServico("select public.pagamento_criacao_falhou($1, '  ', false)", [item?.id])).toBe("22023");
    expect(await servico("select public.pagamento_criacao_falhou($1, 'recusado pela Asaas: 400', true) as v", [item?.id])).toBe("falhou");
    expect(await aCriar()).toEqual([]);
    expect((await consultar(p))?.pagamento.situacao).toBe("falhou");
  });
});

describe("o aviso da Asaas (PAY-014a)", () => {
  it("só passa com o token conferido; guardado uma vez pelo id do evento; fora do formato, recusado", async () => {
    expect(await recusaAoVisitante(RECEBER, [TOKEN, JSON.stringify(avisoDe("evt_1", "lnk_1"))])).toBe("42501");
    await ligar();
    expect(await recusaAoVisitante(RECEBER, ["token-errado-com-tamanho-suficiente-0000000000", JSON.stringify(avisoDe("evt_1", "lnk_1"))])).toBe("42501");
    expect(await receber(avisoDe("evt_1", "lnk_1"))).toBe("guardado");
    expect(await receber(avisoDe("evt_1", "lnk_1"))).toBe("repetido");
    // O id no formato do exemplo da documentação da Asaas, com "&" (fictício).
    const DA_ASAAS = "evt_05b708f961d739ea7eba7e4db318f621&368604920";
    expect(await receber(avisoDe(DA_ASAAS, "lnk_1", "PAYMENT_RECEIVED", 79, "pay_080225913252"))).toBe("guardado");
    for (const ruim of [
      ...["evt_8\u0007", "e".repeat(201), "", "evt 9"].map((id) => avisoDe(id, "lnk_1", "PAYMENT_RECEIVED", 79, "pay_080225913252")),
      { ...avisoDe("evt_2", "lnk_1"), evento: "payment_received" }, { ...avisoDe("evt_3", "lnk_1"), valor: 1.234 }, { ...avisoDe("evt_4", "lnk_1"), valor: -1 },
      { ...avisoDe("evt_5", "lnk_1"), link: "lnk com espaço" }, { ...avisoDe("evt 6", "lnk_1") }, { ...avisoDe("evt_7", "lnk_1"), valor: "79" },
    ]) expect(await recusaAoVisitante(RECEBER, [TOKEN, JSON.stringify(ruim)]), JSON.stringify(ruim)).toBe("22023");
    expect((await db.query("select id, valor_centavos, situacao_informada from privado.pagamento_avisos order by id")).rows).toEqual([
      { id: DA_ASAAS, valor_centavos: 7_900, situacao_informada: "RECEIVED" }, { id: "evt_1", valor_centavos: 7_900, situacao_informada: "RECEIVED" },
    ]);
  });
});

describe("a reconsulta confirma (PAY-014a)", () => {
  type Aviso = { aviso: string; pagamento: { id: string; situacao: string } | null };
  const aProcessar = () => servico<Aviso[]>("select public.pagamento_avisos_a_processar(20) as v");

  it("o pago confirma, guarda o pedido e as reservas por 7 dias e não se cancela (OR048); o mesmo aviso e outro aviso do mesmo pagamento não mudam nada; o estorno solta o cancelamento", async () => {
    await ligar();
    const p = await aguardando("lnk_pago");
    expect(await receber(avisoDe("evt_10", "lnk_pago"))).toBe("guardado");
    const lote = await aProcessar();
    expect(lote.map((a) => [a.aviso, a.pagamento?.id, a.pagamento?.situacao])).toEqual([["evt_10", p.pagamento, "aguardando"]]);
    const consulta = { situacao: "pago", valor_centavos: 7_900, link: "lnk_pago", id_no_provedor: "pay_10" };
    expect(await aplicar("evt_10", consulta)).toBe("confirmado");
    expect(await aplicar("evt_10", consulta)).toBe("confirmado");
    const datas = (await db.query<{ pedido: boolean; reserva: boolean; estoque: boolean }>(`
      select (p.expira_em between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days') as pedido,
        bool_and(r.expira_em = p.expira_em) as reserva, bool_and(er.expira_em = p.expira_em) as estoque
      from public.loja_pedidos p join public.loja_reservas r on r.pedido_id = p.id join public.estoque_reservas er on er.id = r.estoque_reserva_id
      where p.codigo = $1 group by p.expira_em`, [p.codigo])).rows[0];
    expect(datas).toEqual({ pedido: true, reserva: true, estoque: true });
    expect((await consultar(p))?.pagamento).toMatchObject({ situacao: "pago", link: null });
    expect(await receber(avisoDe("evt_11", "lnk_pago", "PAYMENT_CONFIRMED"))).toBe("guardado");
    expect(await aplicar("evt_11", consulta)).toBe("ja_registrado");
    const dono = await naLoja(ids.dono, ids.lojaA);
    const pedidoId = await idDoPedido(p.codigo);
    expect(await comoUsuario(db, dono, () => erroDe(() => db.query("select public.loja_pedido_cancelar($1, 'Cliente desistiu')", [pedidoId])), { criarSessao: false })).toBe("OR048");
    expect(await receber(avisoDe("evt_12", "lnk_pago", "PAYMENT_REFUNDED"))).toBe("guardado");
    expect(await aplicar("evt_12", { ...consulta, situacao: "estornado" })).toBe("estorno_registrado");
    expect((await pagamentoDo(p.codigo))?.situacao).toBe("estornado");
    expect(await comoUsuario(db, dono, async () => (await db.query<{ v: boolean }>("select public.loja_pedido_cancelar($1, 'Cliente desistiu') as v", [pedidoId])).rows[0]?.v, { criarSessao: false })).toBe(true);
  });

  it("o valor diferente e a situação desconhecida viram divergência sem mudar a situação; o link de outro pagamento e o aviso de link desconhecido ficam de fora", async () => {
    await ligar();
    const p = await aguardando("lnk_div");
    await receber(avisoDe("evt_20", "lnk_div"));
    expect(await aplicar("evt_20", { situacao: "pago", valor_centavos: 7_800, link: "lnk_div", id_no_provedor: "pay_20" })).toBe("divergencia");
    expect(await pagamentoDo(p.codigo)).toMatchObject({ situacao: "aguardando", divergencia: "o valor pago é outro" });
    await receber(avisoDe("evt_21", "lnk_div"));
    expect(await aplicar("evt_21", { situacao: "desconhecida", valor_centavos: 7_900, link: "lnk_div", id_no_provedor: "pay_21" })).toBe("situacao_desconhecida");
    // A reconsulta diz outro link: não é deste aviso.
    await receber(avisoDe("evt_22", "lnk_div"));
    expect(await aplicar("evt_22", { situacao: "pago", valor_centavos: 7_900, link: "lnk_outro", id_no_provedor: "pay_22" })).toBe("link_desconhecido");
    expect((await pagamentoDo(p.codigo))?.situacao).toBe("aguardando");
    // O aviso de um link que ainda não conhecemos espera uma hora; depois, volta sem pagamento.
    await receber(avisoDe("evt_23", "lnk_nenhum"));
    expect((await aProcessar()).map((a) => a.aviso)).not.toContain("evt_23");
    await db.query("update privado.pagamento_avisos set recebido_em = now() - interval '61 minutes', reservado_ate = null where id = 'evt_23'");
    const lote = await aProcessar();
    expect(lote.find((a) => a.aviso === "evt_23")?.pagamento).toBeNull();
    expect(await servico("select public.pagamento_aviso_concluir('evt_23', 'link_desconhecido') as v")).toBe(true);
    expect(await servico("select public.pagamento_aviso_concluir('evt_23', 'link_desconhecido') as v")).toBe(false);
    expect(await recusaAoServico("select public.pagamento_consulta_aplicar('evt_20', '{\"situacao\": \"pago\"}'::jsonb)")).toBe("22023");
  });

  it("o pago depois de o pedido vencer fica pago, mas vira divergência e não estende o pedido", async () => {
    await ligar();
    const p = await aguardando("lnk_tarde");
    await db.query("update public.loja_pedidos set expira_em = now() - interval '1 minute' where codigo = $1", [p.codigo]);
    await receber(avisoDe("evt_30", "lnk_tarde"));
    expect(await aplicar("evt_30", { situacao: "pago", valor_centavos: 7_900, link: "lnk_tarde", id_no_provedor: "pay_30" })).toBe("confirmado");
    expect(await pagamentoDo(p.codigo)).toMatchObject({ situacao: "pago", divergencia: "pago depois de o pedido vencer ou ser cancelado" });
    expect((await db.query<{ v: boolean }>("select expira_em <= now() as v from public.loja_pedidos where codigo = $1", [p.codigo])).rows[0]?.v).toBe(true);
  });
});

describe("os links a desativar (PAY-014a)", () => {
  it("o pedido cancelado ou vencido sem pagamento: o link sai da lista depois de desativado; o pagamento sem link é cancelado na hora; o pago não entra", async () => {
    await ligar();
    const cancelado = await aguardando("lnk_canc");
    const dono = await naLoja(ids.dono, ids.lojaA);
    const idCancelado = await idDoPedido(cancelado.codigo);
    await comoUsuario(db, dono, () => db.query("select public.loja_pedido_cancelar($1, 'Cliente desistiu')", [idCancelado]), { criarSessao: false });
    const semLink = await pedido();
    await pagar(semLink);
    await db.query("update public.loja_pedidos set expira_em = now() - interval '1 minute' where codigo = $1", [semLink.codigo]);
    const pago = await aguardando("lnk_ok");
    await receber(avisoDe("evt_40", "lnk_ok"));
    await aplicar("evt_40", { situacao: "pago", valor_centavos: 7_900, link: "lnk_ok", id_no_provedor: "pay_40" });
    const lista = await servico<{ id: string; link: string }[]>("select public.pagamentos_a_desativar(20) as v");
    expect(lista).toEqual([{ id: cancelado.pagamento, link: "lnk_canc" }]);
    expect((await pagamentoDo(semLink.codigo))?.situacao).toBe("cancelado");
    expect(await servico("select public.pagamento_link_desativado($1) as v", [cancelado.pagamento])).toBe(true);
    expect(await servico("select public.pagamento_link_desativado($1) as v", [cancelado.pagamento])).toBe(false);
    expect(await servico("select public.pagamentos_a_desativar(20) as v")).toEqual([]);
    expect((await pagamentoDo(pago.codigo))?.situacao).toBe("pago");
  });
});

describe("quem pode o quê (PAY-014a)", () => {
  it("as funções do worker só com a chave do servidor; a loja lê os pagamentos dela (RLS), a outra loja e o visitante, não", async () => {
    await ligar();
    const p = await aguardando("lnk_rls");
    const vendedora = await naLoja(ids.vendedorA, ids.lojaA);
    for (const sql of ["select public.pagamentos_a_criar(1)", "select public.pagamento_avisos_a_processar(1)", "select public.pagamentos_a_desativar(1)", "select public.pagamento_configuracao()"]) {
      expect(await comoUsuario(db, vendedora, () => erroDe(() => db.query(sql)), { criarSessao: false }), sql).toBe("42501");
      expect(await recusaAoVisitante(sql, []), sql).toBe("42501");
    }
    const ler = (s: Sessao) => comoUsuario(db, s, async () => (await db.query<{ link_id: string }>("select link_id from public.loja_pagamentos")).rows.map((r) => r.link_id), { criarSessao: false });
    expect(await ler(vendedora)).toEqual(["lnk_rls"]);
    expect(await ler(await naLoja(ids.gerenteB, ids.lojaB))).toEqual([]);
    expect(await recusaAoVisitante("select * from public.loja_pagamentos", [])).toBe("42501");
    expect(p.codigo).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
