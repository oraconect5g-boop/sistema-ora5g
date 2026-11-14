// Recebíveis por loja e adquirente (lote L8e: ORA-FIN-005). O que as maquininhas, o Pix direto e as financeiras
// ainda devem a cada loja (com a idade desde a venda), o que caiu na conta na janela (com a diferença observada no
// extrato) e as pendências do financeiro. Banco em memória com todas as migrations; dados FICTÍCIOS. Cada teste
// numa transação desfeita.
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
const chave = (prefixo = "l8e") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `78e00000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string; mensagem: string }> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return { v };
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      return { codigo: (e as { code?: string }).code ?? "sem-codigo", mensagem: (e as Error).message };
    }
  });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const codigo = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somarDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const PAINEL = "select public.recebiveis_painel($1, $2) as v";
const TERMINAL = "select public.terminal_salvar(null, $1, $2, $3, $4, null, 'Cadastro do teste') as v";
const CONCILIAR = "select public.pagamento_conciliar($1, $2, $3, $4::date) as v";
const RECEBER = "select public.financeira_receber($1, $2, $3, $4::date) as v";

/** Venda de uma capa (R$ 79,00) paga num meio só. */
async function capa(s: Sessao, meio: string, extra: object = {}) {
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v",
    [venda, JSON.stringify([{ meio, valor: 7_900, ...(meio === "dinheiro" ? {} : { comprovante: chave("nsu") }), ...extra }]), chave("concluir")]);
  const pagamento = (await db.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1", [venda])).rows[0]?.id ?? "";
  return { venda, pagamento };
}
/** Venda de aparelho financiada (R$ 1.499,00, entrada de R$ 200,00), com a conta a receber que ela gera. */
async function financiada(s: Sessao, aparelho: string, meio: "payjoy" | "aiva", entrada: object) {
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda, cat.aparelho, aparelho, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
    [venda, JSON.stringify([{ meio, valor: 149_900, entrada: 20_000, ...entrada }]), JSON.stringify({ nome: "Cliente Teste", email: "cliente@teste.invalid" }), chave("concluir")]);
  const conta = (await db.query<{ id: string }>("select id from public.contas_a_receber where venda_id = $1", [venda])).rows[0]?.id ?? "";
  return { venda, conta };
}
/** Leva a venda (e os pagamentos) para N dias atrás. */
const vendidaHa = (venda: string, dias: number) =>
  db.query("update public.vendas set concluida_em = concluida_em - make_interval(days => $2) where id = $1", [venda, dias]);

type Linha = Record<string, unknown>;
type Painel = {
  hoje: string; dias: number; unidade: string | null; lojas: { id: string; nome: string }[]; linhas: Linha[];
  total_a_receber: { quantidade: number; valor: number }; mais_antigos: Linha[];
  pendencias: Record<string, { quantidade: number; valor: number }>;
};
const painel = async (s: Sessao, unidade: string | null, dias = 30) =>
  JSON.parse(JSON.stringify(await valor<Painel>(s, PAINEL, [unidade, dias])), (_, x: unknown) => (typeof x === "string" && /^-?\d+$/.test(x) ? Number(x) : x)) as Painel;
const resumo = (l: Linha) => [l.adquirente, l.a_receber, l.valor_a_receber, l.ate_7_dias, l.de_8_a_30_dias, l.mais_de_30_dias, l.mais_antiga_dias,
  l.recebidos, l.recebido_bruto, l.recebido_liquido, l.estornos_a_confirmar, l.valor_estornos_a_confirmar];

/** O cenário: duas lojas, as maquininhas da loja A e uma venda de cada situação. */
async function montarVendas() {
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  const bia = await naLoja(ids.vendedorAB, ids.lojaB);
  const dono = await naLoja(ids.dono, ids.lojaA);
  await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  await valor(bia, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
  const picpay = await valor<string>(dono, TERMINAL, [ids.lojaA, "picpay", "PP-001", "Balcão"]);
  const pagbank = await valor<string>(dono, TERMINAL, [ids.lojaA, "pagbank", "PB-001", "Caixa"]);
  const v = {
    hoje: await capa(ana, "cartao_picpay", { terminal: picpay }),
    conciliada: await capa(ana, "cartao_pagseguro", { terminal: pagbank }),
    pixDezDias: await capa(ana, "pix_direto"),
    quarentaDias: await capa(ana, "cartao_picpay", { terminal: picpay }),
    cancelada: await capa(ana, "cartao_picpay", { terminal: picpay }),
    dinheiro: await capa(ana, "dinheiro"),
    // Loja B sem maquininha cadastrada: o cartão passa sem dizer qual (pendência).
    semMaquininha: await capa(bia, "cartao_pagseguro"),
  };
  const payjoy = await financiada(ana, itens.a1, "payjoy", { meio_entrada: "cartao_picpay", comprovante: chave("nsu") });
  const aiva = await financiada(ana, itens.a2, "aiva", { meio_entrada: "dinheiro" });
  await vendidaHa(v.pixDezDias.venda, 10);
  await vendidaHa(v.quarentaDias.venda, 40);
  expect(await valor(dono, CONCILIAR, [v.conciliada.pagamento, "LOTE-PB-1", 7_600, hoje()])).toBe(true);
  expect(await valor(dono, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [v.cancelada.venda])).toBe(true);
  // A Aiva pagou o repasse e depois a venda foi cancelada: acerto com a financeira.
  expect(await valor(dono, RECEBER, [aiva.conta, "AV-REPASSE-1", 125_000, hoje()])).toBe(true);
  expect(await valor(dono, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [aiva.venda])).toBe(true);
  return { ana, bia, dono, v, payjoy, aiva };
}

describe("recebíveis por loja e adquirente (L8e, ORA-FIN-005)", () => {
  it("a receber por adquirente com a idade desde a venda; o que caiu na conta com a diferença observada; estornos a confirmar", async () => {
    const { dono, v, payjoy } = await montarVendas();
    const situacao = (await db.query<{ situacao: string }>("select situacao from public.venda_pagamentos where id = $1", [v.cancelada.pagamento])).rows[0]?.situacao;
    expect(situacao).toBe("estorno_pendente");
    const p = await painel(dono, null);
    expect(p.dias).toBe(30);
    expect(p.hoje).toBe(hoje());
    expect(p.unidade).toBeNull();
    const daLoja = (loja: string) => p.linhas.filter((l) => l.unidade === loja).map(resumo);
    expect(daLoja(ids.lojaA)).toEqual([
      // adquirente, a receber, valor, até 7, 8 a 30, mais de 30, mais antiga, recebidos, bruto, líquido, estornos, valor dos estornos
      ["picpay", 2, 15_800, 7_900, 0, 7_900, 40, 0, 0, 0, 1, 7_900],
      ["pagbank", 0, 0, 0, 0, 0, null, 1, 7_900, 7_600, 0, 0],
      ["conta", 1, 7_900, 0, 7_900, 0, 10, 0, 0, 0, 0, 0],
      ["payjoy", 1, 129_900, 129_900, 0, 0, 0, 0, 0, 0, 0, 0],
      ["aiva", 0, 0, 0, 0, 0, null, 1, 129_900, 125_000, 0, 0],
    ]);
    expect(daLoja(ids.lojaB)).toEqual([["pagbank", 1, 7_900, 7_900, 0, 0, 0, 0, 0, 0, 0, 0]]);
    expect(p.linhas.map((l) => l.unidade)).toEqual([ids.lojaA, ids.lojaA, ids.lojaA, ids.lojaA, ids.lojaA, ids.lojaB]);
    // Dinheiro não é recebível (fica no caixa); a venda cancelada sai do a receber e vira estorno a confirmar.
    expect(p.total_a_receber).toEqual({ quantidade: 5, valor: 15_800 + 7_900 + 129_900 + 7_900 });
    // Do mais antigo para o mais novo (as de hoje empatam na idade: a ordem entre elas não importa aqui).
    expect(p.mais_antigos.slice(0, 2).map((m) => [m.tipo, m.venda_id, m.dias])).toEqual([
      ["pagamento", v.quarentaDias.venda, 40], ["pagamento", v.pixDezDias.venda, 10],
    ]);
    expect(p.mais_antigos.slice(2).map((m) => `${String(m.tipo)}:${String(m.venda_id)}:${String(m.dias)}`).sort()).toEqual(
      [`pagamento:${v.hoje.venda}:0`, `pagamento:${v.semMaquininha.venda}:0`, `financeira:${payjoy.venda}:0`].sort());
    expect(p.mais_antigos[0]).toMatchObject({ adquirente: "picpay", valor: 7_900, terminal: "Balcão", unidade: ids.lojaA, id: v.quarentaDias.pagamento });
    expect(p.mais_antigos.find((m) => m.tipo === "financeira")).toMatchObject({ adquirente: "payjoy", valor: 129_900, terminal: null, id: payjoy.conta });
    expect(p.pendencias).toEqual({
      sem_maquininha: { quantidade: 1, valor: 7_900 },
      entradas_na_maquininha: { quantidade: 1, valor: 20_000 },
      financeira_de_venda_cancelada: { quantidade: 1, valor: 125_000 },
    });
  });

  it("a janela do recebido vai de 7 a 90 dias, pela data em que o dinheiro caiu; desfazer a conciliação volta para o a receber", async () => {
    const { dono, v } = await montarVendas();
    // O pagamento de 40 dias atrás caiu na conta há 35 dias: fora da janela de 30, dentro da de 90.
    expect(await valor(dono, CONCILIAR, [v.quarentaDias.pagamento, "LOTE-PP-ANTIGO", 7_500, somarDias(hoje(), -35)])).toBe(true);
    const picpay = (q: Painel) => q.linhas.find((l) => l.unidade === ids.lojaA && l.adquirente === "picpay");
    expect(resumo(picpay(await painel(dono, null, 30)) ?? {})).toEqual(["picpay", 1, 7_900, 7_900, 0, 0, 0, 0, 0, 0, 1, 7_900]);
    expect(resumo(picpay(await painel(dono, null, 90)) ?? {})).toEqual(["picpay", 1, 7_900, 7_900, 0, 0, 0, 1, 7_900, 7_500, 1, 7_900]);
    for (const dias of [6, 91, null]) expect(await codigo(dono, PAINEL, [null, dias]), String(dias)).toBe("22023");
    expect(await valor(dono, "select public.pagamento_desconciliar($1, 'Lote errado') as v", [v.quarentaDias.pagamento])).toBe(true);
    expect(resumo(picpay(await painel(dono, null, 90)) ?? {})).toEqual(["picpay", 2, 15_800, 7_900, 0, 7_900, 40, 0, 0, 0, 1, 7_900]);
  });

  it("quem vê: o dono a rede (ou uma loja), o gerente só a loja dele; vendedor, outra loja e outra rede são recusados", async () => {
    const { ana, dono } = await montarVendas();
    const soB = await painel(dono, ids.lojaB);
    expect(soB.unidade).toBe(ids.lojaB);
    expect(soB.linhas.map((l) => l.unidade)).toEqual([ids.lojaB]);
    expect(soB.total_a_receber).toEqual({ quantidade: 1, valor: 7_900 });
    expect(soB.pendencias.entradas_na_maquininha).toEqual({ quantidade: 0, valor: 0 });
    // A lista das lojas para o filtro: todas as que o dono concilia, mesmo com o recorte.
    expect(soB.lojas.map((l) => l.id)).toEqual(expect.arrayContaining([ids.lojaA, ids.lojaB, ids.lojaC]));
    expect(soB.lojas.map((l) => l.id)).not.toContain(ids.lojaOutraOrg);

    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    const doGerente = await painel(gerenteB, null);
    expect(doGerente.lojas).toEqual([{ id: ids.lojaB, nome: "Loja B" }]);
    expect(doGerente.linhas.map((l) => [l.unidade, l.adquirente])).toEqual([[ids.lojaB, "pagbank"]]);
    expect(await codigo(gerenteB, PAINEL, [ids.lojaA, 30])).toBe("42501");

    expect(await codigo(ana, PAINEL, [null, 30])).toBe("42501");
    expect(await codigo(ana, PAINEL, [ids.lojaA, 30])).toBe("42501");
    const donoOutraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await codigo(donoOutraRede, PAINEL, [ids.lojaA, 30])).toBe("42501");
    const daOutraRede = await painel(donoOutraRede, null);
    expect(daOutraRede.linhas).toEqual([]);
    expect(daOutraRede.lojas.map((l) => l.id)).toEqual([ids.lojaOutraOrg]);
    expect(daOutraRede.total_a_receber).toEqual({ quantidade: 0, valor: 0 });
  });
});
