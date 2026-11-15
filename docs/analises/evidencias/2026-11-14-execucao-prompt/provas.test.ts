// Revisão f55856e. Apenas banco descartável, todas as migrations e dados fictícios.
// Os testes observam defeitos: passar comprova a reprodução, não o aceite.
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { criarBanco, comoUsuario, cpf, type Sessao } from '../../../../packages/banco/src/banco-de-teste';
import { ids, montarCenario } from '../../../../packages/banco/src/cenario';
import { cat, montarCatalogo } from '../../../../packages/banco/src/cenario-catalogo';
let db:PGlite,n=0;
const chave=()=>`audit:prompt:${++n}`;
const log=(id:string,prova:unknown)=>appendFileSync(new URL('resultados.jsonl',import.meta.url),JSON.stringify({id,prova})+'\n');
beforeAll(async()=>{db=await criarBanco();await montarCenario(db);await montarCatalogo(db);});
afterAll(async()=>{await db.close();});
beforeEach(async()=>{await db.exec('begin');});
afterEach(async()=>{await db.exec('rollback');});
async function sessao(usuario:string):Promise<Sessao>{const s={usuario,sessao:`8e000000-0000-4000-8000-${String(++n).padStart(12,'0')}`};await comoUsuario(db,s,()=>db.query('select public.selecionar_unidade($1)',[ids.lojaA]));return s;}
const rpc=async<T>(s:Sessao,sql:string,p:unknown[]=[])=>comoUsuario(db,s,async()=>(await db.query<{v:T}>(sql,p)).rows[0]!.v);
const endereco={cep:'80000000',logradouro:'Rua Ficticia',numero:'10',bairro:'Centro',cidade:'Curitiba',uf:'PR'};
async function cliente(s:Sessao,nome:string,numero:number){return (await rpc<{id:string}>(s,'select public.cliente_salvar(null,$1::jsonb,null,$2) as v',[JSON.stringify({tipo:'pessoa_fisica',nome,telefone:`4198700${String(numero).padStart(4,'0')}`,documento:cpf(String(529982200+numero)),finalidades:['nota_fiscal'],endereco}),chave()])).id;}
async function preparar(){
 const ana=await sessao(ids.vendedorA),dono=await sessao(ids.dono);
 const a=await cliente(ana,'Cliente Alfa',1);
 await rpc(ana,'select public.abrir_caixa(10000,$1) as v',[chave()]);
 const venda=await rpc<string>(ana,'select public.criar_venda($1) as v',[chave()]);
 await rpc(ana,'select public.adicionar_item($1,$2,null,1,$3) as v',[venda,cat.capa,chave()]);
 await rpc(ana,'select public.concluir_venda($1,$2::jsonb,$3::jsonb,$4) as v',[venda,JSON.stringify([{meio:'dinheiro',valor:7900}]),JSON.stringify({id:a}),chave()]);
 const pedido=await rpc<string>(ana,'select public.notas_solicitar($1,$2::jsonb,$3) as v',[venda,JSON.stringify({cliente:a}),chave()]);
 return {ana,dono,a,venda,pedido};
}
it('REV-PROMPT-001: corrigir a nota elimina endereço, cliente e versão do destinatário',async()=>{
 const {ana,dono,a,pedido}=await preparar();
 const antes=(await db.query<{cliente_id:string;endereco:unknown;dados_de:unknown}>('select cliente_id,endereco,dados_de from privado.notas_destinatarios where pedido_id=$1',[pedido])).rows[0]!;
 expect(antes.cliente_id).toBe(a);expect(antes.endereco).toEqual(endereco);expect(antes.dados_de).not.toBeNull();
 await rpc(dono,"select public.notas_decidir($1,false,'Conferir dados antes de emitir') as v",[pedido]);
 await rpc(ana,'select public.notas_corrigir($1,$2::jsonb) as v',[pedido,JSON.stringify({nome:'Cliente Alfa',documento:cpf('529982201')})]);
 const depois=await rpc<Record<string,unknown>>(dono,'select public.notas_dados_para_emitir($1) as v',[pedido]);
 log('REV-PROMPT-001',{antes:{cliente_presente:true,endereco_presente:true,versao_presente:true},depois:{cliente:depois.cliente,endereco:depois.endereco,dados_de:depois.dados_de,documento_presente:!!depois.documento}});
 expect(depois).toMatchObject({cliente:null,endereco:null,dados_de:null});expect(depois.documento).toBeTruthy();
});
function chaveDeAcesso(cnpj:string){const base=`432611${cnpj}65001000000001112345678`;let soma=0,peso=2;for(let i=base.length-1;i>=0;i--){soma+=Number(base[i])*peso;peso=peso===9?2:peso+1;}const r=soma%11;return base+String(r<2?0:11-r);}
it('REV-PROMPT-002: trocar o cliente da venda direciona o PDF fiscal antigo ao novo cliente',async()=>{
 const {ana,dono,a,venda,pedido}=await preparar();
 const cnpj=(await db.query<{cnpj:string}>('select cnpj from public.unidades where id=$1',[ids.lojaA])).rows[0]!.cnpj;
 await rpc(dono,'select public.notas_registrar_emissao($1,$2,null) as v',[pedido,chaveDeAcesso(cnpj)]);
 const caminho=`${ids.organizacao}/${ids.lojaA}/${pedido}/00000000-0000-4000-a000-000000000001.pdf`;
 await comoUsuario(db,dono,()=>db.query("insert into storage.objects(bucket_id,name,metadata) values ('notas',$1,$2::jsonb)",[caminho,JSON.stringify({size:50000,mimetype:'application/pdf'})]));
 await rpc(dono,"select public.notas_anexar_documento($1,'pdf',$2,$3,null) as v",[pedido,caminho,'c'.repeat(64)]);
 const b=await cliente(ana,'Cliente Beta',2);
 expect(await rpc(ana,"select public.venda_vincular_cliente($1,$2,'Revisao do vinculo comercial') as v",[venda,b])).toBe(true);
 const envio=await rpc<string>(ana,'select public.nota_enviar_whatsapp($1,$2,null) as v',[pedido,chave()]);
 const r=(await db.query<{destinatario_nome:string;cliente_id:string;telefone:string}>('select p.destinatario_nome,e.cliente_id,d.telefone from public.whatsapp_envios e join public.notas_pedidos p on p.id=e.pedido_id join privado.whatsapp_destinos d on d.envio_id=e.id where e.id=$1',[envio])).rows[0]!;
 log('REV-PROMPT-002',{nota_do_cliente_original:r.destinatario_nome==='Cliente Alfa',destino_e_outro_cliente:r.cliente_id===b,telefone_corresponde_ao_novo:r.telefone==='41987000002',envio_externo:false});
 expect(r.destinatario_nome).toBe('Cliente Alfa');expect(r.cliente_id).toBe(b);expect(r.cliente_id).not.toBe(a);expect(r.telefone).toBe('41987000002');
});
