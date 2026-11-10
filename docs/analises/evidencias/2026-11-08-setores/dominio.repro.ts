import { expect, it } from "vitest";
import { aplicarPercentual, lerReais } from "./dinheiro";
import { avaliarDesconto } from "./desconto";
import { conferirPagamentos } from "./pagamento";
import { completarComDigitoVerificador } from "./identificadores";
import { validarItem } from "./venda";

it.each([["1.234,56",123456],["1234.56",123456],["0,01",1],["1.000",100000]])("moeda %s", (texto,esperado)=>expect(lerReais(texto)).toBe(esperado));
it.each(["NaN","Infinity","-1,00","1e3","1,001","1.2.3","1,00 reais"])("recusa moeda %s",texto=>expect(()=>lerReais(texto)).toThrow());
it("pagamento misto conserva recebimento e troco",()=>expect(conferirPagamentos(10000,[{meio:"dinheiro",valor:7000},{meio:"pix_direto",valor:5000}])).toMatchObject({valido:true,recebidoNaLoja:10000,troco:2000,falta:0}));
it("excedente sem dinheiro é recusado",()=>expect(conferirPagamentos(10000,[{meio:"pix_direto",valor:10001}]).valido).toBe(false));
it("financiamento separa entrada e repasse sem adicionar juros",()=>expect(conferirPagamentos(100000,[{meio:"payjoy",valor:100000,entrada:20000}],{email:"pessoa@teste.invalid"})).toMatchObject({valido:true,recebidoNaLoja:20000,aReceberDeFinanceiras:80000}));
it.each([NaN,Infinity,0.5,-1])("recusa valor inválido %s",valor=>expect(conferirPagamentos(100,[{meio:"dinheiro",valor}]).valido).toBe(false));
it("recusa soma insegura dos pagamentos",()=>expect(conferirPagamentos(Number.MAX_SAFE_INTEGER,[{meio:"pix_direto",valor:Number.MAX_SAFE_INTEGER},{meio:"dinheiro",valor:1}]).valido).toBe(false));
it("propriedade herdada não vira meio",()=>expect(conferirPagamentos(100,[{meio:"constructor" as "dinheiro",valor:100}]).valido).toBe(false));
it("mil casos de desconto mantêm teto e margem mínima",()=>{
 for(let i=1;i<=1000;i++){
  const preco=10000+i*113,custo=Math.floor(preco*(30+(i%35))/100),taxa=(i%12)*100,margem=1000+(i%15)*100,teto=1000;
  const e={preco,custo,taxaMeioPagamento:taxa,politica:{tetoCategoria:teto,margemMinima:margem}};
  const r=avaliarDesconto(e,1),d=r.maximoSemAprovacao,liquido=preco-d,fee=aplicarPercentual(liquido,taxa);
  expect(d).toBeLessThanOrEqual(Math.floor(preco*teto/10000));
  if(d>0)expect(BigInt(liquido-fee-custo)*10000n).toBeGreaterThanOrEqual(BigInt(liquido)*BigInt(margem));
 }
});
it("chip com um ICCID não pode representar duas unidades",()=>{
 const r=validarItem({tipo:"chip",descricao:"Chip teste",quantidade:2,precoUnitario:1000,iccid:completarComDigitoVerificador("895510000000000001")});
 expect(r.length).toBeGreaterThan(0);
});

