// Lote CONNECT-g (25/11/2026; ORA-CONNECT-007 e ORA-CONNECT-009): as consultas da Nogle que só leem, pedidas na tela e feitas
// pelo worker. Quem pode pedir, o clique repetido, o limite por hora, quem vê (só quem pediu) e o ciclo no worker (pegar a
// fila uma vez, gravar a resposta, vencer o que parou e apagar a resposta depois de 24 horas). LINHAS e ICCIDs FICTÍCIOS.
// Cada teste roda numa transação desfeita no fim.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cnpj, comDigitoLuhn, comoUsuario, cpf, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
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
async function comoServico<T>(acao: () => Promise<T>): Promise<T> {
  await db.exec("set role service_role");
  try { return await acao(); } finally { await db.exec("reset role"); }
}
let sessoes = 0;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4c000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const erroComo = (s: Sessao | null, sql: string, parametros: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, parametros)));
const consultar = (s: Sessao, tipo: string, parametro: string | null, chave: string) => comoUsuario(db, s, async () =>
  (await db.query<{ v: string }>("select public.connect_consultar(p_tipo => $1, p_parametro => $2, p_chave => $3) as v", [tipo, parametro, chave])).rows[0]?.v ?? "");
const erroAoConsultar = (s: Sessao | null, tipo: string, parametro: string | null, chave: string) =>
  erroComo(s, "select public.connect_consultar(p_tipo => $1, p_parametro => $2, p_chave => $3)", [tipo, parametro, chave]);
const consulta = async (id: string) => (await db.query<Record<string, unknown>>(
  "select tipo, parametro, parametro_mascarado, situacao, unidade_id, pedida_por, resposta, mensagem, resposta_apagada_em from public.connect_consultas where id = $1",
  [id])).rows[0];
const aFazer = (limite = 5) => comoServico(async () => (await db.query<{ consulta_id: string; tipo: string; parametro: string | null }>(
  "select * from public.connect_worker_consultas_a_fazer($1, $2) order by consulta_id", [ids.organizacao, limite])).rows);
const registrar = (id: string, resultado: object) => comoServico(async () => (await db.query<{ v: string }>(
  "select public.connect_worker_registrar_resposta_da_consulta($1, $2::jsonb) as v", [id, JSON.stringify(resultado)])).rows[0]?.v);
const limpar = () => comoServico(async () => (await db.query<{ v: Record<string, number> }>(
  "select public.connect_worker_limpar_consultas($1) as v", [ids.organizacao])).rows[0]?.v);

const LINHA = "51988887777";
const ICCID = comDigitoLuhn("895517011000004321");

describe("as consultas da Nogle (CONNECT-g)", () => {
  it("a loja pede a da linha e a do chip; o dono, a da carteira; o clique repetido devolve a mesma; o resto é recusado", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const id = await consultar(vendedor, "linha_saldo", "(51) 98888-7777", "k1");
    expect(await consulta(id)).toMatchObject({
      tipo: "linha_saldo", parametro: LINHA, situacao: "na_fila", unidade_id: ids.lojaA, pedida_por: ids.vendedorA, resposta: null,
    });
    // O clique repetido devolve a mesma consulta; a mesma chave com outra linha é OR004.
    expect(await consultar(vendedor, "linha_saldo", LINHA, "k1")).toBe(id);
    expect(await erroAoConsultar(vendedor, "linha_saldo", "51977776666", "k1")).toBe("OR004");
    expect(await consultar(vendedor, "iccid_numero", ICCID, "k2")).toMatch(/^[0-9a-f-]{36}$/);
    // A forma: a linha com 11 dígitos (celular com DDD), o ICCID com o dígito verificador, a carteira sem nada.
    expect(await erroAoConsultar(vendedor, "linha_detalhes", "5198888", "k3")).toBe("22023");
    expect(await erroAoConsultar(vendedor, "iccid_ativacao", `${ICCID.slice(0, -1)}${(Number(ICCID.slice(-1)) + 1) % 10}`, "k4")).toBe("22023");
    expect(await erroAoConsultar(vendedor, "linha_qualquer", LINHA, "k5")).toBe("22023");
    // A carteira é só do dono (connect.gerir na rede); o vendedor e o técnico (sem a Ora Connect) são recusados.
    expect(await erroAoConsultar(vendedor, "carteira_saldo", null, "k6")).toBe("42501");
    const tecnico = await naLoja(ids.tecnico, ids.assistencia);
    expect(await erroAoConsultar(tecnico, "linha_saldo", LINHA, "k7")).toBe("42501");
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await erroAoConsultar(dono, "carteira_saldo", LINHA, "k8")).toBe("22023");
    expect(await consulta(await consultar(dono, "carteira_saldo", null, "k10"))).toMatchObject({ tipo: "carteira_saldo", parametro: null, situacao: "na_fila" });
    // Sem login: nem chama.
    expect(await erroAoConsultar(null, "linha_saldo", LINHA, "k9")).toBe("42501");
  });

  it("só quem pediu vê a consulta (a resposta pode ter o nome do titular); até 30 por pessoa por hora", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const id = await consultar(vendedor, "linha_detalhes", LINHA, "ver");
    const ve = async (s: Sessao) => (await comoUsuario(db, s, () => db.query("select id from public.connect_consultas where id = $1", [id]))).rows.length;
    expect(await ve(vendedor)).toBe(1);
    expect(await ve(await naLoja(ids.vendedorAB, ids.lojaA))).toBe(0);
    expect(await ve(await naLoja(ids.dono, ids.lojaA))).toBe(0);
    for (let n = 2; n <= 30; n++) await consultar(vendedor, "linha_saldo", LINHA, `limite:${n}`);
    expect(await erroAoConsultar(vendedor, "linha_saldo", LINHA, "limite:31")).toBe("OR056");
    // O limite é de cada pessoa: a colega da mesma loja ainda consulta.
    expect(await consultar(await naLoja(ids.vendedorAB, ids.lojaA), "linha_saldo", LINHA, "colega")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("o worker pega a fila uma vez, grava a resposta e vence o que parou; a resposta some depois de 24 horas", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const a = await consultar(vendedor, "linha_saldo", LINHA, "w1");
    const b = await consultar(vendedor, "iccid_numero", ICCID, "w2");
    const c = await consultar(vendedor, "linha_historico", LINHA, "w3");
    expect((await aFazer()).map((x) => x.consulta_id).sort()).toEqual([a, b, c].sort());
    expect(await aFazer()).toEqual([]);
    expect(await consulta(a)).toMatchObject({ situacao: "consultando" });

    expect(await registrar(a, { situacao: "respondida", resposta: { dados_mb: 2395.23, minutos: 60, sms: 60 }, mensagem: "" }))
      .toBe("respondida");
    expect(await consulta(a)).toMatchObject({ situacao: "respondida", resposta: { dados_mb: 2395.23, minutos: 60, sms: 60 }, mensagem: null });
    // A resposta só fica na respondida; a gravada de novo é ignorada.
    expect(await registrar(b, { situacao: "nao_encontrada", resposta: { numero: "x" }, mensagem: "Linha não encontrada." })).toBe("nao_encontrada");
    expect(await consulta(b)).toMatchObject({ situacao: "nao_encontrada", resposta: null, mensagem: "Linha não encontrada." });
    expect(await registrar(b, { situacao: "respondida", resposta: {} })).toBe("ignorada");
    expect(await comoServico(() => erroDe(() => db.query("select public.connect_worker_registrar_resposta_da_consulta($1, $2::jsonb)",
      [c, JSON.stringify({ situacao: "aceita" })])))).toBe("22023");

    // Vence o que parou: consultando há mais de 2 minutos e na fila há mais de 10.
    await db.query("update public.connect_consultas set consultando_desde = now() - interval '3 minutes' where id = $1", [c]);
    const parada = await consultar(vendedor, "linha_consumo", LINHA, "w4");
    await db.query("update public.connect_consultas set pedida_em = now() - interval '11 minutes' where id = $1", [parada]);
    expect(await limpar()).toEqual({ vencidas: 2, apagadas: 0 });
    expect(await consulta(c)).toMatchObject({ situacao: "falhou", mensagem: "A consulta não terminou: peça de novo." });
    expect(await consulta(parada)).toMatchObject({ situacao: "falhou", mensagem: "O servidor não consultou a tempo: peça de novo." });
    // Depois de 24 horas, a resposta é apagada; fica quem consultou o quê e quando.
    await db.query("update public.connect_consultas set respondida_em = now() - interval '25 hours' where id = $1", [a]);
    expect(await limpar()).toEqual({ vencidas: 0, apagadas: 1 });
    expect(await consulta(a)).toMatchObject({ situacao: "respondida", resposta: null, tipo: "linha_saldo", parametro: LINHA });
    expect((await consulta(a))?.resposta_apagada_em).not.toBeNull();
  });

  it("as funções do worker são só do servidor; rede desconhecida é recusada", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const id = await consultar(dono, "carteira_saldo", null, "s1");
    expect(await erroComo(dono, "select * from public.connect_worker_consultas_a_fazer($1, 5)", [ids.organizacao])).toBe("42501");
    expect(await erroComo(dono, "select public.connect_worker_registrar_resposta_da_consulta($1, '{\"situacao\":\"falhou\"}'::jsonb)", [id])).toBe("42501");
    expect(await erroComo(dono, "select public.connect_worker_limpar_consultas($1)", [ids.organizacao])).toBe("42501");
    const desconhecida = "00000000-0000-4000-8000-000000009999";
    expect(await comoServico(() => erroDe(() => db.query("select * from public.connect_worker_consultas_a_fazer($1, 5)", [desconhecida])))).toBe("22023");
    expect(await comoServico(() => erroDe(() => db.query("select public.connect_worker_limpar_consultas($1)", [desconhecida])))).toBe("22023");
  });
});

// CONNECT-h (25/11/2026): a consulta completa, com os relatórios individuais do número e do cliente (pelo CPF/CNPJ).
describe("a consulta completa: o relatório do número e o do cliente (CONNECT-h)", () => {
  const CPF = cpf("246813579");
  const CNPJ = cnpj("11222333", "0001");

  it("a loja pede o relatório do número, o do cliente (pelo CPF ou CNPJ válido) e as consultas novas; o CPF fica mascarado", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    for (const [tipo, parametro] of [["linha_completa", LINHA], ["linha_cobrancas", LINHA], ["linha_consumo_voz", LINHA], ["linha_consumo_sms", LINHA],
      ["linha_existe", LINHA], ["iccid_plano_pago", ICCID], ["iccid_situacao", ICCID], ["cliente_completo", CNPJ]] as const) {
      expect(await consultar(vendedor, tipo, parametro, `h:${tipo}`), tipo).toMatch(/^[0-9a-f-]{36}$/);
    }
    const doCliente = await consulta(await consultar(vendedor, "cliente_completo", CPF, "h:cpf"));
    expect(doCliente).toMatchObject({ tipo: "cliente_completo", parametro: CPF, parametro_mascarado: `•••.•••.${CPF.slice(6, 9)}-${CPF.slice(9)}` });
    expect((await consulta(await consultar(vendedor, "cliente_completo", CNPJ, "h:cnpj2")))?.parametro_mascarado).toBe(`••.•••.•••/${CNPJ.slice(8, 12)}-${CNPJ.slice(12)}`);
    // CPF ou CNPJ inválido, ou uma linha no lugar do documento: recusado.
    expect(await erroAoConsultar(vendedor, "cliente_completo", `${CPF.slice(0, -1)}${(Number(CPF.slice(-1)) + 1) % 10}`, "h:x1")).toBe("22023");
    expect(await erroAoConsultar(vendedor, "cliente_completo", LINHA, "h:x2")).toBe("22023");
    expect(await erroAoConsultar(vendedor, "linha_completa", ICCID, "h:x3")).toBe("22023");
    expect(await erroAoConsultar(vendedor, "iccid_situacao", LINHA, "h:x4")).toBe("22023");
    // O técnico, sem a Ora Connect, não pede nem o relatório.
    expect(await erroAoConsultar(await naLoja(ids.tecnico, ids.assistencia), "linha_completa", LINHA, "h:x5")).toBe("42501");
  });

  it("o relatório grande cabe (até 100 KB); depois de 24 horas, o CPF sai com a resposta e fica o mascarado", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const relatorio = await consultar(vendedor, "linha_completa", LINHA, "h:grande");
    const cliente = await consultar(vendedor, "cliente_completo", CPF, "h:cliente");
    const semResposta = await consultar(vendedor, "cliente_completo", CNPJ, "h:falhou");
    expect((await aFazer()).length).toBe(3);
    const grande = { partes: { detalhes: { situacao: "respondida", resposta: { texto: "x".repeat(60_000) } } } };
    expect(await registrar(relatorio, { situacao: "respondida", resposta: grande })).toBe("respondida");
    expect(await comoServico(() => erroDe(() => db.query("select public.connect_worker_registrar_resposta_da_consulta($1, $2::jsonb)",
      [cliente, JSON.stringify({ situacao: "respondida", resposta: { texto: "x".repeat(110_000) } })])))).toBe("22023");
    expect(await registrar(cliente, { situacao: "respondida", resposta: { partes: { cliente: { situacao: "respondida", resposta: { nome: "Cliente Fictício" } } } } })).toBe("respondida");
    expect(await registrar(semResposta, { situacao: "nao_encontrada", mensagem: "Cliente não encontrado" })).toBe("nao_encontrada");
    await db.query("update public.connect_consultas set pedida_em = now() - interval '25 hours', respondida_em = now() - interval '25 hours' where id = any($1::uuid[])",
      [[relatorio, cliente, semResposta]]);
    expect(await limpar()).toEqual({ vencidas: 0, apagadas: 3 });
    expect(await consulta(cliente)).toMatchObject({ parametro: null, resposta: null, parametro_mascarado: `•••.•••.${CPF.slice(6, 9)}-${CPF.slice(9)}` });
    expect(await consulta(semResposta)).toMatchObject({ parametro: null, situacao: "nao_encontrada" });
    // A linha do relatório do número fica (só a resposta sai).
    expect(await consulta(relatorio)).toMatchObject({ parametro: LINHA, resposta: null });
    expect(await limpar()).toEqual({ vencidas: 0, apagadas: 0 });
  });
});

// CONNECT-i (25/11/2026): as consultas que faltavam (as 14 rotas da coleção oficial que o sistema ainda não usava). Quem pede
// cada uma (a loja, a gestão da loja ou a rede), a forma de cada parâmetro e o CPF ou o CNPJ mascarado, que sai em 24 horas.
describe("as outras consultas da Nogle (CONNECT-i)", () => {
  const CPF = cpf("135792468");
  const CNPJ = cnpj("44555666", "0001");

  it("a loja pede as dela; a gestão da loja, a logística e o CPF; a rede, a carteira, os relatórios e as listas", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const daLoja = [["faq_categorias", null], ["faq_perguntas", "6"], ["planos_campanhas", null], ["estados", null], ["validar_cep", "80010-000"],
      ["validar_cnpj", CNPJ], ["compra_rastreio", "12345"], ["titularidade_da_linha", `${LINHA}${CPF}`], ["pagamento_da_solicitacao", "212345"]] as const;
    for (const [tipo, parametro] of daLoja) expect(await consultar(vendedor, tipo, parametro, `i:${tipo}`), tipo).toMatch(/^[0-9a-f-]{36}$/);
    // O vendedor não pede a da gestão nem a da rede.
    for (const [tipo, parametro] of [["logistica", null], ["validar_cpf", CPF], ["carteira_programadas", "30"], ["relatorio_portabilidades", "30"],
      ["lista_de_linhas", "1"], ["lista_de_clientes", "1"], ["carteira_extrato_saidas", "30"], ["carteira_extrato_entradas", "30"]] as const) {
      expect(await erroAoConsultar(vendedor, tipo, parametro, `i:v:${tipo}`), tipo).toBe("42501");
    }
    // O gerente (da loja B) pede a da gestão da loja dele, mas não a da rede.
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await consultar(gerente, "logistica", null, "i:g1")).toMatch(/^[0-9a-f-]{36}$/);
    expect(await consultar(gerente, "validar_cpf", CPF, "i:g2")).toMatch(/^[0-9a-f-]{36}$/);
    expect(await erroAoConsultar(gerente, "relatorio_portabilidades", "30", "i:g3")).toBe("42501");
    expect(await erroAoConsultar(gerente, "lista_de_clientes", "1", "i:g4")).toBe("42501");
    expect(await erroAoConsultar(gerente, "carteira_extrato_saidas", "30", "i:g5")).toBe("42501");
    // O dono pede todas.
    const dono = await naLoja(ids.dono, ids.lojaA);
    for (const [tipo, parametro] of [["carteira_programadas", "30"], ["relatorio_portabilidades", "366"], ["lista_de_linhas", "2"], ["lista_de_clientes", "9999"],
      ["logistica", null], ["faq_categorias", null], ["carteira_extrato_saidas", "366"], ["carteira_extrato_entradas", "1"], ["pagamento_da_solicitacao", "3987"]] as const) {
      expect(await consultar(dono, tipo, parametro, `i:d:${tipo}`), tipo).toMatch(/^[0-9a-f-]{36}$/);
    }
    // O técnico, sem a Ora Connect, nem as dúvidas frequentes.
    expect(await erroAoConsultar(await naLoja(ids.tecnico, ids.assistencia), "faq_categorias", null, "i:t")).toBe("42501");
  });

  it("a forma de cada parâmetro: nada nas sem número, o CEP, o CPF e o CNPJ válidos, a linha com o documento, os dias e a página", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const recusadas = [["faq_categorias", "6"], ["planos_campanhas", LINHA], ["logistica", "1"], ["faq_perguntas", null], ["faq_perguntas", "1234567890"],
      ["validar_cep", "8001000"], ["validar_cpf", `${CPF.slice(0, -1)}${(Number(CPF.slice(-1)) + 1) % 10}`], ["validar_cpf", CNPJ], ["validar_cnpj", CPF],
      ["compra_rastreio", null], ["compra_rastreio", "1234567890123"], ["titularidade_da_linha", LINHA], ["titularidade_da_linha", `5108888777${CPF}`],
      ["titularidade_da_linha", `${LINHA}${CPF.slice(0, -1)}${(Number(CPF.slice(-1)) + 1) % 10}`], ["carteira_programadas", "0"], ["carteira_programadas", "91"],
      ["relatorio_portabilidades", "367"], ["lista_de_linhas", "0"], ["lista_de_clientes", "10000"], ["lista_de_linhas", null],
      ["pagamento_da_solicitacao", "412345"], ["pagamento_da_solicitacao", "2"], ["pagamento_da_solicitacao", null], ["carteira_extrato_saidas", "367"],
      ["carteira_extrato_entradas", "0"]] as const;
    for (const [tipo, parametro] of recusadas) expect(await erroAoConsultar(dono, tipo, parametro, `f:${tipo}:${parametro}`), `${tipo} ${parametro}`).toBe("22023");
    // A titularidade aceita o CNPJ; os dias e a página nos limites passam.
    expect(await consultar(dono, "titularidade_da_linha", `${LINHA}${CNPJ}`, "f:ok1")).toMatch(/^[0-9a-f-]{36}$/);
    expect(await consultar(dono, "carteira_programadas", "90", "f:ok2")).toMatch(/^[0-9a-f-]{36}$/);
    expect(await consultar(dono, "relatorio_portabilidades", "1", "f:ok3")).toMatch(/^[0-9a-f-]{36}$/);
    // A regra da tabela: as sem número não guardam número; as outras guardam.
    expect(await erroDe(() => db.query(
      "insert into public.connect_consultas (organizacao_id, unidade_id, pedida_por, chave, tipo, parametro) values ($1, $2, $3, 'direto', 'estados', '1')",
      [ids.organizacao, ids.lojaA, ids.dono]))).toBe("23514");
    expect(await erroDe(() => db.query(
      "insert into public.connect_consultas (organizacao_id, unidade_id, pedida_por, chave, tipo, parametro) values ($1, $2, $3, 'direto2', 'validar_cep', null)",
      [ids.organizacao, ids.lojaA, ids.dono]))).toBe("23514");
  });

  it("o CPF e o CNPJ ficam mascarados para a tela e saem com a resposta depois de 24 horas; o resto do parâmetro fica", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const titular = await consultar(vendedor, "titularidade_da_linha", `(51) 98888-7777 ${CPF}`, "m1");
    const doCnpj = await consultar(vendedor, "validar_cnpj", CNPJ, "m2");
    const doCep = await consultar(vendedor, "validar_cep", "80010000", "m3");
    const doCpf = await consultar(gerente, "validar_cpf", CPF, "m4");
    const mascaraCpf = `•••.•••.${CPF.slice(6, 9)}-${CPF.slice(9)}`;
    expect(await consulta(titular)).toMatchObject({ parametro: `${LINHA}${CPF}`, parametro_mascarado: `(51) 98888-7777 · ${mascaraCpf}` });
    expect(await consulta(doCnpj)).toMatchObject({ parametro: CNPJ, parametro_mascarado: `••.•••.•••/${CNPJ.slice(8, 12)}-${CNPJ.slice(12)}` });
    expect(await consulta(doCep)).toMatchObject({ parametro: "80010000", parametro_mascarado: null });
    expect(await consulta(doCpf)).toMatchObject({ parametro: CPF, parametro_mascarado: mascaraCpf });
    expect((await aFazer(10)).length).toBe(4);
    for (const id of [titular, doCnpj, doCep, doCpf]) expect(await registrar(id, { situacao: "respondida", resposta: { valido: true } })).toBe("respondida");
    await db.query("update public.connect_consultas set respondida_em = now() - interval '25 hours' where id = any($1::uuid[])", [[titular, doCnpj, doCep, doCpf]]);
    expect(await limpar()).toEqual({ vencidas: 0, apagadas: 4 });
    expect(await consulta(titular)).toMatchObject({ parametro: null, resposta: null, parametro_mascarado: `(51) 98888-7777 · ${mascaraCpf}` });
    expect(await consulta(doCnpj)).toMatchObject({ parametro: null, resposta: null });
    expect(await consulta(doCpf)).toMatchObject({ parametro: null, resposta: null, parametro_mascarado: mascaraCpf });
    // O CEP não é documento de ninguém: fica.
    expect(await consulta(doCep)).toMatchObject({ parametro: "80010000", resposta: null });
  });
});
