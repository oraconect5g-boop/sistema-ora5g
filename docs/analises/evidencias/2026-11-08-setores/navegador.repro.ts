import { expect,test } from "@playwright/test";
import { readFileSync } from "node:fs";

const paginas=["/demo","/demo/vender","/demo/vendas","/demo/estoque","/demo/connect","/demo/assistencia","/demo/aprovacoes","/demo/metas","/demo/financeiro","/demo/relatorios","/demo/clientes","/demo/produtos","/demo/canais","/demo/lojas","/demo/importacao","/demo/auditoria"];
test("todos os setores do dono abrem sem erro de página",async({page})=>{
 const erros:string[]=[];page.on("pageerror",e=>erros.push(e.message));
 await page.goto("/demo/perfil/usar?p=dono");
 for(const rota of paginas){
  const r=await page.goto(rota);expect(r?.status(),rota).toBe(200);
  await expect(page.getByRole("main")).toBeVisible();
  expect(await page.getByText("Algo deu errado",{exact:true}).count(),rota).toBe(0);
 }
 expect(erros).toEqual([]);
});
const negados=[
 ["vendedor","/demo/financeiro"],["vendedor","/demo/aprovacoes"],["vendedor","/demo/auditoria"],["vendedor","/demo/importacao"],
 ["administrador","/demo/vender"],["administrador","/demo/aprovacoes"],["tecnico","/demo/vender"],["tecnico","/demo/clientes"]
];
for(const[perfil,rota]of negados)test("nega "+perfil+" "+rota,async({page})=>{
 await page.goto("/demo/perfil/usar?p="+perfil);await page.goto(rota);
 await expect(page.getByRole("heading",{name:"Sem permissão",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Exportar CSV",exact:true})).toHaveCount(0);
});
const exports=[
 ["/demo/vendas","vendas","Venda;Hora;Loja"],["/demo/estoque","estoque-imei","Produto;SKU;IMEI"],
 ["/demo/financeiro","recebimentos","Meio de pagamento;Valor"],["/demo/auditoria","auditoria","Quando;Quem"],
 ["/demo/produtos","produtos","SKU;Produto"],["/demo/relatorios?periodo=7","relatorio-7-dias","Dia;Faturamento"],
 ["/demo/connect","ora-connect","Hora;Loja"],["/demo/connect?aba=carteira","extrato-contel","Data;Tipo"],
 ["/demo/lojas","usuarios","Nome;Papel"],["/demo/metas","metas","Vendedor;Lojas"]
];
for(const[rota,nome,cabecalho]of exports)test("download do setor "+nome,async({page})=>{
 await page.goto("/demo/perfil/usar?p=dono");await page.goto(rota);
 const espera=page.waitForEvent("download");await page.getByRole("button",{name:"Exportar CSV",exact:true}).click();
 const d=await espera;expect(d.suggestedFilename()).toBe("ora5g-demonstracao-"+nome+".csv");
 const t=readFileSync((await d.path())!,"utf8");expect(t.replace(/^\uFEFF/,"").startsWith(cabecalho)).toBe(true);
 expect(t.split("\r\n").length).toBeGreaterThan(1);
});
test("exportação de produtos do vendedor omite custo e respeita busca",async({page})=>{
 await page.goto("/demo/perfil/usar?p=vendedor");await page.goto("/demo/produtos?busca=Galaxy");
 const espera=page.waitForEvent("download");await page.getByRole("button",{name:"Exportar CSV",exact:true}).click();
 const d=await espera,t=readFileSync((await d.path())!,"utf8"),linhas=t.trim().split("\r\n");
 expect(linhas[0]).not.toMatch(/Custo|Margem/);
 expect(linhas.slice(1).every(l=>l.includes("Galaxy"))).toBe(true);
});
test("exportação de vendas canceladas contém apenas o filtro",async({page})=>{
 await page.goto("/demo/perfil/usar?p=dono");await page.goto("/demo/vendas?situacao=canceladas");
 const espera=page.waitForEvent("download");await page.getByRole("button",{name:"Exportar CSV",exact:true}).click();
 const d=await espera,t=readFileSync((await d.path())!,"utf8");
 expect(t.trim().split("\r\n").slice(1).every(l=>l.includes(";Cancelada;"))).toBe(true);
});
test("ativação por SALDO não permite carteira negativa",async({page})=>{
 test.setTimeout(100000);
 await page.goto("/demo/perfil/usar?p=vendedor");await page.goto("/demo/connect?aba=ativar");
 for(let i=0;i<34;i++){
  await page.getByRole("radio",{name:"eSIM (chip virtual)",exact:true}).click();
  await page.getByRole("button",{name:"Continuar",exact:true}).click();
  await page.getByLabel("CPF do titular", {exact:true}).fill("000.000.001-91");
  await page.getByRole("button",{name:"Buscar",exact:true}).click();
  await page.getByRole("button",{name:"Continuar",exact:true}).click();
  await page.getByRole("button",{name:/20 GB/}).click();
  await page.getByRole("button",{name:"Continuar",exact:true}).click();
  await page.getByRole("button",{name:"Conferir e ativar",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Solicitar ativação",exact:true}).click();
  await page.getByRole("button",{name:"Nova ativação",exact:true}).click();
 }
 await page.getByRole("radio",{name:"eSIM (chip virtual)",exact:true}).click();
 await page.getByRole("button",{name:"Continuar",exact:true}).click();
 await page.getByLabel("CPF do titular",{exact:true}).fill("000.000.001-91");
 await page.getByRole("button",{name:"Buscar",exact:true}).click();
 await page.getByRole("button",{name:"Continuar",exact:true}).click();
 await page.getByRole("button",{name:"Continuar",exact:true}).click();
 await expect(page.getByText(/Saldo da carteira:/)).not.toContainText(/[-−]/);
 await expect(page.getByRole("button",{name:"Conferir e ativar",exact:true})).toBeDisabled();
});

