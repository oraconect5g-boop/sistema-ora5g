import { expect,it } from "vitest";
import { criarBanco } from "./banco-de-teste";
it("inventário de objetos ativos após todas as migrations",async()=>{
 const db=await criarBanco();
 try{
  const r=await db.query(`select 'indices' as tipo,count(*)::int as quantidade from pg_index i join pg_class t on t.oid=i.indrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname in ('public','privado') union all select 'funcoes',count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','privado') union all select 'gatilhos',count(*)::int from pg_trigger g join pg_class t on t.oid=g.tgrelid join pg_namespace n on n.oid=t.relnamespace where not g.tgisinternal and n.nspname in ('public','privado') union all select 'politicas',count(*)::int from pg_policies where schemaname in ('public','privado','storage')`);
  const sobrecargas=await db.query(`select n.nspname,p.proname,count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','privado') group by 1,2 having count(*)>1`);
  process.stdout.write(JSON.stringify({objetos:r.rows,sobrecargas:sobrecargas.rows})+'\n');
  expect(r.rows).toHaveLength(4);expect(sobrecargas.rows).toHaveLength(0);
 }finally{await db.close();}
});
