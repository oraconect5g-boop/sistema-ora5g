import { afterEach,expect,it,vi } from "vitest";
import { ExportarCsv } from "./ExportarCsv";
afterEach(()=>vi.unstubAllGlobals());
it("CSV neutraliza texto que seria interpretado como fórmula na planilha",async()=>{
 let salvo:Blob|undefined;
 vi.stubGlobal("URL",{createObjectURL:(b:Blob)=>{salvo=b;return "blob:teste";},revokeObjectURL:()=>{}});
 vi.stubGlobal("document",{createElement:()=>({click:()=>{},remove:()=>{},href:"",download:""}),body:{append:()=>{}}});
 const e=ExportarCsv({nomeArquivo:"teste",colunas:["Nome"],linhas:[["=1+1"],["+1+1"],["@SUM(1)"]]});
 e.props.onClick();
 const csv=await salvo!.text();
 expect(csv).not.toContain("\r\n=1+1");
 expect(csv).not.toContain("\r\n+1+1");
 expect(csv).not.toContain("\r\n@SUM");
});

