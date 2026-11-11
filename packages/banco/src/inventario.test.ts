// Inventário cíclico com ajuste aprovado por outra pessoa (lote L4b: ORA-INV-008). Banco em memória com
// todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
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
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `6b000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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

const ABRIR = "select public.inventario_abrir($1, $2::uuid[], $3, $4) as v";
const CONTAR = "select public.inventario_contar($1, $2, $3, $4::text[]) as v";
const ENVIAR = "select public.inventario_enviar($1, $2) as v";
const DECIDIR = "select public.inventario_decidir($1, $2, $3) as v";
const CANCELAR = "select public.inventario_cancelar($1, $2) as v";
type Aberto = { id: string; numero: number; repetida: boolean };
const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ quantidade: number }>("select quantidade from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0]?.quantidade ?? 0;
const divergencias = async () => (await db.query("select * from privado.divergencias_estoque()")).rows;
// O técnico (sem permissões de estoque) com a sessão na assistência.
const sessaoSemPermissao = () => ({ usuario: ids.tecnico, sessao: `6b100000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });
const imeiDe = async (item: string) => (await db.query<{ imei: string }>("select imei from public.itens_serializados where id = $1", [item])).rows[0]?.imei ?? "";

describe("inventário (L4b)", () => {
  it("gerente conta e envia; o dono aprova: capa a menos vira perda, aparelho não encontrado é baixado, o de fora é só apontado", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const inv = await valor<Aberto>(gerente, ABRIR, [ids.lojaB, [cat.capa, cat.aparelho], "Capas e aparelhos", "form:inv:0001"]);
    expect(await valor<Aberto>(gerente, ABRIR, [ids.lojaB, [cat.capa, cat.aparelho], "Capas e aparelhos", "form:inv:0001"])).toEqual({ ...inv, repetida: true });
    // Loja B: 3 capas e 1 aparelho (b1) no sistema. Contou 2 capas e não achou o b1; leu um IMEI que não é desta loja.
    expect(await valor(gerente, CONTAR, [inv.id, cat.capa, 2, null])).toEqual({ sistema: 3, contado: 2 });
    const fora = comDigitoLuhn("35209900190001");
    expect(await valor(gerente, CONTAR, [inv.id, cat.aparelho, null, [fora]])).toEqual({ sistema: 1, contado: 1 });
    expect(await codigo(gerente, DECIDIR, [inv.id, true, "Aprovando"])).toBe("P0002"); // gerente não aprova ajuste
    expect(await valor<boolean>(gerente, ENVIAR, [inv.id, "Contagem de segunda-feira"])).toBe(true);

    const dono = await naLoja(ids.dono, ids.lojaA);
    const r = await valor<{ situacao: string; ajustes: number }>(dono, DECIDIR, [inv.id, true, "Conferido com o gerente"]);
    expect(r).toMatchObject({ situacao: "aprovado", ajustes: 2 });
    expect(await saldo(ids.lojaB, cat.capa)).toBe(2);
    expect(await saldo(ids.lojaB, cat.aparelho)).toBe(0);
    expect((await db.query("select situacao, em_estoque from public.itens_serializados where id = $1", [itens.b1])).rows[0]).toEqual({ situacao: "baixado", em_estoque: false });
    const trilha = (await db.query<{ variante_id: string; ajuste_quantidade: number; encontrados_fora: string[] | null }>(
      "select variante_id, ajuste_quantidade, encontrados_fora from public.inventario_itens where inventario_id = $1 order by tipo", [inv.id])).rows;
    expect(trilha.map((t) => [t.variante_id, t.ajuste_quantidade, t.encontrados_fora])).toEqual([[cat.capa, -1, null], [cat.aparelho, -1, [fora]]].sort((a, b) => String(a[0]) < String(b[0]) ? 1 : -1));
    const movimentos = (await db.query<{ tipo: string; motivo: string }>("select tipo, motivo from public.estoque_movimentos where referencia_tipo = 'inventario' and referencia_id = $1 order by id", [inv.id])).rows;
    expect(movimentos.map((m) => m.tipo)).toEqual(expect.arrayContaining(["perda", "perda"]));
    expect(movimentos[0]?.motivo).toMatch(/^Inventário nº \d+: Conferido com o gerente$/);
    expect(await valor(dono, DECIDIR, [inv.id, true, "Conferido com o gerente"])).toMatchObject({ repetida: true });
    expect(await divergencias()).toEqual([]);
  });

  it("contagem a mais vira ajuste positivo; o aparelho encontrado não muda; recusar não mexe no estoque", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const inv = await valor<Aberto>(gerente, ABRIR, [ids.lojaB, [cat.capa, cat.aparelho], "Conferência", "form:inv:0002"]);
    await valor(gerente, CONTAR, [inv.id, cat.capa, 5, null]);
    await valor(gerente, CONTAR, [inv.id, cat.aparelho, null, [await imeiDe(itens.b1)]]);
    await valor(gerente, ENVIAR, [inv.id, "Achamos capas no fundo"]);
    expect(await valor(dono, DECIDIR, [inv.id, true, "Conferido na loja"])).toMatchObject({ ajustes: 1 });
    expect(await saldo(ids.lojaB, cat.capa)).toBe(5);
    expect(await saldo(ids.lojaB, cat.aparelho)).toBe(1);

    const outro = await valor<Aberto>(gerente, ABRIR, [ids.lojaB, [cat.capa], "Recontagem", "form:inv:0003"]);
    await valor(gerente, CONTAR, [outro.id, cat.capa, 0, null]);
    await valor(gerente, ENVIAR, [outro.id, "Sumiram"]);
    expect(await valor(dono, DECIDIR, [outro.id, false, "Recontar com calma"])).toMatchObject({ situacao: "recusado", ajustes: 0 });
    expect(await saldo(ids.lojaB, cat.capa)).toBe(5);
  });

  it("aparelho vendido ou reservado depois da contagem não é baixado; capa reservada impede ajuste que não cabe (OR001)", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    // O dono abre e conta (tem estoque.conferir) mas não envia (não tem estoque.solicitar_ajuste).
    const inv = await valor<Aberto>(dono, ABRIR, [ids.lojaA, [cat.aparelho, cat.capa], "Aparelhos e capas", "form:inv:0004"]);
    expect(await valor(dono, CONTAR, [inv.id, cat.aparelho, null, []])).toEqual({ sistema: 2, contado: 0 });
    await valor(dono, CONTAR, [inv.id, cat.capa, 0, null]);
    expect(await codigo(dono, ENVIAR, [inv.id, "Dono enviando"])).toBe("P0002");
    // Depois da contagem: o a1 é reservado e as capas também (3 de 10).
    await valor(dono, "select public.reservar_estoque($1, 1, $2, 'inv:reserva:1') as v", [cat.aparelho, itens.a1]);
    await valor(dono, "select public.reservar_estoque($1, 3, null, 'inv:reserva:2') as v", [cat.capa]);
    // O gerente B não envia inventário da loja A; um gerente fictício da loja A envia.
    await db.query("insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, inicio) values ($1, $2, 'gerente', 'unidade', $3, now() - interval '1 day')",
      [ids.gerenteB, ids.organizacao, ids.lojaA]);
    const gerenteA = await naLoja(ids.gerenteB, ids.lojaA);
    await valor(gerenteA, ENVIAR, [inv.id, "Contagem"]);
    const admin = await naLoja(ids.administrador, ids.lojaA);
    expect(await codigo(admin, DECIDIR, [inv.id, true, "Aprovando"])).toBe("P0002"); // administrador não tem estoque.ajustar
    expect(await codigo(dono, DECIDIR, [inv.id, true, "Aprovando o próprio"])).toBe("OR025"); // abriu, não aprova
  });

  it("permissões e estados: vendedor conta e pede o ajuste mas não aprova; outra loja não; só conta em contagem, só envia contado, cancela antes de decidir", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    // Pela matriz do ADR-002 o vendedor confere o estoque e pede ajuste (estoque.conferir e
    // estoque.solicitar_ajuste): abre, conta e envia na loja dele; aprovar é de quem tem estoque.ajustar.
    const doVendedor = await valor<Aberto>(vendedor, ABRIR, [ids.lojaA, [cat.capa], "Capas do balcão", "form:inv:0005"]);
    await valor(vendedor, CONTAR, [doVendedor.id, cat.capa, 10, null]);
    expect(await valor<boolean>(vendedor, ENVIAR, [doVendedor.id, "Contagem do balcão"])).toBe(true);
    expect(await codigo(vendedor, DECIDIR, [doVendedor.id, true, "Aprovando o meu"])).toBe("P0002");
    expect(await codigo(gerente, ABRIR, [ids.lojaA, [cat.capa], "Outra loja", "form:inv:0006"])).toBe("42501");
    expect(await codigo(sessaoSemPermissao(), ABRIR, [ids.lojaA, [cat.capa], "Técnico", "form:inv:0009"])).toBe("42501");
    expect(await codigo(gerente, ABRIR, [ids.lojaB, [cat.recarga], "Serviço", "form:inv:0007"])).toBe("22023");
    const inv = await valor<Aberto>(gerente, ABRIR, [ids.lojaB, [cat.capa, cat.aparelho], "Parcial", "form:inv:0008"]);
    await valor(gerente, CONTAR, [inv.id, cat.capa, 3, null]);
    expect(await codigo(gerente, ENVIAR, [inv.id, "Falta o aparelho"])).toBe("22023");
    expect(await codigo(gerente, CONTAR, [inv.id, cat.chip, 1, null])).toBe("22023"); // não faz parte
    expect(await codigo(vendedor, CONTAR, [inv.id, cat.capa, 1, null])).toBe("P0002"); // inventário de outra loja
    expect(await valor<boolean>(gerente, CANCELAR, [inv.id, "Começar de novo"])).toBe(true);
    expect(await codigo(gerente, CONTAR, [inv.id, cat.capa, 1, null])).toBe("22023");
    // Cada um lê só os inventários da própria loja.
    expect((await comoUsuario(db, vendedor, async () => (await db.query("select id from public.inventarios")).rows)).length).toBe(1);
    expect((await comoUsuario(db, gerente, async () => (await db.query("select id from public.inventarios")).rows)).length).toBe(1);
  });
});
