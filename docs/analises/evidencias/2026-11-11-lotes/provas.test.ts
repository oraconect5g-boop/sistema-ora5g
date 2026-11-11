// Provas independentes do Codex. Dados fictícios; banco descartável; nenhum acesso remoto.
// Estes testes registram o comportamento atual. Não são aceite do comportamento defeituoso.
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import { appendFileSync } from "node:fs";
import { criarBanco, comoUsuario, comDigitoLuhn, type Sessao } from "../../../../packages/banco/src/banco-de-teste";
import { ids, montarCenario } from "../../../../packages/banco/src/cenario";
import { cat, montarCatalogo } from "../../../../packages/banco/src/cenario-catalogo";

let db: PGlite;
let n = 0;
function registrar(id:string,dados:string) {
  appendFileSync(new URL('resultados-provas.jsonl',import.meta.url),JSON.stringify({id,...JSON.parse(dados)})+'\n');
}
beforeAll(async () => { db = await criarBanco(); await montarCenario(db); await montarCatalogo(db); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
async function sessao(usuario: string, unidade = ids.lojaA): Promise<Sessao> {
  const s = { usuario, sessao: `7c000000-0000-4000-8000-${String(++n).padStart(12,"0")}` };
  await comoUsuario(db,s,()=>db.query("select public.selecionar_unidade($1)",[unidade]));
  return s;
}
async function rpc<T>(s:Sessao,sql:string,params:unknown[]):Promise<T> {
  return comoUsuario(db,s,async()=> (await db.query<{v:T}>(sql,params)).rows[0]!.v);
}
const PREVIA = "select public.importacao_catalogo_previa($1, 'ficticio.csv', $2, '{}'::jsonb, $3::jsonb) as v";
const APLICAR = "select public.importacao_aplicar($1, 'Aprovacao de teste') as v";

it("REV-NOV-001: vendedor sem custo.ver lê custos das novas entradas",async()=>{
  const dono=await sessao(ids.dono);const vendedor=await sessao(ids.vendedorA);
  const e=await rpc<{id:string}>(dono,"select public.estoque_registrar_entrada($1,'carga_inicial',null,null,$2::jsonb,'auditoria:custo:001','Prova de acesso') as v",[ids.lojaA,JSON.stringify([{variante:cat.capa,quantidade:2,custo:1234}])]);
  const acesso=await rpc<boolean>(vendedor,"select public.tem_permissao('custo.ver',$1) as v",[ids.lojaA]);
  const leak=await comoUsuario(db,vendedor,()=>db.query("select e.total_custo_centavos,i.custo_unitario_centavos from public.entradas_estoque e join public.entrada_itens i on i.entrada_id=e.id where e.id=$1",[e.id]));
  registrar("REV-NOV-001",JSON.stringify({custo_ver:acesso,linhas:leak.rows}));
  expect(acesso).toBe(false);expect(leak.rows).toEqual([{total_custo_centavos:2468,custo_unitario_centavos:1234}]);
});

it("REV-NOV-002: aplicar prévia antiga sobrescreve alteração posterior sem nova aprovação",async()=>{
  const admin=await sessao(ids.administrador);const dono=await sessao(ids.dono);
  const linha={numero:2,sku:'ACE-0001',nome:'Capa importada',produto:'Capa de proteção',tipo:'acessorio',categoria:'Acessórios',preco:9000};
  const imp=await rpc<{id:string}>(admin,PREVIA,[ids.organizacao,'a'.repeat(64),JSON.stringify([linha])]);
  await rpc(dono,"select public.preco_definir($1,null,'loja',12000,null,'Ajuste apos previa') as v",[cat.capa]);
  const antes=(await db.query("select valor_centavos from public.precos where variante_id=$1 and unidade_id is null and fim is null",[cat.capa])).rows;
  await rpc(dono,APLICAR,[imp.id]);
  const depois=(await db.query("select valor_centavos from public.precos where variante_id=$1 and unidade_id is null and fim is null",[cat.capa])).rows;
  registrar("REV-NOV-002",JSON.stringify({antes,depois}));
  expect(antes).toEqual([{valor_centavos:12000}]);expect(depois).toEqual([{valor_centavos:9000}]);
});

it("REV-NOV-003: desfazer inativa variante criada mesmo com edição posterior",async()=>{
  const admin=await sessao(ids.administrador);const dono=await sessao(ids.dono);
  const linha={numero:2,sku:'AUD-NOVO-01',nome:'Produto importado',produto:'Modelo de auditoria',tipo:'acessorio',categoria:'Acessórios',preco:9000};
  const imp=await rpc<{id:string}>(admin,PREVIA,[ids.organizacao,'b'.repeat(64),JSON.stringify([linha])]);
  await rpc(dono,APLICAR,[imp.id]);
  const variante=(await db.query<{id:string}>("select id from public.variantes where sku='AUD-NOVO-01'")).rows[0]!.id;
  await db.exec("select set_config('ora.motivo','Edicao posterior de teste',true)");
  await db.query("update public.variantes set nome='Nome revisado depois da importacao' where id=$1",[variante]);
  await rpc(dono,"select public.importacao_desfazer($1,'Desfazer de teste') as v",[imp.id]);
  const atual=(await db.query("select nome,ativa from public.variantes where id=$1",[variante])).rows[0];
  registrar("REV-NOV-003",JSON.stringify(atual));
  expect(atual).toEqual({nome:'Nome revisado depois da importacao',ativa:false});
});

it("REV-NOV-004: estornar IMEI lançado na loja errada impede a entrada correta",async()=>{
  const dono=await sessao(ids.dono);
  const imei=comDigitoLuhn('35209900199991');
  const itens=JSON.stringify([{variante:cat.aparelho,identificadores:[imei]}]);
  const e=await rpc<{id:string}>(dono,"select public.estoque_registrar_entrada($1,'carga_inicial',null,null,$2::jsonb,'auditoria:imei:001','Loja errada de teste') as v",[ids.lojaA,itens]);
  await rpc(dono,"select public.estoque_estornar_entrada($1,'Correcao de loja') as v",[e.id]);
  const codigo=await comoUsuario(db,dono,async()=>{
    await db.exec('savepoint nova_entrada');
    let erro:string|undefined;
    try { await db.query("select public.estoque_registrar_entrada($1,'carga_inicial',null,null,$2::jsonb,'auditoria:imei:002','Loja correta de teste') as v",[ids.lojaB,itens]); }
    catch(e){erro=(e as {code:string}).code;await db.exec('rollback to savepoint nova_entrada');}
    await db.exec('release savepoint nova_entrada');
    return erro;
  });
  const estado=(await db.query('select situacao,em_estoque from public.itens_serializados where imei=$1',[imei])).rows[0];
  registrar('REV-NOV-004',JSON.stringify({codigo,estado}));
  expect(codigo).toBe('23505');expect(estado).toEqual({situacao:'baixado',em_estoque:false});
});

it("REV-NOV-005: entrada recebe variação de produto já inativado",async()=>{
  const dono=await sessao(ids.dono);
  const prod=await rpc<{id:string}>(dono,"select public.catalogo_salvar_produto($1,null,'acessorio','Produto isolado de teste',$2,null,null,null,false,null,'auditoria:produto:005','Criacao de teste') as v",[ids.organizacao,cat.acessorios]);
  const vari=await rpc<{id:string}>(dono,"select public.catalogo_salvar_variante($1,null,'AUD-INATIVO-01','Variante de teste',null,null,null,0,null,'Criacao de teste') as v",[prod.id]);
  await rpc(dono,"select public.catalogo_salvar_produto($1,$2,null,'Produto isolado de teste',$3,null,null,null,false,false,null,'Inativacao de teste') as v",[ids.organizacao,prod.id,cat.acessorios]);
  const e=await rpc<{id:string}>(dono,"select public.estoque_registrar_entrada($1,'carga_inicial',null,null,$2::jsonb,'auditoria:inativo:005','Prova de entrada') as v",[ids.lojaA,JSON.stringify([{variante:vari.id,quantidade:2}])]);
  const atual=(await db.query('select p.ativo,s.quantidade from public.produtos p join public.variantes v on v.produto_id=p.id join public.estoque_saldos s on s.variante_id=v.id where p.id=$1',[prod.id])).rows[0];
  registrar('REV-NOV-005',JSON.stringify({entrada:e.id,atual}));
  expect(atual).toEqual({ativo:false,quantidade:2});
});
