import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { comDigitoLuhn, comoUsuario, criarBanco } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";
let db:PGlite;
beforeAll(async()=>{db=await criarBanco();await montarCenario(db);await montarCatalogo(db);});
beforeEach(async()=>{await db.exec("begin");});afterEach(async()=>{await db.exec("rollback");});afterAll(async()=>{await db.close();});
const s={usuario:ids.vendedorAB,sessao:"80000000-0000-4000-8000-000000000001"};
async function erro(acao:()=>Promise<unknown>){await db.exec("savepoint tentativa");try{await acao();await db.exec("release savepoint tentativa");return null;}catch(e){await db.exec("rollback to savepoint tentativa");await db.exec("release savepoint tentativa");return (e as {code:string}).code;}}
it("vendedor não altera preço nem lê custo",async()=>{
 await comoUsuario(db,s,async()=>{
  await db.query("select public.selecionar_unidade($1)",[ids.lojaA]);
  expect((await db.query("select * from public.custos")).rows).toHaveLength(0);
  expect(await erro(()=>db.query("update public.precos set valor_centavos=1 where variante_id=$1",[cat.aparelho]))).toBe("42501");
 });
});
it("vendedor com duas lojas só confere item da loja escolhida",async()=>{
 await comoUsuario(db,s,async()=>{await db.query("select public.selecionar_unidade($1)",[ids.lojaA]);
 expect(await erro(()=>db.query("select public.conferir_item($1)",[itens.b1]))).toBe("P0002");
 });
});
it("anônimo não pode executar worker nem reservar estoque",async()=>{
 await comoUsuario(db,null,async()=>{
  expect(await erro(()=>db.query("select public.identidade_convites_a_processar(1)"))).toBe("42501");
  expect(await erro(()=>db.query("select public.reservar_estoque($1,1,null,'anon')",[cat.capa]))).toBe("42501");
 });
});
it("sessão sem linha no Auth não ganha acesso",async()=>{
 await comoUsuario(db,s,async()=>expect((await db.query<{ok:boolean}>("select public.tem_permissao('venda.registrar',$1) as ok",[ids.lojaA])).rows[0]?.ok).toBe(false),{criarSessao:false});
});
it("fim de campanha é exclusivo e o preço volta ao padrão",async()=>{
 await db.query("insert into public.precos(organizacao_id,variante_id,valor_centavos,inicio,fim,origem) values($1,$2,12345,now()-interval '1 day',now(),'campanha')",[ids.organizacao,cat.aparelho]);
 await comoUsuario(db,s,async()=>expect(Number((await db.query<{v:string}>("select public.preco_vigente($1,$2) as v",[cat.aparelho,ids.lojaA])).rows[0]?.v)).toBe(149900));
});
it("reserva não aceita variante nula ao repetir chave",async()=>{
 await comoUsuario(db,s,async()=>{await db.query("select public.selecionar_unidade($1)",[ids.lojaA]);
 await db.query("select public.reservar_estoque($1,1,null,'teste-null')",[cat.capa]);
 expect(await erro(()=>db.query("select public.reservar_estoque(null,1,null,'teste-null')"))).not.toBeNull();
 });
});
for(const campo of ["condicao","serie"] as const)it("entrada repetida precisa validar "+campo,async()=>{
 const imei=comDigitoLuhn("35209900997777");
 await db.query("select privado.registrar_item_serializado($1,$2,$3,null,null,'entrada_compra','teste-condicao',null,'novo','SERIE-1')",[ids.lojaA,cat.aparelho,imei]);
 const condicao=campo==="condicao"?"seminovo":"novo",serie=campo==="serie"?"SERIE-2":"SERIE-1";
 expect(await erro(()=>db.query("select privado.registrar_item_serializado($1,$2,$3,null,null,'entrada_compra','teste-condicao',null,$4,$5)",[ids.lojaA,cat.aparelho,imei,condicao,serie]))).toBe("OR004");
});
it("livro não fica divergente após reserva e liberação",async()=>{
 await comoUsuario(db,s,async()=>{await db.query("select public.selecionar_unidade($1)",[ids.lojaA]);
 const r=await db.query<{id:string}>("select public.reservar_estoque($1,1,$2,'teste-integridade') as id",[cat.aparelho,itens.a1]);
 await db.query("select public.liberar_reserva($1)",[r.rows[0]?.id]);
 });
 expect((await db.query("select * from privado.divergencias_estoque()")).rows).toHaveLength(0);
});

