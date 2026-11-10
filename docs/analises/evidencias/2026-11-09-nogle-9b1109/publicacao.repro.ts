// Copiar para packages/config/src/revisao-publicacao-nogle.test.ts; só valores fictícios.
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {it,expect} from 'vitest';
it('publicação não entrega segredos Nogle ao processo web',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ora-filtro-nogle-'));try{
 const origem=join(dir,'origem');const destino=join(dir,'web');
 writeFileSync(origem,'APP_ENV=homologacao\nSUPABASE_SECRET_KEY=ficticia\nDATABASE_URL=ficticia\nNOGLE_ACCESS_KEY=ficticia\nNOGLE_SECONDARY_KEY=ficticia\n');
 const script=readFileSync(new URL('../../../deploy/homologacao/publicar.sh',import.meta.url),'utf8');
 const filtro=script.split('\n').find(l=>l.startsWith('grep -vE'));
 if(!filtro)throw new Error('filtro de publicação mudou: revisar a prova');
 execFileSync('bash',['-c',filtro],{env:{...process.env,RETRATO:origem,RETRATO_WEB:destino}});
 const web=readFileSync(destino,'utf8');expect(web).not.toContain('SUPABASE_SECRET_KEY');expect(web).not.toContain('DATABASE_URL');
 process.stdout.write(`EVIDENCIA segredo_nogle_web=${web.includes('NOGLE_ACCESS_KEY')}\n`);
 expect(web).not.toContain('NOGLE_ACCESS_KEY');expect(web).not.toContain('NOGLE_SECONDARY_KEY');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
