// O esquema sem os avisos que o Supabase aponta no banco (lote BANCO-a; plano de 16/11/2026, onda 0, item 5): toda chave
// estrangeira com um índice que a cobre (as colunas da chave no começo do índice, na mesma ordem, como o verificador do
// Supabase confere), toda tabela do esquema privado com RLS ligado, e toda tabela com RLS e nenhuma política com o
// comentário que diz que o acesso é só por função. As regras valem também para as migrations que vierem: uma tabela
// nova sem índice na chave, sem RLS no privado ou sem o comentário quebra este teste. Banco em memória com todas as
// migrations.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarBanco } from "./banco-de-teste";

let db: PGlite;
beforeAll(async () => { db = await criarBanco(); });
afterAll(async () => { await db.close(); });

describe("o esquema sem os avisos do Supabase (BANCO-a)", () => {
  it("toda chave estrangeira dos esquemas public e privado tem um índice que começa pelas colunas dela, na mesma ordem", async () => {
    const { rows } = await db.query<{ chave: string }>(`
      select c.conrelid::regclass::text || ' ' || c.conname as chave
      from pg_constraint c
      where c.contype = 'f' and c.connamespace in ('public'::regnamespace, 'privado'::regnamespace)
        and not exists (
          select 1 from pg_index i
          where i.indrelid = c.conrelid and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey::int2[]
        )
      order by 1`);
    expect(rows.map((r) => r.chave)).toEqual([]);
  });

  it("toda tabela do esquema privado tem RLS ligado", async () => {
    const { rows } = await db.query<{ tabela: string }>(`
      select c.oid::regclass::text as tabela from pg_class c
      where c.relnamespace = 'privado'::regnamespace and c.relkind = 'r' and not c.relrowsecurity
      order by 1`);
    expect(rows.map((r) => r.tabela)).toEqual([]);
  });

  it("toda tabela com RLS e nenhuma política diz no comentário que o acesso é só por função", async () => {
    const { rows } = await db.query<{ tabela: string; comentario: string | null }>(`
      select c.oid::regclass::text as tabela, obj_description(c.oid, 'pg_class') as comentario
      from pg_class c
      where c.relnamespace in ('public'::regnamespace, 'privado'::regnamespace) and c.relkind = 'r' and c.relrowsecurity
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
      order by 1`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !/só (por|pel)/i.test(r.comentario ?? "")).map((r) => r.tabela)).toEqual([]);
  });
});
