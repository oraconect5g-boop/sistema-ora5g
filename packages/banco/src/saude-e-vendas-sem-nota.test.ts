// Lote SAUDE-a (17/11/2026; plano do proprietário de 16/11, Onda 0.6; ADR-012; migration
// 20261117145723_saude_do_banco_e_vendas_sem_nota): a fila "Vendas sem pedido de nota" da Saúde da operação, com a mesma
// regra do grupo "sem pedido" da conciliação fiscal (L10b), sem período; e a leitura leve do banco que a página pública
// /saude faz sem login. Dados FICTÍCIOS; nada é emitido.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
let mes = { inicio: "", fim: "" };
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  mes = (await db.query<typeof mes>(`
    select to_char(date_trunc('month', now() at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD') as inicio,
           to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as fim`)).rows[0] as typeof mes;
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = (prefixo: string) => `${prefixo}:${++chaves}`;
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
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `49500000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

// Uma capa (R$ 79,00) vendida e paga em dinheiro por quem está na loja.
async function vendaConcluida(s: Sessao) {
  const aberto = await db.query("select 1 from public.caixas where operador_id = $1 and situacao = 'aberto'", [s.usuario]);
  if (aberto.rows.length === 0) await valor(s, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  const item = await valor<string>(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [venda, chave("concluir")]);
  return { venda, item };
}
const pedirNota = (s: Sessao, venda: string) => valor<string>(s, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [venda, chave("nota")]);
const FILA = "select public.notas_vendas_sem_pedido() as v";
type Fila = { quantidade: number; desde: string | null };
const fila = (s: Sessao) => valor<Fila>(s, FILA);
const concluidaEm = async (venda: string) =>
  (await db.query<{ t: string }>("select to_json(concluida_em)#>>'{}' as t from public.vendas where id = $1", [venda])).rows[0]?.t as string;
const mesmoInstante = (a: string | null, b: string) => a !== null && Date.parse(a) === Date.parse(b);

describe("a fila das vendas sem pedido de nota (SAUDE-a)", () => {
  it("é o grupo 'sem pedido' da conciliação: a venda com nota, com pedido em andamento, devolvida inteira ou cancelada fica fora", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await fila(dono)).toEqual({ quantidade: 0, desde: null });

    const comPedido = await vendaConcluida(ana);
    await pedirNota(ana, comPedido.venda);
    const semPedido = await vendaConcluida(ana);
    const devolvida = await vendaConcluida(ana);
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    await valor(dono, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, 'Cliente desistiu', $4) as v",
      [devolvida.venda, JSON.stringify([{ item: devolvida.item, quantidade: 1, condicao: "novo" }]), JSON.stringify([{ meio: "dinheiro", valor: 7900 }]), chave("dev")]);
    const cancelada = await vendaConcluida(ana);
    await valor(dono, "select public.cancelar_venda($1, 'Venda de teste cancelada') as v", [cancelada.venda]);
    const bia = await naLoja(ids.vendedorAB, ids.lojaB);
    const daLojaB = await vendaConcluida(bia);

    const daRede = await fila(dono);
    expect(daRede.quantidade).toBe(2);
    expect(mesmoInstante(daRede.desde, await concluidaEm(semPedido.venda))).toBe(true);
    // A mesma conta da conciliação fiscal do mês, que lista as duas.
    const conciliacao = await valor<{ resumo: { sem_pedido: number } }>(dono, "select public.notas_conciliacao($1::date, $2::date, null) as v", [mes.inicio, mes.fim]);
    expect(conciliacao.resumo.sem_pedido).toBe(daRede.quantidade);

    // A gerência da loja B vê só a dela; pedir a nota tira a venda da fila.
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await fila(gerenteB)).toMatchObject({ quantidade: 1 });
    await pedirNota(bia, daLojaB.venda);
    expect(await fila(gerenteB)).toEqual({ quantidade: 0, desde: null });
    expect((await fila(dono)).quantidade).toBe(1);
  });

  it("não tem período: a venda antiga sem pedido continua na fila e dá a data da mais antiga", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const antiga = await vendaConcluida(ana);
    await db.query("update public.vendas set concluida_em = concluida_em - interval '400 days' where id = $1", [antiga.venda]);
    await vendaConcluida(ana);
    const r = await fila(dono);
    expect(r.quantidade).toBe(2);
    expect(mesmoInstante(r.desde, await concluidaEm(antiga.venda))).toBe(true);
  });

  it("só quem aprova nota lê: o vendedor e o técnico são recusados, e o visitante nem executa", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await vendaConcluida(ana);
    expect(await errou(ana, FILA)).toBe("42501");
    const tecnico = await naLoja(ids.tecnico, ids.assistencia);
    expect(await errou(tecnico, FILA)).toBe("42501");
    await db.exec("set role anon");
    try {
      expect(await erroDe(() => db.query(FILA))).toBe("42501");
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("a leitura leve do banco na página /saude (SAUDE-a)", () => {
  const SAUDE = "select public.saude_do_banco($1) as v";
  async function comoVisitante<T>(acao: () => Promise<T>): Promise<T> {
    await db.exec("set role anon");
    try { return await acao(); } finally { await db.exec("reset role"); }
  }
  const saude = (versao: string | null) => comoVisitante(async () => (await db.query<{ v: { hora: string; migracao: boolean | null } }>(SAUDE, [versao])).rows[0]?.v);

  it("o visitante executa e recebe só a hora do banco e, sem o histórico das migrations, nada sobre elas", async () => {
    const r = await saude("20261117145723");
    expect(Object.keys(r ?? {}).sort()).toEqual(["hora", "migracao"]);
    expect(Number.isNaN(Date.parse(r?.hora ?? ""))).toBe(false);
    expect(r?.migracao).toBeNull();
  });

  it("com o histórico do Supabase, diz se a migration da versão publicada está no banco; versão fora do formato não é procurada", async () => {
    await db.exec("create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text)");
    await db.query("insert into supabase_migrations.schema_migrations (version, name) values ('20261117145723', 'saude_do_banco_e_vendas_sem_nota')");
    expect((await saude("20261117145723"))?.migracao).toBe(true);
    expect((await saude("20991231000000"))?.migracao).toBe(false);
    expect((await saude("2026' or '1'='1"))?.migracao).toBeNull();
    expect((await saude(null))?.migracao).toBeNull();
    // O visitante continua sem ler o histórico direto: só pela função.
    expect(await comoVisitante(() => erroDe(() => db.query("select version from supabase_migrations.schema_migrations")))).toBe("42501");
    // Quem está logado também lê.
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await valor<{ migracao: boolean }>(dono, SAUDE, ["20261117145723"])).migracao).toBe(true);
  });
});
