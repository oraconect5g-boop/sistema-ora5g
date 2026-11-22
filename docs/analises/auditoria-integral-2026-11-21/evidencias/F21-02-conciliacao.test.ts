// Lote REPASSE-a (18/11/2026; ORA-MKTPL-005 e ORA-MKTPL-008; migration dos repasses dos marketplaces): o repasse do canal
// (os pedidos com a mesma data de repasse) casado com a linha de crédito do extrato do banco, a divergência com motivo e o
// painel. Dados FICTÍCIOS (pedidos, extratos e valores inventados aqui); cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

import {cat,montarCatalogo} from "./cenario-catalogo";
let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let arquivos = 0;
const impressao = () => `d${String(++arquivos).padStart(63, "0")}`;
async function erroDe(acao: () => Promise<unknown>): Promise<string | null> {
  await db.exec("savepoint tentativa");
  try {
    await acao();
    await db.exec("release savepoint tentativa");
    return null;
  } catch (e) {
    await db.exec("rollback to savepoint tentativa");
    await db.exec("release savepoint tentativa");
    return (e as { code?: string }).code ?? "sem-codigo";
  }
}
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const recusa = (s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });

const PEDIDOS = "select public.marketplace_importar($1, 'vendas.xlsx', $2, $3, $4::jsonb, '{}'::jsonb) as v";
const EXTRATO = "select public.extrato_importar(null, 'banco', 'Banco Fictício', array['pix_direto']::text[], 'extrato.ofx', $1, $2::jsonb, '{\"data\": 0}'::jsonb) as v";
const CASAR = "select public.marketplace_repasse_casar($1, $2::date, $3, $4) as v";
const DESFAZER = "select public.marketplace_repasse_desfazer($1, $2::date, $3) as v";
const PAINEL = "select public.marketplace_repasses_painel($1::date, $2::date) as v";
type Pedido = { id_externo: string; data: string; bruto: number; tarifas?: number; liquido?: number; data_repasse?: string };
const pedidos = (s: Sessao, lista: Pedido[], canal = "mercado_livre") =>
  valor(s, PEDIDOS, [canal, impressao(), lista.length, JSON.stringify(lista.map((p, i) => ({ ...p, itens: [{ numero: i + 1, quantidade: 1, valor: p.bruto }] })))]);
/** Importa o extrato do banco da rede e devolve o id de cada linha, pela ordem. */
async function extrato(s: Sessao, linhas: { data: string; valor: number; descricao?: string }[]): Promise<string[]> {
  const r = await valor<{ extrato: string }>(s, EXTRATO, [impressao(), JSON.stringify(linhas.map((l, i) => ({ numero: i + 1, ...l })))]);
  return (await db.query<{ id: string }>("select id from public.extrato_linhas where extrato_id = $1 order by numero", [r.extrato])).rows.map((l) => l.id);
}
type Repasse = { canal: string; data_repasse: string; pedidos: number; esperado: number; estimados: number; casado: Record<string, unknown> | null; sugestoes: { linha: string; valor: number }[] };
const painel = async (s: Sessao) => valor<{ repasses: Repasse[]; sem_data_de_repasse: number }>(s, PAINEL, ["2026-11-01", "2026-11-30"]);


// Provas independentes da auditoria de 21/11. Somente banco local descartável.
async function preparar() {
 const dono=await naLoja(ids.dono,ids.lojaA);
 const d=(await db.query<{d:string}>("select to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') as d")).rows[0]!.d;
 await valor(dono,"select public.abrir_caixa(0,'caixa:audit-21') as v");
 const venda=await valor<string>(dono,"select public.criar_venda('venda:audit-21') as v");
 await valor(dono,"select public.adicionar_item($1,$2,null,1,'item:audit-21') as v",[venda,cat.capa]);
 await valor(dono,"select public.concluir_venda($1,$2::jsonb,'{}'::jsonb,'fim:audit-21') as v",[venda,JSON.stringify([{meio:'pix_direto',valor:7900,comprovante:'PIX-AUDITORIA'}])]);
 const pag=(await db.query<{id:string}>("select id from public.venda_pagamentos where venda_id=$1",[venda])).rows[0]!.id;
 await pedidos(dono,[{id_externo:'OUTRA-VENDA-ML',data:d,bruto:7900,liquido:7900,data_repasse:d}]);
 const [linha]=await extrato(dono,[{data:d,valor:7900}]);
 return {dono,d,pag,linha};
}
it('F21-02a: uma linha já conciliada com venda não pode quitar outro repasse',async()=>{
 const {dono,d,pag,linha}=await preparar();
 await valor(dono,'select public.extrato_conciliar($1,$2) as v',[linha,pag]);
 expect(await recusa(dono,CASAR,['mercado_livre',d,linha,null])).not.toBeNull();
});
it('F21-02b: uma linha usada por repasse não pode conciliar outra venda',async()=>{
 const {dono,d,pag,linha}=await preparar();
 await valor(dono,CASAR,['mercado_livre',d,linha,null]);
 expect(await recusa(dono,'select public.extrato_conciliar($1,$2)',[linha,pag])).not.toBeNull();
});
