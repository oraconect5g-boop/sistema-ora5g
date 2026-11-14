// PDV, lote L6a: nota no nome do cliente da venda (ORA-POS-011). Banco em memória com todas as migrations;
// dados FICTÍCIOS. Cada teste numa transação desfeita.
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
const chave = (prefixo = "form:l6") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `6f000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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
  });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const codigo = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};
const PEDIR = "select public.notas_solicitar($1, $2::jsonb, $3) as v";
const CPF_MARIA = cpf("529982247");

async function vendaComCliente(s: Sessao, cliente: object | null) {
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
    [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), JSON.stringify(cliente ?? {}), chave("concluir")]);
  return venda;
}

describe("nota no nome do cliente da venda (ORA-POS-011)", () => {
  it("o banco copia nome e documento do cadastro; o cadastro ganha a finalidade nota fiscal; o uso fica registrado sem o valor", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const maria = (await valor<{ id: string }>(ana, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v",
      [JSON.stringify({ tipo: "pessoa_fisica", nome: "Maria Teste", documento: CPF_MARIA, telefone: "41987650020" }), chave("form:cli")])).id;
    const semDocumento = (await valor<{ id: string }>(ana, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v",
      [JSON.stringify({ tipo: "pessoa_fisica", nome: "Sem CPF", telefone: "41987650021" }), chave("form:cli")])).id;

    const venda = await vendaComCliente(ana, { id: maria });
    expect(await codigo(ana, PEDIR, [venda, JSON.stringify({ cliente: semDocumento }), chave("nota")])).toBe("22023");
    const pedido = await valor<string>(ana, PEDIR, [venda, JSON.stringify({ cliente: maria }), chave("nota")]);
    expect((await db.query("select destinatario_nome, destinatario_mascarado from public.notas_pedidos where id = $1", [pedido])).rows[0])
      .toEqual({ destinatario_nome: "Maria Teste", destinatario_mascarado: `•••.•••.${CPF_MARIA.slice(6, 9)}-${CPF_MARIA.slice(9)}` });
    expect((await db.query("select documento from privado.notas_destinatarios where pedido_id = $1", [pedido])).rows[0]).toEqual({ documento: CPF_MARIA });
    expect((await db.query("select finalidades from public.clientes where id = $1", [maria])).rows[0]).toEqual({ finalidades: ["nota_fiscal"] });
    expect((await db.query<{ acao: string }>("select acao from public.auditoria where alvo_tipo = 'cliente' and alvo_id = $1 and acao in ('cliente.alterado', 'cliente.documento_na_nota') order by id", [maria])).rows.map((r) => r.acao))
      .toEqual(["cliente.alterado", "cliente.documento_na_nota"]);
    expect(Number((await db.query<{ n: string }>("select count(*) as n from public.auditoria where coalesce(antes::text, '') || coalesce(depois::text, '') like '%' || $1 || '%'", [CPF_MARIA])).rows[0]?.n)).toBe(0);

    // Venda sem cliente ligado (ou outro cliente) não usa cadastro; o documento digitado continua valendo.
    const avulsa = await vendaComCliente(ana, null);
    expect(await codigo(ana, PEDIR, [avulsa, JSON.stringify({ cliente: maria }), chave("nota")])).toBe("22023");
    const comDigitado = await valor<string>(ana, PEDIR, [avulsa, JSON.stringify({ nome: "Comprador Avulso", documento: CPF_MARIA }), chave("nota")]);
    expect((await db.query("select destinatario_nome from public.notas_pedidos where id = $1", [comDigitado])).rows[0]).toEqual({ destinatario_nome: "Comprador Avulso" });
  });
});
