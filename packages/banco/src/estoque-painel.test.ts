// Painéis do estoque (lote G3: ORA-REPORT-007; linha 21 da matriz, E1 a E7). public.estoque_painel soma
// no banco a posição de agora por local, modelo e categoria, com as regras de leitura de quem chama.
// Banco em memória com todas as migrations; dados FICTÍCIOS (cenario-catalogo: na Loja A, 2 aparelhos,
// 10 capas e 1 chip; na Loja B, 1 aparelho e 3 capas). Cada teste numa transação desfeita.
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
const chave = (prefixo = "g3") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `73000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return v;
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      throw new Error(`${sql.slice(0, 70)} → ${(e as Error).message} (${(e as { code?: string }).code})`, { cause: e });
    }
  });
}

type Numeros = Record<string, number>;
type Painel = { totais: Numeros; locais: (Numeros & { unidade_id: string; nome: string; tipo: string; vende: boolean })[]; modelos: (Numeros & { produto: string; categoria: string })[]; categorias: (Numeros & { categoria: string })[] };
const inteiros = <T>(v: T): T => JSON.parse(JSON.stringify(v), (_, x: unknown) => (typeof x === "string" && /^-?\d+$/.test(x) ? Number(x) : x)) as T;
const painel = async (s: Sessao, unidade: string | null = null) => inteiros(await valor<Painel>(s, "select public.estoque_painel($1) as v", [unidade]));
const local = (p: Painel, unidade: string) => p.locais.find((l) => l.unidade_id === unidade);
const modelo = (p: Painel, nome: string) => p.modelos.find((m) => m.produto === nome);

describe("estoque: posição de agora, somada no banco (G3)", () => {
  it("físico, reservado e disponível por local, modelo e categoria; local que não vende fica fora da venda", async () => {
    const p = await painel(await naLoja(ids.dono, ids.lojaA));
    expect(p.totais).toEqual({ fisico: 17, reservado: 0, disponivel: 17, abaixo_do_minimo: 0, parado: 0, chegando: 0, fora_da_venda: 0 });
    expect(local(p, ids.lojaA)).toMatchObject({ nome: "Loja A", vende: true, fisico: 13, reservado: 0, disponivel: 13 });
    expect(local(p, ids.lojaB)).toMatchObject({ fisico: 4, disponivel: 4 });
    expect(local(p, ids.lojaC)).toMatchObject({ fisico: 0, disponivel: 0 });
    expect(local(p, ids.assistencia)).toMatchObject({ vende: false, fisico: 0 });
    expect(p.modelos.map((m) => [m.produto, m.fisico, m.disponivel])).toEqual([["Capa de proteção", 13, 13], ["Galaxy A15", 3, 3], ["Chip pré-pago", 1, 1]]);
    expect(p.categorias.map((c) => [c.categoria, c.disponivel])).toEqual([["Acessórios", 13], ["Celulares", 3], ["Chips", 1]]);
    // Recarga é serviço: não tem estoque e não aparece.
    expect(p.modelos.map((m) => m.produto)).not.toContain("Recarga");
  });

  it("item reservado numa venda conta em reservado e sai do disponível", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, null, 2, $3) as v", [venda, cat.capa, chave("item")]);
    const p = await painel(await naLoja(ids.dono, ids.lojaA), ids.lojaA);
    expect(p.totais).toMatchObject({ fisico: 13, reservado: 2, disponivel: 11 });
    expect(modelo(p, "Capa de proteção")).toMatchObject({ fisico: 10, reservado: 2, disponivel: 8 });
  });

  it("abaixo do mínimo conta cada loja que vende, inclusive a que não tem saldo; variação desativada não conta", async () => {
    await db.query("update public.variantes set estoque_minimo = 5 where id = $1", [cat.capa]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    let p = await painel(dono);
    // Loja A tem 10 (ok); Loja B tem 3, Loja C e a online não têm nenhuma: três abaixo. A assistência não vende.
    expect(p.totais.abaixo_do_minimo).toBe(3);
    expect(modelo(p, "Capa de proteção")).toMatchObject({ minimo: 20, abaixo_do_minimo: 3 });
    expect([local(p, ids.lojaA)?.abaixo_do_minimo, local(p, ids.lojaB)?.abaixo_do_minimo, local(p, ids.lojaC)?.abaixo_do_minimo, local(p, ids.assistencia)?.abaixo_do_minimo]).toEqual([0, 1, 1, 0]);
    await db.query("update public.variantes set ativa = false where id = $1", [cat.capa]);
    p = await painel(dono);
    expect(p.totais.abaixo_do_minimo).toBe(0);
  });

  it("transferência: separar reserva na origem, enviar tira do físico dela e aparece chegando no destino; cada passo vira pendência de quem age", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const t = await valor<string>(pedinte, "select public.transferencia_solicitar($1, $2, $3, $4, $5, $6) as v", [ids.lojaA, ids.lojaB, cat.capa, 2, "Reposição da loja", chave("t")]);
    let p = await painel(origem);
    expect(local(p, ids.lojaA)).toMatchObject({ a_separar: 1, a_enviar: 0 });
    await valor(origem, "select public.transferencia_separar($1, '{}'::uuid[]) as v", [t]);
    p = await painel(origem);
    expect(local(p, ids.lojaA)).toMatchObject({ a_separar: 0, a_enviar: 1, reservado: 2, disponivel: 11 });
    await valor(origem, "select public.transferencia_enviar($1) as v", [t]);
    p = await painel(origem);
    expect(local(p, ids.lojaA)).toMatchObject({ fisico: 11, reservado: 0, a_enviar: 0 });
    expect(local(p, ids.lojaB)).toMatchObject({ fisico: 4, chegando: 2, a_receber: 1 });
    expect(p.totais).toMatchObject({ fisico: 15, chegando: 2 });
    expect(modelo(p, "Capa de proteção")).toMatchObject({ fisico: 11, chegando: 2 });
  });

  it("parado há mais de 60 dias: aparelho pela última entrada na loja; acessório sem venda e sem entrada no período", async () => {
    await db.exec("alter table public.estoque_movimentos disable trigger estoque_movimentos_sem_alteracao");
    await db.query("update public.estoque_movimentos set ocorrido_em = now() - interval '70 days' where item_serializado_id = $1", [itens.a1]);
    await db.query("update public.itens_serializados set criado_em = now() - interval '70 days' where id = $1", [itens.a1]);
    await db.query("update public.estoque_movimentos set ocorrido_em = now() - interval '70 days' where unidade_id = $1 and variante_id = $2", [ids.lojaB, cat.capa]);
    await db.exec("alter table public.estoque_movimentos enable trigger estoque_movimentos_sem_alteracao");
    const p = await painel(await naLoja(ids.dono, ids.lojaA));
    // O aparelho a1 chegou há 70 dias; o a2, hoje. As 3 capas da Loja B não venderam nem chegaram há 70 dias; as da Loja A chegaram hoje.
    expect(modelo(p, "Galaxy A15")?.parado).toBe(1);
    expect(modelo(p, "Capa de proteção")?.parado).toBe(3);
    expect([local(p, ids.lojaA)?.parado, local(p, ids.lojaB)?.parado]).toEqual([1, 3]);
    expect(p.totais.parado).toBe(4);
  });

  it("aparelhos e chips sem a conferência de hoje são pendência da loja; conferir tira da conta", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(local(await painel(dono), ids.lojaA)?.sem_conferencia_hoje).toBe(3);
    await valor(dono, "select public.conferir_item($1) as v", [itens.a1]);
    expect(local(await painel(dono), ids.lojaA)?.sem_conferencia_hoje).toBe(2);
  });

  it("cada um vê só os locais que consulta; pedir um local que não consulta não devolve nada", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const doGerente = await painel(gerente);
    expect(doGerente.locais.map((l) => l.nome)).toEqual(["Loja B"]);
    expect(doGerente.totais).toMatchObject({ fisico: 4, disponivel: 4 });
    expect(await painel(gerente, ids.lojaA)).toEqual({ totais: { fisico: 0, reservado: 0, disponivel: 0, abaixo_do_minimo: 0, parado: 0, chegando: 0, fora_da_venda: 0 }, locais: [], modelos: [], categorias: [] });
    expect((await painel(await naLoja(ids.vendedorA, ids.lojaA))).locais.map((l) => l.nome)).toEqual(["Loja A"]);
    expect((await painel(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg))).totais.fisico).toBe(0);
  });
});
