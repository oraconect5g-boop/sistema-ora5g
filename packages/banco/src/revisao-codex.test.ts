// Regressões dos achados do Codex de 07/11/2026 (docs/alinhamento/REVISOES_CODEX.md).
// Cada teste reproduz o cenário do achado e prova a correção da migration 20261107151305 (correcoes_revisao_codex).
import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

let db: PGlite;
let sessoes = 0;
const sessao = (usuario: string): Sessao => ({ usuario, sessao: `20000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });

async function linhas<T = Record<string, unknown>>(s: Sessao | null, sql: string, params: unknown[] = []) {
  return comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows);
}

async function falha(acao: Promise<unknown>): Promise<{ code?: string }> {
  try {
    await acao;
  } catch (erro) {
    return erro as { code?: string };
  }
  throw new Error("era esperado um erro, mas a operação foi aceita");
}

const idsDePerfis = async (s: Sessao) => (await linhas<{ id: string }>(s, "select id from public.perfis_usuario")).map((p) => p.id);

beforeEach(async () => {
  db = await criarBanco();
  await montarCenario(db);
});

describe("REV-001 — perfis só dentro da organização de quem gere", () => {
  it("administrador da Ora não lê perfil exclusivo de outra organização nem perfil sem vínculo", async () => {
    const perfis = await idsDePerfis(sessao(ids.administrador));
    expect(perfis).not.toContain(ids.donoOutraOrg);
    expect(perfis).not.toContain(ids.semVinculo);
    expect(perfis).toEqual(expect.arrayContaining([ids.vendedorA, ids.vendedorAB, ids.gerenteB, ids.encerrado]));
  });

  it("dono de outra organização não lê ninguém da Ora", async () => {
    const perfis = await idsDePerfis(sessao(ids.donoOutraOrg));
    expect(perfis).toEqual([ids.donoOutraOrg]);
  });

  it("vendedor continua lendo só o próprio perfil", async () => {
    expect(await idsDePerfis(sessao(ids.vendedorA))).toEqual([ids.vendedorA]);
  });

  it("perfil sem vínculo só é lido por ele mesmo", async () => {
    expect(await idsDePerfis(sessao(ids.semVinculo))).toEqual([ids.semVinculo]);
  });
});

describe("REV-002 — auditoria pertence a uma organização", () => {
  const registrar = (unidade: string | null, organizacao: string | null, acao: string) =>
    db.query("insert into public.auditoria (unidade_id, organizacao_id, acao) values ($1, $2, $3)", [unidade, organizacao, acao]);
  const acoesVistas = async (s: Sessao) => (await linhas<{ acao: string }>(s, "select acao from public.auditoria")).map((a) => a.acao);

  it("evento sem unidade de outra organização não aparece para o administrador da Ora", async () => {
    await registrar(null, ids.outraOrganizacao, "evento.da_outra_org");
    await registrar(null, ids.organizacao, "evento.da_ora");
    await registrar(null, null, "evento.sem_dono");

    const vistasPeloAdmin = await acoesVistas(sessao(ids.administrador));
    expect(vistasPeloAdmin).toContain("evento.da_ora");
    expect(vistasPeloAdmin).not.toContain("evento.da_outra_org");
    expect(vistasPeloAdmin).not.toContain("evento.sem_dono");

    const vistasPelaOutra = await acoesVistas(sessao(ids.donoOutraOrg));
    expect(vistasPelaOutra).toContain("evento.da_outra_org");
    expect(vistasPelaOutra).not.toContain("evento.da_ora");
  });

  it("a organização vem da unidade e não pode contradizê-la", async () => {
    await registrar(ids.lojaA, null, "evento.na_loja_a");
    const { rows } = await db.query<{ organizacao_id: string }>("select organizacao_id from public.auditoria where acao = 'evento.na_loja_a'");
    expect(rows[0]?.organizacao_id).toBe(ids.organizacao);
    expect((await falha(registrar(ids.lojaA, ids.outraOrganizacao, "evento.contraditorio"))).code).toBe("23514");
  });

  it("tentativa negada numa loja de outra organização fica com a organização da loja", async () => {
    const s = sessao(ids.vendedorA);
    await linhas(s, "select public.selecionar_unidade($1)", [ids.lojaOutraOrg]);
    const { rows } = await db.query<{ organizacao_id: string }>(
      "select organizacao_id from public.auditoria where acao = 'sessao.unidade_negada' and usuario_id = $1",
      [ids.vendedorA],
    );
    expect(rows.map((r) => r.organizacao_id)).toEqual([ids.outraOrganizacao]);
    expect(await acoesVistas(sessao(ids.administrador))).not.toContain("sessao.unidade_negada");
  });

  it("a auditoria continua só de inserção depois da nova coluna", async () => {
    await registrar(null, ids.organizacao, "evento.qualquer");
    await expect(db.query("update public.auditoria set organizacao_id = null")).rejects.toThrow(/só aceita inserção/);
  });
});

describe("REV-005 — papel desativado não impede encerrar vínculo", () => {
  it("encerra com papel inativo, não reabre com papel inativo e reabre depois de reativado", async () => {
    await db.query("update public.papeis set ativo = false where codigo = 'gerente'");
    await db.query("update public.vinculos set fim = now() where usuario_id = $1", [ids.gerenteB]);

    const reabrir = () => db.query("update public.vinculos set fim = null where usuario_id = $1", [ids.gerenteB]);
    expect((await falha(reabrir())).code).toBe("23514");

    const novo = () =>
      db.query("insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id) values ($1, $2, 'gerente', 'unidade', $3)", [ids.semVinculo, ids.organizacao, ids.lojaA]);
    expect((await falha(novo())).code).toBe("23514");

    await db.query("update public.papeis set ativo = true where codigo = 'gerente'");
    await reabrir();
    await novo();
  });

  it("encerrar não serve de atalho para trocar papel ou unidade", async () => {
    await db.query("update public.papeis set ativo = false where codigo = 'gerente'");
    const trocar = db.query("update public.vinculos set fim = now(), unidade_id = $2 where usuario_id = $1", [ids.gerenteB, ids.lojaA]);
    expect((await falha(trocar)).code).toBe("23514");
  });
});

describe("REV-006 — o mesmo usuário pode ser dono em duas organizações", () => {
  it("aceita dono em outra organização e continua barrando duplicata na mesma", async () => {
    const vincular = () =>
      db.query("insert into public.vinculos (usuario_id, organizacao_id, papel, escopo) values ($1, $2, 'dono', 'organizacao')", [ids.donoOutraOrg, ids.organizacao]);
    await vincular();
    expect((await falha(vincular())).code).toBe("23505");
  });
});
