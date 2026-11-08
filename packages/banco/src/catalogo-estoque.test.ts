// ADR-003 — catálogo, preço, custo e estoque com IMEI/ICCID (ORA-007, ORA-010, ORA-011).
// Banco real em memória (PGlite) com todas as migrations; dados fictícios.
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
let sessoes = 0;

beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
});

const novaSessao = (usuario: string): Sessao => ({ usuario, sessao: `30000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });

async function como<T = Record<string, unknown>>(s: Sessao, sql: string, params: unknown[] = []) {
  return comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows);
}

// Sessão já com a unidade escolhida (papéis de unidade só valem na unidade da sessão).
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = novaSessao(usuario);
  const [linha] = await como<{ ok: boolean }>(s, "select public.selecionar_unidade($1) as ok", [unidade]);
  expect(linha?.ok).toBe(true);
  return s;
}

async function falha(acao: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await acao;
  } catch (erro) {
    return erro as { code?: string; message: string };
  }
  throw new Error("era esperado um erro, mas a operação foi aceita");
}

const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ quantidade: number; reservado: number }>(
    "select quantidade, reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante],
  )).rows[0];

const situacao = async (item: string) =>
  (await db.query<{ situacao: string }>("select situacao from public.itens_serializados where id = $1", [item])).rows[0]?.situacao;

const reservar = (s: Sessao, variante: string, quantidade: number | null, item: string | null, chave: string, minutos = 15) =>
  como<{ id: string }>(s, "select public.reservar_estoque($1, $2, $3, $4, 'pdv', $5) as id", [variante, quantidade, item, chave, minutos]);

describe("catálogo", () => {
  it("SKU é único na organização; o mesmo SKU em outra organização é aceito", async () => {
    const repetido = await falha(db.query(
      "insert into public.variantes (organizacao_id, produto_id, sku, nome) values ($1, $2, 'APA-0001', 'Cópia')", [ids.organizacao, cat.produtoAparelho],
    ));
    expect(repetido.code).toBe("23505");
    const { rows } = await db.query<{ id: string }>(
      "insert into public.produtos (organizacao_id, tipo, nome, categoria_id) values ($1, 'acessorio', 'Capa', $2) returning id", [ids.outraOrganizacao, cat.categoriaOutraOrg],
    );
    await db.query("insert into public.variantes (organizacao_id, produto_id, sku, nome) values ($1, $2, 'APA-0001', 'Outro dono')", [ids.outraOrganizacao, rows[0]?.id]);
  });

  it("código de barras não se repete na organização", async () => {
    const erro = await falha(db.query(
      "insert into public.variantes (organizacao_id, produto_id, sku, nome, codigo_barras) values ($1, $2, 'ACE-9999', 'Outra capa', '7890000000028')", [ids.organizacao, cat.produtoCapa],
    ));
    expect(erro.code).toBe("23505");
  });

  it("produto não usa categoria de outra organização", async () => {
    const erro = await falha(db.query(
      "insert into public.produtos (organizacao_id, tipo, nome, categoria_id) values ($1, 'acessorio', 'Intruso', $2)", [ids.organizacao, cat.categoriaOutraOrg],
    ));
    expect(erro.code).toBe("23503");
  });
});

describe("IMEI e ICCID", () => {
  const novoItem = (variante: string, imei: string | null, iccid: string | null, chave: string) =>
    db.query("select privado.registrar_item_serializado($1, $2, $3, null, $4, 'entrada_importacao', $5)", [ids.lojaA, variante, imei, iccid, chave]);

  it("IMEI com dígito errado ou repetido é recusado", async () => {
    const errado = cat.imei1.slice(0, 14) + String((Number(cat.imei1[14]) + 1) % 10);
    expect((await falha(novoItem(cat.aparelho, errado, null, "x:1"))).code).toBe("23514");
    expect((await falha(novoItem(cat.aparelho, "111111111111111", null, "x:2"))).code).toBe("23514");
    expect((await falha(novoItem(cat.aparelho, cat.imei1, null, "x:3"))).code).toBe("23505");
  });

  it("aparelho exige IMEI, chip exige ICCID e acessório não vira item serializado", async () => {
    expect((await falha(novoItem(cat.aparelho, null, comDigitoLuhn("895510000000000099"), "x:4"))).message).toMatch(/Aparelho precisa de IMEI/);
    expect((await falha(novoItem(cat.chip, comDigitoLuhn("35209900170099"), null, "x:5"))).message).toMatch(/Chip precisa de ICCID/);
    expect((await falha(novoItem(cat.capa, comDigitoLuhn("35209900170098"), null, "x:6"))).message).toMatch(/um a um/);
  });

  it("reprocessar a mesma entrada não duplica o item nem o saldo", async () => {
    const antes = await saldo(ids.lojaA, cat.aparelho);
    const { rows } = await db.query<{ id: string }>(
      "select privado.registrar_item_serializado($1, $2, $3, null, null, 'entrada_importacao', 'teste:a1') as id", [ids.lojaA, cat.aparelho, cat.imei1],
    );
    expect(rows[0]?.id).toBe(itens.a1);
    expect(await saldo(ids.lojaA, cat.aparelho)).toEqual(antes);
  });
});

describe("livro de estoque e saldo", () => {
  it("o saldo de cada loja é a soma do livro", async () => {
    const { rows } = await db.query<{ diferencas: number }>(`
      select count(*)::int as diferencas from (
        select m.unidade_id, m.variante_id, sum(m.quantidade) as soma from public.estoque_movimentos m group by 1, 2
      ) l full join public.estoque_saldos s using (unidade_id, variante_id)
      where coalesce(l.soma, 0) <> coalesce(s.quantidade, 0)`);
    expect(rows[0]?.diferencas).toBe(0);
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: 10, reservado: 0 });
    expect(await saldo(ids.lojaA, cat.aparelho)).toEqual({ quantidade: 2, reservado: 0 });
  });

  it("saída maior que o saldo é recusada e nada muda", async () => {
    const lancamentos = async () => (await db.query<{ n: number }>("select count(*)::int as n from public.estoque_movimentos")).rows[0]?.n;
    const antes = await lancamentos();
    const erro = await falha(db.query("select privado.lancar_movimento($1, $2, -11, 'perda', null, 'teste', null, null, 'teste:perda')", [ids.lojaA, cat.capa]));
    expect(erro.message).toMatch(/estoque_nao_fica_negativo/);
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: 10, reservado: 0 });
    expect(await lancamentos()).toBe(antes);
  });

  it("o livro só aceita inserção, nem o dono do banco altera", async () => {
    expect((await falha(db.query("update public.estoque_movimentos set quantidade = 99"))).message).toMatch(/só aceita inserção/);
    expect((await falha(db.query("delete from public.estoque_movimentos"))).message).toMatch(/só aceita inserção/);
    expect((await falha(db.query("truncate public.estoque_movimentos"))).message).toMatch(/só aceita inserção/);
  });

  it("lançamento repetido com a mesma chave conta uma vez só", async () => {
    const lancar = () => db.query<{ id: number }>("select privado.lancar_movimento($1, $2, 2, 'entrada_compra', null, null, null, null, 'teste:compra1') as id", [ids.lojaB, cat.capa]);
    const primeiro = (await lancar()).rows[0]?.id;
    const segundo = (await lancar()).rows[0]?.id;
    expect(segundo).toBe(primeiro);
    expect((await saldo(ids.lojaB, cat.capa))?.quantidade).toBe(5);
  });

  it("serviço (recarga) não tem estoque; aparelho não movimenta sem o IMEI", async () => {
    expect((await falha(db.query("select privado.lancar_movimento($1, $2, 1, 'entrada_compra')", [ids.lojaA, cat.recarga]))).message).toMatch(/não tem estoque/);
    expect((await falha(db.query("select privado.lancar_movimento($1, $2, 1, 'entrada_compra')", [ids.lojaA, cat.aparelho]))).message).toMatch(/IMEI\/ICCID/);
  });
});

describe("preço com histórico", () => {
  const preco = (s: Sessao, unidade: string, momento = "now()") =>
    como<{ v: string }>(s, `select public.preco_vigente($1, $2, 'loja', ${momento}) as v`, [cat.aparelho, unidade]);

  it("preço da loja vale sobre o geral; loja sem exceção usa o geral", async () => {
    const dono = novaSessao(ids.dono);
    expect(Number((await preco(dono, ids.lojaB))[0]?.v)).toBe(139900);
    expect(Number((await preco(dono, ids.lojaA))[0]?.v)).toBe(149900);
  });

  it("preço novo fecha o anterior sem apagar; o preço de antes continua consultável", async () => {
    const duplicado = await falha(db.query(
      "insert into public.precos (organizacao_id, variante_id, valor_centavos, origem) values ($1, $2, 144900, 'manual')", [ids.organizacao, cat.aparelho],
    ));
    expect(duplicado.code).toBe("23505");
    await db.exec(`
      update public.precos set fim = now() - interval '1 day' where variante_id = '${cat.aparelho}' and unidade_id is null and fim is null;
      insert into public.precos (organizacao_id, variante_id, valor_centavos, inicio, origem) values ('${ids.organizacao}', '${cat.aparelho}', 144900, now() - interval '1 day', 'manual');
    `);
    const dono = novaSessao(ids.dono);
    expect(Number((await preco(dono, ids.lojaA))[0]?.v)).toBe(144900);
    expect(Number((await preco(dono, ids.lojaA, "now() - interval '10 days'"))[0]?.v)).toBe(149900);
    expect((await db.query("select 1 from public.precos where variante_id = $1 and unidade_id is null", [cat.aparelho])).rows).toHaveLength(2);
  });

  it("campanha vale só no período e fica acima do preço da loja", async () => {
    await db.query(
      "insert into public.precos (organizacao_id, variante_id, valor_centavos, inicio, fim, origem) values ($1, $2, 129900, now() - interval '1 hour', now() + interval '1 day', 'campanha')",
      [ids.organizacao, cat.aparelho],
    );
    const dono = novaSessao(ids.dono);
    expect(Number((await preco(dono, ids.lojaB))[0]?.v)).toBe(129900);
    expect(Number((await preco(dono, ids.lojaB, "now() + interval '2 days'"))[0]?.v)).toBe(139900);
    expect((await falha(db.query(
      "insert into public.precos (organizacao_id, variante_id, valor_centavos, origem) values ($1, $2, 1, 'campanha')", [ids.organizacao, cat.capa],
    ))).message).toMatch(/campanha_tem_fim/);
  });

  it("quem não enxerga a loja não consulta o preço dela", async () => {
    expect((await preco(novaSessao(ids.donoOutraOrg), ids.lojaA))[0]?.v).toBeNull();
  });
});

describe("quem vê o quê", () => {
  it("vendedor vê catálogo, preço e o estoque da própria loja, mas nunca o custo", async () => {
    const s = await naLoja(ids.vendedorA, ids.lojaA);
    expect((await como(s, "select sku from public.variantes where organizacao_id = $1", [ids.organizacao])).length).toBe(4);
    expect((await como(s, "select 1 from public.precos")).length).toBeGreaterThan(0);
    expect(await como(s, "select * from public.custos")).toEqual([]);
    const lojas = await como<{ unidade_id: string }>(s, "select distinct unidade_id from public.estoque_saldos");
    expect(lojas.map((l) => l.unidade_id)).toEqual([ids.lojaA]);
    expect((await como<{ imei: string }>(s, "select imei from public.itens_serializados where imei is not null order by imei")).map((i) => i.imei)).toEqual([cat.imei1, cat.imei2]);
  });

  it("gerente da loja B vê custo e o estoque só da loja B", async () => {
    const s = await naLoja(ids.gerenteB, ids.lojaB);
    expect((await como(s, "select 1 from public.custos")).length).toBe(2);
    const lojas = await como<{ unidade_id: string }>(s, "select distinct unidade_id from public.itens_serializados");
    expect(lojas.map((l) => l.unidade_id)).toEqual([ids.lojaB]);
  });

  it("dono vê o estoque de todas as lojas e o custo", async () => {
    const s = novaSessao(ids.dono);
    expect((await como<{ unidade_id: string }>(s, "select distinct unidade_id from public.estoque_saldos")).length).toBe(2);
    expect((await como(s, "select 1 from public.custos")).length).toBe(2);
  });

  it("dono de outra rede não vê catálogo, preço, custo nem estoque da Ora", async () => {
    const s = novaSessao(ids.donoOutraOrg);
    for (const tabela of ["categorias", "produtos", "precos", "custos", "itens_serializados", "estoque_saldos", "estoque_movimentos"]) {
      expect(await como(s, `select 1 from public.${tabela} where organizacao_id = $1`, [ids.organizacao]), tabela).toEqual([]);
    }
  });

  it("vendedor vê quantas unidades há nas outras lojas, sem IMEI", async () => {
    const s = await naLoja(ids.vendedorA, ids.lojaA);
    const rede = await como<{ unidade_id: string; disponivel: number }>(s, "select * from public.disponibilidade_na_rede($1)", [cat.aparelho]);
    expect(Object.fromEntries(rede.map((r) => [r.unidade_id, r.disponivel]))).toMatchObject({ [ids.lojaA]: 2, [ids.lojaB]: 1, [ids.lojaC]: 0 });
    expect(Object.keys(rede[0] ?? {})).toEqual(["unidade_id", "unidade", "disponivel"]);
    expect((await como(novaSessao(ids.donoOutraOrg), "select * from public.disponibilidade_na_rede($1) where unidade_id = $2", [cat.aparelho, ids.lojaA]))).toEqual([]);
  });

  it("ninguém logado grava direto nas tabelas", async () => {
    const s = await naLoja(ids.gerenteB, ids.lojaB);
    for (const sql of [
      "insert into public.estoque_movimentos (organizacao_id, unidade_id, variante_id, quantidade, tipo) values ('" + ids.organizacao + "', '" + ids.lojaB + "', '" + cat.capa + "', 100, 'ajuste')",
      "update public.estoque_saldos set quantidade = 999",
      "update public.itens_serializados set situacao = 'disponivel'",
      "insert into public.precos (organizacao_id, variante_id, valor_centavos, origem) values ('" + ids.organizacao + "', '" + cat.capa + "', 1, 'manual')",
    ]) {
      expect((await falha(como(s, sql))).code, sql).toBe("42501");
    }
  });
});

describe("reserva durante a venda", () => {
  it("o mesmo IMEI não é reservado duas vezes; repetir o pedido devolve a mesma reserva", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const [primeira] = await reservar(ana, cat.aparelho, 1, itens.a1, "pdv:ana:1");
    expect(await situacao(itens.a1)).toBe("reservado");
    expect((await saldo(ids.lojaA, cat.aparelho))?.reservado).toBe(1);
    const [repetida] = await reservar(ana, cat.aparelho, 1, itens.a1, "pdv:ana:1");
    expect(repetida?.id).toBe(primeira?.id);

    const colega = await naLoja(ids.vendedorAB, ids.lojaA);
    expect((await falha(reservar(colega, cat.aparelho, 1, itens.a1, "pdv:colega:1"))).code).toBe("OR002");
    expect((await falha(reservar(colega, cat.aparelho, 1, itens.a2, "pdv:ana:1"))).code).toBe("OR004");
    expect((await saldo(ids.lojaA, cat.aparelho))?.reservado).toBe(1);
  });

  it("IMEI de outra loja e item sem estoque não são reservados", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect((await falha(reservar(ana, cat.aparelho, 1, itens.b1, "pdv:ana:2"))).code).toBe("OR003");
    expect((await falha(reservar(ana, cat.recarga, 1, null, "pdv:ana:3"))).code).toBe("22023");
    expect((await falha(reservar(ana, cat.aparelho, 1, null, "pdv:ana:4"))).code).toBe("22023");
  });

  it("acessório: reserva até o disponível e recusa o que passar", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect((await falha(reservar(ana, cat.capa, 11, null, "pdv:ana:5"))).code).toBe("OR001");
    await reservar(ana, cat.capa, 4, null, "pdv:ana:6");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: 10, reservado: 4 });
    expect((await falha(reservar(ana, cat.capa, 7, null, "pdv:ana:7"))).code).toBe("OR001");
    const rede = await como<{ unidade_id: string; disponivel: number }>(ana, "select * from public.disponibilidade_na_rede($1)", [cat.capa]);
    expect(rede.find((r) => r.unidade_id === ids.lojaA)?.disponivel).toBe(6);
  });

  it("liberar devolve o item e o saldo; liberar de novo não faz nada", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const [reserva] = await reservar(ana, cat.aparelho, 1, itens.a2, "pdv:ana:8");
    expect(await situacao(itens.a2)).toBe("reservado");
    expect((await como<{ ok: boolean }>(ana, "select public.liberar_reserva($1) as ok", [reserva?.id]))[0]?.ok).toBe(true);
    expect(await situacao(itens.a2)).toBe("disponivel");
    expect((await como<{ ok: boolean }>(ana, "select public.liberar_reserva($1) as ok", [reserva?.id]))[0]?.ok).toBe(false);
  });

  it("reserva vencida libera o item para outra venda", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const [reserva] = await reservar(ana, cat.chip, 1, itens.chipA, "pdv:ana:9", 1);
    await db.query("update public.estoque_reservas set expira_em = now() - interval '1 minute' where id = $1", [reserva?.id]);
    const colega = await naLoja(ids.vendedorAB, ids.lojaA);
    await reservar(colega, cat.chip, 1, itens.chipA, "pdv:colega:2");
    const { rows } = await db.query<{ situacao: string }>("select situacao from public.estoque_reservas where id = $1", [reserva?.id]);
    expect(rows[0]?.situacao).toBe("expirada");
    expect(await situacao(itens.chipA)).toBe("reservado");
    expect((await saldo(ids.lojaA, cat.chip))?.reservado).toBe(1);
  });

  it("sem unidade escolhida, ou sem permissão de vender, não reserva", async () => {
    expect((await falha(reservar(novaSessao(ids.vendedorA), cat.capa, 1, null, "pdv:sem-loja"))).code).toBe("42501");
    const tecnico = await naLoja(ids.tecnico, ids.assistencia);
    expect((await falha(reservar(tecnico, cat.capa, 1, null, "pdv:tecnico"))).code).toBe("42501");
  });
});

describe("conferência física e configuração auditadas", () => {
  it("vendedor confere o IMEI da própria loja; item de outra loja não", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await como(ana, "select public.conferir_item($1)", [itens.a2]);
    const { rows } = await db.query<{ conferido_por: string }>("select conferido_por from public.itens_serializados where id = $1", [itens.a2]);
    expect(rows[0]?.conferido_por).toBe(ids.vendedorA);
    expect((await db.query("select 1 from public.auditoria where acao = 'estoque.item_conferido' and alvo_id = $1", [itens.a2])).rows).toHaveLength(1);
    expect((await falha(como(ana, "select public.conferir_item($1)", [itens.b1]))).code).toBe("P0002");
  });

  it("mudar a política de desconto de uma categoria vai para a auditoria da organização", async () => {
    await db.query("update public.categorias set desconto_teto_pb = 1000, margem_minima_pb = 800 where id = $1", [cat.acessorios]);
    const { rows } = await db.query<{ organizacao_id: string; depois: { desconto_teto_pb: number } }>(
      "select organizacao_id, depois from public.auditoria where acao = 'categorias.alterado' and alvo_id = $1", [cat.acessorios],
    );
    expect(rows[0]?.organizacao_id).toBe(ids.organizacao);
    expect(rows[0]?.depois.desconto_teto_pb).toBe(1000);
  });
});
