// O pedido de compra antes do recebimento (lote INV-009a: ORA-INV-009): criar (quem recebe mercadoria na loja), ler a
// lista e o pedido com a conferência (o custo só para quem vê custo), receber pela entrada ligada e encerrar. Banco em
// memória com todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
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
const chave = () => `inv009a:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `9a000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string; mensagem: string }> {
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
  }, { criarSessao: false });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 60)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const recusa = async (s: Sessao | null, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? `${r.codigo}: ${r.mensagem}` : null;
};

const CRIAR = "select public.pedido_compra_criar($1, $2, $3, $4::date, $5::jsonb, $6, $7) as v";
const ENCERRAR = "select public.pedido_compra_encerrar($1, $2) as v";
const LIGAR = "select public.pedido_compra_ligar_entrada($1, $2, $3) as v";
const LISTA = "select public.pedidos_compra($1, $2) as v";
const PEDIDO = "select public.pedido_compra($1) as v";
const FORNECEDOR = "select public.fornecedor_salvar($1, $2, $3, $4, $5, $6, $7) as v";
const ENTRADA = "select public.estoque_registrar_entrada($1, $2, $3, $4, $5::jsonb, $6, $7) as v";
const ESTORNO = "select public.estoque_estornar_entrada($1, $2) as v";
const hoje = async (dias = 0) => (await db.query<{ v: string }>("select ((now() at time zone 'America/Sao_Paulo')::date + $1::int)::text as v", [dias])).rows[0]?.v ?? "";
const fornecedor = async (s: Sessao, nome = "Distribuidora Fictícia") => (await valor<{ id: string }>(s, FORNECEDOR, [ids.organizacao, null, nome, null, null, null, "Fornecedor novo"])).id;
const PELICULA = "00000000-0000-4000-9000-00000000c0b1";
const itens = (...l: Record<string, unknown>[]) => JSON.stringify(l);
async function pedir(s: Sessao, loja: string, forn: string, linhas = itens({ variante: cat.capa, quantidade: 10, custo: 1_800 }, { variante: cat.aparelho, quantidade: 2 })) {
  return valor<{ id: string; numero: number; repetido: boolean }>(s, CRIAR, [loja, forn, "COT-77", await hoje(5), linhas, "Entrega pela manhã", chave()]);
}
async function receber(s: Sessao, loja: string, forn: string, linhas: Record<string, unknown>[]) {
  return valor<{ id: string; numero: number }>(s, ENTRADA, [loja, "compra", forn, "NF 900", JSON.stringify(linhas), chave(), "Compra"]);
}
type Item = { linha: number; sku: string; quantidade: number; recebida: number; custo_combinado: number | null; custo_da_nota: number | null };
type Pedido = { situacao: string; itens: Item[]; fora_do_pedido: { sku: string; recebida: number; custo_da_nota: number | null }[]; entradas: { numero: number; situacao: string }[]; ve_custo: boolean };

describe("pedido de compra (INV-009a)", () => {
  beforeEach(async () => {
    await db.query("insert into public.variantes (id, organizacao_id, produto_id, sku, nome) values ($1, $2, $3, 'ACE-0050', 'Película')", [PELICULA, ids.organizacao, cat.produtoCapa]);
  });

  it("criar: quem recebe mercadoria na loja; o total combinado só com todas as linhas com custo; a mesma chave devolve o mesmo pedido", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const forn = await fornecedor(gerente);
    const pedido = await pedir(gerente, ids.lojaB, forn);
    expect(pedido).toMatchObject({ repetido: false, numero: expect.any(Number) });
    const linha = await db.query<{ total_unidades: number; total_previsto_centavos: string | null; situacao: string; documento: string; observacao: string }>(
      "select total_unidades, total_previsto_centavos::text, situacao, documento, observacao from public.pedidos_compra where id = $1", [pedido.id]);
    expect(linha.rows[0]).toEqual({ total_unidades: 12, total_previsto_centavos: null, situacao: "aberto", documento: "COT-77", observacao: "Entrega pela manhã" });
    // todas com custo: o total combinado é a soma
    const completo = await pedir(gerente, ids.lojaB, forn, itens({ variante: cat.capa, quantidade: 10, custo: 1_800 }, { variante: PELICULA, quantidade: 4, custo: 500 }));
    expect((await db.query<{ t: string }>("select total_previsto_centavos::text as t from public.pedidos_compra where id = $1", [completo.id])).rows[0]?.t).toBe("20000");
    // a mesma chave e o mesmo conteúdo: o mesmo pedido; outro conteúdo: recusa
    const k = chave();
    const args = async (l: string) => [ids.lojaB, forn, null, null, l, null, k];
    const primeiro = await valor<{ id: string }>(gerente, CRIAR, await args(itens({ variante: cat.capa, quantidade: 1 })));
    expect(await valor<{ id: string; repetido: boolean }>(gerente, CRIAR, await args(itens({ variante: cat.capa, quantidade: 1 })))).toMatchObject({ id: primeiro.id, repetido: true });
    expect(await recusa(gerente, CRIAR, await args(itens({ variante: cat.capa, quantidade: 2 })))).toBe("OR004: Chave do formulário já usada em outro pedido");
  });

  it("criar recusa o que está errado, sem gravar nada", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const forn = await fornecedor(gerente);
    const antes = Number((await db.query<{ n: string }>("select count(*)::text as n from public.pedidos_compra")).rows[0]?.n);
    const base = async (extra: Partial<Record<"loja" | "forn" | "previsto" | "linhas" | "obs", unknown>> = {}) =>
      [extra.loja ?? ids.lojaB, extra.forn ?? forn, null, "previsto" in extra ? extra.previsto : null, extra.linhas ?? itens({ variante: cat.capa, quantidade: 1 }), "obs" in extra ? extra.obs : null, chave()];
    expect(await recusa(gerente, CRIAR, await base({ loja: ids.lojaA }))).toMatch(/^42501/);
    expect(await recusa(await naLoja(ids.vendedorA, ids.lojaA), CRIAR, await base({ loja: ids.lojaA }))).toMatch(/^42501/);
    expect(await recusa(gerente, CRIAR, await base({ forn: "00000000-0000-4000-8000-00000000dead" }))).toBe("22023: Escolha um fornecedor ativo desta rede");
    expect(await recusa(gerente, CRIAR, await base({ previsto: await hoje(-1) }))).toBe("22023: A previsão de entrega vai de hoje até um ano");
    expect(await recusa(gerente, CRIAR, await base({ previsto: await hoje(366) }))).toBe("22023: A previsão de entrega vai de hoje até um ano");
    expect(await recusa(gerente, CRIAR, await base({ obs: "ab" }))).toBe("22023: Observação: de 3 a 300 letras");
    for (const [linhas, mensagem] of [
      ["[]", "O pedido precisa ter de 1 a 200 linhas"],
      [itens({ variante: cat.capa, quantidade: 1 }, { variante: cat.capa, quantidade: 2 }), "Linha 2 (ACE-0001): a variação já está em outra linha do pedido"],
      [itens({ variante: cat.recarga, quantidade: 1 }), "Linha 1 (REC-99999): este tipo de item não tem estoque"],
      [itens({ variante: cat.capa, quantidade: 0 }), "Linha 1 (ACE-0001): quantidade inválida (1 a 10.000)"],
      [itens({ variante: cat.capa, quantidade: 1, custo: -5 }), "Linha 1: custo inválido"],
      [itens({ variante: "x", quantidade: 1 }), "Linha 1: variação inválida"],
    ] as const) {
      expect(await recusa(gerente, CRIAR, await base({ linhas })), mensagem).toBe(`22023: ${mensagem}`);
    }
    expect(Number((await db.query<{ n: string }>("select count(*)::text as n from public.pedidos_compra")).rows[0]?.n)).toBe(antes);
  });

  it("receber: a entrada da mesma loja e do mesmo fornecedor liga ao pedido; a conferência mostra o recebido, a falta, o que veio a mais e fora do pedido e o custo da nota", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const forn = await fornecedor(gerente);
    const pedido = await pedir(gerente, ids.lojaB, forn);
    const e1 = await receber(gerente, ids.lojaB, forn, [{ variante: cat.capa, quantidade: 6, custo: 1_900 }, { variante: PELICULA, quantidade: 2, custo: 400 }]);
    expect(await valor<boolean>(gerente, LIGAR, [e1.id, pedido.id, "NF da cotação 77"])).toBe(true);
    expect(await valor<boolean>(gerente, LIGAR, [e1.id, pedido.id, "De novo"])).toBe(false);
    let p = await valor<Pedido>(gerente, PEDIDO, [pedido.id]);
    expect(p.itens.map((i) => [i.sku, i.quantidade, i.recebida, i.custo_combinado, i.custo_da_nota])).toEqual([["ACE-0001", 10, 6, 1_800, 1_900], ["APA-0001", 2, 0, null, null]]);
    expect(p.fora_do_pedido).toEqual([{ variante_id: PELICULA, sku: "ACE-0050", nome: "Película", recebida: 2, custo_da_nota: 400 }]);
    // a segunda entrada passa do pedido; o custo da nota é a média pela quantidade
    const e2 = await receber(gerente, ids.lojaB, forn, [{ variante: cat.capa, quantidade: 5, custo: 2_000 }]);
    await valor(gerente, LIGAR, [e2.id, pedido.id, "Segunda entrega"]);
    p = await valor<Pedido>(gerente, PEDIDO, [pedido.id]);
    expect([p.itens[0]?.recebida, p.itens[0]?.custo_da_nota]).toEqual([11, 1_945]);
    const lista = await valor<{ id: string; unidades: number; recebidas: number; entradas: number; total_previsto: number | null }[]>(gerente, LISTA, [ids.lojaB, "aberto"]);
    // as recebidas da lista param no pedido de cada linha (10 de 10 da capa, 0 de 2 do aparelho)
    expect(lista.find((x) => x.id === pedido.id)).toMatchObject({ unidades: 12, recebidas: 10, entradas: 2, total_previsto: null });
    // a entrada estornada deixa de contar (e continua na lista das entradas, marcada)
    await valor(gerente, ESTORNO, [e2.id, "Nota errada"]);
    p = await valor<Pedido>(gerente, PEDIDO, [pedido.id]);
    expect(p.itens[0]?.recebida).toBe(6);
    expect(p.entradas.map((e) => e.situacao)).toEqual(["registrada", "estornada"]);
    // desligar devolve a entrada para fora do pedido
    expect(await valor<boolean>(gerente, LIGAR, [e1.id, null, "Ligada errado"])).toBe(true);
    expect((await valor<Pedido>(gerente, PEDIDO, [pedido.id])).itens[0]?.recebida).toBe(0);
  });

  it("ligar recusa outra loja, outro fornecedor, a carga inicial, a estornada e o pedido encerrado; quem não recebe na loja não liga", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const forn = await fornecedor(dono);
    const outro = await fornecedor(dono, "Outra Distribuidora");
    const pedido = await pedir(dono, ids.lojaB, forn);
    const daLojaA = await receber(dono, ids.lojaA, forn, [{ variante: cat.capa, quantidade: 1 }]);
    const deOutro = await receber(dono, ids.lojaB, outro, [{ variante: cat.capa, quantidade: 1 }]);
    const carga = await valor<{ id: string }>(dono, ENTRADA, [ids.lojaB, "carga_inicial", null, null, JSON.stringify([{ variante: cat.capa, quantidade: 1 }]), chave(), "Contagem"]);
    const estornada = await receber(dono, ids.lojaB, forn, [{ variante: cat.capa, quantidade: 1 }]);
    await valor(dono, ESTORNO, [estornada.id, "Lançada em dobro"]);
    expect(await recusa(dono, LIGAR, [daLojaA.id, pedido.id, "Tentativa"])).toBe("22023: O pedido é de outra loja");
    expect(await recusa(dono, LIGAR, [deOutro.id, pedido.id, "Tentativa"])).toBe("22023: O pedido é de outro fornecedor");
    expect(await recusa(dono, LIGAR, [carga.id, pedido.id, "Tentativa"])).toBe("22023: Só a entrada de compra de fornecedor recebe pedido");
    expect(await recusa(dono, LIGAR, [estornada.id, pedido.id, "Tentativa"])).toBe("22023: A entrada foi estornada: não recebe pedido");
    expect(await recusa(dono, LIGAR, [deOutro.id, "00000000-0000-4000-8000-00000000dead", "Tentativa"])).toBe("P0002: Pedido de compra não encontrado");
    expect(await recusa(dono, LIGAR, [deOutro.id, pedido.id, "x"])).toMatch(/^22023/);
    expect(await recusa(await naLoja(ids.vendedorA, ids.lojaA), LIGAR, [daLojaA.id, null, "Tentativa"])).toBe("P0002: Entrada não encontrada para você");
    // a ligação ao pedido encerrado fica
    const certa = await receber(dono, ids.lojaB, forn, [{ variante: cat.capa, quantidade: 1 }]);
    await valor(dono, LIGAR, [certa.id, pedido.id, "Chegou"]);
    expect(await valor<string>(dono, ENCERRAR, [pedido.id, "Recebido com falta do aparelho"])).toBe("encerrado");
    expect(await recusa(dono, LIGAR, [certa.id, null, "Tentativa"])).toBe("22023: O pedido desta entrada já foi encerrado: a ligação fica");
    const nova = await receber(dono, ids.lojaB, forn, [{ variante: cat.capa, quantidade: 1 }]);
    expect(await recusa(dono, LIGAR, [nova.id, pedido.id, "Tentativa"])).toBe("22023: O pedido já foi encerrado");
  });

  it("a leitura: a lista e o pedido de quem recebe na loja; o custo só para quem vê custo; o dono vê a rede; o vendedor e outra rede, não", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const forn = await fornecedor(gerente);
    const pedido = await pedir(gerente, ids.lojaB, forn, itens({ variante: cat.capa, quantidade: 10, custo: 1_800 }));
    expect((await valor<Pedido>(gerente, PEDIDO, [pedido.id])).itens[0]?.custo_combinado).toBe(1_800);
    expect((await valor<{ total_previsto: number }[]>(gerente, LISTA, [ids.lojaB, null]))[0]?.total_previsto).toBe(18_000);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await valor<{ id: string }[]>(dono, LISTA, [null, null])).map((p) => p.id)).toContain(pedido.id);
    // sem custo.ver, nada de custo (nem na auditoria do pedido)
    const auditoria = async (s: Sessao) => comoUsuario(db, s, async () =>
      Number((await db.query<{ n: string }>("select count(*)::text as n from public.auditoria where alvo_tipo = 'pedidos_compra'")).rows[0]?.n), { criarSessao: false });
    expect(await auditoria(gerente)).toBeGreaterThan(0);
    await db.query("delete from public.papel_permissoes where papel = 'gerente' and permissao = 'custo.ver'");
    const semCusto = await valor<Pedido>(gerente, PEDIDO, [pedido.id]);
    expect([semCusto.ve_custo, semCusto.itens[0]?.custo_combinado]).toEqual([false, null]);
    expect((await valor<{ total_previsto: number | null }[]>(gerente, LISTA, [ids.lojaB, null]))[0]?.total_previsto).toBeNull();
    expect(await auditoria(gerente)).toBe(0);
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await recusa(vendedor, LISTA, [null, null])).toMatch(/^42501/);
    expect(await recusa(vendedor, PEDIDO, [pedido.id])).toBe("P0002: Pedido de compra não encontrado para você");
    expect(await recusa(gerente, LISTA, [ids.lojaA, null])).toMatch(/^42501/);
    expect(await recusa(gerente, LISTA, [ids.lojaB, "pago"])).toBe("22023: Situação desconhecida");
    const outraRede = { usuario: ids.donoOutraOrg, sessao: "9a000000-0000-4000-8000-0000000009ff" };
    await comoUsuario(db, outraRede, () => db.query("select 1"));
    expect(await recusa(outraRede, PEDIDO, [pedido.id])).toBe("P0002: Pedido de compra não encontrado para você");
    expect(await recusa(null, LISTA, [null, null])).toMatch(/^42501/);
  });

  it("encerrar: sem nada recebido, cancelado; com algo, encerrado; uma vez, com motivo; o pedido não muda nem se apaga", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const forn = await fornecedor(gerente);
    const vazio = await pedir(gerente, ids.lojaB, forn);
    expect(await recusa(gerente, ENCERRAR, [vazio.id, "x"])).toMatch(/^22023/);
    expect(await recusa(await naLoja(ids.vendedorA, ids.lojaA), ENCERRAR, [vazio.id, "Tentativa"])).toBe("P0002: Pedido de compra não encontrado para você");
    expect(await valor<string>(gerente, ENCERRAR, [vazio.id, "Fornecedor sem estoque"])).toBe("cancelado");
    expect(await valor<string>(gerente, ENCERRAR, [vazio.id, "De novo"])).toBe("ja_encerrado");
    const motivo = await db.query<{ motivo: string }>("select motivo from public.auditoria where alvo_tipo = 'pedidos_compra' and alvo_id = $1 order by id desc limit 1", [vazio.id]);
    expect(motivo.rows[0]?.motivo).toMatch(/^Pedido de compra nº \d+ cancelado: Fornecedor sem estoque$/);
    // nem o dono do banco muda ou apaga o pedido e as linhas
    for (const sql of ["update public.pedidos_compra set documento = 'X' where id = $1", "delete from public.pedidos_compra where id = $1",
      "update public.pedido_compra_itens set quantidade = 99 where pedido_id = $1", "delete from public.pedido_compra_itens where pedido_id = $1"]) {
      await db.exec("savepoint direto");
      let codigo: string | null = null;
      try { await db.query(sql, [vazio.id]); } catch (e) { codigo = (e as { code?: string }).code ?? "?"; }
      await db.exec("rollback to savepoint direto");
      expect(codigo, sql).toBe("42501");
    }
  });
});
