// Regressões das revisões do Codex de 08 e 09/11/2026 (#27, #28, #30, #45 e #56), adaptadas das
// provas em docs/analises/evidencias (2026-11-08-web e 2026-11-09-nogle-9b1109), com controles
// positivos. A disputa de dois donos (#29) está em concorrencia.test.ts (PostgreSQL real).
// Banco em memória com todas as migrations; dados FICTÍCIOS; cada teste numa transação desfeita.
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
const nova = (usuario: string): Sessao => ({ usuario, sessao: `4a000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });
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
  const s = nova(usuario);
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));
const comoServico = async <T>(acao: () => Promise<T>) => {
  await db.exec("set role service_role");
  try { return await acao(); } finally { await db.exec("reset role"); }
};
const vinculosAtivos = async (usuario: string, papel: string) =>
  Number((await db.query<{ n: number }>("select count(*)::int as n from public.vinculos where usuario_id = $1 and papel = $2 and fim is null", [usuario, papel])).rows[0]?.n);
const situacaoDoConvite = async (convite: string) =>
  (await db.query<{ situacao: string; erro: string | null }>("select situacao, erro from public.convites where id = $1", [convite])).rows[0];

describe("#27 — bloqueio do perfil só com autoridade sobre todas as organizações da pessoa", () => {
  it("dono de uma rede não bloqueia quem também trabalha em outra; encerra só o vínculo dele; controle: pessoa só da própria rede", async () => {
    await db.query(`insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, inicio) values
      ($1, $2, 'vendedor', 'unidade', $3, now() - interval '1 hour'), ($1, $4, 'vendedor', 'unidade', $5, now() - interval '1 hour')`,
    [ids.semVinculo, ids.organizacao, ids.lojaA, ids.outraOrganizacao, ids.lojaOutraOrg]);
    const dono = nova(ids.dono);
    expect(await errou(dono, "select public.alterar_situacao_pessoa($1, 'bloqueado', 'teste de escopo')", [ids.semVinculo])).toBe("42501");
    const pessoa = await naLoja(ids.semVinculo, ids.lojaOutraOrg);
    expect(await valor<boolean>(pessoa, "select public.tem_permissao('venda.registrar', $1) as v", [ids.lojaOutraOrg])).toBe(true);
    const vinculoNaRede = (await db.query<{ id: string }>("select id from public.vinculos where usuario_id = $1 and organizacao_id = $2", [ids.semVinculo, ids.organizacao])).rows[0]?.id;
    expect(await valor<boolean>(dono, "select public.encerrar_vinculo($1, 'Saiu desta rede') as v", [vinculoNaRede])).toBe(true);
    expect(await valor<boolean>(pessoa, "select public.tem_permissao('venda.registrar', $1) as v", [ids.lojaOutraOrg])).toBe(true);

    expect(await valor<boolean>(dono, "select public.alterar_situacao_pessoa($1, 'bloqueado', 'Controle: só desta rede') as v", [ids.vendedorA])).toBe(true);
  });
});

describe("#28 — autoconcessão pela identidade do Auth", () => {
  it("quem mudou o e-mail no Auth não se convida pelo e-mail novo", async () => {
    await db.query("update auth.users set email = 'admin.novo@teste.invalid' where id = $1", [ids.administrador]);
    expect(await errou(nova(ids.administrador), "select public.convidar_pessoa($1, 'Pessoa teste', 'admin.novo@teste.invalid', 'gerente', array[$2::uuid], 'teste de identidade')",
      [ids.organizacao, ids.lojaA])).toBe("42501");
  });

  it("o worker recusa concluir convite cuja pessoa do Auth é quem convidou, sem dar vínculo", async () => {
    await db.query("update auth.users set email = 'admin.novo@teste.invalid' where id = $1", [ids.administrador]);
    const convite = (await db.query<{ id: string }>(
      `insert into public.convites (organizacao_id, nome, email, papel, unidades, motivo, criado_por)
       values ($1, 'Pessoa teste', 'admin.novo@teste.invalid', 'gerente', array[$2::uuid], 'Convite gravado antes da correção', $3) returning id`,
      [ids.organizacao, ids.lojaA, ids.administrador])).rows[0]?.id;
    await comoServico(() => db.query("select public.identidade_convites_a_processar(10)"));
    expect(await comoServico(async () => (await db.query<{ v: string }>("select public.identidade_concluir_convite($1, $2, true) as v", [convite, ids.administrador])).rows[0]?.v)).toBe("recusado");
    expect(await vinculosAtivos(ids.administrador, "gerente")).toBe(0);
    expect(await situacaoDoConvite(convite ?? "")).toMatchObject({ situacao: "cancelado", erro: expect.stringContaining("Autoconcessão") });
  });
});

describe("#30 — convite de quem perdeu a autorização", () => {
  it("é cancelado antes do e-mail; e, se perder no meio, é recusado na conclusão; controle: autor válido conclui", async () => {
    const alvo = "4a000000-0000-4000-8000-000000000500";
    await db.query("insert into auth.users (id, email) values ($1, 'convidado@teste.invalid')", [alvo]);
    const dono = nova(ids.dono);
    const antes = await valor<string>(dono, "select public.convidar_pessoa($1, 'Pessoa teste', 'convidado@teste.invalid', 'administrador', array[]::uuid[], 'teste de revogação') as v", [ids.organizacao]);
    await db.query("update public.perfis_usuario set status = 'bloqueado' where id = $1", [ids.dono]);
    expect(await comoServico(async () => (await db.query("select id from public.identidade_convites_a_processar(10)")).rows)).toEqual([]);
    expect(await situacaoDoConvite(antes)).toMatchObject({ situacao: "cancelado" });
    await db.query("update public.perfis_usuario set status = 'ativo' where id = $1", [ids.dono]);

    const durante = await valor<string>(dono, "select public.convidar_pessoa($1, 'Pessoa teste', 'convidado@teste.invalid', 'administrador', array[]::uuid[], 'teste de revogação 2') as v", [ids.organizacao]);
    await comoServico(() => db.query("select public.identidade_convites_a_processar(10)"));
    await db.query("update public.perfis_usuario set status = 'bloqueado' where id = $1", [ids.dono]);
    expect(await comoServico(async () => (await db.query<{ v: string }>("select public.identidade_concluir_convite($1, $2, true) as v", [durante, alvo])).rows[0]?.v)).toBe("recusado");
    expect(await vinculosAtivos(alvo, "administrador")).toBe(0);
    await db.query("update public.perfis_usuario set status = 'ativo' where id = $1", [ids.dono]);

    const valido = await valor<string>(dono, "select public.convidar_pessoa($1, 'Pessoa teste', 'convidado@teste.invalid', 'administrador', array[]::uuid[], 'controle positivo') as v", [ids.organizacao]);
    await comoServico(() => db.query("select public.identidade_convites_a_processar(10)"));
    expect(await comoServico(async () => (await db.query<{ v: string }>("select public.identidade_concluir_convite($1, $2, true) as v", [valido, alvo])).rows[0]?.v)).toBe("vinculado");
    expect(await vinculosAtivos(alvo, "administrador")).toBe(1);
  });
});

describe("#45 — leitura da aprovação própria só com acesso vigente", () => {
  it("bloqueado ou sem sessão não lê o próprio pedido pelo SELECT da API; controle: ativo lê", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(0, 'acesso:caixa') as v");
    const venda = await valor<string>(ana, "select public.criar_venda('acesso:venda') as v");
    const capa = await valor<string>(ana, "select public.adicionar_item($1, $2, null, 1, 'acesso:item') as v", [venda, cat.capa]);
    await valor(ana, "select public.aplicar_desconto($1, 500) as v", [capa]);
    await valor(ana, "select public.pedir_aprovacao($1, 'Cliente antigo da loja') as v", [capa]);
    const contar = (s: Sessao) => valor<number>(s, "select count(*)::int as v from public.aprovacoes_desconto");
    expect(await contar(ana)).toBe(1);
    await db.query("update public.perfis_usuario set status = 'bloqueado' where id = $1", [ids.vendedorA]);
    expect(await contar(ana)).toBe(0);
    await db.query("update public.perfis_usuario set status = 'ativo' where id = $1", [ids.vendedorA]);
    await db.query("delete from auth.sessions where id = $1", [ana.sessao]);
    expect(await comoUsuario(db, ana, async () => (await db.query<{ v: number }>("select count(*)::int as v from public.aprovacoes_desconto")).rows[0]?.v, { criarSessao: false })).toBe(0);
  });
});

describe("#56 — débito da carteira Nogle é custo", () => {
  it("vendedor não obtém o débito por tabela, evidência ou evento; quem tem custo.ver lê", async () => {
    const admin = await naLoja(ids.administrador, ids.lojaA);
    await valor(admin, "select public.connect_habilitar('recarga', true, 'Homologado com linha de teste (fictício)') as v");
    await db.query("select public.connect_worker_atualizar_referencias($1, 'plano', '[{\"codigo\":\"99999\",\"nome\":\"7 GB\",\"valor_centavos\":4490}]'::jsonb)", [ids.organizacao]);
    await db.query("insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem) values ($1, $2, null, 4490, now() - interval '1 day', 'manual')", [ids.organizacao, cat.recarga]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(0, 'custo:caixa') as v");
    const venda = await valor<string>(ana, "select public.criar_venda('custo:venda') as v");
    const servico = await valor<string>(ana, "select public.adicionar_item($1, $2, null, 1, 'custo:item') as v", [venda, cat.recarga]);
    await valor(ana, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":4490}]'::jsonb, '{}'::jsonb, 'custo:concluir') as v", [venda]);
    const op = await valor<string>(ana, "select public.connect_registrar('recarga', $1::jsonb, 'custo:op') as v",
      [JSON.stringify({ linha: "51988887777", plano: 99999, metodo: "SALDO", venda_item: servico })]);
    await comoServico(() => db.query("select * from public.connect_worker_reivindicar_envios($1, '{recarga}'::text[], 5)", [ids.organizacao]));
    await comoServico(() => db.query("select public.connect_worker_registrar_envio($1, '{\"resultado\":\"aceita\",\"id_externo\":\"1\",\"data_cadastro\":\"2022-06-15 11:59:34.553\"}'::jsonb)", [op]));
    // Evidência como o worker manda: a recarga identificada no histórico (#59 exige as datas).
    const evidencia = { evidencia: "confirmada", valor_debitado_centavos: 3592, mensagem: "Recarga realizada",
      dados: { data_cadastro: "2026-11-09 09:00:00", data_recarga: "2026-11-09 09:05:00", plano: "Plano fictício" } };
    await comoServico(() => db.query("select public.connect_worker_registrar_consulta($1, $2::jsonb)", [op, JSON.stringify(evidencia)]));

    expect(await valor<number>(ana, "select count(*)::int as v from public.connect_operacoes_custos")).toBe(0);
    expect(await errou(ana, "select valor_debitado_centavos from public.connect_operacoes")).toBe("42703");
    expect(await valor<string>(ana, "select evidencia::text as v from public.connect_operacoes where id = $1", [op])).not.toContain("3592");
    expect(await valor<number>(ana, "select count(*)::int as v from public.connect_eventos where dados::text like '%3592%' or coalesce(mensagem, '') like '%3592%'")).toBe(0);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await valor<number>(dono, "select valor_debitado_centavos::int as v from public.connect_operacoes_custos where operacao_id = $1", [op])).toBe(3592);
  });
});
