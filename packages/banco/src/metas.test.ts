// Metas mensais da loja e de cada vendedor (lote G4b; decisão do proprietário de 13/11/2026). Definir
// (com versões, motivo e auditoria), quem pode, a equipe da loja e o realizado do mês pela regra de
// contagem 1. Banco em memória com todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
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

let sessoes = 0;
let chaves = 0;
const chave = (prefixo = "g4b") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `75000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string }> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return { v };
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      return { codigo: (e as { code?: string }).code ?? "sem-codigo" };
    }
  });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.codigo}`);
  return r.v;
}
const codigo = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

const DEFINIR = "select public.metas_definir($1, $2, $3::date, $4::jsonb, $5) as v";
const metas = (valores: Record<string, unknown>) => JSON.stringify(valores);
const esteMes = () => `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7)}-01`;
const somarMeses = (n: number) => { const d = new Date(`${esteMes()}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const versoes = async (unidade: string, vendedor: string | null, medida: string) =>
  (await db.query<{ valor: string | null; motivo: string | null }>(
    "select valor::text, motivo from public.metas where unidade_id = $1 and vendedor_id is not distinct from $2 and medida = $3 order by versao", [unidade, vendedor, medida])).rows;
/** Uma ativação do Ora Connect confirmada, gravada direto (o fluxo com a Nogle está em connect.test.ts). */
async function connectConfirmado(unidade: string, vendedor: string) {
  const op = (await db.query<{ id: string }>(
    "insert into public.connect_operacoes (organizacao_id, unidade_id, vendedor_id, tipo, chave, conteudo, situacao, metodo_pagamento, ddd, plano_id, esim) values ($1, $2, $3, 'ativacao', $4, '{}', 'confirmada', 'LINK', 41, 1, true) returning id",
    [ids.organizacao, unidade, vendedor, chave("op")])).rows[0]?.id;
  await db.query("insert into public.connect_producao (organizacao_id, unidade_id, vendedor_id, operacao_id, tipo, origem) values ($1, $2, $3, $4, 'ativacao', 'evidencia_da_operadora')", [ids.organizacao, unidade, vendedor, op]);
}

type Medidas = { vendido_liquido: number; aparelhos: number; connect: number; acessorios: number; chips: number };
type Painel = { mes: string; dias_no_mes: number; dias_decorridos: number; regra_contagem: number; loja: { metas: Record<string, number>; realizado: Medidas } | null; vendedores: { vendedor_id: string; metas: Record<string, number>; realizado: Medidas }[] };
const inteiros = <T>(v: T): T => JSON.parse(JSON.stringify(v), (_, x: unknown) => (typeof x === "string" && /^-?\d+$/.test(x) ? Number(x) : x)) as T;
const painel = async (s: Sessao, unidade: string, mes = esteMes()) => inteiros(await valor<Painel>(s, "select public.metas_painel($1::date, $2) as v", [mes, unidade]));

describe("metas: definir, com versões e motivo (G4b)", () => {
  it("o dono define a meta da loja e a de cada vendedor; o mesmo valor de novo não cria versão; mudar e retirar pedem motivo", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await valor(dono, DEFINIR, [ids.lojaA, null, esteMes(), metas({ vendido_liquido: 5_000_000 }), null])).toBe(1);
    expect(await valor(dono, DEFINIR, [ids.lojaA, null, esteMes(), metas({ vendido_liquido: 5_000_000 }), null])).toBe(0);
    expect(await codigo(dono, DEFINIR, [ids.lojaA, null, esteMes(), metas({ vendido_liquido: 6_000_000 }), null])).toBe("22023");
    expect(await valor(dono, DEFINIR, [ids.lojaA, null, esteMes(), metas({ vendido_liquido: 6_000_000 }), "  Campanha   de fim de ano "])).toBe(1);
    expect(await valor(dono, DEFINIR, [ids.lojaA, ids.vendedorA, esteMes(), metas({ aparelhos: 20, connect: 10 }), null])).toBe(2);
    expect(await valor(dono, DEFINIR, [ids.lojaA, ids.vendedorA, esteMes(), metas({ aparelhos: null, connect: 10 }), "Saiu de férias"])).toBe(1);
    expect(await versoes(ids.lojaA, null, "vendido_liquido")).toEqual([{ valor: "5000000", motivo: null }, { valor: "6000000", motivo: "Campanha de fim de ano" }]);
    expect(await versoes(ids.lojaA, ids.vendedorA, "aparelhos")).toEqual([{ valor: "20", motivo: null }, { valor: null, motivo: "Saiu de férias" }]);
    expect(await versoes(ids.lojaA, ids.vendedorA, "connect")).toEqual([{ valor: "10", motivo: null }]);
    // Cada versão fica na auditoria, com o motivo e com quem definiu.
    const auditadas = (await db.query<{ motivo: string; usuario_id: string }>(
      "select motivo, usuario_id from public.auditoria where alvo_id in (select id::text from public.metas) order by id")).rows;
    expect(auditadas.map((a) => a.motivo)).toEqual(["Meta definida", "Campanha de fim de ano", "Meta definida", "Meta definida", "Saiu de férias"]);
    expect(new Set(auditadas.map((a) => a.usuario_id))).toEqual(new Set([ids.dono]));
  });

  it("tudo ou nada: uma medida recusada desfaz as outras da mesma chamada", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, DEFINIR, [ids.lojaA, ids.vendedorA, esteMes(), metas({ connect: 10 }), null]);
    expect(await codigo(dono, DEFINIR, [ids.lojaA, ids.vendedorA, esteMes(), metas({ acessorios: 50_000, connect: 12 }), null])).toBe("22023");
    expect(await codigo(dono, DEFINIR, [ids.lojaA, ids.vendedorA, esteMes(), metas({ acessorios: 50_000, aparelhos: 0 }), null])).toBe("22023");
    expect(await versoes(ids.lojaA, ids.vendedorA, "acessorios")).toEqual([]);
    expect(await versoes(ids.lojaA, ids.vendedorA, "connect")).toEqual([{ valor: "10", motivo: null }]);
  });

  it("o gerente define só na loja dele; o vendedor não define; o mês que terminou não muda; pessoa de fora da loja, medida e valor inválidos são recusados", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await valor(gerente, DEFINIR, [ids.lojaB, ids.vendedorAB, somarMeses(1), metas({ connect: 30 }), null])).toBe(1);
    expect(await codigo(gerente, DEFINIR, [ids.lojaA, null, esteMes(), metas({ connect: 30 }), null])).toBe("42501");
    expect(await codigo(await naLoja(ids.vendedorA, ids.lojaA), DEFINIR, [ids.lojaA, ids.vendedorA, esteMes(), metas({ connect: 30 }), null])).toBe("42501");
    const dono = await naLoja(ids.dono, ids.lojaA);
    for (const [mes, unidade, vendedor, valores] of [
      [somarMeses(-1), ids.lojaA, null, { connect: 30 }],
      [somarMeses(13), ids.lojaA, null, { connect: 30 }],
      [esteMes(), ids.lojaB, ids.vendedorA, { connect: 30 }],
      [esteMes(), ids.assistencia, null, { connect: 30 }],
      [esteMes(), ids.lojaA, null, { lucro: 30 }],
      [esteMes(), ids.lojaA, null, { connect: 0 }],
      [esteMes(), ids.lojaA, null, { connect: 1.5 }],
      [esteMes(), ids.lojaA, null, { connect: "30" }],
      [esteMes(), ids.lojaA, null, { connect: 100_000_000_001 }],
      [esteMes(), ids.lojaA, null, {}],
      [esteMes(), ids.lojaA, null, [30]],
    ] as const) {
      expect(await codigo(dono, DEFINIR, [unidade, vendedor, mes, JSON.stringify(valores), null]), JSON.stringify([mes, valores])).toBe("22023");
    }
    expect(await codigo(dono, DEFINIR, [ids.lojaA, null, esteMes(), metas({ connect: 30 }), "ok"])).toBe("22023");
    expect((await db.query("select 1 from public.metas where unidade_id = $1", [ids.lojaA])).rows).toEqual([]);
  });

  it("ninguém altera nem apaga uma versão gravada", async () => {
    await valor(await naLoja(ids.dono, ids.lojaA), DEFINIR, [ids.lojaA, null, esteMes(), metas({ connect: 30 }), null]);
    await db.exec("savepoint direto");
    await expect(db.query("update public.metas set valor = 1")).rejects.toBeTruthy();
    await db.exec("rollback to savepoint direto");
    await expect(db.query("delete from public.metas")).rejects.toBeTruthy();
    await db.exec("rollback to savepoint direto");
  });

  it("a equipe da loja e quem tem meta ou fato no mês, com o nome; bloqueado sai da equipe; quem não vê as metas da loja não recebe ninguém", async () => {
    type Pessoa = { usuario_id: string; nome: string; na_equipe: boolean };
    const equipe = async (s: Sessao, unidade: string) =>
      (await valor<Pessoa[]>(s, "select public.metas_equipe($1, $2::date) as v", [unidade, esteMes()])).map((p) => `${p.nome}${p.na_equipe ? "" : " (fora)"}`);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await equipe(dono, ids.lojaA)).toEqual(["bloqueado", "vendedor.a", "vendedor.ab"]);
    expect(await valor(dono, DEFINIR, [ids.lojaA, ids.bloqueado, esteMes(), metas({ connect: 5 }), null])).toBe(1);
    await db.query("update public.perfis_usuario set status = 'bloqueado' where id = $1", [ids.bloqueado]);
    // Quem saiu da loja, mas tem fato nela no mês, aparece com o nome, fora da equipe.
    await connectConfirmado(ids.lojaA, ids.encerrado);
    expect(await equipe(dono, ids.lojaA)).toEqual(["bloqueado (fora)", "encerrado (fora)", "vendedor.a", "vendedor.ab"]);
    // Bloqueado não recebe meta nova; a que tinha pode ser retirada (o mesmo vale para quem saiu).
    expect(await codigo(dono, DEFINIR, [ids.lojaA, ids.bloqueado, esteMes(), metas({ aparelhos: 5 }), null])).toBe("22023");
    expect(await valor(dono, DEFINIR, [ids.lojaA, ids.bloqueado, esteMes(), metas({ connect: null }), "Pessoa bloqueada"])).toBe(1);
    expect(await valor(dono, DEFINIR, [ids.lojaA, ids.encerrado, esteMes(), metas({ connect: null }), null])).toBe(0);
    expect(await equipe(await naLoja(ids.gerenteB, ids.lojaB), ids.lojaB)).toEqual(["gerente.b", "vendedor.ab"]);
    expect(await equipe(await naLoja(ids.gerenteB, ids.lojaB), ids.lojaA)).toEqual([]);
    expect(await equipe(await naLoja(ids.vendedorA, ids.lojaA), ids.lojaA)).toEqual([]);
  });
});

describe("metas: realizado do mês pela regra de contagem 1 (G4b)", () => {
  async function produzir() {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    // Venda 1: um aparelho e duas capas (R$ 1.499,00 + 2 × R$ 79,00).
    const venda1 = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda1, cat.aparelho, itens.a1, chave("item")]);
    const capas = await valor<string>(ana, "select public.adicionar_item($1, $2, null, 2, $3) as v", [venda1, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda1, JSON.stringify([{ meio: "dinheiro", valor: 165_700 }]), chave("concluir")]);
    // Venda 2: uma capa, concluída e cancelada no mesmo mês.
    const venda2 = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda2, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda2, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), chave("concluir")]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    await valor(dono, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [venda2]);
    // Uma das capas da venda 1 volta.
    await valor(dono, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, 'Cliente desistiu', $4) as v",
      [venda1, JSON.stringify([{ item: capas, quantidade: 1, condicao: "novo" }]), JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), chave("dev")]);
    await connectConfirmado(ids.lojaA, ids.vendedorA);
    return dono;
  }
  const REALIZADO = { vendido_liquido: 157_800, aparelhos: 1, connect: 1, acessorios: 7_900, chips: 0 };

  it("loja e vendedor: vendido líquido, aparelhos, acessórios e Ora Connect, com a meta vigente ao lado", async () => {
    const dono = await produzir();
    await valor(dono, DEFINIR, [ids.lojaA, null, esteMes(), metas({ vendido_liquido: 5_000_000 }), null]);
    await valor(dono, DEFINIR, [ids.lojaA, ids.vendedorA, esteMes(), metas({ aparelhos: 20, connect: 3 }), null]);
    await valor(dono, DEFINIR, [ids.lojaA, ids.vendedorA, esteMes(), metas({ connect: null }), "Meta retirada"]);
    const p = await painel(dono, ids.lojaA);
    expect(p).toMatchObject({ mes: esteMes(), regra_contagem: 1 });
    expect(p.dias_decorridos).toBe(Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(8, 10)));
    expect(p.loja).toEqual({ metas: { vendido_liquido: 5_000_000 }, realizado: REALIZADO });
    expect(p.vendedores).toEqual([{ vendedor_id: ids.vendedorA, metas: { aparelhos: 20 }, realizado: REALIZADO }]);
  });

  it("a vendedora vê só a própria linha; o número da loja só para quem lê as vendas da loja; a outra loja não vê nada", async () => {
    const dono = await produzir();
    await valor(dono, DEFINIR, [ids.lojaA, null, esteMes(), metas({ vendido_liquido: 5_000_000 }), null]);
    await valor(dono, DEFINIR, [ids.lojaA, ids.vendedorA, esteMes(), metas({ connect: 10 }), null]);
    const daAna = await painel(await naLoja(ids.vendedorA, ids.lojaA), ids.lojaA);
    expect(daAna.loja).toBeNull();
    expect(daAna.vendedores).toEqual([{ vendedor_id: ids.vendedorA, metas: { connect: 10 }, realizado: REALIZADO }]);
    const daGerenteB = await painel(await naLoja(ids.gerenteB, ids.lojaB), ids.lojaA);
    expect(daGerenteB).toMatchObject({ loja: null, vendedores: [] });
  });

  it("mês sem fato nenhum: zeros, e meta não definida é ausência, não zero", async () => {
    const p = await painel(await naLoja(ids.dono, ids.lojaA), ids.lojaB);
    expect(p.loja).toEqual({ metas: {}, realizado: { vendido_liquido: 0, aparelhos: 0, connect: 0, acessorios: 0, chips: 0 } });
    expect(p.vendedores).toEqual([]);
  });

  it("o mês que vem: nenhum dia decorrido, a meta já definida aparece; mês e loja são obrigatórios", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, DEFINIR, [ids.lojaA, null, somarMeses(1), metas({ aparelhos: 40 }), null]);
    const p = await painel(dono, ids.lojaA, somarMeses(1));
    expect(p).toMatchObject({ mes: somarMeses(1), dias_decorridos: 0, loja: { metas: { aparelhos: 40 } } });
    expect(await codigo(dono, "select public.metas_painel(null, $1) as v", [ids.lojaA])).toBe("22023");
    expect(await codigo(dono, "select public.metas_painel($1::date, null) as v", [esteMes()])).toBe("22023");
  });

  // G4c: a meta da loja inteira e o realizado de cada loja do mês, para o Início e os Relatórios.
  type DasLojas = { mes: string; dias_no_mes: number; dias_decorridos: number; regra_contagem: number; lojas: { unidade_id: string; metas: Record<string, number>; realizado: Medidas }[] };
  const dasLojas = async (s: Sessao, unidade: string | null = null) =>
    inteiros(await valor<DasLojas>(s, "select public.metas_lojas($1::date, $2) as v", [esteMes(), unidade]));
  const ZERO = { vendido_liquido: 0, aparelhos: 0, connect: 0, acessorios: 0, chips: 0 };

  it("metas_lojas (G4c): cada loja da rede com a meta da loja inteira e o realizado, o mesmo do painel da loja; sem meta, vazio", async () => {
    const dono = await produzir();
    await valor(dono, DEFINIR, [ids.lojaA, null, esteMes(), metas({ vendido_liquido: 5_000_000, connect: 40 }), null]);
    await valor(dono, DEFINIR, [ids.lojaB, null, esteMes(), metas({ aparelhos: 10 }), null]);
    // A meta de um vendedor não é a da loja: fica fora.
    await valor(dono, DEFINIR, [ids.lojaA, ids.vendedorA, esteMes(), metas({ aparelhos: 20 }), null]);
    const r = await dasLojas(dono);
    expect(r).toMatchObject({ mes: esteMes(), regra_contagem: 1 });
    const porLoja = new Map(r.lojas.map((l) => [l.unidade_id, l] as const));
    expect([...porLoja.keys()].sort()).toEqual([ids.lojaA, ids.lojaB, ids.lojaC, ids.online].sort());
    expect(porLoja.get(ids.lojaA)).toEqual({ unidade_id: ids.lojaA, metas: { vendido_liquido: 5_000_000, connect: 40 }, realizado: REALIZADO });
    expect(porLoja.get(ids.lojaB)).toEqual({ unidade_id: ids.lojaB, metas: { aparelhos: 10 }, realizado: ZERO });
    expect(porLoja.get(ids.lojaC)).toEqual({ unidade_id: ids.lojaC, metas: {}, realizado: ZERO });
    // A mesma regra de contagem do painel da loja (G4b): os dois nunca podem divergir.
    expect((await painel(dono, ids.lojaA)).loja?.realizado).toEqual(porLoja.get(ids.lojaA)?.realizado);
    expect((await dasLojas(dono, ids.lojaA)).lojas.map((l) => l.unidade_id)).toEqual([ids.lojaA]);
  });

  it("metas_lojas (G4c): só as lojas em que quem chama lê as vendas e acompanha as metas", async () => {
    const dono = await produzir();
    await valor(dono, DEFINIR, [ids.lojaA, null, esteMes(), metas({ vendido_liquido: 5_000_000 }), null]);
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect((await dasLojas(gerente)).lojas.map((l) => l.unidade_id)).toEqual([ids.lojaB]);
    expect((await dasLojas(gerente, ids.lojaA)).lojas).toEqual([]);
    expect((await dasLojas(await naLoja(ids.vendedorA, ids.lojaA))).lojas).toEqual([]);
    // O administrador vê as vendas da rede, mas não acompanha metas: não recebe loja nenhuma.
    expect((await dasLojas(await naLoja(ids.administrador, ids.lojaA))).lojas).toEqual([]);
    expect((await dasLojas(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg))).lojas).toEqual([{ unidade_id: ids.lojaOutraOrg, metas: {}, realizado: ZERO }]);
    expect(await codigo(dono, "select public.metas_lojas(null) as v")).toBe("22023");
  });

  // PERF-a (ORA-PERF-001; o proprietário, 18/11: "o chip é vendido separado do celular. Eles têm que contar como
  // separado"): os chips vendidos como medida própria, contados como os aparelhos (venda, cancelamento e devolução).
  it("PERF-a: os chips vendidos contam à parte: a meta, o realizado da loja e do vendedor, metas_lojas e o cancelamento", async () => {
    await db.query("insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem) values ($1, $2, null, 1000, now() - interval '1 day', 'manual')",
      [ids.organizacao, cat.chip]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda, cat.chip, itens.chipA, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, JSON.stringify([{ meio: "dinheiro", valor: 1_000 }]), chave("concluir")]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await valor(dono, DEFINIR, [ids.lojaA, ids.vendedorA, esteMes(), metas({ chips: 30 }), null])).toBe(1);
    expect(await valor(dono, DEFINIR, [ids.lojaA, null, esteMes(), metas({ chips: 100 }), null])).toBe(1);
    const umChip = { vendido_liquido: 1_000, aparelhos: 0, connect: 0, acessorios: 0, chips: 1 };
    const p = await painel(dono, ids.lojaA);
    expect(p.loja).toEqual({ metas: { chips: 100 }, realizado: umChip });
    expect(p.vendedores).toEqual([{ vendedor_id: ids.vendedorA, metas: { chips: 30 }, realizado: umChip }]);
    expect((await dasLojas(dono, ids.lojaA)).lojas).toEqual([{ unidade_id: ids.lojaA, metas: { chips: 100 }, realizado: umChip }]);
    // Cancelada no mesmo mês, a venda tira o chip do realizado.
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    await valor(dono, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [venda]);
    expect((await painel(dono, ids.lojaA)).loja?.realizado).toEqual({ ...umChip, vendido_liquido: 0, chips: 0 });
  });
});

