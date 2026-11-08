// Integridade do estoque (auditoria do Codex de 08/11/2026): as reproduções de
// docs/analises/evidencias/2026-11-08/banco.repro.ts viraram regressões permanentes, com os
// casos vizinhos de cada regra. Banco em memória com todas as migrations; dados fictícios.
// Cada teste roda numa transação desfeita no fim. A concorrência real está em concorrencia.test.ts.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, migrations, reversao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

const MIGRATION = migrations().find((m) => m.nome.endsWith("_integridade_estoque.sql"))?.nome ?? "";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

// Uma exceção SQL aborta a transação do teste; o savepoint permite continuar depois dela.
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

let sessoes = 0;
async function naLoja<T>(usuario: string, unidade: string, acao: () => Promise<T>): Promise<T> {
  const sessao = { usuario, sessao: `41000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  return comoUsuario(db, sessao, async () => {
    const { rows } = await db.query<{ ok: boolean }>("select public.selecionar_unidade($1) as ok", [unidade]);
    expect(rows[0]?.ok).toBe(true);
    return acao();
  });
}
const vendedorA = <T>(acao: () => Promise<T>) => naLoja(ids.vendedorA, ids.lojaA, acao);

const reservar = async (variante: string, quantidade: number | null, item: string | null, chave: string, origem = "pdv", minutos = 15) =>
  (await db.query<{ id: string }>("select public.reservar_estoque($1, $2, $3, $4, $5, $6) as id", [variante, quantidade, item, chave, origem, minutos])).rows[0]?.id;

const registrar = (imei: string | null, imei2: string | null, chave: string, unidade = ids.lojaA, variante = cat.aparelho) =>
  db.query<{ id: string }>("select privado.registrar_item_serializado($1, $2, $3, $4, null, 'entrada_compra', $5) as id", [unidade, variante, imei, imei2, chave]);

const lancar = (unidade: string, variante: string, quantidade: number, tipo: string, item: string | null, chave: string | null) =>
  db.query<{ id: number }>("select privado.lancar_movimento($1, $2, $3, $4, $5, null, null, null, $6) as id", [unidade, variante, quantidade, tipo, item, chave]);

const contar = async (sql: string, params: unknown[] = []) => (await db.query<{ n: number }>(sql, params)).rows[0]?.n ?? -1;
const divergencias = () => db.query<{ regra: string }>("select regra from privado.divergencias_estoque()").then((r) => r.rows);
const item = async (id: string) =>
  (await db.query<{ situacao: string; em_estoque: boolean; unidade_id: string }>("select situacao, em_estoque, unidade_id from public.itens_serializados where id = $1", [id])).rows[0];
const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ quantidade: number; reservado: number }>("select quantidade, reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0];

describe("REV-020 (#19): IMEI, IMEI2 e ICCID formam um conjunto único", () => {
  it("IMEI principal de um aparelho não pode virar IMEI2 de outro", async () => {
    expect(await erroDe(() => db.query("update public.itens_serializados set imei2 = $1 where id = $2", [cat.imei1, itens.a2]))).toBe("23505");
  });

  it("entrada nova com IMEI2 igual ao IMEI de outro aparelho é recusada sem deixar item nem lançamento", async () => {
    const antes = await contar("select count(*)::int as n from public.estoque_movimentos");
    expect(await erroDe(() => registrar(comDigitoLuhn("35209900171001"), cat.imei1, "rev020:1"))).toBe("23505");
    expect(await contar("select count(*)::int as n from public.estoque_movimentos")).toBe(antes);
    expect(await contar("select count(*)::int as n from public.itens_serializados where imei2 = $1", [cat.imei1])).toBe(0);
  });

  it("entrada nova com IMEI igual ao IMEI2 de outro aparelho é recusada", async () => {
    const segundo = comDigitoLuhn("35209900171003");
    await registrar(comDigitoLuhn("35209900171002"), segundo, "rev020:2");
    expect(await erroDe(() => registrar(segundo, null, "rev020:3"))).toBe("23505");
  });

  it("o mesmo aparelho guarda os dois IMEIs; corrigir o IMEI2 libera o anterior", async () => {
    const [principal, antigo, novo] = ["35209900171004", "35209900171005", "35209900171006"].map(comDigitoLuhn);
    const { rows } = await registrar(principal ?? "", antigo ?? "", "rev020:4");
    await db.query("update public.itens_serializados set imei2 = $1 where id = $2", [novo, rows[0]?.id]);
    expect(await erroDe(() => registrar(antigo ?? "", null, "rev020:5"))).toBeNull();
    expect(await divergencias()).toEqual([]);
  });
});

describe("REV-021 (#20): a mesma chave de reserva só repete a mesma reserva", () => {
  it("outra quantidade com a mesma chave é recusada", async () => {
    await vendedorA(async () => {
      await reservar(cat.capa, 1, null, "rev021:quantidade");
      expect(await erroDe(() => reservar(cat.capa, 9, null, "rev021:quantidade"))).toBe("OR004");
    });
  });

  it("outra origem com a mesma chave é recusada", async () => {
    await vendedorA(async () => {
      await reservar(cat.capa, 1, null, "rev021:origem", "pdv");
      expect(await erroDe(() => reservar(cat.capa, 1, null, "rev021:origem", "online"))).toBe("OR004");
    });
  });

  it("outro prazo com a mesma chave é recusado; o pedido idêntico devolve a mesma reserva e conta uma vez", async () => {
    await vendedorA(async () => {
      const primeira = await reservar(cat.capa, 2, null, "rev021:prazo", "pdv", 15);
      expect(await erroDe(() => reservar(cat.capa, 2, null, "rev021:prazo", "pdv", 30))).toBe("OR004");
      expect(await reservar(cat.capa, 2, null, "rev021:prazo", "pdv", 15)).toBe(primeira);
    });
    expect((await saldo(ids.lojaA, cat.capa))?.reservado).toBe(2);
  });
});

describe("REV-022 (#21): a chave da entrada confere o conteúdo e nunca deixa item sem livro", () => {
  it("chave da entrada de outro aparelho com outro IMEI é recusada", async () => {
    expect(await erroDe(() => registrar(comDigitoLuhn("35209900170999"), null, "teste:a1"))).toBe("OR004");
  });

  it("chave de um lançamento de acessório é recusada e nenhum aparelho fica sem entrada no livro", async () => {
    expect(await erroDe(() => registrar(comDigitoLuhn("35209900170998"), null, "teste:capaA"))).toBe("OR004");
    expect(await contar(`select count(*)::int as n from public.itens_serializados i
      where not exists (select 1 from public.estoque_movimentos m where m.item_serializado_id = i.id)`)).toBe(0);
  });

  it("a mesma entrada repetida devolve o mesmo aparelho, em outra loja ou variação é recusada", async () => {
    expect((await db.query<{ id: string }>(
      "select privado.registrar_item_serializado($1, $2, $3, null, null, 'entrada_importacao', 'teste:a1') as id", [ids.lojaA, cat.aparelho, cat.imei1],
    )).rows[0]?.id).toBe(itens.a1);
    expect(await erroDe(() => db.query(
      "select privado.registrar_item_serializado($1, $2, $3, null, null, 'entrada_importacao', 'teste:a1')", [ids.lojaB, cat.aparelho, cat.imei1],
    ))).toBe("OR004");
    expect(await erroDe(() => registrar(cat.imei1, null, "teste:a1"))).toBe("OR004");
  });

  it("lançamento com chave repetida e outro conteúdo é recusado; o idêntico devolve o mesmo", async () => {
    const { rows } = await lancar(ids.lojaB, cat.capa, 2, "entrada_compra", null, "rev022:compra");
    expect((await lancar(ids.lojaB, cat.capa, 2, "entrada_compra", null, "rev022:compra")).rows[0]?.id).toBe(rows[0]?.id);
    expect(await erroDe(() => lancar(ids.lojaB, cat.capa, 5, "entrada_compra", null, "rev022:compra"))).toBe("OR004");
    expect(await erroDe(() => lancar(ids.lojaA, cat.capa, 2, "entrada_compra", null, "rev022:compra"))).toBe("OR004");
  });

  it("entrada de aparelho sem chave é recusada", async () => {
    expect(await erroDe(() => db.query(
      "select privado.registrar_item_serializado($1, $2, $3, null, null, 'entrada_compra', null)", [ids.lojaA, cat.aparelho, comDigitoLuhn("35209900171010")],
    ))).toBe("22023");
  });
});

describe("REV-023 (#22): cada aparelho conta uma vez, na loja em que está", () => {
  it("segunda entrada do mesmo aparelho com outra chave é recusada e o saldo continua igual aos aparelhos", async () => {
    expect(await erroDe(() => lancar(ids.lojaA, cat.aparelho, 1, "entrada_compra", itens.a1, "rev023:duplicada"))).toBe("OR005");
    const { rows } = await db.query<{ quantidade: number; itens: number }>(`
      select s.quantidade, (select count(*)::int from public.itens_serializados i
        where i.unidade_id = s.unidade_id and i.variante_id = s.variante_id and i.situacao = 'disponivel') as itens
      from public.estoque_saldos s where unidade_id = $1 and variante_id = $2`, [ids.lojaA, cat.aparelho]);
    expect(rows[0]?.quantidade).toBe(rows[0]?.itens);
    expect(await divergencias()).toEqual([]);
  });

  it("venda com reserva consumida, devolução em outra loja e tudo conferido", async () => {
    const reserva = await vendedorA(() => reservar(cat.aparelho, 1, itens.a2, "rev023:venda"));
    expect(await erroDe(() => lancar(ids.lojaA, cat.aparelho, -1, "venda", itens.a2, "rev023:venda:antes"))).toBe("OR002");
    await db.query("select privado.encerrar_reserva($1, 'consumida')", [reserva]);
    await lancar(ids.lojaA, cat.aparelho, -1, "venda", itens.a2, "rev023:venda:saida");
    expect(await item(itens.a2)).toMatchObject({ situacao: "vendido", em_estoque: false });
    expect(await erroDe(() => lancar(ids.lojaA, cat.aparelho, -1, "venda", itens.a2, "rev023:venda:de-novo"))).toBe("OR005");

    await lancar(ids.lojaB, cat.aparelho, 1, "devolucao", itens.a2, "rev023:devolucao");
    expect(await item(itens.a2)).toMatchObject({ situacao: "disponivel", em_estoque: true, unidade_id: ids.lojaB });
    expect(await saldo(ids.lojaA, cat.aparelho)).toMatchObject({ quantidade: 1 });
    expect(await saldo(ids.lojaB, cat.aparelho)).toMatchObject({ quantidade: 2 });
    expect(await divergencias()).toEqual([]);
  });

  it("transferência: sai da loja A em trânsito e só entra na loja B uma vez", async () => {
    await lancar(ids.lojaA, cat.aparelho, -1, "transferencia_saida", itens.a1, "rev023:transf:saida");
    expect(await item(itens.a1)).toMatchObject({ situacao: "em_transito", em_estoque: false });
    expect(await erroDe(() => lancar(ids.lojaB, cat.aparelho, -1, "transferencia_saida", itens.a1, "rev023:transf:errada"))).toBe("OR005");
    await lancar(ids.lojaB, cat.aparelho, 1, "transferencia_entrada", itens.a1, "rev023:transf:entrada");
    expect(await erroDe(() => lancar(ids.lojaB, cat.aparelho, 1, "transferencia_entrada", itens.a1, "rev023:transf:repetida"))).toBe("OR005");
    expect(await item(itens.a1)).toMatchObject({ situacao: "disponivel", em_estoque: true, unidade_id: ids.lojaB });
    expect(await divergencias()).toEqual([]);
  });

  it("perda de aparelho reservado é recusada até encerrar a reserva", async () => {
    await vendedorA(() => reservar(cat.chip, 1, itens.chipA, "rev023:perda"));
    expect(await erroDe(() => lancar(ids.lojaA, cat.chip, -1, "perda", itens.chipA, "rev023:perda:1"))).toBe("OR002");
  });

  it("posição, loja e saída do item não mudam fora do livro; item novo não nasce no estoque", async () => {
    expect(await erroDe(() => db.query("update public.itens_serializados set em_estoque = false where id = $1", [itens.a1]))).toBe("42501");
    expect(await erroDe(() => db.query("update public.itens_serializados set unidade_id = $1 where id = $2", [ids.lojaB, itens.a1]))).toBe("42501");
    expect(await erroDe(() => db.query("update public.itens_serializados set situacao = 'vendido' where id = $1", [itens.a1]))).toBe("42501");
    expect(await erroDe(() => db.query(
      "insert into public.itens_serializados (organizacao_id, variante_id, unidade_id, imei, em_estoque) values ($1, $2, $3, $4, true)",
      [ids.organizacao, cat.aparelho, ids.lojaA, comDigitoLuhn("35209900171020")],
    ))).toBe("23514");
  });

  it("saída legítima baixa o saldo (o upsert antigo recusava toda saída); acima do saldo continua recusada", async () => {
    await lancar(ids.lojaA, cat.capa, -3, "venda", null, "saida:venda");
    await lancar(ids.lojaA, cat.capa, -1, "perda", null, "saida:perda");
    expect((await saldo(ids.lojaA, cat.capa))?.quantidade).toBe(6);
    expect(await erroDe(() => lancar(ids.lojaA, cat.capa, -7, "venda", null, "saida:demais"))).toBe("23514");
    expect(await erroDe(() => lancar(ids.lojaC, cat.capa, -1, "perda", null, "saida:sem-saldo"))).toBe("23514");
    expect(await divergencias()).toEqual([]);
  });

  it("o sinal da quantidade acompanha o tipo do lançamento", async () => {
    expect(await erroDe(() => lancar(ids.lojaA, cat.capa, 1, "venda", null, "rev023:sinal:venda"))).toBe("23514");
    expect(await erroDe(() => lancar(ids.lojaA, cat.capa, -1, "entrada_compra", null, "rev023:sinal:entrada"))).toBe("23514");
    expect(await erroDe(() => lancar(ids.lojaA, cat.capa, -1, "ajuste", null, "rev023:sinal:ajuste"))).toBeNull();
  });

  it("a conferência aponta saldo mexido por fora do livro", async () => {
    await db.query("update public.estoque_saldos set quantidade = quantidade + 1 where unidade_id = $1 and variante_id = $2", [ids.lojaA, cat.aparelho]);
    expect((await divergencias()).map((d) => d.regra).sort()).toEqual(["saldo_igual_ao_livro", "saldo_igual_aos_itens"]);
  });
});

describe("liberar reserva de outra pessoa (auditoria §7.4)", () => {
  it("colega da loja não libera; quem reservou libera", async () => {
    const reserva = await vendedorA(() => reservar(cat.capa, 1, null, "lib:1"));
    const colega = await naLoja(ids.vendedorAB, ids.lojaA, () => erroDe(() => db.query("select public.liberar_reserva($1)", [reserva])));
    expect(colega).toBe("42501");
    expect(await vendedorA(async () => (await db.query<{ ok: boolean }>("select public.liberar_reserva($1) as ok", [reserva])).rows[0]?.ok)).toBe(true);
  });

  it("gerente da loja libera a reserva do vendedor e fica na auditoria", async () => {
    const reserva = await naLoja(ids.vendedorAB, ids.lojaB, () => reservar(cat.capa, 1, null, "lib:2"));
    const ok = await naLoja(ids.gerenteB, ids.lojaB, async () => (await db.query<{ ok: boolean }>("select public.liberar_reserva($1) as ok", [reserva])).rows[0]?.ok);
    expect(ok).toBe(true);
    const { rows } = await db.query<{ usuario_id: string; organizacao_id: string }>(
      "select usuario_id, organizacao_id from public.auditoria where acao = 'estoque.reserva_de_outro_liberada' and alvo_id = $1", [reserva]);
    expect(rows).toEqual([{ usuario_id: ids.gerenteB, organizacao_id: ids.organizacao }]);
    expect(await divergencias()).toEqual([]);
  });
});

describe("reversão da migration de integridade", () => {
  it("volta funções, colunas, gatilhos e permissões ao estado anterior", async () => {
    const retrato = async (banco: PGlite) => (await banco.query<{ item: string }>(`
      select 'funcao ' || p.oid::regprocedure || ' ' || md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') as item
      from pg_proc p where p.pronamespace in ('public'::regnamespace, 'privado'::regnamespace)
      union all select 'coluna ' || table_schema || '.' || table_name || '.' || column_name || ' ' || data_type
      from information_schema.columns where table_schema in ('public', 'privado')
      union all select 'gatilho ' || tgrelid::regclass || '.' || tgname from pg_trigger where not tgisinternal
      union all select 'restricao ' || conrelid::regclass || '.' || conname from pg_constraint where connamespace in ('public'::regnamespace, 'privado'::regnamespace)
      union all select 'permissao ' || codigo from public.permissoes
      union all select 'papel ' || papel || ' ' || permissao from public.papel_permissoes
      order by 1`)).rows.map((r) => r.item);
    const anterior = await criarBanco(MIGRATION);
    const revertido = await criarBanco();
    await revertido.exec(reversao(MIGRATION));
    expect(await retrato(revertido)).toEqual(await retrato(anterior));
    await anterior.close();
    await revertido.close();
  });
});
