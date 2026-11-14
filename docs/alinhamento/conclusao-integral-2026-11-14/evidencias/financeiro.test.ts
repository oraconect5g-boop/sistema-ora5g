// Revisão independente 46638ee. Banco descartável e dados fictícios. Não acessa serviços reais.
// Assertions observacionais: passar reproduz o problema; não é aceite do comportamento.
import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
import {appendFileSync,writeFileSync} from 'node:fs';
import type {PGlite} from '@electric-sql/pglite';
import {criarBanco,comoUsuario,type Sessao} from '../../../../packages/banco/src/banco-de-teste';
import {ids,montarCenario} from '../../../../packages/banco/src/cenario';
import {cat,itens,montarCatalogo} from '../../../../packages/banco/src/cenario-catalogo';
let db:PGlite,n=0;
const chave=()=>`audit:1311:${++n}`;
const log=(id:string,prova:unknown)=>appendFileSync(new URL('resultados-financeiro.jsonl',import.meta.url),JSON.stringify({id,prova})+'\n');
beforeAll(async()=>{
 db=await criarBanco();await montarCenario(db);await montarCatalogo(db);
 const funcoes=(await db.query("select n.nspname as esquema,p.proname as nome,p.oid::regprocedure::text as assinatura,p.prosecdef as security_definer,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,has_function_privilege('anon',p.oid,'EXECUTE') as anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','privado') order by 1,2,3")).rows;
 const tabelas=(await db.query("select n.nspname as esquema,c.relname as nome,c.relrowsecurity as rls,has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,has_table_privilege('anon',c.oid,'SELECT') as anon_select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','privado') and c.relkind='r' order by 1,2")).rows;
 writeFileSync(new URL('schema-local.json',import.meta.url),JSON.stringify({base:'dd31e91',migrations:53,ambiente:'PGlite descartável, não é o Supabase remoto',funcoes,tabelas},null,2)+'\n');
});
afterAll(async()=>{await db.close();});
beforeEach(async()=>{await db.exec('begin');});
afterEach(async()=>{await db.exec('rollback');});
async function sessao(usuario:string):Promise<Sessao>{const s={usuario,sessao:`8d000000-0000-4000-8000-${String(++n).padStart(12,'0')}`};await comoUsuario(db,s,()=>db.query('select public.selecionar_unidade($1)',[ids.lojaA]));return s;}
const rpc=async<T>(s:Sessao,sql:string,p:unknown[]=[])=>comoUsuario(db,s,async()=>(await db.query<{v:T}>(sql,p)).rows[0]!.v);
async function vender(s:Sessao,financiada=false){
 await rpc(s,'select public.abrir_caixa(50000,$1) as v',[chave()]);
 const venda=await rpc<string>(s,'select public.criar_venda($1) as v',[chave()]);
 const item=await rpc<string>(s,'select public.adicionar_item($1,$2,$3,1,$4) as v',[venda,financiada?cat.aparelho:cat.capa,financiada?itens.a1:null,chave()]);
 const pagamento=financiada?{meio:'payjoy',valor:149900,entrada:20000,meio_entrada:'dinheiro'}:{meio:'pix_direto',valor:7900,comprovante:'E2E-FICTICIO-AUDITORIA'};
 await rpc(s,'select public.concluir_venda($1,$2::jsonb,$3::jsonb,$4) as v',[venda,JSON.stringify([pagamento]),JSON.stringify(financiada?{nome:'Cliente ficticio',email:'ficticio@teste.invalid'}:{}),chave()]);
 return {venda,item};
}
it('REV-PLAN-001: previsão deduz devolução Pix ainda pendente como dinheiro já pago',async()=>{
 const v=await sessao(ids.vendedorA),d=await sessao(ids.dono);const venda=await vender(v);
 await rpc(d,'select public.devolver_itens($1,$2::jsonb,$3::jsonb,$4,$5) as v',[venda.venda,JSON.stringify([{item:venda.item,quantidade:1,condicao:'novo'}]),JSON.stringify([{meio:'pix_direto',valor:7900}]),'Devolucao de auditoria',chave()]);
 // Data fictícia no passado, como nos testes do projeto, exclusivamente no banco descartável.
 await db.exec('set session_replication_role = replica');
 await db.query("update public.venda_devolucoes set criado_em=((now() at time zone 'America/Sao_Paulo')::date-2+time '12:00') at time zone 'America/Sao_Paulo' where venda_id=$1",[venda.venda]);
 await db.exec('set session_replication_role = origin');
 const externo=(await db.query('select situacao,confirmado_em,valor_centavos from public.estornos_externos where venda_id=$1',[venda.venda])).rows;
 const p=await rpc<{base:{devolvido:number}[]}>(d,'select public.previsao_de_caixa(8,null) as v');
 const devolvido=p.base.reduce((s,x)=>s+Number(x.devolvido),0);
 log('REV-PLAN-001',{externo,devolvido_na_base:devolvido});
 expect(externo).toMatchObject([{situacao:'pendente',confirmado_em:null,valor_centavos:7900}]);expect(devolvido).toBe(7900);
});
it('REV-PLAN-002: desfazer repasse após cancelar a venda reabre crédito e permite novo recebimento',async()=>{
 const v=await sessao(ids.vendedorA),d=await sessao(ids.dono);const venda=await vender(v,true);
 const conta=(await db.query<{id:string}>('select id from public.contas_a_receber where venda_id=$1',[venda.venda])).rows[0]!.id;
 const hoje=(await db.query<{v:string}>("select (now() at time zone 'America/Sao_Paulo')::date::text as v")).rows[0]!.v;
 await rpc(d,"select public.financeira_receber($1,'REPASSE-FICTICIO',125000,$2::date) as v",[conta,hoje]);
 await rpc(d,'select public.abrir_caixa(50000,$1) as v',[chave()]);
 await rpc(d,"select public.cancelar_venda($1,'Cancelamento de auditoria') as v",[venda.venda]);
 const desfazer=await rpc(d,"select public.financeira_desfazer_recebimento($1,'Corrigir referencia do repasse') as v",[conta]);
 const estado=(await db.query('select v.situacao as venda,c.situacao as conta,c.valor_centavos from public.vendas v join public.contas_a_receber c on c.venda_id=v.id where c.id=$1',[conta])).rows[0];
 const novo=await rpc(d,"select public.financeira_receber($1,'REPASSE-FICTICIO-2',124000,$2::date) as v",[conta,hoje]);
 log('REV-PLAN-002',{desfazer,estado,novo_recebimento:novo});
 expect(estado).toMatchObject({venda:'cancelada',conta:'aberta'});expect(novo).toBe(true);
});
it('CFG-001: banco com 39 migrations não tem as RPCs usadas pela interface atual',async()=>{
 const antigo=await criarBanco({ate:'20261113065706_margem_painel.sql'});
 try{
  const estado=(await antigo.query("select to_regprocedure('public.vendas_painel(timestamptz,timestamptz,uuid,boolean,uuid)')::text as painel,to_regprocedure('public.previsao_de_caixa(integer,uuid)')::text as previsao,to_regprocedure('public.conta_pagar_lancar(jsonb,text)')::text as contas")).rows[0];
  let codigo='';try{await antigo.query('select public.previsao_de_caixa(8,null)');}catch(e){codigo=(e as {code:string}).code;}
  log('CFG-001',{migrations:39,estado,codigo});expect(estado.painel).not.toBeNull();expect(estado).toMatchObject({previsao:null,contas:null});expect(codigo).toBe('42883');
 }finally{await antigo.close();}
});
