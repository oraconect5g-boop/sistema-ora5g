// Os tipos gerados (tipos-banco.ts) precisam acompanhar as migrations: toda função e tabela
// pública criada por migration aparece nos tipos, e nada sobra nos tipos que o banco não tenha.
// Se este teste falhar depois de uma migration nova, gere os tipos de novo (cabeçalho do arquivo).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(new URL("../../../../..", import.meta.url).pathname);
const migrations = readdirSync(join(RAIZ, "packages/banco/supabase/migrations")).filter((n) => n.endsWith(".sql")).sort()
  .map((n) => readFileSync(join(RAIZ, "packages/banco/supabase/migrations", n), "utf8")).join("\n");
const tipos = readFileSync(join(RAIZ, "apps/plataforma/src/lib/supabase/tipos-banco.ts"), "utf8");

const doBanco = (padrao: RegExp) => new Set([...migrations.matchAll(padrao)].map((m) => m[1] as string));
const secao = (inicio: string, fim: string) => tipos.slice(tipos.indexOf(inicio), tipos.indexOf(fim, tipos.indexOf(inicio)));
const chaves = (texto: string) => new Set([...texto.matchAll(/^ {6}(\w+): \{/gm)].map((m) => m[1] as string));

describe("tipos gerados do Supabase", () => {
  it("as funções públicas das migrations e dos tipos são as mesmas", () => {
    expect([...chaves(secao("    Functions: {", "    Enums: {"))].sort()).toEqual([...doBanco(/create (?:or replace )?function public\.(\w+)/g)].sort());
  });
  it("as tabelas públicas das migrations e dos tipos são as mesmas", () => {
    expect([...chaves(secao("    Tables: {", "    Views: {"))].sort()).toEqual([...doBanco(/create table public\.(\w+)/g)].sort());
  });
});
