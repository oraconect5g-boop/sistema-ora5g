// Limite do servidor simulado: não afirma o max_rows configurado no projeto remoto.
import {it,expect} from 'vitest';
import {appendFileSync} from 'node:fs';
import {consultarContas,LIMITE_DA_EXPORTACAO_DAS_CONTAS} from '../../../../apps/plataforma/src/lib/contas-a-pagar/consulta';
it('REV-PLAN-003: exportação perde linhas sem aviso quando max_rows é menor que o limite pedido',async()=>{
 const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
 const todas=Array.from({length:1001},(_,n)=>({id:id(n+1),unidade_id:null,categoria_id:id(10000),fornecedor_id:null,descricao:`Conta ficticia ${n}`,documento:null,valor_centavos:100,vencimento:'2026-11-13',forma:'unica',parcela:1,parcelas:1,situacao:'aberta',paga_em:null,valor_pago_centavos:null,referencia_pagamento:null,cancelada_em:null,motivo_cancelamento:null}));
 const pedidos:number[]=[];let chamadas=0;
 class Consulta {
  linhas=todas;
  select(){return this;}eq(){return this;}order(){return this;}
  limit(n:number){pedidos.push(n);this.linhas=this.linhas.slice(0,Math.min(n,1000));return this;}
  then(resolve:(r:unknown)=>unknown){return Promise.resolve({data:this.linhas,error:null}).then(resolve);}
 }
 const supabase={from:()=>{chamadas++;return new Consulta();}};
 const r=await consultarContas(supabase as unknown as Parameters<typeof consultarContas>[0],'abertas',{tipo:'todas'},'2026-11-13',LIMITE_DA_EXPORTACAO_DAS_CONTAS);
 const prova={existentes:todas.length,cap_servidor_simulado:1000,pedidos,chamadas,estado:r.estado,...(r.estado==='ok'?{exportadas:r.dados.contas.length,mais:r.dados.mais}:{})};
 appendFileSync(new URL('resultados-exportacao.jsonl',import.meta.url),JSON.stringify(prova)+'\n');
 expect(prova).toMatchObject({existentes:1001,exportadas:1000,mais:false,chamadas:1,pedidos:[5001]});
});
