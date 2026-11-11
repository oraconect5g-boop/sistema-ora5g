// Duplicados, mesclagem controlada e segmentos explicáveis (lote L5c: ORA-CRM-006, ORA-CRM-010). Banco em
// memória com todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, cpf, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  await db.query("select privado.lancar_movimento($1, $2, 30, 'entrada_importacao', null, null, null, null, 'teste:capas-segmentos')", [ids.lojaA, cat.capa]);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = (prefixo = "form:mescla") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `6e000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
type Falha = { codigo: string; mensagem: string };
async function tentar<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<{ v: T } | Falha> {
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
  });
}
async function valor<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const codigo = async (s: Sessao | null, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

const DUPLICADOS = "select public.clientes_duplicados() as v";
const DIFERENTES = "select public.clientes_marcar_diferentes($1, $2, $3) as v";
const MESCLAR = "select public.clientes_mesclar($1, $2, $3) as v";
const SEGMENTOS = "select public.clientes_segmentos() as v";
const FICHA = "select public.cliente_ficha($1) as v";
type Par = { motivo: string; a: { id: string; nome: string; compras: number }; b: { id: string; nome: string } };
async function cadastrar(s: Sessao, dados: object) {
  return (await valor<{ id: string; numero: number }>(s, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v", [JSON.stringify(dados), chave("form:cli")]));
}
async function vender(s: Sessao, cliente: string, diasAtras = 0) {
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
    [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), JSON.stringify({ id: cliente }), chave("concluir")]);
  if (diasAtras > 0) {
    // Fabrica o passado: a venda concluída "há N dias" (sem os gatilhos, só para o teste).
    await db.exec("set session_replication_role = replica");
    await db.query("update public.vendas set concluida_em = now() - make_interval(days => $2) where id = $1", [venda, diasAtras]);
    await db.exec("set session_replication_role = origin");
  }
  return venda;
}

describe("duplicados (ORA-CRM-006)", () => {
  it("mesmo telefone ou mesmo nome e nascimento viram candidatos para o dono; marcar diferentes tira da lista", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const a = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Maria Teste", documento: cpf("529982247"), telefone: "41987650001" });
    const b = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Maria T.", telefone: "41987650001", telefone_compartilhado: true });
    const c = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "José Silva", documento: cpf("111444777"), telefone: "41987650002", nascimento: "1990-05-10", finalidades: ["ora_connect"] });
    const d = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "josé silva", documento: cpf("390533447"), telefone: "41987650003", nascimento: "1990-05-10", finalidades: ["ora_connect"] });
    await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Outra Pessoa", telefone: "41987650004" });

    const dono = await naLoja(ids.dono, ids.lojaA);
    const pares = await valor<Par[]>(dono, DUPLICADOS);
    expect(pares.map((p) => [p.motivo, [p.a.id, p.b.id].sort()])).toEqual(expect.arrayContaining([
      ["mesmo telefone", [a.id, b.id].sort()], ["mesmo nome e nascimento", [c.id, d.id].sort()],
    ]));
    expect(pares).toHaveLength(2);
    expect(await codigo(ana, DUPLICADOS)).toBe("42501");
    expect(await codigo(await naLoja(ids.gerenteB, ids.lojaB), DUPLICADOS)).toBe("42501");

    expect(await codigo(dono, DIFERENTES, [c.id, d.id, ""])).toBe("22023");
    expect(await valor(dono, DIFERENTES, [d.id, c.id, "Homônimos: CPFs diferentes"])).toBe(true);
    expect(await valor(dono, DIFERENTES, [c.id, d.id, "De novo"])).toBe(false);
    expect((await valor<Par[]>(dono, DUPLICADOS)).map((p) => p.motivo)).toEqual(["mesmo telefone"]);
    expect(await codigo(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), DIFERENTES, [a.id, b.id, "Outra rede"])).toBe("P0002");
  });
});

describe("mesclagem (ORA-CRM-006)", () => {
  it("o que fica recebe os dados que faltavam e todo o histórico; o outro vira mesclado, sem identificadores, e não muda mais", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const fica = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Maria Teste", documento: cpf("529982247"), telefone: "41987650001" });
    const sai = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Maria T.", telefone: "41987650001", telefone_compartilhado: true, email: "maria@exemplo.com" });
    await vender(ana, sai.id);
    const op = await valor<{ id: string }>(ana, "select public.oportunidade_registrar($1, $2::jsonb, $3) as v",
      [sai.id, JSON.stringify({ origem: "loja", interesse: "Capa nova" }), chave("form:op")]);
    await valor(ana, "select public.atividade_criar($1::jsonb, $2) as v",
      [JSON.stringify({ tipo: "ligacao", descricao: "Ligar", vence_em: new Date(Date.now() + 86_400_000).toISOString(), oportunidade: op.id }), chave("form:at")]);
    await valor(ana, "select public.cliente_consentir($1, 'whatsapp', 'ofertas', true, 'loja') as v", [sai.id]);

    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await codigo(ana, MESCLAR, [fica.id, sai.id, "Mesmo cliente"])).toBe("42501");
    expect(await codigo(dono, MESCLAR, [fica.id, sai.id, ""])).toBe("22023");
    expect(await codigo(dono, MESCLAR, [fica.id, fica.id, "Ele mesmo"])).toBe("22023");
    const r = await valor<Record<string, unknown>>(dono, MESCLAR, [fica.id, sai.id, "Mesmo telefone e mesma pessoa, confirmado no balcão"]);
    expect(r).toEqual({ ficou: fica.id, saiu: sai.id, campos: ["email"], vendas: 1, oportunidades: 1, atividades: 1, consentimentos: 1 });

    expect((await db.query("select situacao, mesclado_em, documento_resumo, telefone_resumo, email_mascara from public.clientes where id = $1", [sai.id])).rows[0])
      .toEqual({ situacao: "mesclado", mesclado_em: fica.id, documento_resumo: null, telefone_resumo: null, email_mascara: null });
    expect((await db.query("select documento, telefone, email from privado.cliente_dados where cliente_id = $1", [sai.id])).rows[0])
      .toEqual({ documento: null, telefone: null, email: null });
    expect((await db.query("select email from privado.cliente_dados where cliente_id = $1", [fica.id])).rows[0]).toEqual({ email: "maria@exemplo.com" });
    expect((await db.query("select count(*)::int as n from public.vendas where cliente_id = $1", [fica.id])).rows[0]).toEqual({ n: 1 });
    expect((await db.query<{ v: boolean }>("select privado.cliente_pode_contatar($1, 'whatsapp', 'ofertas') as v", [fica.id])).rows[0]?.v).toBe(true);
    expect((await valor<{ clientes: { id: string }[] }>(ana, "select public.cliente_buscar('telefone', '41987650001') as v")).clientes.map((c) => c.id)).toEqual([fica.id]);
    expect(await valor(ana, FICHA, [sai.id])).toMatchObject({ situacao: "mesclado", mesclado_em: { id: fica.id, nome: "Maria Teste" } });
    expect(await codigo(ana, "select public.cliente_salvar($1, $2::jsonb, 'Corrigir', null) as v", [sai.id, JSON.stringify({ nome: "Outro nome" })])).toBe("22023");
    expect(await codigo(dono, MESCLAR, [fica.id, sai.id, "De novo"])).toBe("22023");
    expect((await db.query<{ acao: string }>("select acao from public.auditoria where acao in ('cliente.mesclado', 'cliente.recebeu_mesclagem') order by id")).rows.map((x) => x.acao))
      .toEqual(["cliente.mesclado", "cliente.recebeu_mesclagem"]);
  });

  it("documentos diferentes não se mesclam (OR029); o documento do que sai passa para o que fica", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const c = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "José Silva", documento: cpf("111444777") });
    const d = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "José da Silva", documento: cpf("390533447") });
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await codigo(dono, MESCLAR, [c.id, d.id, "Parece o mesmo"])).toBe("OR029");
    const semDocumento = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Joana", telefone: "41987650005" });
    const comDocumento = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Joana Souza", documento: cpf("246813579"), telefone: "41987650006" });
    expect(await valor(dono, MESCLAR, [semDocumento.id, comDocumento.id, "Cadastro antigo sem CPF"])).toMatchObject({ campos: ["documento"] });
    expect((await valor<{ clientes: { id: string }[] }>(ana, "select public.cliente_buscar('documento', $1) as v", [cpf("246813579")])).clientes.map((x) => x.id))
      .toEqual([semDocumento.id]);
    expect(await codigo(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), MESCLAR, [c.id, d.id, "Outra rede"])).toBe("P0002");
  });
});

describe("segmentos explicáveis (ORA-CRM-010)", () => {
  it("cada cliente cai num segmento pela regra das compras; a ficha explica; o dono vê os totais, o alto valor e quem aceita ofertas", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const cliente = async (nome: string, telefone: string) => (await cadastrar(ana, { tipo: "pessoa_fisica", nome, telefone })).id;
    const recorrente = await cliente("Recorrente", "41987650011");
    const novo = await cliente("Novo", "41987650012");
    const ocasional = await cliente("Ocasional", "41987650013");
    const emRisco = await cliente("Em risco", "41987650014");
    const inativo = await cliente("Inativo", "41987650015");
    await cliente("Sem compra", "41987650016");
    await vender(ana, recorrente, 40);
    await vender(ana, recorrente);
    await vender(ana, novo, 10);
    await vender(ana, ocasional, 120);
    await vender(ana, emRisco, 300);
    await vender(ana, emRisco, 200);
    await vender(ana, inativo, 400);
    await valor(ana, "select public.cliente_consentir($1, 'whatsapp', 'ofertas', true, 'loja') as v", [recorrente]);

    expect((await valor<{ segmento: unknown }>(ana, FICHA, [recorrente])).segmento)
      .toEqual({ codigo: "recorrente", explicacao: "2 compra(s) em 12 meses, 2 no total; última há 0 dia(s)" });
    expect((await valor<{ segmento: { codigo: string } }>(ana, FICHA, [inativo])).segmento.codigo).toBe("inativo");

    const dono = await naLoja(ids.dono, ids.lojaA);
    const r = await valor<{ corte_alto_valor: number; segmentos: { segmento: string; clientes: number; alto_valor: number; aceitam_ofertas: Record<string, number> }[] }>(dono, SEGMENTOS);
    expect(r.corte_alto_valor).toBe(15_800);
    expect(r.segmentos.map((s) => [s.segmento, s.clientes, s.alto_valor])).toEqual([
      ["recorrente", 1, 1], ["novo", 1, 0], ["ocasional", 1, 0], ["em_risco", 1, 1], ["inativo", 1, 0], ["sem_compra", 1, 0],
    ]);
    expect(r.segmentos[0]?.aceitam_ofertas).toEqual({ whatsapp: 1, sms: 0, email: 0, ligacao: 0 });
    expect(await codigo(ana, SEGMENTOS)).toBe("42501");
    expect(await codigo(await naLoja(ids.gerenteB, ids.lojaB), SEGMENTOS)).toBe("42501");
  });
});
