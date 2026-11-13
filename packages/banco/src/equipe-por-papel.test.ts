// Equipe: pessoas por papel (lote G5: linha 7 da matriz, U1). public.equipe_por_papel conta no banco as
// pessoas com acesso vigente na rede, no total e por papel, só para quem cuida da equipe. Banco em
// memória com todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
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
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `76000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao, organizacao: string | null): Promise<{ v: T } | { codigo: string }> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>("select public.equipe_por_papel($1) as v", [organizacao])).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return { v };
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      return { codigo: (e as { code?: string }).code ?? "sem-codigo" };
    }
  });
}
type Equipe = { pessoas: number; bloqueadas: number; papeis: { papel: string; pessoas: number; bloqueadas: number }[] };
async function equipe(s: Sessao, organizacao: string = ids.organizacao): Promise<Equipe> {
  const r = await tentar<Equipe>(s, organizacao);
  if ("codigo" in r) throw new Error(`equipe_por_papel → ${r.codigo}`);
  return r.v;
}
const porPapel = (e: Equipe) => Object.fromEntries(e.papeis.map((p) => [p.papel, [p.pessoas, p.bloqueadas]]));
const vincular = (usuario: string, papel: string, escopo: string, unidade: string | null, inicio = "now() - interval '1 day'", fim = "null") =>
  db.query(`insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, inicio, fim) values ($1, $2, $3, $4, $5, ${inicio}, ${fim})`,
    [usuario, ids.organizacao, papel, escopo, unidade]);

describe("equipe: pessoas por papel (G5)", () => {
  it("conta cada pessoa uma vez no total e uma vez em cada papel; vínculo encerrado fica fora", async () => {
    const e = await equipe(await naLoja(ids.dono, ids.lojaA));
    // dono, administrador, vendedor.a, vendedor.ab (em duas lojas), bloqueado (ainda ativo), gerente.b e técnico; o encerrado não.
    expect(e).toMatchObject({ pessoas: 7, bloqueadas: 0 });
    expect(porPapel(e)).toEqual({ administrador: [1, 0], dono: [1, 0], gerente: [1, 0], tecnico: [1, 0], vendedor: [3, 0] });
  });

  it("quem tem dois papéis conta nos dois e uma vez no total; bloqueada continua contada, à parte; acesso futuro não conta, e o que termina amanhã ainda conta", async () => {
    await vincular(ids.gerenteB, "vendedor", "unidade", ids.lojaA);
    await db.query("update public.perfis_usuario set status = 'bloqueado' where id = $1", [ids.bloqueado]);
    await vincular(ids.semVinculo, "vendedor", "unidade", ids.lojaC, "now() + interval '1 day'");
    await vincular(ids.encerrado, "tecnico", "unidade", ids.assistencia, "now() - interval '1 day'", "now() + interval '1 day'");
    const e = await equipe(await naLoja(ids.dono, ids.lojaA));
    expect(e).toMatchObject({ pessoas: 8, bloqueadas: 1 });
    expect(porPapel(e)).toEqual({ administrador: [1, 0], dono: [1, 0], gerente: [1, 0], tecnico: [2, 0], vendedor: [4, 1] });
  });

  it("só quem cuida da equipe da rede: dono e administrador; gerente, vendedor e quem é de outra rede recebem recusa", async () => {
    expect((await equipe(await naLoja(ids.administrador, ids.lojaA))).pessoas).toBe(7);
    expect(await tentar(await naLoja(ids.gerenteB, ids.lojaB), ids.organizacao)).toEqual({ codigo: "42501" });
    expect(await tentar(await naLoja(ids.vendedorA, ids.lojaA), ids.organizacao)).toEqual({ codigo: "42501" });
    const deFora = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await tentar(deFora, ids.organizacao)).toEqual({ codigo: "42501" });
    expect(await equipe(deFora, ids.outraOrganizacao)).toEqual({ pessoas: 1, bloqueadas: 0, papeis: [{ papel: "dono", pessoas: 1, bloqueadas: 0 }] });
    expect(await tentar(await naLoja(ids.dono, ids.lojaA), null)).toEqual({ codigo: "42501" });
  });
});
