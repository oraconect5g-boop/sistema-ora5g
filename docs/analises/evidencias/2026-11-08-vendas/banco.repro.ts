// Copiar temporariamente para packages/banco/src/revisao-vendas-extra.test.ts.
// Apenas banco local descartável e identidades fictícias. Falhas são evidências,
// não testes da suíte normal. Não executar contra Supabase ou dados reais.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { conferirPagamentos } from "../../dominio/src/pagamento";
import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
let sequencia = 0;
const chave = () => `revisao-financeira:${++sequencia}`;
beforeAll(async () => { db = await criarBanco(); await montarCenario(db); await montarCatalogo(db); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
async function loja(usuario = ids.vendedorA, unidade = ids.lojaA) {
  const s = { usuario, sessao: `82000000-0000-4000-8000-${String(++sequencia).padStart(12, "0")}` };
  await valor(s, "select public.selecionar_unidade($1) as v", [unidade]);
  return s;
}
const caixa = (s: Sessao, fundo = 0) => valor<string>(s, "select public.abrir_caixa($1,$2) as v", [fundo, chave()]);
async function venda(s: Sessao, variante = cat.aparelho, item: string | null = itens.a1) {
  const id = await valor<string>(s, "select public.criar_venda($1) as v", [chave()]);
  const linha = await valor<string>(s, "select public.adicionar_item($1,$2,$3,1,$4) as v", [id, variante, item, chave()]);
  return { id, linha };
}
const concluir = (s: Sessao, id: string, pagamentos: object[]) =>
  valor<Record<string, unknown>>(s, "select public.concluir_venda($1,$2::jsonb,$3::jsonb,$4) as v", [id, JSON.stringify(pagamentos), '{"email":"cliente@teste.invalid"}', chave()]);
const cancelar = (s: Sessao, id: string) => valor(s, "select public.cancelar_venda($1,'Solicitacao comercial ficticia') as v", [id]);
const saldo = async (id: string) => Number((await db.query<{ v: string }>("select coalesce(sum(valor_centavos),0) as v from public.caixa_movimentos where caixa_id=$1 and meio='dinheiro'", [id])).rows[0]?.v);
async function codigo(acao: () => Promise<unknown>) {
  await db.exec("savepoint tentativa");
  let erro: string | null = null;
  try { await acao(); } catch (e) { erro = (e as { code: string }).code; await db.exec("rollback to savepoint tentativa"); }
  await db.exec("release savepoint tentativa");
  return erro;
}
async function pedido(s: Sessao) {
  const v = await venda(s, cat.capa, null);
  await valor(s, "select public.aplicar_desconto($1,500) as v", [v.linha]);
  return valor<string>(s, "select public.pedir_aprovacao($1,'Cliente ficticio') as v", [v.linha]);
}

it("controle: venda em dinheiro baixa estoque e devolve somente o troco", async () => {
  const s = await loja(); const c = await caixa(s); const v = await venda(s);
  const r = await concluir(s, v.id, [{ meio: "dinheiro", valor: 150_000 }]);
  expect(r).toMatchObject({ total: 149_900, troco: 100, recebido: 149_900, a_receber: 0 });
  expect(await saldo(c)).toBe(149_900);
  expect((await db.query("select situacao from public.itens_serializados where id=$1", [itens.a1])).rows).toEqual([{ situacao: "vendido" }]);
});
it("controle: financiamento com entrada Pix documentada mantém valor a receber", async () => {
  const s = await loja(); await caixa(s); const v = await venda(s);
  const r = await concluir(s, v.id, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: "pix_direto", comprovante: "FICTICIO-1234" }]);
  expect(r).toMatchObject({ recebido: 20_000, a_receber: 129_900, troco: 0 });
});
it.each(["bloqueio", "sessao_revogada"])("aprovações próprias deixam de ser legíveis após %s", async (modo) => {
  const s = await loja(); const id = await pedido(s);
  expect(await valor<number>(s, "select count(*)::int as v from public.aprovacoes_desconto where id=$1", [id])).toBe(1);
  if (modo === "bloqueio") await valor(await loja(ids.administrador), "select public.alterar_situacao_pessoa($1,'bloqueado','Desligamento ficticio') as v", [s.usuario]);
  else await db.query("delete from auth.sessions where id=$1", [s.sessao]);
  const linhas = await comoUsuario(db, s, async () => (await db.query("select id from public.aprovacoes_desconto where id=$1", [id])).rows, { criarSessao: false });
  process.stdout.write(`EVIDENCIA acesso_${modo} linhas=${linhas.length}\n`);
  expect(linhas).toHaveLength(0);
});
it.each(["pix_direto", "pix_picpay", "cartao_picpay", "cartao_pagseguro"])("entrada %s de financiamento exige comprovante", async (meio) => {
  const s = await loja(); await caixa(s); const v = await venda(s);
  const erro = await codigo(() => concluir(s, v.id, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: meio }]));
  process.stdout.write(`EVIDENCIA entrada_${meio} codigo=${erro}\n`);
  expect(erro).toBe("OR009");
});
it("estorno de entrada em dinheiro recusa caixa da gerência sem saldo", async () => {
  const s = await loja(); await caixa(s); const v = await venda(s);
  await concluir(s, v.id, [{ meio: "aiva", valor: 149_900, entrada: 20_000, meio_entrada: "dinheiro" }]);
  const gerente = await loja(ids.dono); const c = await caixa(gerente);
  const erro = await codigo(() => cancelar(gerente, v.id));
  process.stdout.write(`EVIDENCIA estorno_entrada codigo=${erro} saldo=${await saldo(c)}\n`);
  expect(erro).toBe("23514"); expect(await saldo(c)).toBeGreaterThanOrEqual(0);
});
it("financiamento acima do preço não cria crédito adicional nem diverge da regra de domínio", async () => {
  const s = await loja(); await caixa(s); const v = await venda(s);
  const pagamentos = [{ meio: "aiva" as const, valor: 150_000, entrada: 20_000, meio_entrada: "dinheiro" }];
  const dominio = conferirPagamentos(149_900, pagamentos);
  expect(dominio.valido).toBe(false);
  const erro = await codigo(() => concluir(s, v.id, pagamentos));
  process.stdout.write(`EVIDENCIA financiamento_excedente dominio=${dominio.valido} codigo_banco=${erro}\n`);
  expect(erro).toBe("OR009");
});
it("cancelamento devolve somente a entrada efetivamente retida após o troco", async () => {
  const s = await loja(); const original = await caixa(s); const v = await venda(s);
  await concluir(s, v.id, [{ meio: "aiva", valor: 150_000, entrada: 20_000, meio_entrada: "dinheiro" }]);
  const retido = await saldo(original);
  const gerente = await loja(ids.dono); const fundo = 100_000; const c = await caixa(gerente, fundo);
  await cancelar(gerente, v.id);
  const devolvido = fundo - await saldo(c);
  process.stdout.write(`EVIDENCIA estorno_troco retido=${retido} devolvido=${devolvido}\n`);
  expect(devolvido).toBe(retido);
});
it.each(["pix_direto", "cartao_picpay"])("cancelar venda %s não confirma estorno externo ainda não realizado", async (meio) => {
  const s = await loja(); await caixa(s); const v = await venda(s);
  await concluir(s, v.id, [{ meio, valor: 149_900, comprovante: "VENDA-FICTICIA-1234" }]);
  const gerente = await loja(ids.dono); await caixa(gerente); await cancelar(gerente, v.id);
  const p = (await db.query<{ situacao: string; estornado_em: string | null }>("select situacao,estornado_em from public.venda_pagamentos where venda_id=$1", [v.id])).rows[0];
  process.stdout.write(`EVIDENCIA estorno_externo_${meio} situacao=${p?.situacao} data_registrada=${p?.estornado_em != null}\n`);
  expect(p?.situacao).not.toBe("estornado"); expect(p?.estornado_em).toBeNull();
});
it.each(["aparelho", "chip"])("cancelamento comercial sem confirmação física não torna %s disponível", async (tipo) => {
  if (tipo === "chip") await db.query("insert into public.precos(organizacao_id,variante_id,valor_centavos,inicio,origem) values($1,$2,1000,now()-interval '1 day','manual')", [ids.organizacao, cat.chip]);
  const s = await loja(); await caixa(s);
  const id = tipo === "chip" ? itens.chipA : itens.a1;
  const v = await venda(s, tipo === "chip" ? cat.chip : cat.aparelho, id);
  await concluir(s, v.id, [{ meio: "pix_direto", valor: tipo === "chip" ? 1000 : 149_900, comprovante: "VENDA-FICTICIA-1234" }]);
  const gerente = await loja(ids.dono); await caixa(gerente); await cancelar(gerente, v.id);
  const estado = (await db.query<{ situacao: string; em_estoque: boolean }>("select situacao,em_estoque from public.itens_serializados where id=$1", [id])).rows[0];
  process.stdout.write(`EVIDENCIA retorno_${tipo} situacao=${estado?.situacao} em_estoque=${estado?.em_estoque}\n`);
  expect(estado?.situacao).not.toBe("disponivel"); expect(estado?.em_estoque).toBe(false);
});
