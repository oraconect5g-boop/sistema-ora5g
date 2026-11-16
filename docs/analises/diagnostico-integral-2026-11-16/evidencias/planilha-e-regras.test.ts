import { it, expect } from "vitest";
import { readFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { lerPlanilha } from "../../../../apps/plataforma/src/lib/importacao/planilha";
import { lerXlsx } from "../../../../apps/plataforma/src/lib/importacao/xlsx";
import { descomprimirNoServidor } from "../../../../apps/plataforma/src/lib/importacao/descomprimir-servidor";
import { conferirPagamentos } from "../../../../packages/dominio/src/pagamento";
const log = (id: string, dados: unknown) => appendFileSync(new URL("planilha-e-regras.jsonl", import.meta.url), JSON.stringify({ id, dados })+"\n");
it.skipIf(!process.env.ORA_PLANILHA_AUDITORIA)("observa o arquivo original sem gravar seus dados no resultado", async () => {
 const bytes=readFileSync(process.env.ORA_PLANILHA_AUDITORIA!);
 const hash=createHash("sha256").update(bytes).digest("hex");
 let resultado: Record<string, unknown>;
 try { const p=await lerPlanilha(bytes,descomprimirNoServidor); resultado={aceita:true,colunas:p.cabecalho.length,linhas:p.linhas.length}; }
 catch (e) { const f=e as {motivo?:string;linha?:number;name?:string}; resultado={aceita:false,motivo:f.motivo,linha:f.linha,tipo:f.name}; }
 const cabecalho=await lerXlsx(bytes,descomprimirNoServidor,{soCabecalho:true}).then(p=>({colunas:p.cabecalho.length})).catch((e:{motivo?:string})=>({erro:e.motivo}));
 log("ARQUIVO-REIN",{sha256:hash,resultado,cabecalho});
 expect(hash).toBe("76f9cf33198de7205c01dc8ec78dea70fcf86c17847f9faea6356f0c8e612c06");
 expect(resultado.aceita).toBe(false);
});
it("documenta a exigência antiga de e-mail PayJoy que conflita com a decisão posterior",()=>{
 const r=conferirPagamentos(100000,[{meio:"payjoy",valor:100000,entrada:0}]);
 log("EMAIL-PAYJOY",{valido:r.valido,erros:r.erros});
 expect(r.erros).toContain("PayJoy exige o e-mail do cliente");
});

