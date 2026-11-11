// Provas independentes em PostgreSQL 17 local e descartável. Somente fixtures.
import {beforeAll,afterAll,it,expect} from 'vitest';
import type pg from 'pg';
import {appendFileSync} from 'node:fs';
import {iniciarPostgresReal,executor,type PostgresReal} from '../../../../packages/banco/src/postgres-real';
import {ids,montarCenario} from '../../../../packages/banco/src/cenario';
import {cat,montarCatalogo} from '../../../../packages/banco/src/cenario-catalogo';
let server:PostgresReal;let admin:pg.Client;let a:pg.Client;let b:pg.Client;
let seq=0;
beforeAll(async()=>{server=await iniciarPostgresReal();admin=await server.conectar();a=await server.conectar();b=await server.conectar();await montarCenario(executor(admin));await montarCatalogo(executor(admin));},120000);
afterAll(async()=>{for(const c of [a,b,admin])await c?.end().catch(()=>{});await server?.parar();});
async function abrir(c:pg.Client,usuario:string){
  const sessao=`7d000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`;
  await admin.query('insert into auth.sessions (id,user_id) values ($1,$2)',[sessao,usuario]);
  await c.query('begin');await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:usuario,session_id:sessao,role:'authenticated'})]);await c.query('set local role authenticated');
  await c.query('select public.selecionar_unidade($1)',[ids.lojaA]);
  await c.query("set local statement_timeout='5s'");
}
const registrar=(id:string,dados:object)=>appendFileSync(new URL('resultados-concorrencia.jsonl',import.meta.url),JSON.stringify({id,...dados})+'\n');

it('REV-NOV-006: importador e cadastro simultâneos duplicam categoria por maiúsculas',async()=>{
  await abrir(admin,ids.administrador);
  const imp=(await admin.query<{v:{id:string}}>("select public.importacao_catalogo_previa($1,'race.csv',$2,'{}'::jsonb,$3::jsonb) as v",[ids.organizacao,'c'.repeat(64),JSON.stringify([{numero:2,sku:'AUD-RACE-01',nome:'Item concorrente',produto:'Modelo concorrente',tipo:'acessorio',categoria:'categoria concorrente',preco:1000}])])).rows[0]!.v.id;
  await admin.query('commit');
  await abrir(a,ids.administrador);await abrir(b,ids.dono);
  // A mantém a categoria e sua trava sem commit; B deveria usar a mesma trava/normalização.
  await a.query("select public.catalogo_salvar_categoria($1,null,'CATEGORIA CONCORRENTE',true,'Cadastro manual de teste')",[ids.organizacao]);
  await b.query("select public.importacao_aplicar($1,'Importacao simultanea de teste')",[imp]);
  await b.query('commit');await a.query('commit');
  const linhas=(await admin.query("select nome from public.categorias where organizacao_id=$1 and lower(nome)='categoria concorrente' order by nome",[ids.organizacao])).rows;
  registrar('REV-NOV-006',{linhas});expect(linhas).toHaveLength(2);
});

it('REV-NOV-007: desfazer importação substitui preço manual posterior que coincide com o importado',async()=>{
  await abrir(admin,ids.administrador);
  const imp=(await admin.query<{v:{id:string}}>("select public.importacao_catalogo_previa($1,'preco.csv',$2,'{}'::jsonb,$3::jsonb) as v",[ids.organizacao,'d'.repeat(64),JSON.stringify([{numero:2,sku:'ACE-0001',nome:'Capa de proteção',produto:'Capa de proteção',tipo:'acessorio',categoria:'Acessórios',preco:9000}])])).rows[0]!.v.id;
  await admin.query('commit');
  await abrir(a,ids.dono);await a.query("select public.importacao_aplicar($1,'Aprovacao de teste')",[imp]);await a.query('commit');
  await abrir(a,ids.dono);await a.query("select public.preco_definir($1,null,'loja',12000,null,'Primeiro ajuste manual')",[cat.capa]);await a.query('commit');
  await abrir(a,ids.dono);await a.query("select public.preco_definir($1,null,'loja',9000,null,'Segundo ajuste manual')",[cat.capa]);await a.query('commit');
  const antes=(await admin.query('select valor_centavos::int,origem from public.precos where variante_id=$1 and unidade_id is null and fim is null',[cat.capa])).rows;
  await abrir(a,ids.dono);await a.query("select public.importacao_desfazer($1,'Desfazer de teste')",[imp]);await a.query('commit');
  const depois=(await admin.query('select valor_centavos::int,origem from public.precos where variante_id=$1 and unidade_id is null and fim is null',[cat.capa])).rows;
  registrar('REV-NOV-007',{antes,depois});expect(antes).toEqual([{valor_centavos:9000,origem:'manual'}]);expect(depois).toEqual([{valor_centavos:7900,origem:'importacao'}]);
});
