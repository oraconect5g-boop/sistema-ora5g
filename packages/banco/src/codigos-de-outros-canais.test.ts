// Lote CAT-009 (14/11/2026, ORA-CAT-009; migration 20261115000401_codigos_de_outros_canais, antes 20261115001000): os códigos de uma
// variação em outros canais (Rein, site e marketplaces) só apontam para ela; o ID interno continua sendo a chave.
// Banco em memória com todas as migrations; dados FICTÍCIOS; cada teste numa transação desfeita.
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
  const s = { usuario, sessao: `4c000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

type Ligado = { id: string; repetido: boolean };
const LIGAR = "select public.catalogo_ligar_codigo($1, $2, $3, $4, $5) as v";
const DESLIGAR = "select public.catalogo_desligar_codigo($1, $2) as v";
const POR_CODIGO = "select public.catalogo_variante_por_codigo($1, $2) as v";
const ligar = (s: Sessao, variante: string, canal: string, codigo: string, sku: string | null = null) =>
  valor<Ligado>(s, LIGAR, [variante, canal, codigo, sku, "Código da Rein para a transição"]);
const tentarLigar = (s: Sessao, variante: string, canal: string, codigo: string, sku: string | null = null, motivo: string | null = "Código da Rein") =>
  errou(s, LIGAR, [variante, canal, codigo, sku, motivo]);

describe("códigos de outros canais (CAT-009)", () => {
  it("quem gere o catálogo liga; repetir devolve o mesmo; o código ativo de um canal aponta para uma só variação", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const rein = await ligar(dono, cat.aparelho, "rein", "12345");
    expect(rein.repetido).toBe(false);
    expect(await ligar(dono, cat.aparelho, "rein", " 12345 ")).toEqual({ id: rein.id, repetido: true });
    // O mesmo código em outra variação, ou na mesma de outro jeito: recusado.
    expect(await tentarLigar(dono, cat.capa, "rein", "12345")).toBe("23505");
    expect(await tentarLigar(dono, cat.aparelho, "rein", "12345", "APA-REIN")).toBe("23505");
    // Outro canal pode ter o mesmo número; a mesma variação pode ter vários anúncios; maiúscula e minúscula são o mesmo código.
    expect((await ligar(dono, cat.capa, "mercado_livre", "12345")).repetido).toBe(false);
    expect((await ligar(dono, cat.aparelho, "mercado_livre", "MLB111", "GALAXY-A15-AZUL")).repetido).toBe(false);
    expect((await ligar(dono, cat.aparelho, "mercado_livre", "MLB222")).repetido).toBe(false);
    expect(await tentarLigar(dono, cat.capa, "mercado_livre", "mlb111")).toBe("23505");
    // O administrador também gere o catálogo.
    expect((await ligar(await naLoja(ids.administrador, ids.lojaA), cat.chip, "site", "chip-pre-pago")).repetido).toBe(false);

    const linha = (await db.query("select variante_id, canal, codigo, sku_no_canal, ligado_por from public.variante_codigos_externos where id = $1", [rein.id])).rows[0];
    expect(linha).toEqual({ variante_id: cat.aparelho, canal: "rein", codigo: "12345", sku_no_canal: null, ligado_por: ids.dono });
    expect((await db.query("select acao, motivo from public.auditoria where alvo_id = $1 order by id", [rein.id])).rows)
      .toEqual([{ acao: "variante_codigos_externos.criado", motivo: "Código da Rein para a transição" }]);
  });

  it("recusas: canal fora da lista, código vazio ou com espaço, SKU longo e sem motivo", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await tentarLigar(dono, cat.aparelho, "amazon", "B0001")).toBe("22023");
    expect(await tentarLigar(dono, cat.aparelho, "rein", "   ")).toBe("22023");
    expect(await tentarLigar(dono, cat.aparelho, "rein", "12 345")).toBe("22023");
    expect(await tentarLigar(dono, cat.aparelho, "rein", "x".repeat(81))).toBe("22023");
    expect(await tentarLigar(dono, cat.aparelho, "shopee", "998877", "s".repeat(81))).toBe("22023");
    expect(await tentarLigar(dono, cat.aparelho, "rein", "12345", null, null)).toBe("22023");
    expect((await db.query("select count(*)::int as n from public.variante_codigos_externos")).rows[0]).toEqual({ n: 0 });
  });

  it("desligar só marca, com motivo, uma vez; depois o código pode ir para outra variação; nada muda nem se apaga por fora", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const antigo = await ligar(dono, cat.aparelho, "rein", "12345");
    expect(await errou(dono, DESLIGAR, [antigo.id, null])).toBe("22023");
    expect(await valor(dono, DESLIGAR, [antigo.id, "Código era da capa"])).toBe(true);
    expect(await valor(dono, DESLIGAR, [antigo.id, "Código era da capa"])).toBe(false);
    const novo = await ligar(dono, cat.capa, "rein", "12345");
    expect(novo.id).not.toBe(antigo.id);
    expect(await valor(dono, POR_CODIGO, ["rein", "12345"])).toBe(cat.capa);
    // Na mesma transação os dois vínculos têm o mesmo ligado_em (now()): a ordem vem do desligamento (o desligado primeiro).
    expect((await db.query("select variante_id, desligado_por, motivo_desligamento from public.variante_codigos_externos where codigo = '12345' order by desligado_em nulls last")).rows)
      .toEqual([
        { variante_id: cat.aparelho, desligado_por: ids.dono, motivo_desligamento: "Código era da capa" },
        { variante_id: cat.capa, desligado_por: null, motivo_desligamento: null },
      ]);
    expect(await erroDe(() => db.query("update public.variante_codigos_externos set codigo = '999' where id = $1", [novo.id]))).toBe("42501");
    expect(await erroDe(() => db.query("update public.variante_codigos_externos set motivo_desligamento = 'outro' where id = $1", [antigo.id]))).toBe("42501");
    expect(await erroDe(() => db.query("delete from public.variante_codigos_externos where id = $1", [novo.id]))).toBe("42501");
  });

  it("lê quem é da rede; só o dono e o administrador ligam e desligam; outra rede não vê nem acha", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const rein = await ligar(dono, cat.aparelho, "rein", "12345");
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);

    expect(await valor<number>(vendedor, "select count(*)::int as v from public.variante_codigos_externos")).toBe(1);
    expect(await valor(vendedor, POR_CODIGO, ["rein", "12345"])).toBe(cat.aparelho);
    expect(await valor(vendedor, POR_CODIGO, ["rein", "00000"])).toBeNull();
    for (const s of [vendedor, gerente, outraRede]) {
      expect(await tentarLigar(s, cat.capa, "rein", "777")).toBe("P0002");
      expect(await errou(s, DESLIGAR, [rein.id, "Tentativa"])).toBe("P0002");
    }
    expect(await valor<number>(outraRede, "select count(*)::int as v from public.variante_codigos_externos")).toBe(0);
    expect(await valor(outraRede, POR_CODIGO, ["rein", "12345"])).toBeNull();
    expect(await errou(vendedor, "insert into public.variante_codigos_externos (organizacao_id, variante_id, canal, codigo, ligado_por) values ($1, $2, 'rein', '1', $3)",
      [ids.organizacao, cat.capa, ids.vendedorA])).toBe("42501");
  });
});
