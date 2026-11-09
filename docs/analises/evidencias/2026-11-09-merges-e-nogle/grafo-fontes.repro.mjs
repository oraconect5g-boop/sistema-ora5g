import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const raiz=path.resolve(process.argv[2]??process.cwd());
const require=createRequire(path.join(raiz,'package.json'));
const ts=require('typescript');
const files=execFileSync('git',['ls-files','-z'],{cwd:raiz,encoding:'utf8'}).split('\0').filter(f=>/^apps\/plataforma\/src\/.+\.tsx?$/.test(f)&&!f.endsWith('.test.ts'));
const set=new Set(files);const graph=new Map();const bodies=new Map();
for(const file of files){
 const text=fs.readFileSync(path.join(raiz,file),'utf8');
 const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const deps=[];
 function resolver(spec){if(!spec.startsWith('.'))return;const root=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec));const target=[root+'.ts',root+'.tsx',root+'/index.ts',root+'/index.tsx'].find(f=>set.has(f));if(target)deps.push(target);}
 function visitar(n){
  if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))resolver(n.moduleSpecifier.text);
  if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&ts.isStringLiteral(n.arguments[0]))resolver(n.arguments[0].text);
  if((ts.isFunctionDeclaration(n)||ts.isArrowFunction(n)||ts.isFunctionExpression(n))&&n.body){const body=n.body.getText(sf);const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.JSX,body);let norm='';while(scanner.scan()!==ts.SyntaxKind.EndOfFileToken)norm+=scanner.getTokenText()+' ';if(norm.length>=200){const hash=crypto.createHash('sha256').update(norm).digest('hex');if(!bodies.has(hash))bodies.set(hash,[]);bodies.get(hash).push({file,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,name:n.name?.getText(sf)??n.parent?.name?.getText(sf)??'callback',size:norm.length});}}
  ts.forEachChild(n,visitar);
 }
 visitar(sf);graph.set(file,[...new Set(deps)]);
}
const entradas=files.filter(f=>/\/app\/(.*\/)?(page|layout|route)\.tsx?$/.test(f)&&!f.includes('/app/demo/'));
const caminhos=[];for(const entry of entradas){const queue=[[entry]];const seen=new Set();while(queue.length){const chain=queue.shift();const last=chain.at(-1);if(seen.has(last))continue;seen.add(last);if(last.includes('/src/demo/')||last.includes('/app/demo/')){caminhos.push(chain);continue;}for(const next of graph.get(last)??[])queue.push([...chain,next]);}}
const duplicates=[...bodies.values()].filter(a=>new Set(a.map(x=>x.file)).size>1);
const r={sourceFiles:files.length,realEntrypoints:entradas.length,realToDemoPaths:caminhos,identicalFunctionBodies:duplicates};
process.stdout.write(JSON.stringify(r));
