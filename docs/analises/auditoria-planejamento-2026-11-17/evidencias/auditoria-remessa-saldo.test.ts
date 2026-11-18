import { afterAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { criarBanco, comoUsuario } from './banco-de-teste';
import { ids, montarCenario } from './cenario';
import { cat, montarCatalogo } from './cenario-catalogo';
let db: PGlite;
afterAll(async () => { await db?.close(); });
it('mede saldo ao solicitar, separar e enviar uma remessa e ao repetir envio', async () => {
  db = await criarBanco(); await montarCenario(db); await montarCatalogo(db);
  const s = {usuario: ids.dono, sessao:'4f000000-0000-4000-8000-000000001001'};
  const medir = async () => (await db.query<{quantidade:number;reservado:number}>(
    'select quantidade,reservado from public.estoque_saldos where unidade_id=$1 and variante_id=$2',[ids.lojaA,cat.capa])).rows[0];
  const estados: Record<string, unknown> = {antes:await medir()};
  await comoUsuario(db,s,async () => {
    await db.query('select public.selecionar_unidade($1)',[ids.lojaA]);
    const r=(await db.query<{v:{remessa:string;transferencias:string[]}}>(
      'select public.transferencia_solicitar_remessa($1,$2,$3::jsonb,$4,$5) as v',
      [ids.lojaA,ids.lojaB,JSON.stringify([{variante:cat.capa,quantidade:2}]),'Auditoria local de estoque','auditoria:remessa:1'])).rows[0]!.v;
    estados.solicitada=await medir();
    await db.query('select public.transferencia_separar($1,$2::uuid[])',[r.transferencias[0],[]]); estados.separada=await medir();
    await db.query('select public.transferencia_remessa_enviar($1)',[r.remessa]); estados.enviada=await medir();
    await db.query('select public.transferencia_remessa_enviar($1)',[r.remessa]); estados.repetida=await medir();
  });
  expect(estados).toEqual({antes:{quantidade:10,reservado:0},solicitada:{quantidade:10,reservado:0},separada:{quantidade:10,reservado:2},enviada:{quantidade:8,reservado:0},repetida:{quantidade:8,reservado:0}});
  console.log(JSON.stringify(estados));
});
