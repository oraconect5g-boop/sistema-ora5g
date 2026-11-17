// A sessão com o molde e a tela do PDV com duas conexões, num PostgreSQL 17 de verdade (lote VEL-a; ADR-010, decisão 1;
// migration 20261117015315_sessao_molde_e_pdv). O conteúdo das duas leituras está provado no banco em memória
// (sessao-molde-e-pdv.test.ts). Aqui fica o que só duas conexões provam:
//   * o bloqueio feito em outra conexão (pela função da equipe, como o dono) vale no pedido seguinte de quem já estava
//     dentro, e também na transação que já estava aberta: a conexão não guarda a resposta antiga (ORG-006);
//   * a sessão encerrada em outro lugar (a linha apagada de auth.sessions, como o Auth faz quando a pessoa sai) vale
//     do mesmo jeito, mesmo com o token antigo ainda dentro do prazo;
//   * a tela do PDV e o molde não esperam a ação do carrinho que outra conexão ainda não confirmou (só leem, sem trava),
//     mostram só o que foi confirmado e, depois da confirmação, mostram o item novo.
// Cada pedido é uma transação, como na API: abre, diz quem é (o token), executa e confirma. Dados FICTÍCIOS; o banco é
// descartado no fim.
import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { amrDaSenha } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";
import { executor, iniciarPostgresReal, type PostgresReal } from "./postgres-real";

let servidor: PostgresReal;
let admin: pg.Client;
let a: pg.Client;
let b: pg.Client;

beforeAll(async () => {
  servidor = await iniciarPostgresReal();
  admin = await servidor.conectar();
  await montarCenario(executor(admin));
  await montarCatalogo(executor(admin));
  a = await servidor.conectar();
  b = await servidor.conectar();
}, 120_000);
// Um teste que falha no meio não deixa transação aberta (e travas) para o próximo.
afterEach(async () => { for (const cliente of [a, b]) await cliente.query("rollback").catch(() => {}); });
afterAll(async () => {
  for (const cliente of [a, b, admin]) await cliente?.end().catch(() => {});
  await servidor?.parar();
});

type Sessao = { usuario: string; sessao: string };
let sessoes = 0;
let chaves = 0;
// De 8 a 80 caracteres, como os formulários exigem.
const chave = (prefixo: string) => `${prefixo}:molde-conc:${String(++chaves).padStart(5, "0")}`;

/** Entra: a linha de auth.sessions, como o Auth cria no login (a regra do turno lê a hora em que ela começou). */
async function entrar(usuario: string): Promise<Sessao> {
  const sessao = { usuario, sessao: `6c000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [sessao.sessao, usuario]);
  return sessao;
}
/** Abre a transação como a pessoa logada (papel authenticated), com o token da sessão dela e a senha digitada agora. */
async function abrir(cliente: pg.Client, s: Sessao) {
  await cliente.query("begin");
  await cliente.query("select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: s.usuario, session_id: s.sessao, role: "authenticated", amr: amrDaSenha() })]);
  await cliente.query("set local role authenticated");
}
/** Um comando dentro da transação já aberta. */
async function comando<T>(cliente: pg.Client, sql: string, params: unknown[] = []): Promise<T> {
  return (await cliente.query<{ v: T }>(sql, params)).rows[0]?.v as T;
}
/** Um pedido inteiro, como a API faz: abre, executa e confirma. */
async function pedido<T>(cliente: pg.Client, s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  await abrir(cliente, s);
  try {
    const resposta = await comando<T>(cliente, sql, params);
    await cliente.query("commit");
    return resposta;
  } catch (e) {
    await cliente.query("rollback");
    throw e;
  }
}

type Molde = {
  situacao: { usuario_ativo: boolean; sessao_no_turno: boolean; unidade_id: string | null };
  permissoes: string[];
  nome: string | null;
  pendencias: { aprovacoes: number; notas: number };
};
type Tela = {
  caixa: { id: string } | null;
  venda: { id: string; numero: number; situacao: string } | null;
  itens: { id: string; variante: { sku: string } | null; serial: { imei: string | null } | null }[];
  terminais: unknown[];
};
const MOLDE = "select public.molde_da_sessao($1::text[], $2::text[]) as v";
const TELA = "select public.pdv_tela() as v";
const ESCOLHER = "select public.selecionar_unidade($1) as v";
const ABRIR_CAIXA = "select public.abrir_caixa($1, $2) as v";
const NOVA_VENDA = "select public.criar_venda($1) as v";
const ADICIONAR = "select public.adicionar_item($1, $2, $3, $4, $5) as v";
const LOJA = ["venda.registrar", "caixa.abrir", "cliente.buscar", "desconto.aprovar", "nota.aprovar"];
const REDE = ["usuarios.gerir"];
const VAZIA: Tela = { caixa: null, venda: null, itens: [], terminais: [] };

describe("a sessão com o molde e a tela do PDV com duas conexões, num PostgreSQL de verdade (VEL-a)", () => {
  it("o servidor do teste é um PostgreSQL 17 de verdade, com um processo por conexão, e não o banco em memória", async () => {
    const versao = (await admin.query<{ v: string }>("select version() as v")).rows[0]?.v ?? "";
    expect(versao).toMatch(/^PostgreSQL 17\./);
    expect(versao).not.toContain("PGlite");
    const processos = await Promise.all([a, b].map(async (c) => (await c.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid));
    expect(new Set(processos).size).toBe(2);
  });

  it("o bloqueio feito em outra conexão vale no pedido seguinte e na transação que já estava aberta (ORG-006)", async () => {
    const ana = await entrar(ids.vendedorA);
    await pedido(a, ana, ESCOLHER, [ids.lojaA]);
    await pedido(a, ana, ABRIR_CAIXA, [10_000, chave("caixa")]);
    const venda = await pedido<string>(a, ana, NOVA_VENDA, [chave("venda")]);
    await pedido(a, ana, ADICIONAR, [venda, cat.capa, null, 1, chave("item")]);

    const antes = await pedido<Molde>(a, ana, MOLDE, [LOJA, REDE]);
    expect(antes).toMatchObject({ situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: ids.lojaA }, nome: "vendedor.a" });
    expect(antes.permissoes).toEqual(["caixa.abrir", "cliente.buscar", "venda.registrar"]);
    expect(await pedido<Tela>(a, ana, TELA)).toMatchObject({ venda: { id: venda }, itens: [{ variante: { sku: "ACE-0001" } }] });

    // Quem bloqueia é o dono, na loja, pela função da equipe. As duas contagens do menu rodam para ele (atende as filas).
    const dono = await entrar(ids.dono);
    await pedido(b, dono, ESCOLHER, [ids.lojaA]);
    const doDono = await pedido<Molde>(b, dono, MOLDE, [LOJA, REDE]);
    expect(doDono.permissoes).toEqual(["caixa.abrir", "cliente.buscar", "desconto.aprovar", "nota.aprovar", "usuarios.gerir", "venda.registrar"]);
    expect(doDono.pendencias).toEqual({ aprovacoes: 0, notas: 0 });

    // A Ana está no meio de um pedido (transação aberta, já respondida como ativa) quando o dono a bloqueia.
    await abrir(a, ana);
    expect((await comando<Molde>(a, MOLDE, [LOJA, REDE])).situacao.usuario_ativo).toBe(true);
    expect(await pedido<boolean>(b, dono, "select public.alterar_situacao_pessoa($1, 'bloqueado', $2) as v",
      [ids.vendedorA, "Teste de bloqueio com duas conexões"])).toBe(true);

    // Na mesma transação, o comando seguinte já enxerga o bloqueio.
    expect(await comando<Molde>(a, MOLDE, [LOJA, REDE])).toMatchObject({ situacao: { usuario_ativo: false, unidade_id: null }, permissoes: [] });
    expect(await comando<Tela>(a, TELA)).toEqual(VAZIA);
    await a.query("commit");

    // E no pedido seguinte: nenhuma loja, nenhuma permissão, a tela do PDV vazia e a ação recusada pelo banco.
    expect(await pedido<Molde>(a, ana, MOLDE, [LOJA, REDE]))
      .toMatchObject({ situacao: { usuario_ativo: false, unidade_id: null }, permissoes: [], pendencias: { aprovacoes: 0, notas: 0 } });
    expect(await pedido<Tela>(a, ana, TELA)).toEqual(VAZIA);
    await expect(pedido(a, ana, NOVA_VENDA, [chave("venda")])).rejects.toMatchObject({ code: "42501" });
  });

  it("a sessão encerrada em outro lugar vale no pedido seguinte: sem loja, sem permissão e sem carrinho (ORG-006)", async () => {
    const gerente = await entrar(ids.gerenteB);
    await pedido(a, gerente, ESCOLHER, [ids.lojaB]);
    await pedido(a, gerente, ABRIR_CAIXA, [10_000, chave("caixa")]);
    const antes = await pedido<Molde>(a, gerente, MOLDE, [LOJA, REDE]);
    expect(antes).toMatchObject({ situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: ids.lojaB } });
    expect(antes.permissoes).toContain("venda.registrar");
    expect((await pedido<Tela>(a, gerente, TELA)).caixa).not.toBeNull();

    // O Auth apaga a linha da sessão quando a pessoa sai ou é desconectada. O token antigo segue com a assinatura boa.
    await b.query("delete from auth.sessions where id = $1", [gerente.sessao]);

    expect(await pedido<Molde>(a, gerente, MOLDE, [LOJA, REDE]))
      .toMatchObject({ situacao: { usuario_ativo: true, sessao_no_turno: false, unidade_id: null }, permissoes: [] });
    expect(await pedido<Tela>(a, gerente, TELA)).toEqual(VAZIA);
    await expect(pedido(a, gerente, NOVA_VENDA, [chave("venda")])).rejects.toMatchObject({ code: "42501" });
  });

  it("a tela do PDV e o molde não esperam a ação do carrinho ainda não confirmada em outra conexão", async () => {
    const caio = await entrar(ids.vendedorAB);
    await pedido(a, caio, ESCOLHER, [ids.lojaA]);
    await pedido(a, caio, ABRIR_CAIXA, [10_000, chave("caixa")]);
    const venda = await pedido<string>(a, caio, NOVA_VENDA, [chave("venda")]);
    await pedido(a, caio, ADICIONAR, [venda, cat.capa, null, 1, chave("item")]);

    // O "Adicionar" do aparelho está no meio: transação aberta, com as travas da venda e do aparelho.
    await abrir(a, caio);
    await comando(a, ADICIONAR, [venda, cat.aparelho, itens.a2, 1, chave("item")]);
    // A prova de que a trava existe: quem pede a mesma venda para alterar, sem esperar, é recusado na hora.
    await expect(admin.query("select 1 from public.vendas where id = $1 for update nowait", [venda])).rejects.toMatchObject({ code: "55P03" });

    // A tela, em outra conexão (a mesma pessoa e a mesma sessão), responde com a transação da ação ainda aberta. Se
    // esperasse a trava, não voltaria: a espera estouraria os 15 s da conexão e o teste falharia.
    const durante = await pedido<Tela>(b, caio, TELA);
    expect(durante.venda).toMatchObject({ id: venda, situacao: "rascunho" });
    expect(durante.itens.map((i) => i.variante?.sku)).toEqual(["ACE-0001"]);
    expect((await pedido<Molde>(b, caio, MOLDE, [LOJA, REDE])).situacao).toMatchObject({ usuario_ativo: true, unidade_id: ids.lojaA });

    await a.query("commit");
    const depois = await pedido<Tela>(b, caio, TELA);
    expect(depois.itens.map((i) => [i.variante?.sku, i.serial?.imei ?? null])).toEqual([["ACE-0001", null], ["APA-0001", cat.imei2]]);
  });
});
