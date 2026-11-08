import { expect, it } from "vitest";
import { resumoDeVendas, type VendaDemo } from "./dados/vendas";

const venda = (tipo: "recarga" | "ativacao", situacaoTelecom: "confirmada" | "pendente", preco: number): VendaDemo => ({
 numero:"TESTE",minutos:600,hora:"10:00",loja:"teste",vendedor:"teste",cliente:null,
 itens:[{sku:"TESTE",nome:"Teste sintético",tipo,quantidade:1,precoUnitario:preco,custoUnitario:0,desconto:0,situacaoTelecom}],
 pagamentos:[],total:preco,custo:0,descontos:0,situacao:"concluida",nota:"nao_solicitada"
});
it("o faturamento não deve reconhecer o valor de face da recarga como receita da Ora",()=>{
 expect(resumoDeVendas([venda("recarga","confirmada",3000)]).faturamento).toBe(0);
});
it("o indicador que diz só confirmadas não deve contar ativação pendente",()=>{
 expect(resumoDeVendas([venda("ativacao","pendente",0)]).telecom).toBe(0);
});
