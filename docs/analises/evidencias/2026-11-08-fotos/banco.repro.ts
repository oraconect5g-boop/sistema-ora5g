import type {PGlite} from "@electric-sql/pglite";
import{afterAll,afterEach,beforeAll,beforeEach,expect,it}from"vitest";
import{criarBanco,comoUsuario}from"./banco-de-teste";
import{ids,montarCenario}from"./cenario";
import{cat,montarCatalogo}from"./cenario-catalogo";
let db:PGlite;
beforeAll(async()=>{db=await criarBanco();await montarCenario(db);await montarCatalogo(db);});
beforeEach(async()=>{await db.exec("begin");});afterEach(async()=>{await db.exec("rollback");});afterAll(async()=>{await db.close();});
it("índice existente cobre filtro das duas colunas da FK de fotos",async()=>{
 await db.exec("set local enable_seqscan=off");
 const r=await db.query("explain (format json) select id from public.fotos_produto where produto_id=$1 and organizacao_id=$2",[cat.produtoAparelho,ids.organizacao]);
 const plano=JSON.stringify(r.rows);process.stdout.write("PLANO_FOTO="+plano+"\n");
 expect(plano).toContain("fotos_organizacao");
 expect(plano).toContain("produto_id");expect(plano).toContain("organizacao_id");
});
it("registro da mesma foto já confirmada é idempotente",async()=>{
 const sessao={usuario:ids.dono,sessao:"81000000-0000-4000-8000-000000000001"};
 const caminho=ids.organizacao+"/"+cat.produtoAparelho+"/produto/81000000-0000-4000-8000-000000000002.webp";
 await comoUsuario(db,sessao,async()=>{
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('produtos',$1,'{\"size\":120000,\"mimetype\":\"image/webp\"}'::jsonb)",[caminho]);
  const sql="select public.registrar_foto($1,null,$2,1200,1200,false) as id";
  const a=await db.query<{id:string}>(sql,[cat.produtoAparelho,caminho]);
  await db.exec("savepoint repetir_foto");
  let erro:string|null=null;let id:string|undefined;
  try{id=(await db.query<{id:string}>(sql,[cat.produtoAparelho,caminho])).rows[0]?.id;await db.exec("release savepoint repetir_foto");}
  catch(e){erro=(e as{code:string}).code;await db.exec("rollback to savepoint repetir_foto");await db.exec("release savepoint repetir_foto");}
  expect(erro).toBeNull();expect(id).toBe(a.rows[0]?.id);
 });
});

