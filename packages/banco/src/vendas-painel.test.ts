// Painéis do Início (G1). public.vendas_painel soma as vendas do período inteiro no banco, por
// período, tipo de item, categoria, loja e vendedor de origem, com as regras de leitura de quem
// chama; public.ranking_nomes dá o nome de quem aparece no ranking só a quem tem ranking.ver.
// Os valores esperados estão conferidos à mão nos comentários. Dados fictícios.
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
  const s = { usuario, sessao: `67000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const linhas = async <T>(s: Sessao | null, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const { rows } = await db.query<T>(sql, params);
      await db.exec("release savepoint passo");
      return rows;
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      throw new Error(`${sql.slice(0, 70)} → ${(e as Error).message} (${(e as { code?: string }).code})`, { cause: e });
    }
  });
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) => (await linhas<{ v: T }>(s, sql, params))[0]?.v as T;
const erroDe = (s: Sessao | null, sql: string, params: unknown[]) =>
  linhas(s, sql, params).then(() => null, (e: { cause?: { code?: string } }) => e.cause?.code ?? "sem-codigo");

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
type Painel = { totais: Record<string, number>; periodos: Linha[]; tipos: Linha[]; categorias: Linha[]; lojas: Linha[]; vendedores: Linha[] };
// Janela em volta de "agora" (as vendas do teste são gravadas com now()); o máximo é 400 dias.
const INICIO = new Date(Date.now() - 2 * 86_400_000).toISOString();
const FIM = new Date(Date.now() + 2 * 86_400_000).toISOString();
const painel = (s: Sessao, unidade: string | null = null, inicio = INICIO, fim = FIM, porHora = false, vendedor: string | null = null) =>
  valor<Painel>(s, "select public.vendas_painel($1, $2, $3, $4, $5) as v", [inicio, fim, unidade, porHora, vendedor]);
const soma = (grao: Linha[], campo: string) => grao.reduce((s, l) => s + Number(l[campo] ?? 0), 0);
const VAZIO: Painel = {
  totais: { vendas: 0, vendido: 0, subtotal: 0, descontos: 0, vendas_com_desconto: 0, cancelamentos: 0, cancelado: 0, devolucoes: 0, devolvido: 0 },
  periodos: [], tipos: [], categorias: [], lojas: [], vendedores: [],
};
const SEM_ESTORNO = { cancelamentos: 0, cancelado: 0, devolucoes: 0, devolvido: 0 };
const ITENS_SEM_ESTORNO = { itens_cancelados: 0, cancelado: 0, itens_devolvidos: 0, devolvido: 0 };

// O dia da rede. Loja A: quatro vendas da Ana (V1 com troco; V2 com desconto, dois pagamentos e
// devolução parcial; V3 financiada; V5 com dois itens e três pagamentos) e uma do Beto (V4),
// cancelada pela gerência. Loja B: uma venda do Beto (V6).
//   Loja A: 7.900 + 15.700 + 149.900 + 7.900 + 157.800 = 339.200 (subtotal 339.300, desconto 100)
//   Loja B: 139.900 (o aparelho tem preço próprio na loja B)
//   Ana: 7.900 + 15.700 + 149.900 + 157.800 = 331.300; Beto: 7.900 + 139.900 = 147.800
//   Acessórios: 5 capas, 7.900 + 15.700 + 7.900 + 7.900 = 39.400; aparelhos: 3, 439.700
async function diaDaRede() {
  await db.query("update public.categorias set desconto_teto_pb = 1000, margem_minima_pb = 3000 where id = $1", [cat.acessorios]);
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  await abrirCaixa(ana);
  // V1: capa em dinheiro; o cliente dá R$ 100,00 e recebe troco (o troco não é venda).
  const v1 = await novaVenda(ana);
  await adicionar(ana, v1, cat.capa, null);
  await concluir(ana, v1, [{ meio: "dinheiro", valor: 10_000 }]);
  // V2: duas capas com R$ 1,00 de desconto no item; dois pagamentos, uma venda só.
  const v2 = await novaVenda(ana);
  const itemV2 = await adicionar(ana, v2, cat.capa, null, 2);
  expect(await valor<string>(ana, "select public.aplicar_desconto($1, 100) as v", [itemV2])).toBe("dentro_do_limite");
  await concluir(ana, v2, [{ meio: "pix_picpay", valor: 5_700, comprovante: "123456" }, { meio: "dinheiro", valor: 10_000 }]);
  // V3: aparelho financiado na PayJoy, com entrada em dinheiro (a venda é o preço inteiro).
  const v3 = await novaVenda(ana);
  await adicionar(ana, v3, cat.aparelho, itens.a1);
  await concluir(ana, v3, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: "dinheiro", parcelas: 12 }], { nome: "Cliente Teste", email: "cliente@teste.invalid" });
  // V5: aparelho e capa na mesma venda, três pagamentos: dois itens x três pagamentos é uma venda.
  const v5 = await novaVenda(ana);
  await adicionar(ana, v5, cat.aparelho, itens.a2);
  await adicionar(ana, v5, cat.capa, null);
  await concluir(ana, v5, [
    { meio: "dinheiro", valor: 50_000 }, { meio: "pix_direto", valor: 57_800, comprovante: "E2E-FICTICIO-5" }, { meio: "pix_picpay", valor: 50_000, comprovante: "654321" },
  ]);
  // V4: capa vendida pelo Beto na loja A, por Pix.
  const beto = await naLoja(ids.vendedorAB, ids.lojaA);
  await abrirCaixa(beto);
  const v4 = await novaVenda(beto);
  await adicionar(beto, v4, cat.capa, null);
  await concluir(beto, v4, [{ meio: "pix_direto", valor: 7_900, comprovante: "E2E-FICTICIO-9" }]);
  // A gerência (dono, com o próprio caixa) devolve uma capa da V2 e cancela a V4. A capa devolvida
  // leva metade do desconto do item: 7.900 − 50 = 7.850.
  const dono = await naLoja(ids.dono, ids.lojaA);
  await abrirCaixa(dono);
  await devolver(dono, v2, [{ item: itemV2, quantidade: 1, condicao: "novo" }], [{ meio: "dinheiro", valor: 7_850 }]);
  await cancelar(dono, v4);
  // V6: o Beto também vende na loja B.
  const betoB = await naLoja(ids.vendedorAB, ids.lojaB);
  await abrirCaixa(betoB);
  const v6 = await novaVenda(betoB);
  await adicionar(betoB, v6, cat.aparelho, itens.b1);
  await concluir(betoB, v6, [{ meio: "dinheiro", valor: 139_900 }]);
  return { v1, v2, v3, v4, v5, v6 };
}

describe("vendas_painel: soma o período inteiro, cada fato na própria data, sem contar nada duas vezes", () => {
  it("totais, períodos, mix, lojas e vendedores de origem batem entre si e com o painel financeiro", async () => {
    await diaDaRede();
    const dono = await naLoja(ids.dono, ids.lojaA);
    const rede = await painel(dono);

    expect(rede.totais).toEqual({
      vendas: 6, vendido: 479_100, subtotal: 479_200, descontos: 100, vendas_com_desconto: 1,
      cancelamentos: 1, cancelado: 7_900, devolucoes: 1, devolvido: 7_850,
    });
    // Tudo aconteceu agora: um período só, com os números dos totais.
    expect(rede.periodos).toHaveLength(1);
    expect(rede.periodos[0]).toMatchObject({
      vendas: 6, vendido: 479_100, subtotal: 479_200, descontos: 100, cancelamentos: 1, cancelado: 7_900, devolucoes: 1, devolvido: 7_850,
    });
    // Mix pelo tipo gravado no item: o desconto, o cancelamento e a devolução ficam no tipo do item.
    const acessorios = { itens: 5, vendido: 39_400, itens_cancelados: 1, cancelado: 7_900, itens_devolvidos: 1, devolvido: 7_850 };
    const aparelhos = { itens: 3, vendido: 439_700, ...ITENS_SEM_ESTORNO };
    expect(rede.tipos).toEqual([{ tipo: "acessorio", ...acessorios }, { tipo: "aparelho", ...aparelhos }]);
    expect(rede.categorias).toEqual([
      { categoria_id: cat.acessorios, categoria: "Acessórios", ...acessorios },
      { categoria_id: cat.celulares, categoria: "Celulares", ...aparelhos },
    ]);
    expect(rede.lojas).toEqual([
      { unidade_id: ids.lojaA, nome: "Loja A", vendas: 5, vendido: 339_200, cancelamentos: 1, cancelado: 7_900, devolucoes: 1, devolvido: 7_850 },
      { unidade_id: ids.lojaB, nome: "Loja B", vendas: 1, vendido: 139_900, ...SEM_ESTORNO },
    ]);
    // Vendedor de origem, do maior para o menor: a devolução e o cancelamento feitos pela gerência,
    // em outro caixa, ficam com quem vendeu.
    expect(rede.vendedores).toEqual([
      { vendedor_id: ids.vendedorA, vendas: 4, vendido: 331_300, cancelamentos: 0, cancelado: 0, devolucoes: 1, devolvido: 7_850 },
      { vendedor_id: ids.vendedorAB, vendas: 2, vendido: 147_800, cancelamentos: 1, cancelado: 7_900, devolucoes: 0, devolvido: 0 },
    ]);
    // Cada grão fecha com o total: nada some e nada conta duas vezes.
    for (const grao of [rede.periodos, rede.tipos, rede.categorias, rede.lojas, rede.vendedores]) {
      expect(soma(grao, "vendido")).toBe(rede.totais.vendido);
      expect(soma(grao, "cancelado")).toBe(rede.totais.cancelado);
      expect(soma(grao, "devolvido")).toBe(rede.totais.devolvido);
    }
    expect(soma(rede.lojas, "vendas")).toBe(6);
    expect(soma(rede.vendedores, "vendas")).toBe(6);

    // Os mesmos fatos do painel financeiro, na mesma janela e no mesmo escopo.
    const comuns = (l: Linha) => ({
      periodo: l.periodo, vendas: l.vendas, vendido: l.vendido, cancelamentos: l.cancelamentos, cancelado: l.cancelado, devolucoes: l.devolucoes, devolvido: l.devolvido,
    });
    for (const [unidade, porHora] of [[null, false], [ids.lojaA, false], [ids.lojaA, true]] as const) {
      const financeiro = await valor<{ periodos: Linha[] }>(dono, "select public.financeiro_painel($1, $2, $3, $4) as v", [INICIO, FIM, unidade, porHora]);
      const vendas = await painel(dono, unidade, INICIO, FIM, porHora);
      expect(vendas.periodos.map(comuns)).toEqual(financeiro.periodos.map(comuns));
      expect(financeiro.periodos.length).toBeGreaterThan(0);
    }

    // Só a loja A.
    const lojaA = await painel(dono, ids.lojaA);
    expect(lojaA.totais).toEqual({
      vendas: 5, vendido: 339_200, subtotal: 339_300, descontos: 100, vendas_com_desconto: 1,
      cancelamentos: 1, cancelado: 7_900, devolucoes: 1, devolvido: 7_850,
    });
    expect(lojaA.lojas.map((l) => l.nome)).toEqual(["Loja A"]);
    expect(soma(lojaA.tipos, "vendido")).toBe(339_200);
  });

  it("cada fato no dia e na hora de São Paulo: a venda no dia dela; a devolução e o cancelamento, nos deles", async () => {
    const { v1, v2, v4 } = await diaDaRede();
    // V2 às 10h15 e V4 às 11h de 20/10; V1 às 23h30 de 20/10 em São Paulo (já 21/10 em UTC).
    await db.query("update public.vendas set concluida_em = '2025-10-20T13:15:00Z' where id = $1", [v2]);
    await db.query("update public.vendas set concluida_em = '2025-10-21T02:30:00Z' where id = $1", [v1]);
    // A devolução da V2 em 21/10 às 9h; a V4 cancelada em 22/10 ao meio-dia. A devolução só aceita
    // inserção: a data é fabricada com as travas desligadas só neste comando (o fato em si é real).
    await db.exec("set session_replication_role = replica");
    await db.query("update public.venda_devolucoes set criado_em = '2025-10-21T12:00:00Z' where venda_id = $1", [v2]);
    await db.exec("set session_replication_role = origin");
    await db.query("update public.vendas set concluida_em = '2025-10-20T14:00:00Z', cancelada_em = '2025-10-22T15:00:00Z' where id = $1", [v4]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const dia = (d: number) => [`2025-10-${d}T03:00:00Z`, `2025-10-${d + 1}T03:00:00Z`] as const;

    const dia20 = await painel(dono, ids.lojaA, ...dia(20));
    expect(dia20.totais).toEqual({
      vendas: 3, vendido: 7_900 + 15_700 + 7_900, subtotal: 31_600, descontos: 100, vendas_com_desconto: 1, ...SEM_ESTORNO,
    });
    expect(dia20.periodos).toEqual([expect.objectContaining({ periodo: "2025-10-20", vendas: 3, vendido: 31_500 })]);
    expect(dia20.tipos).toEqual([{ tipo: "acessorio", itens: 4, vendido: 31_500, ...ITENS_SEM_ESTORNO }]);
    const porHora = await painel(dono, ids.lojaA, ...dia(20), true);
    expect(porHora.periodos.map((l) => [l.periodo, l.vendas, l.vendido])).toEqual([
      ["2025-10-20T10", 1, 15_700], ["2025-10-20T11", 1, 7_900], ["2025-10-20T23", 1, 7_900],
    ]);

    // 21/10: nenhuma venda; só a devolução, com o item e o vendedor de origem.
    const dia21 = await painel(dono, ids.lojaA, ...dia(21));
    expect(dia21.totais).toEqual({ ...VAZIO.totais, devolucoes: 1, devolvido: 7_850 });
    expect(dia21.periodos).toEqual([expect.objectContaining({ periodo: "2025-10-21", vendas: 0, vendido: 0, devolucoes: 1, devolvido: 7_850 })]);
    expect(dia21.tipos).toEqual([{ tipo: "acessorio", itens: 0, vendido: 0, itens_cancelados: 0, cancelado: 0, itens_devolvidos: 1, devolvido: 7_850 }]);
    expect(dia21.vendedores).toEqual([{ vendedor_id: ids.vendedorA, vendas: 0, vendido: 0, cancelamentos: 0, cancelado: 0, devolucoes: 1, devolvido: 7_850 }]);

    // 22/10: só o cancelamento, com o item e o vendedor de origem.
    const dia22 = await painel(dono, ids.lojaA, ...dia(22));
    expect(dia22.totais).toEqual({ ...VAZIO.totais, cancelamentos: 1, cancelado: 7_900 });
    expect(dia22.tipos).toEqual([{ tipo: "acessorio", itens: 0, vendido: 0, itens_cancelados: 1, cancelado: 7_900, itens_devolvidos: 0, devolvido: 0 }]);
    expect(dia22.vendedores).toEqual([{ vendedor_id: ids.vendedorAB, vendas: 0, vendido: 0, cancelamentos: 1, cancelado: 7_900, devolucoes: 0, devolvido: 0 }]);

    // Os três dias juntos: três períodos em ordem, e o total é a soma deles.
    const tres = await painel(dono, ids.lojaA, "2025-10-20T03:00:00Z", "2025-10-23T03:00:00Z");
    expect(tres.periodos.map((l) => [l.periodo, l.vendido, l.devolvido, l.cancelado])).toEqual([
      ["2025-10-20", 31_500, 0, 0], ["2025-10-21", 0, 7_850, 0], ["2025-10-22", 0, 0, 7_900],
    ]);
    // O fim da janela não entra: a venda das 23h30 fica fora de uma janela que termina às 23h30.
    expect((await painel(dono, ids.lojaA, "2025-10-20T03:00:00Z", "2025-10-21T02:30:00Z")).totais.vendas).toBe(2);
    expect((await painel(dono, ids.lojaA, "2025-10-21T02:30:00Z", "2025-10-21T03:00:00Z")).totais.vendas).toBe(1);
  });

  it("período sem fatos devolve zeros e listas vazias, não um erro", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await painel(dono, ids.lojaA)).toEqual(VAZIO);
    expect(await painel(dono)).toEqual(VAZIO);
  });

  it("o tipo é o gravado no item; a categoria é a atual do cadastro", async () => {
    await diaDaRede();
    await db.query("update public.produtos set categoria_id = $1 where id = $2", [cat.chips, cat.produtoCapa]);
    const p = await painel(await naLoja(ids.dono, ids.lojaA));
    expect(p.categorias.map((l) => [l.categoria, l.vendido])).toEqual([["Celulares", 439_700], ["Chips", 39_400]]);
    expect(p.tipos.map((l) => [l.tipo, l.vendido])).toEqual([["acessorio", 39_400], ["aparelho", 439_700]]);
  });

  it("soma mais linhas do que a API devolve numa página (1.200 vendas, dois itens em cada uma)", async () => {
    await db.query(`
      insert into public.vendas (organizacao_id, unidade_id, vendedor_id, chave_criacao, situacao, subtotal_centavos, desconto_centavos, total_centavos, troco_centavos, concluida_em)
      select $1, $2, $3, 'volume:' || n, 'concluida', 1_000, 0, 1_000, 0, now() from generate_series(1, 1200) n`, [ids.organizacao, ids.lojaA, ids.vendedorA]);
    // Em cada venda: 1 x R$ 4,00 + 2 x R$ 3,00 = R$ 10,00.
    await db.query(`
      insert into public.venda_itens (organizacao_id, venda_id, chave, variante_id, tipo, quantidade, preco_unitario_centavos)
      select v.organizacao_id, v.id, k.chave, $1, 'acessorio', k.quantidade, k.preco
      from public.vendas v cross join (values ('a', 1, 400), ('b', 2, 300)) as k (chave, quantidade, preco)
      where v.chave_criacao like 'volume:%'`, [cat.capa]);
    const p = await painel(await naLoja(ids.dono, ids.lojaA), ids.lojaA);
    expect(p.totais).toMatchObject({ vendas: 1200, vendido: 1_200_000, subtotal: 1_200_000 });
    expect(p.tipos).toEqual([{ tipo: "acessorio", itens: 3_600, vendido: 1_200_000, ...ITENS_SEM_ESTORNO }]);
    expect(p.lojas).toEqual([expect.objectContaining({ nome: "Loja A", vendas: 1200, vendido: 1_200_000 })]);
    expect(p.vendedores).toEqual([expect.objectContaining({ vendedor_id: ids.vendedorA, vendas: 1200, vendido: 1_200_000 })]);
  });

  it("período sem datas, invertido ou maior que 400 dias é recusado", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const sql = "select public.vendas_painel($1, $2, $3)";
    expect(await erroDe(dono, sql, [FIM, INICIO, ids.lojaA])).toBe("22023");
    expect(await erroDe(dono, sql, [INICIO, INICIO, ids.lojaA])).toBe("22023");
    expect(await erroDe(dono, sql, [null, FIM, ids.lojaA])).toBe("22023");
    expect(await erroDe(dono, sql, ["2025-01-01T00:00:00Z", "2026-03-01T00:00:00Z", ids.lojaA])).toBe("22023");
  });
});

describe("vendas_painel: cada um soma só o que pode ver", () => {
  it("vendedor soma as próprias vendas nas lojas em que vende; pedir as do colega não devolve nada", async () => {
    await diaDaRede();
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const daAna = await painel(ana);
    expect(daAna.totais).toMatchObject({ vendas: 4, vendido: 331_300, devolucoes: 1, devolvido: 7_850, cancelamentos: 0 });
    expect(daAna.vendedores.map((l) => l.vendedor_id)).toEqual([ids.vendedorA]);
    expect(daAna.lojas.map((l) => [l.nome, l.vendas])).toEqual([["Loja A", 4]]);
    expect(await painel(ana, null, INICIO, FIM, false, ids.vendedorAB)).toEqual(VAZIO);
    expect(await painel(ana, ids.lojaB)).toEqual(VAZIO);

    // O Beto vende nas duas lojas: sem filtro soma as duas; com a loja, só a dela.
    const beto = await naLoja(ids.vendedorAB, ids.lojaA);
    const doBeto = await painel(beto);
    expect(doBeto.totais).toMatchObject({ vendas: 2, vendido: 147_800, cancelamentos: 1, cancelado: 7_900 });
    expect(doBeto.lojas.map((l) => [l.nome, l.vendas, l.vendido])).toEqual([["Loja A", 1, 7_900], ["Loja B", 1, 139_900]]);
    expect(doBeto.vendedores.map((l) => l.vendedor_id)).toEqual([ids.vendedorAB]);
    expect((await painel(beto, ids.lojaB)).totais).toMatchObject({ vendas: 1, vendido: 139_900 });
  });

  it("gerente soma a loja inteira e nada de outra; dono e administrador somam a rede e filtram por loja e vendedor", async () => {
    await diaDaRede();
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    const daLojaB = await painel(gerenteB);
    expect(daLojaB.totais).toMatchObject({ vendas: 1, vendido: 139_900 });
    expect(daLojaB.lojas.map((l) => l.unidade_id)).toEqual([ids.lojaB]);
    expect(daLojaB.vendedores.map((l) => l.vendedor_id)).toEqual([ids.vendedorAB]);
    expect(await painel(gerenteB, ids.lojaA)).toEqual(VAZIO);
    expect(await painel(gerenteB, null, INICIO, FIM, false, ids.vendedorA)).toEqual(VAZIO);

    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await painel(dono, ids.lojaB)).totais).toMatchObject({ vendas: 1, vendido: 139_900 });
    const doBeto = await painel(dono, null, INICIO, FIM, false, ids.vendedorAB);
    expect(doBeto.totais).toMatchObject({ vendas: 2, vendido: 147_800 });
    expect(doBeto.lojas.map((l) => [l.nome, l.vendido])).toEqual([["Loja A", 7_900], ["Loja B", 139_900]]);
    expect((await painel(dono, ids.lojaA, INICIO, FIM, false, ids.vendedorAB)).totais).toMatchObject({ vendas: 1, vendido: 7_900 });

    const admin = await naLoja(ids.administrador, ids.lojaA);
    expect((await painel(admin)).totais).toMatchObject({ vendas: 6, vendido: 479_100 });
  });

  it("outra rede, técnico e quem não tem vínculo recebem zero; visitante não executa", async () => {
    await diaDaRede();
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await painel(outraRede)).toEqual(VAZIO);
    expect(await painel(outraRede, ids.lojaA)).toEqual(VAZIO);
    expect(await painel(outraRede, null, INICIO, FIM, false, ids.vendedorA)).toEqual(VAZIO);
    expect(await painel(await naLoja(ids.tecnico, ids.assistencia))).toEqual(VAZIO);
    expect(await painel({ usuario: ids.semVinculo, sessao: "67000000-0000-4000-8000-999999999999" })).toEqual(VAZIO);
    expect(await erroDe(null, "select public.vendas_painel($1, $2)", [INICIO, FIM])).toBe("42501");
  });

  it("loja inativada continua na soma da rede, sem o nome (a tela escreve que a loja está inativa)", async () => {
    await diaDaRede();
    await db.query("update public.unidades set status = 'inativa' where id = $1", [ids.lojaB]);
    const p = await painel(await naLoja(ids.dono, ids.lojaA));
    expect(p.totais).toMatchObject({ vendas: 6, vendido: 479_100 });
    expect(p.lojas.map((l) => [l.unidade_id, l.nome, l.vendido])).toEqual([[ids.lojaA, "Loja A", 339_200], [ids.lojaB, null, 139_900]]);
  });
});

describe("ranking_nomes: o nome só para quem tem ranking.ver na loja da venda", () => {
  const TODOS = [ids.vendedorA, ids.vendedorAB, ids.gerenteB, ids.tecnico, ids.dono, ids.donoOutraOrg];
  const nomes = (s: Sessao | null, pessoas: string[] | null = TODOS) =>
    linhas<Record<string, string>>(s, "select * from public.ranking_nomes($1::uuid[]) order by nome", [pessoas]);

  it("dono e administrador leem quem vendeu na rede; o gerente, só quem vendeu na loja dele", async () => {
    await diaDaRede();
    const ana = { id: ids.vendedorA, nome: "vendedor.a" };
    const beto = { id: ids.vendedorAB, nome: "vendedor.ab" };
    // Só id e nome (sem e-mail nem situação), e só de quem tem venda: gerente, técnico e dono não vieram.
    expect(await nomes(await naLoja(ids.dono, ids.lojaA))).toEqual([ana, beto]);
    expect(await nomes(await naLoja(ids.administrador, ids.lojaB))).toEqual([ana, beto]);
    // A Ana só vendeu na loja A: o gerente da loja B não recebe o nome dela.
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await nomes(gerenteB)).toEqual([beto]);
    expect(await nomes(gerenteB, [ids.vendedorA])).toEqual([]);
    // Por isso a função existe: direto na tabela, o gerente não lê o perfil do colega.
    expect(await linhas(gerenteB, "select nome from public.perfis_usuario where id = $1", [ids.vendedorAB])).toEqual([]);
    // Venda que não foi concluída não entra no ranking nem dá o nome: o rascunho do próprio gerente
    // na loja B não o põe na lista (ele está entre os pedidos).
    await novaVenda(gerenteB);
    expect(await nomes(gerenteB)).toEqual([beto]);
  });

  it("vendedor, técnico e outra rede não recebem nome nenhum; visitante não executa", async () => {
    await diaDaRede();
    const semRanking = [[ids.vendedorA, ids.lojaA], [ids.vendedorAB, ids.lojaB], [ids.tecnico, ids.assistencia], [ids.donoOutraOrg, ids.lojaOutraOrg]] as const;
    for (const [usuario, loja] of semRanking) expect(await nomes(await naLoja(usuario, loja)), usuario).toEqual([]);
    expect(await nomes({ usuario: ids.semVinculo, sessao: "67000000-0000-4000-8000-999999999998" })).toEqual([]);
    expect(await erroDe(null, "select * from public.ranking_nomes($1::uuid[])", [TODOS])).toBe("42501");
  });

  it("lista vazia ou ausente não devolve ninguém", async () => {
    await diaDaRede();
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await nomes(dono, [])).toEqual([]);
    expect(await nomes(dono, null)).toEqual([]);
  });
});
