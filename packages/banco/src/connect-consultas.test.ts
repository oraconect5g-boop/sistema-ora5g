// Lote CONNECT-g (25/11/2026; ORA-CONNECT-007 e ORA-CONNECT-009): as consultas da Nogle que só leem, pedidas na tela e feitas
// pelo worker. Quem pode pedir, o clique repetido, o limite por hora, quem vê (só quem pediu) e o ciclo no worker (pegar a
// fila uma vez, gravar a resposta, vencer o que parou e apagar a resposta depois de 24 horas). LINHAS e ICCIDs FICTÍCIOS.
// Cada teste roda numa transação desfeita no fim.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
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
  "select tipo, parametro, situacao, unidade_id, pedida_por, resposta, mensagem, resposta_apagada_em from public.connect_consultas where id = $1",
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
