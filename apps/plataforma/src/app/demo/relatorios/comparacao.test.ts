// REV-035 / #37 (prova do Codex na PR #33, 2026-11-08-setores/relatorios.repro.ts), agora regressão
// permanente: receita constante não cria crescimento; 30 dias sem período anterior completo não compara.
import { isValidElement,type ReactElement } from "react";
import { expect,it,vi } from "vitest";
import Relatorios from "./page";
const fixo={faturamento:1000,vendas:1,custo:500,telecom:1,descontos:0};
vi.mock("../../../demo/sessao",()=>({acessoDaPagina:async()=>({perfil:"dono",pessoaId:"teste",loja:"rede",permitido:true})}));
vi.mock("../../../demo/consultas",async(importOriginal)=>{
 const a=await importOriginal<typeof import("../../../demo/consultas")>();
 return {...a,historicoDoEscopo:()=>Array.from({length:30},()=>({...fixo})),vendasVisiveis:()=>[]};
});
vi.mock("../../../demo/dados",async(importOriginal)=>{
 const a=await importOriginal<typeof import("../../../demo/dados")>();
 return {...a,resumoDeVendas:()=>({...fixo})};
});
function achar(v:unknown):ReactElement<{rotulo?:string;variacao?:{fracao:number}}> | undefined {
 if(Array.isArray(v)){for(const c of v){const r=achar(c);if(r)return r;}}
 if(isValidElement(v)){const e=v as ReactElement<{rotulo?:string;variacao?:{fracao:number};children?:unknown}>;if(e.props.rotulo==="Faturamento")return e;return achar(e.props.children);}
 return undefined;
}
it.each(["7","14","30"])("comparação de %s dias não cria crescimento com receita constante",async(periodo)=>{
 const e=await Relatorios({searchParams:Promise.resolve({periodo})});
 const indicador=achar(e);expect(indicador).toBeDefined();
 expect(indicador?.props.variacao?.fracao??0).toBe(0);
});

