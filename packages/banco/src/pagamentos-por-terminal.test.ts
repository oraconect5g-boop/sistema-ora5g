// Lote REPORT-005b (ORA-REPORT-005, o terminal de cada pagamento no relatório por meio): os pagamentos de cada maquininha
// no período, com as permissões de quem chama. Banco em memória com todas as migrations; dados FICTÍCIOS.
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
let sessoes = 0;
let chaves = 0;
const chave = (prefixo: string) => `${prefixo}:${++chaves}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4f000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);

const SALVAR = "select public.terminal_salvar($1, $2, $3, $4, $5, $6, $7) as v";
// A data em que o dinheiro caiu não pode passar de hoje em São Paulo (UTC−3): perto da meia-noite, o dia UTC já virou.
const hojeEmSaoPaulo = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
async function vender(s: Sessao, pagamentos: object[]) {
  const aberto = await db.query("select 1 from public.caixas where operador_id = $1 and situacao = 'aberto'", [s.usuario]);
  if (aberto.rows.length === 0) await valor(s, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, JSON.stringify(pagamentos), chave("concluir")]);
  return venda;
}
type Terminal = { terminal: string; apelido: string; provedor: string; quantidade: number; valor: number; conciliados: number; conciliado: number; liquido: number; estornados: number };
const POR_TERMINAL = "select public.pagamentos_por_terminal(now() - interval '1 day', now() + interval '1 day', $1) as v";

describe("pagamentos por maquininha (REPORT-005b)", () => {
  it("cada maquininha com os pagamentos confirmados, os conciliados e o líquido; dinheiro fica fora", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const balcao = await valor<string>(dono, SALVAR, [null, ids.lojaA, "picpay", "PP-101", "Balcão", null, "Cadastro"]);
    const caixa = await valor<string>(dono, SALVAR, [null, ids.lojaA, "pagbank", "PB-101", "Caixa", null, "Cadastro"]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await vender(ana, [{ meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-1", terminal: balcao }]);
    await vender(ana, [{ meio: "pix_picpay", valor: 7_900, comprovante: "PIX-1", terminal: balcao }]);
    await vender(ana, [{ meio: "cartao_pagseguro", valor: 7_900, comprovante: "NSU-2", terminal: caixa }]);
    await vender(ana, [{ meio: "dinheiro", valor: 7_900 }]);
    // conciliar um pagamento do balcão (a função da conciliação, como na tela)
    const pagamento = (await db.query<{ id: string }>("select id from public.venda_pagamentos where terminal_id = $1 and meio = 'cartao_picpay'", [balcao])).rows[0]?.id;
    await valor(dono, "select public.pagamento_conciliar($1, $2, $3, $4::date) as v", [pagamento, "EXT-1", 7_600, hojeEmSaoPaulo()]);
    const r = await valor<{ terminais: Terminal[] }>(dono, POR_TERMINAL, [null]);
    expect(r.terminais.map((t) => [t.apelido, t.provedor, t.quantidade, t.valor, t.conciliados, t.conciliado, t.liquido])).toEqual([
      ["Balcão", "picpay", 2, 15_800, 1, 7_900, 7_600],
      ["Caixa", "pagbank", 1, 7_900, 0, 0, 0],
    ]);
  });

  it("o estornado fica à parte; a loja escolhida filtra; o vendedor vê só as próprias vendas; outra rede não vê nada", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const balcao = await valor<string>(dono, SALVAR, [null, ids.lojaA, "picpay", "PP-201", "Balcão A", null, "Cadastro"]);
    const daB = await valor<string>(dono, SALVAR, [null, ids.lojaB, "picpay", "PP-202", "Balcão B", null, "Cadastro"]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const outraVenda = await vender(ana, [{ meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-11", terminal: balcao }]);
    await vender(ana, [{ meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-12", terminal: balcao }]);
    await vender(await naLoja(ids.gerenteB, ids.lojaB), [{ meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-13", terminal: daB }]);
    await db.query("update public.venda_pagamentos set situacao = 'estornado', estornado_em = now() where venda_id = $1", [outraVenda]);

    const rede = await valor<{ terminais: Terminal[] }>(await naLoja(ids.dono, ids.lojaA), POR_TERMINAL, [null]);
    expect(rede.terminais.map((t) => [t.apelido, t.quantidade, t.valor, t.estornados])).toEqual([["Balcão A", 1, 7_900, 1], ["Balcão B", 1, 7_900, 0]]);
    const soA = await valor<{ terminais: Terminal[] }>(await naLoja(ids.dono, ids.lojaA), POR_TERMINAL, [ids.lojaA]);
    expect(soA.terminais.map((t) => t.apelido)).toEqual(["Balcão A"]);
    // O vendedor da loja A só lê as próprias vendas (RLS): vê a maquininha da loja dele, não a da loja B.
    const doVendedor = await valor<{ terminais: Terminal[] }>(await naLoja(ids.vendedorA, ids.lojaA), POR_TERMINAL, [null]);
    expect(doVendedor.terminais.map((t) => t.apelido)).toEqual(["Balcão A"]);
    const outraRede = await valor<{ terminais: Terminal[] }>(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), POR_TERMINAL, [null]);
    expect(outraRede.terminais).toEqual([]);
  });

  it("período inválido é recusado; anônimo não executa", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await comoUsuario(db, dono, () => erroDe(() => db.query("select public.pagamentos_por_terminal(now(), now() - interval '1 day', null)")))).toBe("22023");
    expect(await comoUsuario(db, dono, () => erroDe(() => db.query("select public.pagamentos_por_terminal(now() - interval '401 days', now(), null)")))).toBe("22023");
    expect((await db.query("select has_function_privilege('anon', 'public.pagamentos_por_terminal(timestamptz, timestamptz, uuid)', 'EXECUTE') as v")).rows[0])
      .toEqual({ v: false });
  });
});
