// Financeiro real, primeira fatia (#65): public.financeiro_painel soma o período inteiro no banco,
// com as regras de leitura de quem chama. Banco em memória com todas as migrations; dados FICTÍCIOS.
// Cada teste numa transação desfeita.
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
const chave = (prefixo: string) => `${prefixo}:${++chaves}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `65000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
// Cada chamada num ponto de salvamento dentro da sessão: um erro aparece com a mensagem real
// (sem o ponto, a limpeza da sessão falharia antes e esconderia a causa).
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return v;
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      throw new Error(`${sql.slice(0, 70)} → ${(e as Error).message} (${(e as { code?: string }).code})`, { cause: e });
    }
  });
// O ponto de salvamento fica DENTRO da sessão do usuário (como em devolucao.test.ts): o erro é
// desfeito antes de a sessão ser encerrada.
const erroDe = (s: Sessao, sql: string, params: unknown[]) =>
  comoUsuario(db, s, async () => {
    await db.exec("savepoint tentativa");
    try {
      await db.query(sql, params);
      await db.exec("release savepoint tentativa");
      return null;
    } catch (e) {
      await db.exec("rollback to savepoint tentativa");
      await db.exec("release savepoint tentativa");
      return (e as { code?: string }).code ?? "sem-codigo";
    }
  });

const abrirCaixa = (s: Sessao, fundo = 10_000) => valor<string>(s, "select public.abrir_caixa($1, $2) as v", [fundo, chave("caixa")]);
const novaVenda = (s: Sessao) => valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
const adicionar = (s: Sessao, venda: string, variante: string, item: string | null, quantidade = 1) =>
  valor<string>(s, "select public.adicionar_item($1, $2, $3, $4, $5) as v", [venda, variante, item, quantidade, chave("item")]);
const concluir = (s: Sessao, venda: string, pagamentos: object[], cliente: object = {}) =>
  valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v", [venda, JSON.stringify(pagamentos), JSON.stringify(cliente), chave("concluir")]);
const devolver = (s: Sessao, venda: string, itensDevolvidos: object[], reembolsos: object[]) =>
  valor(s, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, $4, $5) as v", [venda, JSON.stringify(itensDevolvidos), JSON.stringify(reembolsos), "Cliente desistiu", chave("dev")]);
const cancelar = (s: Sessao, venda: string) => valor<boolean>(s, "select public.cancelar_venda($1, 'Cliente desistiu da compra') as v", [venda]);

type Linha = Record<string, string | number | null>;
type Painel = {
  periodos: Linha[]; pagamentos: Linha[]; reembolsos: Linha[]; estornos: Linha[]; a_receber: Linha[]; movimentos: Linha[];
  caixas: Record<string, number>;
};
// Janela em volta de "agora" (as vendas do teste são gravadas com now()); o máximo é 400 dias.
const INICIO = new Date(Date.now() - 2 * 86_400_000).toISOString();
const FIM = new Date(Date.now() + 2 * 86_400_000).toISOString();
const painel = (s: Sessao, unidade: string | null = null, inicio = INICIO, fim = FIM, porHora = false) =>
  valor<Painel>(s, "select public.financeiro_painel($1, $2, $3, $4) as v", [inicio, fim, unidade, porHora]);
const soma = (linhas: Linha[], campo: string, filtro: (l: Linha) => boolean = () => true) =>
  linhas.filter(filtro).reduce((s, l) => s + Number(l[campo] ?? 0), 0);

// Dia de hoje (vendas do teste): três vendas na loja A pelo vendedorA; a gerência (dono, com o
// próprio caixa aberto) faz a devolução parcial de uma delas.
async function diaDaLojaA() {
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  await abrirCaixa(ana, 10_000);
  // V1: capa em dinheiro, cliente dá R$ 100,00 e recebe R$ 21,00 de troco.
  const v1 = await novaVenda(ana);
  await adicionar(ana, v1, cat.capa, null);
  await concluir(ana, v1, [{ meio: "dinheiro", valor: 10_000 }]);
  // V2: duas capas, pagamento misto Pix na maquininha + dinheiro, sem troco.
  const v2 = await novaVenda(ana);
  const itemV2 = await adicionar(ana, v2, cat.capa, null, 2);
  await concluir(ana, v2, [{ meio: "pix_picpay", valor: 5_800, comprovante: "123456" }, { meio: "dinheiro", valor: 10_000 }]);
  // V3: aparelho financiado na PayJoy, entrada de R$ 200,00 em dinheiro.
  const v3 = await novaVenda(ana);
  await adicionar(ana, v3, cat.aparelho, itens.a1);
  await concluir(ana, v3, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: "dinheiro", parcelas: 12 }], { nome: "Cliente Teste", email: "cliente@teste.invalid" });
  // Devolução parcial da V2: uma capa, reembolso em dinheiro (sai da gaveta do dono).
  const dono = await naLoja(ids.dono, ids.lojaA);
  await abrirCaixa(dono, 10_000);
  await devolver(dono, v2, [{ item: itemV2, quantidade: 1, condicao: "novo" }], [{ meio: "dinheiro", valor: 7_900 }]);
  return { ana, dono, v1, v2, v3 };
}

describe("financeiro_painel: soma o período inteiro sem contar nada duas vezes", () => {
  it("vendas, devolução, pagamentos por meio, troco, entrada financiada e livro do caixa batem entre si", async () => {
    await diaDaLojaA();
    const dono = await naLoja(ids.dono, ids.lojaA);
    const p = await painel(dono, ids.lojaA);

    expect(p.periodos).toHaveLength(1);
    expect(p.periodos[0]).toMatchObject({ vendas: 3, vendido: 7_900 + 15_800 + 149_900, devolucoes: 1, devolvido: 7_900, cancelamentos: 0, cancelado: 0 });

    // Dinheiro: duas vendas, R$ 200,00 entregues e R$ 21,00 de troco (só no primeiro dinheiro da V1).
    expect(p.pagamentos.find((l) => l.meio === "dinheiro" && l.situacao === "confirmado")).toMatchObject({ quantidade: 2, valor: 20_000, troco: 2_100, entrada: 0 });
    expect(p.pagamentos.find((l) => l.meio === "pix_picpay")).toMatchObject({ quantidade: 1, valor: 5_800, troco: 0 });
    // PayJoy: o preço inteiro no pagamento, a entrada separada e o meio dela; o resto a receber.
    expect(p.pagamentos.find((l) => l.meio === "payjoy")).toMatchObject({ valor: 149_900, entrada: 20_000, meio_entrada: "dinheiro", troco: 0 });
    expect(p.a_receber).toEqual([{ devedor: "payjoy", situacao: "aberta", quantidade: 1, valor: 129_900 }]);
    expect(p.reembolsos).toEqual([{ meio: "dinheiro", quantidade: 1, valor: 7_900 }]);

    // O que entrou na loja pelos pagamentos (sem financeira, menos o troco, mais as entradas)
    // é o que o livro do caixa registrou como recebimento menos o troco.
    const naLojaPelosPagamentos = soma(p.pagamentos, "valor", (l) => l.meio !== "payjoy" && l.meio !== "aiva")
      - soma(p.pagamentos, "troco") + soma(p.pagamentos, "entrada");
    const pelocaixa = soma(p.movimentos, "valor", (l) => l.tipo === "recebimento" || l.tipo === "troco");
    expect(naLojaPelosPagamentos).toBe(43_700);
    expect(pelocaixa).toBe(43_700);

    // Gavetas em dinheiro (vendedora e dono): fundos + recebimentos em dinheiro (com a entrada)
    // − troco − reembolso. Fundo não é receita: aparece como tipo próprio.
    const gaveta = soma(p.movimentos, "valor", (l) => l.meio === "dinheiro");
    expect(gaveta).toBe(10_000 + 10_000 + 40_000 - 2_100 - 7_900);
    expect(soma(p.movimentos, "valor", (l) => l.tipo === "fundo")).toBe(20_000);
    expect(p.caixas).toMatchObject({ abertos_agora: 2, fechados: 0, com_diferenca: 0 });
  });

  it("cancelamento sai no dia dele; Pix cancelado fica com estorno pendente até o comprovante", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.capa, null);
    await concluir(ana, venda, [{ meio: "pix_direto", valor: 7_900, comprovante: "E2E-FICTICIO-9" }]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    await cancelar(dono, venda);

    let p = await painel(dono, ids.lojaA);
    expect(p.periodos[0]).toMatchObject({ vendas: 1, vendido: 7_900, cancelamentos: 1, cancelado: 7_900, devolvido: 0 });
    expect(p.pagamentos).toEqual([expect.objectContaining({ meio: "pix_direto", situacao: "estorno_pendente", valor: 7_900 })]);
    expect(p.estornos).toEqual([{ situacao: "pendente", quantidade: 1, valor: 7_900 }]);

    const estorno = (await db.query<{ id: string }>("select id from public.estornos_externos where venda_id = $1", [venda])).rows[0]?.id;
    await valor(dono, "select public.confirmar_estorno_externo($1, 'EST-123456', null) as v", [estorno]);
    p = await painel(dono, ids.lojaA);
    expect(p.estornos).toEqual([{ situacao: "confirmado", quantidade: 1, valor: 7_900 }]);
    expect(p.pagamentos).toEqual([expect.objectContaining({ meio: "pix_direto", situacao: "estornado" })]);
  });

  it("período sem fatos devolve listas vazias e zeros, não um erro", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const p = await painel(dono, ids.lojaA);
    expect(p).toEqual({
      periodos: [], pagamentos: [], reembolsos: [], estornos: [], a_receber: [], movimentos: [],
      caixas: { abertos_agora: 0, fechados: 0, conferidos: 0, com_diferenca: 0, diferenca: 0, diferenca_absoluta: 0 },
    });
  });

  it("o dia é o de São Paulo: 23h30 de lá ainda é o mesmo dia, embora já seja o seguinte em UTC", async () => {
    const { v1 } = await diaDaLojaA();
    // Leva a V1 para 20/10, 23h30 em São Paulo (21/10, 02h30 em UTC), longe das outras vendas de hoje.
    await db.query("update public.vendas set concluida_em = '2025-10-21T02:30:00Z' where id = $1", [v1]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const dia20 = await painel(dono, ids.lojaA, "2025-10-20T03:00:00Z", "2025-10-21T03:00:00Z");
    expect(dia20.periodos).toEqual([expect.objectContaining({ periodo: "2025-10-20", vendas: 1, vendido: 7_900 })]);
    const porHora = await painel(dono, ids.lojaA, "2025-10-20T03:00:00Z", "2025-10-21T03:00:00Z", true);
    expect(porHora.periodos).toEqual([expect.objectContaining({ periodo: "2025-10-20T23", vendas: 1 })]);
    // O dia seguinte em São Paulo (21/10) não tem a venda.
    expect((await painel(dono, ids.lojaA, "2025-10-21T03:00:00Z", "2025-10-22T03:00:00Z")).periodos).toEqual([]);
  });

  it("soma mais linhas do que a API devolve numa página (1.200 vendas e pagamentos)", async () => {
    await db.query(`
      insert into public.vendas (organizacao_id, unidade_id, vendedor_id, chave_criacao, situacao, total_centavos, troco_centavos, concluida_em)
      select $1, $2, $3, 'volume:' || n, 'concluida', 1_000, 0, now() from generate_series(1, 1200) n`, [ids.organizacao, ids.lojaA, ids.vendedorA]);
    await db.query(`
      insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, confirmacao)
      select organizacao_id, id, 1, 'dinheiro', 1_000, 'caixa' from public.vendas where chave_criacao like 'volume:%'`);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const p = await painel(dono, ids.lojaA);
    expect(p.periodos[0]).toMatchObject({ vendas: 1200, vendido: 1_200_000 });
    expect(p.pagamentos).toEqual([expect.objectContaining({ meio: "dinheiro", quantidade: 1200, valor: 1_200_000 })]);
  });

  it("período invertido ou maior que 400 dias é recusado", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const sql = "select public.financeiro_painel($1, $2, $3, false)";
    expect(await erroDe(dono, sql, [FIM, INICIO, ids.lojaA])).toBe("22023");
    expect(await erroDe(dono, sql, ["2025-01-01T00:00:00Z", "2026-03-01T00:00:00Z", ids.lojaA])).toBe("22023");
  });
});

describe("financeiro_painel: cada um soma só o que pode ver", () => {
  it("vendedor soma as próprias vendas; o dono soma as da loja inteira", async () => {
    await diaDaLojaA();
    const beto = await naLoja(ids.vendedorAB, ids.lojaA);
    await abrirCaixa(beto);
    const vendaBeto = await novaVenda(beto);
    await adicionar(beto, vendaBeto, cat.capa, null);
    await concluir(beto, vendaBeto, [{ meio: "dinheiro", valor: 7_900 }]);

    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect((await painel(ana, ids.lojaA)).periodos[0]).toMatchObject({ vendas: 3 });
    expect((await painel(beto, ids.lojaA)).periodos[0]).toMatchObject({ vendas: 1, vendido: 7_900 });
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await painel(dono, ids.lojaA)).periodos[0]).toMatchObject({ vendas: 4 });
  });

  it("gerente de outra loja e dono de outra rede recebem zero; na rede, o gerente só vê a própria loja", async () => {
    await diaDaLojaA();
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    const daLojaA = await painel(gerenteB, ids.lojaA);
    expect([daLojaA.periodos, daLojaA.pagamentos, daLojaA.movimentos]).toEqual([[], [], []]);
    expect((await painel(gerenteB, null)).periodos).toEqual([]);

    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    const x = await painel(outraRede, ids.lojaA);
    expect([x.periodos, x.pagamentos, x.a_receber, x.movimentos, x.caixas.abertos_agora]).toEqual([[], [], [], [], 0]);
    expect((await painel(outraRede, null)).periodos).toEqual([]);
  });

  it("administrador vê as vendas da rede, mas não os caixas (não tem caixa.conferir)", async () => {
    await diaDaLojaA();
    const admin = await naLoja(ids.administrador, ids.lojaA);
    const p = await painel(admin, null);
    expect(p.periodos[0]).toMatchObject({ vendas: 3 });
    expect(p.movimentos).toEqual([]);
    expect(p.caixas.abertos_agora).toBe(0);
  });

  it("caixa fechado com diferença aparece no fechamento do período", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana, 10_000);
    await valor(ana, "select public.fechar_caixa($1, $2) as v", [9_500, "Faltaram R$ 5,00"]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await painel(dono, ids.lojaA)).caixas).toMatchObject({ abertos_agora: 0, fechados: 1, com_diferenca: 1, diferenca: -500, diferenca_absoluta: 500 });
  });
});
