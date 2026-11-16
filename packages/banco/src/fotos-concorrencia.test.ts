// O registro da foto e a limpeza das fotos sem registro ao mesmo tempo, num PostgreSQL 17 de verdade (#98, lote INTEG-b;
// migration 20261116130000_limpeza_das_fotos_protocolo). A prova do Codex (PR #97,
// docs/analises/evidencias/2026-11-15-continuacao/concorrencia-fotos.test.ts) terminava com uma foto ativa e nenhum
// arquivo; aqui ela vira regressão do comportamento certo, nas três ordens:
//   * o registro em andamento e a limpeza depois: a limpeza espera a trava do caminho e, com a foto confirmada, recusa
//     (P0002); o Storage não deixa apagar sem a separação; ficam a foto e o arquivo;
//   * a limpeza separa e confirma, o registro vem depois: o registro recusa (OR004); o arquivo sai e a conclusão marca;
//   * a limpeza em andamento e o registro depois: o registro espera e, com a separação confirmada, recusa.
// Nenhuma API de Storage é chamada: o apagar é o DELETE na tabela do Storage como a pessoa logada (a mesma política).
// Dados FICTÍCIOS; o banco é descartado no fim.
import { randomUUID } from "node:crypto";

import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { amrDaSenha } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";
import { executor, iniciarPostgresReal, type PostgresReal } from "./postgres-real";

let servidor: PostgresReal;
let admin: pg.Client;
let a: pg.Client;
let b: pg.Client;
const pid = new Map<pg.Client, number>();
const sessao = randomUUID();

beforeAll(async () => {
  servidor = await iniciarPostgresReal();
  admin = await servidor.conectar();
  await montarCenario(executor(admin));
  await montarCatalogo(executor(admin));
  await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [sessao, ids.gerenteB]);
  await abrir(admin);
  await admin.query("select public.selecionar_unidade($1)", [ids.lojaB]);
  await admin.query("commit");
  for (const cliente of [(a = await servidor.conectar()), (b = await servidor.conectar())]) {
    pid.set(cliente, (await cliente.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid ?? 0);
  }
}, 120_000);
afterEach(async () => { for (const cliente of [a, b]) await cliente.query("rollback").catch(() => {}); });
afterAll(async () => {
  for (const cliente of [a, b, admin]) await cliente?.end().catch(() => {});
  await servidor?.parar();
});

/** A gerente da loja B (envia fotos), na transação da conexão. */
async function abrir(cliente: pg.Client) {
  await cliente.query("begin");
  await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids.gerenteB, session_id: sessao, role: "authenticated", amr: amrDaSenha() })]);
  await cliente.query("set local role authenticated");
}
async function esperarTrava(cliente: pg.Client) {
  for (let i = 0; i < 400; i++) {
    const { rows } = await admin.query<{ espera: string | null }>("select wait_event_type as espera from pg_stat_activity where pid = $1", [pid.get(cliente)]);
    if (rows[0]?.espera === "Lock") return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("a segunda conexão não ficou esperando a trava da primeira");
}
/** Um arquivo de foto enviado há 30 horas, ainda sem registro. */
async function arquivoSolto() {
  const caminho = `${ids.organizacao}/${cat.produtoCapa}/produto/${randomUUID()}.webp`;
  await admin.query("insert into storage.objects (bucket_id, name, metadata, created_at) values ('produtos', $1, $2, now() - interval '30 hours')",
    [caminho, JSON.stringify({ size: 50_000, mimetype: "image/webp" })]);
  return caminho;
}
const REGISTRAR = "select public.registrar_foto($1, null, $2, 1200, 1200, false) as v";
const LIMPAR = "select public.fotos_sem_registro_limpar($1::text[]) as v";
const APAGAR = "delete from storage.objects where bucket_id = 'produtos' and name = $1 returning name";
const codigo = (e: unknown) => (e as { code?: string }).code ?? "sem-codigo";
const final = async (caminho: string) => (await admin.query<{ fotos: number; objetos: number }>(
  `select (select count(*)::int from public.fotos_produto where caminho = $1 and substituida_em is null) as fotos,
          (select count(*)::int from storage.objects where bucket_id = 'produtos' and name = $1) as objetos`, [caminho])).rows[0];

describe("o registro da foto e a limpeza ao mesmo tempo no PostgreSQL 17 (#98)", () => {
  it("o registro em andamento e a limpeza depois: a limpeza espera, recusa, e o Storage não apaga; ficam a foto e o arquivo", async () => {
    const caminho = await arquivoSolto();
    await abrir(a);
    expect((await a.query(REGISTRAR, [cat.produtoCapa, caminho])).rows[0]?.v).toBeTruthy();
    await abrir(b);
    const limpeza = b.query(LIMPAR, [[caminho]]).then(() => "ok", codigo);
    await esperarTrava(b);
    await a.query("commit");
    // A prova do Codex: a limpeza liberava e o objeto sumia. Agora ela vê a foto confirmada e recusa.
    expect(await limpeza).toBe("P0002");
    await b.query("rollback");
    await abrir(b);
    expect((await b.query(APAGAR, [caminho])).rows).toEqual([]);
    await b.query("rollback");
    expect(await final(caminho)).toEqual({ fotos: 1, objetos: 1 });
  });

  it("a limpeza separa e confirma, o registro vem depois: o registro recusa (OR004); o arquivo sai e a conclusão marca", async () => {
    const caminho = await arquivoSolto();
    await abrir(b);
    await b.query(LIMPAR, [[caminho]]);
    await b.query("commit");
    await abrir(a);
    const registro = await a.query(REGISTRAR, [cat.produtoCapa, caminho]).then(() => "ok", codigo);
    expect(registro).toBe("OR004");
    await a.query("rollback");
    await abrir(b);
    expect((await b.query(APAGAR, [caminho])).rows).toHaveLength(1);
    expect((await b.query("select public.fotos_limpeza_concluir($1::text[]) as v", [[caminho]])).rows[0]?.v).toEqual({ removidos: [caminho], pendentes: [] });
    await b.query("commit");
    expect(await final(caminho)).toEqual({ fotos: 0, objetos: 0 });
  });

  it("a limpeza em andamento e o registro depois: o registro espera a trava e, com a separação confirmada, recusa", async () => {
    const caminho = await arquivoSolto();
    await abrir(b);
    await b.query(LIMPAR, [[caminho]]);
    await abrir(a);
    const registro = a.query(REGISTRAR, [cat.produtoCapa, caminho]).then(() => "ok", codigo);
    await esperarTrava(a);
    await b.query("commit");
    expect(await registro).toBe("OR004");
    await a.query("rollback");
    expect(await final(caminho)).toEqual({ fotos: 0, objetos: 1 });
  });
});
