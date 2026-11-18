// Lote VEL-b (18/11/2026; ADR-010; migration 20261118095048_precos_em_lote): o preço vigente de várias variações numa loja, numa
// ida (public.precos_vigentes), para a busca do PDV. É o mesmo de public.preco_vigente, uma por uma: a função em lote
// chama a outra. Dados FICTÍCIOS; cada teste numa transação desfeita.
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
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4f000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
type Linha = { variante_id: string; preco_centavos: number };
const emLote = (s: Sessao | null, variantes: unknown, unidade: string) =>
  comoUsuario(db, s, async () =>
    (await db.query<Linha>("select variante_id, preco_centavos::int as preco_centavos from public.precos_vigentes($1::uuid[], $2) order by variante_id", [variantes, unidade])).rows,
    { criarSessao: false });
const umaPorUma = (s: Sessao, variantes: string[], unidade: string) =>
  comoUsuario(db, s, async () => {
    const linhas: Linha[] = [];
    for (const v of [...new Set(variantes)].sort()) {
      const preco = (await db.query<{ v: number | null }>("select public.preco_vigente($1, $2)::int as v", [v, unidade])).rows[0]?.v;
      if (preco !== null && preco !== undefined) linhas.push({ variante_id: v, preco_centavos: preco });
    }
    return linhas;
  }, { criarSessao: false });
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

describe("precos_vigentes: o preço do balcão de várias variações numa ida (VEL-b)", () => {
  it("é o mesmo de preco_vigente, uma por uma, em cada loja: o da rede e o próprio da loja; sem preço, a variação não volta", async () => {
    const todas = [cat.aparelho, cat.capa, cat.chip, cat.recarga];
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const naA = await emLote(ana, todas, ids.lojaA);
    expect(naA).toEqual(await umaPorUma(ana, todas, ids.lojaA));
    expect(naA).toEqual(expect.arrayContaining([{ variante_id: cat.aparelho, preco_centavos: 149_900 }, { variante_id: cat.capa, preco_centavos: 7_900 }]));
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const naB = await emLote(gerente, todas, ids.lojaB);
    expect(naB).toEqual(await umaPorUma(gerente, todas, ids.lojaB));
    // A loja B tem o preço próprio do aparelho.
    expect(naB.find((l) => l.variante_id === cat.aparelho)?.preco_centavos).toBe(139_900);
  });

  it("a variação repetida volta uma vez; lista vazia ou nula não quebra; mais de 40 é recusado (22023)", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await emLote(ana, [cat.capa, cat.capa, cat.capa], ids.lojaA)).toEqual([{ variante_id: cat.capa, preco_centavos: 7_900 }]);
    expect(await emLote(ana, [], ids.lojaA)).toEqual([]);
    expect(await emLote(ana, null, ids.lojaA)).toEqual([]);
    const muitas = Array.from({ length: 41 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(await comoUsuario(db, ana, () => erroDe(() => db.query("select * from public.precos_vigentes($1::uuid[], $2)", [muitas, ids.lojaA])), { criarSessao: false })).toBe("22023");
  });

  it("a loja que a pessoa não vê não tem preço: a de outra rede não recebe nada; o visitante não executa", async () => {
    const outra = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await emLote(outra, [cat.aparelho, cat.capa], ids.lojaA)).toEqual([]);
    expect(await comoUsuario(db, null, () => erroDe(() => db.query("select * from public.precos_vigentes($1::uuid[], $2)", [[cat.capa], ids.lojaA])))).toBe("42501");
  });
});
