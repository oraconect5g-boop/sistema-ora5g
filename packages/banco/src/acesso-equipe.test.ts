// ORA-006: sessão por turno, revogação imediata e gestão da equipe (cadastro por convite,
// vínculos, bloqueio), pedido do proprietário de 08/11. Banco em memória com todas as
// migrations; pessoas e lojas fictícias. Cada teste roda numa transação desfeita no fim.
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
const nova = (usuario: string): Sessao => ({ usuario, sessao: `43000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });

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

async function como<T = Record<string, unknown>>(s: Sessao, sql: string, params: unknown[] = []) {
  return comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows);
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) => (await como<{ v: T }>(s, sql, params))[0]?.v;
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));
const naLoja = async (usuario: string, unidade: string) => {
  const s = nova(usuario);
  expect(await valor<boolean>(s, "select public.selecionar_unidade($1) as v", [unidade])).toBe(true);
  return s;
};
const pode = (s: Sessao, permissao: string, unidade: string | null = null) =>
  valor<boolean>(s, "select public.tem_permissao($1, $2) as v", [permissao, unidade]);
const comoServico = async <T>(acao: () => Promise<T>) => {
  await db.exec("set role service_role");
  try { return await acao(); } finally { await db.exec("reset role"); }
};
const CONVIDAR = "select public.convidar_pessoa($1, $2, $3, $4, $5::uuid[], $6) as v";
const auditoria = async (acao: string, alvo: string) =>
  (await db.query<{ usuario_id: string | null; motivo: string | null; organizacao_id: string | null }>(
    "select usuario_id, motivo, organizacao_id from public.auditoria where acao = $1 and alvo_id = $2 order by id", [acao, alvo])).rows;

describe("sessão por turno (ADR-002 §2.6)", () => {
  it("o turno vai até 12 horas depois do login ou até a meia-noite de São Paulo, o que vier antes", async () => {
    const casos = await db.query<{ caso: string; v: boolean | string }>(`
      select 'manha_dentro' as caso, privado.turno_valido('2026-11-09 08:00-03', '2026-11-09 19:59-03')::text as v
      union all select 'manha_fim', privado.turno_valido('2026-11-09 08:00-03', '2026-11-09 20:00-03')::text
      union all select 'virou_o_dia', privado.turno_valido('2026-11-08 23:00-03', '2026-11-09 05:00-03')::text
      union all select 'antes_do_login', privado.turno_valido('2026-11-09 08:00-03', '2026-11-09 07:00-03')::text
      union all select 'fim_tarde', to_char(privado.fim_do_turno('2026-11-09 15:00-03') at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI')
      union all select 'fim_manha', to_char(privado.fim_do_turno('2026-11-09 08:00-03') at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI')`);
    expect(Object.fromEntries(casos.rows.map((r) => [r.caso, r.v]))).toEqual({
      manha_dentro: "true", manha_fim: "false", virou_o_dia: "false", antes_do_login: "false",
      fim_tarde: "2026-11-10 00:00", fim_manha: "2026-11-09 20:00",
    });
  });

  it("sair (sessão apagada no Auth) corta o acesso na hora, mesmo com o token ainda válido", async () => {
    const s = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await pode(s, "venda.registrar", ids.lojaA)).toBe(true);
    await db.query("delete from auth.sessions where id = $1", [s.sessao]);
    // Mesmo token (mesmas claims), sem recriar a sessão: é o que acontece depois do "sair".
    const depois = <T>(sql: string, params: unknown[] = []) => comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows, { criarSessao: false });
    expect((await depois<{ v: boolean }>("select public.tem_permissao('venda.registrar', $1) as v", [ids.lojaA]))[0]?.v).toBe(false);
    expect((await depois<{ v: string | null }>("select public.unidade_atual() as v"))[0]?.v).toBeNull();
    expect(await depois("select id from public.unidades")).toEqual([]);
  });

  it("sessão de mais de 12 horas ou com prazo do Auth vencido não tem permissão e a recusa fica auditada", async () => {
    const velha = nova(ids.vendedorA);
    await db.query("insert into auth.sessions (id, user_id, created_at) values ($1, $2, now() - interval '13 hours')", [velha.sessao, velha.usuario]);
    expect(await valor<boolean>(velha, "select public.selecionar_unidade($1) as v", [ids.lojaA])).toBe(false);
    expect(await pode(velha, "unidade.entrar")).toBe(false);
    expect((await db.query("select 1 from public.auditoria where acao = 'sessao.fora_do_turno' and alvo_id = $1", [velha.sessao])).rows).toHaveLength(1);

    const prazo = await naLoja(ids.dono, ids.lojaA);
    expect(await pode(prazo, "usuarios.gerir")).toBe(true);
    await db.query("update auth.sessions set not_after = now() - interval '1 second' where id = $1", [prazo.sessao]);
    expect(await pode(prazo, "usuarios.gerir")).toBe(false);
  });

  it("a aplicação sabe a loja atual e quando o turno termina", async () => {
    const s = await naLoja(ids.vendedorAB, ids.lojaB);
    const [situacao] = await como<{ usuario_ativo: boolean; sessao_no_turno: boolean; unidade_id: string; unidade_nome: string; turno_termina_em: Date }>(
      s, "select * from public.situacao_da_sessao()");
    expect(situacao).toMatchObject({ usuario_ativo: true, sessao_no_turno: true, unidade_id: ids.lojaB, unidade_nome: "Loja B" });
    expect(situacao?.turno_termina_em.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("gestão da equipe: convite", () => {
  const motivo = "Contratação para a loja A";

  it("vendedor e gerente não gerem a equipe; dono de outra rede não vê nem convida", async () => {
    for (const s of [await naLoja(ids.vendedorA, ids.lojaA), await naLoja(ids.gerenteB, ids.lojaB), nova(ids.donoOutraOrg)]) {
      expect(await errou(s, CONVIDAR, [ids.organizacao, "Pessoa Nova", "nova@teste.invalid", "vendedor", [ids.lojaA], motivo])).toBe("42501");
    }
    const admin = nova(ids.administrador);
    await como(admin, CONVIDAR, [ids.organizacao, "Pessoa Nova", "nova@teste.invalid", "vendedor", [ids.lojaA], motivo]);
    expect(await como(nova(ids.donoOutraOrg), "select id from public.convites")).toEqual([]);
    expect(await como(await naLoja(ids.gerenteB, ids.lojaB), "select id from public.convites")).toEqual([]);
  });

  it("administrador convida vendedor para duas lojas; o pedido fica pendente e auditado com o motivo", async () => {
    const admin = nova(ids.administrador);
    const convite = await valor<string>(admin, CONVIDAR, [ids.organizacao, "  Bruna Teste ", "Bruna.Teste@Teste.Invalid", "vendedor", [ids.lojaA, ids.lojaB, ids.lojaA], motivo]);
    const [linha] = (await db.query<{ email: string; nome: string; unidades: string[]; situacao: string; criado_por: string }>(
      "select email, nome, unidades, situacao, criado_por from public.convites where id = $1", [convite])).rows;
    expect(linha).toMatchObject({ email: "bruna.teste@teste.invalid", nome: "Bruna Teste", situacao: "pendente", criado_por: ids.administrador });
    expect([...(linha?.unidades ?? [])].sort()).toEqual([ids.lojaA, ids.lojaB].sort());
    expect(await auditoria("convites.criado", convite ?? "")).toEqual([{ usuario_id: ids.administrador, motivo, organizacao_id: ids.organizacao }]);
  });

  it("só o dono convida dono ou administrador", async () => {
    expect(await errou(nova(ids.administrador), CONVIDAR, [ids.organizacao, "Outra Admin", "admin2@teste.invalid", "administrador", [], motivo])).toBe("42501");
    expect(await errou(nova(ids.dono), CONVIDAR, [ids.organizacao, "Outra Admin", "admin2@teste.invalid", "administrador", [], motivo])).toBeNull();
  });

  it("recusa loja de outra rede, papel de organização com loja, técnico fora da assistência, e-mail inválido e motivo curto", async () => {
    const admin = nova(ids.administrador);
    const casos: [string, unknown[]][] = [
      ["loja de outra rede", [ids.organizacao, "Pessoa", "p1@teste.invalid", "vendedor", [ids.lojaOutraOrg], motivo]],
      ["vendedor sem loja", [ids.organizacao, "Pessoa", "p2@teste.invalid", "vendedor", [], motivo]],
      ["técnico na loja", [ids.organizacao, "Pessoa", "p3@teste.invalid", "tecnico", [ids.lojaA], motivo]],
      ["e-mail inválido", [ids.organizacao, "Pessoa", "sem-arroba", "vendedor", [ids.lojaA], motivo]],
      ["motivo curto", [ids.organizacao, "Pessoa", "p4@teste.invalid", "vendedor", [ids.lojaA], "ok"]],
    ];
    for (const [, params] of casos) expect(await errou(admin, CONVIDAR, params)).toBe("22023");
    expect(await errou(nova(ids.dono), CONVIDAR, [ids.organizacao, "Admin", "p5@teste.invalid", "administrador", [ids.lojaA], motivo])).toBe("22023");
  });

  it("quem já está na equipe recebe vínculo, não convite; convite em aberto não se repete; ninguém convida a si mesmo", async () => {
    const admin = nova(ids.administrador);
    expect(await errou(admin, CONVIDAR, [ids.organizacao, "Vendedor A", "vendedor.a@teste.invalid", "vendedor", [ids.lojaB], motivo])).toBe("OR006");
    await como(admin, CONVIDAR, [ids.organizacao, "Pessoa", "repetida@teste.invalid", "vendedor", [ids.lojaA], motivo]);
    expect(await errou(admin, CONVIDAR, [ids.organizacao, "Pessoa", "repetida@teste.invalid", "vendedor", [ids.lojaB], motivo])).toBe("23505");
    expect(await errou(admin, CONVIDAR, [ids.organizacao, "Eu", "admin@teste.invalid", "vendedor", [ids.lojaA], motivo])).toBe("42501");
  });
});

describe("gestão da equipe: o worker conclui o convite (só service_role)", () => {
  const motivo = "Contratação para a loja A";
  const NOVA = "00000000-0000-4000-a000-0000000000c1";

  async function convidar(email = "carla@teste.invalid") {
    return (await valor<string>(nova(ids.administrador), CONVIDAR, [ids.organizacao, "Carla Teste", email, "vendedor", [ids.lojaA, ids.lojaB], motivo])) ?? "";
  }

  it("usuário logado não chama as funções do worker", async () => {
    const admin = nova(ids.administrador);
    expect(await errou(admin, "select * from public.identidade_convites_a_processar(10)")).toBe("42501");
    expect(await errou(admin, "select * from public.identidade_bloqueios_a_aplicar()")).toBe("42501");
    expect(await errou(admin, "select public.identidade_usuario_por_email('admin@teste.invalid')")).toBe("42501");
    expect(await comoServico(async () => (await db.query<{ v: string }>("select public.identidade_usuario_por_email(' ADMIN@teste.invalid') as v")).rows[0]?.v)).toBe(ids.administrador);
  });

  it("cria perfil e vínculos pedidos, com o autor e o motivo do pedido; a pessoa entra só nas lojas do convite", async () => {
    const convite = await convidar();
    const pegos = await comoServico(async () => (await db.query<{ id: string; situacao: string }>("select id, situacao from public.identidade_convites_a_processar(10)")).rows);
    expect(pegos).toEqual([{ id: convite, situacao: "processando" }]);
    await db.query("insert into auth.users (id, email) values ($1, 'carla@teste.invalid')", [NOVA]);
    await comoServico(() => db.query("select public.identidade_concluir_convite($1, $2, false)", [convite, NOVA]));

    expect((await db.query("select situacao, usuario_id from public.convites where id = $1", [convite])).rows).toEqual([{ situacao: "enviado", usuario_id: NOVA }]);
    const vinculos = (await db.query<{ unidade_id: string; criado_por: string; motivo: string }>(
      "select unidade_id, criado_por, motivo from public.vinculos where usuario_id = $1 order by unidade_id", [NOVA])).rows;
    expect(vinculos.map((v) => v.unidade_id).sort()).toEqual([ids.lojaA, ids.lojaB].sort());
    expect(vinculos.every((v) => v.criado_por === ids.administrador && v.motivo === motivo)).toBe(true);
    expect((await auditoria("perfis_usuario.criado", NOVA)).map((e) => e.motivo)).toEqual([motivo]);

    const carla = nova(NOVA);
    expect(await valor<boolean>(carla, "select public.selecionar_unidade($1) as v", [ids.lojaB])).toBe(true);
    expect(await valor<boolean>(nova(NOVA), "select public.selecionar_unidade($1) as v", [ids.lojaC])).toBe(false);
  });

  it("e-mail diferente do convite é recusado; a falha fica registrada e o gestor manda de novo", async () => {
    const convite = await convidar("diego@teste.invalid");
    await comoServico(() => db.query("select * from public.identidade_convites_a_processar(10)"));
    await db.query("insert into auth.users (id, email) values ($1, 'outra@teste.invalid')", [NOVA]);
    expect(await comoServico(() => erroDe(() => db.query("select public.identidade_concluir_convite($1, $2, false)", [convite, NOVA])))).toBe("22023");
    await comoServico(() => db.query("select public.identidade_falha_convite($1, 'SMTP não configurado')", [convite]));
    expect((await db.query("select situacao, erro from public.convites where id = $1", [convite])).rows).toEqual([{ situacao: "erro", erro: "SMTP não configurado" }]);
    expect(await valor<boolean>(nova(ids.administrador), "select public.repetir_convite($1) as v", [convite])).toBe(true);
    expect((await db.query("select situacao from public.convites where id = $1", [convite])).rows).toEqual([{ situacao: "pendente" }]);
  });

  it("convite preso em processamento volta para a fila depois de 10 minutos", async () => {
    const convite = await convidar("elisa@teste.invalid");
    await comoServico(() => db.query("select * from public.identidade_convites_a_processar(10)"));
    expect(await comoServico(async () => (await db.query("select id from public.identidade_convites_a_processar(10)")).rows)).toEqual([]);
    await db.query("update public.convites set atualizado_em = now() - interval '11 minutes' where id = $1", [convite]);
    const de_novo = await comoServico(async () => (await db.query<{ id: string; tentativas: number }>("select id, tentativas from public.identidade_convites_a_processar(10)")).rows);
    expect(de_novo).toEqual([{ id: convite, tentativas: 2 }]);
  });

  it("cancelar: só convite pendente ou com erro, com motivo", async () => {
    const convite = await convidar("fabio@teste.invalid");
    const admin = nova(ids.administrador);
    expect(await errou(admin, "select public.cancelar_convite($1, 'x')", [convite])).toBe("22023");
    expect(await valor<boolean>(admin, "select public.cancelar_convite($1, 'Desistiu da vaga') as v", [convite])).toBe(true);
    expect(await valor<boolean>(admin, "select public.cancelar_convite($1, 'Desistiu da vaga') as v", [convite])).toBe(false);
  });
});

describe("gestão da equipe: vínculos e bloqueio valem na hora", () => {
  const motivo = "Ajuste da escala da equipe";

  it("nova função durante a sessão aberta vale na hora; repetir não duplica", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await pode(vendedor, "desconto.aprovar", ids.lojaA)).toBe(false);
    const admin = nova(ids.administrador);
    const primeiro = await valor<string>(admin, "select public.vincular_pessoa($1, $2, 'gerente', $3, $4) as v", [ids.vendedorA, ids.organizacao, ids.lojaA, motivo]);
    const repetido = await valor<string>(admin, "select public.vincular_pessoa($1, $2, 'gerente', $3, $4) as v", [ids.vendedorA, ids.organizacao, ids.lojaA, motivo]);
    expect(repetido).toBe(primeiro);
    expect(await pode(vendedor, "desconto.aprovar", ids.lojaA)).toBe(true);
    expect(await auditoria("vinculos.criado", primeiro ?? "")).toEqual([{ usuario_id: ids.administrador, motivo, organizacao_id: ids.organizacao }]);
  });

  it("vincular recusa gente de fora da equipe, a si mesmo, loja de outra rede e administrador concedendo dono", async () => {
    const admin = nova(ids.administrador);
    const VINCULAR = "select public.vincular_pessoa($1, $2, $3, $4, $5) as v";
    expect(await errou(admin, VINCULAR, [ids.semVinculo, ids.organizacao, "vendedor", ids.lojaA, motivo])).toBe("P0002");
    expect(await errou(admin, VINCULAR, [ids.administrador, ids.organizacao, "vendedor", ids.lojaA, motivo])).toBe("42501");
    expect(await errou(admin, VINCULAR, [ids.vendedorA, ids.organizacao, "vendedor", ids.lojaOutraOrg, motivo])).toBe("22023");
    expect(await errou(admin, VINCULAR, [ids.vendedorA, ids.organizacao, "dono", null, motivo])).toBe("42501");
  });

  it("encerrar o vínculo tira a loja da sessão aberta na hora", async () => {
    const vendedor = await naLoja(ids.vendedorAB, ids.lojaB);
    expect(await pode(vendedor, "venda.registrar", ids.lojaB)).toBe(true);
    const vinculo = (await db.query<{ id: string }>("select id from public.vinculos where usuario_id = $1 and unidade_id = $2", [ids.vendedorAB, ids.lojaB])).rows[0]?.id;
    expect(await valor<boolean>(nova(ids.administrador), "select public.encerrar_vinculo($1, $2) as v", [vinculo, motivo])).toBe(true);
    expect(await pode(vendedor, "venda.registrar", ids.lojaB)).toBe(false);
    expect(await valor(vendedor, "select public.unidade_atual() as v")).toBeNull();
    expect((await auditoria("vinculos.encerrado", vinculo ?? "")).map((e) => e.motivo)).toEqual([motivo]);
  });

  it("administrador não tira o dono; ninguém tira o próprio vínculo; outro dono pode", async () => {
    const vinculoDono = (await db.query<{ id: string }>("select id from public.vinculos where usuario_id = $1", [ids.dono])).rows[0]?.id;
    expect(await errou(nova(ids.administrador), "select public.encerrar_vinculo($1, $2)", [vinculoDono, motivo])).toBe("42501");
    expect(await errou(nova(ids.dono), "select public.encerrar_vinculo($1, $2)", [vinculoDono, motivo])).toBe("42501");
    await db.query("insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, inicio) values ($1, $2, 'dono', 'organizacao', now() - interval '1 day')", [ids.semVinculo, ids.organizacao]);
    expect(await errou(nova(ids.semVinculo), "select public.encerrar_vinculo($1, $2)", [vinculoDono, motivo])).toBeNull();
  });

  it("bloquear corta o acesso em todas as lojas na hora; desbloquear devolve; o worker vê o que aplicar no Auth", async () => {
    const vendedor = await naLoja(ids.vendedorAB, ids.lojaA);
    const admin = nova(ids.administrador);
    expect(await errou(admin, "select public.alterar_situacao_pessoa($1, 'bloqueado', 'x')", [ids.vendedorAB])).toBe("22023");
    expect(await valor<boolean>(admin, "select public.alterar_situacao_pessoa($1, 'bloqueado', 'Desligado da empresa') as v", [ids.vendedorAB])).toBe(true);
    expect(await pode(vendedor, "venda.registrar", ids.lojaA)).toBe(false);
    expect((await db.query("select 1 from public.contexto_sessao where usuario_id = $1", [ids.vendedorAB])).rows).toEqual([]);
    expect((await auditoria("perfis_usuario.bloqueado", ids.vendedorAB)).map((e) => e.motivo)).toEqual(["Desligado da empresa"]);

    const aplicar = () => comoServico(async () => (await db.query<{ usuario_id: string; bloquear: boolean }>("select * from public.identidade_bloqueios_a_aplicar()")).rows);
    expect(await aplicar()).toEqual([{ usuario_id: ids.vendedorAB, bloquear: true }]);
    await db.query("update auth.users set banned_until = now() + interval '100 years' where id = $1", [ids.vendedorAB]);
    expect(await aplicar()).toEqual([]);
    expect(await valor<boolean>(admin, "select public.alterar_situacao_pessoa($1, 'ativo', 'Voltou para a equipe') as v", [ids.vendedorAB])).toBe(true);
    expect(await aplicar()).toEqual([{ usuario_id: ids.vendedorAB, bloquear: false }]);
  });

  it("ninguém se bloqueia; administrador não bloqueia o dono; gerente não bloqueia ninguém", async () => {
    expect(await errou(nova(ids.administrador), "select public.alterar_situacao_pessoa($1, 'bloqueado', $2)", [ids.administrador, motivo])).toBe("42501");
    expect(await errou(nova(ids.administrador), "select public.alterar_situacao_pessoa($1, 'bloqueado', $2)", [ids.dono, motivo])).toBe("42501");
    expect(await errou(await naLoja(ids.gerenteB, ids.lojaB), "select public.alterar_situacao_pessoa($1, 'bloqueado', $2)", [ids.vendedorAB, motivo])).toBe("P0002");
  });
});
