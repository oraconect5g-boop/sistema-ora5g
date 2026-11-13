// Valores a receber das financeiras (lote L7b: ORA-PAY-003 e ORA-PAY-011, em parte). A venda financiada
// gera a conta a receber da financeira; aqui, o registro manual do repasse (referência, valor que caiu e
// data), o desfazer com motivo e a lista da loja do turno. Banco em memória com todas as migrations;
// dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

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
let chaves = 0;
const chave = (prefixo = "l7b") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `78000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string }> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return { v };
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      return { codigo: (e as { code?: string }).code ?? "sem-codigo" };
    }
  });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.codigo}`);
  return r.v;
}
const codigo = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somarDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const RECEBER = "select public.financeira_receber($1, $2, $3, $4::date) as v";
const DESFAZER = "select public.financeira_desfazer_recebimento($1, $2) as v";

/** Uma venda de aparelho financiada (entrada de R$ 200,00 em dinheiro) e a conta a receber que ela gera. */
async function financiada(s: Sessao, aparelho: string, meio: "payjoy" | "aiva", valorTotal: number) {
  await valor(s, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]).catch(() => undefined);
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda, cat.aparelho, aparelho, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
    [venda, JSON.stringify([{ meio, valor: valorTotal, entrada: 20_000, meio_entrada: "dinheiro" }]), JSON.stringify({ nome: "Cliente Teste", email: "cliente@teste.invalid" }), chave("concluir")]);
  const conta = (await db.query<{ id: string; valor: string }>("select id, valor_centavos::text as valor from public.contas_a_receber where venda_id = $1", [venda])).rows[0];
  return { venda, conta: conta?.id ?? "", valor: Number(conta?.valor) };
}
const conta = async (id: string) =>
  (await db.query("select situacao, recebido_em::text, valor_recebido_centavos::text as recebido, referencia_recebimento as referencia, registrado_por from public.contas_a_receber where id = $1", [id])).rows[0];

describe("financeiras: registrar o repasse do que foi financiado (L7b)", () => {
  it("o dono registra o repasse (a diferença é a taxa); repetir não muda; mudar exige desfazer, com motivo; tudo na auditoria", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const f = await financiada(ana, itens.a1, "payjoy", 149_900);
    expect(f.valor).toBe(129_900);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await valor(dono, RECEBER, [f.conta, "  PJ   lote 2026-11-13 ", 125_000, hoje()])).toBe(true);
    expect(await conta(f.conta)).toEqual({ situacao: "recebida", recebido_em: hoje(), recebido: "125000", referencia: "PJ lote 2026-11-13", registrado_por: ids.dono });
    expect(await valor(dono, RECEBER, [f.conta, "PJ lote 2026-11-13", 125_000, hoje()])).toBe(false);
    expect(await codigo(dono, RECEBER, [f.conta, "PJ lote 2026-11-13", 126_000, hoje()])).toBe("OR030");
    expect(await codigo(dono, DESFAZER, [f.conta, "ok"])).toBe("22023");
    expect(await valor(dono, DESFAZER, [f.conta, "Valor digitado errado"])).toBe(true);
    expect(await conta(f.conta)).toEqual({ situacao: "aberta", recebido_em: null, recebido: null, referencia: null, registrado_por: null });
    expect(await valor(dono, DESFAZER, [f.conta, "De novo"])).toBe(false);
    const motivos = (await db.query<{ motivo: string }>("select motivo from public.auditoria where alvo_id = $1 order by id", [f.conta])).rows.map((r) => r.motivo);
    expect(motivos.slice(-2)).toEqual(["Repasse da financeira: PJ lote 2026-11-13", "Recebimento da financeira desfeito: Valor digitado errado"]);
  });

  it("valor até o que se tem a receber, data da venda até hoje, referência obrigatória; conta cancelada com a venda não recebe", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const f = await financiada(ana, itens.a1, "payjoy", 149_900);
    const dono = await naLoja(ids.dono, ids.lojaA);
    for (const [referencia, recebido, dia] of [
      ["PJ-1", 129_901, hoje()], ["PJ-1", -1, hoje()], ["PJ-1", 100_000, somarDias(hoje(), 1)], ["PJ-1", 100_000, somarDias(hoje(), -1)], ["ab", 100_000, hoje()],
    ] as const) {
      expect(await codigo(dono, RECEBER, [f.conta, referencia, recebido, dia]), `${referencia} ${recebido} ${dia}`).toBe("22023");
    }
    expect(await valor(dono, RECEBER, [f.conta, "PJ-1", 129_900, hoje()])).toBe(true);
    // Venda cancelada: a conta vira cancelada e não recebe repasse.
    const outra = await financiada(ana, itens.a2, "aiva", 149_900);
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    await valor(dono, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [outra.venda]);
    expect((await conta(outra.conta))?.situacao).toBe("cancelada");
    expect(await codigo(dono, RECEBER, [outra.conta, "AV-1", 100_000, hoje()])).toBe("22023");
  });

  it("quem concilia na loja da venda: dono e gerente da loja; vendedor e gerente de outra loja não encontram a conta", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const daLojaA = await financiada(ana, itens.a1, "payjoy", 149_900);
    expect(await codigo(ana, RECEBER, [daLojaA.conta, "PJ-1", 100_000, hoje()])).toBe("P0002");
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await codigo(gerenteB, RECEBER, [daLojaA.conta, "PJ-1", 100_000, hoje()])).toBe("P0002");
    expect(await codigo(gerenteB, DESFAZER, [daLojaA.conta, "Tentativa"])).toBe("P0002");
    const bia = await naLoja(ids.vendedorAB, ids.lojaB);
    const daLojaB = await financiada(bia, itens.b1, "aiva", 139_900);
    expect(await valor(gerenteB, RECEBER, [daLojaB.conta, "AV-7", 115_000, hoje()])).toBe(true);
  });

  it("a lista da loja do turno: as abertas e as recebidas, com os dias desde a venda e os totais por financeira; outra loja não aparece", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const payjoy = await financiada(ana, itens.a1, "payjoy", 149_900);
    const aiva = await financiada(ana, itens.a2, "aiva", 149_900);
    const bia = await naLoja(ids.vendedorAB, ids.lojaB);
    await financiada(bia, itens.b1, "aiva", 139_900);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, RECEBER, [payjoy.conta, "PJ-1", 125_000, hoje()]);
    type Lista = { por_devedor: Record<string, unknown>[]; contas: Record<string, unknown>[] };
    const lista = JSON.parse(JSON.stringify(await valor<Lista>(dono, "select public.financeiras_a_receber() as v")), (_, x: unknown) => (typeof x === "string" && /^-?\d+$/.test(x) ? Number(x) : x)) as Lista;
    expect(lista.por_devedor).toEqual([
      { devedor: "aiva", abertas: 1, valor_aberto: 129_900, mais_antiga_dias: 0, recebidas: 0, valor_recebido: 0, taxa_observada: 0 },
      { devedor: "payjoy", abertas: 0, valor_aberto: 0, mais_antiga_dias: null, recebidas: 1, valor_recebido: 125_000, taxa_observada: 4_900 },
    ]);
    expect(lista.contas.map((c) => [c.id, c.devedor, c.situacao, c.valor, c.dias, c.valor_recebido, c.referencia])).toEqual([
      [aiva.conta, "aiva", "aberta", 129_900, 0, null, null], [payjoy.conta, "payjoy", "recebida", 129_900, 0, 125_000, "PJ-1"],
    ]);
    expect(await codigo(ana, "select public.financeiras_a_receber() as v")).toBe("42501");
  });
});
