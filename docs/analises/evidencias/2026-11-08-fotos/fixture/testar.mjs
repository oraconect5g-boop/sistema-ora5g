import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const porta = process.env.ORA_PORTA_FIXTURE ?? "3195";
const browser=await chromium.launch({headless:true});
const resultados=[];
for(const largura of [360,1280]){
 const contexto=await browser.newContext({viewport:{width:largura,height:800}});
 async function caso(nome,acao){
  const page=await contexto.newPage();const erros=[];page.on("pageerror",e=>erros.push(e.message));
  try{await acao(page);resultados.push({largura,nome,ok:true,erros});}
  catch(e){resultados.push({largura,nome,ok:false,erro:e.message.slice(0,1500),erros});}
  finally{await page.close();}
 }
 async function abrir(page,boa=true){await page.goto("http://127.0.0.1:"+porta+"/"+(boa?"?boa=1":""));await expect(page.getByRole("button",{name:"Trocar URL",exact:true})).toBeVisible({timeout:20000});}
 async function arquivo(page,tipo="image/png"){
  const data=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=200;c.height=200;c.getContext("2d").fillRect(0,0,200,200);return c.toDataURL("image/png").split(",")[1];});
  await page.getByLabel("Foto de Produto de teste",{exact:true}).setInputFiles({name:"foto.png",mimeType:tipo,buffer:Buffer.from(data,"base64")});
 }
 await caso("foto válida amplia",async p=>{await abrir(p);await p.getByRole("button",{name:"Ampliar a foto de Imagem de teste",exact:true}).click();await expect(p.getByRole("dialog")).toBeVisible();});
 await caso("recupera imagem depois de URL nova",async p=>{await abrir(p,false);await expect(p.getByText("foto indisponível",{exact:true})).toBeVisible();await p.getByRole("button",{name:"Trocar URL",exact:true}).click();await expect(p.getByRole("button",{name:"Ampliar a foto de Imagem de teste",exact:true})).toBeVisible({timeout:1500});});
 await caso("descartar permite selecionar o mesmo arquivo de novo",async p=>{await abrir(p);await arquivo(p);await expect(p.getByAltText("Prévia da foto de Produto de teste")).toBeVisible();await p.getByRole("button",{name:"Descartar",exact:true}).click();await expect(p.getByLabel("Foto de Produto de teste",{exact:true})).toHaveValue("",{timeout:1500});});
 await caso("retry de registro não duplica upload já confirmado",async p=>{await abrir(p);await arquivo(p);await p.getByRole("button",{name:"Usar esta foto",exact:true}).click();await expect(p.getByRole("alert")).toContainText("não ficou registrada");await p.getByRole("button",{name:"Usar esta foto",exact:true}).click();await expect.poll(()=>p.evaluate(()=>window.auditoria.registros.length)).toBe(2);expect(await p.evaluate(()=>window.auditoria.uploads.length)).toBe(1);});
 await caso("tipo não permitido é recusado antes do envio",async p=>{await abrir(p);await arquivo(p,"image/gif");await expect(p.getByRole("alert")).toContainText("Use uma foto");expect(await p.evaluate(()=>window.auditoria.uploads.length)).toBe(0);});
 await caso("upload válido registra e atualiza o catálogo",async p=>{await abrir(p);await p.evaluate(()=>{window.auditoria.falharRegistro=false;});await arquivo(p);await p.getByRole("button",{name:"Usar esta foto",exact:true}).click();await expect.poll(()=>p.evaluate(()=>window.auditoria.refreshes)).toBe(1);expect(await p.evaluate(()=>({n:window.auditoria.uploads.length,l:window.auditoria.registros[0].largura,a:window.auditoria.registros[0].altura}))).toEqual({n:1,l:200,a:200});});
 await contexto.close();
}
await browser.close();
writeFileSync(new URL("../resultados-componentes.json", import.meta.url),JSON.stringify(resultados,null,2));
process.stdout.write(JSON.stringify(resultados.map(r=>({largura:r.largura,nome:r.nome,ok:r.ok,erro:r.erro?.slice(0,160),erros:r.erros})),null,2)+"\n");
if(resultados.some(r=>!r.ok))process.exitCode=1;

