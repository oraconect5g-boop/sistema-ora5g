// O segundo fator exigido pelo banco (lote ORG-007a: ORA-ORG-007, "autenticação reforçada para perfis privilegiados").
// Quem ligou a verificação em duas etapas (um fator verificado em auth.mfa_factors) e ainda não passou por ela nesta
// sessão (o JWT diz aal1, ou não diz nada) fica sem permissão nenhuma — pelas funções, pelo RLS e na escolha da loja —,
// e a situação da sessão aponta o código; com o código (aal2), tudo volta. Quem não ligou segue como antes.
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
const nova = (usuario: string, aal?: "aal1" | "aal2"): Sessao =>
  ({ usuario, sessao: `5f000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}`, ...(aal ? { aal } : {}) });
const fator = (usuario: string, status: "verified" | "unverified" = "verified") =>
  db.query("insert into auth.mfa_factors (user_id, friendly_name, factor_type, status) values ($1, $2, 'totp', $3)", [usuario, `Celular (${status})`, status]);
type Situacao = { usuario_ativo: boolean; sessao_no_turno: boolean; unidade_id: string | null; segundo_fator_pendente: boolean };
const situacao = (s: Sessao) => comoUsuario(db, s, async () => (await db.query<Situacao>("select * from public.situacao_da_sessao()")).rows[0]);
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
async function erroDe(s: Sessao, sql: string, params: unknown[] = []): Promise<string | null> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint tentativa");
    try {
      await db.query(sql, params);
      await db.exec("release savepoint tentativa");
      return null;
    } catch (e) {
      await db.exec("rollback to savepoint tentativa");
      await db.exec("release savepoint tentativa");
      return (e as { code?: string }).code ?? "sem-codigo";
    }
  });
}
/** O que a sessão alcança: a permissão de gerir a equipe, as lojas que vê pelo RLS e as da permissão de vender. */
const alcance = async (s: Sessao) => ({
  gerir: await valor<boolean>(s, "select public.tem_permissao('usuarios.gerir') as v"),
  lojas: await valor<number>(s, "select count(*)::int as v from public.unidades"),
  vender: await valor<number>(s, "select count(*)::int as v from privado.unidades_com_permissao('venda.registrar')"),
});

describe("o segundo fator no banco (ORG-007a)", () => {
  it("quem não ligou a verificação segue como antes, com o JWT em aal1 ou sem o campo", async () => {
    const base = await alcance(nova(ids.dono));
    expect(base.gerir).toBe(true);
    expect(base.lojas).toBeGreaterThan(0);
    expect(base.vender).toBeGreaterThan(0);
    for (const s of [nova(ids.dono), nova(ids.dono, "aal1")]) {
      expect(await alcance(s)).toEqual(base);
      expect(await situacao(s)).toMatchObject({ usuario_ativo: true, sessao_no_turno: true, segundo_fator_pendente: false });
    }
  });

  it("com o fator verificado e a sessão sem o código: nenhuma permissão, nenhuma loja, e a situação aponta o código", async () => {
    const base = await alcance(nova(ids.dono));
    await fator(ids.dono);
    for (const s of [nova(ids.dono), nova(ids.dono, "aal1")]) {
      expect(await alcance(s)).toEqual({ gerir: false, lojas: 0, vender: 0 });
      expect(await situacao(s)).toMatchObject({ usuario_ativo: true, sessao_no_turno: true, unidade_id: null, segundo_fator_pendente: true });
    }
    // A ação pelo banco também para: bloquear alguém da equipe pede autoridade sobre a pessoa, e a recusa é a de quem
    // não tem (P0002: o banco nem diz se a pessoa existe).
    expect(await erroDe(nova(ids.dono, "aal1"), "select public.alterar_situacao_pessoa($1, 'bloqueado', 'teste do segundo fator')", [ids.vendedorA])).toBe("P0002");
    // Com o código (aal2), tudo volta.
    const comCodigo = nova(ids.dono, "aal2");
    expect(await alcance(comCodigo)).toEqual(base);
    expect(await situacao(comCodigo)).toMatchObject({ segundo_fator_pendente: false });
    expect(await erroDe(comCodigo, "select public.alterar_situacao_pessoa($1, 'bloqueado', 'teste do segundo fator')", [ids.vendedorA])).toBeNull();
  });

  it("na loja: o vendedor com o fator não escolhe a loja sem o código; com o código, escolhe e vende", async () => {
    await fator(ids.vendedorA);
    const semCodigo = nova(ids.vendedorA, "aal1");
    expect(await valor<boolean>(semCodigo, "select public.selecionar_unidade($1) as v", [ids.lojaA])).toBe(false);
    expect(await situacao(semCodigo)).toMatchObject({ unidade_id: null, segundo_fator_pendente: true });
    const comCodigo = nova(ids.vendedorA, "aal2");
    expect(await valor<boolean>(comCodigo, "select public.selecionar_unidade($1) as v", [ids.lojaA])).toBe(true);
    expect(await situacao(comCodigo)).toMatchObject({ unidade_id: ids.lojaA, segundo_fator_pendente: false });
    expect(await valor<boolean>(comCodigo, "select public.tem_permissao('venda.registrar', $1) as v", [ids.lojaA])).toBe(true);
  });

  it("o cadastro não concluído (fator não verificado) não exige nada, e o fator de outra pessoa também não", async () => {
    const base = await alcance(nova(ids.dono));
    await fator(ids.dono, "unverified");
    await fator(ids.administrador);
    const s = nova(ids.dono, "aal1");
    expect(await alcance(s)).toEqual(base);
    expect(await situacao(s)).toMatchObject({ segundo_fator_pendente: false });
    expect((await alcance(nova(ids.administrador, "aal1"))).gerir).toBe(false);
  });

  it("a conferência do segundo fator não sai pela API (só as funções do banco a usam)", async () => {
    const pode = await db.query<{ v: boolean }>("select has_function_privilege('authenticated', 'privado.segundo_fator_em_dia()', 'execute') as v");
    expect(pode.rows[0]?.v).toBe(false);
    expect(await erroDe(nova(ids.dono, "aal2"), "select privado.segundo_fator_em_dia()")).toBe("42501");
  });
});
