// Lote CONNECT-c (ORA-CONNECT-009; a orientação do proprietário de 18/11): a conciliação da produção da Ora Connect com os
// relatórios oficiais da Nogle. As linhas da Nogle aqui seguem os campos do exemplo oficial (a linha, o ICCID, o dia, o
// plano e o valor), já lidas pelo domínio; as operações são FICTÍCIAS, gravadas direto como confirmadas. Cada teste roda
// numa transação desfeita no fim.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let n = 0;
let sessoes = 0;
type Campos = { iccid?: string; linha?: string; numeroAtivado?: string; valor: number; concluida: string; situacao?: string; organizacao?: string; unidade?: string };
async function operacao(tipo: "ativacao" | "recarga", c: Campos): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into public.connect_operacoes (organizacao_id, unidade_id, vendedor_id, tipo, chave, conteudo, situacao, metodo_pagamento, iccid, ddd, linha,
       plano_id, plano_nome, valor_face_centavos, numero_ativado, concluida_em)
     values ($1, $2, $3, $4, $5, 'teste', $6, 'LINK', $7, $8, $9, 99999, '7 GB', $10, $11, $12) returning id`,
    [c.organizacao ?? ids.organizacao, c.unidade ?? ids.lojaA, ids.vendedorA, tipo, `conciliacao:${++n}`, c.situacao ?? "confirmada",
      tipo === "ativacao" ? c.iccid ?? null : null, tipo === "ativacao" ? 51 : null, tipo === "recarga" ? c.linha ?? null : null,
      c.valor, c.numeroAtivado ?? null, c.concluida]);
  const id = r.rows[0]?.id;
  if (!id) throw new Error("operação não gravada");
  return id;
}
type Registro = { id: string; numero: number; totais: Record<string, number> };
const REGISTRAR = "select public.connect_worker_registrar_conciliacao($1, $2, $3, $4, $5::jsonb) as v";
async function registrar(relatorio: string, de: string, ate: string, linhas: object[], organizacao = ids.organizacao): Promise<Registro> {
  await db.exec("set role service_role");
  try {
    const v = (await db.query<{ v: Registro }>(REGISTRAR, [organizacao, relatorio, de, ate, JSON.stringify(linhas)])).rows[0]?.v;
    if (!v) throw new Error("sem resposta");
    return v;
  } finally {
    await db.exec("reset role");
  }
}
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
const comoServico = async (acao: () => Promise<unknown>) => {
  await db.exec("set role service_role");
  try { return await erroDe(acao); } finally { await db.exec("reset role"); }
};
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4c000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const resultados = async (conciliacao: string) => (await db.query<{ ordem: number; resultado: string; operacao_id: string | null }>(
  "select ordem, resultado, operacao_id from public.connect_conciliacao_linhas where conciliacao_id = $1 order by ordem", [conciliacao])).rows;
const soAqui = async (conciliacao: string) => (await db.query<{ operacao_id: string }>(
  "select operacao_id from public.connect_conciliacao_so_aqui where conciliacao_id = $1 order by operacao_id", [conciliacao])).rows.map((r) => r.operacao_id);

const I1 = comDigitoLuhn("895500000000000101");
const I2 = comDigitoLuhn("895500000000000102");
const I3 = comDigitoLuhn("895500000000000103");

describe("a conciliação com os relatórios da Nogle (CONNECT-c; ORA-CONNECT-009)", () => {
  it("ativações: liga pelo ICCID ou pela linha ativada, no mesmo dia ou no vizinho; o valor diferente fica ligado e marcado; o resto fica à parte", async () => {
    const a1 = await operacao("ativacao", { iccid: I1, valor: 4490, concluida: "2026-11-10 13:00:00-03" });
    const a2 = await operacao("ativacao", { iccid: I2, numeroAtivado: "51911112222", valor: 4490, concluida: "2026-11-11 10:00:00-03" });
    const a3 = await operacao("ativacao", { iccid: I3, valor: 4490, concluida: "2026-11-12 09:00:00-03" });
    await operacao("ativacao", { iccid: comDigitoLuhn("895500000000000104"), valor: 4490, concluida: "2026-11-12 09:00:00-03", situacao: "recusada" });
    const r = await registrar("ativacoes", "2026-11-10", "2026-11-12", [
      { ordem: 1, linha: null, iccid: I1, dia: "2026-11-10", plano: "7 GB", valor_centavos: 4490, tipo_linha: "PRÉ PAGO", forma_pagto: "PIX" },
      { ordem: 2, linha: "51911112222", iccid: null, dia: "2026-11-12", plano: "7 GB", valor_centavos: 3990, tipo_linha: null, forma_pagto: null },
      { ordem: 3, linha: "51933334444", iccid: null, dia: "2026-11-10", plano: null, valor_centavos: null, tipo_linha: null, forma_pagto: null },
      { ordem: 4, linha: null, iccid: null, dia: "2026-11-10", plano: null, valor_centavos: 4490, tipo_linha: null, forma_pagto: null },
      // A mesma operação não se liga a duas linhas.
      { ordem: 5, linha: null, iccid: I1, dia: "2026-11-10", plano: "7 GB", valor_centavos: 4490, tipo_linha: null, forma_pagto: null },
    ]);
    expect(r.totais).toEqual({ linhas: 5, conferidas: 1, valor_diferente: 1, so_na_nogle: 2, sem_identificacao: 1, so_aqui: 1 });
    expect(await resultados(r.id)).toEqual([
      { ordem: 1, resultado: "conferida", operacao_id: a1 },
      { ordem: 2, resultado: "valor_diferente", operacao_id: a2 },
      { ordem: 3, resultado: "so_na_nogle", operacao_id: null },
      { ordem: 4, resultado: "sem_identificacao", operacao_id: null },
      { ordem: 5, resultado: "so_na_nogle", operacao_id: null },
    ]);
    expect(await soAqui(r.id)).toEqual([a3]);
    // Nada da operação muda: a conciliação só registra.
    expect((await db.query("select situacao, valor_face_centavos from public.connect_operacoes where id = $1", [a2])).rows).toEqual([{ situacao: "confirmada", valor_face_centavos: 4490 }]);
  });

  it("recargas: pela linha e pelo dia mais perto; a dois dias ou mais, não liga; outra rede nunca liga", async () => {
    const r1 = await operacao("recarga", { linha: "51955556666", valor: 2990, concluida: "2026-11-10 12:00:00-03" });
    const r2 = await operacao("recarga", { linha: "51955556666", valor: 2990, concluida: "2026-11-15 12:00:00-03" });
    await operacao("recarga", { linha: "51977778888", valor: 2990, concluida: "2026-11-11 12:00:00-03", organizacao: ids.outraOrganizacao, unidade: ids.lojaOutraOrg });
    const r = await registrar("recargas", "2026-11-10", "2026-11-15", [
      { ordem: 1, linha: "51955556666", iccid: null, dia: "2026-11-15", plano: "7 GB", valor_centavos: 2990, tipo_linha: null, forma_pagto: null },
      { ordem: 2, linha: "51955556666", iccid: null, dia: "2026-11-12", plano: "7 GB", valor_centavos: 2990, tipo_linha: null, forma_pagto: null },
      { ordem: 3, linha: "51977778888", iccid: null, dia: "2026-11-11", plano: "7 GB", valor_centavos: 2990, tipo_linha: null, forma_pagto: null },
    ]);
    expect(await resultados(r.id)).toEqual([
      { ordem: 1, resultado: "conferida", operacao_id: r2 },
      { ordem: 2, resultado: "so_na_nogle", operacao_id: null },
      { ordem: 3, resultado: "so_na_nogle", operacao_id: null },
    ]);
    expect(await soAqui(r.id)).toEqual([r1]);
  });

  it("só o worker grava; quem gere a Ora Connect na rede lê; o vendedor e outra rede não leem", async () => {
    await operacao("ativacao", { iccid: I1, valor: 4490, concluida: "2026-11-10 13:00:00-03" });
    const r = await registrar("ativacoes", "2026-11-10", "2026-11-10", [{ ordem: 1, linha: null, iccid: I1, dia: "2026-11-10", plano: null, valor_centavos: 4490, tipo_linha: null, forma_pagto: null }]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await comoUsuario(db, dono, () => erroDe(() => db.query(REGISTRAR, [ids.organizacao, "ativacoes", "2026-11-10", "2026-11-10", "[]"])))).toBe("42501");
    const lidas = async (s: Sessao) => comoUsuario(db, s, async () => [
      (await db.query("select id from public.connect_conciliacoes")).rows.length,
      (await db.query("select ordem from public.connect_conciliacao_linhas")).rows.length,
      (await db.query("select operacao_id from public.connect_conciliacao_so_aqui")).rows.length,
    ]);
    expect(await lidas(dono)).toEqual([1, 1, 0]);
    expect(await lidas(await naLoja(ids.vendedorA, ids.lojaA))).toEqual([0, 0, 0]);
    expect(await lidas(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg))).toEqual([0, 0, 0]);
    expect(r.numero).toBeGreaterThan(0);
  });

  it("recusa o relatório desconhecido, o período invertido ou longo, a lista fora do formato e a rede desconhecida; nada fica gravado", async () => {
    const contar = async () => (await db.query<{ n: number }>("select count(*)::int as n from public.connect_conciliacoes")).rows[0]?.n;
    const antes = await contar();
    const linha = [{ ordem: 1, linha: "51955556666", dia: "2026-11-10" }];
    for (const [relatorio, de, ate, linhas, org] of [
      ["transacoes", "2026-11-10", "2026-11-10", linha, ids.organizacao],
      ["recargas", "2026-11-11", "2026-11-10", linha, ids.organizacao],
      ["recargas", "2026-09-01", "2026-11-10", linha, ids.organizacao],
      ["recargas", "2026-11-10", "2026-11-10", { ordem: 1 }, ids.organizacao],
      ["recargas", "2026-11-10", "2026-11-10", [{ ordem: "um" }], ids.organizacao],
      ["recargas", "2026-11-10", "2026-11-10", [{ ordem: 1, dia: "10/11/2026" }], ids.organizacao],
      ["recargas", "2026-11-10", "2026-11-10", linha, "00000000-0000-4000-8000-00000000dead"],
    ] as const) {
      expect(await comoServico(() => db.query(REGISTRAR, [org, relatorio, de, ate, JSON.stringify(linhas)])), `${relatorio} ${de} ${ate}`).toBe("22023");
    }
    expect(await contar()).toBe(antes);
  });
});
