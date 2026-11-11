// Funil de oportunidades e agenda de atividades (lote L5b: ORA-CRM-004, ORA-CRM-005). Banco em memória com
// todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, cpf, criarBanco, type Sessao } from "./banco-de-teste";
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
const chave = (prefixo = "form:crm") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `6d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
type Falha = { codigo: string; mensagem: string };
async function tentar<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<{ v: T } | Falha> {
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
async function valor<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const codigo = async (s: Sessao | null, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};
const linhas = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, async () => (await db.query<Record<string, unknown>>(sql, params)).rows);

const REGISTRAR = "select public.oportunidade_registrar($1, $2::jsonb, $3) as v";
const MOVER = "select public.oportunidade_mover($1, $2, $3::jsonb) as v";
const ATRIBUIR = "select public.oportunidade_atribuir($1, $2, $3) as v";
const ANOTAR = "select public.oportunidade_anotar($1, $2) as v";
const DETALHE = "select public.oportunidade_detalhe($1) as v";
const CRIAR = "select public.atividade_criar($1::jsonb, $2) as v";
const ENCERRAR = "select public.atividade_encerrar($1, $2, $3) as v";
const FUNIL = "select public.crm_funil() as v";
const AGENDA = "select public.crm_agenda() as v";
type Registrada = { id: string; numero: number; repetida: boolean };
type Funil = { gerencia: boolean; oportunidades: { id: string; cliente: string; etapa: string; responsavel: string; atrasada: boolean }[] };
type Agenda = { gerencia: boolean; atividades: { id: string; descricao: string; cliente: string | null; oportunidade_numero: number | null; atrasada: boolean }[] };
type Detalhe = { etapa: string; eventos: { tipo: string; de: string | null; para: string | null; texto: string | null; usuario: string }[]; equipe: { id: string; nome: string }[] | null };

const amanha = () => new Date(Date.now() + 86_400_000).toISOString();
const ontem = () => new Date(Date.now() - 3_600_000).toISOString();
async function clienteDe(s: Sessao, nome: string, base: string) {
  return (await valor<{ id: string }>(s, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v",
    [JSON.stringify({ tipo: "pessoa_fisica", nome, documento: cpf(base) }), chave("form:cli")])).id;
}
const lead = (extra: object = {}) => JSON.stringify({ origem: "whatsapp", campanha: "Black Friday", interesse: "Galaxy A15 e chip", valor_estimado: 149_900,
  proximo_passo: "Ligar para mostrar o aparelho", proximo_passo_em: amanha(), ...extra });

describe("oportunidades (ORA-CRM-004)", () => {
  it("quem atende registra do cliente da rede; chave repetida devolve a mesma; o funil mostra a cada um o que é seu e à gerência a loja", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const cliente = await clienteDe(ana, "Maria Teste", "529982247");
    const k = chave();
    const dados = lead();
    const op = await valor<Registrada>(ana, REGISTRAR, [cliente, dados, k]);
    expect(op.repetida).toBe(false);
    expect(await valor(ana, REGISTRAR, [cliente, dados, k])).toEqual({ ...op, repetida: true });
    expect(await codigo(ana, REGISTRAR, [cliente, lead({ interesse: "Outra coisa" }), k])).toBe("OR004");

    expect(await codigo(ana, REGISTRAR, [cliente, lead({ origem: "" }), chave()])).toBe("22023");
    expect(await codigo(ana, REGISTRAR, [cliente, lead({ interesse: "ok" }), chave()])).toBe("22023");
    expect(await codigo(ana, REGISTRAR, [cliente, lead({ proximo_passo_em: "" }), chave()])).toBe("22023");
    expect(await codigo(ana, REGISTRAR, [cliente, lead({ responsavel: ids.vendedorAB }), chave()])).toBe("42501");
    expect(await codigo(ana, REGISTRAR, ["00000000-0000-4000-8000-000000009999", lead(), chave()])).toBe("P0002");
    expect(await codigo(await naLoja(ids.administrador, ids.lojaA), REGISTRAR, [cliente, lead(), chave()])).toBe("42501");

    const funilAna = await valor<Funil>(ana, FUNIL);
    expect(funilAna).toMatchObject({ gerencia: false, oportunidades: [{ id: op.id, cliente: "Maria Teste", etapa: "novo", responsavel: "vendedor.a", atrasada: false }] });
    expect((await valor<Funil>(await naLoja(ids.vendedorAB, ids.lojaA), FUNIL)).oportunidades).toEqual([]);
    expect(await valor<Funil>(await naLoja(ids.dono, ids.lojaA), FUNIL)).toMatchObject({ gerencia: true, oportunidades: [{ id: op.id }] });
    expect((await valor<Funil>(await naLoja(ids.gerenteB, ids.lojaB), FUNIL)).oportunidades).toEqual([]);
    expect(await codigo(await naLoja(ids.tecnico, ids.assistencia), FUNIL)).toBe("42501");

    // Leitura direta pelas regras do banco (RLS).
    expect((await linhas(ana, "select id from public.oportunidades")).map((o) => o.id)).toEqual([op.id]);
    expect(await linhas(await naLoja(ids.vendedorAB, ids.lojaA), "select id from public.oportunidades")).toEqual([]);
    expect(await linhas(await naLoja(ids.gerenteB, ids.lojaB), "select id from public.oportunidades")).toEqual([]);
    expect((await linhas(ana, "select tipo, para from public.oportunidade_eventos where oportunidade_id = $1", [op.id]))).toEqual([{ tipo: "criada", para: "novo" }]);
  });

  it("etapas abertas com próximo passo e histórico; perdida pede o motivo; ganha aponta a venda do mesmo cliente; reabrir é da gerência", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const cliente = await clienteDe(ana, "Maria Teste", "529982247");
    const outro = await clienteDe(ana, "Outro Cliente", "111444777");
    const op = await valor<Registrada>(ana, REGISTRAR, [cliente, lead(), chave()]);
    expect(await valor(ana, MOVER, [op.id, "contato", JSON.stringify({ proximo_passo: "Mandar a proposta", proximo_passo_em: amanha() })])).toBe(true);
    expect(await valor(ana, MOVER, [op.id, "contato", JSON.stringify({ proximo_passo: "Mandar a proposta", proximo_passo_em: (await db.query<{ v: string }>(
      "select proximo_passo_em::text as v from public.oportunidades where id = $1", [op.id])).rows[0]?.v })])).toBe(false);
    expect(await valor(ana, MOVER, [op.id, "proposta", JSON.stringify({ proximo_passo: "Cobrar resposta", proximo_passo_em: ontem() })])).toBe(true);
    expect((await valor<Funil>(ana, FUNIL)).oportunidades[0]).toMatchObject({ etapa: "proposta", atrasada: true });
    expect(await codigo(ana, MOVER, [op.id, "voando", "{}"])).toBe("22023");
    expect(await codigo(ana, MOVER, [op.id, "perdida", "{}"])).toBe("22023");
    expect(await codigo(ana, MOVER, [op.id, "perdida", JSON.stringify({ motivo_perda: "outro" })])).toBe("22023");
    expect(await valor(ana, MOVER, [op.id, "perdida", JSON.stringify({ motivo_perda: "preco", observacao: "Achou mais barato" })])).toBe(true);
    expect((await db.query("select etapa, motivo_perda, proximo_passo, encerrado_em is not null as encerrada from public.oportunidades where id = $1", [op.id])).rows[0])
      .toEqual({ etapa: "perdida", motivo_perda: "preco", proximo_passo: null, encerrada: true });
    expect(await codigo(ana, MOVER, [op.id, "negociacao", JSON.stringify({ motivo: "Voltou" })])).toBe("42501");
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await codigo(dono, MOVER, [op.id, "negociacao", "{}"])).toBe("22023");
    expect(await valor(dono, MOVER, [op.id, "negociacao", JSON.stringify({ motivo: "Cliente voltou pedindo condição" })])).toBe(true);

    // Ganha com a venda concluída do mesmo cliente.
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
      [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), JSON.stringify({ id: outro }), chave("concluir")]);
    expect(await codigo(ana, MOVER, [op.id, "ganha", JSON.stringify({ venda })])).toBe("22023");
    await valor(ana, "select public.venda_vincular_cliente($1, $2, 'Era a Maria') as v", [venda, cliente]);
    expect(await valor(ana, MOVER, [op.id, "ganha", JSON.stringify({ venda })])).toBe(true);
    expect(await valor(ana, MOVER, [op.id, "ganha", "{}"])).toBe(false);

    const eventos = (await valor<Detalhe>(ana, DETALHE, [op.id])).eventos.map((e) => [e.tipo, e.de, e.para]).reverse();
    expect(eventos).toEqual([
      ["criada", null, "novo"], ["etapa", "novo", "contato"], ["proximo_passo", "Ligar para mostrar o aparelho", "Mandar a proposta"],
      ["etapa", "contato", "proposta"], ["proximo_passo", "Mandar a proposta", "Cobrar resposta"], ["etapa", "proposta", "perdida"],
      ["reaberta", "perdida", "negociacao"], ["etapa", "negociacao", "ganha"],
    ]);
  });

  it("trocar o responsável é da gerência, para quem atende na loja; quem perdeu a oportunidade não conduz mais", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const cliente = await clienteDe(ana, "Maria Teste", "529982247");
    const op = await valor<Registrada>(ana, REGISTRAR, [cliente, lead(), chave()]);
    const bia = await naLoja(ids.vendedorAB, ids.lojaA);
    expect(await codigo(bia, MOVER, [op.id, "contato", "{}"])).toBe("P0002");
    expect(await codigo(bia, ANOTAR, [op.id, "Tentativa"])).toBe("P0002");
    expect(await codigo(ana, ATRIBUIR, [op.id, ids.vendedorAB, "Folga"])).toBe("P0002");
    const dono = await naLoja(ids.dono, ids.lojaA);
    await db.query("update public.perfis_usuario set status = 'bloqueado' where id = $1", [ids.bloqueado]);
    expect(await codigo(dono, ATRIBUIR, [op.id, ids.bloqueado, "Bloqueado"])).toBe("22023");
    expect(await codigo(dono, ATRIBUIR, [op.id, ids.gerenteB, "Outra loja"])).toBe("22023");
    expect(await codigo(dono, ATRIBUIR, [op.id, ids.tecnico, "Não vende"])).toBe("22023");
    expect(await codigo(dono, ATRIBUIR, [op.id, ids.vendedorAB, ""])).toBe("22023");
    expect(await valor(dono, ATRIBUIR, [op.id, ids.vendedorAB, "Ana está de férias"])).toBe(true);
    expect(await valor(dono, ATRIBUIR, [op.id, ids.vendedorAB, "De novo"])).toBe(false);
    expect(await codigo(ana, MOVER, [op.id, "contato", "{}"])).toBe("P0002");
    expect(await valor(bia, ANOTAR, [op.id, "Cliente pediu para ligar depois das 18h"])).toBe(true);
    expect(await codigo(bia, ANOTAR, [op.id, "ok"])).toBe("22023");
    const detalhe = await valor<Detalhe>(dono, DETALHE, [op.id]);
    expect(detalhe.eventos.slice(0, 2).map((e) => [e.tipo, e.de, e.para, e.texto])).toEqual([
      ["nota", null, null, "Cliente pediu para ligar depois das 18h"], ["responsavel", "vendedor.a", "vendedor.ab", "Ana está de férias"],
    ]);
    expect(detalhe.equipe?.map((p) => p.nome)).toEqual(["dono", "vendedor.a", "vendedor.ab"]);
    expect((await valor<Detalhe>(bia, DETALHE, [op.id])).equipe).toBeNull();
    expect(await codigo(ana, DETALHE, [op.id])).toBe("P0002");
    expect((await db.query<{ motivo: string }>("select motivo from public.auditoria where acao = 'oportunidades.alterado' and alvo_id = $1", [op.id])).rows.map((r) => r.motivo))
      .toEqual(["Responsável da oportunidade: Ana está de férias"]);
  });
});

describe("agenda de atividades (ORA-CRM-005)", () => {
  it("cada um vê a sua agenda e a gerência a da loja; concluir e cancelar pedem o resultado; a oportunidade guarda o que foi feito", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const cliente = await clienteDe(ana, "Maria Teste", "529982247");
    const op = await valor<Registrada>(ana, REGISTRAR, [cliente, lead(), chave()]);
    const k = chave();
    const atividade = JSON.stringify({ tipo: "ligacao", descricao: "Ligar sobre a proposta", vence_em: ontem(), oportunidade: op.id });
    const ligar = await valor<{ id: string; repetida: boolean }>(ana, CRIAR, [atividade, k]);
    expect(await valor(ana, CRIAR, [atividade, k])).toEqual({ ...ligar, repetida: true });
    await valor(ana, CRIAR, [JSON.stringify({ tipo: "mensagem", descricao: "Mandar foto da capa", vence_em: amanha(), cliente }), chave()]);
    await valor(ana, CRIAR, [JSON.stringify({ tipo: "tarefa", descricao: "Conferir vitrine", vence_em: amanha() }), chave()]);
    expect(await codigo(ana, CRIAR, [JSON.stringify({ tipo: "voar", descricao: "x", vence_em: amanha() }), chave()])).toBe("22023");
    expect(await codigo(ana, CRIAR, [JSON.stringify({ tipo: "tarefa", descricao: "Sem data", vence_em: "amanhã" }), chave()])).toBe("22023");
    expect(await codigo(ana, CRIAR, [JSON.stringify({ tipo: "tarefa", descricao: "Para a colega", vence_em: amanha(), responsavel: ids.vendedorAB }), chave()])).toBe("42501");

    const agenda = await valor<Agenda>(ana, AGENDA);
    expect(agenda.atividades.map((a) => [a.descricao, a.cliente, a.oportunidade_numero, a.atrasada])).toEqual([
      ["Ligar sobre a proposta", "Maria Teste", op.numero, true], ["Mandar foto da capa", "Maria Teste", null, false], ["Conferir vitrine", null, null, false],
    ]);
    const bia = await naLoja(ids.vendedorAB, ids.lojaA);
    expect((await valor<Agenda>(bia, AGENDA)).atividades).toEqual([]);
    expect(await codigo(bia, CRIAR, [JSON.stringify({ tipo: "tarefa", descricao: "Na oportunidade dela", vence_em: amanha(), oportunidade: op.id }), chave()])).toBe("P0002");
    expect(await codigo(bia, ENCERRAR, [ligar.id, true, "Tentativa"])).toBe("P0002");
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await valor<Agenda>(dono, AGENDA)).atividades).toHaveLength(3);
    expect(await valor(dono, CRIAR, [JSON.stringify({ tipo: "visita", descricao: "Visitar a cliente", vence_em: amanha(), responsavel: ids.vendedorA, oportunidade: op.id }), chave()]))
      .toMatchObject({ repetida: false });

    expect(await codigo(ana, ENCERRAR, [ligar.id, true, ""])).toBe("22023");
    expect(await valor(ana, ENCERRAR, [ligar.id, true, "Cliente vem amanhã"])).toBe(true);
    expect(await valor(ana, ENCERRAR, [ligar.id, true, "Cliente vem amanhã"])).toBe(false);
    expect(await codigo(ana, ENCERRAR, [ligar.id, false, "Cancelar a feita"])).toBe("22023");
    expect((await db.query("select situacao, resultado, encerrada_por from public.atividades where id = $1", [ligar.id])).rows[0])
      .toEqual({ situacao: "feita", resultado: "Cliente vem amanhã", encerrada_por: ids.vendedorA });
    expect((await valor<Agenda>(ana, AGENDA)).atividades.map((a) => a.descricao)).toEqual(["Mandar foto da capa", "Conferir vitrine", "Visitar a cliente"]);
    const eventos = (await valor<Detalhe>(ana, DETALHE, [op.id])).eventos.filter((e) => e.tipo === "atividade").map((e) => [e.de, e.para, e.texto, e.usuario]).reverse();
    expect(eventos).toEqual([
      [null, "aberta", "Ligar sobre a proposta", "vendedor.a"], [null, "aberta", "Visitar a cliente", "dono"], ["aberta", "feita", "Ligar sobre a proposta: Cliente vem amanhã", "vendedor.a"],
    ]);
    // Oportunidade encerrada não recebe atividade nova.
    await valor(ana, MOVER, [op.id, "perdida", JSON.stringify({ motivo_perda: "desistiu" })]);
    expect(await codigo(ana, CRIAR, [JSON.stringify({ tipo: "ligacao", descricao: "Tentar de novo", vence_em: amanha(), oportunidade: op.id }), chave()])).toBe("22023");
  });
});
