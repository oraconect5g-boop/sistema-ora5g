// Lote 2 do prompt consolidado (09/11/2026), Ora Connect: regressões permanentes da prova do Codex
// docs/analises/evidencias/2026-11-09-nogle-9b1109/banco.repro.ts (PR #33), adaptadas ao contrato
// novo e com controles positivos. Banco em memória; respostas FICTÍCIAS no formato documentado.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { interpretarConsulta, type OperacaoParaConsultar } from "../../dominio/src/nogle";
import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
let n = 0;
const chave = () => `connect-lote2:${++n}`;
const usuario = async (id: string = ids.vendedorA): Promise<Sessao> => {
  const s = { usuario: id, sessao: `4c000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [ids.lojaA]));
  return s;
};
const valor = <T>(s: Sessao, sql: string, p: unknown[] = []) => comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, p)).rows[0]?.v as T);
const servico = async <T>(acao: () => Promise<T>) => {
  await db.exec("set role service_role");
  try { return await acao(); } finally { await db.exec("reset role"); }
};
const rpcServico = <T>(sql: string, p: unknown[] = []) => servico(async () => (await db.query<{ v: T }>(sql, p)).rows[0]?.v as T);
const REGISTRAR = "select public.connect_registrar($1, $2::jsonb, $3) as v";
const registrar = (s: Sessao, p: object, k = chave(), tipo = "recarga") => valor<string>(s, REGISTRAR, [tipo, JSON.stringify(p), k]);
const cadastro = "2026-11-09 09:00:00";
const cliente = {
  nome: "Cliente Ficticio", cpf: "12345678909", data_nascimento: "1990-05-20", email: "cliente@teste.invalid", telefone: "51999990000",
  endereco: { rua: "Rua Ficticia", numero: "1", bairro: "Centro", cep: "90000000", id_cidade: 7703 },
};
async function codigo(acao: () => Promise<unknown>) {
  await db.exec("savepoint tentativa");
  let c: string | null = null;
  try { await acao(); } catch (e) { c = (e as { code: string }).code; await db.exec("rollback to savepoint tentativa"); }
  await db.exec("release savepoint tentativa");
  return c;
}
// O savepoint fica dentro da sessão: o erro devolvido é o da função, não o da troca de papel.
const errouRegistrar = (s: Sessao, p: object, k: string, tipo = "recarga") =>
  comoUsuario(db, s, () => codigo(() => db.query(REGISTRAR, [tipo, JSON.stringify(p), k])));
async function servicoPago(s: Sessao) {
  await db.query("insert into public.precos (organizacao_id, variante_id, valor_centavos, inicio, origem) values ($1, $2, 4490, now() - interval '1 day', 'manual')", [ids.organizacao, cat.recarga]);
  await valor(s, "select public.abrir_caixa(0, $1) as v", [chave()]);
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave()]);
  const item = await valor<string>(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.recarga, chave()]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, JSON.stringify([{ meio: "dinheiro", valor: 4490 }]), chave()]);
  return item;
}
async function aceitar(id: string, externo: string) {
  await rpcServico("select count(*) as v from public.connect_worker_reivindicar_envios($1, ARRAY['ativacao','recarga'], 5)", [ids.organizacao]);
  return rpcServico("select public.connect_worker_registrar_envio($1, $2::jsonb) as v", [id, JSON.stringify({ resultado: "aceita", id_externo: externo, data_cadastro: cadastro })]);
}
const consultar = (id: string, evidencia: object) => rpcServico<string>("select public.connect_worker_registrar_consulta($1, $2::jsonb) as v", [id, JSON.stringify(evidencia)]);
const situacao = async (id: string) => (await db.query<{ situacao: string }>("select situacao from public.connect_operacoes where id = $1", [id])).rows[0]?.situacao;
const producoes = async () => (await db.query<{ n: number }>("select count(*)::int as n from public.connect_producao")).rows[0]?.n;

beforeAll(async () => { db = await criarBanco(); await montarCenario(db); await montarCatalogo(db); });
beforeEach(async () => {
  await db.exec("begin");
  const listas = { plano: [{ codigo: "99999", nome: "Plano ficticio", valor_centavos: 4490 }], ddd: [{ codigo: "51", nome: "51", uf: "RS" }], cidade: [{ codigo: "7703", nome: "Cidade ficticia", uf: "RS" }] };
  for (const [tipo, itens] of Object.entries(listas)) await rpcServico("select public.connect_worker_atualizar_referencias($1, $2, $3::jsonb) as v", [ids.organizacao, tipo, JSON.stringify(itens)]);
  const admin = await usuario(ids.administrador);
  for (const tipo of ["ativacao", "recarga"]) await valor(admin, "select public.connect_habilitar($1, true, $2) as v", [tipo, "Homologacao ficticia local"]);
});
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

describe("#58 — a chave da ativação confere o titular, com privacidade", () => {
  it("mesma chave com outro titular é OR004; controle: a repetição igual (com espaços e maiúsculas diferentes) devolve a mesma operação", async () => {
    const s = await usuario();
    const p = { metodo: "LINK", esim: true, ddd: 51, plano: 99999, cliente };
    const k = chave();
    const id = await registrar(s, p, k, "ativacao");
    expect(await errouRegistrar(s, { ...p, cliente: { ...cliente, nome: "Outra Pessoa Ficticia" } }, k, "ativacao")).toBe("OR004");
    expect(await errouRegistrar(s, { ...p, cliente: { ...cliente, cpf: "52998224725" } }, k, "ativacao")).toBe("OR004");
    expect(await registrar(s, { ...p, cliente: { ...cliente, nome: "  CLIENTE   Ficticio ", cpf: "123.456.789-09" } }, k, "ativacao")).toBe(id);

    // O pedido enviado é descartado; a chave continua conferindo o titular. O resumo não guarda o CPF.
    await db.query("delete from privado.connect_dados_envio where operacao_id = $1", [id]);
    expect(await errouRegistrar(s, { ...p, cliente: { ...cliente, nome: "Outra Pessoa Ficticia" } }, k, "ativacao")).toBe("OR004");
    const guardado = (await db.query<{ conteudo: string }>("select conteudo from public.connect_operacoes where id = $1", [id])).rows[0]?.conteudo ?? "";
    expect(guardado).toMatch(/^[0-9a-f]{32}$/);
    expect(guardado).not.toContain("12345678909");
  });

  it("ninguém de fora lê o segredo do resumo", async () => {
    const s = await usuario();
    await registrar(s, { metodo: "LINK", esim: true, ddd: 51, plano: 99999, cliente }, chave(), "ativacao");
    expect(await comoUsuario(db, s, () => codigo(() => db.query("select segredo from privado.connect_segredos")))).toBe("42501");
    expect(await servico(() => codigo(() => db.query("select segredo from privado.connect_segredos")))).toBe("42501");
  });
});

describe("#57 — LINK não cobra de novo um serviço pago no caixa", () => {
  it("LINK com o serviço pago é recusado; controle: o mesmo serviço vai pelo SALDO", async () => {
    const s = await usuario();
    const item = await servicoPago(s);
    expect(await errouRegistrar(s, { metodo: "LINK", linha: "51999990000", plano: 99999, venda_item: item }, chave())).toBe("22023");
    const id = await registrar(s, { metodo: "SALDO", linha: "51999990000", plano: 99999, venda_item: item });
    expect(await situacao(id)).toBe("registrada");
  });
});

describe("#59 — uma evidência do histórico confirma uma recarga só", () => {
  const historico = { retorno: true, historico: [{ data_cadastro: cadastro, data_recarga: "2026-11-09 09:05:00", plano: "Plano ficticio", valor_pago: "35.92" }] };
  const consultaDe = (id: string, externo: string): OperacaoParaConsultar => ({
    operacao_id: id, tipo: "recarga", situacao: "aguardando_operadora", linha: "51999990000", linha_doadora: null, iccid: null,
    id_externo: externo, data_cadastro_externa: cadastro, metodo_pagamento: "LINK",
  });

  it("duas operações da linha com a mesma data de cadastro: nenhuma se confirma sozinha; a gerência resolve uma", async () => {
    const s = await usuario();
    const ops: string[] = [];
    for (let i = 0; i < 2; i++) {
      const id = await registrar(s, { metodo: "LINK", linha: "51999990000", plano: 99999 });
      ops.push(id);
      await aceitar(id, `ficticio-${i}`);
    }
    const resultados = [];
    for (const [i, id] of ops.entries()) resultados.push(await consultar(id, interpretarConsulta(consultaDe(id, `ficticio-${i}`), 200, historico)));
    expect(await producoes()).toBe(0);
    // A primeira vai para a conferência; a segunda espera (uma recarga em curso por linha) e consulta de novo depois.
    expect(resultados).toEqual(["resultado_desconhecido", "aguardando_operadora"]);
    expect((await db.query("select tipo, mensagem from public.connect_eventos where operacao_id = $1 and tipo = 'conferencia'", [ops[0]])).rows)
      .toEqual([{ tipo: "conferencia", mensagem: "Outra operação da mesma linha tem a mesma data de cadastro: a evidência não diz de qual é" }]);
    const gerente = await usuario(ids.dono);
    expect(await valor(gerente, "select public.connect_resolver($1, 'confirmada', 'Conferido no extrato da Contel: recarga das 09:05') as v", [ops[0]])).toBe("confirmada");
    expect(await producoes()).toBe(1);
  });

  it("a mesma recarga do histórico não confirma outra operação; controle: a primeira confirma e conta uma vez", async () => {
    const s = await usuario();
    const primeira = await registrar(s, { metodo: "LINK", linha: "51999990000", plano: 99999 });
    await aceitar(primeira, "ficticio-a");
    expect(await consultar(primeira, interpretarConsulta(consultaDe(primeira, "ficticio-a"), 200, historico))).toBe("confirmada");
    expect(await consultar(primeira, interpretarConsulta(consultaDe(primeira, "ficticio-a"), 200, historico))).toBe("confirmada");
    expect(await producoes()).toBe(1);

    // Outra operação da mesma linha, cadastrada depois e com outra data; a consulta devolve a recarga já usada.
    const segunda = await registrar(s, { metodo: "LINK", linha: "51999990000", plano: 99999 });
    await rpcServico("select count(*) as v from public.connect_worker_reivindicar_envios($1, ARRAY['recarga'], 5)", [ids.organizacao]);
    await rpcServico("select public.connect_worker_registrar_envio($1, $2::jsonb) as v", [segunda, JSON.stringify({ resultado: "aceita", id_externo: "ficticio-b", data_cadastro: "2026-11-09 10:00:00" })]);
    const reaproveitada = { evidencia: "confirmada", mensagem: "Recarga realizada (histórico da linha).", dados: historico.historico[0] };
    expect(await consultar(segunda, reaproveitada)).toBe("resultado_desconhecido");
    expect(await producoes()).toBe(1);
    expect((await db.query("select mensagem from public.connect_eventos where operacao_id = $1 and tipo = 'conferencia'", [segunda])).rows)
      .toEqual([{ mensagem: "Esta recarga do histórico já confirmou outra operação" }]);
  });

  it("histórico ambíguo vai para a gerência; confirmação sem as datas não confirma", async () => {
    const s = await usuario();
    const id = await registrar(s, { metodo: "LINK", linha: "51999990000", plano: 99999 });
    await aceitar(id, "ficticio-c");
    expect(await consultar(id, { evidencia: "confirmada", mensagem: "sem dados" })).toBe("aguardando_operadora");
    const duplicado = { ...historico, historico: [...historico.historico, { ...historico.historico[0], data_recarga: "2026-11-09 09:06:00" }] };
    expect(await consultar(id, interpretarConsulta(consultaDe(id, "ficticio-c"), 200, duplicado))).toBe("resultado_desconhecido");
    expect(await producoes()).toBe(0);
  });
});
