import { isValidElement } from "react";
import { expect,it,vi } from "vitest";
import Catalogo from "./page";
vi.mock("../../lib/acesso/sessao",()=>({
 obterSessao:async()=>{
  const produtos=Array.from({length:201},(_,i)=>({id:"p"+i,nome:i===200?"ZZ Produto alvo":"Produto "+String(i+1).padStart(3,"0"),tipo:"acessorio",organizacao_id:"org"}));
  const tabelas:Record<string,Record<string,unknown>[]>={produtos,variantes:produtos.map((p,i)=>({id:"v"+i,produto_id:p.id,sku:i===200?"ALVO-201":"SKU-"+(i+1),nome:p.nome,cor:null})),fotos_produto:[],estoque_saldos:[]};
  class Consulta {
   rows:Record<string,unknown>[];
   constructor(nome:string){this.rows=tabelas[nome]??[];}
   select(){return this;}eq(){return this;}order(){return this;}is(){return this;}
   limit(n:number){this.rows=this.rows.slice(0,n);return this;}
   then(resolve:(r:{data:Record<string,unknown>[];error:null})=>unknown){return Promise.resolve({data:this.rows,error:null}).then(resolve);}
  }
  return {situacao:{unidade_id:"loja",unidade_nome:"Loja de teste"},supabase:{from:(nome:string)=>new Consulta(nome),rpc:async(nome:string)=>({data:nome==="tem_permissao"?false:[],error:null}),storage:{from:()=>({createSignedUrls:async()=>({data:[],error:null})})}}};
}}));
function texto(v:unknown):string {
 if(Array.isArray(v))return v.map(texto).join(" ");
 if(typeof v==="string"||typeof v==="number")return String(v);
 if(isValidElement<{children?:unknown}>(v))return texto(v.props.children);
 return "";
}
it("busca encontra produto dentro das primeiras 200 linhas",async()=>{
 const tela=await Catalogo({searchParams:Promise.resolve({q:"SKU-1"})});
 expect(texto(tela)).toContain("Produto 001");
});
it.each(["ZZ Produto alvo","ALVO-201"])("busca encontra produto além do limite usando %s",async(q)=>{
 const tela=await Catalogo({searchParams:Promise.resolve({q})});
 expect(texto(tela)).toContain("ZZ Produto alvo");
});

