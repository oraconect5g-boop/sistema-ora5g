// Lote PAY-011a (24/11/2026; ORA-PAY-011; migration 20261124082944_debito_do_extrato_confirma_o_estorno): o débito do
// extrato e o estorno da venda disputados por duas conexões ao mesmo tempo, num PostgreSQL 17 de verdade (o PGlite tem uma
// conexão só e não prova a espera). As travas vêm sempre na mesma ordem: a linha do extrato, depois a venda e o estorno (a
// ordem de public.confirmar_estorno_externo):
//   * dois débitos disputam o mesmo estorno: o segundo espera e é recusado; o estorno fica com um débito só;
//   * o mesmo débito disputado por dois estornos: o segundo espera a linha e é recusado; o outro estorno segue pendente;
//   * a confirmação à mão em andamento e o extrato depois: o extrato espera e só guarda a prova (não confirma de novo);
//   * o extrato em andamento e a confirmação à mão depois: a confirmação espera e é recusada (OR004), sem círculo;
//   * tirar da conta o débito que está sendo ligado: espera a linha e é recusado (OR046);
//   * quem chegou primeiro desiste (rollback): o segundo, que esperava, confirma.
// Em nenhuma ordem o débito prova dois estornos, nem o estorno fica com dois débitos. Dados FICTÍCIOS; o banco é
// descartado no fim.
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

/** O dono da rede (concilia e é da gerência), na loja A, na transação da conexão. */
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
  await admin.query("select privado.lancar_movimento($1, $2, 30, 'entrada_importacao', null, null, null, null, 'pay11:capas')", [ids.lojaA, cat.capa]);
  await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [sessao, ids.dono]);
  await abrir(admin);
  await admin.query("select public.selecionar_unidade($1)", [ids.lojaA]);
  await admin.query("select public.abrir_caixa(0, 'caixa:pay11-concorrencia')");
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
const impressao = () => `f${String(++arquivos).padStart(63, "0")}`;
const EXTRATO = "select public.extrato_importar($1, 'maquininha', 'PicPay da loja', array['cartao_picpay']::text[], 'extrato.csv', $2, $3::jsonb, '{\"data\": 0}'::jsonb) as v";
const CASAR = "select public.extrato_casar_estorno($1, $2, false) as v";
const CONFIRMAR = "select public.confirmar_estorno_externo($1, $2, null) as v";
const IGNORAR = "select public.extrato_ignorar($1, 'Tarifa') as v";

/**
 * Um cenário novo e confirmado: `vendas` vendas de uma capa (R$ 79,00, no cartão PicPay) canceladas, cada uma com o
 * estorno a confirmar, e um extrato da loja com `debitos` débitos de R$ 79,00, cada um com a sua referência.
 */
async function cenario(vendas: number, debitos: number) {
  const n = ++casos;
  await abrir(admin);
  const d = (await admin.query<{ d: string }>("select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d")).rows[0]?.d ?? "";
  const estornos: string[] = [];
  const pagamentos: string[] = [];
  for (let i = 1; i <= vendas; i++) {
    const venda = (await admin.query<{ v: string }>("select public.criar_venda($1) as v", [`venda:pay11-conc:${n}:${i}`])).rows[0]?.v ?? "";
    await admin.query("select public.adicionar_item($1, $2, null, 1, $3)", [venda, cat.capa, `item:pay11-conc:${n}:${i}`]);
    await admin.query("select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3)",
      [venda, JSON.stringify([{ meio: "cartao_picpay", valor: 7900, comprovante: `NSU-CONC-${n}-${i}` }]), `fim:pay11-conc:${n}:${i}`]);
    await admin.query("select public.cancelar_venda($1, 'Cliente desistiu')", [venda]);
    estornos.push((await admin.query<{ id: string }>("select id from public.estornos_externos where venda_id = $1", [venda])).rows[0]?.id ?? "");
    pagamentos.push((await admin.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1", [venda])).rows[0]?.id ?? "");
  }
  const lista = Array.from({ length: debitos }, (_, i) => ({ numero: i + 1, data: d, valor: -7900, referencia: `EST-CONC-${n}-${i + 1}` }));
  const extrato = (await admin.query<{ v: { extrato: string } }>(EXTRATO, [ids.lojaA, impressao(), JSON.stringify(lista)])).rows[0]?.v.extrato ?? "";
  await admin.query("commit");
  const linhas = (await admin.query<{ id: string }>("select id from public.extrato_linhas where extrato_id = $1 order by numero", [extrato])).rows.map((l) => l.id);
  return { n, estornos, pagamentos, linhas };
}
/** Como terminou: cada linha (a situação, o estorno e se confirmou) e cada estorno (a situação, o comprovante e quantos débitos o usam). */
async function fim(c: { linhas: string[]; estornos: string[]; pagamentos: string[] }) {
  const linhas = [];
  for (const id of c.linhas) {
    const l = (await admin.query<{ situacao: string; estorno_id: string | null; confirmou_o_estorno: boolean | null }>(
      "select situacao, estorno_id, confirmou_o_estorno from public.extrato_linhas where id = $1", [id])).rows[0];
    linhas.push({ situacao: l?.situacao, estorno: l?.estorno_id ? c.estornos.indexOf(l.estorno_id) : null, confirmou: l?.confirmou_o_estorno ?? null });
  }
  const estornos = [];
  for (const id of c.estornos) {
    const e = (await admin.query<{ situacao: string; comprovante: string | null; debitos: string }>(
      "select e.situacao, e.comprovante, (select count(*) from public.extrato_linhas l where l.estorno_id = e.id) as debitos from public.estornos_externos e where e.id = $1", [id])).rows[0];
    estornos.push({ situacao: e?.situacao, comprovante: e?.comprovante ?? null, debitos: Number(e?.debitos) });
  }
  const pagamentos = [];
  for (const id of c.pagamentos) pagamentos.push((await admin.query<{ situacao: string }>("select situacao from public.venda_pagamentos where id = $1", [id])).rows[0]?.situacao);
  return { linhas, estornos, pagamentos };
}

describe("o débito do extrato e o estorno da venda com duas conexões (PAY-011a)", () => {
  it("dois débitos disputam o mesmo estorno: o segundo espera e é recusado; o estorno fica com um débito só", async () => {
    const c = await cenario(1, 2);
    await abrir(a);
    await a.query(CASAR, [c.linhas[0], c.estornos[0]]);
    await abrir(b);
    const segundo = codigoDe(b.query(CASAR, [c.linhas[1], c.estornos[0]]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("22023");
    await b.query("rollback");
    expect(await fim(c)).toEqual({
      linhas: [{ situacao: "estorno", estorno: 0, confirmou: true }, { situacao: "pendente", estorno: null, confirmou: null }],
      estornos: [{ situacao: "confirmado", comprovante: `EST-CONC-${c.n}-1`, debitos: 1 }], pagamentos: ["estornado"],
    });
  });

  it("o mesmo débito disputado por dois estornos: o segundo espera a linha e é recusado; o outro estorno segue pendente", async () => {
    const c = await cenario(2, 1);
    await abrir(a);
    await a.query(CASAR, [c.linhas[0], c.estornos[0]]);
    await abrir(b);
    const segundo = codigoDe(b.query(CASAR, [c.linhas[0], c.estornos[1]]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("22023");
    await b.query("rollback");
    expect(await fim(c)).toEqual({
      linhas: [{ situacao: "estorno", estorno: 0, confirmou: true }],
      estornos: [{ situacao: "confirmado", comprovante: `EST-CONC-${c.n}-1`, debitos: 1 }, { situacao: "pendente", comprovante: null, debitos: 0 }],
      pagamentos: ["estornado", "estorno_pendente"],
    });
  });

  it("a confirmação à mão em andamento e o extrato depois: o extrato espera a venda e só guarda a prova", async () => {
    const c = await cenario(1, 1);
    await abrir(a);
    await a.query(CONFIRMAR, [c.estornos[0], "EST-A-MAO"]);
    await abrir(b);
    const segundo = codigoDe(b.query(CASAR, [c.linhas[0], c.estornos[0]]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBeNull();
    await b.query("commit");
    // O comprovante é o digitado à mão: o extrato não confirmou de novo, e a linha pode ser solta com o motivo.
    expect(await fim(c)).toEqual({
      linhas: [{ situacao: "estorno", estorno: 0, confirmou: false }],
      estornos: [{ situacao: "confirmado", comprovante: "EST-A-MAO", debitos: 1 }], pagamentos: ["estornado"],
    });
  });

  it("o extrato em andamento e a confirmação à mão depois: a confirmação espera e é recusada (OR004), sem uma esperar a outra em círculo", async () => {
    const c = await cenario(1, 1);
    await abrir(a);
    await a.query(CASAR, [c.linhas[0], c.estornos[0]]);
    await abrir(b);
    const segundo = codigoDe(b.query(CONFIRMAR, [c.estornos[0], "EST-A-MAO"]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("OR004");
    await b.query("rollback");
    expect(await fim(c)).toEqual({
      linhas: [{ situacao: "estorno", estorno: 0, confirmou: true }],
      estornos: [{ situacao: "confirmado", comprovante: `EST-CONC-${c.n}-1`, debitos: 1 }], pagamentos: ["estornado"],
    });
  });

  it("tirar da conta o débito que está sendo ligado: espera a linha e é recusado (OR046)", async () => {
    const c = await cenario(1, 1);
    await abrir(a);
    await a.query(CASAR, [c.linhas[0], c.estornos[0]]);
    await abrir(b);
    const segundo = codigoDe(b.query(IGNORAR, [c.linhas[0]]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("OR046");
    await b.query("rollback");
    expect((await fim(c)).linhas).toEqual([{ situacao: "estorno", estorno: 0, confirmou: true }]);
  });

  it("quem chegou primeiro desiste: o segundo débito, que esperava, confirma o estorno", async () => {
    const c = await cenario(1, 2);
    await abrir(a);
    await a.query(CASAR, [c.linhas[0], c.estornos[0]]);
    await abrir(b);
    const segundo = codigoDe(b.query(CASAR, [c.linhas[1], c.estornos[0]]));
    await esperarTrava(b);
    await a.query("rollback");
    expect(await segundo).toBeNull();
    await b.query("commit");
    expect(await fim(c)).toEqual({
      linhas: [{ situacao: "pendente", estorno: null, confirmou: null }, { situacao: "estorno", estorno: 0, confirmou: true }],
      estornos: [{ situacao: "confirmado", comprovante: `EST-CONC-${c.n}-2`, debitos: 1 }], pagamentos: ["estornado"],
    });
  });
});
