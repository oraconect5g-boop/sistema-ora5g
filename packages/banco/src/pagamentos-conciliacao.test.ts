// Maquininhas por loja, maquininha no pagamento e conciliação manual (lote L7a: ORA-PAY-012, ORA-PAY-001,
// ORA-PAY-003, ORA-PAY-007). Banco em memória com todas as migrations; dados FICTÍCIOS. Cada teste numa
// transação desfeita.
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
const chave = (prefixo = "l7a") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `70000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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
const SALVAR = "select public.terminal_salvar($1, $2, $3, $4, $5, $6, $7) as v";
const CONCILIAR = "select public.pagamento_conciliar($1, $2, $3, $4::date) as v";
const DESFAZER = "select public.pagamento_desconciliar($1, $2) as v";
const PERIODO = "select public.pagamentos_do_periodo($1::date, $2::date) as v";
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

async function vender(s: Sessao, pagamentos: object[]) {
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  const r = await tentar(s, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, JSON.stringify(pagamentos), chave("concluir")]);
  return { venda, r };
}

describe("maquininhas por loja (ORA-PAY-012) e no pagamento (ORA-PAY-001)", () => {
  it("dono e gerente cadastram na loja; o mesmo terminal não entra duas vezes; desativar com motivo", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const t1 = await valor<string>(gerente, SALVAR, [null, ids.lojaB, "picpay", " ab-123 ", "Balcão 1", null, "Maquininha nova"]);
    expect((await db.query("select provedor, identificador, apelido, ativo from public.terminais where id = $1", [t1])).rows[0])
      .toEqual({ provedor: "picpay", identificador: "AB-123", apelido: "Balcão 1", ativo: true });
    expect(await codigo(gerente, SALVAR, [null, ids.lojaB, "picpay", "AB-123", "De novo", null, "Repetida"])).toBe("OR020");
    expect(await codigo(gerente, SALVAR, [null, ids.lojaA, "picpay", "XY-999", "Outra loja", null, "Tentativa"])).toBe("42501");
    expect(await codigo(gerente, SALVAR, [null, ids.lojaB, "stone", "XY-999", "Outra", null, "Provedor"])).toBe("22023");
    expect(await codigo(await naLoja(ids.vendedorA, ids.lojaA), SALVAR, [null, ids.lojaA, "picpay", "XY-998", "Vendedor", null, "Tentativa"])).toBe("42501");
    expect(await valor(gerente, SALVAR, [t1, null, null, null, "Balcão 1", false, "Quebrou"])).toBe(t1);
    expect((await db.query("select ativo from public.terminais where id = $1", [t1])).rows[0]).toEqual({ ativo: false });
    expect((await db.query<{ motivo: string }>("select motivo from public.auditoria where acao = 'terminais.alterado' and alvo_id = $1", [t1])).rows.map((r) => r.motivo)).toEqual(["Quebrou"]);
  });

  it("com maquininha ativa do provedor, escolher é obrigatório e precisa ser da loja e do mesmo provedor; sem maquininha cadastrada segue como antes", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    // Sem maquininha cadastrada: o cartão PicPay passa sem escolher.
    expect((await vender(ana, [{ meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-1" }])).r).not.toHaveProperty("codigo");
    const dono = await naLoja(ids.dono, ids.lojaA);
    const picpay = await valor<string>(dono, SALVAR, [null, ids.lojaA, "picpay", "PP-001", "Balcão", null, "Cadastro"]);
    const pagbank = await valor<string>(dono, SALVAR, [null, ids.lojaA, "pagbank", "PB-001", "Caixa", null, "Cadastro"]);
    const daOutraLoja = await valor<string>(dono, SALVAR, [null, ids.lojaB, "picpay", "PP-002", "Loja B", null, "Cadastro"]);
    expect((await vender(ana, [{ meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-2" }])).r).toMatchObject({ codigo: "OR009" });
    expect((await vender(ana, [{ meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-3", terminal: pagbank }])).r).toMatchObject({ codigo: "OR009" });
    expect((await vender(ana, [{ meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-4", terminal: daOutraLoja }])).r).toMatchObject({ codigo: "OR009" });
    expect((await vender(ana, [{ meio: "dinheiro", valor: 7_900, terminal: picpay }])).r).toMatchObject({ codigo: "OR009" });
    const { venda, r } = await vender(ana, [{ meio: "pix_picpay", valor: 7_900, comprovante: "E2E-PIX-1", terminal: picpay }]);
    expect(r).not.toHaveProperty("codigo");
    expect((await db.query("select meio, terminal_id from public.venda_pagamentos where venda_id = $1", [venda])).rows).toEqual([{ meio: "pix_picpay", terminal_id: picpay }]);
    // Pix direto vai para a conta: não usa maquininha.
    expect((await vender(ana, [{ meio: "pix_direto", valor: 7_900, comprovante: "E2E-PIX-2" }])).r).not.toHaveProperty("codigo");
  });
});

describe("situação do dinheiro e conciliação manual (ORA-PAY-003, ORA-PAY-007)", () => {
  it("cartão e Pix ficam a liquidar até a conciliação; dinheiro fica no caixa; conciliar pede referência, líquido e data; desfazer com motivo", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const cartao = (await vender(ana, [{ meio: "cartao_pagseguro", valor: 7_900, comprovante: "NSU-10" }])).venda;
    await vender(ana, [{ meio: "dinheiro", valor: 7_900 }]);
    await vender(ana, [{ meio: "dinheiro", valor: 4_000 }, { meio: "pix_direto", valor: 3_900, comprovante: "E2E-PIX-10" }]);
    const pagamento = (await db.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1", [cartao])).rows[0]?.id ?? "";

    const dono = await naLoja(ids.dono, ids.lojaA);
    type Periodo = { totais: Record<string, { quantidade: number; valor: number; liquido: number | null }>; pagamentos: { id: string; dinheiro: string }[] };
    const antes = await valor<Periodo>(dono, PERIODO, [hoje(), hoje()]);
    expect(antes.totais).toEqual({
      a_liquidar: { quantidade: 2, valor: 11_800, liquido: null }, no_caixa: { quantidade: 2, valor: 11_900, liquido: null },
    });
    expect(antes.pagamentos.map((p) => p.dinheiro)).toEqual(["a_liquidar", "a_liquidar"]);

    expect(await codigo(ana, CONCILIAR, [pagamento, "LOTE-1", 7_600, hoje()])).toBe("P0002");
    expect(await codigo(dono, CONCILIAR, [pagamento, "x", 7_600, hoje()])).toBe("22023");
    expect(await codigo(dono, CONCILIAR, [pagamento, "LOTE-1", 8_000, hoje()])).toBe("22023");
    expect(await codigo(dono, CONCILIAR, [pagamento, "LOTE-1", 7_600, "2020-01-01"])).toBe("22023");
    expect(await valor(dono, CONCILIAR, [pagamento, "LOTE-1", 7_600, hoje()])).toBe(true);
    expect(await valor(dono, CONCILIAR, [pagamento, "LOTE-1", 7_600, hoje()])).toBe(false);
    expect(await codigo(dono, CONCILIAR, [pagamento, "LOTE-2", 7_600, hoje()])).toBe("OR030");
    const depois = await valor<Periodo>(dono, PERIODO, [hoje(), hoje()]);
    expect(depois.totais.conciliado).toEqual({ quantidade: 1, valor: 7_900, liquido: 7_600 });
    expect(depois.totais.a_liquidar).toEqual({ quantidade: 1, valor: 3_900, liquido: null });

    const dinheiro = (await db.query<{ id: string }>("select p.id from public.venda_pagamentos p where p.meio = 'dinheiro' limit 1")).rows[0]?.id ?? "";
    expect(await codigo(dono, CONCILIAR, [dinheiro, "LOTE-3", 100, hoje()])).toBe("22023");
    expect(await codigo(dono, DESFAZER, [pagamento, ""])).toBe("22023");
    expect(await valor(dono, DESFAZER, [pagamento, "Lote errado"])).toBe(true);
    expect(await valor(dono, DESFAZER, [pagamento, "De novo"])).toBe(false);
    expect((await db.query<{ motivo: string }>("select motivo from public.auditoria where acao = 'venda_pagamentos.alterado' and alvo_id = $1 order by id", [pagamento])).rows.map((r) => r.motivo))
      .toEqual(["Conciliação manual com o extrato: LOTE-1", "Conciliação desfeita: Lote errado"]);
    expect(await codigo(await naLoja(ids.gerenteB, ids.lojaB), CONCILIAR, [pagamento, "LOTE-9", 7_600, hoje()])).toBe("P0002");
    expect(await codigo(ana, PERIODO, [hoje(), hoje()])).toBe("42501");
    expect(await codigo(dono, PERIODO, ["2026-01-01", "2026-12-31"])).toBe("22023");
  });
});
