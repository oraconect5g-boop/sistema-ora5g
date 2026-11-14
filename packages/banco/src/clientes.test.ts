// Cliente compartilhado da rede (lote L5a: ORA-CRM-001, ORA-CRM-003, ORA-CRM-007; base de ORA-CRM-002).
// Banco em memória com todas as migrations; dados FICTÍCIOS (CPFs gerados, telefones de teste).
// Cada teste numa transação desfeita.
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
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = (prefixo = "form:cli") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `6c000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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
const linhas = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, async () => (await db.query<Record<string, unknown>>(sql, params)).rows);

const SALVAR = "select public.cliente_salvar($1, $2::jsonb, $3, $4) as v";
const BUSCAR = "select public.cliente_buscar($1, $2) as v";
const FICHA = "select public.cliente_ficha($1) as v";
const REVELAR = "select public.cliente_revelar($1, $2) as v";
const CONSENTIR = "select public.cliente_consentir($1, $2, $3, $4, $5) as v";
const VINCULAR = "select public.venda_vincular_cliente($1, $2, $3) as v";
type Salvo = { id: string; numero: number; repetida: boolean; alterado: boolean };
type Busca = { situacao: "ok" | "limite"; clientes: { id: string; numero: number; nome: string; documento: string | null; telefone: string | null }[] };

const CPF_MARIA = cpf("529982247");
const CPF_JOSE = cpf("111444777");
const TEL_MARIA = "41987650001";
const formatar = (c: string) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
const maria = { tipo: "pessoa_fisica", nome: "  Maria   Teste ", documento: formatar(CPF_MARIA), telefone: "(41) 98765-0001", email: "Maria@Exemplo.com" };
const cadastrar = (s: Sessao, dados: object, k = chave()) => valor<Salvo>(s, SALVAR, [null, JSON.stringify(dados), null, k]);
// Nenhum texto da auditoria pode conter o dado aberto (CPF, telefone, e-mail).
const auditoriaCom = async (trecho: string) =>
  Number((await db.query<{ n: string }>("select count(*) as n from public.auditoria where coalesce(antes::text, '') || coalesce(depois::text, '') || coalesce(motivo, '') like '%' || $1 || '%'", [trecho])).rows[0]?.n);
const acessos = async (usuario: string) =>
  (await db.query<{ acao: string; alvo_id: string | null; depois: Record<string, unknown> }>(
    "select acao, alvo_id, depois from public.auditoria where usuario_id = $1 and alvo_tipo = 'cliente' order by id", [usuario])).rows;

describe("cadastro com dados mínimos por finalidade (ORA-CRM-001)", () => {
  it("vendedor cadastra; a chave repetida devolve o mesmo cliente; os dados abertos ficam fora da tabela pública e da auditoria", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const k = chave();
    const salvo = await cadastrar(ana, maria, k);
    expect(salvo).toMatchObject({ repetida: false, alterado: true });
    expect(await cadastrar(ana, maria, k)).toEqual({ ...salvo, repetida: true, alterado: false });
    expect(await codigo(ana, SALVAR, [null, JSON.stringify({ ...maria, nome: "Outra" }), null, k])).toBe("OR004");

    const publico = (await db.query("select nome, tipo, documento_mascara, telefone_mascara, email_mascara, finalidades, unidade_origem_id, origem from public.clientes where id = $1", [salvo.id])).rows[0];
    expect(publico).toEqual({
      nome: "Maria Teste", tipo: "pessoa_fisica", documento_mascara: `•••.•••.${CPF_MARIA.slice(6, 9)}-${CPF_MARIA.slice(9)}`,
      telefone_mascara: "(41) •••••-0001", email_mascara: "m•••@exemplo.com", finalidades: [], unidade_origem_id: ids.lojaA, origem: "loja",
    });
    expect((await db.query("select documento, telefone, email from privado.cliente_dados where cliente_id = $1", [salvo.id])).rows[0])
      .toEqual({ documento: CPF_MARIA, telefone: TEL_MARIA, email: "maria@exemplo.com" });
    expect((await db.query("select count(*)::int as n from public.clientes where documento_resumo like $1 or telefone_resumo like $2", [`%${CPF_MARIA}%`, `%${TEL_MARIA}%`])).rows[0]).toEqual({ n: 0 });
    for (const aberto of [CPF_MARIA, TEL_MARIA, "maria@exemplo.com"]) expect(await auditoriaCom(aberto), aberto).toBe(0);
    expect((await acessos(ids.vendedorA)).map((a) => [a.acao, a.depois.campos])).toEqual([["cliente.criado", ["tipo", "nome", "documento", "telefone", "email"]]]);
  });

  it("cada finalidade pede o que precisa; nascimento e endereço só com finalidade que os justifique", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const jose = { tipo: "pessoa_fisica", nome: "José Teste", telefone: "41987650002" };
    expect(await codigo(ana, SALVAR, [null, JSON.stringify({ tipo: "pessoa_fisica", nome: "Sem contato" }), null, chave()])).toBe("22023");
    expect(await codigo(ana, SALVAR, [null, JSON.stringify({ ...jose, finalidades: ["nota_fiscal"] }), null, chave()])).toBe("22023");
    expect(await codigo(ana, SALVAR, [null, JSON.stringify({ ...jose, nascimento: "1990-05-10" }), null, chave()])).toBe("22023");
    expect(await codigo(ana, SALVAR, [null, JSON.stringify({ ...jose, documento: CPF_JOSE, finalidades: ["ora_connect"] }), null, chave()])).toBe("22023");
    expect(await codigo(ana, SALVAR, [null, JSON.stringify({ ...jose, documento: CPF_JOSE, nascimento: "1990-02-30", finalidades: ["ora_connect"] }), null, chave()])).toBe("22023");
    expect(await codigo(ana, SALVAR, [null, JSON.stringify({ ...jose, finalidades: ["entrega"] }), null, chave()])).toBe("22023");
    expect(await codigo(ana, SALVAR, [null, JSON.stringify({ ...jose, finalidades: ["recado"] }), null, chave()])).toBe("22023");
    expect(await codigo(ana, SALVAR, [null, JSON.stringify({ ...jose, documento: "111.444.777-00" }), null, chave()])).toBe("22023");
    expect(await codigo(ana, SALVAR, [null, JSON.stringify({ ...jose, tipo: "pessoa_juridica", documento: CPF_JOSE }), null, chave()])).toBe("22023");
    // Desde 14/11 (#76) a nota no nome do cliente pede também o endereço completo.
    expect(await codigo(ana, SALVAR, [null, JSON.stringify({ ...jose, documento: CPF_JOSE, nascimento: "1990-05-10", finalidades: ["ora_connect", "nota_fiscal"] }), null, chave()])).toBe("22023");
    const connect = await cadastrar(ana, { ...jose, documento: CPF_JOSE, nascimento: "1990-05-10", finalidades: ["ora_connect", "nota_fiscal"], endereco: { cep: "80000-000", logradouro: "Rua das Flores", numero: "10", bairro: "Centro", cidade: "Curitiba", uf: "PR" } });
    expect((await db.query("select finalidades, nascimento_informado from public.clientes where id = $1", [connect.id])).rows[0])
      .toEqual({ finalidades: ["nota_fiscal", "ora_connect"], nascimento_informado: true });
    const entrega = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Entrega Teste", telefone: "41987650003", finalidades: ["entrega"],
      endereco: { cep: "80000-000", logradouro: "Rua das Flores", numero: "10", bairro: "Centro", cidade: "Curitiba", uf: "pr" } });
    expect((await db.query("select endereco from privado.cliente_dados where cliente_id = $1", [entrega.id])).rows[0])
      .toEqual({ endereco: { cep: "80000000", logradouro: "Rua das Flores", numero: "10", bairro: "Centro", cidade: "Curitiba", uf: "PR" } });
  });

  it("o mesmo CPF não entra duas vezes (OR026); telefone de outra pessoa pede confirmação (OR027)", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await cadastrar(ana, maria);
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await codigo(gerente, SALVAR, [null, JSON.stringify({ tipo: "pessoa_fisica", nome: "Maria de Novo", documento: CPF_MARIA, telefone: "41987650010" }), null, chave()])).toBe("OR026");
    expect(await codigo(gerente, SALVAR, [null, JSON.stringify({ tipo: "pessoa_fisica", nome: "Filha da Maria", telefone: TEL_MARIA }), null, chave()])).toBe("OR027");
    expect(await cadastrar(gerente, { tipo: "pessoa_fisica", nome: "Filha da Maria", telefone: TEL_MARIA, telefone_compartilhado: true })).toMatchObject({ alterado: true });
    // Outra rede tem o próprio cadastro: o mesmo CPF lá é outro cliente.
    const outro = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await cadastrar(outro, maria)).toMatchObject({ alterado: true });
  });

  it("correção exige motivo; só o nome dos campos vai para a auditoria; o que uma finalidade exige não sai", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const salvo = await cadastrar(ana, { ...maria, finalidades: ["nota_fiscal"], endereco: { cep: "80000-000", logradouro: "Rua das Flores", numero: "10", bairro: "Centro", cidade: "Curitiba", uf: "PR" } });
    expect(await codigo(ana, SALVAR, [salvo.id, JSON.stringify({ telefone: "41987650009" }), "", null])).toBe("22023");
    expect(await valor<Salvo>(ana, SALVAR, [salvo.id, JSON.stringify({ telefone: "41 98765-0009" }), "Cliente trocou de número", null])).toMatchObject({ alterado: true });
    expect(await valor<Salvo>(ana, SALVAR, [salvo.id, JSON.stringify({ telefone: "41987650009" }), "Sem mudança", null])).toMatchObject({ alterado: false });
    expect(await codigo(ana, SALVAR, [salvo.id, JSON.stringify({ remover: ["documento"] }), "Tirar o CPF", null])).toBe("22023");
    expect(await valor<Salvo>(ana, SALVAR, [salvo.id, JSON.stringify({ remover: ["email"] }), "Cliente pediu para tirar o e-mail", null])).toMatchObject({ alterado: true });
    expect((await db.query("select telefone, email from privado.cliente_dados where cliente_id = $1", [salvo.id])).rows[0]).toEqual({ telefone: "41987650009", email: null });
    expect((await db.query("select telefone_mascara, email_mascara, atualizado_por from public.clientes where id = $1", [salvo.id])).rows[0])
      .toEqual({ telefone_mascara: "(41) •••••-0009", email_mascara: null, atualizado_por: ids.vendedorA });
    const alteracoes = (await acessos(ids.vendedorA)).filter((a) => a.acao === "cliente.alterado").map((a) => a.depois.campos);
    expect(alteracoes).toEqual([["telefone"], ["email"]]);
    expect(await auditoriaCom("41987650009")).toBe(0);
    expect((await db.query<{ motivo: string }>("select motivo from public.auditoria where acao = 'cliente.alterado' order by id")).rows.map((r) => r.motivo))
      .toEqual(["Cliente trocou de número", "Cliente pediu para tirar o e-mail"]);
  });
});

// Decisão do proprietário de 12/11/2026 (#76; migration 20261114145608_clientes_nome_e_whatsapp): o cadastro rápido é
// nome completo + WhatsApp; e-mail sempre opcional, inclusive no financiamento; a nota pede documento e endereço.
describe("cadastro rápido com nome completo e WhatsApp; e-mail opcional (#76)", () => {
  const ENDERECO = { cep: "80000-000", logradouro: "Rua das Flores", numero: "10", bairro: "Centro", cidade: "Curitiba", uf: "PR" };
  it("o rápido salva só com nome completo e WhatsApp; sem WhatsApp ou com um nome só, não", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const rapido = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Ana Rápida", telefone: "(41) 98765-0101" });
    expect(rapido).toMatchObject({ repetida: false, alterado: true });
    expect((await db.query("select documento, telefone, email, endereco from privado.cliente_dados where cliente_id = $1", [rapido.id])).rows[0])
      .toEqual({ documento: null, telefone: "41987650101", email: null, endereco: null });
    const recusa = async (dados: object) => { const r = await tentar(ana, SALVAR, [null, JSON.stringify(dados), null, chave()]); return "codigo" in r ? `${r.codigo} ${r.mensagem}` : "aceito"; };
    expect(await recusa({ tipo: "pessoa_fisica", nome: "Sem Whats", documento: CPF_JOSE })).toBe("22023 Informe o WhatsApp do cliente com DDD: é por ele que a loja fala com o cliente e envia a nota");
    expect(await recusa({ tipo: "pessoa_fisica", nome: "Ana", telefone: "41987650102" })).toBe("22023 Informe o nome completo (nome e sobrenome)");
    expect(await recusa({ tipo: "pessoa_fisica", nome: "Ana Lima", telefone: "41987650103", email: "sem-arroba" })).toBe("22023 E-mail inválido");
    // Empresa: a razão social basta (não precisa de duas palavras); o WhatsApp também é exigido.
    expect(await cadastrar(ana, { tipo: "pessoa_juridica", nome: "Ltda", telefone: "41987650104" })).toMatchObject({ alterado: true });
  });

  it("financiamento sem e-mail; a nota pede documento e endereço; o WhatsApp não se apaga, troca-se", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const financiado = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Carlos Financiado", documento: CPF_JOSE, telefone: "41987650105", nascimento: "1990-05-10", finalidades: ["financiamento"] });
    expect(financiado).toMatchObject({ alterado: true });
    const comNota = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Nota Completa", documento: CPF_MARIA, telefone: "41987650106", finalidades: ["nota_fiscal"], endereco: ENDERECO });
    expect((await db.query("select finalidades, endereco_informado from public.clientes where id = $1", [comNota.id])).rows[0]).toEqual({ finalidades: ["nota_fiscal"], endereco_informado: true });
    // O rápido evolui para a nota no MESMO cadastro: sem endereço é recusado, com endereço passa.
    const rapido = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Bia Rápida", telefone: "41987650107" });
    expect(await codigo(ana, SALVAR, [rapido.id, JSON.stringify({ documento: cpf("246813579"), finalidades: ["nota_fiscal"] }), "Vai levar nota", null])).toBe("22023");
    expect(await valor<Salvo>(ana, SALVAR, [rapido.id, JSON.stringify({ documento: cpf("246813579"), finalidades: ["nota_fiscal"], endereco: ENDERECO }), "Vai levar nota", null]))
      .toMatchObject({ id: rapido.id, alterado: true });
    expect(await codigo(ana, SALVAR, [rapido.id, JSON.stringify({ remover: ["telefone"] }), "Tirar o WhatsApp", null])).toBe("22023");
    expect(await valor<Salvo>(ana, SALVAR, [rapido.id, JSON.stringify({ telefone: "41987650108" }), "Cliente trocou de número", null])).toMatchObject({ alterado: true });
  });

  it("cadastro antigo sem WhatsApp continua valendo e pode ser corrigido sem inventar número; ganha o WhatsApp quando informado", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    // Um cadastro como o L5a permitia (documento, sem telefone): criado hoje e com o telefone tirado à força.
    const antigo = (await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Cliente Antigo", documento: cpf("390533447"), telefone: "41987650110" })).id;
    await db.exec("set session_replication_role = replica");
    await db.query("update privado.cliente_dados set telefone = null where cliente_id = $1", [antigo]);
    await db.query("update public.clientes set telefone_resumo = null, telefone_mascara = null where id = $1", [antigo]);
    await db.exec("set session_replication_role = origin");
    expect(await valor<Salvo>(ana, SALVAR, [antigo, JSON.stringify({ email: "antigo@exemplo.com" }), "Cliente passou o e-mail", null])).toMatchObject({ alterado: true });
    expect((await db.query("select telefone from privado.cliente_dados where cliente_id = $1", [antigo])).rows[0]).toEqual({ telefone: null });
    expect(await valor<Salvo>(ana, SALVAR, [antigo, JSON.stringify({ telefone: "41987650109" }), "Regularizar o WhatsApp", null])).toMatchObject({ alterado: true });
    expect((await db.query("select telefone_mascara from public.clientes where id = $1", [antigo])).rows[0]).toEqual({ telefone_mascara: "(41) •••••-0109" });
  });
});

describe("busca exata, ficha e revelação, cada uma registrada (ORA-CRM-003, ADR-002 T11)", () => {
  it("vendedor acha por CPF ou telefone completos, nunca por pedaço; não lista; dono busca por código e nome", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const salvo = await cadastrar(ana, maria);
    const porCpf = await valor<Busca>(ana, BUSCAR, ["documento", formatar(CPF_MARIA)]);
    expect(porCpf).toEqual({ situacao: "ok", clientes: [expect.objectContaining({ id: salvo.id, nome: "Maria Teste", telefone: "(41) •••••-0001" })] });
    expect((await valor<Busca>(ana, BUSCAR, ["telefone", "+55 (41) 98765-0001"])).clientes.map((c) => c.id)).toEqual([salvo.id]);
    expect(await valor<Busca>(ana, BUSCAR, ["telefone", "41987650099"])).toEqual({ situacao: "ok", clientes: [] });
    expect(await codigo(ana, BUSCAR, ["documento", CPF_MARIA.slice(0, 6)])).toBe("22023");
    expect(await codigo(ana, BUSCAR, ["telefone", "98765"])).toBe("22023");
    expect(await codigo(ana, BUSCAR, ["codigo", String(salvo.numero)])).toBe("42501");
    expect(await codigo(ana, BUSCAR, ["nome", "Maria"])).toBe("42501");
    expect(await linhas(ana, "select * from public.clientes")).toEqual([]);
    expect(await linhas(ana, "select * from public.cliente_consentimentos")).toEqual([]);
    expect(await codigo(ana, "select count(*) as v from privado.cliente_dados")).toBe("42501");

    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await linhas(gerente, "select * from public.clientes")).toEqual([]);
    expect((await valor<Busca>(gerente, BUSCAR, ["documento", CPF_MARIA])).clientes).toHaveLength(1);

    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await linhas(dono, "select id from public.clientes")).map((c) => c.id)).toEqual([salvo.id]);
    expect((await valor<Busca>(dono, BUSCAR, ["codigo", String(salvo.numero)])).clientes.map((c) => c.id)).toEqual([salvo.id]);
    expect((await valor<Busca>(dono, BUSCAR, ["nome", "mária"])).clientes).toEqual([]);
    expect((await valor<Busca>(dono, BUSCAR, ["nome", "maria te"])).clientes.map((c) => c.id)).toEqual([salvo.id]);

    // Sem cliente.buscar: administrador e técnico. Outra rede não acha o cliente desta.
    expect(await codigo(await naLoja(ids.administrador, ids.lojaA), BUSCAR, ["documento", CPF_MARIA])).toBe("42501");
    expect(await codigo(await naLoja(ids.tecnico, ids.assistencia), BUSCAR, ["documento", CPF_MARIA])).toBe("42501");
    expect((await valor<Busca>(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), BUSCAR, ["documento", CPF_MARIA])).clientes).toEqual([]);

    // Cada busca registrada com o critério e o resultado, sem o valor procurado.
    const registro = (await acessos(ids.vendedorA)).filter((a) => a.acao === "cliente.busca");
    expect(registro.map((a) => [a.depois.criterio, a.depois.encontrados, a.alvo_id])).toEqual([
      ["documento", 1, salvo.id], ["telefone", 1, salvo.id], ["telefone", 0, null],
    ]);
    for (const aberto of [CPF_MARIA, TEL_MARIA, "41987650099"]) expect(await auditoriaCom(aberto), aberto).toBe(0);
  });

  it("ficha mostra só máscaras e o resumo das compras; revelar devolve o dado e fica registrado; outra rede não abre", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const salvo = await cadastrar(ana, maria);
    const ficha = await valor<Record<string, unknown>>(ana, FICHA, [salvo.id]);
    expect(ficha).toMatchObject({
      id: salvo.id, nome: "Maria Teste", documento: `•••.•••.${CPF_MARIA.slice(6, 9)}-${CPF_MARIA.slice(9)}`, telefone: "(41) •••••-0001",
      email: "m•••@exemplo.com", nascimento_informado: false, loja_de_origem: "Loja A", consentimentos: [], compras: { total: 0, ultima: null },
    });
    expect(JSON.stringify(ficha)).not.toContain(CPF_MARIA);
    expect(await valor(ana, REVELAR, [salvo.id, "documento"])).toEqual({ campo: "documento", valor: CPF_MARIA });
    expect(await valor(ana, REVELAR, [salvo.id, "nascimento"])).toEqual({ campo: "nascimento", valor: null });
    expect(await codigo(ana, REVELAR, [salvo.id, "senha"])).toBe("22023");
    expect((await acessos(ids.vendedorA)).map((a) => [a.acao, a.depois.campo ?? null])).toEqual([
      ["cliente.criado", null], ["cliente.ficha", null], ["cliente.revelado", "documento"], ["cliente.revelado", "nascimento"],
    ]);
    expect(await auditoriaCom(CPF_MARIA)).toBe(0);
    const outro = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await codigo(outro, FICHA, [salvo.id])).toBe("P0002");
    expect(await codigo(outro, REVELAR, [salvo.id, "documento"])).toBe("P0002");
    expect(await codigo(await naLoja(ids.administrador, ids.lojaA), FICHA, [salvo.id])).toBe("42501");
  });

  it("mais de 30 buscas ou revelações em 10 minutos são barradas (OR028), e a tentativa fica registrada", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const salvo = await cadastrar(ana, maria);
    await db.query(`insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, ocorrido_em)
      select $1, $2, $3, 'cliente.busca', 'cliente', now() - interval '1 minute' from generate_series(1, 29)`, [ids.vendedorA, ids.lojaA, ids.organizacao]);
    await db.query(`insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, ocorrido_em)
      select $1, $2, $3, 'cliente.busca', 'cliente', now() - interval '11 minutes' from generate_series(1, 50)`, [ids.vendedorA, ids.lojaA, ids.organizacao]);
    expect((await valor<Busca>(ana, BUSCAR, ["documento", CPF_MARIA])).situacao).toBe("ok");
    expect(await valor<Busca>(ana, BUSCAR, ["documento", CPF_MARIA])).toEqual({ situacao: "limite", clientes: [] });
    expect(await codigo(ana, REVELAR, [salvo.id, "telefone"])).toBe("OR028");
    expect((await acessos(ids.vendedorA)).filter((a) => a.acao === "cliente.busca_barrada")).toHaveLength(1);
    // Outra pessoa continua buscando normalmente.
    expect((await valor<Busca>(await naLoja(ids.vendedorAB, ids.lojaA), BUSCAR, ["documento", CPF_MARIA])).clientes).toHaveLength(1);
  });
});

describe("consentimento de contato (ORA-CRM-007)", () => {
  it("histórico que só cresce; repetir não duplica; retirar desliga as automações; canal sem contato é recusado", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const salvo = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Sem e-mail", telefone: "41987650004" });
    const pode = async (canal: string, finalidade: string) =>
      (await db.query<{ v: boolean }>("select privado.cliente_pode_contatar($1, $2, $3) as v", [salvo.id, canal, finalidade])).rows[0]?.v;
    expect(await pode("whatsapp", "ofertas")).toBe(false);
    expect(await valor(ana, CONSENTIR, [salvo.id, "whatsapp", "ofertas", true, "loja"])).toBe(true);
    expect(await valor(ana, CONSENTIR, [salvo.id, "whatsapp", "ofertas", true, "loja"])).toBe(false);
    expect(await pode("whatsapp", "ofertas")).toBe(true);
    expect(await pode("whatsapp", "pos_venda")).toBe(false);
    expect(await pode("sms", "ofertas")).toBe(false);
    expect(await codigo(ana, CONSENTIR, [salvo.id, "email", "ofertas", true, "loja"])).toBe("22023");
    expect(await codigo(ana, CONSENTIR, [salvo.id, "pombo", "ofertas", true, "loja"])).toBe("22023");
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await valor(gerente, CONSENTIR, [salvo.id, "whatsapp", "ofertas", false, "whatsapp"])).toBe(true);
    expect(await pode("whatsapp", "ofertas")).toBe(false);
    expect((await db.query("select situacao, fonte, unidade_id, registrado_por from public.cliente_consentimentos where cliente_id = $1 order by id", [salvo.id])).rows).toEqual([
      { situacao: "concedido", fonte: "loja", unidade_id: ids.lojaA, registrado_por: ids.vendedorA },
      { situacao: "retirado", fonte: "whatsapp", unidade_id: ids.lojaB, registrado_por: ids.gerenteB },
    ]);
    expect((await valor<{ consentimentos: unknown[] }>(ana, FICHA, [salvo.id])).consentimentos)
      .toEqual([expect.objectContaining({ canal: "whatsapp", finalidade: "ofertas", situacao: "retirado", fonte: "whatsapp" })]);
    expect(await codigo(await naLoja(ids.administrador, ids.lojaA), CONSENTIR, [salvo.id, "whatsapp", "ofertas", true, "loja"])).toBe("42501");
    expect((await db.query("select count(*)::int as n from public.auditoria where acao = 'cliente_consentimentos.criado'")).rows[0]).toEqual({ n: 2 });
  });
});

describe("cliente na venda (base de ORA-CRM-002)", () => {
  const abrirCaixa = (s: Sessao) => valor<string>(s, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  async function vendaDeCapa(s: Sessao, cliente: object) {
    const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    const r = await tentar(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
      [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), JSON.stringify(cliente), chave("concluir")]);
    return { venda, r };
  }

  it("a venda guarda o cliente da rede e o nome digitado; vínculo depois só por quem vendeu ou vê as vendas da loja, com motivo", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const salvo = await cadastrar(ana, maria);
    const outroCliente = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Outro Cliente", telefone: "41987650005" });
    const daOutraRede = await cadastrar(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), maria);
    await abrirCaixa(ana);

    expect((await vendaDeCapa(ana, { id: daOutraRede.id })).r).toMatchObject({ codigo: "22023" });
    expect((await vendaDeCapa(ana, { id: "não-é-uuid" })).r).toMatchObject({ codigo: "22023" });
    const { venda, r } = await vendaDeCapa(ana, { id: salvo.id, nome: "Maria (digitado)" });
    expect(r).not.toHaveProperty("codigo");
    expect((await db.query("select cliente_id, cliente_nome from public.vendas where id = $1", [venda])).rows[0]).toEqual({ cliente_id: salvo.id, cliente_nome: "Maria (digitado)" });
    expect((await valor<{ compras: { total: number } }>(ana, FICHA, [salvo.id])).compras.total).toBe(1);
    expect((await linhas(ana, "select id from public.vendas where cliente_id = $1", [salvo.id])).map((v) => v.id)).toEqual([venda]);

    expect(await codigo(ana, VINCULAR, [venda, outroCliente.id, ""])).toBe("22023");
    expect(await valor(ana, VINCULAR, [venda, outroCliente.id, "Era o marido dela"])).toBe(true);
    expect(await valor(ana, VINCULAR, [venda, outroCliente.id, "De novo"])).toBe(false);
    expect(await codigo(await naLoja(ids.vendedorAB, ids.lojaA), VINCULAR, [venda, salvo.id, "Tentativa"])).toBe("P0002");
    expect(await codigo(await naLoja(ids.gerenteB, ids.lojaB), VINCULAR, [venda, salvo.id, "Tentativa"])).toBe("P0002");
    expect(await codigo(await naLoja(ids.administrador, ids.lojaA), VINCULAR, [venda, salvo.id, "Tentativa"])).toBe("P0002");
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await codigo(dono, VINCULAR, [venda, daOutraRede.id, "Tentativa"])).toBe("P0002");
    expect(await valor(dono, VINCULAR, [venda, null, "Cliente pediu para não ligar a compra ao cadastro"])).toBe(true);
    expect((await db.query("select cliente_id, cliente_nome from public.vendas where id = $1", [venda])).rows[0]).toEqual({ cliente_id: null, cliente_nome: "Maria (digitado)" });
    expect((await db.query<{ motivo: string }>("select motivo from public.auditoria where acao = 'vendas.alterado' and alvo_id = $1 and motivo like 'Cliente da venda:%' order by id", [venda])).rows.map((x) => x.motivo))
      .toEqual(["Cliente da venda: Era o marido dela", "Cliente da venda: Cliente pediu para não ligar a compra ao cadastro"]);

    const rascunho = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    expect(await codigo(ana, VINCULAR, [rascunho, salvo.id, "Ainda aberta"])).toBe("22023");
  });
});
