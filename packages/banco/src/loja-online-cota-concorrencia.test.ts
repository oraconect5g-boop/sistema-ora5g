// #102 (lote INTEG-c; revisão do Codex de 16/11/2026, PR #100, commit e311060): a cota de 20 reservas do site por loja
// e por hora vale também para reservas ao mesmo tempo, num PostgreSQL 17 de verdade. Antes, com 19 reservas, duas
// conexões (WhatsApp e chaves diferentes) viam 19 ao mesmo tempo e terminavam com 21. Agora a segunda espera a trava
// da loja, vê a vigésima e é recusada (OR035), sem reserva pela metade. É a prova do Codex (revalidacao-cota.test.ts)
// virada regressão. Dados FICTÍCIOS; o banco é descartado no fim.
import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { comDigitoLuhn } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";
import { executor, iniciarPostgresReal, type PostgresReal } from "./postgres-real";

const APARELHOS_A_MAIS = 30;

let servidor: PostgresReal;
let admin: pg.Client;
let a: pg.Client;
let b: pg.Client;
const pid = new Map<pg.Client, number>();

beforeAll(async () => {
  servidor = await iniciarPostgresReal();
  admin = await servidor.conectar();
  await montarCenario(executor(admin));
  await montarCatalogo(executor(admin));
  await admin.query("update public.produtos set publicar_online = true where id = $1", [cat.produtoAparelho]);
  for (let i = 0; i < APARELHOS_A_MAIS; i++) {
    await admin.query("select privado.registrar_item_serializado($1, $2, $3, null, null, 'entrada_importacao', $4)",
      [ids.lojaA, cat.aparelho, comDigitoLuhn(`3520990037${String(i).padStart(4, "0")}`), `site-cota:a${i}`]);
  }
  for (const cliente of [(a = await servidor.conectar()), (b = await servidor.conectar())]) {
    pid.set(cliente, (await cliente.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid ?? 0);
  }
}, 120_000);

// Um teste que falha no meio não deixa transação aberta (e travas) para o próximo.
afterEach(async () => { for (const cliente of [a, b]) await cliente.query("rollback").catch(() => {}); });

afterAll(async () => {
  for (const cliente of [a, b, admin]) await cliente?.end().catch(() => {});
  await servidor?.parar();
});

let numeros = 0;
let chaves = 0;
const chave = (p: string) => `${p}:site-cota:${String(++chaves).padStart(5, "0")}`;
/** Um WhatsApp fictício novo a cada reserva (o limite de 2 por número não entra nesta disputa). */
const whatsapp = () => `4199${String(++numeros).padStart(7, "0")}`;

/** Abre a transação como o visitante do site (papel anon), como a API faz. */
async function abrirComoVisitante(cliente: pg.Client) {
  await cliente.query("begin");
  await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
  await cliente.query("set local role anon");
}
async function esperarTrava(cliente: pg.Client) {
  for (let i = 0; i < 400; i++) {
    const { rows } = await admin.query<{ espera: string | null }>("select wait_event_type as espera from pg_stat_activity where pid = $1", [pid.get(cliente)]);
    if (rows[0]?.espera === "Lock") return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("a segunda conexão não ficou esperando a trava da primeira");
}

const RESERVAR_NO_SITE = "select public.loja_reservar($1, $2, $3, 'Cliente do Site', $4, $5) as v";
const reservarNoSite = (cliente: pg.Client) => cliente.query(RESERVAR_NO_SITE, [ids.organizacao, cat.aparelho, ids.lojaA, whatsapp(), chave("site")]);
const naHora = async () => Number((await admin.query<{ n: string }>(
  "select count(*) as n from public.loja_reservas where unidade_id = $1 and criada_em > now() - interval '1 hour'", [ids.lojaA])).rows[0]?.n);
const reservasAtivasNaLoja = async () => Number((await admin.query<{ n: string }>(
  "select count(*) as n from public.estoque_reservas where unidade_id = $1 and variante_id = $2 and situacao = 'ativa' and origem = 'online'",
  [ids.lojaA, cat.aparelho])).rows[0]?.n);

describe("#102: a cota de reservas do site por loja com duas conexões (INTEG-c)", () => {
  it("com 19 reservas, a vigésima e uma concorrente: a segunda espera a primeira e é recusada (OR035); ficam 20, sem reserva pela metade", async () => {
    for (let i = 0; i < 19; i++) {
      await abrirComoVisitante(admin);
      await reservarNoSite(admin);
      await admin.query("commit");
    }
    expect(await naHora()).toBe(19);

    await abrirComoVisitante(a);
    await reservarNoSite(a);
    await abrirComoVisitante(b);
    const segunda = reservarNoSite(b).then(() => "reservou", (e: { code?: string }) => e.code ?? "sem-codigo");
    await esperarTrava(b);
    await a.query("commit");
    expect(await segunda).toBe("OR035");
    await b.query("rollback");

    expect(await naHora()).toBe(20);
    expect(await reservasAtivasNaLoja()).toBe(20);
    expect((await admin.query("select regra from privado.divergencias_estoque()")).rows).toEqual([]);
  }, 60_000);
});
