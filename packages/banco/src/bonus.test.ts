// Bônus por meta (lote L9a; decisão do proprietário de 13/11/2026, D-014): as regras do dono, com
// versões e vigência; o bônus de cada vendedor no mês (faixa alcançada, a próxima e quanto falta); o
// extrato do vendedor, fato a fato, com os totais iguais aos do painel das metas. Banco em memória com
// todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
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
const chave = (prefixo = "l9a") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `76000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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

const DEFINIR = "select public.bonus_definir($1::date, $2::jsonb, $3) as v";
const METAS = "select public.metas_definir($1, $2, $3::date, $4::jsonb, $5) as v";
const BONUS = "select public.bonus_do_mes($1::date, $2) as v";
const EXTRATO = "select public.extrato_do_vendedor($1::date, $2, $3) as v";
const json = (valores: unknown) => JSON.stringify(valores);
const esteMes = () => `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7)}-01`;
const somarMeses = (n: number) => { const d = new Date(`${esteMes()}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const inteiros = <T>(v: T): T => JSON.parse(JSON.stringify(v), (_, x: unknown) => (typeof x === "string" && /^-?\d+$/.test(x) ? Number(x) : x)) as T;
const faixa = (a_partir_de: number, valor: number) => ({ a_partir_de, valor });
const versoes = async (medida: string, organizacao = ids.organizacao) =>
  (await db.query<{ vigente_desde: string; faixas: unknown; motivo: string | null }>(
    "select to_char(vigente_desde, 'YYYY-MM-DD') as vigente_desde, faixas, motivo from public.bonus_regras where organizacao_id = $1 and medida = $2 order by versao",
    [organizacao, medida])).rows;

/** Uma ativação do Ora Connect confirmada, gravada direto (o fluxo com a Nogle está em connect.test.ts). */
async function connectConfirmado(unidade: string, vendedor: string) {
  const op = (await db.query<{ id: string }>(
    "insert into public.connect_operacoes (organizacao_id, unidade_id, vendedor_id, tipo, chave, conteudo, situacao, metodo_pagamento, ddd, plano_id, esim) values ($1, $2, $3, 'ativacao', $4, '{}', 'confirmada', 'LINK', 41, 1, true) returning id",
    [ids.organizacao, unidade, vendedor, chave("op")])).rows[0]?.id;
  await db.query("insert into public.connect_producao (organizacao_id, unidade_id, vendedor_id, operacao_id, tipo, origem) values ($1, $2, $3, $4, 'ativacao', 'evidencia_da_operadora')", [ids.organizacao, unidade, vendedor, op]);
}

/** O mesmo mês de metas.test.ts: a vendedora A na loja A, duas vendas, um cancelamento, uma devolução e um Connect. */
async function produzir() {
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  // Venda 1: um aparelho e duas capas (R$ 1.499,00 + 2 × R$ 79,00).
  const venda1 = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(ana, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda1, cat.aparelho, itens.a1, chave("item")]);
  const capas = await valor<string>(ana, "select public.adicionar_item($1, $2, null, 2, $3) as v", [venda1, cat.capa, chave("item")]);
  await valor(ana, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda1, json([{ meio: "dinheiro", valor: 165_700 }]), chave("concluir")]);
  // Venda 2: uma capa, concluída e cancelada no mesmo mês.
  const venda2 = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda2, cat.capa, chave("item")]);
  await valor(ana, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda2, json([{ meio: "dinheiro", valor: 7_900 }]), chave("concluir")]);
  const dono = await naLoja(ids.dono, ids.lojaA);
  await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
  await valor(dono, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [venda2]);
  // Uma das capas da venda 1 volta.
  await valor(dono, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, 'Cliente desistiu', $4) as v",
    [venda1, json([{ item: capas, quantidade: 1, condicao: "novo" }]), json([{ meio: "dinheiro", valor: 7_900 }]), chave("dev")]);
  await connectConfirmado(ids.lojaA, ids.vendedorA);
  const numeros = (await db.query<{ id: string; numero: string }>("select id, numero::text from public.vendas where id in ($1, $2)", [venda1, venda2])).rows;
  const numero = (id: string) => Number(numeros.find((n) => n.id === id)?.numero);
  return { dono, venda1: numero(venda1), venda2: numero(venda2) };
}
const REALIZADO = { vendido_liquido: 157_800, aparelhos: 1, connect: 1, acessorios: 7_900, chips: 0 };

type Conta = { meta: number | null; realizado: number; faixa: number | null; bonus: number; proxima: { faixa: number; a_partir_de: number; valor: number; falta: number } | null };
type Bonus = {
  mes: string; regra_contagem: number;
  regras: Record<string, { vigente_desde: string; versao: number; faixas: { a_partir_de: number; valor: number }[] }>;
  vendedores: { vendedor_id: string; medidas: Record<string, Conta>; total: number }[];
};
const bonus = async (s: Sessao, unidade: string, mes = esteMes()) => inteiros(await valor<Bonus>(s, BONUS, [mes, unidade]));

describe("bônus por meta: as regras do dono, com versões (L9a)", () => {
  it("o dono define as faixas a partir deste mês; as mesmas faixas não criam versão; mudar e retirar pedem motivo; cada versão vai para a auditoria", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const regra = [faixa(100, 30_000), faixa(120, 50_000)];
    expect(await valor(dono, DEFINIR, [esteMes(), json({ vendido_liquido: regra }), null])).toBe(1);
    // A ordem das chaves não importa: são as mesmas faixas.
    expect(await valor(dono, DEFINIR, [esteMes(), json({ vendido_liquido: [{ valor: 30_000, a_partir_de: 100 }, { valor: 50_000, a_partir_de: 120 }] }), null])).toBe(0);
    expect(await codigo(dono, DEFINIR, [esteMes(), json({ vendido_liquido: [faixa(100, 40_000)] }), null])).toBe("22023");
    expect(await valor(dono, DEFINIR, [esteMes(), json({ vendido_liquido: [faixa(100, 40_000)] }), "  Campanha   de Natal "])).toBe(1);
    expect(await codigo(dono, DEFINIR, [esteMes(), json({ vendido_liquido: null }), null])).toBe("22023");
    expect(await valor(dono, DEFINIR, [esteMes(), json({ vendido_liquido: null }), "Fim da campanha"])).toBe(1);
    // Retirar o que já não vale não muda nada; definir de novo, depois de retirada, não pede motivo.
    expect(await valor(dono, DEFINIR, [esteMes(), json({ vendido_liquido: null }), null])).toBe(0);
    expect(await valor(dono, DEFINIR, [esteMes(), json({ vendido_liquido: [faixa(100, 25_000)] }), null])).toBe(1);
    expect(await versoes("vendido_liquido")).toEqual([
      { vigente_desde: esteMes(), faixas: regra, motivo: null },
      { vigente_desde: esteMes(), faixas: [faixa(100, 40_000)], motivo: "Campanha de Natal" },
      { vigente_desde: esteMes(), faixas: null, motivo: "Fim da campanha" },
      { vigente_desde: esteMes(), faixas: [faixa(100, 25_000)], motivo: null },
    ]);
    const auditadas = (await db.query<{ motivo: string; usuario_id: string; organizacao_id: string }>(
      "select motivo, usuario_id, organizacao_id from public.auditoria where alvo_tipo = 'bonus_regras' order by id")).rows;
    expect(auditadas.map((a) => a.motivo)).toEqual(["Regra do bônus definida", "Campanha de Natal", "Fim da campanha", "Regra do bônus definida"]);
    expect(new Set(auditadas.map((a) => `${a.usuario_id}|${a.organizacao_id}`))).toEqual(new Set([`${ids.dono}|${ids.organizacao}`]));
  });

  it("tudo ou nada; faixas de 1 a 5, crescentes, de 1% a 500% e de R$ 0,01 a R$ 100.000,00; o mês que já terminou não muda", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await codigo(dono, DEFINIR, [esteMes(), json({ connect: [faixa(100, 5_000)], aparelhos: [faixa(0, 1_000)] }), null])).toBe("22023");
    expect(await versoes("connect")).toEqual([]);
    const invalidas: unknown[] = [
      {}, [], { lucro: [faixa(100, 1_000)] }, { connect: [] }, { connect: [1, 2] }, { connect: "100" },
      { connect: [faixa(10, 1), faixa(20, 2), faixa(30, 3), faixa(40, 4), faixa(50, 5), faixa(60, 6)] },
      { connect: [faixa(0, 1_000)] }, { connect: [faixa(501, 1_000)] }, { connect: [faixa(100, 0)] }, { connect: [faixa(100, 10_000_001)] },
      { connect: [faixa(100.5, 1_000)] }, { connect: [faixa(100, 1_000.5)] }, { connect: [{ a_partir_de: "100", valor: 1_000 }] },
      { connect: [{ a_partir_de: 100 }] }, { connect: [{ a_partir_de: 100, valor: 1_000, extra: 1 }] }, { connect: [{ a_partir_de: 100, valor: null }] },
      { connect: [faixa(120, 1_000), faixa(100, 2_000)] }, { connect: [faixa(100, 1_000), faixa(100, 2_000)] },
      { connect: [faixa(100, 2_000), faixa(120, 1_000)] }, { connect: [faixa(100, 2_000), faixa(120, 2_000)] },
    ];
    for (const faixas of invalidas) expect(await codigo(dono, DEFINIR, [esteMes(), json(faixas), null]), json(faixas)).toBe("22023");
    expect(await codigo(dono, "select public.bonus_definir($1::date, null, null) as v", [esteMes()])).toBe("22023");
    expect(await codigo(dono, DEFINIR, [somarMeses(-1), json({ connect: [faixa(100, 1_000)] }), null])).toBe("22023");
    expect(await codigo(dono, DEFINIR, [somarMeses(13), json({ connect: [faixa(100, 1_000)] }), null])).toBe("22023");
    expect(await codigo(dono, "select public.bonus_definir(null, $1::jsonb, null) as v", [json({ connect: [faixa(100, 1_000)] })])).toBe("22023");
    expect(await valor(dono, DEFINIR, [somarMeses(12), json({ connect: [faixa(1, 1), faixa(500, 10_000_000)] }), null])).toBe(1);
    expect(await valor(dono, DEFINIR, [esteMes(), json({ connect: [faixa(100, 1_000)] }), null])).toBe(1);
    expect(await codigo(dono, DEFINIR, [esteMes(), json({ connect: [faixa(100, 2_000)] }), "ok"])).toBe("22023");
    expect((await versoes("connect")).map((v) => v.vigente_desde)).toEqual([somarMeses(12), esteMes()]);
  });

  it("só o dono: gerente, vendedor e administrador são recusados; o dono de outra rede define só na rede dele; ninguém altera nem apaga uma versão", async () => {
    const regra = json({ aparelhos: [faixa(100, 10_000)] });
    expect(await codigo(await naLoja(ids.gerenteB, ids.lojaB), DEFINIR, [esteMes(), regra, null])).toBe("42501");
    expect(await codigo(await naLoja(ids.vendedorA, ids.lojaA), DEFINIR, [esteMes(), regra, null])).toBe("42501");
    expect(await codigo(await naLoja(ids.administrador, ids.lojaA), DEFINIR, [esteMes(), regra, null])).toBe("42501");
    expect(await versoes("aparelhos")).toEqual([]);
    expect(await valor(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), DEFINIR, [esteMes(), regra, null])).toBe(1);
    expect(await versoes("aparelhos")).toEqual([]);
    expect(await versoes("aparelhos", ids.outraOrganizacao)).toHaveLength(1);
    await db.exec("savepoint direto");
    await expect(db.query("update public.bonus_regras set faixas = null")).rejects.toBeTruthy();
    await db.exec("rollback to savepoint direto");
    await expect(db.query("delete from public.bonus_regras")).rejects.toBeTruthy();
    await db.exec("rollback to savepoint direto");
    await expect(db.query("truncate public.bonus_regras")).rejects.toBeTruthy();
    await db.exec("rollback to savepoint direto");
  });

  it("toda a equipe da rede lê as regras (o vendedor precisa saber quanto vale bater a meta); a outra rede, não", async () => {
    await valor(await naLoja(ids.dono, ids.lojaA), DEFINIR, [esteMes(), json({ aparelhos: [faixa(100, 10_000)] }), null]);
    await valor(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), DEFINIR, [esteMes(), json({ connect: [faixa(100, 1_000)] }), null]);
    const lidas = async (s: Sessao) => valor<string[]>(s, "select coalesce(array_agg(medida order by medida), '{}') as v from public.bonus_regras");
    expect(await lidas(await naLoja(ids.vendedorA, ids.lojaA))).toEqual(["aparelhos"]);
    expect(await lidas(await naLoja(ids.gerenteB, ids.lojaB))).toEqual(["aparelhos"]);
    expect(await lidas(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg))).toEqual(["connect"]);
  });
});

describe("bônus por meta: o bônus do mês (L9a)", () => {
  it("em cada medida com regra: a meta, o realizado das metas, a faixa alcançada, o bônus e a próxima faixa; sem meta, sem bônus; a meta da loja não paga", async () => {
    const { dono } = await produzir();
    await valor(dono, METAS, [ids.lojaA, null, esteMes(), json({ vendido_liquido: 100_000 }), null]);
    await valor(dono, METAS, [ids.lojaA, ids.vendedorA, esteMes(), json({ vendido_liquido: 150_000, aparelhos: 2, connect: 1 }), null]);
    await valor(dono, DEFINIR, [esteMes(), json({
      vendido_liquido: [faixa(100, 30_000), faixa(120, 50_000)], aparelhos: [faixa(100, 10_000)],
      connect: [faixa(50, 2_000), faixa(100, 5_000)], acessorios: [faixa(100, 10_000)],
    }), null]);
    const b = await bonus(dono, ids.lojaA);
    expect(b).toMatchObject({ mes: esteMes(), regra_contagem: 1 });
    expect(Object.keys(b.regras).sort()).toEqual(["acessorios", "aparelhos", "connect", "vendido_liquido"]);
    expect(b.regras.connect).toMatchObject({ vigente_desde: esteMes(), faixas: [faixa(50, 2_000), faixa(100, 5_000)] });
    expect(b.vendedores).toEqual([{
      vendedor_id: ids.vendedorA,
      total: 35_000,
      medidas: {
        vendido_liquido: { meta: 150_000, realizado: 157_800, faixa: 1, bonus: 30_000, proxima: { faixa: 2, a_partir_de: 120, valor: 50_000, falta: 22_200 } },
        aparelhos: { meta: 2, realizado: 1, faixa: null, bonus: 0, proxima: { faixa: 1, a_partir_de: 100, valor: 10_000, falta: 1 } },
        connect: { meta: 1, realizado: 1, faixa: 2, bonus: 5_000, proxima: null },
        acessorios: { meta: null, realizado: 7_900, faixa: null, bonus: 0, proxima: null },
      },
    }]);
  });

  it("exatamente na porcentagem conta; um centavo abaixo, não (inteiros, sem arredondar)", async () => {
    const { dono } = await produzir();
    await valor(dono, DEFINIR, [esteMes(), json({ vendido_liquido: [faixa(100, 30_000)] }), null]);
    await valor(dono, METAS, [ids.lojaA, ids.vendedorA, esteMes(), json({ vendido_liquido: REALIZADO.vendido_liquido }), null]);
    expect((await bonus(dono, ids.lojaA)).vendedores[0]?.medidas.vendido_liquido).toMatchObject({ faixa: 1, bonus: 30_000, proxima: null });
    await valor(dono, METAS, [ids.lojaA, ids.vendedorA, esteMes(), json({ vendido_liquido: REALIZADO.vendido_liquido + 1 }), "Meta um centavo acima"]);
    expect((await bonus(dono, ids.lojaA)).vendedores[0]?.medidas.vendido_liquido).toMatchObject({ faixa: null, bonus: 0, proxima: { faixa: 1, falta: 1 } });
  });

  it("a regra vale do mês dela em diante, até a próxima versão; a do mês que vem não vale agora; retirada, some do mês", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    // Uma regra do mês passado (gravada direto: pela função, o mês que terminou não muda).
    await db.query("insert into public.bonus_regras (organizacao_id, medida, vigente_desde, faixas, definida_por) values ($1, 'aparelhos', $2::date, $3::jsonb, $4)",
      [ids.organizacao, somarMeses(-1), json([faixa(100, 10_000)]), ids.dono]);
    await valor(dono, DEFINIR, [somarMeses(1), json({ aparelhos: [faixa(100, 99_900)] }), "Bônus maior a partir do mês que vem"]);
    await valor(dono, METAS, [ids.lojaA, ids.vendedorA, esteMes(), json({ aparelhos: 1 }), null]);
    await valor(dono, METAS, [ids.lojaA, ids.vendedorA, somarMeses(1), json({ aparelhos: 1 }), null]);
    expect((await bonus(dono, ids.lojaA)).regras).toEqual({ aparelhos: expect.objectContaining({ vigente_desde: somarMeses(-1), faixas: [faixa(100, 10_000)] }) });
    expect((await bonus(dono, ids.lojaA, somarMeses(1))).regras.aparelhos?.faixas).toEqual([faixa(100, 99_900)]);
    expect((await bonus(dono, ids.lojaA, somarMeses(1))).vendedores).toEqual([{
      vendedor_id: ids.vendedorA, total: 0,
      medidas: { aparelhos: { meta: 1, realizado: 0, faixa: null, bonus: 0, proxima: { faixa: 1, a_partir_de: 100, valor: 99_900, falta: 1 } } },
    }]);
    // Retirar a partir deste mês: este mês fica sem bônus de aparelhos; o mês que vem mantém a versão dele.
    await valor(dono, DEFINIR, [esteMes(), json({ aparelhos: null }), "Pausa no bônus de aparelhos"]);
    const agora = await bonus(dono, ids.lojaA);
    expect(agora.regras).toEqual({});
    expect(agora.vendedores).toEqual([{ vendedor_id: ids.vendedorA, total: 0, medidas: {} }]);
    expect((await bonus(dono, ids.lojaA, somarMeses(1))).regras.aparelhos?.faixas).toEqual([faixa(100, 99_900)]);
  });

  it("a vendedora vê só a própria linha; a gerente de outra loja, o administrador e a outra rede são recusados; mês e loja são obrigatórios", async () => {
    const { dono } = await produzir();
    await valor(dono, DEFINIR, [esteMes(), json({ connect: [faixa(100, 5_000)] }), null]);
    await valor(dono, METAS, [ids.lojaA, ids.vendedorA, esteMes(), json({ connect: 1 }), null]);
    await valor(dono, METAS, [ids.lojaA, ids.vendedorAB, esteMes(), json({ connect: 3 }), null]);
    const daAna = await bonus(await naLoja(ids.vendedorA, ids.lojaA), ids.lojaA);
    expect(daAna.vendedores.map((v) => [v.vendedor_id, v.total])).toEqual([[ids.vendedorA, 5_000]]);
    expect(daAna.regras.connect?.faixas).toEqual([faixa(100, 5_000)]);
    const doColega = await bonus(await naLoja(ids.vendedorAB, ids.lojaA), ids.lojaA);
    expect(doColega.vendedores.map((v) => [v.vendedor_id, v.total])).toEqual([[ids.vendedorAB, 0]]);
    expect((await bonus(dono, ids.lojaA)).vendedores.map((v) => v.vendedor_id).sort()).toEqual([ids.vendedorA, ids.vendedorAB].sort());
    expect(await codigo(await naLoja(ids.gerenteB, ids.lojaB), BONUS, [esteMes(), ids.lojaA])).toBe("42501");
    expect(await codigo(await naLoja(ids.administrador, ids.lojaA), BONUS, [esteMes(), ids.lojaA])).toBe("42501");
    expect(await codigo(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), BONUS, [esteMes(), ids.lojaA])).toBe("42501");
    expect(await codigo(dono, "select public.bonus_do_mes(null, $1) as v", [ids.lojaA])).toBe("22023");
    expect(await codigo(dono, "select public.bonus_do_mes($1::date, null) as v", [esteMes()])).toBe("22023");
  });
});

describe("bônus por meta: o extrato do vendedor (L9a)", () => {
  type Linha = { tipo: string; quando: string; venda: number | null; devolucao: number | null; operacao: number | null; servico: string | null; vendido_liquido: number; aparelhos: number; acessorios: number; connect: number; chips: number };
  type Extrato = { mes: string; regra_contagem: number; unidade_id: string; vendedor_id: string; quantidade: number; totais: typeof REALIZADO; linhas: Linha[] };
  const extrato = async (s: Sessao, unidade: string, vendedor: string, mes = esteMes()) => inteiros(await valor<Extrato>(s, EXTRATO, [mes, unidade, vendedor]));
  const efeito = (l: Linha) => [l.tipo, l.venda, l.vendido_liquido, l.aparelhos, l.acessorios, l.connect];

  it("cada fato do mês numa linha, com o efeito em cada medida; os totais são os do painel das metas", async () => {
    const { dono, venda1, venda2 } = await produzir();
    const e = await extrato(dono, ids.lojaA, ids.vendedorA);
    expect(e).toMatchObject({ mes: esteMes(), regra_contagem: 1, unidade_id: ids.lojaA, vendedor_id: ids.vendedorA, quantidade: 5, totais: REALIZADO });
    // Tudo na mesma transação (o mesmo instante): empata no horário e desempata pelo tipo e pelo número.
    expect(e.linhas.map(efeito)).toEqual([
      ["cancelamento", venda2, -7_900, 0, -7_900, 0],
      ["connect", null, 0, 0, 0, 1],
      ["devolucao", venda1, -7_900, 0, -7_900, 0],
      ["venda", venda2, 7_900, 0, 7_900, 0],
      ["venda", venda1, 165_700, 1, 15_800, 0],
    ]);
    expect(e.linhas[1]).toMatchObject({ servico: "ativacao", operacao: expect.any(Number) });
    expect(e.linhas[2]?.devolucao).toEqual(expect.any(Number));
    for (const medida of Object.keys(REALIZADO) as (keyof typeof REALIZADO)[]) {
      expect(e.linhas.reduce((soma, l) => soma + l[medida], 0), medida).toBe(REALIZADO[medida]);
    }
    const painel = inteiros(await valor<{ vendedores: { vendedor_id: string; realizado: typeof REALIZADO }[] }>(dono, "select public.metas_painel($1::date, $2) as v", [esteMes(), ids.lojaA]));
    expect(painel.vendedores.find((v) => v.vendedor_id === ids.vendedorA)?.realizado).toEqual(e.totais);
    // A vendedora vê o próprio extrato, igual ao da gestão.
    expect(await extrato(await naLoja(ids.vendedorA, ids.lojaA), ids.lojaA, ids.vendedorA)).toEqual(e);
  });

  it("devolução de venda de outro mês entra no mês da devolução (o líquido pode ficar negativo); a venda fica no mês dela", async () => {
    const { dono, venda1 } = await produzir();
    // A venda 1 passa para o mês passado (gravado direto, sem os gatilhos de proteção).
    await db.exec("set session_replication_role = replica");
    await db.query("update public.vendas set concluida_em = now() - interval '45 days' where numero = $1", [venda1]);
    await db.exec("set session_replication_role = origin");
    const e = await extrato(dono, ids.lojaA, ids.vendedorA);
    expect(e.linhas.map((l) => [l.tipo, l.venda])).toEqual([["cancelamento", expect.any(Number)], ["connect", null], ["devolucao", venda1], ["venda", expect.any(Number)]]);
    expect(e.totais).toEqual({ vendido_liquido: -7_900, aparelhos: 0, acessorios: -7_900, connect: 1, chips: 0 });
    const painel = inteiros(await valor<{ vendedores: { vendedor_id: string; realizado: typeof REALIZADO }[] }>(dono, "select public.metas_painel($1::date, $2) as v", [esteMes(), ids.lojaA]));
    expect(painel.vendedores.find((v) => v.vendedor_id === ids.vendedorA)?.realizado).toEqual(e.totais);
  });

  it("quem pode ver: a própria vendedora e a gestão da loja que lê as vendas dela; o colega, a gerente de outra loja, o administrador e a outra rede, não", async () => {
    await produzir();
    await connectConfirmado(ids.lojaB, ids.vendedorAB);
    const daGerente = await extrato(await naLoja(ids.gerenteB, ids.lojaB), ids.lojaB, ids.vendedorAB);
    expect(daGerente).toMatchObject({ quantidade: 1, totais: { vendido_liquido: 0, aparelhos: 0, acessorios: 0, connect: 1 } });
    expect(await codigo(await naLoja(ids.vendedorAB, ids.lojaA), EXTRATO, [esteMes(), ids.lojaA, ids.vendedorA])).toBe("42501");
    expect(await codigo(await naLoja(ids.gerenteB, ids.lojaB), EXTRATO, [esteMes(), ids.lojaA, ids.vendedorA])).toBe("42501");
    expect(await codigo(await naLoja(ids.administrador, ids.lojaA), EXTRATO, [esteMes(), ids.lojaA, ids.vendedorA])).toBe("42501");
    expect(await codigo(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), EXTRATO, [esteMes(), ids.lojaA, ids.vendedorA])).toBe("42501");
    // Na loja em que não trabalha, nem o próprio extrato.
    expect(await codigo(await naLoja(ids.vendedorA, ids.lojaA), EXTRATO, [esteMes(), ids.lojaB, ids.vendedorA])).toBe("42501");
    expect(await codigo(await naLoja(ids.vendedorA, ids.lojaA), "select public.extrato_do_vendedor($1::date, $2, null) as v", [esteMes(), ids.lojaA])).toBe("22023");
  });

  it("mês sem fato: nenhuma linha e totais zerados", async () => {
    const e = await extrato(await naLoja(ids.dono, ids.lojaA), ids.lojaA, ids.vendedorA, somarMeses(1));
    expect(e).toMatchObject({ quantidade: 0, linhas: [], totais: { vendido_liquido: 0, aparelhos: 0, acessorios: 0, connect: 0 } });
  });

  // PERF-a (ORA-PERF-001; o proprietário, 18/11): o chip como medida própria também no bônus e no extrato.
  it("PERF-a: a regra do bônus dos chips, a faixa alcançada e o chip no extrato do vendedor, igual ao painel", async () => {
    await db.query("insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem) values ($1, $2, null, 1000, now() - interval '1 day', 'manual')",
      [ids.organizacao, cat.chip]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda, cat.chip, itens.chipA, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, json([{ meio: "dinheiro", valor: 1_000 }]), chave("concluir")]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, METAS, [ids.lojaA, ids.vendedorA, esteMes(), json({ chips: 1 }), null]);
    await valor(dono, DEFINIR, [esteMes(), json({ chips: [faixa(100, 2_500)] }), null]);
    const b = await bonus(dono, ids.lojaA);
    expect(Object.keys(b.regras)).toEqual(["chips"]);
    expect(b.vendedores).toEqual([{ vendedor_id: ids.vendedorA, total: 2_500, medidas: { chips: { meta: 1, realizado: 1, faixa: 1, bonus: 2_500, proxima: null } } }]);
    const e = await extrato(dono, ids.lojaA, ids.vendedorA);
    expect(e.totais).toEqual({ vendido_liquido: 1_000, aparelhos: 0, acessorios: 0, connect: 0, chips: 1 });
    expect(e.linhas.map((l) => [l.tipo, l.chips])).toEqual([["venda", 1]]);
  });
});
