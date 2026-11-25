// Lote CONNECT-j (25/11/2026; a D-061): as funções da Nogle que mudam algo, pedidas pelo dono e pelos gerentes e enviadas uma
// vez pelo worker. Quem pede, o que cada ação confere, o PDV fora da gestão, o sensível guardado à parte só até o envio, o
// clique repetido, o cancelamento e o ciclo no worker. Linhas, CPFs, PDVs e senhas FICTÍCIOS. Cada teste roda numa transação
// desfeita no fim.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, cpf, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

let db: PGlite;
async function comoServico<T>(acao: () => Promise<T>): Promise<T> {
  await db.exec("set role service_role");
  try { return await acao(); } finally { await db.exec("reset role"); }
}
let sessoes = 0;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  // As listas oficiais e dois PDVs (um ligado à loja A, outro à loja B), como o worker grava.
  await comoServico(async () => {
    for (const [tipo, lista] of [["plano", [{ codigo: "1718", nome: "10 GB", valor_centavos: 5490 }]], ["cidade", [{ codigo: "7703", nome: "Curitiba", uf: "PR" }]]] as const) {
      await db.query("select public.connect_worker_atualizar_referencias($1, $2, $3::jsonb)", [ids.organizacao, tipo, JSON.stringify(lista)]);
    }
    await db.query("select public.connect_worker_gravar_estoque($1, $2::jsonb)", [ids.organizacao, JSON.stringify({
      pdvs: [{ id: 7101, nome: "PDV da loja A (fictício)" }, { id: 7102, nome: "PDV da loja B (fictício)" }], mvno: null, estoques: [], falhas: 0 })]);
  });
  const dono = await naLoja(ids.dono, ids.lojaA);
  await comoUsuario(db, dono, async () => {
    await db.query("select public.connect_ligar_pdv(7101, $1)", [ids.lojaA]);
    await db.query("select public.connect_ligar_pdv(7102, $1)", [ids.lojaB]);
  });
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

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
type Pedido = { tipo: string; chave: string; motivo?: string; parametros?: object; dados?: object | null };
const SQL_PEDIR = "select public.connect_pedir_acao(p_tipo => $1, p_chave => $2, p_motivo => $3, p_parametros => $4::jsonb, p_dados => $5::jsonb) as v";
const argumentos = (p: Pedido) => [p.tipo, p.chave, p.motivo ?? "Pedido do cliente na loja (teste)", JSON.stringify(p.parametros ?? {}), p.dados === undefined || p.dados === null ? null : JSON.stringify(p.dados)];
const pedir = (s: Sessao, p: Pedido) => comoUsuario(db, s, async () => (await db.query<{ v: { id: string; numero: number; situacao: string; repetido?: boolean } }>(SQL_PEDIR, argumentos(p))).rows[0]?.v);
const erroAoPedir = (s: Sessao | null, p: Pedido) => comoUsuario(db, s, () => erroDe(() => db.query(SQL_PEDIR, argumentos(p))));
const acao = async (id: string) => (await db.query<Record<string, unknown>>(
  "select tipo, alvo, parametros, situacao, mensagem, resultado, unidade_id, pedida_por from public.connect_acoes where id = $1", [id])).rows[0];
const dadosGuardados = async (id: string) => (await db.query<{ dados: Record<string, unknown> }>("select dados from privado.connect_acoes_dados where acao_id = $1", [id])).rows[0]?.dados ?? null;
const aEnviar = () => comoServico(async () => (await db.query<{ acao_id: string; tipo: string; parametros: Record<string, unknown>; dados: Record<string, unknown> | null }>(
  "select * from public.connect_worker_acoes_a_enviar($1, 10) order by acao_id", [ids.organizacao])).rows);
const registrar = (id: string, r: object) => comoServico(async () => (await db.query<{ v: string }>(
  "select public.connect_worker_registrar_acao($1, $2::jsonb) as v", [id, JSON.stringify(r)])).rows[0]?.v);

const LINHA = "41999998888";
const CPF = cpf("246813579");
const CLIENTE = { nome: "Cliente Fictício da Silva", cpf: CPF, email: "cliente@teste.invalid", telefone: "41999990000", data_nascimento: "1990-05-20",
  endereco: { rua: "Rua Fictícia", numero: "123", bairro: "Centro", cep: "80000-000", id_cidade: 7703 } };

describe("as funções da Nogle que mudam algo (CONNECT-j)", () => {
  it("o dono e os gerentes pedem; o vendedor e o técnico, não; cada ação confere o que pede", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const r = await pedir(dono, { tipo: "linha_bloquear", chave: "j1", parametros: { linha: "(41) 99999-8888", motivo_bloqueio: "ROUBO" } });
    expect(r).toMatchObject({ situacao: "registrada" });
    expect(await acao(r?.id ?? "")).toMatchObject({ tipo: "linha_bloquear", alvo: LINHA, parametros: { linha: LINHA, motivo_bloqueio: "ROUBO" }, situacao: "registrada" });
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await pedir(gerente, { tipo: "recarga_automatica_bloquear", chave: "j2", parametros: { linha: LINHA } })).toMatchObject({ situacao: "registrada" });
    expect(await erroAoPedir(await naLoja(ids.vendedorA, ids.lojaA), { tipo: "linha_desbloquear", chave: "j3", parametros: { linha: LINHA } })).toBe("42501");
    expect(await erroAoPedir(await naLoja(ids.tecnico, ids.assistencia), { tipo: "linha_desbloquear", chave: "j4", parametros: { linha: LINHA } })).toBe("42501");
    expect(await erroAoPedir(null, { tipo: "linha_desbloquear", chave: "j5", parametros: { linha: LINHA } })).toBe("42501");
    // A forma de cada uma.
    expect(await erroAoPedir(dono, { tipo: "linha_bloquear", chave: "j6", parametros: { linha: LINHA, motivo_bloqueio: "QUALQUER" } })).toBe("22023");
    expect(await erroAoPedir(dono, { tipo: "linha_desbloquear", chave: "j7", parametros: { linha: "4199999" } })).toBe("22023");
    expect(await erroAoPedir(dono, { tipo: "linha_desbloquear", chave: "j8", motivo: "x", parametros: { linha: LINHA } })).toBe("22023");
    expect(await erroAoPedir(dono, { tipo: "linha_apelido", chave: "j9", parametros: { linha: LINHA } })).toBe("22023");
    expect(await erroAoPedir(dono, { tipo: "portabilidade_reenviar_sms", chave: "j10", parametros: { linha: LINHA, linha_doadora: LINHA } })).toBe("22023");
    expect(await erroAoPedir(dono, { tipo: "recarga_programar", chave: "j11", parametros: { linha: LINHA, plano: "9999" } })).toBe("P0002");
    expect(await erroAoPedir(dono, { tipo: "recarga_programar", chave: "j12", parametros: { linha: LINHA, plano: "1718", quantidade: "0" } })).toBe("22023");
    expect(await pedir(dono, { tipo: "recarga_programar", chave: "j13", parametros: { linha: LINHA, plano: "1718" } })).toMatchObject({ situacao: "registrada" });
    expect(await erroAoPedir(dono, { tipo: "desligar_tudo", chave: "j14", parametros: {} })).toBe("22023");
  });

  it("a compra e o cadastro do cliente guardam o sensível à parte; a lista mostra só o documento mascarado", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const compra = await pedir(dono, { tipo: "compra_chip", chave: "c1", parametros: { plano: "88888", quantidade: 2, metodo: "link" }, dados: CLIENTE });
    const guardada = await acao(compra?.id ?? "");
    expect(guardada).toMatchObject({ tipo: "compra_chip", alvo: `•••.•••.${CPF.slice(6, 9)}-${CPF.slice(9)}`, parametros: { plano: "88888", quantidade: 2, metodo: "LINK" } });
    expect(JSON.stringify(guardada)).not.toContain(CPF);
    expect(await dadosGuardados(compra?.id ?? "")).toMatchObject({ cpf: CPF, endereco: { cep: "80000000", id_cidade: 7703 } });
    expect(await erroAoPedir(dono, { tipo: "compra_chip", chave: "c2", parametros: { plano: "1718", quantidade: 16, metodo: "SALDO" }, dados: CLIENTE })).toBe("22023");
    expect(await erroAoPedir(dono, { tipo: "compra_chip", chave: "c3", parametros: { plano: "1718", metodo: "PIX" }, dados: CLIENTE })).toBe("22023");
    expect(await erroAoPedir(dono, { tipo: "cliente_cadastrar", chave: "c4", dados: { ...CLIENTE, data_nascimento: "" } })).toBe("22023");
    expect(await erroAoPedir(dono, { tipo: "cliente_cadastrar", chave: "c5", dados: { ...CLIENTE, endereco: { ...CLIENTE.endereco, id_cidade: 1 } } })).toBe("22023");
    expect(await erroAoPedir(dono, { tipo: "cliente_atualizar", chave: "c6", dados: { ...CLIENTE, cpf: "11111111111" } })).toBe("22023");
    expect(await pedir(dono, { tipo: "cliente_atualizar", chave: "c7", dados: { ...CLIENTE, data_nascimento: "" } })).toMatchObject({ situacao: "registrada" });
  });

  it("o PDV: o gerente só mexe no da loja dele; o dono, em qualquer um; a senha do usuário é conferida e não entra na conta do clique", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await erroAoPedir(gerente, { tipo: "pdv_inativar", chave: "p1", parametros: { pdv: 7101 } })).toBe("42501");
    expect(await pedir(gerente, { tipo: "pdv_atualizar", chave: "p2", parametros: { pdv: 7102 }, dados: { nome: "PDV B (novo nome fictício)" } })).toMatchObject({ situacao: "registrada" });
    expect(await erroAoPedir(gerente, { tipo: "pdv_atualizar", chave: "p3", parametros: { pdv: 7102 }, dados: {} })).toBe("22023");
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await pedir(dono, { tipo: "pdv_inativar", chave: "p4", parametros: { pdv: 7102 } })).toMatchObject({ situacao: "registrada" });
    expect(await erroAoPedir(dono, { tipo: "pdv_usuario", chave: "p5", parametros: { pdv: 7101 }, dados: { nome: "Pessoa (teste)", email: "pessoa@teste.invalid", senha: "curta" } })).toBe("22023");
    const usuario = await pedir(dono, { tipo: "pdv_usuario", chave: "p6", parametros: { pdv: 7101 }, dados: { nome: "Pessoa (teste)", email: "Pessoa@Teste.invalid", senha: "senha-ficticia-1" } });
    expect(await dadosGuardados(usuario?.id ?? "")).toEqual({ nome: "Pessoa (teste)", email: "pessoa@teste.invalid", senha: "senha-ficticia-1" });
    expect(JSON.stringify(await acao(usuario?.id ?? ""))).not.toContain("senha-ficticia-1");
    // A mesma chave com outra senha é o mesmo pedido (a senha não entra na conta); com outro e-mail, OR004.
    expect(await pedir(dono, { tipo: "pdv_usuario", chave: "p6", parametros: { pdv: 7101 }, dados: { nome: "Pessoa (teste)", email: "pessoa@teste.invalid", senha: "outra-senha-2" } }))
      .toMatchObject({ id: usuario?.id, repetido: true });
    expect(await erroAoPedir(dono, { tipo: "pdv_usuario", chave: "p6", parametros: { pdv: 7101 }, dados: { nome: "Pessoa (teste)", email: "outra@teste.invalid", senha: "senha-ficticia-1" } })).toBe("OR004");
    const novo = await pedir(dono, { tipo: "pdv_cadastrar", chave: "p7", parametros: { nome: "Loja nova (fictícia)", uf: "PR", cidade: "Curitiba" },
      dados: { contato_celular: "41999990000", usuario: { nome: "Gerente (fictício)", email: "gerente@teste.invalid", senha: "senha-ficticia-3" } } });
    expect(await acao(novo?.id ?? "")).toMatchObject({ alvo: "Loja nova (fictícia)", parametros: { nome: "Loja nova (fictícia)", uf: "PR", cidade: "Curitiba" } });
  });

  it("quem pediu e quem gere a loja do pedido leem; o cancelamento só antes de sair", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const r = await pedir(gerente, { tipo: "linha_apelido", chave: "l1", parametros: { linha: LINHA, apelido: "Celular do cliente" } });
    const ve = async (s: Sessao) => (await comoUsuario(db, s, () => db.query("select id from public.connect_acoes where id = $1", [r?.id]))).rows.length;
    expect(await ve(gerente)).toBe(1);
    expect(await ve(await naLoja(ids.dono, ids.lojaA))).toBe(1);
    expect(await ve(await naLoja(ids.vendedorA, ids.lojaA))).toBe(0);
    const cancelar = (s: Sessao, id: string) => comoUsuario(db, s, () => erroDe(() => db.query("select public.connect_cancelar_acao($1, 'O cliente desistiu')", [id])));
    expect(await cancelar(await naLoja(ids.vendedorA, ids.lojaA), r?.id ?? "")).toBe("42501");
    expect(await cancelar(gerente, r?.id ?? "")).toBeNull();
    expect(await acao(r?.id ?? "")).toMatchObject({ situacao: "cancelada" });
    const dono = await naLoja(ids.dono, ids.lojaA);
    const outra = await pedir(dono, { tipo: "linha_desbloquear", chave: "l2", parametros: { linha: LINHA } });
    await aEnviar();
    expect(await cancelar(dono, outra?.id ?? "")).toBe("OR057");
  });

  it("o worker pega a fila com o sensível, grava o resultado e apaga o sensível; o que não saiu volta; o parado vira desconhecido", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const compra = await pedir(dono, { tipo: "compra_chip", chave: "w1", parametros: { plano: "1718", quantidade: 1, metodo: "LINK" }, dados: CLIENTE });
    const bloqueio = await pedir(dono, { tipo: "linha_bloquear", chave: "w2", parametros: { linha: LINHA, motivo_bloqueio: "PERDA" } });
    const apelido = await pedir(dono, { tipo: "linha_apelido", chave: "w3", parametros: { linha: LINHA, apelido: "Trabalho" } });
    const fila = await aEnviar();
    expect(fila.map((f) => f.acao_id).sort()).toEqual([compra?.id, bloqueio?.id, apelido?.id].sort());
    expect(fila.find((f) => f.acao_id === compra?.id)?.dados).toMatchObject({ cpf: CPF });
    expect(await aEnviar()).toEqual([]);
    expect(await registrar(compra?.id ?? "", { envio: "feita", mensagem: "", resultado: { pedido: 9172, link_pagamento: "https://pagamento.invalid/x" } })).toBe("feita");
    expect(await acao(compra?.id ?? "")).toMatchObject({ situacao: "feita", resultado: { pedido: 9172 } });
    expect(await dadosGuardados(compra?.id ?? "")).toBeNull();
    expect(await registrar(bloqueio?.id ?? "", { envio: "nao_enviada", mensagem: "Sem conexão com a Nogle" })).toBe("registrada");
    expect(await registrar(bloqueio?.id ?? "", { envio: "feita" })).toBe("ignorada");
    expect(await comoServico(() => erroDe(() => db.query("select public.connect_worker_registrar_acao($1, '{\"envio\":\"talvez\"}'::jsonb)", [apelido?.id])))).toBe("22023");
    // O envio parado há mais de 10 minutos: resultado desconhecido (nunca reenviado), e o sensível sai.
    await db.query("update public.connect_acoes set enviando_desde = now() - interval '11 minutes' where id = $1", [apelido?.id]);
    const segunda = await aEnviar();
    expect(segunda.map((f) => f.acao_id)).toEqual([bloqueio?.id]);
    expect(await acao(apelido?.id ?? "")).toMatchObject({ situacao: "resultado_desconhecido" });
    // As funções do worker são só do servidor.
    expect(await comoUsuario(db, dono, () => erroDe(() => db.query("select * from public.connect_worker_acoes_a_enviar($1, 5)", [ids.organizacao])))).toBe("42501");
    expect(await comoUsuario(db, dono, () => erroDe(() => db.query("select public.connect_worker_registrar_acao($1, '{\"envio\":\"feita\"}'::jsonb)", [apelido?.id])))).toBe("42501");
  });
});
