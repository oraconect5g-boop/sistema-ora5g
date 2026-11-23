// Lote TRF-d (ORA-INV-007; o achado F21-04 da auditoria integral do Codex de 21/11/2026): o que faltou numa transferência
// disputado por duas conexões ao mesmo tempo, num PostgreSQL 17 de verdade (o PGlite tem uma conexão só e não prova a
// espera). A trava é a da própria transferência, a mesma de todos os passos dela:
//   * a origem diz que as 3 capas voltaram e o destino, ao mesmo tempo, que 1 chegou depois: o segundo espera e é recusado
//     (OR004: nada mais a resolver);
//   * a origem diz que 2 voltaram e o destino que 2 chegaram: o segundo espera e é recusado (só falta 1);
//   * quem chegou primeiro desiste (rollback): o segundo, que esperava, grava;
//   * o mesmo pedido duas vezes ao mesmo tempo (dois toques): o segundo espera e recebe o que já estava, sem lançar de novo;
//   * o mesmo aparelho dado como "voltou" pela origem e "chegou" pelo destino: o segundo espera e é recusado; o aparelho
//     termina numa loja só.
// Em nenhuma ordem a soma das resoluções passa do que faltou. Dados FICTÍCIOS; o banco é descartado no fim.
import { randomUUID } from "node:crypto";

import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { amrDaSenha } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";
import { executor, iniciarPostgresReal, type PostgresReal } from "./postgres-real";

let servidor: PostgresReal;
let admin: pg.Client;
let a: pg.Client;
let b: pg.Client;
const pid = new Map<pg.Client, number>();
// A origem é o dono na loja A; o destino é o gerente da loja B. Cada um com a sua sessão e a sua loja escolhida.
const ORIGEM = { usuario: ids.dono, sessao: randomUUID(), loja: ids.lojaA };
const DESTINO = { usuario: ids.gerenteB, sessao: randomUUID(), loja: ids.lojaB };
type Quem = typeof ORIGEM;

async function abrir(cliente: pg.Client, quem: Quem) {
  await cliente.query("begin");
  await cliente.query("select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: quem.usuario, session_id: quem.sessao, role: "authenticated", amr: amrDaSenha() })]);
  await cliente.query("set local role authenticated");
}

beforeAll(async () => {
  servidor = await iniciarPostgresReal();
  admin = await servidor.conectar();
  await montarCenario(executor(admin));
  await montarCatalogo(executor(admin));
  await admin.query("select privado.lancar_movimento($1, $2, 40, 'entrada_importacao', null, null, null, null, 'trf-d:capas')", [ids.lojaA, cat.capa]);
  for (const quem of [ORIGEM, DESTINO]) {
    await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [quem.sessao, quem.usuario]);
    await abrir(admin, quem);
    await admin.query("select public.selecionar_unidade($1)", [quem.loja]);
    await admin.query("commit");
  }
  for (const cliente of [(a = await servidor.conectar()), (b = await servidor.conectar())]) {
    pid.set(cliente, (await cliente.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid ?? 0);
  }
}, 120_000);
// Um teste que falha no meio não deixa transação aberta (e travas) para o próximo.
afterEach(async () => { for (const cliente of [a, b, admin]) await cliente.query("rollback").catch(() => {}); });
afterAll(async () => {
  for (const cliente of [a, b, admin]) await cliente?.end().catch(() => {});
  await servidor?.parar();
});

async function esperarTrava(cliente: pg.Client) {
  for (let i = 0; i < 400; i++) {
    const { rows } = await admin.query<{ espera: string | null }>("select wait_event_type as espera from pg_stat_activity where pid = $1", [pid.get(cliente)]);
    if (rows[0]?.espera === "Lock") return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("a segunda conexão não ficou esperando a trava da primeira");
}
/** O código da recusa de uma chamada (ou nulo, se ela gravou). */
const codigoDe = (chamada: Promise<unknown>) => chamada.then(() => null, (e: { code?: string }) => e.code ?? "sem-codigo");

let casos = 0;
const RESOLVER = "select public.transferencia_resolver_divergencia($1, $2, $3::text[], $4, $5, $6) as v";
/** Um passo confirmado, feito por uma das partes. */
async function passo<T = unknown>(quem: Quem, sql: string, params: unknown[]): Promise<T> {
  await abrir(admin, quem);
  const v = (await admin.query<{ v: T }>(sql, params)).rows[0]?.v as T;
  await admin.query("commit");
  return v;
}
/** Uma transferência nova de 5 capas da loja A para a B, recebida com 2 (faltaram 3), confirmada. */
async function capasComFalta() {
  const t = await passo<string>(DESTINO, "select public.transferencia_solicitar($1, $2, $3, 5, 'Reposição da loja', $4) as v",
    [ids.lojaA, ids.lojaB, cat.capa, `trf-d-conc:${++casos}`]);
  await passo(ORIGEM, "select public.transferencia_separar($1, '{}'::uuid[]) as v", [t]);
  await passo(ORIGEM, "select public.transferencia_enviar($1) as v", [t]);
  await passo(DESTINO, "select public.transferencia_receber($1, '{}'::text[], 2, 'A caixa chegou com três capas a menos') as v", [t]);
  return t;
}
/** Como a divergência terminou: a soma das resoluções, se ficou resolvida e quantos movimentos a resolução lançou. */
async function fim(t: string) {
  const r = (await admin.query<{ resolvidos: number; resolvida: boolean }>(
    "select coalesce((select sum(quantidade) from public.transferencia_resolucoes where transferencia_id = $1), 0)::int as resolvidos, "
    + "(select divergencia_resolvida_em is not null from public.transferencias where id = $1) as resolvida", [t])).rows[0];
  const movimentos = (await admin.query<{ n: number }>(
    "select count(*)::int as n from public.estoque_movimentos where referencia_tipo = 'transferencia' and referencia_id = $1 and chave_idempotencia like '%:resolucao:%'", [t])).rows[0]?.n;
  const divergencias = (await admin.query("select regra from privado.divergencias_estoque()")).rows;
  return { resolvidos: r?.resolvidos, resolvida: r?.resolvida, movimentos, divergencias };
}

describe("F21-04 com duas conexões: o que faltou tem um destino só (TRF-d)", () => {
  it("as 3 voltaram à origem e, ao mesmo tempo, 1 chegou depois: o segundo espera e é recusado (OR004)", async () => {
    const t = await capasComFalta();
    await abrir(a, ORIGEM);
    await a.query(RESOLVER, [t, "voltou_a_origem", null, 3, "As três capas ficaram na origem", "a"]);
    await abrir(b, DESTINO);
    const segundo = codigoDe(b.query(RESOLVER, [t, "chegou_depois", null, 1, "Achamos uma capa no fundo da caixa", "b"]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("OR004");
    await b.query("rollback");
    expect(await fim(t)).toEqual({ resolvidos: 3, resolvida: true, movimentos: 1, divergencias: [] });
  });

  it("2 voltaram e, ao mesmo tempo, 2 chegaram: o segundo espera e é recusado, porque só falta 1", async () => {
    const t = await capasComFalta();
    await abrir(a, ORIGEM);
    await a.query(RESOLVER, [t, "voltou_a_origem", null, 2, "Duas capas ficaram na origem", "a"]);
    await abrir(b, DESTINO);
    const segundo = codigoDe(b.query(RESOLVER, [t, "chegou_depois", null, 2, "Achamos duas capas no fundo da caixa", "b"]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("22023");
    await b.query("rollback");
    expect(await fim(t)).toEqual({ resolvidos: 2, resolvida: false, movimentos: 1, divergencias: [] });
  });

  it("quem chegou primeiro desiste: o segundo, que esperava, grava", async () => {
    const t = await capasComFalta();
    await abrir(a, ORIGEM);
    await a.query(RESOLVER, [t, "voltou_a_origem", null, 3, "As três capas ficaram na origem", "a"]);
    await abrir(b, DESTINO);
    const segundo = codigoDe(b.query(RESOLVER, [t, "chegou_depois", null, 1, "Achamos uma capa no fundo da caixa", "b"]));
    await esperarTrava(b);
    await a.query("rollback");
    expect(await segundo).toBeNull();
    await b.query("commit");
    expect(await fim(t)).toEqual({ resolvidos: 1, resolvida: false, movimentos: 1, divergencias: [] });
  });

  it("o mesmo pedido duas vezes ao mesmo tempo: o segundo espera e recebe o que já estava, sem lançar de novo", async () => {
    const t = await capasComFalta();
    const pedido = [t, "voltou_a_origem", null, 2, "Duas capas ficaram na origem", "dois-toques"];
    await abrir(a, ORIGEM);
    await a.query(RESOLVER, pedido);
    await abrir(b, ORIGEM);
    const segundo = b.query<{ v: { repetida: boolean; resolvidos: number } }>(RESOLVER, pedido);
    await esperarTrava(b);
    await a.query("commit");
    expect((await segundo).rows[0]?.v).toMatchObject({ repetida: true, resolvidos: 2, pendentes: 1 });
    await b.query("commit");
    expect(await fim(t)).toEqual({ resolvidos: 2, resolvida: false, movimentos: 1, divergencias: [] });
  });

  it("o mesmo aparelho dado como voltou e como chegou: o segundo espera e é recusado; o aparelho fica numa loja só", async () => {
    const t = await passo<string>(DESTINO, "select public.transferencia_solicitar($1, $2, $3, 1, 'Reposição da loja', $4) as v",
      [ids.lojaA, ids.lojaB, cat.aparelho, `trf-d-conc:${++casos}`]);
    await passo(ORIGEM, "select public.transferencia_separar($1, $2::uuid[]) as v", [t, [itens.a1]]);
    await passo(ORIGEM, "select public.transferencia_enviar($1) as v", [t]);
    await passo(DESTINO, "select public.transferencia_receber($1, '{}'::text[], null, 'A caixa chegou sem o aparelho') as v", [t]);
    const imei = (await admin.query<{ imei: string }>("select imei from public.itens_serializados where id = $1", [itens.a1])).rows[0]?.imei ?? "";
    await abrir(a, ORIGEM);
    await a.query(RESOLVER, [t, "voltou_a_origem", [imei], null, "O aparelho ficou na origem, fora da caixa", "a"]);
    await abrir(b, DESTINO);
    const segundo = codigoDe(b.query(RESOLVER, [t, "chegou_depois", [imei], null, "O aparelho chegou no dia seguinte", "b"]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("OR004");
    await b.query("rollback");
    expect((await admin.query("select unidade_id, situacao, em_estoque from public.itens_serializados where id = $1", [itens.a1])).rows)
      .toEqual([{ unidade_id: ids.lojaA, situacao: "disponivel", em_estoque: true }]);
    expect(await fim(t)).toEqual({ resolvidos: 1, resolvida: true, movimentos: 1, divergencias: [] });
  });
});
