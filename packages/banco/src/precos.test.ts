// Preços pela tela (lote L3b: ORA-CAT-004, ORA-CAT-007): preço da rede ou da loja, mudança agendada,
// campanha com vigência, cancelamento do que ainda não começou e o passado protegido. Banco em
// memória com todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita (dentro dela
// now() é o mesmo instante: cada teste faz no máximo uma mudança "agora" por alcance).
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
const sessao = (usuario: string): Sessao => ({ usuario, sessao: `68000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = sessao(usuario);
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
async function comoBanco(sql: string, params: unknown[] = []): Promise<string | null> {
  await db.exec("savepoint direto");
  try {
    await db.query(sql, params);
    await db.exec("release savepoint direto");
    return null;
  } catch (e) {
    await db.exec("rollback to savepoint direto");
    await db.exec("release savepoint direto");
    return (e as { code?: string }).code ?? "sem-codigo";
  }
}

type Salvo = { id: string; repetida: boolean };
const DEFINIR = "select public.preco_definir($1, $2, $3, $4, $5, $6) as v";
const CAMPANHA = "select public.preco_campanha($1, $2, $3, $4, $5, $6, $7) as v";
const CANCELAR = "select public.preco_cancelar($1, $2) as v";
const daqui = (horas: number) => new Date(Date.now() + horas * 3_600_000).toISOString();
const vigente = async (s: Sessao, variante: string, unidade: string, momento: string | null = null) =>
  Number(await valor<string>(s, `select public.preco_vigente($1, $2, 'loja', ${momento ? "$3::timestamptz" : "now()"}) as v`, momento ? [variante, unidade, momento] : [variante, unidade]));

describe("preços pela tela (L3b)", () => {
  it("preço geral novo vale agora, fecha o anterior sem apagar e repetir não grava de novo", async () => {
    const dono = sessao(ids.dono);
    const novo = await valor<Salvo>(dono, DEFINIR, [cat.aparelho, null, "loja", 154_900, null, "Reajuste do fornecedor"]);
    expect(novo.repetida).toBe(false);
    expect(await vigente(dono, cat.aparelho, ids.lojaA)).toBe(154_900);
    expect(await vigente(dono, cat.aparelho, ids.lojaB)).toBe(139_900); // a loja B tem preço próprio
    expect(await valor<Salvo>(dono, DEFINIR, [cat.aparelho, null, "loja", 154_900, null, "Reajuste do fornecedor"])).toEqual({ id: novo.id, repetida: true });
    const { rows } = await db.query<{ valor_centavos: string; fim: string | null }>(
      "select valor_centavos, fim from public.precos where variante_id = $1 and unidade_id is null and canal = 'loja' order by inicio", [cat.aparelho]);
    expect(rows.map((r) => [Number(r.valor_centavos), r.fim === null])).toEqual([[149_900, false], [154_900, true]]);
    const eventos = (await db.query<{ acao: string; motivo: string }>(
      "select acao, motivo from public.auditoria where alvo_tipo = 'precos' and usuario_id is not null order by id")).rows;
    expect(eventos).toEqual([{ acao: "precos.alterado", motivo: "Reajuste do fornecedor" }, { acao: "precos.criado", motivo: "Reajuste do fornecedor" }]);
  });

  it("mudança agendada: vale na data; uma por alcance (OR022); cancelar devolve o preço anterior", async () => {
    const dono = sessao(ids.dono);
    const amanha = daqui(48);
    const agendada = await valor<Salvo>(dono, DEFINIR, [cat.capa, null, "loja", 8_900, amanha, "Reajuste programado"]);
    expect(await vigente(dono, cat.capa, ids.lojaA)).toBe(7_900);
    expect(await vigente(dono, cat.capa, ids.lojaA, daqui(72))).toBe(8_900);
    expect(await valor<Salvo>(dono, DEFINIR, [cat.capa, null, "loja", 8_900, amanha, "Reajuste programado"])).toEqual({ id: agendada.id, repetida: true });
    expect(await codigo(dono, DEFINIR, [cat.capa, null, "loja", 9_900, daqui(96), "Outro reajuste"])).toBe("OR022");
    expect(await codigo(dono, DEFINIR, [cat.capa, null, "loja", 9_900, daqui(-24), "Retroativo"])).toBe("22023");

    expect(await valor<string>(dono, CANCELAR, [agendada.id, "Fornecedor recuou"])).toBe("cancelado");
    expect(await valor<string>(dono, CANCELAR, [agendada.id, "Fornecedor recuou"])).toBe("ja_cancelado");
    expect(await vigente(dono, cat.capa, ids.lojaA, daqui(72))).toBe(7_900);
    const { rows } = await db.query<{ n: string }>("select count(*) as n from public.precos where variante_id = $1 and fim is null and cancelado_em is null and unidade_id is null", [cat.capa]);
    expect(Number(rows[0]?.n)).toBe(1);
    // O cancelado continua no histórico, com quem e por quê.
    const cancelado = (await db.query("select cancelado_por, motivo_cancelamento from public.precos where id = $1", [agendada.id])).rows[0];
    expect(cancelado).toEqual({ cancelado_por: ids.dono, motivo_cancelamento: "Fornecedor recuou" });
  });

  it("preço da loja vale sobre o geral; a lista por loja mostra a origem de cada preço", async () => {
    const dono = sessao(ids.dono);
    await valor(dono, DEFINIR, [cat.capa, ids.lojaB, "loja", 7_500, null, "Concorrência no bairro"]);
    expect(await vigente(dono, cat.capa, ids.lojaB)).toBe(7_500);
    expect(await vigente(dono, cat.capa, ids.lojaA)).toBe(7_900);
    const lista = await comoUsuario(db, dono, async () =>
      (await db.query<{ unidade_id: string; valor_centavos: string; origem: string; de_loja: boolean }>("select * from public.precos_por_loja($1)", [cat.capa])).rows);
    const de = (loja: string) => lista.find((l) => l.unidade_id === loja);
    expect([Number(de(ids.lojaB)?.valor_centavos), de(ids.lojaB)?.de_loja]).toEqual([7_500, true]);
    expect([Number(de(ids.lojaA)?.valor_centavos), de(ids.lojaA)?.de_loja]).toEqual([7_900, false]);
    expect(lista.some((l) => l.unidade_id === ids.assistencia)).toBe(false); // só lojas que vendem
  });

  it("campanha vale no período acima do preço da loja; sem sobreposição (OR021); encerrar devolve o preço", async () => {
    const dono = sessao(ids.dono);
    const campanha = await valor<Salvo>(dono, CAMPANHA, [cat.aparelho, null, "loja", 129_900, null, daqui(24), "Black Friday"]);
    expect(await vigente(dono, cat.aparelho, ids.lojaA)).toBe(129_900);
    expect(await vigente(dono, cat.aparelho, ids.lojaB)).toBe(129_900);
    expect(await codigo(dono, CAMPANHA, [cat.aparelho, null, "loja", 119_900, daqui(12), daqui(36), "Outra campanha"])).toBe("OR021");
    const depois = await valor<Salvo>(dono, CAMPANHA, [cat.aparelho, null, "loja", 134_900, daqui(48), daqui(72), "Natal"]);
    expect(await codigo(dono, CAMPANHA, [cat.aparelho, null, "loja", 1, null, daqui(24 * 400), "Longa demais"])).toBe("22023");
    expect(await codigo(dono, CAMPANHA, [cat.aparelho, null, "loja", 1, daqui(10), daqui(5), "Fim antes do início"])).toBe("22023");

    // Criada agora e desfeita no mesmo instante: não chegou a valer, então é cancelada.
    expect(await valor<string>(dono, CANCELAR, [campanha.id, "Lançada por engano"])).toBe("cancelado");
    expect(await vigente(dono, cat.aparelho, ids.lojaA)).toBe(149_900);
    expect(await vigente(dono, cat.aparelho, ids.lojaB)).toBe(139_900);
    expect(await valor<string>(dono, CANCELAR, [depois.id, "Mudou o plano"])).toBe("cancelado");
    expect(await vigente(dono, cat.aparelho, ids.lojaA, daqui(60))).toBe(149_900);

    // Campanha que começou há uma hora (gravada direto, como se viesse de antes): encerrar fecha agora.
    const { rows } = await db.query<{ id: string }>(
      "insert into public.precos (organizacao_id, variante_id, valor_centavos, inicio, fim, origem, motivo) values ($1, $2, 7000, now() - interval '1 hour', now() + interval '1 day', 'campanha', 'Semana da capa') returning id",
      [ids.organizacao, cat.capa]);
    expect(await vigente(dono, cat.capa, ids.lojaA)).toBe(7_000);
    expect(await valor<string>(dono, CANCELAR, [rows[0]?.id, "Estoque acabou"])).toBe("encerrado");
    expect(await vigente(dono, cat.capa, ids.lojaA)).toBe(7_900);
    expect(await vigente(dono, cat.capa, ids.lojaA, new Date(Date.now() - 30 * 60_000).toISOString())).toBe(7_000); // o passado continua igual
  });

  it("o que já valeu não muda: preço iniciado não se cancela; valor, início e passado protegidos até do dono do banco", async () => {
    const dono = sessao(ids.dono);
    const { rows } = await db.query<{ id: string }>("select id from public.precos where variante_id = $1 and unidade_id is null and fim is null", [cat.aparelho]);
    const atual = rows[0]?.id ?? "";
    expect(await codigo(dono, CANCELAR, [atual, "Tentativa"])).toBe("22023");
    expect(await comoBanco("update public.precos set valor_centavos = 1 where id = $1", [atual])).toBe("42501");
    expect(await comoBanco("update public.precos set inicio = now() - interval '90 days' where id = $1", [atual])).toBe("42501");
    expect(await comoBanco("update public.precos set fim = now() - interval '1 day' where id = $1", [atual])).toBe("42501");
    expect(await comoBanco("delete from public.precos where id = $1", [atual])).toBe("42501");
    expect(await comoBanco("update public.precos set cancelado_em = now(), cancelado_por = $2, motivo_cancelamento = 'Tentativa' where id = $1", [atual, ids.dono])).toBe("42501");
  });

  it("só quem tem preco.alterar muda preço: administrador, gerente, vendedor e dono de outra rede não", async () => {
    const tentativas: Sessao[] = [sessao(ids.administrador), await naLoja(ids.gerenteB, ids.lojaB), await naLoja(ids.vendedorA, ids.lojaA), sessao(ids.donoOutraOrg)];
    for (const s of tentativas) {
      expect(await codigo(s, DEFINIR, [cat.capa, null, "loja", 1, null, "Tentativa"])).toBe("P0002");
      expect(await codigo(s, DEFINIR, [cat.capa, ids.lojaB, "loja", 1, null, "Tentativa"])).toBe("P0002");
      expect(await codigo(s, CAMPANHA, [cat.capa, null, "loja", 1, null, daqui(24), "Tentativa"])).toBe("P0002");
    }
    const dono = sessao(ids.dono);
    expect(await codigo(dono, DEFINIR, [cat.capa, null, "balcao", 1, null, "Canal errado"])).toBe("22023");
    expect(await codigo(dono, DEFINIR, [cat.capa, null, "loja", -1, null, "Negativo"])).toBe("22023");
    expect(await codigo(dono, DEFINIR, [cat.capa, ids.assistencia, "loja", 1, null, "Assistência não vende"])).toBe("P0002");
  });
});
