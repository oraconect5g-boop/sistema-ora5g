// Produção do Ora Connect (lote G4a: linhas 15, 23 e 25 da matriz, T1 a T6). public.connect_painel soma
// no banco os chips vendidos e as operações confirmadas do período, com as regras de leitura de quem
// chama. Banco em memória com todas as migrations; dados FICTÍCIOS. As operações são gravadas direto
// nas tabelas (o fluxo com a Nogle está provado em connect.test.ts); a venda do chip passa pelo PDV.
// Cada teste numa transação desfeita.
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
const chave = (prefixo = "g4") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `74000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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

const DADOS: Record<string, string> = {
  ativacao: "metodo_pagamento, ddd, plano_id, esim) values ($1, $2, $3, 'ativacao', $4, '{}', $5, 'LINK', 41, 1, true",
  recarga: "metodo_pagamento, linha, plano_id, valor_face_centavos) values ($1, $2, $3, 'recarga', $4, '{}', $5, 'LINK', '41988887777', 2, 2000",
  portabilidade: "linha, linha_doadora, operadora_doadora_id) values ($1, $2, $3, 'portabilidade', $4, '{}', $5, '41988887777', '41977776666', 1",
};
/** Uma operação gravada direto (o fluxo com a Nogle está em connect.test.ts) e, se confirmada, a linha de produção. */
async function operacao(tipo: "ativacao" | "recarga" | "portabilidade", situacao: string, unidade: string, vendedor: string,
  confirmacao?: { origem: "evidencia_da_operadora" | "revisao_da_gerencia"; quando?: string; debito?: number }) {
  const id = (await db.query<{ id: string }>(
    `insert into public.connect_operacoes (organizacao_id, unidade_id, vendedor_id, tipo, chave, conteudo, situacao, ${DADOS[tipo]}) returning id`,
    [ids.organizacao, unidade, vendedor, chave("op"), situacao],
  )).rows[0]?.id ?? "";
  if (confirmacao) {
    await db.query(
      "insert into public.connect_producao (organizacao_id, unidade_id, vendedor_id, operacao_id, tipo, valor_face_centavos, origem, confirmado_em) values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()))",
      [ids.organizacao, unidade, vendedor, id, tipo, tipo === "recarga" ? 2000 : null, confirmacao.origem, confirmacao.quando ?? null],
    );
    if (confirmacao.debito !== undefined) {
      await db.query("insert into public.connect_operacoes_custos (operacao_id, organizacao_id, unidade_id, valor_debitado_centavos) values ($1, $2, $3, $4)", [id, ids.organizacao, unidade, confirmacao.debito]);
    }
  }
  return id;
}
async function venderChip(s: Sessao) {
  await db.query("insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem) values ($1, $2, null, 1000, now() - interval '1 day', 'manual')", [ids.organizacao, cat.chip]);
  await valor(s, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda, cat.chip, itens.chipA, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, JSON.stringify([{ meio: "dinheiro", valor: 1000 }]), chave("concluir")]);
}

type Painel = { totais: Record<string, number>; periodos: Record<string, number | string>[] };
const inteiros = <T>(v: T): T => JSON.parse(JSON.stringify(v), (_, x: unknown) => (typeof x === "string" && /^-?\d+$/.test(x) ? Number(x) : x)) as T;
const PAINEL = "select public.connect_painel(now() - interval '2 days', now() + interval '1 hour', $1, $2) as v";
const painel = async (s: Sessao, unidade: string | null = null, vendedor: string | null = null) => inteiros(await valor<Painel>(s, PAINEL, [unidade, vendedor]));
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const ontem = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - 86_400_000));

describe("Ora Connect: produção do período, somada no banco (G4a)", () => {
  it("chips vendidos, confirmadas por tipo e por origem, em andamento à parte, valor de face e débito", async () => {
    await venderChip(await naLoja(ids.vendedorA, ids.lojaA));
    await operacao("ativacao", "confirmada", ids.lojaA, ids.vendedorA, { origem: "evidencia_da_operadora", debito: 1500 });
    await operacao("recarga", "confirmada", ids.lojaA, ids.vendedorA, { origem: "revisao_da_gerencia", debito: 1800 });
    await operacao("portabilidade", "registrada", ids.lojaA, ids.vendedorA);
    await operacao("recarga", "resultado_desconhecido", ids.lojaA, ids.vendedorA);
    await operacao("recarga", "recusada", ids.lojaA, ids.vendedorA);
    const p = await painel(await naLoja(ids.dono, ids.lojaA));
    expect(p.totais).toEqual({
      chips: 1, ativacoes: 1, portabilidades: 0, recargas: 1, por_evidencia: 1, por_revisao: 1, valor_face_recargas: 2000,
      em_andamento: 1, sem_resultado: 1, debito: 3300, lojas_sem_custo: 0,
    });
    expect(p.periodos).toEqual([{ periodo: hoje(), chips: 1, ativacoes: 1, portabilidades: 0, recargas: 1 }]);
  });

  it("cada fato no dia dele (São Paulo): a confirmação de ontem fica em ontem", async () => {
    await operacao("ativacao", "confirmada", ids.lojaA, ids.vendedorA, { origem: "evidencia_da_operadora", quando: new Date(Date.now() - 86_400_000).toISOString() });
    await operacao("recarga", "confirmada", ids.lojaA, ids.vendedorA, { origem: "evidencia_da_operadora" });
    const p = await painel(await naLoja(ids.dono, ids.lojaA));
    expect(p.periodos).toEqual([
      { periodo: ontem(), chips: 0, ativacoes: 1, portabilidades: 0, recargas: 0 },
      { periodo: hoje(), chips: 0, ativacoes: 0, portabilidades: 0, recargas: 1 },
    ]);
  });

  it("o débito só soma a loja em que quem pede vê o custo; a outra é contada, nunca vira débito zero", async () => {
    await operacao("ativacao", "confirmada", ids.lojaA, ids.vendedorA, { origem: "evidencia_da_operadora", debito: 1500 });
    const daVendedora = await painel(await naLoja(ids.vendedorA, ids.lojaA));
    expect(daVendedora.totais).toMatchObject({ ativacoes: 1, debito: 0, lojas_sem_custo: 1 });
    expect((await painel(await naLoja(ids.dono, ids.lojaA))).totais).toMatchObject({ debito: 1500, lojas_sem_custo: 0 });
  });

  it("valem as regras de leitura: a vendedora vê só a própria produção; a gerente de outra loja, nada da Loja A; os filtros recortam", async () => {
    await operacao("ativacao", "confirmada", ids.lojaA, ids.vendedorA, { origem: "evidencia_da_operadora" });
    await operacao("recarga", "confirmada", ids.lojaA, ids.vendedorAB, { origem: "evidencia_da_operadora" });
    await operacao("recarga", "confirmada", ids.lojaB, ids.vendedorAB, { origem: "evidencia_da_operadora" });
    expect((await painel(await naLoja(ids.vendedorA, ids.lojaA))).totais).toMatchObject({ ativacoes: 1, recargas: 0 });
    expect((await painel(await naLoja(ids.gerenteB, ids.lojaB))).totais).toMatchObject({ ativacoes: 0, recargas: 1 });
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await painel(dono)).totais).toMatchObject({ ativacoes: 1, recargas: 2 });
    expect((await painel(dono, ids.lojaA)).totais).toMatchObject({ ativacoes: 1, recargas: 1 });
    expect((await painel(dono, null, ids.vendedorAB)).totais).toMatchObject({ ativacoes: 0, recargas: 2 });
    expect((await painel(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg))).totais).toMatchObject({ ativacoes: 0, recargas: 0, chips: 0 });
  });

  it("período sem datas, invertido ou maior que 400 dias é recusado", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await tentar(dono, "select public.connect_painel(null, now(), null, null) as v")).toEqual({ codigo: "22023" });
    expect(await tentar(dono, "select public.connect_painel(now(), now() - interval '1 day', null, null) as v")).toEqual({ codigo: "22023" });
    expect(await tentar(dono, "select public.connect_painel(now() - interval '401 days', now(), null, null) as v")).toEqual({ codigo: "22023" });
  });
});
