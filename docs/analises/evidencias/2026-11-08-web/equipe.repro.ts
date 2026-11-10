import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { comoUsuario, criarBanco } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

let db: PGlite;
beforeAll(async () => { db = await criarBanco(); await montarCenario(db); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });
let numero = 0;
const sessao = (usuario: string) => ({ usuario, sessao: "90000000-0000-4000-8000-" + String(++numero).padStart(12, "0") });

it("gestão de uma organização não deve bloquear o vendedor na outra organização", async () => {
  await db.query("insert into public.vinculos(usuario_id,organizacao_id,papel,escopo,unidade_id,inicio) values ($1,$2,'vendedor','unidade',$3,now()-interval '1 hour'),($1,$4,'vendedor','unidade',$5,now()-interval '1 hour')", [ids.semVinculo,ids.organizacao,ids.lojaA,ids.outraOrganizacao,ids.lojaOutraOrg]);
  const pessoa = sessao(ids.semVinculo);
  await comoUsuario(db,pessoa,async()=>{await db.query("select public.selecionar_unidade($1)",[ids.lojaOutraOrg]);});
  await comoUsuario(db,sessao(ids.dono),async()=>{await db.query("select public.alterar_situacao_pessoa($1,'bloqueado','teste de escopo')",[ids.semVinculo]);});
  const r = await comoUsuario(db,pessoa,async()=>db.query<{ok:boolean}>("select public.tem_permissao('venda.registrar',$1) as ok",[ids.lojaOutraOrg]));
  expect(r.rows[0]?.ok).toBe(true);
});

it("convite não deve permitir autoconcessão depois de mudança de email no Auth", async () => {
  await db.query("update auth.users set email='admin.novo@teste.invalid' where id=$1",[ids.administrador]);
  const s = sessao(ids.administrador);
  const convite = await comoUsuario(db,s,async()=>(await db.query<{id:string}>("select public.convidar_pessoa($1,'Pessoa teste','admin.novo@teste.invalid','gerente',array[$2::uuid],'teste de identidade') as id",[ids.organizacao,ids.lojaA])).rows[0]?.id);
  await db.query("select public.identidade_convites_a_processar(10)");
  await db.query("select public.identidade_concluir_convite($1,$2,true)",[convite,ids.administrador]);
  const r=await comoUsuario(db,s,async()=>{await db.query("select public.selecionar_unidade($1)",[ids.lojaA]);return db.query<{ok:boolean}>("select public.tem_permissao('venda.registrar',$1) as ok",[ids.lojaA]);});
  expect(r.rows[0]?.ok).toBe(false);
});

it("worker não deve conceder vínculo com convite cujo autor perdeu a autorização", async () => {
  const alvo="90000000-0000-4000-8000-000000000500";
  await db.query("insert into auth.users(id,email) values($1,'convidado@teste.invalid')",[alvo]);
  const convite=await comoUsuario(db,sessao(ids.dono),async()=>(await db.query<{id:string}>("select public.convidar_pessoa($1,'Pessoa teste','convidado@teste.invalid','administrador',array[]::uuid[],'teste de revogação') as id",[ids.organizacao])).rows[0]?.id);
  await db.query("update public.perfis_usuario set status='bloqueado' where id=$1",[ids.dono]);
  await db.query("select public.identidade_convites_a_processar(10)");
  await db.query("select public.identidade_concluir_convite($1,$2,true)",[convite,alvo]);
  const r=await db.query<{n:number}>("select count(*)::int as n from public.vinculos where usuario_id=$1 and papel='administrador' and fim is null",[alvo]);
  expect(r.rows[0]?.n).toBe(0);
});
