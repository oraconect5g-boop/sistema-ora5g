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

const ENDERECO = { cep: "80000000", logradouro: "Rua das Flores", numero: "10", bairro: "Centro", cidade: "Curitiba", uf: "PR" };
describe("nota no nome do cliente da venda (ORA-POS-011)", () => {
  it("o banco copia nome e documento do cadastro; o cadastro ganha a finalidade nota fiscal; o uso fica registrado sem o valor", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    // Desde 14/11 (K1b, #76) a nota no nome do cliente leva também o endereço do cadastro (aqui guardado para entrega).
    const maria = (await valor<{ id: string }>(ana, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v",
      [JSON.stringify({ tipo: "pessoa_fisica", nome: "Maria Teste", documento: CPF_MARIA, telefone: "41987650020", finalidades: ["entrega"], endereco: ENDERECO }), chave("form:cli")])).id;
    const semDocumento = (await valor<{ id: string }>(ana, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v",
      [JSON.stringify({ tipo: "pessoa_fisica", nome: "Sem CPF", telefone: "41987650021" }), chave("form:cli")])).id;

    const venda = await vendaComCliente(ana, { id: maria });
    expect(await codigo(ana, PEDIR, [venda, JSON.stringify({ cliente: semDocumento }), chave("nota")])).toBe("22023");
    const pedido = await valor<string>(ana, PEDIR, [venda, JSON.stringify({ cliente: maria }), chave("nota")]);
    expect((await db.query("select destinatario_nome, destinatario_mascarado from public.notas_pedidos where id = $1", [pedido])).rows[0])
      .toEqual({ destinatario_nome: "Maria Teste", destinatario_mascarado: `•••.•••.${CPF_MARIA.slice(6, 9)}-${CPF_MARIA.slice(9)}` });
    expect((await db.query("select documento, cliente_id from privado.notas_destinatarios where pedido_id = $1", [pedido])).rows[0]).toEqual({ documento: CPF_MARIA, cliente_id: maria });
    expect((await db.query("select finalidades from public.clientes where id = $1", [maria])).rows[0]).toEqual({ finalidades: ["entrega", "nota_fiscal"] });
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

// Chave de acesso fictícia no padrão nacional (o mesmo oráculo de notas.test.ts, com o dígito calculado aqui).
function chaveDeAcesso(cnpj: string, numero = 1, modelo = "65") {
  const base = `432611${cnpj}${modelo}001${String(numero).padStart(9, "0")}112345678`;
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return base + String(resto < 2 ? 0 : 11 - resto);
}

// K1b (14/11/2026, #76; migration 20261114140614_notas_destinatario_completo): o destinatário completo guardado no
// pedido e os dados para quem emite, registrados na auditoria.
describe("nota no nome do cliente: endereço guardado e dados para emitir (K1b)", () => {
  const DADOS = "select public.notas_dados_para_emitir($1) as v";
  type Dados = { nome: string; documento: string | null; endereco: Record<string, string> | null; cliente: string | null; dados_de: string | null };
  async function clienteCom(s: Sessao, extra: object) {
    return (await valor<{ id: string }>(s, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v",
      [JSON.stringify({ tipo: "pessoa_fisica", nome: "Carla Nota", documento: CPF_MARIA, telefone: "41987650030", ...extra }), chave("form:cli")])).id;
  }

  it("sem endereço no cadastro a nota no nome dele é recusada; completado o MESMO cadastro, o pedido guarda documento, endereço e versão", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const carla = await clienteCom(ana, {});
    const venda = await vendaComCliente(ana, { id: carla });
    const recusa = await tentar(ana, PEDIR, [venda, JSON.stringify({ cliente: carla }), chave("nota")]);
    expect(recusa).toMatchObject({ codigo: "22023", mensagem: "O cliente não tem o endereço completo no cadastro: complete o cadastro (CEP, rua, número, bairro, cidade e UF) para a nota no nome dele" });
    await valor(ana, "select public.cliente_salvar($1, $2::jsonb, $3, null) as v", [carla, JSON.stringify({ finalidades: ["nota_fiscal"], endereco: ENDERECO }), "Endereço para a nota"]);
    const pedido = await valor<string>(ana, PEDIR, [venda, JSON.stringify({ cliente: carla }), chave("nota")]);
    const guardado = (await db.query("select documento, endereco, cliente_id, dados_de is not null as com_versao from privado.notas_destinatarios where pedido_id = $1", [pedido])).rows[0];
    expect(guardado).toEqual({ documento: CPF_MARIA, endereco: ENDERECO, cliente_id: carla, com_versao: true });
    // Corrigir o cadastro depois não muda o pedido.
    await valor(ana, "select public.cliente_salvar($1, $2::jsonb, $3, null) as v", [carla, JSON.stringify({ endereco: { ...ENDERECO, numero: "99" } }), "Cliente mudou de casa"]);
    expect((await db.query<{ numero: string }>("select endereco->>'numero' as numero from privado.notas_destinatarios where pedido_id = $1", [pedido])).rows[0]?.numero).toBe("10");
  });

  it("quem aprova vê os dados para emitir (fica na auditoria, sem os valores); vendedor e outra loja não; depois de emitida, não aparecem mais", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const carla = await clienteCom(ana, { finalidades: ["nota_fiscal"], endereco: ENDERECO });
    const venda = await vendaComCliente(ana, { id: carla });
    const pedido = await valor<string>(ana, PEDIR, [venda, JSON.stringify({ cliente: carla }), chave("nota")]);
    expect(await codigo(ana, DADOS, [pedido])).toBe("P0002"); // o vendedor pede a nota, mas não vê os dados para emitir
    expect(await codigo(await naLoja(ids.gerenteB, ids.lojaB), DADOS, [pedido])).toBe("P0002");
    const dono = await naLoja(ids.dono, ids.lojaA);
    const dados = await valor<Dados>(dono, DADOS, [pedido]);
    expect(dados).toMatchObject({ nome: "Carla Nota", documento: CPF_MARIA, endereco: ENDERECO, cliente: carla });
    const auditoria = (await db.query<{ depois: unknown; texto: string }>("select depois, coalesce(depois::text, '') as texto from public.auditoria where acao = 'nota.dados_para_emitir' and alvo_id = $1", [pedido])).rows;
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]?.depois).toEqual({ documento: true, endereco: true });
    expect(auditoria[0]?.texto).not.toContain(CPF_MARIA);
    // Emitida (pela chave de acesso), os dados saem do pedido.
    const cnpjA = (await db.query<{ cnpj: string }>("select cnpj from public.unidades where id = $1", [ids.lojaA])).rows[0]!.cnpj;
    await valor(dono, "select public.notas_registrar_emissao($1, $2, null) as v", [pedido, chaveDeAcesso(cnpjA)]);
    expect(await codigo(dono, DADOS, [pedido])).toBe("22023");
    expect((await db.query("select count(*)::int as n from privado.notas_destinatarios where pedido_id = $1", [pedido])).rows[0]).toEqual({ n: 0 });
  });
});
