// Fechamento do bônus por meta (lote L9b; decisão do proprietário de 13/11/2026, D-014): a gerência
// confere o mês que terminou e contesta com motivo; o dono decide cada contestação, paga outro valor com
// motivo e aprova; o valor de cada vendedor fica gravado e nada muda depois. Banco em memória com todas
// as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = (prefixo = "l9b") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `77000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string; mensagem: string }> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return { v };
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      return { codigo: (e as { code?: string }).code ?? "sem-codigo", mensagem: (e as Error).message };
    }
  });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.codigo}: ${r.mensagem}`);
  return r.v;
}
const codigo = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};
/** "código: mensagem" da recusa, ou null se passou. */
const recusa = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? `${r.codigo}: ${r.mensagem}` : null;
};
/** Código do erro de um comando direto no banco (sem passar pelas funções), ou null se passou. */
async function erroDireto(sql: string): Promise<string | null> {
  await db.exec("savepoint direto");
  try {
    await db.exec(sql);
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "sem-codigo";
  } finally {
    await db.exec("rollback to savepoint direto");
    await db.exec("release savepoint direto");
  }
}

const ENVIAR = "select public.bonus_fechamento_enviar($1::date, $2, $3::jsonb, $4::jsonb) as v";
const APROVAR = "select public.bonus_fechamento_aprovar($1, $2::jsonb) as v";
const LER = "select public.bonus_fechamento_do_mes($1::date, $2) as v";
const BONUS = "select public.bonus_do_mes($1::date, $2) as v";
const json = (valores: unknown) => JSON.stringify(valores);
const esteMes = () => `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7)}-01`;
const somarMeses = (n: number) => { const d = new Date(`${esteMes()}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const PASSADO = somarMeses(-1);
const inteiros = <T>(v: T): T => JSON.parse(JSON.stringify(v), (_, x: unknown) => (typeof x === "string" && /^-?\d+$/.test(x) ? Number(x) : x)) as T;
const faixa = (a_partir_de: number, valor: number) => ({ a_partir_de, valor });

type Apuracao = { mes: string; regras: Record<string, unknown>; vendedores: { vendedor_id: string; total: number }[] };
type Contestacao = { motivo: string; contestada_em: string; decisao: string | null; resposta: string | null; decidida_em: string | null };
type Linha = { vendedor_id: string; total_calculado: number; total_aprovado: number | null; ajuste_motivo: string | null; aprovado_em: string | null; contestacao: Contestacao | null };
type Lido = {
  mes: string;
  unidade_id: string;
  fechamento: null | {
    id: string; situacao: string; apuracao: Apuracao; total_calculado: number; total_aprovado: number | null;
    enviado_por: string; enviado_em: string; aprovado_por: string | null; aprovado_em: string | null;
  };
  linhas: Linha[];
};

const bonus = async (s: Sessao, unidade: string, mes = PASSADO) => inteiros(await valor<Apuracao>(s, BONUS, [mes, unidade]));
const totaisDe = (apuracao: Apuracao) => Object.fromEntries(apuracao.vendedores.map((v) => [v.vendedor_id, v.total]));
const ler = async (s: Sessao, unidade: string, mes = PASSADO) => inteiros(await valor<Lido>(s, LER, [mes, unidade]));
const visiveis = (s: Sessao) => valor<{ fechamentos: number; linhas: number; contestacoes: number }>(s,
  "select json_build_object('fechamentos', (select count(*) from public.bonus_fechamentos), 'linhas', (select count(*) from public.bonus_fechamento_linhas), 'contestacoes', (select count(*) from public.bonus_contestacoes)) as v");

/** Ativações do Ora Connect confirmadas no dia 15 do mês pedido, gravadas direto (com a data). */
async function connectNoMes(unidade: string, vendedor: string, mes: string, quantas: number) {
  for (let i = 0; i < quantas; i++) {
    const op = (await db.query<{ id: string }>(
      "insert into public.connect_operacoes (organizacao_id, unidade_id, vendedor_id, tipo, chave, conteudo, situacao, metodo_pagamento, ddd, plano_id, esim) values ($1, $2, $3, 'ativacao', $4, '{}', 'confirmada', 'LINK', 41, 1, true) returning id",
      [ids.organizacao, unidade, vendedor, chave("op")])).rows[0]?.id;
    await db.query(
      "insert into public.connect_producao (organizacao_id, unidade_id, vendedor_id, operacao_id, tipo, origem, confirmado_em) values ($1, $2, $3, $4, 'ativacao', 'evidencia_da_operadora', $5::date + interval '14 days 15 hours')",
      [ids.organizacao, unidade, vendedor, op, mes]);
  }
}
const regra = (medida: string, faixas: unknown, mes = PASSADO) => db.query(
  "insert into public.bonus_regras (organizacao_id, medida, vigente_desde, faixas, definida_por) values ($1, $2, $3::date, $4::jsonb, $5)",
  [ids.organizacao, medida, mes, json(faixas), ids.dono]);
const meta = (unidade: string, vendedor: string, medida: string, valorDaMeta: number, mes = PASSADO) => db.query(
  "insert into public.metas (organizacao_id, unidade_id, vendedor_id, mes, medida, valor, definida_por) values ($1, $2, $3, $4::date, $5, $6, $7)",
  [ids.organizacao, unidade, vendedor, mes, medida, valorDaMeta, ids.dono]);

/**
 * O mês passado, gravado direto (pela tela, o mês que terminou não muda): a regra do Ora Connect
 * (100% da meta, R$ 300; 150%, R$ 500), as metas e as ativações. Loja A: a vendedora A bate 100%
 * (R$ 300) e o vendedor AB fica em 25% (sem bônus); loja B: o vendedor AB bate 150% (R$ 500).
 */
async function mesPassado() {
  await regra("connect", [faixa(100, 30_000), faixa(150, 50_000)]);
  await meta(ids.lojaA, ids.vendedorA, "connect", 2);
  await meta(ids.lojaA, ids.vendedorAB, "connect", 4);
  await meta(ids.lojaB, ids.vendedorAB, "connect", 2);
  await connectNoMes(ids.lojaA, ids.vendedorA, PASSADO, 2);
  await connectNoMes(ids.lojaA, ids.vendedorAB, PASSADO, 1);
  await connectNoMes(ids.lojaB, ids.vendedorAB, PASSADO, 3);
}

describe("fechamento do bônus (L9b): a gerência confere e contesta, o dono aprova", () => {
  it("permissões: bonus.conferir para o gerente e o dono; bonus.aprovar só para o dono", async () => {
    const { rows } = await db.query<{ papel: string; permissao: string }>(
      "select papel, permissao from public.papel_permissoes where permissao in ('bonus.conferir', 'bonus.aprovar') order by permissao, papel");
    expect(rows).toEqual([
      { papel: "dono", permissao: "bonus.aprovar" }, { papel: "dono", permissao: "bonus.conferir" }, { papel: "gerente", permissao: "bonus.conferir" },
    ]);
  });

  it("a gerente envia o mês que terminou: o banco grava a apuração de bonus_do_mes, uma linha por vendedor e a contestação, auditados", async () => {
    await mesPassado();
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const apuracao = await bonus(gerente, ids.lojaB);
    expect(totaisDe(apuracao)).toEqual({ [ids.vendedorAB]: 50_000 });
    const id = await valor<string>(gerente, ENVIAR, [PASSADO, ids.lojaB, json(totaisDe(apuracao)), json({ [ids.vendedorAB]: "  Faltou   a ativação do dia 31  " })]);
    const lido = await ler(gerente, ids.lojaB);
    expect(lido.fechamento).toMatchObject({ id, situacao: "enviado", total_calculado: 50_000, total_aprovado: null, enviado_por: ids.gerenteB, aprovado_por: null, aprovado_em: null });
    expect(lido.fechamento?.apuracao).toEqual(apuracao);
    expect(lido.linhas).toEqual([{
      vendedor_id: ids.vendedorAB, total_calculado: 50_000, total_aprovado: null, ajuste_motivo: null, aprovado_em: null,
      contestacao: { motivo: "Faltou a ativação do dia 31", contestada_em: expect.any(String), decisao: null, resposta: null, decidida_em: null },
    }]);
    const auditoria = (await db.query<{ acao: string; motivo: string | null; usuario_id: string | null }>(
      "select acao, motivo, usuario_id from public.auditoria where alvo_tipo in ('bonus_fechamentos', 'bonus_fechamento_linhas', 'bonus_contestacoes') order by id")).rows;
    expect(auditoria.map((a) => a.acao)).toEqual(["bonus_fechamentos.criado", "bonus_fechamento_linhas.criado", "bonus_contestacoes.criado"]);
    expect(auditoria.every((a) => a.usuario_id === ids.gerenteB && /^Fechamento do bônus de \d{2}\/\d{4} enviado para a aprovação do dono$/.test(a.motivo ?? ""))).toBe(true);
  });

  it("o mês que não terminou, o mês sem regra e a loja sem ninguém não fecham; os totais têm de ser os da tela; um fechamento por loja e mês", async () => {
    await mesPassado();
    const dono = await naLoja(ids.dono, ids.lojaA);
    const totais = totaisDe(await bonus(dono, ids.lojaA));
    expect(totais).toEqual({ [ids.vendedorA]: 30_000, [ids.vendedorAB]: 0 });
    const enviar = (params: unknown[]) => recusa(dono, ENVIAR, params);
    expect(await enviar([esteMes(), ids.lojaA, json({}), null])).toBe("22023: O mês ainda não terminou: o fechamento abre no dia 1º do mês seguinte");
    expect(await enviar([somarMeses(1), ids.lojaA, json({}), null])).toBe("22023: O mês ainda não terminou: o fechamento abre no dia 1º do mês seguinte");
    expect(await enviar([somarMeses(-2), ids.lojaA, json({}), null])).toBe("22023: Nenhuma regra de bônus valia neste mês: não há o que fechar");
    expect(await enviar([PASSADO, ids.lojaC, json({}), null])).toBe("22023: Ninguém teve meta ou venda neste mês: não há o que fechar");
    const MUDOU = "22023: Os números do mês mudaram desde que a tela abriu: confira de novo";
    expect(await enviar([PASSADO, ids.lojaA, json({ ...totais, [ids.vendedorA]: 29_999 }), null])).toBe(MUDOU);
    expect(await enviar([PASSADO, ids.lojaA, json({ [ids.vendedorA]: 30_000 }), null])).toBe(MUDOU);
    expect(await enviar([PASSADO, ids.lojaA, json({ ...totais, [ids.gerenteB]: 0 }), null])).toBe(MUDOU);
    const FORMATO = "22023: Envie os totais conferidos e as contestações";
    expect(await enviar([PASSADO, ids.lojaA, null, null])).toBe(FORMATO);
    expect(await enviar([PASSADO, ids.lojaA, json([30_000, 0]), null])).toBe(FORMATO);
    expect(await enviar([PASSADO, ids.lojaA, json(totais), json(["Contestação solta"])])).toBe(FORMATO);
    expect(await enviar([PASSADO, ids.lojaA, json(totais), json({ [ids.gerenteB]: "Não vende aqui" })])).toBe("22023: Contestação de quem não está no fechamento");
    const MOTIVO = "22023: Cada contestação tem um motivo de 3 a 300 letras";
    for (const motivo of ["  a ", "", 5, null, "x".repeat(301)]) {
      expect(await enviar([PASSADO, ids.lojaA, json(totais), json({ [ids.vendedorA]: motivo })])).toBe(MOTIVO);
    }
    // Nada foi gravado nas recusas; o envio certo vale uma vez só, pedido por qualquer dia do mês.
    expect((await db.query("select 1 from public.bonus_fechamentos")).rows).toHaveLength(0);
    expect(await enviar([`${PASSADO.slice(0, 8)}20`, ids.lojaA, json(totais), null])).toBeNull();
    expect(await enviar([PASSADO, ids.lojaA, json(totais), null])).toBe("22023: O fechamento deste mês já foi enviado");
    expect((await ler(dono, ids.lojaA)).fechamento).toMatchObject({ situacao: "enviado", total_calculado: 30_000 });
  });

  it("só quem confere a loja envia: a gerente na dela e o dono em todas; o vendedor, a gerente em outra loja, o administrador e a outra rede, não", async () => {
    await mesPassado();
    const totaisA = totaisDe(await bonus(await naLoja(ids.dono, ids.lojaA), ids.lojaA));
    const enviarA = (s: Sessao) => codigo(s, ENVIAR, [PASSADO, ids.lojaA, json(totaisA), null]);
    expect(await enviarA(await naLoja(ids.vendedorA, ids.lojaA))).toBe("42501");
    expect(await enviarA(await naLoja(ids.gerenteB, ids.lojaB))).toBe("42501");
    expect(await enviarA(await naLoja(ids.administrador, ids.lojaA))).toBe("42501");
    expect(await enviarA(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg))).toBe("42501");
    expect(await codigo(await naLoja(ids.vendedorAB, ids.lojaB), ENVIAR, [PASSADO, ids.lojaB, json({ [ids.vendedorAB]: 50_000 }), null])).toBe("42501");
    expect((await db.query("select 1 from public.bonus_fechamentos")).rows).toHaveLength(0);
    // O dono confere qualquer loja da rede, do turno de qualquer uma; a gerente, a dela.
    expect(await enviarA(await naLoja(ids.dono, ids.lojaB))).toBeNull();
    expect(await codigo(await naLoja(ids.gerenteB, ids.lojaB), ENVIAR, [PASSADO, ids.lojaB, json({ [ids.vendedorAB]: 50_000 }), null])).toBeNull();
  });

  it("o dono aprova: decide a contestação, paga outro valor com motivo, e o valor de cada vendedor fica gravado", async () => {
    await mesPassado();
    const dono = await naLoja(ids.dono, ids.lojaA);
    const totais = totaisDe(await bonus(dono, ids.lojaA));
    const id = await valor<string>(dono, ENVIAR, [PASSADO, ids.lojaA, json(totais), json({ [ids.vendedorAB]: "A ativação de 31/10 só confirmou no dia 1º" })]);
    const aprovar = (decisoes: unknown) => recusa(dono, APROVAR, [id, json(decisoes)]);
    expect(await aprovar({})).toBe("22023: Decida cada contestação: manter o valor ou pagar outro");
    expect(await aprovar({ [ids.vendedorA]: { decisao: "manter" } })).toBe("22023: Decida cada contestação: manter o valor ou pagar outro");
    expect(await aprovar({ [ids.vendedorAB]: { decisao: "ajustar", valor: 0, motivo: "O mesmo valor" } })).toBe("22023: Para pagar o valor calculado, escolha manter");
    expect(await aprovar({ [ids.vendedorAB]: { decisao: "ajustar", valor: 30_000 } })).toBe("22023: Diga o motivo de pagar outro valor: o vendedor vê");
    expect(await aprovar({ [ids.vendedorAB]: { decisao: "ajustar", valor: 30_000, motivo: "   " } })).toBe("22023: Diga o motivo de pagar outro valor: o vendedor vê");
    const VALOR = "22023: O valor a pagar vai de R$ 0,00 a R$ 500.000,00";
    // PERF-a (18/11): o teto subiu de R$ 400.000,00 para R$ 500.000,00, as cinco medidas (com os chips) na faixa mais alta.
    for (const valorErrado of [50_000_001, -1, 1.5, "30000", null]) {
      expect(await aprovar({ [ids.vendedorAB]: { decisao: "ajustar", valor: valorErrado, motivo: "Valor errado" } })).toBe(VALOR);
    }
    const DECISAO = "22023: Cada decisão é manter o valor ou pagar outro";
    expect(await aprovar({ [ids.vendedorAB]: { decisao: "aceitar" } })).toBe(DECISAO);
    expect(await aprovar({ [ids.vendedorAB]: { decisao: "manter", valor: 0 } })).toBe(DECISAO);
    expect(await aprovar({ [ids.vendedorAB]: { decisao: "manter", extra: 1 } })).toBe(DECISAO);
    expect(await aprovar({ [ids.vendedorAB]: "manter" })).toBe(DECISAO);
    expect(await aprovar([])).toBe(DECISAO);
    expect(await aprovar({ [ids.vendedorAB]: { decisao: "manter", motivo: "x" } })).toBe("22023: O motivo tem de 3 a 300 letras");
    expect(await aprovar({ [ids.vendedorAB]: { decisao: "manter", motivo: 12 } })).toBe("22023: O motivo tem de 3 a 300 letras");
    expect(await aprovar({ [ids.vendedorAB]: { decisao: "manter" }, [ids.gerenteB]: { decisao: "manter" } })).toBe("22023: Decisão de quem não está no fechamento");
    // As recusas não mudaram nada.
    expect((await ler(dono, ids.lojaA)).fechamento?.situacao).toBe("enviado");

    const total = await valor<number | string>(dono, APROVAR, [id, json({
      [ids.vendedorAB]: { decisao: "ajustar", valor: 30_000, motivo: "  A ativação de 31/10   conta em outubro  " },
    })]);
    expect(Number(total)).toBe(60_000);
    const lido = await ler(dono, ids.lojaA);
    expect(lido.fechamento).toMatchObject({ situacao: "aprovado", total_calculado: 30_000, total_aprovado: 60_000, aprovado_por: ids.dono, aprovado_em: expect.any(String) });
    expect(lido.linhas.map((l) => [l.vendedor_id, l.total_calculado, l.total_aprovado, l.ajuste_motivo, l.contestacao?.decisao ?? null, l.contestacao?.resposta ?? null])).toEqual([
      [ids.vendedorA, 30_000, 30_000, null, null, null],
      [ids.vendedorAB, 0, 30_000, "A ativação de 31/10 conta em outubro", "ajustado", "A ativação de 31/10 conta em outubro"],
    ]);
    expect(lido.linhas.every((l) => l.aprovado_em !== null)).toBe(true);
    const auditoria = (await db.query<{ acao: string; motivo: string | null }>(
      "select acao, motivo from public.auditoria where alvo_tipo = 'bonus_fechamentos' order by id")).rows;
    expect(auditoria.map((a) => a.acao)).toEqual(["bonus_fechamentos.criado", "bonus_fechamentos.alterado"]);
    expect(auditoria[1]?.motivo).toMatch(/^Pagamento do bônus de \d{2}\/\d{4} aprovado pelo dono$/);
  });

  it("manter a contestação guarda a resposta só para a gestão; aprovado, nada muda nem se apaga, nem direto no banco", async () => {
    await mesPassado();
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const id = await valor<string>(gerente, ENVIAR, [PASSADO, ids.lojaB, json({ [ids.vendedorAB]: 50_000 }), json({ [ids.vendedorAB]: "Conferir a meta" })]);
    // Antes da aprovação, o envio também não muda (só a aprovação preenche o que falta).
    expect(await erroDireto("update public.bonus_fechamentos set apuracao = '{}'::jsonb")).toBe("42501");
    expect(await erroDireto("update public.bonus_fechamento_linhas set total_calculado = 1")).toBe("42501");
    expect(await erroDireto("update public.bonus_contestacoes set motivo = 'Outro motivo'")).toBe("42501");
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(Number(await valor(dono, APROVAR, [id, json({ [ids.vendedorAB]: { decisao: "manter", motivo: "A meta era 2 mesmo" } })]))).toBe(50_000);
    expect((await ler(gerente, ids.lojaB)).linhas).toEqual([expect.objectContaining({
      total_calculado: 50_000, total_aprovado: 50_000, ajuste_motivo: null, contestacao: expect.objectContaining({ decisao: "mantido", resposta: "A meta era 2 mesmo" }),
    })]);
    // O vendedor vê o valor aprovado, sem a contestação nem a resposta.
    expect((await ler(await naLoja(ids.vendedorAB, ids.lojaB), ids.lojaB)).linhas).toEqual([{
      vendedor_id: ids.vendedorAB, total_calculado: 50_000, total_aprovado: 50_000, ajuste_motivo: null, aprovado_em: expect.any(String), contestacao: null,
    }]);
    expect(await recusa(dono, APROVAR, [id, json({ [ids.vendedorAB]: { decisao: "manter" } })])).toBe("22023: Este fechamento já foi aprovado");
    for (const sql of [
      "update public.bonus_fechamentos set total_aprovado = 1",
      "update public.bonus_fechamentos set situacao = 'enviado', aprovado_em = null, aprovado_por = null, total_aprovado = null",
      "update public.bonus_fechamento_linhas set total_aprovado = 1, ajuste_motivo = 'Mudou depois'",
      "update public.bonus_contestacoes set resposta = 'Mudou depois'",
      "delete from public.bonus_contestacoes",
      "delete from public.bonus_fechamento_linhas",
      "delete from public.bonus_fechamentos",
      "truncate public.bonus_contestacoes",
    ]) expect(await erroDireto(sql), sql).toBe("42501");
  });

  it("só o dono aprova: a gerente que enviou, o vendedor, o administrador e a outra rede, não; fechamento que não existe tem a mesma recusa", async () => {
    await mesPassado();
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const id = await valor<string>(gerente, ENVIAR, [PASSADO, ids.lojaB, json({ [ids.vendedorAB]: 50_000 }), null]);
    for (const s of [gerente, await naLoja(ids.vendedorAB, ids.lojaB), await naLoja(ids.administrador, ids.lojaA), await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg)]) {
      expect(await codigo(s, APROVAR, [id, json({})])).toBe("42501");
    }
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await codigo(dono, APROVAR, ["00000000-0000-4000-8000-000000000999", json({})])).toBe("42501");
    expect((await ler(dono, ids.lojaB)).fechamento?.situacao).toBe("enviado");
    // Sem contestação, aprovar sem decisões paga o calculado.
    expect(Number(await valor(dono, APROVAR, [id, null]))).toBe(50_000);
  });

  it("quem lê o quê: a gestão vê a apuração, as linhas e as contestações; o vendedor, só a própria linha; a outra loja e a outra rede, nada", async () => {
    await mesPassado();
    const dono = await naLoja(ids.dono, ids.lojaA);
    const id = await valor<string>(dono, ENVIAR, [PASSADO, ids.lojaA, json(totaisDe(await bonus(dono, ids.lojaA))), json({ [ids.vendedorA]: "Conferir a venda 12" })]);
    // A vendedora A vê só a própria linha, sem a contestação; a apuração da loja inteira, não.
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await ler(ana, ids.lojaA)).toEqual({
      mes: PASSADO, unidade_id: ids.lojaA, fechamento: null,
      linhas: [{ vendedor_id: ids.vendedorA, total_calculado: 30_000, total_aprovado: null, ajuste_motivo: null, aprovado_em: null, contestacao: null }],
    });
    expect(inteiros(await visiveis(ana))).toEqual({ fechamentos: 0, linhas: 1, contestacoes: 0 });
    // O colega da mesma loja vê a dele, não a da colega.
    expect((await ler(await naLoja(ids.vendedorAB, ids.lojaA), ids.lojaA)).linhas.map((l) => l.vendedor_id)).toEqual([ids.vendedorAB]);
    // A gerente da loja B não lê a loja A; a outra rede, nada.
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await codigo(gerente, LER, [PASSADO, ids.lojaA])).toBe("42501");
    expect(inteiros(await visiveis(gerente))).toEqual({ fechamentos: 0, linhas: 0, contestacoes: 0 });
    expect(await codigo(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), LER, [PASSADO, ids.lojaA])).toBe("42501");
    // Na loja em que não trabalha, nem a própria linha.
    expect(await codigo(ana, LER, [PASSADO, ids.lojaB])).toBe("42501");
    // A gestão vê tudo.
    const daGestao = await ler(dono, ids.lojaA);
    expect(daGestao.fechamento?.id).toBe(id);
    expect(daGestao.linhas.map((l) => [l.vendedor_id, l.contestacao?.motivo ?? null])).toEqual([[ids.vendedorA, "Conferir a venda 12"], [ids.vendedorAB, null]]);
    // Loja ainda não enviada: sem fechamento e sem linhas.
    expect(await ler(dono, ids.lojaB)).toEqual({ mes: PASSADO, unidade_id: ids.lojaB, fechamento: null, linhas: [] });
    expect(await codigo(dono, "select public.bonus_fechamento_do_mes(null, $1) as v", [ids.lojaA])).toBe("22023");
  });

  it("o mês aprovado não muda: a devolução depois do fechamento desconta no mês em que acontece", async () => {
    await mesPassado();
    // Uma capa vendida pela vendedora A, concluída agora e passada para o mês passado (gravado direto).
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    const capa = await valor<string>(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, json([{ meio: "dinheiro", valor: 7_900 }]), chave("concluir")]);
    await db.exec("set session_replication_role = replica");
    await db.query("update public.vendas set concluida_em = $2::date + interval '19 days 15 hours' where id = $1", [venda, PASSADO]);
    await db.exec("set session_replication_role = origin");
    // Regra e meta do vendido líquido no mês passado: R$ 79,00 bate 100% (R$ 100 de bônus).
    await regra("vendido_liquido", [faixa(100, 10_000)]);
    await meta(ids.lojaA, ids.vendedorA, "vendido_liquido", 7_900);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const antes = await bonus(dono, ids.lojaA);
    expect(totaisDe(antes)).toEqual({ [ids.vendedorA]: 40_000, [ids.vendedorAB]: 0 });
    const id = await valor<string>(dono, ENVIAR, [PASSADO, ids.lojaA, json(totaisDe(antes)), null]);
    expect(Number(await valor(dono, APROVAR, [id, null]))).toBe(40_000);
    const aprovado = await ler(dono, ids.lojaA);
    // A capa volta hoje: o desconto cai neste mês, não no mês fechado.
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    await valor(dono, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, 'Cliente desistiu', $4) as v",
      [venda, json([{ item: capa, quantidade: 1, condicao: "novo" }]), json([{ meio: "dinheiro", valor: 7_900 }]), chave("dev")]);
    expect(await bonus(dono, ids.lojaA)).toEqual(antes);
    expect(await ler(dono, ids.lojaA)).toEqual(aprovado);
    const painel = inteiros(await valor<{ vendedores: { vendedor_id: string; realizado: Record<string, number> }[] }>(dono, "select public.metas_painel($1::date, $2) as v", [esteMes(), ids.lojaA]));
    expect(painel.vendedores.find((v) => v.vendedor_id === ids.vendedorA)?.realizado.vendido_liquido).toBe(-7_900);
  });
});
