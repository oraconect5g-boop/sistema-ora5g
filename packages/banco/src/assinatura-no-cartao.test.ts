// Lote PAY-015c (25/11/2026; ORA-PAY-001, ORA-PAY-014 e ORA-CRM-002; a decisão D-062): a assinatura no cartão pela Asaas.
// A loja pede a assinatura para um cliente da rede; o worker cria o link recorrente, acha a assinatura que o cliente criou
// ao cadastrar o cartão e acompanha as cobranças; só a consulta muda a situação; o cancelamento remove a assinatura na
// Asaas. Clientes, links, assinaturas e cobranças FICTÍCIOS; cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { montarCatalogo } from "./cenario-catalogo";

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
const chave = (p: string) => `${p}:assinatura:${String(++chaves).padStart(5, "0")}`;
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
  const s = { usuario, sessao: `4e700000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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
const PEDIR = "select public.assinatura_pedir($1, $2, $3, $4, $5, $6) as v";
type Pedida = { id: string; numero: number; situacao: string; repetida?: boolean };
const pedir = (s: Sessao, cliente: string, p: { descricao?: string; valor?: number; ciclo?: string; linha?: string | null } = {}, k = chave("pedir")) =>
  comoLoja<Pedida>(s, PEDIR, [cliente, p.descricao ?? "Plano 10 GB da linha", p.valor ?? 5_490, p.ciclo ?? "MONTHLY", p.linha ?? null, k]);
const recusaAoPedir = (s: Sessao, cliente: string, p: { descricao?: string; valor?: number; ciclo?: string; linha?: string | null } = {}, k = chave("pedir")) =>
  recusaALoja(s, PEDIR, [cliente, p.descricao ?? "Plano 10 GB da linha", p.valor ?? 5_490, p.ciclo ?? "MONTHLY", p.linha ?? null, k]);
const aCriar = () => servico<{ id: string; valor_centavos: number; ciclo: string; tentativa: number; validade_segundos: number; descricao: string }[]>(
  "select public.assinaturas_a_criar(10) as v");
const registrar = (id: string, link = `lnkrec${++links}`, expira = "now() + interval '3 days'") =>
  servico<string>(`select public.assinatura_link_registrar($1, $2, $3, ${expira}) as v`, [id, link, `https://sandbox.asaas.invalid/c/${link}`]);
const aConferir = () => servico<{ id: string; link_id: string; assinatura_id: string | null; situacao: string; desde: string }[]>("select public.assinaturas_a_conferir(20) as v");
const aplicar = (id: string, consulta: object) => servico<string>("select public.assinatura_consulta_aplicar($1, $2::jsonb) as v", [id, JSON.stringify(consulta)]);
const assinatura = async (id: string) => (await db.query<{ situacao: string; assinatura_id: string | null; cartao_final: string | null; proxima_cobranca: string | null;
  divergencia: string | null; link_desativado_em: string | null; motivo_cancelamento: string | null }>(
  "select situacao, assinatura_id, cartao_final, proxima_cobranca::text, divergencia, link_desativado_em, motivo_cancelamento from public.assinaturas where id = $1", [id])).rows[0];
const cobrancas = async (id: string) => (await db.query<{ id_no_provedor: string; situacao: string; valor_centavos: number; vencimento: string | null }>(
  "select id_no_provedor, situacao, valor_centavos::int, vencimento::text from public.assinatura_cobrancas where assinatura_id = $1 order by vencimento", [id])).rows;
/** A resposta da Asaas sobre a assinatura criada pelo link, no formato que o banco confere. */
const daAsaas = (link: string, mudar: Record<string, unknown> = {}) => ({
  link_id: link, situacao: "assinatura", assinatura_id: `sub_${link}`, link_da_assinatura: link, status: "ACTIVE", valor_centavos: 5_490, ciclo: "MONTHLY",
  proxima_cobranca: "2026-12-25", cartao_final: "8829", cartao_bandeira: "VISA",
  cobrancas: [{ id: `pay_${link}_1`, situacao: "pago", valor_centavos: 5_490, vencimento: "2026-11-25", pago_em: "2026-11-25" }], ...mudar });

async function clienteDaRede(s: Sessao, nome = "Cliente Fictício da Assinatura") {
  return (await comoLoja<{ id: string }>(s, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v",
    [JSON.stringify({ tipo: "pessoa_fisica", nome, telefone: "41987650177" }), chave("cliente")])).id;
}
/** Uma assinatura pedida, com o link criado pelo worker, esperando o cartão. */
async function esperandoCartao(s: Sessao, cliente: string) {
  const { id } = await pedir(s, cliente);
  expect((await aCriar()).map((x) => x.id)).toContain(id);
  const link = `lnkrec${++links}`;
  expect(await registrar(id, link)).toBe("registrado");
  return { id, link };
}

describe("a assinatura no cartão pela Asaas (PAY-015c)", () => {
  it("desligado até o worker falar com a Asaas; ligada, a loja pede a assinatura de um cliente da rede; o clique repetido devolve a mesma; os dados fora da forma são recusados", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const cliente = await clienteDaRede(await naLoja(ids.vendedorAB, ids.lojaA));
    expect(await recusaAoPedir(ana, cliente)).toBe("OR058");
    await ligar();
    const k = chave("pedir");
    const primeira = await pedir(ana, cliente, { linha: "(41) 98765-0177" }, k);
    expect(primeira).toMatchObject({ situacao: "criando" });
    expect(await pedir(ana, cliente, { linha: "41987650177" }, k)).toMatchObject({ id: primeira.id, repetida: true });
    expect(await recusaAoPedir(ana, cliente, { valor: 5_000 }, k)).toBe("OR004");
    for (const ruim of [{ descricao: "ab" }, { descricao: "<b>Plano</b>" }, { valor: 50 }, { ciclo: "DAILY" }, { linha: "4198765" }]) {
      expect(await recusaAoPedir(ana, cliente, ruim), JSON.stringify(ruim)).toBe("22023");
    }
    expect(await recusaAoPedir(ana, "00000000-0000-4000-8000-00000000c0de")).toBe("P0002");
    // Quem não vende na loja não pede; quem não busca clientes não lê.
    expect(await recusaAoPedir(await naLoja(ids.tecnico, ids.assistencia), cliente)).toBe("42501");
    expect(await recusaALoja(await naLoja(ids.tecnico, ids.assistencia), "select public.assinaturas_do_cliente($1)", [cliente])).toBe("42501");
    // A ficha: ligada, quem pode criar e a assinatura (sem link enquanto o worker cria).
    const ficha = await comoLoja<{ ligado: boolean; pode_criar: boolean; assinaturas: Record<string, unknown>[] }>(ana, "select public.assinaturas_do_cliente($1) as v", [cliente]);
    expect(ficha).toMatchObject({ ligado: true, pode_criar: true });
    expect(ficha.assinaturas).toMatchObject([{ id: primeira.id, descricao: "Plano 10 GB da linha", valor_centavos: 5_490, ciclo: "MONTHLY", linha: "41987650177",
      situacao: "criando", link_url: null, pode_cancelar: true, cobrancas: [] }]);
    // O cliente de outra rede não aparece.
    expect(await recusaALoja(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), "select public.assinaturas_do_cliente($1)", [cliente])).toBe("P0002");
  });

  it("o worker cria o link recorrente; acha a assinatura que o cliente criou ao cadastrar o cartão; confere o valor, o ciclo e o link; guarda as cobranças sem repetir", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await ligar();
    const cliente = await clienteDaRede(ana);
    const { id } = await pedir(ana, cliente);
    expect((await aCriar()).find((x) => x.id === id)).toMatchObject({ valor_centavos: 5_490, ciclo: "MONTHLY", tentativa: 1, validade_segundos: 259_200 });
    expect(await aCriar()).toEqual([]);
    expect(await registrar(id, "lnkrec_unico")).toBe("registrado");
    expect(await registrar(id, "lnkrec_unico")).toBe("repetido");
    const ficha = await comoLoja<{ assinaturas: { situacao: string; link_url: string | null }[] }>(ana, "select public.assinaturas_do_cliente($1) as v", [cliente]);
    expect(ficha.assinaturas).toMatchObject([{ situacao: "aguardando_cartao", link_url: "https://sandbox.asaas.invalid/c/lnkrec_unico" }]);

    const lote = await aConferir();
    expect(lote.map((x) => [x.id, x.link_id, x.situacao])).toEqual([[id, "lnkrec_unico", "aguardando_cartao"]]);
    expect(lote[0]?.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await aplicar(id, { link_id: "lnkrec_unico", situacao: "sem_cadastro" })).toBe("pendente");
    expect(await aplicar(id, daAsaas("lnkrec_outro"))).toBe("link_desconhecido");
    expect(await aplicar(id, daAsaas("lnkrec_unico", { valor_centavos: 4_990 }))).toBe("divergencia");
    expect(await aplicar(id, daAsaas("lnkrec_unico", { link_da_assinatura: "lnkrec_de_outra" }))).toBe("divergencia");
    expect(await assinatura(id)).toMatchObject({ situacao: "aguardando_cartao", assinatura_id: null, divergencia: "a assinatura da Asaas é de outro link" });
    expect(await recusaAoServico("select public.assinatura_consulta_aplicar($1, $2::jsonb)", [id, JSON.stringify(daAsaas("lnkrec_unico", { status: "PAUSED" }))])).toBe("22023");

    expect(await aplicar(id, daAsaas("lnkrec_unico"))).toBe("ativada");
    expect(await assinatura(id)).toMatchObject({ situacao: "ativa", assinatura_id: "sub_lnkrec_unico", cartao_final: "8829", proxima_cobranca: "2026-12-25" });
    expect(await cobrancas(id)).toEqual([{ id_no_provedor: "pay_lnkrec_unico_1", situacao: "pago", valor_centavos: 5_490, vencimento: "2026-11-25" }]);
    // A conferência seguinte: a cobrança do mês seguinte, pendente; a primeira não se repete.
    expect(await aplicar(id, daAsaas("lnkrec_unico", { cobrancas: [
      { id: "pay_lnkrec_unico_1", situacao: "pago", valor_centavos: 5_490, vencimento: "2026-11-25", pago_em: "2026-11-25" },
      { id: "pay_lnkrec_unico_2", situacao: "pendente", valor_centavos: 5_490, vencimento: "2026-12-25", pago_em: null }] }))).toBe("atualizada");
    expect((await cobrancas(id)).map((c) => [c.id_no_provedor, c.situacao])).toEqual([["pay_lnkrec_unico_1", "pago"], ["pay_lnkrec_unico_2", "pendente"]]);
    const lida = await comoLoja<{ assinaturas: { situacao: string; link_url: string | null; cartao_bandeira: string; cobrancas: { situacao: string }[] }[] }>(
      ana, "select public.assinaturas_do_cliente($1) as v", [cliente]);
    expect(lida.assinaturas[0]).toMatchObject({ situacao: "ativa", link_url: null, cartao_bandeira: "VISA" });
    expect(lida.assinaturas[0]?.cobrancas.map((c) => c.situacao)).toEqual(["pendente", "pago"]);
    // A ativa é conferida a cada 30 minutos; pausada e encerrada no painel da Asaas.
    await db.query("update public.assinaturas set conferido_em = now() - interval '31 minutes' where id = $1", [id]);
    expect((await aConferir()).map((x) => [x.id, x.assinatura_id])).toEqual([[id, "sub_lnkrec_unico"]]);
    expect(await aplicar(id, daAsaas("lnkrec_unico", { status: "INACTIVE" }))).toBe("pausada");
    expect(await aplicar(id, daAsaas("lnkrec_unico", { status: "EXPIRED" }))).toBe("encerrada");
    expect((await assinatura(id))?.situacao).toBe("encerrada");
  });

  it("cancelar: a que o worker não pediu sai na hora; a que espera o cartão é conferida antes de desativar o link; a ativa é removida na Asaas; só quem criou ou o gerente cancela", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await ligar();
    const cliente = await clienteDaRede(ana);
    const a = await pedir(ana, cliente);
    expect(await recusaALoja(ana, "select public.assinatura_cancelar($1, 'x')", [a.id])).toBe("22023");
    expect(await comoLoja(ana, "select public.assinatura_cancelar($1, 'Cliente desistiu') as v", [a.id])).toBe("cancelada");
    // B: esperando o cartão; cancelada, o worker confere que ninguém cadastrou e desativa o link.
    const b = await esperandoCartao(ana, cliente);
    expect(await recusaALoja(await naLoja(ids.vendedorAB, ids.lojaA), "select public.assinatura_cancelar($1, 'Outra pessoa')", [b.id])).toBe("P0002");
    expect(await comoLoja(ana, "select public.assinatura_cancelar($1, 'Cliente desistiu') as v", [b.id])).toBe("cancelando");
    expect((await aConferir()).map((x) => [x.id, x.situacao])).toContainEqual([b.id, "cancelando"]);
    expect(await aplicar(b.id, { link_id: b.link, situacao: "sem_cadastro" })).toBe("pode_desativar");
    expect(await servico("select public.assinatura_cancelada_na_asaas($1) as v", [b.id])).toBe("cancelada");
    expect((await assinatura(b.id))?.link_desativado_em).not.toBeNull();
    // C: ativa; o dono (que cancela vendas na loja) cancela; o worker remove a assinatura na Asaas.
    const c = await esperandoCartao(ana, cliente);
    expect(await aplicar(c.id, daAsaas(c.link))).toBe("ativada");
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await comoLoja(dono, "select public.assinatura_cancelar($1, 'Pedido do cliente pelo telefone') as v", [c.id])).toBe("cancelando");
    expect(await servico("select public.assinaturas_a_cancelar(20) as v")).toEqual([{ id: c.id, assinatura_id: `sub_${c.link}`, link_id: c.link }]);
    expect(await servico("select public.assinatura_cancelada_na_asaas($1) as v", [c.id])).toBe("cancelada");
    expect(await assinatura(c.id)).toMatchObject({ situacao: "cancelada", motivo_cancelamento: "Pedido do cliente pelo telefone" });
    // D: o cliente cadastrou o cartão no instante em que a loja desistiu: a assinatura achada vai ser removida.
    const d = await esperandoCartao(ana, cliente);
    expect(await comoLoja(ana, "select public.assinatura_cancelar($1, 'Cliente desistiu') as v", [d.id])).toBe("cancelando");
    expect(await aplicar(d.id, daAsaas(d.link))).toBe("atualizada");
    expect(await assinatura(d.id)).toMatchObject({ situacao: "cancelando", assinatura_id: `sub_${d.link}` });
    expect((await servico<{ id: string }[]>("select public.assinaturas_a_cancelar(20) as v")).map((x) => x.id)).toContain(d.id);
  });

  it("o link vence sem cartão: sem_cartao e o link desativado; a assinatura removida no painel da Asaas fica cancelada, com o motivo", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await ligar();
    const cliente = await clienteDaRede(ana);
    const e = await esperandoCartao(ana, cliente);
    await db.query("update public.assinaturas set link_expira_em = now() - interval '1 minute' where id = $1", [e.id]);
    expect(await aplicar(e.id, { link_id: e.link, situacao: "sem_cadastro" })).toBe("sem_cartao");
    expect((await servico<{ id: string }[]>("select public.assinaturas_a_cancelar(20) as v")).map((x) => x.id)).toContain(e.id);
    expect(await servico("select public.assinatura_cancelada_na_asaas($1) as v", [e.id])).toBe("sem_cartao");
    const f = await esperandoCartao(ana, cliente);
    expect(await aplicar(f.id, daAsaas(f.link))).toBe("ativada");
    expect(await aplicar(f.id, { link_id: f.link, situacao: "removida", assinatura_id: "sub_outra" })).toBe("divergencia");
    expect(await aplicar(f.id, { link_id: f.link, situacao: "removida", assinatura_id: `sub_${f.link}` })).toBe("removida");
    expect(await assinatura(f.id)).toMatchObject({ situacao: "cancelada", motivo_cancelamento: "Removida no painel da Asaas" });
    // A cancelada aqui não volta a ativa se a Asaas ainda mostrar a assinatura.
    expect(await aplicar(f.id, daAsaas(f.link))).toBe("divergencia");
  });

  it("quem pode: as funções do worker são só do servidor; as tabelas só pelas funções", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await ligar();
    const cliente = await clienteDaRede(ana);
    const { id } = await pedir(ana, cliente);
    for (const sql of ["select public.assinaturas_a_criar(10)", "select public.assinaturas_a_conferir(10)", "select public.assinaturas_a_cancelar(10)"]) {
      expect(await recusaALoja(ana, sql), sql).toBe("42501");
    }
    expect(await recusaALoja(ana, "select public.assinatura_consulta_aplicar($1, '{}'::jsonb)", [id])).toBe("42501");
    expect(await recusaALoja(ana, "select public.assinatura_cancelada_na_asaas($1)", [id])).toBe("42501");
    expect(await recusaALoja(ana, "select public.assinatura_link_registrar($1, 'x', 'https://x.invalid/abc', now())", [id])).toBe("42501");
    expect(await recusaALoja(ana, "select public.assinatura_criacao_falhou($1, 'x', true)", [id])).toBe("42501");
    expect(await recusaALoja(ana, "select id from public.assinaturas")).toBe("42501");
    expect(await recusaALoja(ana, "select id from public.assinatura_cobrancas")).toBe("42501");
    // O worker não registra link fora da forma.
    await aCriar();
    expect(await recusaAoServico("select public.assinatura_link_registrar($1, 'lnk_x', 'http://x.invalid/abc', now() + interval '1 day')", [id])).toBe("22023");
  });
});
