// Lote FIN-006a (24/11/2026; ORA-FIN-006; migration 20261124111725_deposito_da_maquininha_no_banco): a mesma linha de crédito
// do extrato do banco disputada por duas conexões ao mesmo tempo, num PostgreSQL 17 de verdade (o PGlite tem uma conexão só
// e não prova a espera). As travas vêm na ordem dos repasses (AUD-c): a do depósito e depois a da linha; nos extratos, a da
// linha e depois a do pagamento.
//   * o depósito em andamento e a conciliação depois: a conciliação espera a linha e é recusada (OR046);
//   * a conciliação em andamento e o depósito depois: o depósito espera e é recusado (OR046);
//   * dois depósitos (PicPay e PagBank) na mesma linha: o segundo espera e é recusado (OR045);
//   * quem chegou primeiro desiste (rollback): o segundo, que esperava, grava.
// Em nenhuma ordem a linha termina com dois usos. Dados FICTÍCIOS; o banco é descartado no fim.
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

/** O dono da rede (concilia pela rede inteira), na loja A, na transação da conexão. */
async function abrir(cliente: pg.Client) {
  await cliente.query("begin");
  await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids.dono, session_id: sessao, role: "authenticated", amr: amrDaSenha() })]);
  await cliente.query("set local role authenticated");
}

beforeAll(async () => {
  servidor = await iniciarPostgresReal();
  admin = await servidor.conectar();
  await montarCenario(executor(admin));
  await montarCatalogo(executor(admin));
  await admin.query("select privado.lancar_movimento($1, $2, 30, 'entrada_importacao', null, null, null, null, 'deposito-conc:capas')", [ids.lojaA, cat.capa]);
  await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [sessao, ids.dono]);
  await abrir(admin);
  await admin.query("select public.selecionar_unidade($1)", [ids.lojaA]);
  await admin.query("select public.abrir_caixa(0, 'caixa:deposito-concorrencia')");
  await admin.query("commit");
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
let arquivos = 0;
const impressao = () => `b${String(++arquivos).padStart(63, "0")}`;
const EXTRATO = "select public.extrato_importar(null, 'banco', 'Banco Fictício', array['pix_direto']::text[], 'extrato.ofx', $1, $2::jsonb, '{\"data\": 0}'::jsonb) as v";
const CASAR = "select public.maquininha_deposito_casar($1, current_date, $2, $3) as v";
const CONCILIAR = "select public.extrato_conciliar($1, $2) as v";
// Os casos se somam no mesmo dia (o depósito de hoje cresce a cada caso): casar vai sempre com o motivo da diferença.
const MOTIVO = "Disputa do teste";

/**
 * Um cenário novo e confirmado: uma venda de R$ 79,00 no cartão PicPay e outra no cartão PagSeguro, conciliadas com o
 * dinheiro para hoje (R$ 79,00 líquidos, sem taxa), uma venda de R$ 79,00 em Pix direto, e UMA linha de crédito de R$ 79,00
 * no extrato do banco da rede (que pode ser o depósito da PicPay, o da PagBank ou o Pix direto).
 */
async function cenario() {
  const n = ++casos;
  await abrir(admin);
  const pagamentos: Record<string, string> = {};
  for (const [meio, comprovante] of [["cartao_picpay", `NSU-DC-${n}-1`], ["cartao_pagseguro", `NSU-DC-${n}-2`], ["pix_direto", `E2E-DEP-CONC-${n}`]] as const) {
    const venda = (await admin.query<{ v: string }>("select public.criar_venda($1) as v", [`venda:dep-conc:${n}:${meio}`])).rows[0]?.v ?? "";
    await admin.query("select public.adicionar_item($1, $2, null, 1, $3)", [venda, cat.capa, `item:dep-conc:${n}:${meio}`]);
    await admin.query("select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3)", [venda, JSON.stringify([{ meio, valor: 7_900, comprovante }]), `fim:dep-conc:${n}:${meio}`]);
    pagamentos[meio] = (await admin.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1", [venda])).rows[0]?.id ?? "";
  }
  // As duas maquininhas: o dinheiro para hoje, numa data única por caso (o depósito é um por maquininha e dia).
  const hoje = (await admin.query<{ d: string }>("select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d")).rows[0]?.d ?? "";
  await admin.query("select public.pagamento_conciliar($1, $2, 7900, $3::date)", [pagamentos.cartao_picpay, `CONC-PP-${n}`, hoje]);
  await admin.query("select public.pagamento_conciliar($1, $2, 7900, $3::date)", [pagamentos.cartao_pagseguro, `CONC-PS-${n}`, hoje]);
  const extrato = (await admin.query<{ v: { extrato: string } }>(EXTRATO, [impressao(), JSON.stringify([{ numero: 1, data: hoje, valor: 7_900 }])])).rows[0]?.v.extrato ?? "";
  await admin.query("commit");
  const linha = (await admin.query<{ id: string }>("select id from public.extrato_linhas where extrato_id = $1", [extrato])).rows[0]?.id ?? "";
  return { linha, pix: pagamentos.pix_direto as string };
}
/** Como a linha terminou: a situação, o pagamento, os depósitos que a usam. */
async function fim(linha: string) {
  const l = (await admin.query<{ situacao: string; pagamento_id: string | null }>("select situacao, pagamento_id from public.extrato_linhas where id = $1", [linha])).rows[0];
  const depositos = (await admin.query<{ provedor: string }>("select provedor from public.maquininha_depositos where linha_id = $1 order by provedor", [linha])).rows.map((r) => r.provedor);
  return { situacao: l?.situacao, conciliada: l?.pagamento_id !== null, depositos };
}
// Cada caso usa a sua linha; os depósitos (um por maquininha e dia) são apagados entre os casos para o próximo poder casar.
afterEach(async () => {
  await admin.query("begin");
  await admin.query("select set_config('ora.motivo', 'Limpeza entre os casos do teste', true)");
  await admin.query("delete from public.maquininha_depositos");
  await admin.query("commit");
});

describe("FIN-006a com duas conexões: a linha do extrato tem um uso só, também com o depósito da maquininha", () => {
  it("o depósito em andamento e a conciliação depois: a conciliação espera a linha e é recusada (OR046)", async () => {
    const { linha, pix } = await cenario();
    await abrir(a);
    await a.query(CASAR, ["picpay", linha, MOTIVO]);
    await abrir(b);
    const segundo = codigoDe(b.query(CONCILIAR, [linha, pix]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("OR046");
    await b.query("rollback");
    expect(await fim(linha)).toEqual({ situacao: "deposito", conciliada: false, depositos: ["picpay"] });
  });

  it("a conciliação em andamento e o depósito depois: o depósito espera a linha e é recusado (OR046)", async () => {
    const { linha, pix } = await cenario();
    await abrir(a);
    await a.query(CONCILIAR, [linha, pix]);
    await abrir(b);
    const segundo = codigoDe(b.query(CASAR, ["picpay", linha, MOTIVO]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("OR046");
    await b.query("rollback");
    expect(await fim(linha)).toEqual({ situacao: "conciliada", conciliada: true, depositos: [] });
  });

  it("dois depósitos (PicPay e PagBank) na mesma linha: o segundo espera e é recusado (OR045); fica um só", async () => {
    const { linha } = await cenario();
    await abrir(a);
    await a.query(CASAR, ["picpay", linha, MOTIVO]);
    await abrir(b);
    const segundo = codigoDe(b.query(CASAR, ["pagbank", linha, MOTIVO]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("OR045");
    await b.query("rollback");
    expect(await fim(linha)).toEqual({ situacao: "deposito", conciliada: false, depositos: ["picpay"] });
  });

  it("quem chegou primeiro desiste: a conciliação, que esperava o depósito, grava", async () => {
    const { linha, pix } = await cenario();
    await abrir(a);
    await a.query(CASAR, ["picpay", linha, MOTIVO]);
    await abrir(b);
    const segundo = codigoDe(b.query(CONCILIAR, [linha, pix]));
    await esperarTrava(b);
    await a.query("rollback");
    expect(await segundo).toBeNull();
    await b.query("commit");
    expect(await fim(linha)).toEqual({ situacao: "conciliada", conciliada: true, depositos: [] });
  });
});
