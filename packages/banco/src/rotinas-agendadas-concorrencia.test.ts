// Rotinas agendadas com duas conexões ao mesmo tempo, num PostgreSQL 17 de verdade (lote ROT-a; ADR-011; migration
// 20261117124230_rotinas_agendadas): o que o PGlite, com uma conexão só, não prova.
//   * Duas rodadas da mesma rotina ao mesmo tempo (uma rodada lenta e a seguinte do agendador): a segunda não espera
//     nem repete o trabalho; fica registrada como pulada.
//   * A rotina não espera o aparelho preso por outra transação (uma venda em andamento): ele fica para a rodada
//     seguinte, e a rodada termina na hora.
// Dados FICTÍCIOS; o banco é descartado no fim.
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

beforeAll(async () => {
  servidor = await iniciarPostgresReal();
  admin = await servidor.conectar();
  await montarCenario(executor(admin));
  await montarCatalogo(executor(admin));
  a = await servidor.conectar();
  b = await servidor.conectar();
  // Se a rotina passasse a esperar uma trava, a conexão b pararia aqui, e não o teste inteiro.
  await b.query("set statement_timeout = '5s'");
}, 120_000);

// Um teste que falha no meio não deixa transação aberta (e travas) para o próximo.
afterEach(async () => { for (const cliente of [a, b]) await cliente.query("rollback").catch(() => {}); });

afterAll(async () => {
  for (const cliente of [a, b, admin]) await cliente?.end().catch(() => {});
  await servidor?.parar();
});

let sessoes = 0;
// A reserva é feita pelo vendedor da loja A, como no PDV; o prazo é passado para trás pelo administrador do banco.
async function reservaVencida(variante: string, item: string | null, chave: string): Promise<string> {
  const sessao = `49000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}`;
  await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [sessao, ids.vendedorA]);
  await admin.query("begin");
  await admin.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids.vendedorA, session_id: sessao, role: "authenticated", amr: amrDaSenha() })]);
  await admin.query("set local role authenticated");
  await admin.query("select public.selecionar_unidade($1)", [ids.lojaA]);
  const { rows } = await admin.query<{ v: string }>("select public.reservar_estoque($1, 1, $2, $3, 'pdv', 15) as v", [variante, item, chave]);
  await admin.query("commit");
  const reserva = rows[0]?.v ?? "";
  await admin.query("update public.estoque_reservas set expira_em = now() - interval '1 minute' where id = $1", [reserva]);
  return reserva;
}

const rodar = async (cliente: pg.Client) => (await cliente.query<{ r: string }>("select privado.rodar_rotina('reservas_vencidas') as r")).rows[0]?.r;
const situacaoDaReserva = async (id: string) =>
  (await admin.query<{ situacao: string }>("select situacao from public.estoque_reservas where id = $1", [id])).rows[0]?.situacao;
const ultimasRodadas = async (quantas: number) => (await admin.query<{ situacao: string; quantidade: number | null }>(
  "select situacao, quantidade from (select * from privado.rotinas_execucoes where rotina = 'reservas_vencidas' order by id desc limit $1) r order by id", [quantas])).rows;

describe("rotinas agendadas com duas conexões (ROT-a)", () => {
  it("duas rodadas ao mesmo tempo: a primeira vence a reserva; a segunda não espera, não repete e fica registrada como pulada", async () => {
    const reserva = await reservaVencida(cat.capa, null, "rot-conc:1");
    await a.query("begin");
    expect(await rodar(a)).toBe("ok");
    // A primeira ainda não confirmou e segura a vez da rotina; a segunda chega agora.
    const inicio = Date.now();
    expect(await rodar(b)).toBe("pulada");
    expect(Date.now() - inicio).toBeLessThan(2_000);
    await a.query("commit");
    expect(await situacaoDaReserva(reserva)).toBe("expirada");
    expect((await ultimasRodadas(2)).sort((x, y) => x.situacao.localeCompare(y.situacao))).toEqual([
      { situacao: "ok", quantidade: 1 }, { situacao: "pulada", quantidade: null },
    ]);
    expect((await admin.query("select regra from privado.divergencias_estoque()")).rows).toEqual([]);
  });

  it("o aparelho preso por uma venda em andamento fica para a rodada seguinte, sem a rotina esperar", async () => {
    const reserva = await reservaVencida(cat.aparelho, itens.a2, "rot-conc:2");
    await a.query("begin");
    await a.query("select 1 from public.itens_serializados where id = $1 for update", [itens.a2]);
    const inicio = Date.now();
    expect(await rodar(b)).toBe("ok");
    expect(Date.now() - inicio).toBeLessThan(2_000);
    expect(await situacaoDaReserva(reserva)).toBe("ativa");
    await a.query("rollback");
    expect(await rodar(b)).toBe("ok");
    expect(await situacaoDaReserva(reserva)).toBe("expirada");
    expect((await admin.query<{ situacao: string }>("select situacao from public.itens_serializados where id = $1", [itens.a2])).rows[0]?.situacao).toBe("disponivel");
    expect(await ultimasRodadas(2)).toEqual([{ situacao: "ok", quantidade: 0 }, { situacao: "ok", quantidade: 1 }]);
    expect((await admin.query("select regra from privado.divergencias_estoque()")).rows).toEqual([]);
  });
});
