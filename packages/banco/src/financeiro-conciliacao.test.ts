// Situação da conciliação por meio no financeiro (lote G2b: ORA-REPORT-005; linha 16 da matriz, P5).
// public.financeiro_painel soma, no grão "pagamentos", quantos pagamentos do grupo já foram conciliados
// com o extrato, o valor deles e o líquido que caiu na conta. Banco em memória com todas as migrations;
// dados FICTÍCIOS. Cada teste numa transação desfeita.
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
const chave = (prefixo = "g2b") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `72000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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
const CONCILIAR = "select public.pagamento_conciliar($1, $2, $3, $4::date) as v";
const DESFAZER = "select public.pagamento_desconciliar($1, $2) as v";
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

async function vender(s: Sessao, pagamentos: object[]) {
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, JSON.stringify(pagamentos), chave("concluir")]);
  return venda;
}
const pagamentoDa = async (venda: string, meio: string) =>
  (await db.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1 and meio = $2", [venda, meio])).rows[0]?.id ?? "";

type Grupo = { meio: string; situacao: string; meio_entrada: string | null; quantidade: number; valor: number; entrada: number; troco: number; conciliados: number; conciliado: number; liquido: number };
/** O grão "pagamentos" do financeiro de hoje, com os números como inteiros. */
async function grupos(s: Sessao, unidade: string | null = null): Promise<Grupo[]> {
  const painel = await valor<{ pagamentos: Record<string, unknown>[] }>(
    s, "select public.financeiro_painel(now() - interval '1 day', now() + interval '1 hour', $1, false) as v", [unidade],
  );
  return painel.pagamentos.map((g) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v])) as Grupo);
}
const SEM_CONCILIACAO = { conciliados: 0, conciliado: 0, liquido: 0 };

describe("financeiro: situação da conciliação por meio (G2b, P5)", () => {
  it("pagamento conciliado conta no grupo dele (quantidade, valor e líquido); o resto do meio continua a conciliar", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const primeira = await vender(ana, [{ meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-1" }]);
    await vender(ana, [{ meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-2" }]);
    await vender(ana, [{ meio: "dinheiro", valor: 4_000 }, { meio: "pix_direto", valor: 3_900, comprovante: "E2E-1" }]);

    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await grupos(dono, ids.lojaA)).toEqual([
      { meio: "cartao_picpay", situacao: "confirmado", meio_entrada: null, quantidade: 2, valor: 15_800, entrada: 0, troco: 0, ...SEM_CONCILIACAO },
      { meio: "dinheiro", situacao: "confirmado", meio_entrada: null, quantidade: 1, valor: 4_000, entrada: 0, troco: 0, ...SEM_CONCILIACAO },
      { meio: "pix_direto", situacao: "confirmado", meio_entrada: null, quantidade: 1, valor: 3_900, entrada: 0, troco: 0, ...SEM_CONCILIACAO },
    ]);

    // Caiu R$ 76,50 na conta pelos R$ 79,00 da primeira venda: a diferença observada é de R$ 2,50.
    expect(await valor(dono, CONCILIAR, [await pagamentoDa(primeira, "cartao_picpay"), "LOTE-1", 7_650, hoje()])).toBe(true);
    const depois = await grupos(dono, ids.lojaA);
    expect(depois.find((g) => g.meio === "cartao_picpay")).toMatchObject({ quantidade: 2, valor: 15_800, conciliados: 1, conciliado: 7_900, liquido: 7_650 });
    // Os outros meios e os outros números do grupo não mudam.
    expect(depois.filter((g) => g.meio !== "cartao_picpay")).toEqual((await grupos(dono, ids.lojaA)).filter((g) => g.meio !== "cartao_picpay"));
    expect(depois.find((g) => g.meio === "pix_direto")).toMatchObject(SEM_CONCILIACAO);
  });

  it("conciliação desfeita volta a 'a conciliar'", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await vender(ana, [{ meio: "pix_picpay", valor: 7_900, comprovante: "E2E-2" }]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const pagamento = await pagamentoDa(venda, "pix_picpay");
    await valor(dono, CONCILIAR, [pagamento, "EXTRATO-7", 7_900, hoje()]);
    expect((await grupos(dono, ids.lojaA)).find((g) => g.meio === "pix_picpay")).toMatchObject({ conciliados: 1, conciliado: 7_900, liquido: 7_900 });
    expect(await valor(dono, DESFAZER, [pagamento, "Linha do extrato errada"])).toBe(true);
    expect((await grupos(dono, ids.lojaA)).find((g) => g.meio === "pix_picpay")).toMatchObject({ quantidade: 1, valor: 7_900, ...SEM_CONCILIACAO });
  });

  it("meio que não se concilia fica sempre com zero: o dinheiro nem aceita conciliação", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await vender(ana, [{ meio: "dinheiro", valor: 7_900 }]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await codigo(dono, CONCILIAR, [await pagamentoDa(venda, "dinheiro"), "LOTE-9", 7_900, hoje()])).toBe("22023");
    for (const g of await grupos(dono, ids.lojaA)) expect(g, g.meio).toMatchObject(SEM_CONCILIACAO);
  });

  it("valor líquido nunca passa do valor do pagamento: a conciliação é recusada e o painel não muda", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await vender(ana, [{ meio: "cartao_pagseguro", valor: 7_900, comprovante: "NSU-3" }]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const antes = await grupos(dono, ids.lojaA);
    expect(await codigo(dono, CONCILIAR, [await pagamentoDa(venda, "cartao_pagseguro"), "LOTE-5", 8_000, hoje()])).toBe("22023");
    expect(await grupos(dono, ids.lojaA)).toEqual(antes);
    // Nem gravando direto na tabela (sem a função): a regra está no próprio banco.
    await db.exec("savepoint direto");
    await expect(db.query("update public.venda_pagamentos set liquidado_em = current_date, valor_liquido_centavos = 8000, referencia_conciliacao = 'X', conciliado_em = now(), conciliado_por = $1 where venda_id = $2", [ids.dono, venda]))
      .rejects.toMatchObject({ code: "23514" });
    await db.exec("rollback to savepoint direto");
  });

  it("os meios que se conciliam são os de privado.meio_liquidavel (a tela usa a mesma lista)", async () => {
    const meios = ["dinheiro", "pix_direto", "pix_picpay", "cartao_picpay", "cartao_pagseguro", "link_pagamento", "payjoy", "aiva", "vale_troca"];
    const r = await db.query<{ meio: string }>("select m as meio from unnest($1::text[]) m where privado.meio_liquidavel(m) order by m", [meios]);
    expect(r.rows.map((x) => x.meio)).toEqual(["cartao_pagseguro", "cartao_picpay", "pix_direto", "pix_picpay"]);
  });

  it("valem as regras de leitura de quem chama: a vendedora vê a conciliação só das próprias vendas; a outra loja não entra", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await vender(ana, [{ meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-4" }]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, CONCILIAR, [await pagamentoDa(venda, "cartao_picpay"), "LOTE-4", 7_700, hoje()]);

    expect((await grupos(ana)).find((g) => g.meio === "cartao_picpay")).toMatchObject({ quantidade: 1, conciliados: 1, conciliado: 7_900, liquido: 7_700 });
    expect(await grupos(await naLoja(ids.gerenteB, ids.lojaB))).toEqual([]);
    // A rede soma a loja A conciliada.
    expect((await grupos(dono)).find((g) => g.meio === "cartao_picpay")).toMatchObject({ conciliados: 1, liquido: 7_700 });
  });
});
