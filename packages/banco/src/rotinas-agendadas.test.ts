// Rotinas agendadas no banco (lote ROT-a: ORA-INV-005, ORA-ONLINE-006 e ORA-QUAL-006, em parte; ADR-011; migration
// 20261117124230_rotinas_agendadas). No Supabase, o agendador (pg_cron) chama privado.rodar_rotina na hora marcada;
// aqui o Supabase simulado guarda o agendamento sem relógio, e os testes chamam a rotina direto. Banco em memória com
// todas as migrations; dados fictícios; cada teste roda numa transação desfeita no fim. Duas rodadas ao mesmo tempo, e
// a rotina diante de um aparelho preso por outra transação, estão em rotinas-agendadas-concorrencia.test.ts.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

// Uma exceção SQL aborta a transação do teste; o savepoint permite continuar depois dela.
async function erroDe(acao: () => Promise<unknown>): Promise<string | null> {
  await db.exec("savepoint tentativa");
  try {
    await acao();
    await db.exec("release savepoint tentativa");
    return null;
  } catch (e) {
    await db.exec("rollback to savepoint tentativa");
    await db.exec("release savepoint tentativa");
    return (e as { code?: string }).code ?? "sem-codigo";
  }
}

let sessoes = 0;
async function naLoja<T>(usuario: string, unidade: string, acao: () => Promise<T>): Promise<T> {
  const sessao = { usuario, sessao: `48000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  return comoUsuario(db, sessao, async () => {
    const { rows } = await db.query<{ ok: boolean }>("select public.selecionar_unidade($1) as ok", [unidade]);
    expect(rows[0]?.ok).toBe(true);
    return acao();
  });
}

const reservar = async (variante: string, item: string | null, chave: string, origem = "pdv") =>
  (await db.query<{ id: string }>("select public.reservar_estoque($1, 1, $2, $3, $4, 15) as id", [variante, item, chave, origem])).rows[0]?.id ?? "";
const vencer = (reserva: string) => db.query("update public.estoque_reservas set expira_em = now() - interval '1 minute' where id = $1", [reserva]);
const rodar = async (rotina: string) => (await db.query<{ r: string }>("select privado.rodar_rotina($1) as r", [rotina])).rows[0]?.r;
type Rodada = { situacao: string; quantidade: number | null; erro: string | null };
const rodadas = async (rotina: string) =>
  (await db.query<Rodada>("select situacao, quantidade, erro from privado.rotinas_execucoes where rotina = $1 order by id", [rotina])).rows;
const contar = async (sql: string, params: unknown[] = []) => (await db.query<{ n: number }>(sql, params)).rows[0]?.n ?? -1;
const situacaoDaReserva = async (id: string) =>
  (await db.query<{ situacao: string }>("select situacao from public.estoque_reservas where id = $1", [id])).rows[0]?.situacao;
const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ reservado: number }>("select reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0]?.reservado ?? -1;
type Situacao = { nome: string; situacao: string; ultima_ok: string | null; ultima_falha: string | null; erro: string | null };
const situacoes = (usuario: string = ids.dono, unidade: string = ids.lojaA) => naLoja(usuario, unidade, async () =>
  (await db.query<Situacao>("select nome, situacao, ultima_ok, ultima_falha, erro from public.rotinas_situacao()")).rows);
const daRotina = async (nome: string) => (await situacoes()).find((s) => s.nome === nome);

// A rotina do vencimento quebrada: mexe numa reserva e depois falha por tempo esgotado (57014, o código do
// statement_timeout, que o "when others" do PL/pgSQL não pega sozinho).
const quebrarVencimento = (reserva: string) => db.exec(`
  create or replace function privado.expirar_reservas(p_unidade uuid default null, p_variante uuid default null)
  returns int language plpgsql security definer set search_path = '' as $$
  begin
    update public.estoque_reservas set situacao = 'expirada', encerrada_em = now() where id = '${reserva}';
    raise exception 'tempo esgotado (simulado)' using errcode = '57014';
  end;
  $$`);
const rodadaCerta = (rotina: string, minutosAtras: number) => db.query(
  `insert into privado.rotinas_execucoes (rotina, iniciada_em, terminada_em, situacao, quantidade)
   values ($1, now() - make_interval(mins => $2::int), now() - make_interval(mins => $2::int), 'ok', 0)`, [rotina, minutosAtras]);

describe("o agendamento (no Supabase, o pg_cron)", () => {
  it("as duas tarefas ficam agendadas pelo nome, cada uma chamando a sua rotina", async () => {
    const { rows } = await db.query<{ jobname: string; schedule: string; command: string; active: boolean }>(
      "select jobname, schedule, command, active from cron.job order by jobname");
    expect(rows).toEqual([
      { jobname: "ora5g-limpeza-dos-registros", schedule: "30 6 * * *", command: "select privado.rodar_rotina('limpeza_dos_registros')", active: true },
      { jobname: "ora5g-reservas-vencidas", schedule: "*/5 * * * *", command: "select privado.rodar_rotina('reservas_vencidas')", active: true },
    ]);
  });

  it("toda rotina do catálogo tem uma tarefa, e toda tarefa chama uma rotina do catálogo", async () => {
    const { rows } = await db.query<{ nome: string; tarefas: number }>(`
      select r.nome, (select count(*)::int from cron.job j where j.command = format('select privado.rodar_rotina(%L)', r.nome)) as tarefas
      from privado.rotinas r order by r.nome`);
    expect(rows).toEqual([{ nome: "limpeza_dos_registros", tarefas: 1 }, { nome: "reservas_vencidas", tarefas: 1 }]);
    expect(await contar("select count(*)::int as n from cron.job j where j.jobname like 'ora5g-%' and not exists (select 1 from privado.rotinas r where j.command = format('select privado.rodar_rotina(%L)', r.nome))")).toBe(0);
  });
});

describe("o vencimento das reservas (ORA-INV-005 e ORA-ONLINE-006)", () => {
  it("vence as reservas do PDV e do site passadas do prazo, devolve o aparelho e o saldo, e registra a rodada", async () => {
    const [aparelho, doSite, valida] = await naLoja(ids.vendedorA, ids.lojaA, async () => [
      await reservar(cat.aparelho, itens.a2, "rot:aparelho"),
      await reservar(cat.capa, null, "rot:site", "online"),
      await reservar(cat.capa, null, "rot:valida"),
    ]);
    await vencer(aparelho);
    await vencer(doSite);
    const reservadoAntes = await saldo(ids.lojaA, cat.capa);
    expect(await contar("select count(*)::int as n from public.estoque_reservas where situacao = 'ativa' and expira_em <= now()")).toBe(2);

    expect(await rodar("reservas_vencidas")).toBe("ok");

    expect(await situacaoDaReserva(aparelho)).toBe("expirada");
    expect(await situacaoDaReserva(doSite)).toBe("expirada");
    expect(await situacaoDaReserva(valida)).toBe("ativa");
    expect((await db.query<{ situacao: string }>("select situacao from public.itens_serializados where id = $1", [itens.a2])).rows[0]?.situacao).toBe("disponivel");
    expect(await saldo(ids.lojaA, cat.capa)).toBe(reservadoAntes - 1);
    expect(await rodadas("reservas_vencidas")).toEqual([{ situacao: "ok", quantidade: 2, erro: null }]);
    expect(await contar("select count(*)::int as n from privado.divergencias_estoque()")).toBe(0);
  });

  it("rodar de novo não vence nada a mais: cada rodada fica registrada com quantas tratou", async () => {
    const reserva = await naLoja(ids.vendedorA, ids.lojaA, () => reservar(cat.capa, null, "rot:repetir"));
    await vencer(reserva);
    expect(await rodar("reservas_vencidas")).toBe("ok");
    expect(await rodar("reservas_vencidas")).toBe("ok");
    expect(await rodadas("reservas_vencidas")).toEqual([{ situacao: "ok", quantidade: 1, erro: null }, { situacao: "ok", quantidade: 0, erro: null }]);
  });

  it("a falha fica registrada só com o código, e o que a rotina fez naquela rodada é desfeito", async () => {
    const reserva = await naLoja(ids.vendedorA, ids.lojaA, () => reservar(cat.capa, null, "rot:falha"));
    await quebrarVencimento(reserva);
    expect(await rodar("reservas_vencidas")).toBe("falha");
    expect(await situacaoDaReserva(reserva)).toBe("ativa");
    expect(await rodadas("reservas_vencidas")).toEqual([{ situacao: "falha", quantidade: null, erro: "57014" }]);
    // A transação de quem chamou segue de pé (o agendador marca a tarefa como concluída; quem conta a falha é o registro).
    expect(await contar("select 1 as n")).toBe(1);
  });

  it("rotina fora do catálogo é recusada sem registro; rotina do catálogo sem execução no banco fica registrada como falha", async () => {
    expect(await erroDe(() => rodar("nao_existe"))).toBe("22023");
    expect(await erroDe(() => db.query("select privado.rodar_rotina(null)"))).toBe("22023");
    expect(await contar("select count(*)::int as n from privado.rotinas_execucoes")).toBe(0);
    await db.query("insert into privado.rotinas (nome, descricao, frequencia, atrasada_apos) values ('sem_execucao', 'Sem execução (teste)', 'nunca', interval '1 hour')");
    expect(await rodar("sem_execucao")).toBe("falha");
    expect(await rodadas("sem_execucao")).toEqual([{ situacao: "falha", quantidade: null, erro: "22023" }]);
  });

  it("ninguém pela API roda a rotina nem lê o registro: só o agendador", async () => {
    for (const [usuario, unidade] of [[ids.dono, ids.lojaA], [ids.gerenteB, ids.lojaB], [ids.vendedorA, ids.lojaA]] as const) {
      await naLoja(usuario, unidade, async () => {
        expect(await erroDe(() => db.query("select privado.rodar_rotina('reservas_vencidas')"))).toBe("42501");
        expect(await erroDe(() => db.query("select privado.limpar_registros_das_rotinas()"))).toBe("42501");
        expect(await erroDe(() => db.query("select count(*) from privado.rotinas_execucoes"))).toBe("42501");
        expect(await erroDe(() => db.query("select count(*) from privado.rotinas"))).toBe("42501");
      });
    }
    await comoUsuario(db, null, async () => {
      expect(await erroDe(() => db.query("select privado.rodar_rotina('reservas_vencidas')"))).toBe("42501");
    });
    expect(await contar("select count(*)::int as n from privado.rotinas_execucoes")).toBe(0);
  });
});

describe("a limpeza do registro", () => {
  it("apaga as rodadas certas e puladas com mais de 30 dias, as falhas com mais de 90 e o histórico do agendador destas tarefas com mais de 7 dias", async () => {
    const rodadaAntiga = (situacao: string, dias: number) => db.query(
      `insert into privado.rotinas_execucoes (rotina, iniciada_em, terminada_em, situacao, quantidade, erro)
       values ('reservas_vencidas', now() - make_interval(days => $1::int), now() - make_interval(days => $1::int), $2,
               case when $2 = 'ok' then 0 end, case when $2 = 'falha' then '57014' end)`, [dias, situacao]);
    for (const [situacao, dias] of [["ok", 31], ["pulada", 31], ["falha", 91], ["ok", 29], ["pulada", 29], ["falha", 89]] as const) await rodadaAntiga(situacao, dias);
    const tarefa = async (nome: string) => (await db.query<{ jobid: string }>("select jobid::text from cron.job where jobname = $1", [nome])).rows[0]?.jobid;
    await db.query("select cron.schedule('outra-tarefa', '0 * * * *', 'select 1')");
    const historico = (jobid: string | undefined, dias: number) => db.query(
      "insert into cron.job_run_details (jobid, status, start_time, end_time) values ($1::bigint, 'succeeded', now() - make_interval(days => $2::int), now() - make_interval(days => $2::int))", [jobid, dias]);
    await historico(await tarefa("ora5g-reservas-vencidas"), 8);
    await historico(await tarefa("ora5g-limpeza-dos-registros"), 8);
    await historico(await tarefa("ora5g-reservas-vencidas"), 6);
    await historico(await tarefa("outra-tarefa"), 30);

    expect(await rodar("limpeza_dos_registros")).toBe("ok");

    expect(await rodadas("limpeza_dos_registros")).toEqual([{ situacao: "ok", quantidade: 5, erro: null }]);
    const ficaram = await db.query<{ situacao: string; dias: number }>(
      "select situacao, extract(day from now() - iniciada_em)::int as dias from privado.rotinas_execucoes where rotina = 'reservas_vencidas' order by id");
    expect(ficaram.rows).toEqual([{ situacao: "ok", dias: 29 }, { situacao: "pulada", dias: 29 }, { situacao: "falha", dias: 89 }]);
    const historicoQueFicou = await db.query<{ jobname: string; dias: number }>(`
      select j.jobname, extract(day from now() - d.end_time)::int as dias from cron.job_run_details d join cron.job j on j.jobid = d.jobid order by j.jobname`);
    expect(historicoQueFicou.rows).toEqual([{ jobname: "ora5g-reservas-vencidas", dias: 6 }, { jobname: "outra-tarefa", dias: 30 }]);
  });
});

describe("a situação das rotinas, na Saúde da operação (ORA-QUAL-006)", () => {
  it("sem rodada ainda, aguardando; depois de uma rodada certa, em dia", async () => {
    expect((await situacoes()).map((s) => [s.nome, s.situacao])).toEqual([["limpeza_dos_registros", "aguardando"], ["reservas_vencidas", "aguardando"]]);
    await rodar("reservas_vencidas");
    const vencimento = await daRotina("reservas_vencidas");
    expect(vencimento).toMatchObject({ situacao: "em_dia", ultima_falha: null, erro: null });
    expect(vencimento?.ultima_ok).not.toBeNull();
  });

  it("com falha quando a última rodada falhou; uma rodada certa depois volta a em dia, e a última falha continua à vista", async () => {
    const reserva = await naLoja(ids.vendedorA, ids.lojaA, () => reservar(cat.capa, null, "rot:situacao"));
    await rodadaCerta("reservas_vencidas", 3);
    await quebrarVencimento(reserva);
    await rodar("reservas_vencidas");
    expect(await daRotina("reservas_vencidas")).toMatchObject({ situacao: "com_falha", erro: "57014" });
    await rodadaCerta("reservas_vencidas", -1);
    const depois = await daRotina("reservas_vencidas");
    expect(depois).toMatchObject({ situacao: "em_dia", erro: null });
    expect(depois?.ultima_falha).not.toBeNull();
  });

  it("atrasada sem rodada certa no prazo (20 minutos no vencimento) ou quando nunca rodou muito depois de criada", async () => {
    await rodadaCerta("reservas_vencidas", 19);
    expect((await daRotina("reservas_vencidas"))?.situacao).toBe("em_dia");
    await db.query("delete from privado.rotinas_execucoes");
    await rodadaCerta("reservas_vencidas", 21);
    expect((await daRotina("reservas_vencidas"))?.situacao).toBe("atrasada");
    await db.query("update privado.rotinas set criada_em = now() - interval '27 hours' where nome = 'limpeza_dos_registros'");
    expect((await daRotina("limpeza_dos_registros"))?.situacao).toBe("atrasada");
  });

  it("o dono (a rede) e o gerente (a loja dele) leem; o vendedor, o técnico e o visitante, não", async () => {
    expect(await situacoes(ids.dono, ids.lojaA)).toHaveLength(2);
    expect(await situacoes(ids.gerenteB, ids.lojaB)).toHaveLength(2);
    for (const [usuario, unidade] of [[ids.vendedorA, ids.lojaA], [ids.tecnico, ids.assistencia]] as const) {
      await naLoja(usuario, unidade, async () => {
        expect(await erroDe(() => db.query("select * from public.rotinas_situacao()"))).toBe("42501");
      });
    }
    await comoUsuario(db, null, async () => {
      expect(await erroDe(() => db.query("select * from public.rotinas_situacao()"))).toBe("42501");
    });
  });
});
