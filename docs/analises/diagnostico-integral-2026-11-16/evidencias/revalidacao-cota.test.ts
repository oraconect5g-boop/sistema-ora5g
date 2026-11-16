import {appendFileSync} from "node:fs";
// #102: prova da cota por loja com duas conexões PostgreSQL 17; dados fictícios.
import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { amrDaSenha, comDigitoLuhn } from "../../../../packages/banco/src/banco-de-teste";
import { ids, montarCenario } from "../../../../packages/banco/src/cenario";
import { cat, montarCatalogo } from "../../../../packages/banco/src/cenario-catalogo";
import { executor, iniciarPostgresReal, type PostgresReal } from "../../../../packages/banco/src/postgres-real";

const APARELHOS_A_MAIS = 30;
const VISITANTES = 3;

let servidor: PostgresReal;
let admin: pg.Client;
let a: pg.Client;
let b: pg.Client;
const extras: pg.Client[] = [];
const pid = new Map<pg.Client, number>();

beforeAll(async () => {
  servidor = await iniciarPostgresReal();
  admin = await servidor.conectar();
  await montarCenario(executor(admin));
  await montarCatalogo(executor(admin));
  await admin.query("update public.produtos set publicar_online = true where id = $1", [cat.produtoAparelho]);
  for (let i = 0; i < APARELHOS_A_MAIS; i++) {
    await admin.query("select privado.registrar_item_serializado($1, $2, $3, null, null, 'entrada_importacao', $4)",
      [ids.lojaA, cat.aparelho, comDigitoLuhn(`3520990027${String(i).padStart(4, "0")}`), `site-conc:a${i}`]);
  }
  for (const cliente of [(a = await servidor.conectar()), (b = await servidor.conectar())]) {
    pid.set(cliente, (await cliente.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid ?? 0);
  }
  for (let i = 0; i < VISITANTES + 3; i++) extras.push(await servidor.conectar());
}, 120_000);

// Um teste que falha no meio não deixa transação aberta (e travas) para o próximo.
afterEach(async () => { for (const cliente of [a, b]) await cliente.query("rollback").catch(() => {}); });

afterAll(async () => {
  for (const cliente of [a, b, admin, ...extras]) await cliente?.end().catch(() => {});
  await servidor?.parar();
});

let sessoes = 0;
let numeros = 0;
let chaves = 0;
type Sessao = { usuario: string; sessao: string };
const chave = (p: string) => `${p}:site-conc:${String(++chaves).padStart(5, "0")}`;
/** Um WhatsApp fictício novo a cada reserva (o limite de 2 por número não entra nesta disputa). */
const whatsapp = () => `4199${String(++numeros).padStart(7, "0")}`;

// A unidade da sessão é gravada antes (como no login), fora da disputa.
async function sessaoNaLoja(usuario: string): Promise<Sessao> {
  const sessao = { usuario, sessao: `4e000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [sessao.sessao, usuario]);
  await abrir(admin, sessao);
  await admin.query("select public.selecionar_unidade($1)", [ids.lojaA]);
  await admin.query("commit");
  return sessao;
}
/** Abre a transação: com sessão, como o vendedor logado; sem, como o visitante do site (papel anon). */
async function abrir(cliente: pg.Client, sessao?: Sessao) {
  await cliente.query("begin");
  if (sessao) {
    await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: sessao.usuario, session_id: sessao.sessao, role: "authenticated", amr: amrDaSenha() })]);
    await cliente.query("set local role authenticated");
  } else {
    await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    await cliente.query("set local role anon");
  }
}
async function esperarTrava(cliente: pg.Client) {
  for (let i = 0; i < 400; i++) {
    const { rows } = await admin.query<{ espera: string | null }>("select wait_event_type as espera from pg_stat_activity where pid = $1", [pid.get(cliente)]);
    if (rows[0]?.espera === "Lock") return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("a segunda conexão não ficou esperando a trava da primeira");
}
/** Uma chamada inteira (abre, chama, confirma; desfaz se der erro), como a API faz. */
async function chamada<T>(cliente: pg.Client, sessao: Sessao | undefined, sql: string, params: unknown[]): Promise<T> {
  await abrir(cliente, sessao);
  try {
    const r = await cliente.query<{ v: T }>(sql, params);
    await cliente.query("commit");
    return r.rows[0]?.v as T;
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    throw e;
  }
}

const RESERVAR_NO_SITE = "select public.loja_reservar($1, $2, $3, 'Cliente do Site', $4, $5) as v";
const RESERVAR_NO_BALCAO = "select public.reservar_estoque($1, 1, $2, $3) as v";
const reservarNoSite = (cliente: pg.Client) => cliente.query<{ v: { codigo: string } }>(RESERVAR_NO_SITE, [ids.organizacao, cat.aparelho, ids.lojaA, whatsapp(), chave("site")]);
const codigo = (e: unknown) => (e as { code?: string }).code ?? "sem-codigo";
const divergencias = async () => (await admin.query<{ regra: string }>("select regra from privado.divergencias_estoque()")).rows;
const livres = async () => (await admin.query<{ id: string }>(
  "select id from public.itens_serializados where unidade_id = $1 and variante_id = $2 and situacao = 'disponivel' and em_estoque order by criado_em, id",
  [ids.lojaA, cat.aparelho])).rows.map((r) => r.id);
const itemDoCodigo = async (c: string) => (await admin.query<{ item: string }>("select item_serializado_id as item from public.loja_reservas where codigo = $1", [c])).rows[0]?.item;
const reservasAtivasDo = async (item: string) =>
  (await admin.query<{ origem: string }>("select origem from public.estoque_reservas where item_serializado_id = $1 and situacao = 'ativa'", [item])).rows.map((r) => r.origem);


it("REV-COTA: duas transações ultrapassam o teto de 20 reservas por loja", async () => {
  for (let i=0;i<19;i++) await chamada(admin,undefined,RESERVAR_NO_SITE,[ids.organizacao,cat.aparelho,ids.lojaA,whatsapp(),chave("pre")]);
  await abrir(a);
  await reservarNoSite(a);
  await abrir(b);
  const segunda = reservarNoSite(b);
  await esperarTrava(b);
  await a.query("commit");
  await segunda;
  await b.query("commit");
  const total=(await admin.query<{n:number}>("select count(*)::int as n from public.loja_reservas where unidade_id=$1 and criada_em>now()-interval '1 hour'",[ids.lojaA])).rows[0]!.n;
  expect(total).toBe(21);
  appendFileSync(new URL("./prova-cota.jsonl",import.meta.url),JSON.stringify({limite:20,total,reproduzido:true})+"\n");
},30000);
