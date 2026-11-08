// Concorrência real (auditoria do Codex de 08/11/2026): duas conexões simultâneas num
// PostgreSQL 17 de verdade disputando o mesmo IMEI, a mesma chave, o último item, a liberação
// e o vencimento. A segunda conexão só continua depois de o teste confirmar que ela está
// parada esperando a trava da primeira (pg_stat_activity), então a disputa acontece sempre.
// Dados fictícios; o banco é descartado no fim.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comDigitoLuhn } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";
import { executor, iniciarPostgresReal, type PostgresReal } from "./postgres-real";

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
  for (const cliente of [(a = await servidor.conectar()), (b = await servidor.conectar())]) {
    pid.set(cliente, (await cliente.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid ?? 0);
  }
}, 120_000);

afterAll(async () => {
  for (const cliente of [a, b, admin]) await cliente?.end().catch(() => {});
  await servidor?.parar();
});

let sessoes = 0;
type Sessao = { usuario: string; sessao: string };

// A unidade da sessão é gravada antes (como no login), fora da disputa.
async function sessaoNaLoja(usuario: string, unidade: string): Promise<Sessao> {
  const sessao = { usuario, sessao: `42000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await admin.query("begin");
  await admin.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: usuario, session_id: sessao.sessao, role: "authenticated" })]);
  await admin.query("set local role authenticated");
  const { rows } = await admin.query<{ ok: boolean }>("select public.selecionar_unidade($1) as ok", [unidade]);
  await admin.query("commit");
  expect(rows[0]?.ok).toBe(true);
  return sessao;
}

// Abre a transação na conexão; com sessão, como o usuário logado (papel authenticated).
async function abrir(cliente: pg.Client, sessao?: Sessao) {
  await cliente.query("begin");
  if (sessao) {
    await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: sessao.usuario, session_id: sessao.sessao, role: "authenticated" })]);
    await cliente.query("set local role authenticated");
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

// A primeira faz e segura; a segunda tenta, fica esperando; a primeira confirma; a segunda termina.
async function disputa<T>(primeira: () => Promise<unknown>, segunda: () => Promise<T>): Promise<{ ok: T } | { erro: string }> {
  await primeira();
  const resultado = segunda().then((ok) => ({ ok }), (e: { code?: string }) => ({ erro: e.code ?? "sem-codigo" }));
  await esperarTrava(b);
  await a.query("commit");
  const final = await resultado;
  await b.query("erro" in final ? "rollback" : "commit");
  return final;
}

const valor = async <T>(cliente: pg.Client, sql: string, params: unknown[]) => (await cliente.query<{ v: T }>(sql, params)).rows[0]?.v;
const contar = async (sql: string, params: unknown[] = []) => Number((await admin.query<{ n: string }>(sql, params)).rows[0]?.n);
const divergencias = async () => (await admin.query<{ regra: string }>("select regra from privado.divergencias_estoque()")).rows;
const saldo = async (unidade: string, variante: string) =>
  (await admin.query<{ quantidade: number; reservado: number }>("select quantidade, reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0];
const ENTRADA = "select privado.registrar_item_serializado($1, $2, $3, $4, null, 'entrada_compra', $5) as v";
const RESERVA = "select public.reservar_estoque($1, $2, $3, $4) as v";

describe("duas conexões ao mesmo tempo no PostgreSQL 17", () => {
  it("mesmo IMEI em duas entradas: uma entra, a outra é recusada e nada fica pela metade", async () => {
    const imei = comDigitoLuhn("35209900172001");
    await abrir(a);
    await abrir(b);
    const final = await disputa(
      () => a.query(ENTRADA, [ids.lojaA, cat.aparelho, imei, null, "conc:imei:1"]),
      () => valor(b, ENTRADA, [ids.lojaA, cat.aparelho, imei, null, "conc:imei:2"]),
    );
    expect(final).toEqual({ erro: "23505" });
    expect(await contar("select count(*) as n from public.itens_serializados where imei = $1", [imei])).toBe(1);
    expect(await contar("select count(*) as n from public.estoque_movimentos where chave_idempotencia like 'conc:imei:%'")).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("IMEI de um aparelho e IMEI2 de outro ao mesmo tempo: o segundo é recusado (REV-020)", async () => {
    const imei = comDigitoLuhn("35209900172002");
    await abrir(a);
    await abrir(b);
    const final = await disputa(
      () => a.query(ENTRADA, [ids.lojaA, cat.aparelho, imei, null, "conc:imei2:1"]),
      () => valor(b, ENTRADA, [ids.lojaA, cat.aparelho, comDigitoLuhn("35209900172003"), imei, "conc:imei2:2"]),
    );
    expect(final).toEqual({ erro: "23505" });
    expect(await divergencias()).toEqual([]);
  });

  it("mesma chave de reserva em duas conexões: a mesma reserva, contada uma vez (REV-021)", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    const antes = (await saldo(ids.lojaA, cat.capa))?.reservado ?? 0;
    await abrir(a, ana);
    await abrir(b, ana);
    let primeira: string | undefined;
    const final = await disputa(
      async () => { primeira = await valor<string>(a, RESERVA, [cat.capa, 1, null, "conc:chave:1"]); },
      () => valor<string>(b, RESERVA, [cat.capa, 1, null, "conc:chave:1"]),
    );
    expect(final).toEqual({ ok: primeira });
    expect((await saldo(ids.lojaA, cat.capa))?.reservado).toBe(antes + 1);
    expect(await divergencias()).toEqual([]);
  });

  it("mesma chave com outra quantidade ao mesmo tempo: a segunda recebe OR004", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    await abrir(a, ana);
    await abrir(b, ana);
    const final = await disputa(
      () => a.query(RESERVA, [cat.capa, 1, null, "conc:chave:2"]),
      () => valor(b, RESERVA, [cat.capa, 3, null, "conc:chave:2"]),
    );
    expect(final).toEqual({ erro: "OR004" });
    expect(await divergencias()).toEqual([]);
  });

  it("mesma chave no livro em duas conexões: um lançamento só (REV-022)", async () => {
    const lancar = "select privado.lancar_movimento($1, $2, 2, 'entrada_compra', null, null, null, null, 'conc:livro:1') as v";
    await abrir(a);
    await abrir(b);
    let primeiro: string | undefined;
    const final = await disputa(
      async () => { primeiro = await valor<string>(a, lancar, [ids.lojaB, cat.capa]); },
      () => valor<string>(b, lancar, [ids.lojaB, cat.capa]),
    );
    expect(final).toEqual({ ok: primeiro });
    expect(await contar("select count(*) as n from public.estoque_movimentos where chave_idempotencia = 'conc:livro:1'")).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("devolução do mesmo aparelho em duas conexões: ele volta ao estoque uma vez só (REV-023)", async () => {
    await admin.query("select privado.lancar_movimento($1, $2, -1, 'venda', $3, null, null, null, 'conc:venda:b1')", [ids.lojaB, cat.aparelho, itens.b1]);
    const devolver = "select privado.lancar_movimento($1, $2, 1, 'devolucao', $3, null, null, null, $4) as v";
    await abrir(a);
    await abrir(b);
    const final = await disputa(
      () => a.query(devolver, [ids.lojaB, cat.aparelho, itens.b1, "conc:devolucao:1"]),
      () => valor(b, devolver, [ids.lojaB, cat.aparelho, itens.b1, "conc:devolucao:2"]),
    );
    expect(final).toEqual({ erro: "OR005" });
    expect(await divergencias()).toEqual([]);
  });

  it("último acessório disputado por dois vendedores: um reserva, o outro recebe OR001", async () => {
    const gerente = await sessaoNaLoja(ids.gerenteB, ids.lojaB);
    const colega = await sessaoNaLoja(ids.vendedorAB, ids.lojaB);
    const atual = await saldo(ids.lojaB, cat.capa);
    const sobra = (atual?.quantidade ?? 0) - (atual?.reservado ?? 0);
    await abrir(a, colega);
    await a.query(RESERVA, [cat.capa, sobra - 1, null, "conc:ultimo:0"]);
    await a.query("commit");
    await abrir(a, gerente);
    await abrir(b, colega);
    const final = await disputa(
      () => a.query(RESERVA, [cat.capa, 1, null, "conc:ultimo:1"]),
      () => valor(b, RESERVA, [cat.capa, 1, null, "conc:ultimo:2"]),
    );
    expect(final).toEqual({ erro: "OR001" });
    const depois = await saldo(ids.lojaB, cat.capa);
    expect(depois?.reservado).toBe(depois?.quantidade);
    expect(await divergencias()).toEqual([]);
  });

  it("o mesmo aparelho disputado por dois vendedores: um reserva, o outro recebe OR002", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    const colega = await sessaoNaLoja(ids.vendedorAB, ids.lojaA);
    await abrir(a, ana);
    await abrir(b, colega);
    const final = await disputa(
      () => a.query(RESERVA, [cat.aparelho, 1, itens.a2, "conc:aparelho:1"]),
      () => valor(b, RESERVA, [cat.aparelho, 1, itens.a2, "conc:aparelho:2"]),
    );
    expect(final).toEqual({ erro: "OR002" });
    expect(await contar("select count(*) as n from public.estoque_reservas where item_serializado_id = $1 and situacao = 'ativa'", [itens.a2])).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("liberação e nova reserva ao mesmo tempo: a nova espera e fica com o aparelho", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    const colega = await sessaoNaLoja(ids.vendedorAB, ids.lojaA);
    const reserva = await admin.query<{ id: string }>("select id from public.estoque_reservas where chave_idempotencia = 'conc:aparelho:1'");
    await abrir(a, ana);
    await abrir(b, colega);
    const final = await disputa(
      () => a.query("select public.liberar_reserva($1)", [reserva.rows[0]?.id]),
      () => valor<string>(b, RESERVA, [cat.aparelho, 1, itens.a2, "conc:aparelho:3"]),
    );
    expect("ok" in final).toBe(true);
    expect(await contar("select count(*) as n from public.estoque_reservas where item_serializado_id = $1 and situacao = 'ativa'", [itens.a2])).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("reserva vencida disputada: uma conexão encerra e reserva, a outra recebe OR002; encerrada uma vez só", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    const colega = await sessaoNaLoja(ids.vendedorAB, ids.lojaA);
    await abrir(a, ana);
    const vencida = await valor<string>(a, "select public.reservar_estoque($1, 1, $2, 'conc:vencida:0', 'pdv', 1) as v", [cat.chip, itens.chipA]);
    await a.query("commit");
    await admin.query("update public.estoque_reservas set expira_em = now() - interval '1 minute' where id = $1", [vencida]);
    await abrir(a, ana);
    await abrir(b, colega);
    const final = await disputa(
      () => a.query(RESERVA, [cat.chip, 1, itens.chipA, "conc:vencida:1"]),
      () => valor(b, RESERVA, [cat.chip, 1, itens.chipA, "conc:vencida:2"]),
    );
    expect(final).toEqual({ erro: "OR002" });
    const { rows } = await admin.query<{ situacao: string }>("select situacao from public.estoque_reservas where id = $1", [vencida]);
    expect(rows[0]?.situacao).toBe("expirada");
    expect((await saldo(ids.lojaA, cat.chip))?.reservado).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("a rotina de vencimento não espera pelo aparelho que está numa venda e não encerra duas vezes", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    const atual = await admin.query<{ id: string }>("select id from public.estoque_reservas where chave_idempotencia = 'conc:vencida:1'");
    await admin.query("update public.estoque_reservas set expira_em = now() - interval '1 minute' where id = $1", [atual.rows[0]?.id]);
    await abrir(a, ana);
    await a.query(RESERVA, [cat.chip, 1, itens.chipA, "conc:vencida:3"]);
    // A venda segura o chip; a rotina passa por ele sem esperar e encerra o resto.
    const encerradas = await valor<number>(b, "select privado.expirar_reservas() as v", []);
    expect(encerradas).toBe(0);
    await a.query("commit");
    const { rows } = await admin.query<{ situacao: string; n: string }>(
      "select situacao, count(*) as n from public.estoque_reservas where item_serializado_id = $1 group by situacao order by situacao", [itens.chipA]);
    expect(rows.map((r) => [r.situacao, Number(r.n)])).toEqual([["ativa", 1], ["expirada", 2]]);
    expect(await divergencias()).toEqual([]);
  });
});
