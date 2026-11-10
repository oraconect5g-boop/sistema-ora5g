import { expect, it } from "vitest";
import { ids, montarCenario } from "./cenario";
import { executor, iniciarPostgresReal } from "./postgres-real";

it("duas revogações concorrentes devem preservar ao menos um dono", async () => {
  const pg = await iniciarPostgresReal();
  const a = await pg.conectar(); const b = await pg.conectar(); const admin = await pg.conectar();
  try {
    await montarCenario(executor(admin));
    await admin.query("insert into public.vinculos(usuario_id,organizacao_id,papel,escopo,inicio) values($1,$2,'dono','organizacao',now()-interval '1 day')",[ids.semVinculo,ids.organizacao]);
    const vinculos = await admin.query("select id,usuario_id from public.vinculos where organizacao_id=$1 and papel='dono'",[ids.organizacao]);
    const va = vinculos.rows.find(v=>v.usuario_id===ids.dono).id;
    const vb = vinculos.rows.find(v=>v.usuario_id===ids.semVinculo).id;
    const sa="90000000-0000-4000-8000-000000000801", sb="90000000-0000-4000-8000-000000000802";
    await admin.query("insert into auth.sessions(id,user_id,created_at) values($1,$2,now()),($3,$4,now())",[sa,ids.dono,sb,ids.semVinculo]);
    for (const [c,u,s] of [[a,ids.dono,sa],[b,ids.semVinculo,sb]] as const) {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:u,session_id:s,role:"authenticated"})]);
      await c.query("set local role authenticated");
    }
    await a.query("select public.encerrar_vinculo($1,'teste concorrente A')",[vb]);
    await b.query("select public.encerrar_vinculo($1,'teste concorrente B')",[va]);
    await b.query("commit"); await a.query("commit");
    const r=await admin.query("select count(*)::int as n from public.vinculos where organizacao_id=$1 and papel='dono' and fim is null",[ids.organizacao]);
    expect(r.rows[0].n).toBeGreaterThan(0);
  } finally {
    await a.query("rollback"); await b.query("rollback");
    await a.end(); await b.end(); await admin.end(); await pg.parar();
  }
},60000);
