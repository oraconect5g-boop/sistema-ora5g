// Lote G3b (14/11/2026, ORA-REPORT-007 o resto; E8 da matriz; migration 20261115000320_estoque_valor_em_custo, antes 20261114235000): o valor
// do estoque pelo custo vigente da variação, só para quem tem custo.ver e estoque.consultar. Dados FICTÍCIOS do cenário
// do catálogo: loja A com 2 aparelhos (custo R$ 1.100,00), 10 capas (R$ 18,00) e 1 chip sem custo; loja B com 1 aparelho
// e 3 capas.
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
  const s = { usuario, sessao: `4b000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
type Valor = { unidade: string | null; resumo: Record<string, number>; por_local: { unidade: string; nome: string; vende: boolean; valor: number; itens_com_custo: number; itens_sem_custo: number; valor_chegando: number; chegando_sem_custo: number }[] };
const VALOR = "select public.estoque_valor_em_custo($1) as v";
const valor = (s: Sessao, unidade: string | null = null) => comoUsuario(db, s, async () => (await db.query<{ v: Valor }>(VALOR, [unidade])).rows[0]?.v as Valor);
const errou = (s: Sessao, unidade: string | null = null) => comoUsuario(db, s, () => erroDe(() => db.query(VALOR, [unidade])));

describe("valor do estoque a custo (G3b)", () => {
  it("o dono vê a rede: quantidade × custo vigente por local; o chip sem custo fica fora e é contado", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const r = await valor(dono);
    expect(r.resumo).toMatchObject({ valor: 238_000 + 115_400, itens_com_custo: 16, itens_sem_custo: 1, variacoes_sem_custo: 1, valor_chegando: 0, valor_fora_da_venda: 0 });
    expect(r.por_local.map((l) => [l.nome, l.vende, l.valor, l.itens_com_custo, l.itens_sem_custo])).toEqual([
      ["Loja A", true, 238_000, 12, 1], ["Loja B", true, 115_400, 4, 0], ["Loja C", true, 0, 0, 0], ["Loja Online", true, 0, 0, 0], ["Assistência", false, 0, 0, 0],
    ]);
    expect((await valor(dono, ids.lojaB)).resumo).toMatchObject({ valor: 115_400, itens_com_custo: 4, itens_sem_custo: 0 });
  });

  it("vale o último custo gravado; fora da venda e chegando por transferência aparecem à parte", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await db.query("insert into public.custos (organizacao_id, variante_id, valor_centavos, inicio, origem) values ($1, $2, 2000, now(), 'manual')", [ids.organizacao, cat.capa]);
    await db.query("select privado.lancar_movimento($1, $2, 2, 'entrada_importacao', null, null, null, null, 'teste:capa-assistencia')", [ids.assistencia, cat.capa]);
    await db.query(`insert into public.transferencias (organizacao_id, origem_id, destino_id, variante_id, quantidade, motivo, chave, conteudo, situacao, solicitado_por, enviado_em)
      values ($1, $2, $3, $4, 3, 'Reposição da loja C', 'teste:transf', 'teste', 'enviada', $5, now())`, [ids.organizacao, ids.lojaA, ids.lojaC, cat.capa, ids.dono]);
    const r = await valor(dono);
    expect(r.por_local.find((l) => l.nome === "Loja A")?.valor).toBe(2 * 110_000 + 10 * 2_000);
    expect(r.resumo).toMatchObject({ valor_fora_da_venda: 2 * 2_000, valor_chegando: 3 * 2_000 });
    expect(r.por_local.find((l) => l.nome === "Loja C")?.valor_chegando).toBe(6_000);
  });

  it("o sem custo é contado também no que está chegando e no que está fora da venda (nunca vira zero calado)", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const pelicula = "4b000000-0000-4000-8000-0000000000f1";
    await db.query("insert into public.variantes (id, organizacao_id, produto_id, sku, nome) values ($1, $2, $3, 'ACE-0002', 'Película (sem custo)')",
      [pelicula, ids.organizacao, cat.produtoCapa]);
    await db.query("select privado.lancar_movimento($1, $2, 2, 'entrada_importacao', null, null, null, null, 'teste:pelicula-assistencia')", [ids.assistencia, pelicula]);
    await db.query(`insert into public.transferencias (organizacao_id, origem_id, destino_id, variante_id, quantidade, motivo, chave, conteudo, situacao, solicitado_por, enviado_em)
      values ($1, $2, $3, $4, 4, 'Reposição da loja C', 'teste:transf-pelicula', 'teste', 'enviada', $5, now())`, [ids.organizacao, ids.lojaA, ids.lojaC, pelicula, ids.dono]);
    const r = await valor(dono);
    expect(r.resumo).toMatchObject({
      valor_chegando: 0, chegando_sem_custo: 4, valor_fora_da_venda: 0, itens_fora_da_venda_sem_custo: 2, itens_sem_custo: 1, variacoes_sem_custo: 1,
    });
    expect(r.por_local.find((l) => l.nome === "Loja C")).toMatchObject({ valor_chegando: 0, chegando_sem_custo: 4 });
    expect(r.por_local.find((l) => l.nome === "Assistência")).toMatchObject({ valor: 0, itens_com_custo: 0, itens_sem_custo: 2 });
  });

  it("só quem tem custo.ver: o gerente vê a loja dele; vendedor, técnico e outra rede são recusados", async () => {
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    const r = await valor(gerenteB);
    expect(r.por_local.map((l) => l.nome)).toEqual(["Loja B"]);
    expect(r.resumo.valor).toBe(115_400);
    expect(await errou(gerenteB, ids.lojaA)).toBe("42501");
    expect(await errou(await naLoja(ids.vendedorA, ids.lojaA))).toBe("42501");
    expect(await errou(await naLoja(ids.tecnico, ids.assistencia))).toBe("42501");
    expect(await errou(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), ids.lojaA)).toBe("42501");
  });
});
