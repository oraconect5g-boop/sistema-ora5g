import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

const PASTA = new URL("..", import.meta.url).pathname;
const PASTA_MIGRATIONS = join(PASTA, "supabase", "migrations");

export function migrations(): { nome: string; sql: string }[] {
  return readdirSync(PASTA_MIGRATIONS)
    .filter((nome) => /^\d{14}_[a-z0-9_]+\.sql$/.test(nome))
    .sort()
    .map((nome) => ({ nome, sql: readFileSync(join(PASTA_MIGRATIONS, nome), "utf8") }));
}

// Banco limpo, com o "Supabase simulado" e todas as migrations aplicadas do zero.
export async function criarBanco(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(PASTA, "src", "supabase-simulado.sql"), "utf8"));
  for (const { sql } of migrations()) await db.exec(sql);
  return db;
}

export type Sessao = { usuario: string; sessao?: string };

// Executa como um usuário logado (papel authenticated), como faria a API do Supabase.
export async function comoUsuario<T>(db: PGlite, sessao: Sessao | null, acao: () => Promise<T>): Promise<T> {
  const claims = sessao
    ? JSON.stringify({ sub: sessao.usuario, session_id: sessao.sessao, role: "authenticated" })
    : "";
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  await db.exec(sessao ? "set role authenticated" : "set role anon");
  try {
    return await acao();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

// Gera CNPJ válido a partir dos 12 primeiros dígitos (raiz de 8 + filial de 4).
export function cnpj(raiz: string, filial: string): string {
  const base = (raiz + filial).split("").map(Number);
  const dv = (digitos: number[], pesos: number[]) => {
    const resto = digitos.reduce((soma, d, i) => soma + d * (pesos[i] ?? 0), 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${raiz}${filial}${d1}${d2}`;
}
