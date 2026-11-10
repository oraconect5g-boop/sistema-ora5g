// Copiar para packages/banco/src/revisao-vendas-concorrencia.test.ts.
// PostgreSQL 17 descartável, duas conexões reais e dados fictícios.
import type pg from "pg";
import { expect, it } from "vitest";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";
import { executor, iniciarPostgresReal } from "./postgres-real";

it("editar desconto e decidir aprovação simultaneamente não causa deadlock", async () => {
  const servidor = await iniciarPostgresReal();
  const admin = await servidor.conectar();
  const a = await servidor.conectar(); const b = await servidor.conectar();
  try {
    await montarCenario(executor(admin)); await montarCatalogo(executor(admin));
    const sessao = async (usuario: string, sufixo: string) => {
      const id = `83000000-0000-4000-8000-${sufixo}`;
      await admin.query("insert into auth.sessions(id,user_id) values($1,$2)", [id, usuario]);
      const jwt = JSON.stringify({ sub: usuario, session_id: id, role: "authenticated" });
      await admin.query("begin");
      await admin.query("select set_config('request.jwt.claims',$1,true)", [jwt]);
      await admin.query("set local role authenticated");
      await admin.query("select public.selecionar_unidade($1)", [ids.lojaA]);
      await admin.query("commit");
      return jwt;
    };
    const vendedor = await sessao(ids.vendedorA, "000000000001");
    const dono = await sessao(ids.dono, "000000000002");
    await admin.query("begin");
    await admin.query("select set_config('request.jwt.claims',$1,true)", [vendedor]);
    await admin.query("set local role authenticated");
    const venda = (await admin.query("select public.criar_venda('concorrencia:venda') as id")).rows[0].id;
    const item = (await admin.query("select public.adicionar_item($1,$2,null,1,'concorrencia:item') as id", [venda, cat.capa])).rows[0].id;
    await admin.query("select public.aplicar_desconto($1,500)", [item]);
    const pedido = (await admin.query("select public.pedir_aprovacao($1,'Cliente ficticio') as id", [item])).rows[0].id;
    await admin.query("commit");
    // Intercalação determinística: representam pausas após o primeiro FOR UPDATE
    // de cada RPC. A editar: venda -> aprovação. B decidir: aprovação -> venda.
    // Os locks de preparação são adquiridos como dono do banco local porque SELECT
    // FOR UPDATE direto é corretamente negado ao papel authenticated. As RPCs são
    // executadas como as pessoas, sem mudar seus corpos ou privilégios.
    await a.query("begin"); await a.query("select id from public.vendas where id=$1 for update", [venda]);
    await b.query("begin"); await b.query("select id from public.aprovacoes_desconto where id=$1 for update", [pedido]);
    const autenticar = async (c: pg.Client, jwt: string) => {
      await c.query("select set_config('request.jwt.claims',$1,true)", [jwt]);
      await c.query("set local role authenticated");
    };
    await autenticar(a, vendedor); await autenticar(b, dono);
    const pidA = (await a.query("select pg_backend_pid() as pid")).rows[0].pid;
    const executar = async (c: pg.Client, sql: string, params: unknown[]) => {
      try { await c.query(sql, params); await c.query("commit"); return null; }
      catch (e) { await c.query("rollback"); return (e as { code: string }).code; }
    };
    const edicao = executar(a, "select public.aplicar_desconto($1,600)", [item]);
    let esperando = false;
    for (let i = 0; i < 300; i++) {
      const espera = (await admin.query("select wait_event_type from pg_stat_activity where pid=$1", [pidA])).rows[0]?.wait_event_type;
      if (espera === "Lock") { esperando = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(esperando).toBe(true);
    const resultados = await Promise.all([edicao, executar(b, "select public.decidir_aprovacao($1,true,'Conferido')", [pedido])]);
    process.stdout.write(`EVIDENCIA concorrencia_desconto_aprovacao codigos=${JSON.stringify(resultados)}\n`);
    expect(resultados).not.toContain("40P01");
  } finally {
    for (const c of [a,b,admin]) { await c.query("rollback").catch(() => undefined); await c.end(); }
    await servidor.parar();
  }
}, 120_000);
