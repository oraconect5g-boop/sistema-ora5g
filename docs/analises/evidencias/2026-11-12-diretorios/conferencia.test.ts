// Executa a página real com sessão/API simuladas, respeitando limit(500).
// A assertion registra o defeito; não representa aceite do resultado incorreto.
import { isValidElement } from 'react';
import { it,expect,vi } from 'vitest';
import { appendFileSync } from 'node:fs';
const c=vi.hoisted(()=>({limites:[] as number[]}));
vi.mock('next/headers',()=>({cookies:async()=>({getAll:()=>[],set:()=>undefined})}));
vi.mock('next/navigation',()=>({redirect:()=>{throw new Error('redirect');},usePathname:()=>'/estoque'}));
vi.mock('../../../../apps/plataforma/src/lib/acesso/sessao',()=>{
 const todos=Array.from({length:501},(_,n)=>({id:`item-${n}`,variante_id:'variante',imei:String(n),iccid:null,situacao:'disponivel',em_estoque:true,unidade_id:'loja',conferido_em:n<500?new Date().toISOString():null}));
 class Consulta {
  rows:Record<string,unknown>[];
  constructor(t:string){this.rows=t==='itens_serializados'?todos:[{id:'variante',sku:'FICTICIO',nome:'Aparelho de teste'}];}
  select(){return this;}eq(){return this;}order(){return this;}in(){return this;}
  limit(n:number){c.limites.push(n);this.rows=this.rows.slice(0,n);return this;}
  then(resolve:(x:unknown)=>unknown){return Promise.resolve({data:this.rows,error:null}).then(resolve);}
 }
 return {FalhaDoServico:class extends Error{},obterSessao:async()=>({usuario:{id:'gerente'},situacao:{unidade_id:'loja',unidade_nome:'Loja fictícia'},supabase:{from:(t:string)=>new Consulta(t),rpc:async()=>({data:true,error:null})}})};
});
import Estoque from '../../../../apps/plataforma/src/app/estoque/page';
function texto(v:unknown):string {
 if(Array.isArray(v))return v.map(texto).join(' ');
 if(typeof v==='string'||typeof v==='number')return String(v);
 if(isValidElement<Record<string,unknown>>(v))return Object.values(v.props).map(texto).join(' ');
 if(v&&typeof v==='object')return Object.values(v).map(texto).join(' ');
 return '';
}
it('REV-DIR-003: conferência anuncia tudo conferido embora o 501º item continue pendente',async()=>{
 const t=texto(await Estoque({searchParams:Promise.resolve({aba:'conferencia'})})).replace(/\s+/g,' ');
 const prova={itens_reais_ficticios:501,conferidos:500,pendentes_reais:1,limites:c.limites,anuncia_500_de_500:t.includes('500 de 500'),anuncia_tudo_conferido:t.includes('Tudo conferido'),anuncia_nenhum_pendente:t.includes('Nenhum pendente.')};
 appendFileSync(new URL('resultados-conferencia.jsonl',import.meta.url),JSON.stringify(prova)+'\n');
 expect(prova.anuncia_500_de_500).toBe(true);expect(prova.anuncia_tudo_conferido).toBe(true);expect(prova.anuncia_nenhum_pendente).toBe(true);
});
