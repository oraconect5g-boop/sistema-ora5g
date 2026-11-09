// Copiar para packages/banco/src/revisao-nogle-extra.test.ts; somente dados fictícios.
import type {PGlite} from '@electric-sql/pglite';
import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import {interpretarConsulta,type OperacaoParaConsultar} from '../../dominio/src/nogle';
import {criarBanco,comoUsuario,type Sessao} from './banco-de-teste';
import {ids,montarCenario} from './cenario';
import {cat,montarCatalogo} from './cenario-catalogo';
let db:PGlite;let n=0;const key=()=>`auditoria-nogle:${++n}`;
const usuario=async(id=ids.vendedorA):Promise<Sessao>=>{const s={usuario:id,sessao:`84000000-0000-4000-8000-${String(++n).padStart(12,'0')}`};await comoUsuario(db,s,()=>db.query('select public.selecionar_unidade($1)',[ids.lojaA]));return s;};
const valor=<T>(s:Sessao,sql:string,p:unknown[]=[])=>comoUsuario(db,s,async()=>(await db.query<{v:T}>(sql,p)).rows[0]?.v as T);
const servico=async<T>(acao:()=>Promise<T>)=>{await db.exec('set role service_role');try{return await acao();}finally{await db.exec('reset role');}};
const rpcServico=<T>(sql:string,p:unknown[]=[])=>servico(async()=>(await db.query<{v:T}>(sql,p)).rows[0]?.v as T);
const registrar=(s:Sessao,p:object,k=key(),tipo='recarga')=>valor<string>(s,'select public.connect_registrar($1,$2::jsonb,$3) as v',[tipo,JSON.stringify(p),k]);
const cadastro='2026-11-09 09:00:00';
const cliente={nome:'Cliente Ficticio',cpf:'12345678909',data_nascimento:'1990-05-20',email:'cliente@teste.invalid',telefone:'51999990000',endereco:{rua:'Rua Ficticia',numero:'1',bairro:'Centro',cep:'90000000',id_cidade:7703}};
beforeAll(async()=>{db=await criarBanco();await montarCenario(db);await montarCatalogo(db);});
beforeEach(async()=>{
 await db.exec('begin');
 for(const [tipo,itens] of Object.entries({plano:[{codigo:'99999',nome:'Plano ficticio',valor_centavos:4490}],ddd:[{codigo:'51',nome:'51',uf:'RS'}],cidade:[{codigo:'7703',nome:'Cidade ficticia',uf:'RS'}]}))await rpcServico('select public.connect_worker_atualizar_referencias($1,$2,$3::jsonb) as v',[ids.organizacao,tipo,JSON.stringify(itens)]);
 const admin=await usuario(ids.administrador);for(const tipo of ['ativacao','recarga'])await valor(admin,'select public.connect_habilitar($1,true,$2) as v',[tipo,'Homologacao ficticia local']);
});
afterEach(async()=>{await db.exec('rollback');});afterAll(async()=>{await db.close();});
async function codigo(acao:()=>Promise<unknown>){await db.exec('savepoint tentativa');let c:string|null=null;try{await acao();}catch(e){c=(e as {code:string}).code;await db.exec('rollback to savepoint tentativa');}await db.exec('release savepoint tentativa');return c;}
async function pago(s:Sessao){
 await db.query("insert into public.precos(organizacao_id,variante_id,valor_centavos,inicio,origem) values($1,$2,4490,now()-interval '1 day','manual')",[ids.organizacao,cat.recarga]);
 await valor(s,'select public.abrir_caixa(0,$1) as v',[key()]);const venda=await valor<string>(s,'select public.criar_venda($1) as v',[key()]);
 const item=await valor<string>(s,'select public.adicionar_item($1,$2,null,1,$3) as v',[venda,cat.recarga,key()]);
 await valor(s,'select public.concluir_venda($1,$2::jsonb,$3::jsonb,$4) as v',[venda,JSON.stringify([{meio:'dinheiro',valor:4490}]),'{}',key()]);return item;
}
async function aceitar(id:string,externo:string){
 await rpcServico('select count(*) as v from public.connect_worker_reivindicar_envios($1,ARRAY[\'ativacao\',\'recarga\'],5)',[ids.organizacao]);
 return rpcServico('select public.connect_worker_registrar_envio($1,$2::jsonb) as v',[id,JSON.stringify({resultado:'aceita',id_externo:externo,data_cadastro:cadastro})]);
}
it('controle: confirmação repetida não duplica produção da mesma operação',async()=>{
 const s=await usuario();const id=await registrar(s,{metodo:'LINK',linha:'51999990000',plano:99999});await aceitar(id,'ficticio-1');
 for(let i=0;i<2;i++)await rpcServico('select public.connect_worker_registrar_consulta($1,$2::jsonb) as v',[id,JSON.stringify({evidencia:'confirmada',mensagem:'Evidencia ficticia'})]);
 expect((await db.query('select id from public.connect_producao where operacao_id=$1',[id])).rows).toHaveLength(1);
});
it('mesma chave de ativação com cliente alterado recusa em vez de aceitar payload antigo',async()=>{
 const s=await usuario();const p={metodo:'LINK',esim:true,ddd:51,plano:99999,cliente};const k=key();await registrar(s,p,k,'ativacao');
 const erro=await codigo(()=>registrar(s,{...p,cliente:{...cliente,nome:'Outra Pessoa Ficticia'}},k,'ativacao'));
 process.stdout.write(`EVIDENCIA cliente_alterado codigo=${erro}\n`);expect(erro).toBe('OR004');
});
it('LINK não cobra de novo serviço já pago no caixa',async()=>{
 const s=await usuario();const item=await pago(s);const erro=await codigo(()=>registrar(s,{metodo:'LINK',linha:'51999990000',plano:99999,venda_item:item}));
 process.stdout.write(`EVIDENCIA link_servico_pago codigo=${erro}\n`);expect(erro).toBe('22023');
});
it('vendedor sem custo.ver não lê o custo debitado da carteira',async()=>{
 const s=await usuario();const item=await pago(s);const id=await registrar(s,{metodo:'SALDO',linha:'51999990000',plano:99999,venda_item:item});await aceitar(id,'ficticio-saldo');
 await rpcServico('select public.connect_worker_registrar_consulta($1,$2::jsonb) as v',[id,JSON.stringify({evidencia:'confirmada',mensagem:'Evidencia ficticia',valor_debitado_centavos:3592})]);
 expect(await valor<boolean>(s,"select public.tem_permissao('custo.ver',$1) as v",[ids.lojaA])).toBe(false);
 let rows:unknown[]=[];const erro=await comoUsuario(db,s,()=>codigo(async()=>{rows=(await db.query('select valor_debitado_centavos from public.connect_operacoes where id=$1',[id])).rows;}));
 process.stdout.write(`EVIDENCIA custo_vendedor codigo=${erro} linhas=${rows.length}\n`);expect(erro==='42501'||rows.length===0).toBe(true);
});
it('uma evidência de recarga não confirma duas operações com a mesma data de cadastro',async()=>{
 const s=await usuario();const ops:string[]=[];
 for(let i=0;i<2;i++){const id=await registrar(s,{metodo:'LINK',linha:'51999990000',plano:99999});ops.push(id);await aceitar(id,`ficticio-${i}`);}
 const historico={retorno:true,historico:[{data_cadastro:cadastro,data_recarga:'2026-11-09 09:05:00',plano:'Plano ficticio',valor_pago:'35.92'}]};
 for(let i=0;i<ops.length;i++){
  const op:OperacaoParaConsultar={operacao_id:ops[i]!,tipo:'recarga',situacao:'aguardando_operadora',linha:'51999990000',linha_doadora:null,iccid:null,id_externo:`ficticio-${i}`,data_cadastro_externa:cadastro,metodo_pagamento:'LINK'};
  const e=interpretarConsulta(op,200,historico);await rpcServico('select public.connect_worker_registrar_consulta($1,$2::jsonb) as v',[op.operacao_id,JSON.stringify(e)]);
 }
 const contagem=(await db.query<{n:number}>('select count(*)::int as n from public.connect_producao')).rows[0]?.n;
 process.stdout.write(`EVIDENCIA recarga_data_igual producoes=${contagem} eventos_oficiais=1\n`);expect(contagem).toBeLessThanOrEqual(1);
});
