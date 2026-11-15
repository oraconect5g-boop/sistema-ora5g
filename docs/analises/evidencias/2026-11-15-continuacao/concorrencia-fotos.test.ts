// Prova observacional: passar confirma a corrida, não aprova o produto.
// Apenas PostgreSQL 17 local descartável. Nenhuma API de Storage é chamada.
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import type pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ids, montarCenario } from "../../../../packages/banco/src/cenario";
import { cat, montarCatalogo } from "../../../../packages/banco/src/cenario-catalogo";
import { executor, iniciarPostgresReal, type PostgresReal } from "../../../../packages/banco/src/postgres-real";

let servidor: PostgresReal;
let admin: pg.Client;
let registro: pg.Client;
let limpeza: pg.Client;
const sessao = randomUUID();
beforeAll(async () => {
  servidor = await iniciarPostgresReal();
  admin = await servidor.conectar();
  registro = await servidor.conectar();
  limpeza = await servidor.conectar();
  await montarCenario(executor(admin));
  await montarCatalogo(executor(admin));
  await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [sessao, ids.gerenteB]);
  await admin.query("begin");
  await admin.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({sub: ids.gerenteB, session_id: sessao, role: "authenticated"})]);
  await admin.query("set local role authenticated");
  await admin.query("select public.selecionar_unidade($1)", [ids.lojaB]);
  await admin.query("commit");
}, 120_000);
afterAll(async () => {
  for (const c of [registro, limpeza, admin]) if (c) { await c.query("rollback").catch(() => {}); await c.end(); }
  await servidor?.parar();
});
async function abrir(c: pg.Client) {
  await c.query("begin");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({sub: ids.gerenteB, session_id: sessao, role: "authenticated"})]);
  await c.query("set local role authenticated");
}

it("limpeza apaga objeto enquanto a função de registro terminou na outra transação, ainda sem commit", async () => {
  const caminho = `${ids.organizacao}/${cat.produtoCapa}/produto/${randomUUID()}.webp`;
  await admin.query("insert into storage.objects (bucket_id,name,metadata,created_at) values ('produtos',$1,$2,now()-interval '30 hours')",
    [caminho, JSON.stringify({size: 50_000,mimetype:"image/webp"})]);
  await abrir(registro);
  const foto = await registro.query("select public.registrar_foto($1,null,$2,1200,1200,false) as id", [cat.produtoCapa,caminho]);
  expect(foto.rows[0].id).toBeTruthy();
  // A função de registro terminou, mas sua transação não confirmou. A limpeza não compartilha sua trava.
  await abrir(limpeza);
  const autorizada = await limpeza.query("select public.fotos_sem_registro_limpar($1::text[]) as r", [[caminho]]);
  expect(autorizada.rows[0].r.caminhos).toEqual([caminho]);
  const apagada = await limpeza.query("delete from storage.objects where bucket_id='produtos' and name=$1 returning name", [caminho]);
  expect(apagada.rows).toHaveLength(1);
  await limpeza.query("commit");
  await registro.query("commit");
  const final = await admin.query("select (select count(*)::int from public.fotos_produto where caminho=$1 and substituida_em is null) as fotos, (select count(*)::int from storage.objects where bucket_id='produtos' and name=$1) as objetos", [caminho]);
  expect(final.rows[0]).toEqual({fotos:1,objetos:0});
  appendFileSync(new URL("./resultado-fotos.jsonl",import.meta.url), JSON.stringify({id:"REV-CONT-001",foto_ativa:1,objeto_no_storage:0,storage_real_chamado:false})+"\n");
}, 30_000);
