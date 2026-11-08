// ORA-ORG-005 — auditoria automática das mudanças de acesso e configuração.
// Aceite: "Auditoria identifica ator, horário, alvo e motivo", sem vazar entre organizações (REV-002).
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

let db: PGlite;

type Evento = {
  usuario_id: string | null;
  unidade_id: string | null;
  organizacao_id: string | null;
  ocorrido_em: Date;
  acao: string;
  alvo_tipo: string;
  alvo_id: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  motivo: string | null;
  origem: string;
};

beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
});

const eventos = async (alvoId: string) =>
  (await db.query<Evento>("select * from public.auditoria where alvo_id = $1 order by id", [alvoId])).rows;

// Uma função do banco chamada pelo usuário X: o banco sabe quem é X pelo token (auth.uid()).
async function comoAtor<T>(usuario: string, acao: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: usuario, role: "authenticated" })]);
  try {
    return await acao();
  } finally {
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

let sessoes = 0;
const sessao = (usuario: string): Sessao => ({ usuario, sessao: `20000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });
async function verComo<T>(s: Sessao, unidade: string | null, sql: string, params: unknown[] = []) {
  return comoUsuario(db, s, async () => {
    if (unidade) await db.query("select public.selecionar_unidade($1)", [unidade]);
    return (await db.query<T>(sql, params)).rows;
  });
}

describe("ORA-ORG-005 — toda mudança de acesso deixa rastro", () => {
  it("o próprio cenário inicial já fica registrado, com a organização dona de cada evento", async () => {
    const [criacao] = await eventos(ids.lojaA);
    expect(criacao).toMatchObject({ acao: "unidades.criado", alvo_tipo: "unidades", unidade_id: ids.lojaA, organizacao_id: ids.organizacao, usuario_id: null });
    expect(criacao?.origem).toMatch(/^banco:/);
    expect(criacao?.depois).toMatchObject({ codigo: "loja-a" });
    expect(criacao?.ocorrido_em).toBeInstanceOf(Date);
  });

  it("criar vínculo registra ator, alvo, organização, unidade e motivo", async () => {
    const { rows } = await comoAtor(ids.administrador, () =>
      db.query<{ id: string }>(
        "insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, motivo) values ($1, $2, 'vendedor', 'unidade', $3, 'Começou na loja C') returning id",
        [ids.vendedorA, ids.organizacao, ids.lojaC],
      ),
    );
    const [evento] = await eventos(rows[0]?.id ?? "");
    expect(evento).toMatchObject({
      acao: "vinculos.criado", alvo_tipo: "vinculos", usuario_id: ids.administrador, origem: "aplicacao",
      unidade_id: ids.lojaC, organizacao_id: ids.organizacao, motivo: "Começou na loja C", antes: null,
    });
  });

  it("encerrar vínculo vira 'vinculos.encerrado' com antes e depois", async () => {
    const { rows } = await db.query<{ id: string }>("select id from public.vinculos where usuario_id = $1 and unidade_id = $2", [ids.vendedorA, ids.lojaC]);
    const id = rows[0]?.id ?? "";
    await comoAtor(ids.administrador, () => db.query("update public.vinculos set fim = now() where id = $1", [id]));
    const ultimo = (await eventos(id)).at(-1);
    expect(ultimo?.acao).toBe("vinculos.encerrado");
    expect(ultimo?.antes?.fim).toBeNull();
    expect(ultimo?.depois?.fim).not.toBeNull();
  });

  it("bloquear e desbloquear um perfil gera um evento em cada organização em que a pessoa trabalha", async () => {
    await db.exec(`
      insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id) values
        ('${ids.semVinculo}', '${ids.organizacao}', 'vendedor', 'unidade', '${ids.lojaA}'),
        ('${ids.semVinculo}', '${ids.outraOrganizacao}', 'vendedor', 'unidade', '${ids.lojaOutraOrg}');
    `);
    await comoAtor(ids.dono, () => db.query("update public.perfis_usuario set status = 'bloqueado' where id = $1", [ids.semVinculo]));
    await comoAtor(ids.dono, () => db.query("update public.perfis_usuario set status = 'ativo' where id = $1", [ids.semVinculo]));
    const doPerfil = (await eventos(ids.semVinculo)).filter((e) => e.alvo_tipo === "perfis_usuario" && e.acao !== "perfis_usuario.criado");
    expect(doPerfil.map((e) => e.acao)).toEqual(["perfis_usuario.bloqueado", "perfis_usuario.bloqueado", "perfis_usuario.desbloqueado", "perfis_usuario.desbloqueado"]);
    expect(new Set(doPerfil.map((e) => e.organizacao_id))).toEqual(new Set([ids.organizacao, ids.outraOrganizacao]));
    expect(doPerfil.every((e) => e.usuario_id === ids.dono)).toBe(true);
  });

  it("mudar só o último acesso não gera evento (a entrada já é auditada na escolha da unidade)", async () => {
    const antes = (await eventos(ids.vendedorA)).length;
    await db.query("update public.perfis_usuario set ultimo_acesso_em = now() where id = $1", [ids.vendedorA]);
    await db.query("update public.perfis_usuario set nome = nome where id = $1", [ids.vendedorA]);
    expect((await eventos(ids.vendedorA)).length).toBe(antes);
  });

  it("o motivo informado na transação acompanha a mudança de configuração", async () => {
    await db.exec(`
      begin;
      select set_config('ora.motivo', 'Nome comercial atualizado', true);
      update public.unidades set nome = 'Loja C - Centro' where id = '${ids.lojaC}';
      commit;
    `);
    const ultimo = (await eventos(ids.lojaC)).at(-1);
    expect(ultimo).toMatchObject({ acao: "unidades.alterado", motivo: "Nome comercial atualizado", organizacao_id: ids.organizacao });
    expect(ultimo?.antes?.nome).toBe("Loja C");
    expect(ultimo?.depois?.nome).toBe("Loja C - Centro");
    // Fora da transação o motivo não vaza para a próxima mudança.
    await db.query("update public.unidades set nome = 'Loja C' where id = $1", [ids.lojaC]);
    expect((await eventos(ids.lojaC)).at(-1)?.motivo).toBeNull();
  });

  it("mudança na matriz papel × permissão fica registrada com o par como alvo", async () => {
    await db.query("insert into public.papel_permissoes (papel, permissao) values ('vendedor', 'ranking.ver')");
    await db.query("delete from public.papel_permissoes where papel = 'vendedor' and permissao = 'ranking.ver'");
    expect((await eventos("vendedor:ranking.ver")).map((e) => e.acao)).toEqual(["papel_permissoes.criado", "papel_permissoes.removido"]);
  });
});

describe("ORA-ORG-005 — quem pode ver esses eventos", () => {
  it("gerente da loja B vê os vínculos da loja B e nada da loja A", async () => {
    const vistos = await verComo<{ unidade_id: string }>(sessao(ids.gerenteB), ids.lojaB, "select distinct unidade_id from public.auditoria where alvo_tipo = 'vinculos'");
    expect(vistos.map((v) => v.unidade_id)).toEqual([ids.lojaB]);
  });

  it("dono da Ora vê o bloqueio do perfil na Ora; o dono da outra rede vê só a cópia da própria rede", async () => {
    const daOra = await verComo<{ organizacao_id: string }>(sessao(ids.dono), null, "select organizacao_id from public.auditoria where acao = 'perfis_usuario.bloqueado'");
    expect(daOra.map((e) => e.organizacao_id)).toEqual([ids.organizacao]);
    const daOutra = await verComo<{ organizacao_id: string }>(sessao(ids.donoOutraOrg), null, "select organizacao_id from public.auditoria where acao = 'perfis_usuario.bloqueado'");
    expect(daOutra.map((e) => e.organizacao_id)).toEqual([ids.outraOrganizacao]);
    expect(await verComo(sessao(ids.donoOutraOrg), null, "select 1 from public.auditoria where organizacao_id = $1", [ids.organizacao])).toEqual([]);
  });

  it("mudança no catálogo de papéis (sem organização) só o sistema vê", async () => {
    expect(await verComo(sessao(ids.dono), null, "select 1 from public.auditoria where alvo_tipo = 'papel_permissoes'")).toEqual([]);
  });
});
