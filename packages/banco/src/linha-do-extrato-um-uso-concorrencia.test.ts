// Lote AUD-c (23/11/2026; a auditoria do Codex de 21/11, PR #105, achado F21-02; migration
// 20261123121828_linha_do_extrato_um_uso): a mesma linha de crédito do extrato disputada por duas conexões ao mesmo tempo,
// num PostgreSQL 17 de verdade (o PGlite tem uma conexão só e não prova a espera). A trava é a da própria linha, tomada
// pelos dois caminhos (conciliar a venda e casar o repasse) antes de decidir:
//   * a conciliação em andamento e o repasse depois: o repasse espera e, com a conciliação confirmada, é recusado (OR046);
//   * o repasse em andamento e a conciliação depois: a conciliação espera e é recusada (OR046);
//   * dois repasses de canais diferentes na mesma linha: o segundo espera e é recusado (OR045);
//   * quem chegou primeiro desiste (rollback): o segundo, que esperava, grava;
//   * desfazer o repasse (a trava do repasse e depois a linha) e conciliar a mesma linha: a conciliação espera a linha ser
//     solta e grava, sem uma esperar a outra em círculo.
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

/** O dono da rede (vê o resultado e concilia pela rede), na loja A, na transação da conexão. */
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
  await admin.query("select privado.lancar_movimento($1, $2, 20, 'entrada_importacao', null, null, null, null, 'um-uso:capas')", [ids.lojaA, cat.capa]);
  await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [sessao, ids.dono]);
  await abrir(admin);
  await admin.query("select public.selecionar_unidade($1)", [ids.lojaA]);
  await admin.query("select public.abrir_caixa(0, 'caixa:um-uso-concorrencia')");
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
const impressao = () => `c${String(++arquivos).padStart(63, "0")}`;
const PEDIDOS = "select public.marketplace_importar($1, 'vendas.xlsx', $2, 1, $3::jsonb, '{}'::jsonb) as v";
const EXTRATO = "select public.extrato_importar(null, 'banco', 'Banco Fictício', array['pix_direto']::text[], 'extrato.ofx', $1, $2::jsonb, '{\"data\": 0}'::jsonb) as v";
const CASAR = "select public.marketplace_repasse_casar($1, $2::date, $3, null) as v";
const DESFAZER_REPASSE = "select public.marketplace_repasse_desfazer($1, $2::date, 'Casado com a linha errada') as v";
const CONCILIAR = "select public.extrato_conciliar($1, $2) as v";

/**
 * Um cenário novo e confirmado: uma venda de R$ 79,00 em Pix direto, um pedido do Mercado Livre e outro da Shopee
 * (independentes da venda), cada um de R$ 79,00 e com a mesma data de repasse, e UMA linha de crédito de R$ 79,00.
 */
async function cenario() {
  const n = ++casos;
  const repasse = `2026-11-${String(n).padStart(2, "0")}`;
  await abrir(admin);
  const d = (await admin.query<{ d: string }>("select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d")).rows[0]?.d ?? "";
  const venda = (await admin.query<{ v: string }>("select public.criar_venda($1) as v", [`venda:um-uso-conc:${n}`])).rows[0]?.v ?? "";
  await admin.query("select public.adicionar_item($1, $2, null, 1, $3)", [venda, cat.capa, `item:um-uso-conc:${n}`]);
  await admin.query("select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3)",
    [venda, JSON.stringify([{ meio: "pix_direto", valor: 7900, comprovante: `PIX-CONC-${n}` }]), `fim:um-uso-conc:${n}`]);
  for (const canal of ["mercado_livre", "shopee"]) {
    await admin.query(PEDIDOS, [canal, impressao(), JSON.stringify([
      { id_externo: `${canal}-CONC-${n}`, data: repasse, bruto: 7900, liquido: 7900, data_repasse: repasse, itens: [{ numero: 1, quantidade: 1, valor: 7900 }] }])]);
  }
  const extrato = (await admin.query<{ v: { extrato: string } }>(EXTRATO, [impressao(), JSON.stringify([{ numero: 1, data: d, valor: 7900 }])])).rows[0]?.v.extrato ?? "";
  await admin.query("commit");
  const pag = (await admin.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1", [venda])).rows[0]?.id ?? "";
  const linha = (await admin.query<{ id: string }>("select id from public.extrato_linhas where extrato_id = $1", [extrato])).rows[0]?.id ?? "";
  return { pag, linha, repasse };
}
/** Como a linha terminou: a situação, o pagamento, os repasses que a usam e se o pagamento ficou conciliado. */
async function fim(linha: string, pag: string) {
  const l = (await admin.query<{ situacao: string; pagamento_id: string | null }>("select situacao, pagamento_id from public.extrato_linhas where id = $1", [linha])).rows[0];
  const repasses = (await admin.query<{ canal: string }>("select canal from public.marketplace_repasses where linha_id = $1 order by canal", [linha])).rows.map((r) => r.canal);
  const conciliado = (await admin.query<{ ok: boolean }>("select conciliado_em is not null as ok from public.venda_pagamentos where id = $1", [pag])).rows[0]?.ok;
  return { situacao: l?.situacao, pagamento: l?.pagamento_id ?? null, repasses, conciliado };
}

describe("F21-02 com duas conexões: a linha do extrato tem um uso só (AUD-c)", () => {
  it("a conciliação em andamento e o repasse depois: o repasse espera a linha e é recusado (OR046)", async () => {
    const { pag, linha, repasse } = await cenario();
    await abrir(a);
    await a.query(CONCILIAR, [linha, pag]);
    await abrir(b);
    const segundo = codigoDe(b.query(CASAR, ["mercado_livre", repasse, linha]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("OR046");
    await b.query("rollback");
    expect(await fim(linha, pag)).toEqual({ situacao: "conciliada", pagamento: pag, repasses: [], conciliado: true });
  });

  it("o repasse em andamento e a conciliação depois: a conciliação espera a linha e é recusada (OR046)", async () => {
    const { pag, linha, repasse } = await cenario();
    await abrir(a);
    await a.query(CASAR, ["mercado_livre", repasse, linha]);
    await abrir(b);
    const segundo = codigoDe(b.query(CONCILIAR, [linha, pag]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("OR046");
    await b.query("rollback");
    expect(await fim(linha, pag)).toEqual({ situacao: "repasse", pagamento: null, repasses: ["mercado_livre"], conciliado: false });
  });

  it("dois repasses de canais diferentes na mesma linha: o segundo espera e é recusado (OR045); fica um só", async () => {
    const { pag, linha, repasse } = await cenario();
    await abrir(a);
    await a.query(CASAR, ["mercado_livre", repasse, linha]);
    await abrir(b);
    const segundo = codigoDe(b.query(CASAR, ["shopee", repasse, linha]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBe("OR045");
    await b.query("rollback");
    expect(await fim(linha, pag)).toEqual({ situacao: "repasse", pagamento: null, repasses: ["mercado_livre"], conciliado: false });
  });

  it("quem chegou primeiro desiste: o repasse, que esperava a conciliação, grava", async () => {
    const { pag, linha, repasse } = await cenario();
    await abrir(a);
    await a.query(CONCILIAR, [linha, pag]);
    await abrir(b);
    const segundo = codigoDe(b.query(CASAR, ["mercado_livre", repasse, linha]));
    await esperarTrava(b);
    await a.query("rollback");
    expect(await segundo).toBeNull();
    await b.query("commit");
    expect(await fim(linha, pag)).toEqual({ situacao: "repasse", pagamento: null, repasses: ["mercado_livre"], conciliado: false });
  });

  it("desfazer o repasse e conciliar a mesma linha ao mesmo tempo: a conciliação espera a linha ser solta e grava", async () => {
    const { pag, linha, repasse } = await cenario();
    await abrir(admin);
    await admin.query(CASAR, ["mercado_livre", repasse, linha]);
    await admin.query("commit");
    await abrir(a);
    await a.query(DESFAZER_REPASSE, ["mercado_livre", repasse]);
    await abrir(b);
    const segundo = codigoDe(b.query(CONCILIAR, [linha, pag]));
    await esperarTrava(b);
    await a.query("commit");
    expect(await segundo).toBeNull();
    await b.query("commit");
    expect(await fim(linha, pag)).toEqual({ situacao: "conciliada", pagamento: pag, repasses: [], conciliado: true });
  });
});
