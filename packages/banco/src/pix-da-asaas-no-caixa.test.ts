// Lote PAY-015a (25/11/2026; ORA-PAY-001, ORA-PAY-008 e ORA-PAY-014; a decisão D-062): o Pix pela Asaas no caixa. A
// vendedora pede o QR Code da sua venda aberta (até o que falta pagar); o worker cria o QR na Asaas e confere a cada rodada;
// só a consulta confirma; a conclusão põe a linha "Pix pela Asaas" sozinha, e a venda não conclui com um QR esperando. QR,
// cobranças e imagens FICTÍCIOS; cada teste numa transação desfeita.
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
let qrs = 0;
const chave = (p: string) => `${p}:pix:${String(++chaves).padStart(5, "0")}`;
const COPIA = "00020126580014br.gov.bcb.pix0136ficticio-0000-4000-8000-0000000000005204000053039865802BR5925ORA5G6009CURITIBA6304ABCD";
const IMAGEM = "iVBORw0KGgo".padEnd(400, "A");
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
  const s = { usuario, sessao: `4e500000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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

const ligar = () => servico("select public.caixa_pix_situacao(true, null) as v");
const pedir = (s: Sessao, venda: string, valor: number, k = chave("qr")) =>
  comoLoja<{ id: string; situacao: string; repetido?: boolean }>(s, "select public.caixa_pix_pedir($1, $2, $3) as v", [venda, valor, k]);
const recusaAoPedir = (s: Sessao, venda: string, valor: number, k = chave("qr")) => recusaALoja(s, "select public.caixa_pix_pedir($1, $2, $3)", [venda, valor, k]);
type ACriar = { id: string; valor_centavos: number; tentativa: number; venda_numero: number; validade_segundos: number };
const aCriar = () => servico<ACriar[]>("select public.caixa_pix_a_criar(10) as v");
const registrar = (id: string, qr = `qr${++qrs}`, expira = "now() + interval '30 minutes'") =>
  servico<string>(`select public.caixa_pix_qr_registrar($1, $2, $3, $4, ${expira}) as v`, [id, qr, COPIA, IMAGEM]);
const aConferir = () => servico<{ id: string; qr_id: string; situacao: string; valor_centavos: number }[]>("select public.caixa_pix_a_conferir(20) as v");
const aplicar = (id: string, consulta: object) => servico<string>("select public.caixa_pix_consulta_aplicar($1, $2::jsonb) as v", [id, JSON.stringify(consulta)]);
const pix = async (id: string) => (await db.query<{ situacao: string; qr_id: string | null; id_no_provedor: string | null; divergencia: string | null; qr_excluido_em: string | null }>(
  "select situacao, qr_id, id_no_provedor, divergencia, qr_excluido_em from public.caixa_pix where id = $1", [id])).rows[0];
const imagens = async (id: string) => (await db.query("select 1 from privado.caixa_pix_imagens where pix_id = $1", [id])).rows.length;
/** Um QR pedido, criado pelo worker e esperando o pagamento. */
async function qrEsperando(s: Sessao, venda: string, valor: number) {
  const { id } = await pedir(s, venda, valor);
  expect((await aCriar()).map((x) => x.id)).toContain(id);
  const qr = `qr${++qrs}`;
  expect(await registrar(id, qr)).toBe("registrado");
  return { id, qr };
}
/** Um QR pago (o worker conferiu na Asaas). */
async function qrPago(s: Sessao, venda: string, valor: number) {
  const q = await qrEsperando(s, venda, valor);
  const cobranca = `pay_caixa_${q.qr}`;
  expect(await aplicar(q.id, { qr_id: q.qr, situacao: "pago", id_no_provedor: cobranca, valor_centavos: valor })).toBe("confirmado");
  return { ...q, cobranca };
}

const CONCLUIR = "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v";
type Concluida = { venda: string; total: number; troco: number; recebido: number; pago_no_pix: number; repetida: boolean };
const concluir = (s: Sessao, venda: string, pagamentos: object[], k = chave("concluir")) => comoLoja<Concluida>(s, CONCLUIR, [venda, JSON.stringify(pagamentos), k]);
const recusaAoConcluir = (s: Sessao, venda: string, pagamentos: object[]) => recusaALoja(s, CONCLUIR, [venda, JSON.stringify(pagamentos), chave("concluir")]);
const pagamentosDa = async (venda: string) => (await db.query<{ ordem: number; meio: string; valor_centavos: number; confirmacao: string; comprovante: string | null; caixa_pix_id: string | null; situacao: string }>(
  "select ordem, meio, valor_centavos::int, confirmacao, comprovante, caixa_pix_id, situacao from public.venda_pagamentos where venda_id = $1 order by ordem", [venda])).rows;
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

describe("o Pix pela Asaas no caixa (PAY-015a)", () => {
  it("desligado até o worker conferir a chave Pix; ligado, a vendedora pede o QR da sua venda, até o que falta pagar; o clique repetido devolve o mesmo", async () => {
    const ana = await vendedoraComCaixa();
    const venda = await vendaCom(ana, [cat.capa]);
    expect(await recusaAoPedir(ana, venda, 7_900)).toBe("OR058");
    await ligar();
    const k = chave("qr");
    const primeiro = await pedir(ana, venda, 7_900, k);
    expect(primeiro).toMatchObject({ situacao: "criando" });
    expect(await pedir(ana, venda, 7_900, k)).toMatchObject({ id: primeiro.id, repetido: true });
    expect(await recusaAoPedir(ana, venda, 7_000, k)).toBe("OR004");
    // O QR não passa do que falta pagar (o pedido que espera já conta).
    expect(await recusaAoPedir(ana, venda, 1)).toBe("OR009");
    expect(await recusaAoPedir(ana, venda, 0)).toBe("22023");
    // A venda é da vendedora: a colega da mesma loja não pede QR para ela.
    expect(await recusaAoPedir(await naLoja(ids.vendedorAB, ids.lojaA), venda, 100)).toBe("P0002");
    // A conta sem chave Pix ativa, ou o worker parado por mais de 5 minutos: desligado.
    await servico("select public.caixa_pix_situacao(false, 'a conta da Asaas não tem chave Pix ativa') as v");
    const outra = await vendaCom(ana, [cat.capa]);
    // Numa transação o now() é um só: as vendas ganham horas diferentes, como teriam no caixa de verdade.
    await db.query("update public.vendas set criado_em = now() + interval '1 second' where id = $1", [outra]);
    expect(await recusaAoPedir(ana, outra, 7_900)).toBe("OR058");
    await ligar();
    await db.query("update privado.pagamento_pelo_site set caixa_pix_conferido_em = now() - interval '6 minutes'");
    expect(await recusaAoPedir(ana, outra, 7_900)).toBe("OR058");
    expect(await comoLoja<{ ligado: boolean }>(ana, "select public.caixa_pix_da_venda($1) as v", [outra])).toMatchObject({ ligado: false, venda: outra, pix: [] });
    // Sem a venda: a aberta da tela do PDV (a mais nova da vendedora na loja do turno), com o QR que ela pediu.
    expect(await comoLoja<{ venda: string; pix: { id: string }[] }>(ana, "select public.caixa_pix_da_venda() as v")).toMatchObject({ venda: outra, pix: [] });
    await ligar();
    const ultima = await vendaCom(ana, [cat.capa]);
    await db.query("update public.vendas set criado_em = now() + interval '2 seconds' where id = $1", [ultima]);
    const doUltimo = await pedir(ana, ultima, 7_900);
    expect(await comoLoja<{ venda: string; pix: { id: string }[] }>(ana, "select public.caixa_pix_da_venda() as v"))
      .toMatchObject({ ligado: true, venda: ultima, pix: [{ id: doUltimo.id }] });
    // Sem venda aberta: nada; sem a permissão de vender, recusado.
    const bia = await naLoja(ids.vendedorAB, ids.lojaA);
    expect(await comoLoja(bia, "select public.caixa_pix_da_venda() as v")).toEqual({ ligado: true, venda: null, pix: [] });
    expect(await recusaALoja(await naLoja(ids.tecnico, ids.assistencia), "select public.caixa_pix_da_venda()")).toBe("42501");
  });

  it("o worker cria o QR (a imagem só enquanto espera); a venda não conclui com QR esperando; só a consulta confirma; a conclusão põe a linha do Pix", async () => {
    const ana = await vendedoraComCaixa();
    await ligar();
    const venda = await vendaCom(ana, [cat.capa]);
    const { id } = await pedir(ana, venda, 7_900);
    const lote = await aCriar();
    expect(lote.find((x) => x.id === id)).toMatchObject({ valor_centavos: 7_900, tentativa: 1, validade_segundos: 1_800 });
    expect(await aCriar()).toEqual([]); // reservado por 1 minuto
    expect(await registrar(id, "qr_unico_1")).toBe("registrado");
    expect(await registrar(id, "qr_unico_1")).toBe("repetido");
    const tela = await comoLoja<{ ligado: boolean; pix: { situacao: string; copia_e_cola: string | null; imagem: string | null }[] }>(ana, "select public.caixa_pix_da_venda($1) as v", [venda]);
    expect(tela).toMatchObject({ ligado: true, pix: [{ situacao: "aguardando", copia_e_cola: COPIA, imagem: IMAGEM }] });
    expect(await recusaAoConcluir(ana, venda, [{ meio: "dinheiro", valor: 7_900 }])).toBe("OR059");

    expect((await aConferir()).map((x) => x.id)).toEqual([id]);
    expect(await aConferir()).toEqual([]); // reservado por 30 segundos
    expect(await aplicar(id, { qr_id: "qr_unico_1", situacao: "nenhum" })).toBe("pendente");
    // Outro QR ou outro valor: nada muda.
    expect(await aplicar(id, { qr_id: "qr_outro", situacao: "pago", id_no_provedor: "pay_x", valor_centavos: 7_900 })).toBe("qr_desconhecido");
    expect(await aplicar(id, { qr_id: "qr_unico_1", situacao: "pago", id_no_provedor: "pay_x", valor_centavos: 7_000 })).toBe("divergencia");
    expect(await pix(id)).toMatchObject({ situacao: "aguardando", divergencia: "o valor pago é outro" });
    expect(await aplicar(id, { qr_id: "qr_unico_1", situacao: "pago", id_no_provedor: "pay_unico_1", valor_centavos: 7_900 })).toBe("confirmado");
    expect(await aplicar(id, { qr_id: "qr_unico_1", situacao: "pago", id_no_provedor: "pay_unico_1", valor_centavos: 7_900 })).toBe("ja_registrado");
    expect(await imagens(id)).toBe(0);
    expect((await comoLoja<{ pix: { situacao: string; imagem: string | null }[] }>(ana, "select public.caixa_pix_da_venda($1) as v", [venda])).pix)
      .toMatchObject([{ situacao: "pago", imagem: null, copia_e_cola: null }]);

    const k = chave("concluir");
    expect(await concluir(ana, venda, [], k)).toMatchObject({ total: 7_900, troco: 0, recebido: 7_900, pago_no_pix: 7_900, repetida: false });
    expect(await concluir(ana, venda, [], k)).toMatchObject({ venda, repetida: true });
    expect(await pagamentosDa(venda)).toEqual([
      { ordem: 1, meio: "pix_asaas", valor_centavos: 7_900, confirmacao: "provedor", comprovante: "pay_unico_1", caixa_pix_id: id, situacao: "confirmado" }]);
    expect((await db.query("select tipo, meio, valor_centavos::int as valor from public.caixa_movimentos where venda_id = $1", [venda])).rows)
      .toEqual([{ tipo: "recebimento", meio: "pix_asaas", valor: 7_900 }]);
    // A tela não declara o Pix pela Asaas: digitado, é recusado.
    const outra = await vendaCom(ana, [cat.capa]);
    expect(await recusaAoConcluir(ana, outra, [{ meio: "pix_asaas", valor: 7_900 }])).toBe("OR009");
  });

  it("o pagamento misto: Pix pela Asaas e dinheiro com troco; o Pix pago que passa do total não conclui; a venda aberta com Pix pago não se cancela (OR048)", async () => {
    const ana = await vendedoraComCaixa();
    await ligar();
    const venda = await vendaCom(ana, [cat.capa, cat.capa]);
    const q = await qrPago(ana, venda, 10_000);
    expect(await recusaALoja(ana, "select public.caixa_pix_cancelar($1)", [q.id])).toBe("OR048");
    expect(await recusaALoja(ana, "select public.cancelar_venda($1, 'Cliente desistiu')", [venda])).toBe("OR048");
    expect(await recusaAoConcluir(ana, venda, [{ meio: "pix_direto", valor: 5_000, comprovante: "E1234567" }])).toBe("OR009"); // falta 800
    expect(await concluir(ana, venda, [{ meio: "dinheiro", valor: 6_000 }])).toMatchObject({ total: 15_800, troco: 200, recebido: 15_800, pago_no_pix: 10_000 });
    expect((await pagamentosDa(venda)).map((x) => [x.ordem, x.meio, x.valor_centavos])).toEqual([[1, "pix_asaas", 10_000], [2, "dinheiro", 6_000]]);

    // O desconto depois do Pix pago, que deixa o total abaixo do pago: não conclui (o que passa volta pela Asaas).
    await db.query(`update public.categorias c set desconto_teto_pb = 1000, margem_minima_pb = 0 from public.variantes v
      join public.produtos p on p.id = v.produto_id where v.id = $1 and c.id = p.categoria_id`, [cat.capa]);
    const segunda = await vendaCom(ana, [cat.capa]);
    await qrPago(ana, segunda, 7_900);
    const [item] = (await db.query<{ id: string }>("select id from public.venda_itens where venda_id = $1", [segunda])).rows;
    expect(await comoLoja(ana, "select public.aplicar_desconto($1, 300) as v", [item?.id])).toBe("dentro_do_limite");
    expect(await recusaAoConcluir(ana, segunda, [])).toBe("OR009");
  });

  it("cancelar: o QR que o worker não pediu sai na hora; o que está na Asaas o worker confere antes de excluir (o pago no meio tempo fica pago); o vencido sai; cancelar a venda leva os QR", async () => {
    const ana = await vendedoraComCaixa();
    await ligar();
    const venda = await vendaCom(ana, [cat.capa, cat.capa, cat.capa]);
    const a = await pedir(ana, venda, 1_000);
    expect(await comoLoja(ana, "select public.caixa_pix_cancelar($1) as v", [a.id])).toBe("cancelado");
    // B: a venda desiste enquanto o worker cria; o QR criado fica só para excluir.
    const b = await pedir(ana, venda, 1_000);
    await aCriar();
    expect(await comoLoja(ana, "select public.caixa_pix_cancelar($1) as v", [b.id])).toBe("cancelando");
    expect(await registrar(b.id, "qr_b")).toBe("cancelar");
    expect(await imagens(b.id)).toBe(0);
    expect((await aConferir()).map((x) => x.id)).toContain(b.id);
    expect(await aplicar(b.id, { qr_id: "qr_b", situacao: "nenhum" })).toBe("pode_excluir");
    expect(await servico("select public.caixa_pix_qr_excluido($1) as v", [b.id])).toBe("cancelado");
    // C: o cliente paga no instante em que a vendedora cancela: o pago vale.
    const c = await qrEsperando(ana, venda, 2_000);
    expect(await comoLoja(ana, "select public.caixa_pix_cancelar($1) as v", [c.id])).toBe("cancelando");
    expect(await recusaAoConcluir(ana, venda, [{ meio: "dinheiro", valor: 23_700 }])).toBe("OR059");
    expect(await aplicar(c.id, { qr_id: c.qr, situacao: "pago", id_no_provedor: "pay_c", valor_centavos: 2_000 })).toBe("confirmado");
    expect(await pix(c.id)).toMatchObject({ situacao: "pago", divergencia: null });
    // D: vence sem pagamento (2 minutos de folga depois da validade) e o worker exclui o QR.
    const d = await qrEsperando(ana, venda, 3_000);
    await db.query("update public.caixa_pix set expira_em = now() - interval '3 minutes' where id = $1", [d.id]);
    expect(await aplicar(d.id, { qr_id: d.qr, situacao: "nenhum" })).toBe("vencido");
    expect(await servico<{ id: string }[]>("select public.caixa_pix_a_excluir(20) as v")).toEqual([{ id: d.id, qr_id: d.qr }]);
    expect(await servico("select public.caixa_pix_qr_excluido($1) as v", [d.id])).toBe("vencido");
    expect(await pix(d.id)).toMatchObject({ situacao: "vencido" });
    expect((await pix(d.id))?.qr_excluido_em).not.toBeNull();
    // A venda conclui com o pago (C) e o resto em dinheiro.
    expect(await concluir(ana, venda, [{ meio: "dinheiro", valor: 21_700 }])).toMatchObject({ total: 23_700, pago_no_pix: 2_000 });

    // Cancelar a venda leva junto o QR que espera (cancelando) e o que o worker não pediu (cancelado).
    const outra = await vendaCom(ana, [cat.capa]);
    const e = await qrEsperando(ana, outra, 1_000);
    const f = await pedir(ana, outra, 1_000);
    expect(await comoLoja(ana, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [outra])).toBe(true);
    expect((await pix(e.id))?.situacao).toBe("cancelando");
    expect((await pix(f.id))?.situacao).toBe("cancelado");
    // Pago depois de a venda ser cancelada: vale como pago, com a divergência para devolver.
    expect(await aplicar(e.id, { qr_id: e.qr, situacao: "pago", id_no_provedor: "pay_e", valor_centavos: 1_000 })).toBe("confirmado");
    expect(await pix(e.id)).toMatchObject({ situacao: "pago", divergencia: "pago depois de a venda ser cancelada: devolva pela Asaas" });
  });

  it("o estorno: o pago de venda aberta é conferido de novo; estornado, sai da conta e a venda se cancela; concluída, cancelar põe o Pix como estorno externo a confirmar", async () => {
    const ana = await vendedoraComCaixa();
    await ligar();
    const venda = await vendaCom(ana, [cat.capa]);
    const q = await qrPago(ana, venda, 7_900);
    await db.query("update public.caixa_pix set conferido_em = now() - interval '2 minutes' where id = $1", [q.id]);
    expect((await aConferir()).map((x) => [x.id, x.situacao])).toEqual([[q.id, "pago"]]);
    expect(await aplicar(q.id, { qr_id: q.qr, situacao: "estornado", id_no_provedor: q.cobranca, valor_centavos: 7_900 })).toBe("estorno_registrado");
    expect(await recusaAoConcluir(ana, venda, [])).toBe("OR009"); // o estornado não conta
    expect(await comoLoja(ana, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [venda])).toBe(true);

    const concluida = await vendaCom(ana, [cat.capa]);
    const p = await qrPago(ana, concluida, 7_900);
    await concluir(ana, concluida, []);
    // A venda concluída não é conferida de novo; cancelar (o gerente) põe o Pix como estorno externo a confirmar.
    await db.query("update public.caixa_pix set conferido_em = now() - interval '2 minutes' where id = $1", [p.id]);
    expect((await aConferir()).map((x) => x.id)).not.toContain(p.id);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await comoLoja(dono, "select public.abrir_caixa(0, $1) as v", [chave("caixa")]);
    expect(await comoLoja(dono, "select public.cancelar_venda($1, 'Cliente desistiu da capa') as v", [concluida])).toBe(true);
    expect((await pagamentosDa(concluida)).map((x) => [x.meio, x.situacao])).toEqual([["pix_asaas", "estorno_pendente"]]);
    expect((await db.query("select meio, valor_centavos::int as valor from public.estornos_externos where venda_id = $1", [concluida])).rows)
      .toEqual([{ meio: "pix_asaas", valor: 7_900 }]);
  });

  it("quem pode: as funções do worker são só do servidor; a outra loja não lê; a colega não cancela nem vê o QR da venda da outra", async () => {
    const ana = await vendedoraComCaixa();
    await ligar();
    const venda = await vendaCom(ana, [cat.capa]);
    const q = await qrEsperando(ana, venda, 7_900);
    for (const sql of ["select public.caixa_pix_situacao(true, null)", "select public.caixa_pix_a_criar(10)", "select public.caixa_pix_a_conferir(10)",
      "select public.caixa_pix_a_excluir(10)"]) {
      expect(await recusaALoja(ana, sql), sql).toBe("42501");
    }
    expect(await recusaALoja(ana, "select public.caixa_pix_consulta_aplicar($1, '{}'::jsonb)", [q.id])).toBe("42501");
    expect(await recusaALoja(ana, "select public.caixa_pix_qr_excluido($1)", [q.id])).toBe("42501");
    const colega = await naLoja(ids.vendedorAB, ids.lojaA);
    expect(await recusaALoja(colega, "select public.caixa_pix_cancelar($1)", [q.id])).toBe("P0002");
    expect(await recusaALoja(colega, "select public.caixa_pix_da_venda($1)", [venda])).toBe("P0002");
    const ve = async (s: Sessao) => (await comoUsuario(db, s, () => db.query("select id from public.caixa_pix where id = $1", [q.id]), { criarSessao: false })).rows.length;
    expect(await ve(colega)).toBe(1); // quem vende na loja lê (o relatório da loja)
    expect(await ve(await naLoja(ids.gerenteB, ids.lojaB))).toBe(0);
    expect(await recusaALoja(ana, "select imagem from privado.caixa_pix_imagens")).toBe("42501");
    // O worker não registra QR sem forma e não aplica consulta fora da forma.
    expect(await servico<string>("select (select public.caixa_pix_situacao(true, null))::text as v")).toBe("true");
    await db.exec("savepoint s");
    await db.exec("set role service_role");
    await expect(db.query("select public.caixa_pix_qr_registrar($1, 'qr com espaço', $2, $3, now() + interval '1 hour')", [q.id, COPIA, IMAGEM])).rejects.toThrow();
    await db.exec("rollback to savepoint s");
    await db.exec("reset role");
  });
});
