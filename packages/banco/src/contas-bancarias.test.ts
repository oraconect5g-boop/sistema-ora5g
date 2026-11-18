// Lote CONTAS-a (18/11/2026; ORA-FIN-006, a parte multiempresa; migration das contas bancárias): a conta de cada
// empresa, o extrato do banco ligado a ela e o saldo pelo extrato. Dados FICTÍCIOS (bancos, contas e valores inventados
// aqui); cada teste numa transação desfeita.
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
let arquivos = 0;
const impressao = () => `c${String(++arquivos).padStart(63, "0")}`;
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
  const s = { usuario, sessao: `4c000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const linhas = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows, { criarSessao: false });
const recusa = (s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });

const CRIAR = "select public.conta_bancaria_criar($1, $2, $3, $4, $5, $6, $7::date) as v";
const ATUALIZAR = "select public.conta_bancaria_atualizar($1, $2, $3, $4, $5, $6, $7::date, $8, $9) as v";
const LIGAR = "select public.extrato_da_conta($1, $2, $3) as v";
const SALDOS = "select * from public.contas_bancarias_saldos()";
const IMPORTAR = "select public.extrato_importar(null, $1, 'Banco Fictício', array['pix_direto']::text[], 'extrato.ofx', $2, $3::jsonb, '{\"data\": 0}'::jsonb) as v";
type Saldo = { apelido: string; empresa: string; extratos: number; entradas_centavos: number; saldo_centavos: number; saidas_centavos: number; saldo_em: string; ativa: boolean };
const extrato = async (s: Sessao, l: { numero: number; data: string; valor: number }[], tipo = "banco") =>
  (await valor<{ extrato: string }>(s, IMPORTAR, [tipo, impressao(), JSON.stringify(l)])).extrato;
const saldos = async (s: Sessao) => (await linhas<Saldo>(s, SALDOS)).map((x) => ({ ...x, extratos: Number(x.extratos), entradas_centavos: Number(x.entradas_centavos), saidas_centavos: Number(x.saidas_centavos), saldo_centavos: Number(x.saldo_centavos),
  saldo_em: new Date(x.saldo_em as unknown as string).toISOString().slice(0, 10) }));

describe("a conta bancária de cada empresa (CONTAS-a)", () => {
  it("quem concilia pela rede cadastra a conta da empresa; o gerente da loja e a outra rede, não", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const conta = await valor<string>(dono, CRIAR, [ids.empresa, "  Itaú   principal ", "Itaú", "0001", "12345-6", 1_000_000, "2026-11-01"]);
    expect(await saldos(dono)).toMatchObject([{ apelido: "Itaú principal", ativa: true, extratos: 0, saldo_centavos: 1_000_000, saldo_em: "2026-11-01" }]);
    expect(typeof conta).toBe("string");
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await recusa(gerente, CRIAR, [ids.empresa, "Outra", "Banco", null, null, 0, "2026-11-01"])).toBe("42501");
    expect(await linhas(gerente, "select id from public.contas_bancarias")).toEqual([]);
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await recusa(outraRede, CRIAR, [ids.empresa, "Intrusa", "Banco", null, null, 0, "2026-11-01"])).toBe("42501");
    expect(await linhas(outraRede, "select id from public.contas_bancarias")).toEqual([]);
  });

  it("confere o que se digita: apelido repetido, agência e conta fora do formato, saldo de amanhã", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, CRIAR, [ids.empresa, "Caixa", "Caixa Econômica", null, null, 0, "2026-11-01"]);
    expect(await recusa(dono, CRIAR, [ids.empresa, "Caixa", "Outro banco", null, null, 0, "2026-11-01"])).toBe("23505");
    expect(await recusa(dono, CRIAR, [ids.empresa, "Bradesco", "Bradesco", "12a", null, 0, "2026-11-01"])).toBe("22023");
    expect(await recusa(dono, CRIAR, [ids.empresa, "Bradesco", "Bradesco", null, "12.345", 0, "2026-11-01"])).toBe("22023");
    expect(await recusa(dono, CRIAR, [ids.empresa, "B", "Bradesco", null, null, 0, "2026-11-01"])).toBe("22023");
    expect(await recusa(dono, CRIAR, [ids.empresa, "Bradesco", "Bradesco", null, null, 0, "2999-01-01"])).toBe("22023");
  });

  it("o saldo é o inicial mais as linhas dos extratos ligados depois da data dele; a linha de antes não conta duas vezes", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const conta = await valor<string>(dono, CRIAR, [ids.empresa, "Itaú", "Itaú", null, null, 500_000, "2026-11-02"]);
    const novembro = await extrato(dono, [
      { numero: 1, data: "2026-11-02", valor: 999_999 },   // já está no saldo inicial (o saldo é do fim do dia 2)
      { numero: 2, data: "2026-11-03", valor: 120_000 },
      { numero: 3, data: "2026-11-05", valor: -45_000 },
      { numero: 4, data: "2026-11-06", valor: 30_000 },
    ]);
    expect(await valor<boolean>(dono, LIGAR, [novembro, conta, null])).toBe(true);
    expect(await valor<boolean>(dono, LIGAR, [novembro, conta, null])).toBe(false);
    expect(await saldos(dono)).toMatchObject([{ extratos: 1, entradas_centavos: 150_000, saidas_centavos: 45_000, saldo_centavos: 605_000, saldo_em: "2026-11-06" }]);

    // O extrato seguinte, sem cruzar, soma; o que cruza o período de outro é recusado (OR044).
    const seguinte = await extrato(dono, [{ numero: 1, data: "2026-11-07", valor: -5_000 }, { numero: 2, data: "2026-11-09", valor: 10_000 }]);
    await valor(dono, LIGAR, [seguinte, conta, null]);
    const cruzado = await extrato(dono, [{ numero: 1, data: "2026-11-06", valor: 30_000 }, { numero: 2, data: "2026-11-08", valor: 1 }]);
    expect(await recusa(dono, LIGAR, [cruzado, conta, null])).toBe("OR044");
    expect(await saldos(dono)).toMatchObject([{ extratos: 2, saldo_centavos: 610_000, saldo_em: "2026-11-09" }]);
  });

  it("só o extrato do banco vai para a conta; tirar ou trocar pede o motivo; conta inativa não recebe extrato", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const itau = await valor<string>(dono, CRIAR, [ids.empresa, "Itaú", "Itaú", null, null, 0, "2026-11-01"]);
    const caixa = await valor<string>(dono, CRIAR, [ids.empresa, "Caixa", "Caixa", null, null, 0, "2026-11-01"]);
    const daMaquininha = await extrato(dono, [{ numero: 1, data: "2026-11-03", valor: 100 }], "maquininha");
    expect(await recusa(dono, LIGAR, [daMaquininha, itau, null])).toBe("22023");
    const doBanco = await extrato(dono, [{ numero: 1, data: "2026-11-03", valor: 100 }]);
    await valor(dono, LIGAR, [doBanco, itau, null]);
    expect(await recusa(dono, LIGAR, [doBanco, caixa, null])).toBe("22023");
    expect(await recusa(dono, LIGAR, [doBanco, null, "  "])).toBe("22023");
    expect(await valor<boolean>(dono, LIGAR, [doBanco, caixa, "Era da conta da Caixa"])).toBe(true);
    expect((await saldos(dono)).map((s) => [s.apelido, s.saldo_centavos])).toEqual([["Caixa", 100], ["Itaú", 0]]);

    // A conta inativa fica no histórico e não recebe extrato novo.
    expect(await valor<boolean>(dono, ATUALIZAR, [itau, "Itaú", "Itaú", null, null, 0, "2026-11-01", false, "Conta encerrada"])).toBe(true);
    const outro = await extrato(dono, [{ numero: 1, data: "2026-11-10", valor: 5 }]);
    expect(await recusa(dono, LIGAR, [outro, itau, null])).toBe("22023");
    // O gerente da loja não liga extrato da rede.
    expect(await recusa(await naLoja(ids.gerenteB, ids.lojaB), LIGAR, [outro, caixa, null])).toBe("42501");
  });

  it("mudar a conta pede o motivo e fica na auditoria; o mesmo de novo não muda nada", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const conta = await valor<string>(dono, CRIAR, [ids.empresa, "Itaú", "Itaú", null, null, 0, "2026-11-01"]);
    expect(await recusa(dono, ATUALIZAR, [conta, "Itaú", "Itaú", "0001", null, 0, "2026-11-01", true, null])).toBe("22023");
    expect(await valor<boolean>(dono, ATUALIZAR, [conta, "Itaú", "Itaú", "0001", null, 250_000, "2026-11-01", true, "Saldo inicial conferido no banco"])).toBe(true);
    expect(await valor<boolean>(dono, ATUALIZAR, [conta, "Itaú", "Itaú", "0001", null, 250_000, "2026-11-01", true, "De novo"])).toBe(false);
    const auditoria = await db.query<{ acao: string; motivo: string | null }>(
      "select acao, motivo from public.auditoria where alvo_id = $1 order by id", [conta]);
    expect(auditoria.rows.map((r) => r.acao)).toEqual(["contas_bancarias.criado", "contas_bancarias.alterado"]);
    expect(auditoria.rows[1]?.motivo).toBe("Saldo inicial conferido no banco");
  });
});
