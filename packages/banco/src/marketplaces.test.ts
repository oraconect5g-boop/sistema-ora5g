// Lote MKTPL-a (17/11/2026; ORA-MKTPL-003 e ORA-MKTPL-005 por arquivo, ORA-MKTPL-008; migration 20261118010000_marketplaces_por_arquivo):
// os pedidos dos marketplaces por arquivo, sem repetir pedido, ligados ao catálogo, e o painel por canal, anúncio e pedido.
// Dados FICTÍCIOS (pedidos, valores e códigos inventados aqui); cada teste numa transação desfeita.
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
let arquivos = 0;
const impressao = () => `b${String(++arquivos).padStart(63, "0")}`;
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
  const s = { usuario, sessao: `4d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const linhas = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows, { criarSessao: false });
const recusa = (s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });
const hoje = async () => (await db.query<{ d: string }>("select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d")).rows[0]?.d ?? "";

const IMPORTAR = "select public.marketplace_importar($1, 'vendas.xlsx', $2, $3, $4::jsonb, '{}'::jsonb) as v";
type Importado = { importacao: string; numero: number; pedidos: number; novos: number; atualizados: number; repetido: boolean };
const importar = (s: Sessao, pedidos: unknown[], canal = "mercado_livre", arquivo = impressao()) =>
  valor<Importado>(s, IMPORTAR, [canal, arquivo, pedidos.reduce<number>((n, p) => n + ((p as { itens?: unknown[] }).itens?.length ?? 1), 0), JSON.stringify(pedidos)]);
const PAINEL = "select public.marketplace_painel($1::date, $2::date) as v";

describe("os pedidos dos marketplaces por arquivo (MKTPL-a)", () => {
  it("grava o pedido e os itens ligados ao catálogo; o mesmo pedido de novo atualiza, sem repetir; o mesmo arquivo não muda nada", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const d = await hoje();
    // A capa ligada ao anúncio MLB-1 do Mercado Livre (CAT-009); o aparelho casa pelo SKU.
    await valor(dono, "select public.catalogo_ligar_codigo($1, 'mercado_livre', 'MLB-1', null, 'Anúncio da capa') as v", [cat.capa]);
    const sku = (await db.query<{ sku: string }>("select sku from public.variantes where id = $1", [cat.aparelho])).rows[0]?.sku ?? "";
    const arquivo = impressao();
    const r = await importar(dono, [
      { id_externo: "2000001", data: d, situacao: "Entregue", bruto: 7_900, tarifas: 1_027, frete: 0, liquido: 6_873,
        itens: [{ numero: 2, codigo: "mlb-1", titulo: "Capa", quantidade: 1, valor: 7_900 }] },
      { id_externo: "2000002", data: d, situacao: "A caminho", bruto: 159_900, tarifas: 19_188,
        itens: [{ numero: 3, codigo: sku, quantidade: 1, valor: 149_900 }, { numero: 4, codigo: "SEM-LIGACAO", titulo: "Película", quantidade: 1, valor: 10_000 }] },
    ], "mercado_livre", arquivo);
    expect(r).toMatchObject({ pedidos: 2, novos: 2, atualizados: 0, repetido: false });
    expect(await importar(dono, [{ id_externo: "X", data: d, bruto: 1, itens: [{ numero: 1, quantidade: 1, valor: 1 }] }], "mercado_livre", arquivo))
      .toMatchObject({ importacao: r.importacao, repetido: true });
    expect(await linhas(dono, "select i.codigo, i.variante_id from public.marketplace_pedido_itens i join public.marketplace_pedidos p on p.id = i.pedido_id order by i.numero"))
      .toEqual([{ codigo: "mlb-1", variante_id: cat.capa }, { codigo: sku, variante_id: cat.aparelho }, { codigo: "SEM-LIGACAO", variante_id: null }]);
    // O pedido 2000002 cancelado no arquivo novo: a situação e os valores mudam, o pedido não se repete, os itens trocam.
    const r2 = await importar(dono, [{ id_externo: "2000002", data: d, situacao: "Cancelada", bruto: 159_900, reembolsos: 159_900, tarifas: 0, liquido: 0,
      itens: [{ numero: 2, codigo: sku, quantidade: 1, valor: 159_900 }] }]);
    expect(r2).toMatchObject({ pedidos: 1, novos: 0, atualizados: 1 });
    expect(await linhas(dono, "select id_externo, situacao_no_canal, reembolsos_centavos, (select count(*) from public.marketplace_pedido_itens i where i.pedido_id = p.id)::int as itens from public.marketplace_pedidos p order by 1"))
      .toEqual([{ id_externo: "2000001", situacao_no_canal: "Entregue", reembolsos_centavos: null, itens: 1 },
        { id_externo: "2000002", situacao_no_canal: "Cancelada", reembolsos_centavos: 159_900, itens: 1 }]);
    // O mesmo número em outro canal é outro pedido.
    expect(await importar(dono, [{ id_externo: "2000001", data: d, bruto: 100, itens: [{ numero: 2, quantidade: 1, valor: 100 }] }], "shopee")).toMatchObject({ novos: 1 });
  });

  it("recusa o pedido fora do formato e quem não vê o resultado da rede", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const d = await hoje();
    const item = { numero: 2, quantidade: 1, valor: 100 };
    for (const p of [{ id_externo: "com espaço", data: d, bruto: 100, itens: [item] }, { id_externo: "1", data: "17/11/2026", bruto: 100, itens: [item] },
      { id_externo: "1", data: d, bruto: -1, itens: [item] }, { id_externo: "1", data: d, bruto: 100, itens: [] }, { id_externo: "1", data: d, bruto: 100, itens: [{ ...item, quantidade: 0 }] },
      { id_externo: "1", data: "2026-02-30", bruto: 100, itens: [item] }]) {
      expect(await recusa(dono, IMPORTAR, ["mercado_livre", impressao(), 1, JSON.stringify([p])]), JSON.stringify(p)).toBe("22023");
    }
    expect(await recusa(dono, IMPORTAR, ["amazon", impressao(), 1, JSON.stringify([{ id_externo: "1", data: d, bruto: 100, itens: [item] }])])).toBe("22023");
    expect(await recusa(dono, IMPORTAR, ["shopee", impressao(), 2, JSON.stringify([{ id_externo: "1", data: d, bruto: 1, itens: [item] }, { id_externo: "1", data: d, bruto: 1, itens: [item] }])])).toBe("22023");
    for (const [usuario, loja] of [[ids.gerenteB, ids.lojaB], [ids.vendedorA, ids.lojaA], [ids.administrador, ids.lojaA]] as const) {
      const s = await naLoja(usuario, loja);
      expect(await recusa(s, IMPORTAR, ["mercado_livre", impressao(), 1, JSON.stringify([{ id_externo: "1", data: d, bruto: 100, itens: [item] }])]), usuario).toBe("42501");
      expect(await recusa(s, PAINEL, [d, d]), usuario).toBe("42501");
      expect(await linhas(s, "select * from public.marketplace_pedidos")).toEqual([]);
    }
  });

  it("o painel: por canal, anúncio e pedido, o bruto, o líquido, o custo do dia e o lucro estimado; reembolso inteiro não leva o custo", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const d = await hoje();
    await db.query("insert into public.custos (organizacao_id, variante_id, valor_centavos, inicio, origem, criado_por) values ($1, $2, 3000, now() - interval '2 days', 'manual', $3)",
      [ids.organizacao, cat.capa, ids.dono]);
    await valor(dono, "select public.catalogo_ligar_codigo($1, 'shopee', 'SHP-9', null, 'Anúncio da capa') as v", [cat.capa]);
    await importar(dono, [
      { id_externo: "A1", data: d, bruto: 15_800, tarifas: 2_000, frete: 800, itens: [{ numero: 2, codigo: "SHP-9", quantidade: 2, valor: 15_800 }] },
      { id_externo: "A2", data: d, bruto: 7_900, reembolsos: 7_900, tarifas: 500, liquido: -500, itens: [{ numero: 3, codigo: "SHP-9", quantidade: 1, valor: 7_900 }] },
      { id_externo: "A3", data: d, bruto: 5_000, liquido: 4_200, itens: [{ numero: 4, codigo: "NADA", quantidade: 1, valor: 5_000 }] },
    ], "shopee");
    const p = await valor<Record<string, unknown> & { canais: Record<string, unknown>[]; pedidos: Record<string, unknown>[]; anuncios: Record<string, unknown>[] }>(dono, PAINEL, [d, d]);
    const custoDaCapa = (await db.query<{ v: number }>("select c.valor_centavos as v from public.custos c where c.variante_id = $1 order by c.inicio desc, c.criado_em desc limit 1", [cat.capa])).rows[0]?.v ?? 0;
    expect(p.canais).toEqual([{
      canal: "shopee", pedidos: 3, unidades: 4, bruto: 28_700, reembolsos: 7_900, tarifas: 2_500, frete: 800,
      liquido: (15_800 - 2_000 - 800) + (-500) + 4_200, liquidos_estimados: 1,
      custo: 2 * custoDaCapa, lucro: (15_800 - 2_000 - 800 - 2 * custoDaCapa) + (-500), pedidos_sem_custo: 1,
    }]);
    const porPedido = Object.fromEntries(p.pedidos.map((x) => [x.id_externo, x]));
    expect(porPedido.A1).toMatchObject({ liquido: 13_000, liquido_estimado: true, custo: 2 * custoDaCapa, lucro: 13_000 - 2 * custoDaCapa, itens_sem_custo: 0 });
    expect(porPedido.A2).toMatchObject({ liquido: -500, liquido_estimado: false, custo: 0, lucro: -500 });
    expect(porPedido.A3).toMatchObject({ liquido: 4_200, custo: null, lucro: null, itens_sem_custo: 1 });
    expect(p.anuncios).toEqual([
      { canal: "shopee", codigo: "SHP-9", titulo: null, variante_id: cat.capa, produto: expect.any(String), unidades: 3, bruto: 23_700, liquido: 13_000 - 500,
        custo: 2 * custoDaCapa, lucro: 13_000 - 500 - 2 * custoDaCapa },
      { canal: "shopee", codigo: "NADA", titulo: null, variante_id: null, produto: null, unidades: 1, bruto: 5_000, liquido: 4_200, custo: null, lucro: null },
    ]);
    expect(p).toMatchObject({ pedidos_no_periodo: 3, itens_sem_produto: 1 });
  });
});
