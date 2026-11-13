// Saída autorizada do caixa (lote L7c: ORA-PAY-005; decisão do proprietário de 13/11: autoriza o gerente
// ou o dono). Quem está com o caixa aberto pede; outra pessoa com caixa.conferir autoriza ou nega; ao
// autorizar, o banco lança a saída no caixa e o fechamento já desconta. Banco em memória com todas as
// migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = (prefixo = "l7c") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `79000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string }> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return { v };
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      return { codigo: (e as { code?: string }).code ?? "sem-codigo" };
    }
  });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.codigo}`);
  return r.v;
}
const codigo = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

const PEDIR = "select public.caixa_pedir_saida($1, $2, $3) as v";
const DECIDIR = "select public.caixa_decidir_saida($1, $2, $3) as v";
const CANCELAR = "select public.caixa_cancelar_saida($1) as v";
const abrir = (s: Sessao, fundo = 10_000) => valor<string>(s, "select public.abrir_caixa($1, $2) as v", [fundo, chave("caixa")]);
const dinheiroNoCaixa = async (caixa: string) => Number((await db.query<{ v: string }>("select privado.dinheiro_no_caixa($1)::text as v", [caixa])).rows[0]?.v);
const saida = async (id: string) =>
  (await db.query<{ situacao: string; decidida_por: string | null; motivo_decisao: string | null; movimento_id: string | null }>(
    "select situacao, decidida_por, motivo_decisao, movimento_id::text from public.caixa_saidas where id = $1", [id])).rows[0];

describe("caixa: saída autorizada (L7c)", () => {
  it("a vendedora pede, o dono autoriza: a saída entra no caixa dela e o fechamento já desconta", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const caixa = await abrir(ana);
    const pedido = await valor<string>(ana, PEDIR, [3_000, "  Pagar   o motoboy ", chave()]);
    expect(await saida(pedido)).toEqual({ situacao: "pendente", decidida_por: null, motivo_decisao: null, movimento_id: null });
    expect(await dinheiroNoCaixa(caixa)).toBe(10_000);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await valor(dono, DECIDIR, [pedido, true, null])).toBe("autorizada");
    expect(await saida(pedido)).toMatchObject({ situacao: "autorizada", decidida_por: ids.dono });
    const mov = (await db.query<{ tipo: string; valor: string; motivo: string; usuario_id: string }>(
      "select tipo, valor_centavos::text as valor, motivo, usuario_id from public.caixa_movimentos where id = $1", [(await saida(pedido))?.movimento_id])).rows[0];
    expect(mov).toEqual({ tipo: "saida_autorizada", valor: "-3000", motivo: "Saída autorizada: Pagar o motoboy", usuario_id: ids.dono });
    expect(await dinheiroNoCaixa(caixa)).toBe(7_000);
    // Repetir a mesma decisão não lança de novo; mudar de ideia sobre o decidido é recusado.
    expect(await valor(dono, DECIDIR, [pedido, true, null])).toBe("autorizada");
    expect(await codigo(dono, DECIDIR, [pedido, false, "Mudei de ideia"])).toBe("22023");
    expect(await dinheiroNoCaixa(caixa)).toBe(7_000);
    // O fechamento conta R$ 70,00 e não acusa diferença.
    const fechamento = await comoUsuario(db, ana, async () => (await db.query<{ esperado: string; diferenca: string }>("select esperado::text, diferenca::text from public.fechar_caixa(7000, null)")).rows[0], { criarSessao: false });
    expect(fechamento).toEqual({ esperado: "7000", diferenca: "0" });
    // Auditoria: o pedido e a autorização, com o motivo.
    const motivos = (await db.query<{ motivo: string }>("select motivo from public.auditoria where alvo_id = $1 order by id", [pedido])).rows.map((r) => r.motivo);
    expect(motivos).toEqual(["Pedido de saída do caixa: Pagar o motoboy", "Saída do caixa autorizada: Pagar o motoboy"]);
  });

  it("pedir: valor até o dinheiro da gaveta, motivo obrigatório, caixa aberto e a mesma chave devolve o mesmo pedido", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await codigo(ana, PEDIR, [1_000, "Pagar o motoboy", chave()])).toBe("OR008");
    await abrir(ana, 5_000);
    expect(await codigo(ana, PEDIR, [5_001, "Pagar o motoboy", chave()])).toBe("23514");
    expect(await codigo(ana, PEDIR, [0, "Pagar o motoboy", chave()])).toBe("22023");
    expect(await codigo(ana, PEDIR, [1_000, "ok", chave()])).toBe("22023");
    const k = chave();
    const primeiro = await valor<string>(ana, PEDIR, [1_000, "Pagar o motoboy", k]);
    expect(await valor(ana, PEDIR, [1_000, "Pagar o motoboy", k])).toBe(primeiro);
    expect(await codigo(ana, PEDIR, [2_000, "Pagar o motoboy", k])).toBe("OR004");
  });

  it("quem decide: gerente ou dono da loja, nunca quem pediu; a vendedora e a gerente de outra loja não encontram o pedido", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrir(ana);
    const daAna = await valor<string>(ana, PEDIR, [2_000, "Compra de material de limpeza", chave()]);
    expect(await codigo(await naLoja(ids.vendedorAB, ids.lojaA), DECIDIR, [daAna, true, null])).toBe("P0002");
    expect(await codigo(await naLoja(ids.gerenteB, ids.lojaB), DECIDIR, [daAna, true, null])).toBe("P0002");
    // A gerente pede no próprio caixa: ela não autoriza a própria saída; o dono autoriza.
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    await abrir(gerente);
    const daGerente = await valor<string>(gerente, PEDIR, [1_500, "Pagar o motoboy", chave()]);
    expect(await codigo(gerente, DECIDIR, [daGerente, true, null])).toBe("42501");
    expect(await valor(await naLoja(ids.dono, ids.lojaB), DECIDIR, [daGerente, true, null])).toBe("autorizada");
  });

  it("negar pede motivo; cancelar é só de quem pediu e só antes da decisão; o caixa já fechado não recebe saída", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrir(ana);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const negado = await valor<string>(ana, PEDIR, [2_000, "Lanche da equipe", chave()]);
    expect(await codigo(dono, DECIDIR, [negado, false, null])).toBe("22023");
    expect(await valor(dono, DECIDIR, [negado, false, "Não é despesa da loja"])).toBe("negada");
    expect(await saida(negado)).toMatchObject({ situacao: "negada", motivo_decisao: "Não é despesa da loja", movimento_id: null });
    expect(await codigo(dono, DECIDIR, [negado, true, null])).toBe("22023");
    const cancelado = await valor<string>(ana, PEDIR, [1_000, "Pagar o motoboy", chave()]);
    expect(await codigo(dono, CANCELAR, [cancelado])).toBe("P0002");
    expect(await valor(ana, CANCELAR, [cancelado])).toBe(true);
    expect(await valor(ana, CANCELAR, [cancelado])).toBe(false);
    expect(await codigo(dono, DECIDIR, [cancelado, true, null])).toBe("22023");
    // Pedido feito e caixa fechado antes da autorização: autorizar é recusado, negar continua possível.
    const tarde = await valor<string>(ana, PEDIR, [1_000, "Pagar o motoboy", chave()]);
    await comoUsuario(db, ana, () => db.query("select * from public.fechar_caixa(10000, null)"), { criarSessao: false });
    expect(await codigo(dono, DECIDIR, [tarde, true, null])).toBe("22023");
    expect(await valor(dono, DECIDIR, [tarde, false, "Caixa já fechado"])).toBe("negada");
  });

  it("quem vê os pedidos: quem pediu, os próprios; quem confere caixa, os da loja; outra vendedora, nenhum", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrir(ana);
    await valor(ana, PEDIR, [1_000, "Pagar o motoboy", chave()]);
    const conta = async (s: Sessao) => comoUsuario(db, s, async () => (await db.query("select id from public.caixa_saidas")).rows.length, { criarSessao: false });
    expect(await conta(ana)).toBe(1);
    expect(await conta(await naLoja(ids.vendedorAB, ids.lojaA))).toBe(0);
    expect(await conta(await naLoja(ids.dono, ids.lojaA))).toBe(1);
    expect(await conta(await naLoja(ids.gerenteB, ids.lojaB))).toBe(0);
    // Ninguém escreve direto na tabela: só pelas funções do banco.
    expect(await codigo(ana, "update public.caixa_saidas set situacao = 'autorizada' returning 1 as v")).toBe("42501");
  });
});
