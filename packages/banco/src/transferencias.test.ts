// ADR-007 (#60): pedidos internos de transferência e o local DEFEITOS. Banco em memória com todas
// as migrations; dados FICTÍCIOS; cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
const defeitos = "4e000000-0000-4000-8000-0000000000d1";
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  await db.query("insert into public.unidades (id, organizacao_id, empresa_id, codigo, nome, tipo) values ($1, $2, $3, 'defeitos', 'DEFEITOS', 'excecao')",
    [defeitos, ids.organizacao, ids.empresa]);
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
  const s = { usuario, sessao: `4e000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

const SOLICITAR = "select public.transferencia_solicitar($1, $2, $3, $4, $5, $6) as v";
const solicitar = (s: Sessao, origem: string, destino: string, variante: string, quantidade: number, k = chave("t")) =>
  valor<string>(s, SOLICITAR, [origem, destino, variante, quantidade, "Reposição da loja", k]);
const separar = (s: Sessao, t: string, lista: string[] = []) => valor<string>(s, "select public.transferencia_separar($1, $2::uuid[]) as v", [t, lista]);
const enviar = (s: Sessao, t: string) => valor<string>(s, "select public.transferencia_enviar($1) as v", [t]);
const RECEBER = "select public.transferencia_receber($1, $2::text[], $3, $4) as v";
const receber = (s: Sessao, t: string, lidos: string[], quantidade: number | null, observacao: string | null = null) =>
  valor<string>(s, RECEBER, [t, lidos, quantidade, observacao]);
const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ quantidade: number; reservado: number }>("select quantidade, reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0]
  ?? { quantidade: 0, reservado: 0 };
const posicao = async (item: string) =>
  (await db.query<{ unidade_id: string; situacao: string; em_estoque: boolean }>("select unidade_id, situacao, em_estoque from public.itens_serializados where id = $1", [item])).rows[0];
const imeiDe = async (item: string) => (await db.query<{ imei: string }>("select imei from public.itens_serializados where id = $1", [item])).rows[0]?.imei ?? "";
const divergencias = async () => (await db.query("select regra from privado.divergencias_estoque()")).rows;

describe("pedido interno de acessório", () => {
  it("pedir não mexe no estoque; separar reserva na origem; enviar tira da origem; receber põe no destino; cada passo repetido devolve o mesmo", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const antesA = await saldo(ids.lojaA, cat.capa);
    const antesB = await saldo(ids.lojaB, cat.capa);
    const k = chave("t");
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 2, k);
    expect(await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 2, k)).toBe(t);
    expect(await errou(pedinte, SOLICITAR, [ids.lojaA, ids.lojaB, cat.capa, 3, "Reposição da loja", k])).toBe("OR004");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual(antesA);

    expect(await errou(pedinte, "select public.transferencia_separar($1, '{}'::uuid[])", [t])).toBe("42501");
    expect(await separar(origem, t)).toBe("separada");
    expect(await separar(origem, t)).toBe("separada");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: antesA.quantidade, reservado: antesA.reservado + 2 });

    expect(await enviar(origem, t)).toBe("enviada");
    expect(await enviar(origem, t)).toBe("enviada");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: antesA.quantidade - 2, reservado: antesA.reservado });
    expect(await saldo(ids.lojaB, cat.capa)).toEqual(antesB);
    const rede = await valor<{ unidade: string; chegando: number }[]>(origem, "select json_agg(r) as v from public.estoque_na_rede($1) r", [cat.capa]);
    expect(rede.find((r) => r.unidade === "Loja B")?.chegando).toBe(2);

    expect(await errou(origem, RECEBER, [t, [], 2, null])).toBe("42501");
    expect(await receber(pedinte, t, [], 2)).toBe("recebida");
    expect(await receber(pedinte, t, [], 2)).toBe("recebida");
    expect(await saldo(ids.lojaB, cat.capa)).toEqual({ quantidade: antesB.quantidade + 2, reservado: antesB.reservado });
    expect(await divergencias()).toEqual([]);
  });

  it("faltou item: sem explicação é recusado; com explicação entra só o contado e fica a divergência", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const antesB = await saldo(ids.lojaB, cat.capa);
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 3);
    await separar(origem, t);
    await enviar(origem, t);
    expect(await errou(pedinte, RECEBER, [t, [], 2, null])).toBe("22023");
    expect(await errou(pedinte, RECEBER, [t, [], 4, "Chegou uma a mais na caixa"])).toBe("22023");
    expect(await receber(pedinte, t, [], 2, "Caixa chegou com uma capa a menos")).toBe("recebida_com_divergencia");
    expect((await saldo(ids.lojaB, cat.capa)).quantidade).toBe(antesB.quantidade + 2);
    expect((await db.query("select quantidade_recebida, observacao from public.transferencias where id = $1", [t])).rows)
      .toEqual([{ quantidade_recebida: 2, observacao: "Caixa chegou com uma capa a menos" }]);
  });

  it("cancelar antes do envio libera a reserva uma vez; depois do envio não cancela; a origem recusa só antes de separar", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const antesA = await saldo(ids.lojaA, cat.capa);
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    await separar(origem, t);
    expect(await errou(origem, "select public.transferencia_encerrar($1, 'recusada', 'Sem estoque')", [t])).toBe("42501");
    expect(await valor(pedinte, "select public.transferencia_encerrar($1, 'cancelada', 'Não precisa mais') as v", [t])).toBe("cancelada");
    expect(await valor(pedinte, "select public.transferencia_encerrar($1, 'cancelada', 'Não precisa mais') as v", [t])).toBe("cancelada");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual(antesA);

    const outra = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    await separar(origem, outra);
    await enviar(origem, outra);
    expect(await errou(pedinte, "select public.transferencia_encerrar($1, 'cancelada', 'Desisti')", [outra])).toBe("42501");

    const recusada = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    expect(await valor(origem, "select public.transferencia_encerrar($1, 'recusada', 'Precisamos dela aqui') as v", [recusada])).toBe("recusada");
    expect(await errou(origem, "select public.transferencia_separar($1, '{}'::uuid[])", [recusada])).toBe("OR004");
  });

  it("separar além do disponível é OR001; vendedor da origem não separa", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const disponivel = await saldo(ids.lojaA, cat.capa);
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, disponivel.quantidade - disponivel.reservado + 1);
    expect(await errou(await naLoja(ids.dono, ids.lojaA), "select public.transferencia_separar($1, '{}'::uuid[])", [t])).toBe("OR001");
    const pequena = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    expect(await errou(await naLoja(ids.vendedorA, ids.lojaA), "select public.transferencia_separar($1, '{}'::uuid[])", [pequena])).toBe("42501");
  });
});

describe("pedido interno de aparelho", () => {
  it("o IMEI separado fica reservado (venda não pega); em trânsito sai do estoque; só o IMEI enviado é recebido", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.aparelho, 1);
    expect(await errou(origem, "select public.transferencia_separar($1, $2::uuid[])", [t, [itens.a1, itens.a2]])).toBe("22023");
    expect(await errou(origem, "select public.transferencia_separar($1, $2::uuid[])", [t, [itens.b1]])).toBe("OR003");
    expect(await separar(origem, t, [itens.a1])).toBe("separada");
    expect(await posicao(itens.a1)).toMatchObject({ situacao: "reservado", em_estoque: true });
    const vendedora = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await errou(vendedora, "select public.reservar_estoque($1, 1, $2, $3)", [cat.aparelho, itens.a1, chave("r")])).toBe("OR002");

    await enviar(origem, t);
    expect(await posicao(itens.a1)).toMatchObject({ unidade_id: ids.lojaA, situacao: "em_transito", em_estoque: false });
    expect(await errou(pedinte, RECEBER, [t, [comDigitoLuhn("35209900111111")], null, "IMEI diferente na caixa"])).toBe("22023");
    expect(await errou(pedinte, RECEBER, [t, [], null, null])).toBe("22023");
    expect(await receber(pedinte, t, [await imeiDe(itens.a1)], null)).toBe("recebida");
    expect(await posicao(itens.a1)).toEqual({ unidade_id: ids.lojaB, situacao: "disponivel", em_estoque: true });
    expect(await divergencias()).toEqual([]);
  });

  it("item que não chegou fica em trânsito e a transferência registra a divergência", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.aparelho, 1);
    await separar(origem, t, [itens.a2]);
    await enviar(origem, t);
    expect(await receber(pedinte, t, [], null, "A caixa chegou sem o aparelho")).toBe("recebida_com_divergencia");
    expect(await posicao(itens.a2)).toMatchObject({ situacao: "em_transito", em_estoque: false });
  });
});

describe("DEFEITOS (local de exceção)", () => {
  it("recebe o item com problema; não vende; aparece à parte na rede com disponível zero; regularizar exige quem ajusta estoque", async () => {
    const origem = await naLoja(ids.dono, ids.lojaA);
    const t = await solicitar(origem, ids.lojaA, defeitos, cat.aparelho, 1);
    await separar(origem, t, [itens.a1]);
    await enviar(origem, t);
    const naExcecao = await naLoja(ids.dono, defeitos);
    expect(await receber(naExcecao, t, [await imeiDe(itens.a1)], null)).toBe("recebida");
    expect(await posicao(itens.a1)).toMatchObject({ unidade_id: defeitos, situacao: "disponivel", em_estoque: true });

    expect(await errou(naExcecao, "select public.criar_venda($1)", [chave("v")])).toBe("42501");
    expect(await errou(naExcecao, "select public.reservar_estoque($1, 1, $2, $3)", [cat.aparelho, itens.a1, chave("r")])).toBe("42501");
    const rede = await valor<{ unidade: string; tipo: string; fisico: number; disponivel: number }[]>(naExcecao,
      "select json_agg(r) as v from public.estoque_na_rede($1) r", [cat.aparelho]);
    expect(rede.at(-1)).toMatchObject({ unidade: "DEFEITOS", tipo: "excecao", fisico: 1, disponivel: 0 });

    const volta = await solicitar(await naLoja(ids.gerenteB, ids.lojaB), defeitos, ids.lojaB, cat.aparelho, 1);
    expect(await separar(naExcecao, volta, [itens.a1])).toBe("separada");
    expect(await divergencias()).toEqual([]);
  });
});

describe("leitura dos pedidos", () => {
  it("as lojas envolvidas leem; outra rede não", async () => {
    const t = await solicitar(await naLoja(ids.gerenteB, ids.lojaB), ids.lojaA, ids.lojaB, cat.capa, 1);
    expect(await valor<number>(await naLoja(ids.vendedorA, ids.lojaA), "select count(*)::int as v from public.transferencias where id = $1", [t])).toBe(1);
    expect(await valor<number>(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), "select count(*)::int as v from public.transferencias where id = $1", [t])).toBe(0);
  });
});
