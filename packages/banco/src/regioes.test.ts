// Lote ORG-009 (14/11/2026, ORA-ORG-009; migration 20261115003000_regioes): as regiões agrupam as lojas da rede para
// ver vendas e metas por região. Não dão acesso: o vínculo de cada pessoa continua decidindo o que ela vê.
// Banco em memória com todas as migrations; dados FICTÍCIOS; cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
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
  const s = { usuario, sessao: `4d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

type Salva = { id: string; repetida: boolean };
const SALVAR = "select public.regiao_salvar($1, $2, $3, $4, $5) as v";
const DEFINIR = "select public.loja_definir_regiao($1, $2, $3) as v";
const salvar = (s: Sessao, id: string | null, nome: string, ativa: boolean | null = null, motivo = "Organização das lojas") =>
  valor<Salva>(s, SALVAR, [ids.organizacao, id, nome, ativa, motivo]);
const definir = (s: Sessao, loja: string, regiao: string | null, motivo = "Loja da região") => valor<boolean>(s, DEFINIR, [loja, regiao, motivo]);
const regiaoDe = async (loja: string) => (await db.query<{ r: string | null }>("select regiao_id as r from public.unidades where id = $1", [loja])).rows[0]?.r;

describe("regiões da rede (ORG-009)", () => {
  it("quem gere as lojas cria, repete, renomeia e põe a loja na região; nome repetido é recusado; tudo na auditoria", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const norte = await salvar(dono, null, "Curitiba Norte");
    expect(norte.repetida).toBe(false);
    expect(await salvar(dono, null, "  curitiba   norte ")).toEqual({ id: norte.id, repetida: true });
    const litoral = await salvar(await naLoja(ids.administrador, ids.lojaA), null, "Litoral");
    expect(await errou(dono, SALVAR, [ids.organizacao, litoral.id, "CURITIBA NORTE", null, "Renomear"])).toBe("23505");
    expect(await salvar(dono, litoral.id, "Litoral Paranaense")).toEqual({ id: litoral.id, repetida: false });
    expect(await salvar(dono, litoral.id, "Litoral Paranaense")).toEqual({ id: litoral.id, repetida: true });

    expect(await definir(dono, ids.lojaA, norte.id)).toBe(true);
    expect(await definir(dono, ids.lojaA, norte.id)).toBe(false);
    expect(await definir(dono, ids.lojaB, norte.id)).toBe(true);
    expect(await definir(dono, ids.lojaC, litoral.id)).toBe(true);
    expect([await regiaoDe(ids.lojaA), await regiaoDe(ids.lojaB), await regiaoDe(ids.lojaC), await regiaoDe(ids.online)]).toEqual([norte.id, norte.id, litoral.id, null]);
    expect((await db.query("select acao, motivo from public.auditoria where alvo_id = $1 order by id", [norte.id])).rows)
      .toEqual([{ acao: "regioes.criado", motivo: "Organização das lojas" }]);
    expect((await db.query("select motivo from public.auditoria where alvo_id = $1 order by id desc limit 1", [ids.lojaC])).rows).toEqual([{ motivo: "Loja da região" }]);
  });

  it("região só inativa sem loja ativa nela; inativa não recebe loja; tirar a loja (nulo) libera; reativar volta", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const norte = await salvar(dono, null, "Curitiba Norte");
    await definir(dono, ids.lojaA, norte.id);
    expect(await errou(dono, SALVAR, [ids.organizacao, norte.id, "Curitiba Norte", false, "Fim da região"])).toBe("OR020");
    expect(await definir(dono, ids.lojaA, null, "Loja sem região")).toBe(true);
    expect(await salvar(dono, norte.id, "Curitiba Norte", false)).toEqual({ id: norte.id, repetida: false });
    expect(await errou(dono, DEFINIR, [ids.lojaB, norte.id, "Loja da região"])).toBe("22023");
    expect(await salvar(dono, norte.id, "Curitiba Norte", true)).toEqual({ id: norte.id, repetida: false });
    expect(await definir(dono, ids.lojaB, norte.id)).toBe(true);
  });

  it("recusas: sem motivo, nome curto ou longo, região de outra rede e loja de outra rede", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await errou(dono, SALVAR, [ids.organizacao, null, "Norte", null, null])).toBe("22023");
    expect(await errou(dono, SALVAR, [ids.organizacao, null, "N", null, "Região"])).toBe("22023");
    expect(await errou(dono, SALVAR, [ids.organizacao, null, "N".repeat(61), null, "Região"])).toBe("22023");
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    const deLa = await valor<Salva>(outraRede, SALVAR, [ids.outraOrganizacao, null, "Região de lá", null, "Região"]);
    expect(await errou(dono, DEFINIR, [ids.lojaA, deLa.id, "Loja da região"])).toBe("P0002");
    expect(await errou(dono, DEFINIR, [ids.lojaOutraOrg, null, "Loja da região"])).toBe("P0002");
    expect(await errou(dono, SALVAR, [ids.organizacao, deLa.id, "Tomada", null, "Região"])).toBe("P0002");
  });

  it("a região não dá acesso: lê quem é da rede; gerente e vendedor não mudam; outra rede não vê; nada se apaga", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const norte = await salvar(dono, null, "Curitiba Norte");
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    for (const s of [gerente, vendedor, outraRede]) {
      expect(await errou(s, SALVAR, [ids.organizacao, null, "Intrusa", null, "Tentativa"])).toBe("42501");
      expect(await errou(s, DEFINIR, [ids.lojaB, norte.id, "Tentativa"])).toBe("P0002");
    }
    expect(await valor<number>(vendedor, "select count(*)::int as v from public.regioes")).toBe(1);
    expect(await valor<number>(outraRede, "select count(*)::int as v from public.regioes")).toBe(0);
    // O vendedor da loja A continua sem ver a loja B, mesmo com as duas na mesma região.
    await definir(dono, ids.lojaA, norte.id);
    await definir(dono, ids.lojaB, norte.id);
    expect(await valor<number>(vendedor, "select count(*)::int as v from public.unidades where id = $1", [ids.lojaB])).toBe(0);
    expect(await errou(vendedor, "insert into public.regioes (organizacao_id, nome, criado_por) values ($1, 'Intrusa', $2)", [ids.organizacao, ids.vendedorA])).toBe("42501");
    expect(await erroDe(() => db.query("delete from public.regioes where id = $1", [norte.id]))).toBe("42501");
  });
});
