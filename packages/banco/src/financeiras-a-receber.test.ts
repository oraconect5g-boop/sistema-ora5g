// Valores a receber das financeiras (lote L7b: ORA-PAY-003 e ORA-PAY-011, em parte). A venda financiada
// gera a conta a receber da financeira; aqui, o registro manual do repasse (referência, valor que caiu e
// data), o desfazer com motivo e a lista da loja do turno. Banco em memória com todas as migrations;
// dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, reversao, type Sessao } from "./banco-de-teste";
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
const RECEBER = "select public.financeira_registrar_repasse($1::uuid, $2::text, $3::bigint, $4::date, $5::bigint, md5($1::uuid::text || regexp_replace(trim($2::text), '\\s+', ' ', 'g'))::uuid) as v";
const DESFAZER = "select public.financeira_desfazer_recebimento($1, $2) as v";

/** Uma venda de aparelho financiada (entrada de R$ 200,00 em dinheiro) e a conta a receber que ela gera. */
async function financiada(s: Sessao, aparelho: string, meio: "payjoy" | "aiva", valorTotal: number) {
  await valor(s, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]).catch(() => undefined);
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda, cat.aparelho, aparelho, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
    [venda, JSON.stringify([{ meio, valor: valorTotal, entrada: 20_000, meio_entrada: "dinheiro", parcelas: 12 }]), JSON.stringify({ nome: "Cliente Teste", email: "cliente@teste.invalid" }), chave("concluir")]);
  const conta = (await db.query<{ id: string; valor: string }>("select id, valor_centavos::text as valor from public.contas_a_receber where venda_id = $1", [venda])).rows[0];
  return { venda, conta: conta?.id ?? "", valor: Number(conta?.valor) };
}
type Conta = { situacao: string; recebido_em: string | null; recebido: string | null; referencia: string | null; registrado_por: string | null };
const conta = async (id: string) =>
  (await db.query<Conta>("select situacao, recebido_em::text, valor_recebido_centavos::text as recebido, referencia_recebimento as referencia, registrado_por from public.contas_a_receber where id = $1", [id])).rows[0];

describe("financeiras: registrar o repasse do que foi financiado (L7b)", () => {
  it("o dono registra o repasse (a diferença é a taxa); repetir não muda; mudar exige desfazer, com motivo; tudo na auditoria", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const f = await financiada(ana, itens.a1, "payjoy", 149_900);
    expect(f.valor).toBe(129_900);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await valor(dono, RECEBER, [f.conta, "  PJ   lote 2026-11-13 ", 125_000, hoje(), 4_900])).toBe(true);
    expect(await conta(f.conta)).toEqual({ situacao: "recebida", recebido_em: hoje(), recebido: "125000", referencia: "PJ lote 2026-11-13", registrado_por: ids.dono });
    expect(await valor(dono, RECEBER, [f.conta, "PJ lote 2026-11-13", 125_000, hoje(), 4_900])).toBe(false);
    expect(await codigo(dono, RECEBER, [f.conta, "PJ lote 2026-11-13", 126_000, hoje(), 4_900])).toBe("OR030");
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
      expect(await codigo(dono, RECEBER, [f.conta, referencia, recebido, dia, 4_900]), `${referencia} ${recebido} ${dia}`).toBe("22023");
    }
    expect(await valor(dono, RECEBER, [f.conta, "PJ-1", 129_900, hoje(), 0])).toBe(true);
    // Venda cancelada: a conta vira cancelada e não recebe repasse.
    const outra = await financiada(ana, itens.a2, "aiva", 149_900);
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    await valor(dono, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [outra.venda]);
    expect((await conta(outra.conta))?.situacao).toBe("cancelada");
    expect(await codigo(dono, RECEBER, [outra.conta, "AV-1", 100_000, hoje(), 4_900])).toBe("22023");
  });

  it("quem concilia na loja da venda: dono e gerente da loja; vendedor e gerente de outra loja não encontram a conta", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const daLojaA = await financiada(ana, itens.a1, "payjoy", 149_900);
    expect(await codigo(ana, RECEBER, [daLojaA.conta, "PJ-1", 100_000, hoje(), 4_900])).toBe("P0002");
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await codigo(gerenteB, RECEBER, [daLojaA.conta, "PJ-1", 100_000, hoje(), 4_900])).toBe("P0002");
    expect(await codigo(gerenteB, DESFAZER, [daLojaA.conta, "Tentativa"])).toBe("P0002");
    const bia = await naLoja(ids.vendedorAB, ids.lojaB);
    const daLojaB = await financiada(bia, itens.b1, "aiva", 139_900);
    expect(await valor(gerenteB, RECEBER, [daLojaB.conta, "AV-7", 115_000, hoje(), 4_900])).toBe(true);
  });

  it("a lista da loja do turno: as abertas e as recebidas, com os dias desde a venda e os totais por financeira; outra loja não aparece", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const payjoy = await financiada(ana, itens.a1, "payjoy", 149_900);
    const aiva = await financiada(ana, itens.a2, "aiva", 149_900);
    const bia = await naLoja(ids.vendedorAB, ids.lojaB);
    await financiada(bia, itens.b1, "aiva", 139_900);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, RECEBER, [payjoy.conta, "PJ-1", 125_000, hoje(), 4_900]);
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

// Correção de 14/11/2026 (#83, REV-PLAN-002, migration 20261114145505_financeiras_correcoes): desfazer o repasse
// de venda cancelada não reabre crédito. Aqui o resultado seguro, não a reprodução do defeito; a disputa
// real das duas transações está em concorrencia.test.ts.
describe("financeiras: venda cancelada não volta a dever (#83)", () => {
  const CORRIGIR = "select public.financeira_corrigir_recebimento($1, $2, $3, $4::date, $5) as v";
  const cancelar = async (dono: Sessao, venda: string) => {
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]).catch(() => undefined);
    expect(await valor(dono, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [venda])).toBe(true);
  };
  const daLista = async (s: Sessao, id: string) =>
    (await valor<{ contas: { id: string; situacao: string; venda_cancelada: boolean; referencia: string | null }[] }>(s, "select public.financeiras_a_receber() as v")).contas.find((c) => c.id === id);

  it("repasse registrado, venda cancelada e repasse desfeito: a conta fica cancelada e não recebe de novo; a correção mantém o recebido", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const f = await financiada(ana, itens.a1, "payjoy", 149_900);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await valor(dono, RECEBER, [f.conta, "PJ-REPASSE-1", 125_000, hoje(), 4_900])).toBe(true);
    await cancelar(dono, f.venda);
    // A financeira pagou antes do cancelamento: a conta continua recebida e a lista diz que a venda foi cancelada.
    expect((await conta(f.conta))?.situacao).toBe("recebida");
    expect(await daLista(dono, f.conta)).toMatchObject({ situacao: "recebida", venda_cancelada: true, referencia: "PJ-REPASSE-1" });
    // O dinheiro caiu, só a referência estava errada: corrige sem passar por "aberta".
    expect(await codigo(dono, CORRIGIR, [f.conta, "PJ-REPASSE-1-CORRETO", 125_000, hoje(), "ok"])).toBe("22023");
    expect(await valor(dono, CORRIGIR, [f.conta, "PJ-REPASSE-1-CORRETO", 125_000, hoje(), "Referência digitada errada"])).toBe(true);
    expect(await conta(f.conta)).toEqual({ situacao: "recebida", recebido_em: hoje(), recebido: "125000", referencia: "PJ-REPASSE-1-CORRETO", registrado_por: ids.dono });
    expect(await valor(dono, CORRIGIR, [f.conta, "PJ-REPASSE-1-CORRETO", 125_000, hoje(), "De novo"])).toBe(false);
    for (const [referencia, recebido, dia] of [["PJ-2", 129_901, hoje()], ["PJ-2", 100_000, somarDias(hoje(), 1)], ["ab", 100_000, hoje()]] as const) {
      expect(await codigo(dono, CORRIGIR, [f.conta, referencia, recebido, dia, "Corrigindo"]), `${referencia} ${recebido} ${dia}`).toBe("22023");
    }
    // Desfazer: o repasse não existiu. A conta fica cancelada (nunca "aberta" numa venda cancelada) e não recebe outro.
    expect(await valor(dono, DESFAZER, [f.conta, "Repasse lançado na venda errada"])).toBe(true);
    expect(await conta(f.conta)).toEqual({ situacao: "cancelada", recebido_em: null, recebido: null, referencia: null, registrado_por: null });
    expect(await codigo(dono, RECEBER, [f.conta, "PJ-REPASSE-2", 124_000, hoje(), 4_900])).toBe("22023");
    expect(await codigo(dono, CORRIGIR, [f.conta, "PJ-REPASSE-2", 124_000, hoje(), "Corrigindo"])).toBe("22023");
    expect(await valor(dono, DESFAZER, [f.conta, "De novo"])).toBe(false);
    expect(await daLista(dono, f.conta)).toBeUndefined(); // cancelada sai da lista do que se tem a receber
    const motivos = (await db.query<{ motivo: string }>("select motivo from public.auditoria where alvo_id = $1 order by id", [f.conta])).rows.map((r) => r.motivo);
    expect(motivos).toEqual(expect.arrayContaining([
      "Repasse da financeira: PJ-REPASSE-1", "Recebimento da financeira corrigido: Referência digitada errada",
      "Recebimento da financeira desfeito: Repasse lançado na venda errada (venda cancelada: a conta fica cancelada)",
    ]));
  });

  it("venda não cancelada: desfazer volta para aberta, como antes; conta aberta de venda cancelada (estado antigo) não recebe", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const f = await financiada(ana, itens.a1, "payjoy", 149_900);
    expect(await valor(dono, RECEBER, [f.conta, "PJ-3", 125_000, hoje(), 4_900])).toBe(true);
    expect(await valor(dono, DESFAZER, [f.conta, "Valor digitado errado"])).toBe(true);
    expect((await conta(f.conta))?.situacao).toBe("aberta");
    expect(await codigo(dono, CORRIGIR, [f.conta, "PJ-3", 125_000, hoje(), "Corrigindo"])).toBe("22023"); // só se corrige o registrado
    // O estado que o desfazer antigo deixava: venda cancelada e conta aberta. O repasse é recusado pelo estado da venda.
    const outra = await financiada(ana, itens.a2, "aiva", 149_900);
    await cancelar(dono, outra.venda);
    await db.query("select set_config('ora.motivo', 'Estado deixado pelo desfazer antigo (teste)', true)");
    await db.query("update public.contas_a_receber set situacao = 'aberta' where id = $1", [outra.conta]);
    expect(await codigo(dono, RECEBER, [outra.conta, "AV-REPASSE", 100_000, hoje(), 4_900])).toBe("22023");
    expect((await conta(outra.conta))?.situacao).toBe("aberta");
  });

  it("quem não concilia na loja da venda não corrige o repasse", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const f = await financiada(ana, itens.a1, "payjoy", 149_900);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await valor(dono, RECEBER, [f.conta, "PJ-4", 125_000, hoje(), 4_900])).toBe(true);
    for (const s of [ana, await naLoja(ids.gerenteB, ids.lojaB)]) {
      expect(await codigo(s, CORRIGIR, [f.conta, "PJ-4-X", 125_000, hoje(), "Tentativa"])).toBe("P0002");
    }
    expect((await conta(f.conta))?.referencia).toBe("PJ-4");
  });
});

describe("repasse parcial explícito, tarifa comprovada e saldo remanescente", () => {
  const REGISTRAR = "select public.financeira_registrar_repasse($1, $2, $3, $4, $5, $6) as v";
  const LEGADO = "select public.financeira_receber($1, $2, $3, $4) as v";
  const DESFAZER_PARCIAL = "select public.financeira_desfazer_repasse_parcial($1, $2, $3) as v";
  const ch = (n: number) => `0b000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const cents = (v: unknown) => Number(v);
  async function leitura(dono: Sessao, id: string) {
    const dados = await valor<{ contas: { id: string; saldo: number; parcial: number; final_id: string | null; repasses_parciais: { id: string; valor: number }[] }[] }>(dono, "select public.financeiras_a_receber() as v");
    return dados.contas.find((c) => c.id === id);
  }
  async function lerRelatorios(dono: Sessao) {
    const previsao = await valor<{ financeiras: { valor: number; no_periodo: { valor: number }; sem_prazo: { valor: number } } }>(dono, "select public.previsao_de_caixa(8, $1) as v", [ids.lojaA]);
    const resultado = await valor<{ linhas: { financeiras_a_receber_valor: number; taxas_financeiras: number } }>(dono,
      "select public.resultado_do_mes(date_trunc('month',$1::date)::date, $2) as v", [hoje(), ids.lojaA]);
    const recebiveis = await valor<{ linhas: { adquirente: string; valor_a_receber: number; recebido_bruto: number; recebido_liquido: number }[]; pendencias: { financeira_de_venda_cancelada: { valor: number } } }>(dono,
      "select public.recebiveis_painel($1, 30) as v", [ids.lojaA]);
    return { previsao, resultado, recebiveis };
  }

  it.each(["payjoy", "aiva"] as const)("lê parciais de %s no extrato e na previsão, confirma apenas a taxa explícita no final e desfaz sem duplicar", async (financeira) => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const f = await financiada(ana, itens.a1, financeira, 149_900);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, "select public.prazo_de_repasse_definir($1, 7, 'Prazo fictício') as v", [financeira]);
    const parcial = [f.conta, "EXTRATO-P1", 40_000, hoje(), null, ch(1)];
    expect(await codigo(dono, LEGADO, [f.conta, "CONTRATO-ANTIGO", 40_000, hoje()])).toBe("22023");
    expect(await codigo(dono, REGISTRAR, [f.conta, "EXTRATO-ZERO", 0, hoje(), null, ch(5)])).toBe("22023");
    expect(await codigo(ana, REGISTRAR, parcial)).toBe("P0002");
    expect(await valor(dono, REGISTRAR, parcial)).toBe(true);
    expect(await valor(dono, REGISTRAR, parcial)).toBe(false);
    expect(await codigo(dono, REGISTRAR, [...parcial.slice(0, -1), ch(9)])).toBe("OR030");
    expect(await codigo(dono, REGISTRAR, [f.conta, "EXTRATO-P1", 41_000, hoje(), null, ch(1)])).toBe("OR030");
    const parcial2 = [f.conta, "EXTRATO-P2", 20_000, hoje(), null, ch(2)];
    expect(await valor(dono, REGISTRAR, parcial2)).toBe(true);
    let c = await leitura(dono, f.conta);
    expect(c).toMatchObject({ saldo: 69_900, parcial: 60_000, situacao: "aberta", final_registrado: false });
    expect(c?.repasses_parciais.map((r) => cents(r.valor)).sort()).toEqual([20_000, 40_000]);
    let r = await lerRelatorios(dono);
    expect(r.previsao.financeiras.no_periodo).toMatchObject({ valor: 69_900 });
    expect(r.resultado.linhas).toMatchObject({ financeiras_a_receber_valor: 69_900, taxas_financeiras: 0 });
    expect(r.recebiveis.linhas.find((l) => l.adquirente === financeira)).toMatchObject({ valor_a_receber: 69_900, recebido_bruto: 60_000, recebido_liquido: 60_000 });
    expect(await codigo(dono, REGISTRAR, [f.conta, "EXTRATO-FINAL", 69_900, hoje(), null, ch(3)])).toBe("22023");
    expect(await codigo(dono, REGISTRAR, [f.conta, "EXTRATO-FINAL", 65_000, hoje(), 0, ch(3)])).toBe("22023");
    const final = [f.conta, "EXTRATO-FINAL", 65_000, hoje(), 4_900, ch(3)];
    expect(await valor(dono, REGISTRAR, final)).toBe(true);
    expect(await valor(dono, REGISTRAR, final)).toBe(false);
    c = await leitura(dono, f.conta);
    expect(c).toMatchObject({ saldo: 0, parcial: 60_000, situacao: "recebida", valor_recebido: 125_000, final_registrado: true });
    r = await lerRelatorios(dono);
    expect(r.previsao.financeiras).toMatchObject({ valor: 0 });
    expect(r.resultado.linhas).toMatchObject({ financeiras_a_receber_valor: 0, taxas_financeiras: 4_900 });
    expect(r.recebiveis.linhas.find((l) => l.adquirente === financeira)).toMatchObject({ valor_a_receber: 0, recebido_bruto: 129_900, recebido_liquido: 125_000 });
    const id = c?.repasses_parciais.find((i) => i.valor === 20_000)?.id;
    const desfazer = [f.conta, id, "Registro atribuído à conta errada"];
    expect(await codigo(dono, DESFAZER_PARCIAL, desfazer)).toBe("OR030");
    const desfazerFinal = "select public.financeira_desfazer_repasse_final($1, $2, $3) as v";
    const anterior = [f.conta, c?.final_id, "Registro final digitado incorretamente"];
    expect(await valor(dono, desfazerFinal, anterior)).toBe(true);
    expect(await valor(dono, REGISTRAR, final)).toBe(false);
    expect(await valor(dono, REGISTRAR, [f.conta, "EXTRATO-FINAL-2", 65_000, hoje(), 4_900, ch(4)])).toBe(true);
    expect(await valor(dono, desfazerFinal, anterior)).toBe(false);
    expect((await conta(f.conta))?.situacao).toBe("recebida");
    const atual = await leitura(dono, f.conta);
    expect(await valor(dono, desfazerFinal, [f.conta, atual?.final_id, "Registro final atribuído à venda errada"])).toBe(true);
    expect(await valor(dono, DESFAZER_PARCIAL, desfazer)).toBe(true);
    expect(await valor(dono, DESFAZER_PARCIAL, desfazer)).toBe(false);
    expect(await valor(dono, REGISTRAR, parcial2)).toBe(false);
    expect(await leitura(dono, f.conta)).toMatchObject({ saldo: 89_900, parcial: 40_000, situacao: "aberta" });
    expect((await lerRelatorios(dono)).resultado.linhas).toMatchObject({ financeiras_a_receber_valor: 89_900, taxas_financeiras: 0 });
    const auditado = await db.query("select motivo from public.auditoria where alvo_id = $1 and alvo_tipo = 'repasses_das_financeiras' order by id", [id]);
    expect(auditado.rows).toEqual([{ motivo: "Repasse parcial da financeira: EXTRATO-P2" }, { motivo: "Repasse parcial desfeito: Registro atribuído à conta errada" }]);
  });

  it("a reversão vazia remove o formato novo; com dados, recusa e preserva a trilha", async () => {
    const desfazerMigration = reversao("20261126223000_repasses_parciais_das_financeiras.sql");
    await db.exec("savepoint vazia");
    await db.exec(desfazerMigration);
    expect((await db.query("select to_regclass('privado.repasses_das_financeiras') as tabela")).rows).toEqual([{ tabela: null }]);
    await db.exec("rollback to savepoint vazia");
    await db.exec("release savepoint vazia");
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const f = await financiada(ana, itens.a1, "payjoy", 149_900);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await valor(dono, REGISTRAR, [f.conta, "EXTRATO-ROLLBACK", 40_000, hoje(), null, ch(20)])).toBe(true);
    await db.exec("savepoint com_dados");
    await expect(db.exec(desfazerMigration)).rejects.toThrow("Há histórico de repasses neste formato");
    await db.exec("rollback to savepoint com_dados");
    await db.exec("release savepoint com_dados");
    expect(await leitura(dono, f.conta)).toMatchObject({ saldo: 89_900, parcial: 40_000 });
  });

  it("cancelar uma venda com parcial preserva dinheiro registrado e nunca reabre a cobrança", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const f = await financiada(ana, itens.a1, "payjoy", 149_900);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const p = [f.conta, "EXTRATO-P1", 40_000, hoje(), null, ch(10)];
    expect(await valor(dono, REGISTRAR, p)).toBe(true);
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    await valor(dono, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [f.venda]);
    const c = await leitura(dono, f.conta);
    expect(c).toMatchObject({ saldo: 0, parcial: 40_000, situacao: "cancelada", venda_cancelada: true });
    expect((await lerRelatorios(dono)).recebiveis.pendencias.financeira_de_venda_cancelada).toMatchObject({ valor: 40_000 });
    expect(await valor(dono, REGISTRAR, p)).toBe(false);
    expect(await codigo(dono, REGISTRAR, [f.conta, "EXTRATO-P2", 40_000, hoje(), null, ch(11)])).toBe("22023");
    expect(await valor(dono, DESFAZER_PARCIAL, [f.conta, c?.repasses_parciais[0]?.id, "Extrato pertencia a outro contrato"])).toBe(true);
    expect((await conta(f.conta))?.situacao).toBe("cancelada");
    expect(await leitura(dono, f.conta)).toBeUndefined();
  });
});
