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

// O que os cenários usam de um banco: vale para o PGlite e para uma conexão PostgreSQL real.
export interface ExecutorSql {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export const supabaseSimulado = () => readFileSync(join(PASTA, "src", "supabase-simulado.sql"), "utf8");
export const reversao = (nome: string) => readFileSync(join(PASTA, "supabase", "reversao", nome), "utf8");

// Banco limpo, com o "Supabase simulado" e as migrations aplicadas do zero: todas, só as
// anteriores a "antesDe" ou até "ate" (inclusive), para comparar com uma reversão.
export async function criarBanco(limite: { antesDe?: string; ate?: string } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(supabaseSimulado());
  for (const { nome, sql } of migrations()) {
    if (limite.antesDe && nome >= limite.antesDe) break;
    await db.exec(sql);
    if (limite.ate && nome >= limite.ate) break;
  }
  return db;
}

export type Sessao = { usuario: string; sessao?: string };

// Executa como um usuário logado (papel authenticated), como faria a API do Supabase. Com sessão,
// a linha de auth.sessions é criada como no login (a regra do turno lê a hora em que ela começou).
export async function comoUsuario<T>(db: PGlite, sessao: Sessao | null, acao: () => Promise<T>, opcoes: { criarSessao?: boolean } = {}): Promise<T> {
  if (sessao?.sessao && opcoes.criarSessao !== false) {
    await db.query("insert into auth.sessions (id, user_id) values ($1, $2) on conflict (id) do nothing", [sessao.sessao, sessao.usuario]);
  }
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

// Gera CPF FICTÍCIO válido a partir dos 9 primeiros dígitos (os dois verificadores, módulo 11).
export function cpf(base: string): string {
  const digitos = base.split("").map(Number);
  const dv = (lista: number[]) => {
    const resto = lista.reduce((soma, d, i) => soma + d * (lista.length + 1 - i), 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(digitos);
  return `${base}${d1}${dv([...digitos, d1])}`;
}

// Completa o dígito verificador (Luhn) para gerar IMEI/ICCID FICTÍCIOS válidos nos testes.
export function comDigitoLuhn(base: string): string {
  for (let d = 0; d <= 9; d++) {
    const numero = `${base}${d}`;
    let soma = 0;
    for (let i = 0; i < numero.length; i++) {
      let digito = Number(numero[numero.length - 1 - i]);
      if (i % 2 === 1) digito = digito * 2 > 9 ? digito * 2 - 9 : digito * 2;
      soma += digito;
    }
    if (soma % 10 === 0) return numero;
  }
  throw new Error("base inválida");
}

// Retrato do esquema (funções com corpo e permissões, colunas, gatilhos, restrições, políticas, índices
// com a definição, permissões e matriz de papéis) para comparar o banco depois de uma reversão com o de antes.
export async function retratoDoEsquema(db: PGlite): Promise<string[]> {
  const { rows } = await db.query<{ item: string }>(`
    select 'funcao ' || p.oid::regprocedure || ' ' || md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') as item
    from pg_proc p where p.pronamespace in ('public'::regnamespace, 'privado'::regnamespace)
    union all select 'coluna ' || table_schema || '.' || table_name || '.' || column_name || ' ' || data_type
    from information_schema.columns where table_schema in ('public', 'privado')
    union all select 'gatilho ' || tgrelid::regclass || '.' || tgname from pg_trigger where not tgisinternal
    union all select 'restricao ' || conrelid::regclass || '.' || conname from pg_constraint where connamespace in ('public'::regnamespace, 'privado'::regnamespace)
    union all select 'politica ' || schemaname || '.' || tablename || '.' || policyname from pg_policies where schemaname in ('public', 'privado')
    union all select 'indice ' || schemaname || '.' || indexname || ' ' || md5(indexdef) from pg_indexes where schemaname in ('public', 'privado')
    union all select 'permissao ' || codigo from public.permissoes
    union all select 'papel ' || papel || ' ' || permissao from public.papel_permissoes
    order by 1`);
  return rows.map((r) => r.item);
}
