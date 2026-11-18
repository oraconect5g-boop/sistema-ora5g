// Resultado do mês (lote L8b: ORA-FIN-002 e ORA-FIN-008; decisões do proprietário de 13/11/2026, D-037):
// só o dono vê; a conta a pagar entra no mês do vencimento (paga pelo valor pago, aberta pelo valor);
// as despesas da rede são divididas entre as lojas pelo que cada uma vendeu no mês. Compra de mercadoria
// fica fora (o custo entra quando o item é vendido). Banco em memória com todas as migrations; dados
// FICTÍCIOS. Cada teste numa transação desfeita.
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
const chave = (prefixo: string) => `l8b:${prefixo}:${++chaves}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `79000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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
  }, { criarSessao: false });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.codigo} ${r.mensagem}`);
  return r.v;
}
const codigo = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

const RESULTADO = "select public.resultado_do_mes($1::date, $2, $3) as v";
const LANCAR = "select public.conta_pagar_lancar($1::jsonb, $2) as v";
const PAGAR = "select public.conta_pagar_pagar($1, $2::date, $3, $4) as v";
const CANCELAR = "select public.conta_pagar_cancelar($1, $2, $3) as v";
const CATEGORIA = "select public.conta_pagar_categoria_salvar($1, $2, $3, $4) as v";

type Numeros = Record<string, number>;
type Mes = Numeros & { mes: string };
type Categoria = { categoria: string; nome: string; valor: number; em_aberto?: number };
type Loja = Numeros & { unidade: string; nome: string | null };
type Resultado = {
  mes: string; hoje: string; em_andamento: boolean; unidade: string | null;
  linhas: Numeros; meses: Mes[]; por_categoria: Categoria[]; fora_do_resultado: Categoria[]; por_loja: Loja[];
  lojas: { id: string; nome: string }[];
};

const mes = async (deslocamento = 0) => (await db.query<{ v: string }>(
  "select to_char(date_trunc('month', now() at time zone 'America/Sao_Paulo') + make_interval(months => $1), 'YYYY-MM-DD') as v", [deslocamento])).rows[0]?.v ?? "";
const hoje = async () => (await db.query<{ v: string }>("select ((now() at time zone 'America/Sao_Paulo')::date)::text as v")).rows[0]?.v ?? "";
const categoria = async (nome: string) =>
  (await db.query<{ id: string }>("select id from public.contas_pagar_categorias where organizacao_id = $1 and nome = $2", [ids.organizacao, nome])).rows[0]?.id ?? "";
const contaDo = async (grupo: string) => (await db.query<{ id: string }>("select id from public.contas_a_pagar where grupo_id = $1 and parcela = 1", [grupo])).rows[0]?.id ?? "";
async function lancar(dono: Sessao, unidade: string | null, nomeDaCategoria: string, valorDaConta: number, vencimento: string, descricao = "Conta do teste") {
  const grupo = await valor<string>(dono, LANCAR, [JSON.stringify({
    unidade, categoria: await categoria(nomeDaCategoria), descricao, valor: valorDaConta, vencimento, forma: "unica",
  }), chave("conta")]);
  return contaDo(grupo);
}
const resultado = (s: Sessao, mesPedido: string, unidade: string | null = null, meses = 1) => valor<Resultado>(s, RESULTADO, [mesPedido, unidade, meses]);
const numeros = (r: Numeros) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)]));

const abrirCaixa = (s: Sessao, fundo = 10_000) => valor<string>(s, "select public.abrir_caixa($1, $2) as v", [fundo, chave("caixa")]);
const novaVenda = (s: Sessao) => valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
const adicionar = (s: Sessao, venda: string, variante: string, item: string | null, quantidade = 1) =>
  valor<string>(s, "select public.adicionar_item($1, $2, $3, $4, $5) as v", [venda, variante, item, quantidade, chave("item")]);
const concluir = (s: Sessao, venda: string, pagamentos: object[], cliente: object = {}) =>
  valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v", [venda, JSON.stringify(pagamentos), JSON.stringify(cliente), chave("concluir")]);
const devolver = (s: Sessao, venda: string, itensDevolvidos: object[], reembolsos: object[]) =>
  valor(s, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, $4, $5) as v", [venda, JSON.stringify(itensDevolvidos), JSON.stringify(reembolsos), "Cliente desistiu", chave("dev")]);
const cancelarVenda = (s: Sessao, venda: string) => valor<boolean>(s, "select public.cancelar_venda($1, 'Cliente desistiu da compra') as v", [venda]);
const pagamentoDa = async (venda: string, meio: string) =>
  (await db.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1 and meio = $2", [venda, meio])).rows[0]?.id ?? "";

// O mesmo dia da rede de margem-painel.test.ts. Custos do cenário: aparelho R$ 1.100,00, capa R$ 18,00.
//   Loja A: V1 capa 7.900; V2 duas capas com R$ 1,00 de desconto (15.700), uma devolvida (7.850);
//   V3 aparelho 149.900 (PayJoy); V5 aparelho e capa 157.800 (dinheiro, Pix direto 57.800, Pix PicPay
//   50.000); V4 capa 7.900 (Pix direto), cancelada. Loja B: V6 aparelho 139.900.
//   Loja A: 5 vendas, vendido 339.200 (bruto 339.300, desconto 100), devolvido 7.850, cancelado 7.900,
//   receita 323.450, custo 229.000 − 1.800 − 1.800 = 225.400, margem 98.050.
//   Loja B: 1 venda, receita 139.900, custo 110.000, margem 29.900.
async function diaDaRede() {
  await db.query("update public.categorias set desconto_teto_pb = 1000, margem_minima_pb = 3000 where id = $1", [cat.acessorios]);
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  const caixaDaAna = await abrirCaixa(ana);
  const v1 = await novaVenda(ana);
  await adicionar(ana, v1, cat.capa, null);
  await concluir(ana, v1, [{ meio: "dinheiro", valor: 10_000 }]);
  const v2 = await novaVenda(ana);
  const itemV2 = await adicionar(ana, v2, cat.capa, null, 2);
  expect(await valor<string>(ana, "select public.aplicar_desconto($1, 100) as v", [itemV2])).toBe("dentro_do_limite");
  await concluir(ana, v2, [{ meio: "pix_picpay", valor: 5_700, comprovante: "123456" }, { meio: "dinheiro", valor: 10_000 }]);
  const v3 = await novaVenda(ana);
  await adicionar(ana, v3, cat.aparelho, itens.a1);
  await concluir(ana, v3, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: "dinheiro", parcelas: 12 }], { nome: "Cliente Teste", email: "cliente@teste.invalid" });
  const v5 = await novaVenda(ana);
  await adicionar(ana, v5, cat.aparelho, itens.a2);
  await adicionar(ana, v5, cat.capa, null);
  await concluir(ana, v5, [
    { meio: "dinheiro", valor: 50_000 },
    { meio: "pix_direto", valor: 57_800, comprovante: "E2E-FICTICIO-5" },
    { meio: "pix_picpay", valor: 50_000, comprovante: "654321" },
  ]);
  const beto = await naLoja(ids.vendedorAB, ids.lojaA);
  await abrirCaixa(beto);
  const v4 = await novaVenda(beto);
  await adicionar(beto, v4, cat.capa, null);
  await concluir(beto, v4, [{ meio: "pix_direto", valor: 7_900, comprovante: "E2E-FICTICIO-9" }]);
  const dono = await naLoja(ids.dono, ids.lojaA);
  await abrirCaixa(dono);
  await devolver(dono, v2, [{ item: itemV2, quantidade: 1, condicao: "novo" }], [{ meio: "dinheiro", valor: 7_850 }]);
  await cancelarVenda(dono, v4);
  const betoB = await naLoja(ids.vendedorAB, ids.lojaB);
  await abrirCaixa(betoB);
  const v6 = await novaVenda(betoB);
  await adicionar(betoB, v6, cat.aparelho, itens.b1);
  await concluir(betoB, v6, [{ meio: "dinheiro", valor: 139_900 }]);
  return { ana, caixaDaAna, dono, v2, v5 };
}

describe("resultado do mês: quem vê (L8b)", () => {
  it("só o dono vê, da rede e de cada loja; gerente, administrador, vendedor e dono de outra rede são recusados", async () => {
    const atual = await mes();
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await resultado(dono, atual)).unidade).toBeNull();
    expect((await resultado(dono, atual, ids.lojaB)).unidade).toBe(ids.lojaB);
    for (const [usuario, unidade] of [[ids.gerenteB, ids.lojaB], [ids.administrador, ids.lojaA], [ids.vendedorA, ids.lojaA]] as const) {
      expect(await codigo(await naLoja(usuario, unidade), RESULTADO, [atual, null, 1]), usuario).toBe("42501");
    }
    // O dono de outra rede vê só a rede dele; a loja tem de ser da rede de quem pede.
    const donoDeOutraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect((await resultado(donoDeOutraRede, atual)).lojas.map((l) => l.nome)).toEqual(["Loja X"]);
    expect(await codigo(donoDeOutraRede, RESULTADO, [atual, ids.lojaA, 1])).toBe("42501");
    expect(await codigo(dono, RESULTADO, [atual, ids.lojaOutraOrg, 1])).toBe("42501");
  });

  it("sem uma das permissões das partes, nem o dono vê: o resultado nunca sai pela metade", async () => {
    const atual = await mes();
    for (const permissao of ["resultado.ver", "venda.ver_todas", "custo.ver", "conta_pagar.gerir", "caixa.conferir"]) {
      await db.exec("savepoint sem_permissao");
      await db.query("select set_config('ora.motivo', 'Teste do resultado sem uma das permissões', true)");
      await db.query("delete from public.papel_permissoes where papel = 'dono' and permissao = $1", [permissao]);
      expect(await codigo(await naLoja(ids.dono, ids.lojaA), RESULTADO, [atual, null, 1]), permissao).toBe("42501");
      await db.exec("rollback to savepoint sem_permissao");
      await db.exec("release savepoint sem_permissao");
    }
  });

  it("mês futuro, mês com mais de 24 meses e série fora de 1 a 12 são recusados", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await codigo(dono, RESULTADO, [await mes(1), null, 1])).toBe("22023");
    expect(await codigo(dono, RESULTADO, [await mes(-25), null, 1])).toBe("22023");
    expect(await codigo(dono, RESULTADO, [null, null, 1])).toBe("22023");
    expect((await resultado(dono, await mes(-24))).mes).toBe(await mes(-24));
    for (const meses of [0, 13, null]) expect(await codigo(dono, RESULTADO, [await mes(), null, meses])).toBe("22023");
    // Qualquer dia do mês vale pelo mês.
    const atual = await mes();
    expect((await resultado(dono, `${atual.slice(0, 8)}09`)).mes).toBe(atual);
  });
});

describe("resultado do mês: as linhas (L8b)", () => {
  it("vendas, desconto, devoluções, cancelamentos, custo, taxas, contas pelo vencimento e dinheiro do caixa, da rede e de cada loja", async () => {
    const { ana, dono, v5 } = await diaDaRede();
    const atual = await mes();
    const dia = await hoje();
    // Pix PicPay de R$ 500,00 conciliado com R$ 495,00 líquidos: R$ 5,00 de taxa observada.
    expect(await valor(dono, "select public.pagamento_conciliar($1, $2, $3, $4::date) as v", [await pagamentoDa(v5, "pix_picpay"), "EXTRATO-L8B", 49_500, dia])).toBe(true);
    // Contas: loja A, aluguel aberto e luz paga com juros; mercadoria (fica fora); loja B, salário
    // cancelado e marketing aberto; rede, imposto aberto; aluguel do mês que vem (fica fora deste mês).
    await lancar(dono, ids.lojaA, "Aluguel e condomínio", 300_000, atual);
    const luz = await lancar(dono, ids.lojaA, "Água, luz e internet", 20_000, atual);
    expect(await valor(dono, PAGAR, [luz, dia, 20_500, "COMPROVANTE-LUZ"])).toBe(true);
    await lancar(dono, ids.lojaA, "Mercadoria (fornecedor)", 100_000, atual, "Boleto de capas");
    const salario = await lancar(dono, ids.lojaB, "Salários e encargos", 50_000, atual);
    expect(await valor(dono, CANCELAR, [salario, "Lançada em dobro", false])).toBe(1);
    await lancar(dono, ids.lojaB, "Marketing", 10_000, atual);
    await lancar(dono, null, "Impostos e taxas", 100_000, atual, "Simples do mês");
    await lancar(dono, ids.lojaA, "Aluguel e condomínio", 300_000, await mes(1));
    // Saída autorizada do caixa da Ana: R$ 25,00 para o motoboy.
    const pedido = await valor<string>(ana, "select public.caixa_pedir_saida($1, $2, $3) as v", [2_500, "Motoboy da entrega", chave("saida")]);
    expect(await valor(dono, "select public.caixa_decidir_saida($1, $2, $3) as v", [pedido, true, null])).toBe("autorizada");

    // Divisão dos R$ 1.000,00 da rede pela receita (A 323.450, B 139.900 de 463.350):
    // A 69.806,84 e B 30.193,15 em centavos; o centavo que sobra vai para A (maior fração).
    const lojaA = { receita_liquida: 323_450, cmv: 225_400, margem_bruta: 98_050, taxas: 500, despesas: 320_500, saidas_caixa: 2_500, rede: 69_807 };
    const lojaB = { receita_liquida: 139_900, cmv: 110_000, margem_bruta: 29_900, taxas: 0, despesas: 10_000, saidas_caixa: 0, rede: 30_193 };
    const resultadoA = 98_050 - 500 - 320_500 - 2_500 - 69_807;
    const resultadoB = 29_900 - 10_000 - 30_193;

    const rede = await resultado(dono, atual);
    expect(rede).toMatchObject({ mes: atual, hoje: dia, em_andamento: true, unidade: null });
    expect(numeros(rede.linhas)).toEqual({
      vendas: 6, bruto: 479_200, descontos: 100, vendido: 479_100, devolvido: 7_850, cancelado: 7_900, receita_liquida: 463_350,
      custo_vendido: 339_000, custo_devolvido: 1_800, custo_cancelado: 1_800, cmv: 335_400, margem_bruta: 127_950,
      vendido_com_custo: 479_100, vendido_sem_custo: 0, itens_sem_custo: 0,
      // V4 foi cancelada: o Pix dela está em estorno e não conta. Sem conciliação: Pix PicPay da V2 e Pix direto da V5.
      taxas: 500, pagamentos_conciliados: 1, a_conciliar: 2, a_conciliar_valor: 63_500,
      despesas: 330_500, despesas_em_aberto: 310_000, saidas_quantidade: 1, saidas_caixa: 2_500,
      rede: 100_000, rede_em_aberto: 100_000, nao_dividido: 0, peso: 463_350, peso_da_rede: 463_350,
      resultado: 127_950 - 500 - 330_500 - 2_500 - 100_000,
    });
    expect(rede.linhas.resultado).toBe(resultadoA + resultadoB);
    expect(rede.por_loja.map((l) => ({ ...numeros(l), unidade: l.unidade, nome: l.nome }))).toEqual([
      { unidade: ids.lojaB, nome: "Loja B", ...lojaB, resultado: resultadoB },
      { unidade: ids.lojaA, nome: "Loja A", ...lojaA, resultado: resultadoA },
    ]);
    expect(rede.por_categoria.map((c) => [c.nome, Number(c.valor), Number(c.em_aberto)])).toEqual([
      ["Aluguel e condomínio", 300_000, 300_000], ["Impostos e taxas", 100_000, 100_000], ["Água, luz e internet", 20_500, 0], ["Marketing", 10_000, 10_000],
    ]);
    expect(rede.fora_do_resultado.map((c) => [c.nome, Number(c.valor)])).toEqual([["Mercadoria (fornecedor)", 100_000]]);
    expect(rede.meses.map((m) => m.mes)).toEqual([atual]);
    expect(numeros(rede.meses[0] as Mes)).toMatchObject({ receita_liquida: 463_350, rede: 100_000, resultado: resultadoA + resultadoB });
    expect(rede.lojas.map((l) => l.nome)).toEqual(expect.arrayContaining(["Loja A", "Loja B"]));

    const a = await resultado(dono, atual, ids.lojaA);
    expect(numeros(a.linhas)).toMatchObject({
      vendas: 5, bruto: 339_300, descontos: 100, vendido: 339_200, devolvido: 7_850, cancelado: 7_900, ...lojaA,
      a_conciliar: 2, despesas_em_aberto: 300_000, rede_em_aberto: 0, nao_dividido: 0, peso: 323_450, peso_da_rede: 463_350, resultado: resultadoA,
    });
    expect(a.por_loja).toEqual([]);
    expect(a.por_categoria.map((c) => c.nome)).toEqual(["Aluguel e condomínio", "Água, luz e internet"]);
    expect(a.fora_do_resultado.map((c) => c.nome)).toEqual(["Mercadoria (fornecedor)"]);
    const b = await resultado(dono, atual, ids.lojaB);
    expect(numeros(b.linhas)).toMatchObject({ vendas: 1, ...lojaB, peso: 139_900, resultado: resultadoB });
    expect(b.fora_do_resultado).toEqual([]);
  });

  it("loja com receita negativa não recebe parte da rede; mês sem venda fica sem divisão; a série mostra cada mês", async () => {
    const [atual, anterior, retrasado] = [await mes(), await mes(-1), await mes(-2)];
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const va = await novaVenda(ana);
    await adicionar(ana, va, cat.aparelho, itens.a1);
    await concluir(ana, va, [{ meio: "dinheiro", valor: 149_900 }]);
    // Loja B: capa vendida no mês passado e devolvida agora (a receita da loja B fica negativa neste mês).
    const betoB = await naLoja(ids.vendedorAB, ids.lojaB);
    await abrirCaixa(betoB);
    const vb = await novaVenda(betoB);
    const capa = await adicionar(betoB, vb, cat.capa, null);
    await concluir(betoB, vb, [{ meio: "dinheiro", valor: 7_900 }]);
    const donoB = await naLoja(ids.dono, ids.lojaB);
    await abrirCaixa(donoB);
    await devolver(donoB, vb, [{ item: capa, quantidade: 1, condicao: "novo" }], [{ meio: "dinheiro", valor: 7_900 }]);
    await db.query("update public.vendas set concluida_em = ($2::date + interval '10 days 12 hours') at time zone 'America/Sao_Paulo' where id = $1", [vb, anterior]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await lancar(dono, null, "Impostos e taxas", 1_001, atual);
    await lancar(dono, null, "Impostos e taxas", 5_000, anterior);
    await lancar(dono, null, "Outras", 3_000, retrasado);

    const rede = await resultado(dono, atual, null, 3);
    expect(rede.por_loja.map((l) => [l.nome, Number(l.receita_liquida), Number(l.rede), Number(l.resultado)])).toEqual([
      ["Loja A", 149_900, 1_001, 149_900 - 110_000 - 1_001],
      ["Loja B", -7_900, 0, -7_900 + 1_800],
    ]);
    expect(numeros(rede.linhas)).toMatchObject({ peso: 149_900, peso_da_rede: 149_900, rede: 1_001, nao_dividido: 0 });
    expect(rede.meses.map((m) => [m.mes, Number(m.receita_liquida), Number(m.rede), Number(m.resultado)])).toEqual([
      [retrasado, 0, 3_000, -3_000],
      [anterior, 7_900, 5_000, 7_900 - 1_800 - 5_000],
      [atual, 149_900 - 7_900, 1_001, 149_900 - 110_000 - 1_001 - 7_900 + 1_800],
    ]);
    // Sem venda no mês retrasado: a despesa da rede não se divide e entra só no resultado da rede.
    expect(numeros((await resultado(dono, retrasado)).linhas)).toMatchObject({ rede: 3_000, nao_dividido: 3_000, peso_da_rede: 0, resultado: -3_000 });
    const b = await resultado(dono, atual, ids.lojaB, 3);
    expect(b.meses.map((m) => [m.mes, Number(m.rede), Number(m.resultado)])).toEqual([
      [retrasado, 0, 0], [anterior, 5_000, 7_900 - 1_800 - 5_000], [atual, 0, -7_900 + 1_800],
    ]);
    expect(numeros(b.linhas)).toMatchObject({ vendas: 0, devolvido: 7_900, receita_liquida: -7_900, cmv: -1_800, peso: 0, peso_da_rede: 149_900 });
  });

  it("item sem custo gravado fica sem custo e é contado à parte", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    const item = await adicionar(ana, venda, cat.capa, null);
    await db.query("delete from public.venda_itens_custos where item_id = $1", [item]);
    await concluir(ana, venda, [{ meio: "dinheiro", valor: 7_900 }]);
    const r = await resultado(await naLoja(ids.dono, ids.lojaA), await mes(), ids.lojaA);
    expect(numeros(r.linhas)).toMatchObject({ vendido: 7_900, cmv: 0, margem_bruta: 7_900, vendido_com_custo: 0, vendido_sem_custo: 7_900, itens_sem_custo: 1 });
  });

  it("os meios que entram nas taxas são exatamente os que se conciliam (privado.meio_liquidavel)", async () => {
    const texto = (await db.query<{ v: string }>("select pg_get_functiondef('public.resultado_do_mes(date,uuid,integer)'::regprocedure) as v")).rows[0]?.v ?? "";
    const lista = /p\.meio in \(([^)]*)\)/.exec(texto)?.[1]?.split(",").map((m) => m.trim().replace(/'/g, "")).sort();
    const todos = ["dinheiro", "pix_direto", "pix_picpay", "cartao_picpay", "cartao_pagseguro", "link_pagamento", "payjoy", "aiva", "vale_troca"];
    const liquidaveis = (await db.query<{ m: string }>("select m from unnest($1::text[]) as m where privado.meio_liquidavel(m) order by m", [todos])).rows.map((r) => r.m);
    expect(lista).toEqual(liquidaveis);
  });
});

describe("categorias que entram no resultado (L8b)", () => {
  it("Mercadoria (fornecedor) nasce fora do resultado; o dono muda e cria categoria fora; o gerente não; tudo com motivo na auditoria", async () => {
    const lista = (await db.query<{ nome: string; entra: boolean }>(
      "select nome, entra_no_resultado as entra from public.contas_pagar_categorias where organizacao_id = $1 order by ordem", [ids.organizacao])).rows;
    expect(lista.filter((c) => !c.entra).map((c) => c.nome)).toEqual(["Mercadoria (fornecedor)"]);
    expect(lista).toHaveLength(8);
    // Rede nova: a lista inicial já nasce com a mercadoria fora.
    const nova = (await db.query<{ id: string }>("insert into public.organizacoes (nome) values ('Rede Nova do Teste') returning id")).rows[0]?.id;
    expect((await db.query<{ nome: string }>("select nome from public.contas_pagar_categorias where organizacao_id = $1 and not entra_no_resultado", [nova])).rows)
      .toEqual([{ nome: "Mercadoria (fornecedor)" }]);

    const dono = await naLoja(ids.dono, ids.lojaA);
    const outras = await categoria("Outras");
    expect(await valor(dono, CATEGORIA, [outras, "Outras", null, false])).toBe(outras);
    expect((await db.query<{ v: boolean }>("select entra_no_resultado as v from public.contas_pagar_categorias where id = $1", [outras])).rows[0]?.v).toBe(false);
    expect((await db.query<{ motivo: string }>(
      "select motivo from public.auditoria where alvo_id = $1 order by id desc limit 1", [outras])).rows[0]?.motivo).toBe("Categoria das contas a pagar alterada: Outras (fora do resultado do mês)");
    // Sem mudança, nada se grava; nulo mantém.
    expect(await valor(dono, CATEGORIA, [outras, "Outras", null, null])).toBe(outras);
    const emprestimo = await valor<string>(dono, CATEGORIA, [null, "Empréstimo", null, false]);
    expect((await db.query<{ v: boolean }>("select entra_no_resultado as v from public.contas_pagar_categorias where id = $1", [emprestimo])).rows[0]?.v).toBe(false);
    const nova2 = await valor<string>(dono, CATEGORIA, [null, "Frete", null, null]);
    expect((await db.query<{ v: boolean }>("select entra_no_resultado as v from public.contas_pagar_categorias where id = $1", [nova2])).rows[0]?.v).toBe(true);
    expect(await codigo(await naLoja(ids.gerenteB, ids.lojaB), CATEGORIA, [outras, "Outras", null, true])).toBe("P0002");
  });
});
