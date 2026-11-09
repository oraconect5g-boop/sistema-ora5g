import { expect,it } from "vitest";
import { aprovacoesVisiveis } from "./consultas";
import { APROVACOES,VENDAS_HOJE } from "./dados";
import { normalizarResposta } from "../integracoes/nogle/regras";
it("quem fez a solicitação não entra na própria fila de aprovação",()=>{
 const p=APROVACOES.find(x=>x.tipo==="desconto");expect(p).toBeDefined();
 const fila=aprovacoesVisiveis({perfil:"gerente",pessoaId:p!.venda.vendedor,loja:p!.venda.loja});
 expect(fila.some(x=>x.id===p!.id)).toBe(false);
});
it("toda nota solicitada tem pedido fiscal mesmo com outra aprovação pendente",()=>{
 const faltantes=VENDAS_HOJE.filter(v=>v.nota==="solicitada"&&!APROVACOES.some(a=>a.tipo==="nota"&&a.venda.numero===v.numero));
 expect(faltantes.map(v=>({numero:v.numero,situacao:v.situacao,nota:v.nota}))).toEqual([]);
});
it.each([401,403,404,429,500,502])("Nogle HTTP %s nunca confirma",status=>expect(normalizarResposta(status,{retorno:true,data:{id:1}}).ok).toBe(false));
it("Nogle falha de negócio com 200 permanece falha",()=>expect(normalizarResposta(200,{retorno:false,mensagem:"Falha simulada"}).ok).toBe(false));

