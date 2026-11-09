// Lote 3 do prompt consolidado (09/11/2026): regressões permanentes da prova do Codex
// docs/analises/evidencias/2026-11-08-fotos/banco.repro.ts (PR #33). Dados FICTÍCIOS.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
beforeAll(async () => { db = await criarBanco(); await montarCenario(db); await montarCatalogo(db); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

const sessao = { usuario: ids.dono, sessao: "4d000000-0000-4000-8000-000000000001" };
let n = 0;
const caminho = (variante = "produto") => `${ids.organizacao}/${cat.produtoAparelho}/${variante}/4d000000-0000-4000-8000-${String(++n).padStart(12, "0")}.webp`;
const noStorage = (c: string) =>
  db.query("insert into storage.objects (bucket_id, name, metadata) values ('produtos', $1, '{\"size\":120000,\"mimetype\":\"image/webp\"}'::jsonb)", [c]);
const REGISTRAR = "select public.registrar_foto($1, $2, $3, 1200, 1200, false) as id";
async function registrar(c: string, variante: string | null = null) {
  return comoUsuario(db, sessao, async () => (await db.query<{ id: string }>(REGISTRAR, [cat.produtoAparelho, variante, c])).rows[0]?.id);
}
async function erroAo(c: string, variante: string | null = null) {
  return comoUsuario(db, sessao, async () => {
    await db.exec("savepoint tentativa");
    try { await db.query(REGISTRAR, [cat.produtoAparelho, variante, c]); await db.exec("release savepoint tentativa"); return null; }
    catch (e) { await db.exec("rollback to savepoint tentativa"); await db.exec("release savepoint tentativa"); return (e as { code?: string }).code ?? "sem-codigo"; }
  });
}

describe("#42 — registro da mesma foto é idempotente", () => {
  it("repetir devolve a mesma foto, sem 23505 e sem marcar a própria foto como substituída", async () => {
    const c = caminho();
    await noStorage(c);
    const primeira = await registrar(c);
    expect(await registrar(c)).toBe(primeira);
    expect((await db.query("select id, substituida_em from public.fotos_produto where produto_id = $1 and variante_id is null", [cat.produtoAparelho])).rows)
      .toEqual([{ id: primeira, substituida_em: null }]);
  });

  it("controle: foto nova substitui a anterior; o arquivo antigo não volta a valer (OR004)", async () => {
    const antigo = caminho();
    const novo = caminho();
    await noStorage(antigo);
    await noStorage(novo);
    const primeira = await registrar(antigo);
    const segunda = await registrar(novo);
    expect(segunda).not.toBe(primeira);
    expect(await erroAo(antigo)).toBe("OR004");
    expect((await db.query("select caminho from public.fotos_produto where produto_id = $1 and substituida_em is null", [cat.produtoAparelho])).rows)
      .toEqual([{ caminho: novo }]);
  });
});

describe("índice da chave estrangeira das fotos", () => {
  it("o índice que já existia cobre o filtro pelas duas colunas, sem o redundante", async () => {
    await db.exec("set local enable_seqscan = off");
    const plano = JSON.stringify((await db.query("explain (format json) select id from public.fotos_produto where produto_id = $1 and organizacao_id = $2",
      [cat.produtoAparelho, ids.organizacao])).rows);
    expect(plano).toContain("fotos_organizacao");
    expect((await db.query("select 1 from pg_indexes where indexname = 'fotos_produto_produto_organizacao'")).rows).toHaveLength(0);
  });
});
