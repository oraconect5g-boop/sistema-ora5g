// Auditoria independente: dados fictícios, PGlite descartável, sem Supabase remoto.
// Os dois testes REV-DIR observam defeitos; passar NÃO significa aceite desses comportamentos.
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { criarBanco, comoUsuario, comDigitoLuhn, type Sessao } from '../../../../packages/banco/src/banco-de-teste';
import { ids, montarCenario } from '../../../../packages/banco/src/cenario';
import { cat, itens, montarCatalogo } from '../../../../packages/banco/src/cenario-catalogo';
let db:PGlite;let n=0;
const log=(id:string,prova:unknown)=>appendFileSync(new URL('resultados.jsonl',import.meta.url),JSON.stringify({id,prova})+'\n');
beforeAll(async()=>{db=await criarBanco();await montarCenario(db);await montarCatalogo(db);});
afterAll(async()=>{await db.close();});
beforeEach(async()=>{await db.exec('begin');});
afterEach(async()=>{await db.exec('rollback');});
async function sessao(usuario:string,unidade=ids.lojaA):Promise<Sessao>{
 const s={usuario,sessao:`7d000000-0000-4000-8000-${String(++n).padStart(12,'0')}`};
 await comoUsuario(db,s,()=>db.query('select public.selecionar_unidade($1)',[unidade]));return s;
}
const rpc=async<T>(s:Sessao,sql:string,p:unknown[]=[])=>comoUsuario(db,s,async()=>(await db.query<{v:T}>(sql,p)).rows[0]!.v);
async function codigo(s:Sessao,sql:string,p:unknown[]=[]){return comoUsuario(db,s,async()=>{
 await db.exec('savepoint erro');let c:string|null=null;
 try{await db.query(sql,p);}catch(e){c=(e as {code:string}).code;await db.exec('rollback to savepoint erro');}
 await db.exec('release savepoint erro');return c;
});}
const entrada="select public.estoque_registrar_entrada($1,'carga_inicial',null,null,$2::jsonb,$3,'Conferencia de auditoria') as v";
const abrir="select public.inventario_abrir($1,$2::uuid[],'Conferencia de auditoria',$3) as v";
const contar='select public.inventario_contar($1,$2,$3,$4::text[]) as v';
const enviar="select public.inventario_enviar($1,'Contagem conferida') as v";
const decidir="select public.inventario_decidir($1,true,'Contagem aprovada') as v";
it('REV-NOV-001 / #69: vendedor não lê custo direto de entrada',async()=>{
 const d=await sessao(ids.dono),v=await sessao(ids.vendedorA);
 const e=await rpc<{id:string}>(d,entrada,[ids.lojaA,JSON.stringify([{variante:cat.capa,quantidade:2,custo:1234}]),'audit:dir:custo']);
 const perm=await rpc<boolean>(v,"select public.tem_permissao('custo.ver',$1) as v",[ids.lojaA]);
 const c=await codigo(v,'select e.total_custo_centavos,i.custo_unitario_centavos from public.entradas_estoque e join public.entrada_itens i on i.entrada_id=e.id where e.id=$1',[e.id]);
 log('REV-NOV-001',{perm,codigo:c});expect(perm).toBe(false);expect(c).toBe('42501');
});
it('REV-NOV-002 / #70: prévia antiga devolve comparação, preserva preço posterior',async()=>{
 const a=await sessao(ids.administrador),d=await sessao(ids.dono);
 const linha={numero:2,sku:'ACE-0001',nome:'Capa de proteção',produto:'Capa de proteção',tipo:'acessorio',categoria:'Acessórios',preco:9000};
 const p=await rpc<{id:string}>(a,"select public.importacao_catalogo_previa($1,'ficticio.csv',$2,'{}'::jsonb,$3::jsonb) as v",[ids.organizacao,'a'.repeat(64),JSON.stringify([linha])]);
 await rpc(d,"select public.preco_definir($1,null,'loja',12000,null,'Ajuste apos previa') as v",[cat.capa]);
 const r=await rpc<{atualizada:boolean}>(d,"select public.importacao_aplicar($1,'Conferencia de auditoria',1) as v",[p.id]);
 const atual=(await db.query('select valor_centavos from public.precos where variante_id=$1 and unidade_id is null and fim is null',[cat.capa])).rows;
 log('REV-NOV-002',{resultado:r,precos:atual});expect(r.atualizada).toBe(true);expect(atual).toEqual([{valor_centavos:12000}]);
});
it('REV-NOV-004 / #71: IMEI estornado pode entrar na loja correta sem duplicar identidade',async()=>{
 const d=await sessao(ids.dono);const imei=comDigitoLuhn('35209900199991');
 const payload=JSON.stringify([{variante:cat.aparelho,identificadores:[imei]}]);
 const e=await rpc<{id:string}>(d,entrada,[ids.lojaA,payload,'audit:dir:imei1']);
 await rpc(d,"select public.estoque_estornar_entrada($1,'Correcao de loja') as v",[e.id]);
 const r=await rpc(d,entrada,[ids.lojaB,payload,'audit:dir:imei2']);
 const atual=(await db.query('select situacao,em_estoque,unidade_id from public.itens_serializados where imei=$1',[imei])).rows;
 log('REV-NOV-004',{resultado:r,itens:atual});expect(atual).toEqual([{situacao:'disponivel',em_estoque:true,unidade_id:ids.lojaB}]);
});
it('REV-NOV-005 / #72: produto inativo não recebe entrada',async()=>{
 const d=await sessao(ids.dono);
 await db.exec("select set_config('ora.motivo','Inativacao de auditoria',true)");
 await db.query('update public.produtos set ativo=false where id=$1',[cat.produtoCapa]);
 const c=await codigo(d,entrada,[ids.lojaA,JSON.stringify([{variante:cat.capa,quantidade:2}]),'audit:dir:inativo']);
 log('REV-NOV-005',{codigo:c});expect(c).not.toBeNull();
 const saldo=(await db.query('select quantidade from public.estoque_saldos where unidade_id=$1 and variante_id=$2',[ids.lojaA,cat.capa])).rows;
 expect(saldo).toEqual([{quantidade:10}]);
});
it('REV-DIR-001: quem contou consegue aprovar o próprio ajuste se outra pessoa abriu e enviou',async()=>{
 const g=await sessao(ids.gerenteB,ids.lojaB),d=await sessao(ids.dono,ids.lojaB);
 const i=await rpc<{id:string}>(g,abrir,[ids.lojaB,[cat.capa],'audit:dir:aprovacao']);
 await rpc(d,contar,[i.id,cat.capa,2,null]);
 await rpc(g,enviar,[i.id]);
 const r=await rpc<{situacao:string}>(d,decidir,[i.id]);
 const trilha=(await db.query('select i.criado_por,i.enviado_por,i.decidido_por,x.contado_por,x.ajuste_quantidade from public.inventarios i join public.inventario_itens x on x.inventario_id=i.id where i.id=$1',[i.id])).rows[0];
 log('REV-DIR-001',{resultado:r,trilha});expect(r.situacao).toBe('aprovado');expect(trilha?.contado_por).toBe(trilha?.decidido_por);expect(trilha?.ajuste_quantidade).toBe(-1);
});
it('REV-DIR-002: dois IMEIs do mesmo aparelho inflam a quantidade contada',async()=>{
 const g=await sessao(ids.gerenteB,ids.lojaB);
 const a=comDigitoLuhn('35209900199981'),b=comDigitoLuhn('35209900199982');
 await db.query("select privado.registrar_item_serializado($1,$2,$3,$4,null,'entrada_importacao','audit:dir:dual')",[ids.lojaB,cat.aparelho,a,b]);
 const antigo=(await db.query<{imei:string}>('select imei from public.itens_serializados where id=$1',[itens.b1])).rows[0]!.imei;
 const i=await rpc<{id:string}>(g,abrir,[ids.lojaB,[cat.aparelho],'audit:dir:dual-inventario']);
 const r=await rpc<{sistema:number;contado:number}>(g,contar,[i.id,cat.aparelho,null,[antigo,a,b]]);
 log('REV-DIR-002',{resultado:r,aparelhos:2,identificadores:3});expect(r).toEqual({sistema:2,contado:3});
});
