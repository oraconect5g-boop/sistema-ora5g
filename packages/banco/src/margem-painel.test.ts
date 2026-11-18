// Margem bruta dos relatórios (lote G2): public.margem_painel e public.margem_itens.
// Contrato: docs/alinhamento/MATRIZ_DEMO_REAL.md, seção 3.5 (M1, M2 e M3).
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
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback");
});
afterAll(async () => {
  await db.close();
});

let sessoes = 0;
let chaves = 0;
const chave = (prefixo: string) => `${prefixo}:${++chaves}`;

async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `68000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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
const valor = async <T>(s: Sessao | null, sql: string, params: unknown[] = []) => (await linhas<{ v: T }>(s, sql, params))[0]?.v as T;
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

type Soma = Record<string, number>;
type Dia = Soma & { periodo: string };
type Margem = { totais: Soma; periodos: Dia[]; lojas_com_custo: number; lojas_fora: number };
type Item = {
  venda_id: string; numero: number; concluida_em: string; unidade_id: string; unidade: string | null; situacao: string;
  item_id: string; tipo: string; variante: string | null; sku: string | null; quantidade: number;
  preco_unitario: number; desconto: number; valor: number; custo_unitario: number | null; margem: number | null; devolvidos: number;
};
type Detalhe = { total: number; itens: Item[] };

const INICIO = new Date(Date.now() - 2 * 86_400_000).toISOString();
const FIM = new Date(Date.now() + 2 * 86_400_000).toISOString();
const margem = (s: Sessao | null, unidade: string | null = null, inicio = INICIO, fim = FIM) =>
  valor<Margem>(s, "select public.margem_painel($1, $2, $3) as v", [inicio, fim, unidade]);
const detalhe = (s: Sessao | null, unidade: string | null = null, limite = 50, apos = 0, inicio = INICIO, fim = FIM) =>
  valor<Detalhe>(s, "select public.margem_itens($1, $2, $3, $4, $5) as v", [inicio, fim, unidade, limite, apos]);
const soma = (grao: Soma[], campo: string) => grao.reduce((s, l) => s + Number(l[campo] ?? 0), 0);

const SEM_DEVOLUCAO = { itens_devolvidos_com_custo: 0, devolvido_com_custo: 0, custo_devolvido: 0 };
const SEM_CANCELAMENTO = { itens_cancelados_com_custo: 0, cancelado_com_custo: 0, custo_cancelado: 0 };
const ZERO: Soma = {
  itens: 0, vendido: 0, itens_com_custo: 0, vendido_com_custo: 0, custo: 0, itens_sem_custo: 0, vendido_sem_custo: 0,
  ...SEM_DEVOLUCAO, ...SEM_CANCELAMENTO, margem: 0,
};
const VAZIO: Margem = { totais: ZERO, periodos: [], lojas_com_custo: 0, lojas_fora: 0 };
const SEM_ITENS: Detalhe = { total: 0, itens: [] };

// O mesmo dia da rede de vendas-painel.test.ts. Custos do cenário: aparelho R$ 1.100,00, capa R$ 18,00.
//   Loja A, Ana: V1 capa (7.900 − 1.800 = 6.100); V2 duas capas com R$ 1,00 de desconto
//   (15.700 − 3.600 = 12.100), uma delas devolvida (sai 7.850 − 1.800 = 6.050); V3 aparelho
//   (149.900 − 110.000 = 39.900); V5 aparelho e capa (39.900 + 6.100 = 46.000).
//   Loja A, Beto: V4 capa (6.100), cancelada pela gerência (saem os 6.100).
//   Loja B, Beto: V6 aparelho no preço da loja B (139.900 − 110.000 = 29.900).
//   Vendido 479.100, custo 339.000: margem dos itens vendidos 140.100 (loja A 110.200, loja B 29.900).
//   Margem bruta: 140.100 − 6.050 − 6.100 = 127.950 (loja A 98.050, loja B 29.900).
async function diaDaRede() {
  await db.query("update public.categorias set desconto_teto_pb = 1000, margem_minima_pb = 3000 where id = $1", [cat.acessorios]);
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  await abrirCaixa(ana);
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
  await cancelar(dono, v4);
  const betoB = await naLoja(ids.vendedorAB, ids.lojaB);
  await abrirCaixa(betoB);
  const v6 = await novaVenda(betoB);
  await adicionar(betoB, v6, cat.aparelho, itens.b1);
  await concluir(betoB, v6, [{ meio: "dinheiro", valor: 139_900 }]);
  return { v1, v2, v3, v4, v5, v6, itemV2 };
}

const DEVOLUCAO_DA_V2 = { itens_devolvidos_com_custo: 1, devolvido_com_custo: 7_850, custo_devolvido: 1_800 };
const CANCELAMENTO_DA_V4 = { itens_cancelados_com_custo: 1, cancelado_com_custo: 7_900, custo_cancelado: 1_800 };
const REDE: Soma = {
  itens: 8, vendido: 479_100, itens_com_custo: 8, vendido_com_custo: 479_100, custo: 339_000, itens_sem_custo: 0, vendido_sem_custo: 0,
  ...DEVOLUCAO_DA_V2, ...CANCELAMENTO_DA_V4, margem: 127_950,
};
const LOJA_A: Soma = {
  itens: 7, vendido: 339_200, itens_com_custo: 7, vendido_com_custo: 339_200, custo: 229_000, itens_sem_custo: 0, vendido_sem_custo: 0,
  ...DEVOLUCAO_DA_V2, ...CANCELAMENTO_DA_V4, margem: 98_050,
};
const LOJA_B: Soma = { ...ZERO, itens: 1, vendido: 139_900, itens_com_custo: 1, vendido_com_custo: 139_900, custo: 110_000, margem: 29_900 };

type Vendas = { totais: Soma; tipos: Soma[] };
const vendasPainel = (s: Sessao, unidade: string | null = null) =>
  valor<Vendas>(s, "select public.vendas_painel($1, $2, $3) as v", [INICIO, FIM, unidade]);
const UM_DIA = expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/);

describe("margem_painel: a margem bruta do período, pelo custo gravado no item, cada fato na própria data", () => {
  it("totais e dias batem entre si, com vendas_painel e com o detalhe; o filtro de loja separa as lojas", async () => {
    await diaDaRede();
    const dono = await naLoja(ids.dono, ids.lojaA);
    const rede = await margem(dono);
    expect(rede).toEqual({ totais: REDE, periodos: [{ ...REDE, periodo: UM_DIA }], lojas_com_custo: 2, lojas_fora: 0 });
    expect(await margem(dono, ids.lojaA)).toEqual({ totais: LOJA_A, periodos: [{ ...LOJA_A, periodo: UM_DIA }], lojas_com_custo: 1, lojas_fora: 0 });
    expect(await margem(dono, ids.lojaB)).toEqual({ totais: LOJA_B, periodos: [{ ...LOJA_B, periodo: UM_DIA }], lojas_com_custo: 1, lojas_fora: 0 });
    for (const campo of Object.keys(REDE)) expect(Number(LOJA_A[campo]) + Number(LOJA_B[campo]), campo).toBe(REDE[campo]);

    // Os mesmos itens e os mesmos valores de vendas_painel: a margem não inventa nem perde venda.
    const vendas = await vendasPainel(dono);
    expect(rede.totais.vendido).toBe(vendas.totais.vendido);
    expect(rede.totais.itens).toBe(soma(vendas.tipos, "itens"));
    expect(rede.totais.devolvido_com_custo).toBe(vendas.totais.devolvido);
    expect(rede.totais.cancelado_com_custo).toBe(vendas.totais.cancelado);

    // O detalhe são os itens de "vendido": a soma das linhas é vendido com custo − custo.
    const itensDaRede = (await detalhe(dono)).itens;
    expect(soma(itensDaRede as unknown as Soma[], "valor")).toBe(REDE.vendido);
    expect(soma(itensDaRede as unknown as Soma[], "quantidade")).toBe(REDE.itens);
    expect(soma(itensDaRede as unknown as Soma[], "margem")).toBe(Number(REDE.vendido_com_custo) - Number(REDE.custo));
  });

  it("cada fato no dia de São Paulo: a venda no dia dela; a devolução e o cancelamento, nos deles", async () => {
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

    // 20/10: V2 (12.100), V4 (6.100) e V1 (6.100); a devolução e o cancelamento ainda não aconteceram.
    const DIA_20 = { ...ZERO, itens: 4, vendido: 31_500, itens_com_custo: 4, vendido_com_custo: 31_500, custo: 7_200, margem: 24_300 };
    expect(await margem(dono, ids.lojaA, ...dia(20))).toEqual({
      totais: DIA_20, periodos: [{ ...DIA_20, periodo: "2025-10-20" }], lojas_com_custo: 1, lojas_fora: 0,
    });
    // 21/10: nenhuma venda; só a devolução, que tira a margem da capa devolvida (o dia fica negativo).
    const DIA_21 = { ...ZERO, ...DEVOLUCAO_DA_V2, margem: -6_050 };
    expect(await margem(dono, ids.lojaA, ...dia(21))).toEqual({
      totais: DIA_21, periodos: [{ ...DIA_21, periodo: "2025-10-21" }], lojas_com_custo: 1, lojas_fora: 0,
    });
    // 22/10: só o cancelamento, que tira a margem inteira da V4.
    const DIA_22 = { ...ZERO, ...CANCELAMENTO_DA_V4, margem: -6_100 };
    expect(await margem(dono, ids.lojaA, ...dia(22))).toEqual({
      totais: DIA_22, periodos: [{ ...DIA_22, periodo: "2025-10-22" }], lojas_com_custo: 1, lojas_fora: 0,
    });

    // Os três dias juntos: três linhas em ordem, e o total é a soma delas.
    const tres = await margem(dono, ids.lojaA, "2025-10-20T03:00:00Z", "2025-10-23T03:00:00Z");
    expect(tres.periodos.map((l) => [l.periodo, l.margem])).toEqual([["2025-10-20", 24_300], ["2025-10-21", -6_050], ["2025-10-22", -6_100]]);
    expect(tres.totais).toEqual({ ...DIA_20, ...DEVOLUCAO_DA_V2, ...CANCELAMENTO_DA_V4, margem: 12_150 });
    for (const campo of Object.keys(ZERO)) expect(soma(tres.periodos, campo), campo).toBe(tres.totais[campo]);
    // O fim da janela não entra: a venda das 23h30 fica fora de uma janela que termina às 23h30.
    expect((await margem(dono, ids.lojaA, "2025-10-20T03:00:00Z", "2025-10-21T02:30:00Z")).totais.itens).toBe(3);
    expect((await margem(dono, ids.lojaA, "2025-10-21T02:30:00Z", "2025-10-21T03:00:00Z")).totais.itens).toBe(1);

    // O detalhe segue a data da venda: em 20/10, as três vendas, da mais nova para a mais antiga, com a
    // situação e as devoluções de hoje; em 21/10 não há item, só a devolução no resumo.
    const itensDoDia = await detalhe(dono, ids.lojaA, 50, 0, ...dia(20));
    expect(itensDoDia.total).toBe(3);
    expect(itensDoDia.itens.map((l) => [l.venda_id, l.situacao, l.devolvidos, l.margem])).toEqual([
      [v1, "concluida", 0, 6_100], [v4, "cancelada", 0, 6_100], [v2, "concluida", 1, 12_100],
    ]);
    expect(await detalhe(dono, ids.lojaA, 50, 0, ...dia(21))).toEqual(SEM_ITENS);
  });

  it("período sem fatos devolve zeros e listas vazias, não um erro", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await margem(dono)).toEqual(VAZIO);
    expect(await margem(dono, ids.lojaA)).toEqual(VAZIO);
    expect(await detalhe(dono)).toEqual(SEM_ITENS);
    expect(await detalhe(dono, ids.lojaA)).toEqual(SEM_ITENS);
  });

  it("item sem custo gravado não entra na margem e é contado; a devolução dele não tira margem", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const comCusto = await novaVenda(ana);
    await adicionar(ana, comCusto, cat.aparelho, itens.a1);
    await adicionar(ana, comCusto, cat.capa, null);
    await concluir(ana, comCusto, [{ meio: "dinheiro", valor: 157_800 }]);
    // A capa fica sem custo no cadastro: o item seguinte entra na venda sem custo gravado.
    await db.query("delete from public.custos where variante_id = $1", [cat.capa]);
    const semCusto = await novaVenda(ana);
    const itemSemCusto = await adicionar(ana, semCusto, cat.capa, null);
    await concluir(ana, semCusto, [{ meio: "dinheiro", valor: 7_900 }]);

    const dono = await naLoja(ids.dono, ids.lojaA);
    const VENDIDO = {
      ...ZERO, itens: 3, vendido: 165_700, itens_com_custo: 2, vendido_com_custo: 157_800, custo: 111_800,
      itens_sem_custo: 1, vendido_sem_custo: 7_900, margem: 46_000,
    };
    expect((await margem(dono)).totais).toEqual(VENDIDO);

    await abrirCaixa(dono);
    await devolver(dono, semCusto, [{ item: itemSemCusto, quantidade: 1, condicao: "novo" }], [{ meio: "dinheiro", valor: 7_900 }]);
    expect((await margem(dono)).totais).toEqual(VENDIDO);
    expect((await vendasPainel(dono)).totais).toMatchObject({ vendido: 165_700, devolvido: 7_900 });

    const linha = (await detalhe(dono)).itens.find((l) => l.item_id === itemSemCusto);
    expect(linha).toMatchObject({ valor: 7_900, custo_unitario: null, margem: null, devolvidos: 1, situacao: "concluida" });
  });

  it("custo novo não reescreve a margem da venda passada: vale o custo gravado no item", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const antes = await novaVenda(ana);
    await adicionar(ana, antes, cat.capa, null);
    await concluir(ana, antes, [{ meio: "dinheiro", valor: 7_900 }]);
    await db.query(
      "insert into public.custos (organizacao_id, variante_id, valor_centavos, inicio, origem) values ($1, $2, 5000, now(), 'manual')",
      [ids.organizacao, cat.capa],
    );
    const depois = await novaVenda(ana);
    await adicionar(ana, depois, cat.capa, null);
    await concluir(ana, depois, [{ meio: "dinheiro", valor: 7_900 }]);

    // A primeira capa continua com custo de R$ 18,00 (6.100); a segunda entra com R$ 50,00 (2.900).
    const dono = await naLoja(ids.dono, ids.lojaA);
    const DUAS = { ...ZERO, itens: 2, vendido: 15_800, itens_com_custo: 2, vendido_com_custo: 15_800, custo: 6_800, margem: 9_000 };
    expect((await margem(dono)).totais).toEqual(DUAS);
    // Apagar o custo do cadastro também não muda o que já foi vendido.
    await db.query("delete from public.custos where variante_id = $1", [cat.capa]);
    expect((await margem(dono)).totais).toEqual(DUAS);
    const porVenda = new Map((await detalhe(dono)).itens.map((l) => [l.venda_id, [l.custo_unitario, l.margem]]));
    expect(porVenda.get(antes)).toEqual([1_800, 6_100]);
    expect(porVenda.get(depois)).toEqual([5_000, 2_900]);
  });

  it("soma e pagina mais linhas do que a API devolve numa página (1.200 vendas, dois itens em cada uma)", async () => {
    await db.query(`
      insert into public.vendas (organizacao_id, unidade_id, vendedor_id, chave_criacao, situacao, subtotal_centavos, desconto_centavos, total_centavos, troco_centavos, concluida_em)
      select $1, $2, $3, 'volume:' || n, 'concluida', 1_000, 0, 1_000, 0, now() from generate_series(1, 1200) n`, [ids.organizacao, ids.lojaA, ids.vendedorA]);
    // Em cada venda: 1 x R$ 4,00 (item "a") + 2 x R$ 3,00 (item "b") = R$ 10,00.
    await db.query(`
      insert into public.venda_itens (organizacao_id, venda_id, chave, variante_id, tipo, quantidade, preco_unitario_centavos)
      select v.organizacao_id, v.id, k.chave, $1, 'acessorio', k.quantidade, k.preco
      from public.vendas v cross join (values ('a', 1, 400), ('b', 2, 300)) as k (chave, quantidade, preco)
      where v.chave_criacao like 'volume:%'`, [cat.capa]);
    // Só o item "a" tem custo gravado, de R$ 1,50: margem de R$ 2,50 em cada venda. O "b" fica sem custo.
    await db.query(`
      insert into public.venda_itens_custos (item_id, organizacao_id, unidade_id, custo_unitario_centavos)
      select i.id, v.organizacao_id, v.unidade_id, 150
      from public.venda_itens i join public.vendas v on v.id = i.venda_id
      where v.chave_criacao like 'volume:%' and i.chave = 'a'`);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await margem(dono, ids.lojaA)).totais).toEqual({
      ...ZERO, itens: 3_600, vendido: 1_200_000, itens_com_custo: 1_200, vendido_com_custo: 480_000, custo: 180_000,
      itens_sem_custo: 2_400, vendido_sem_custo: 720_000, margem: 300_000,
    });

    const vistos = new Set<string>();
    for (const [apos, esperado] of [[0, 1000], [1000, 1000], [2000, 400], [2400, 0]] as const) {
      const pagina = await detalhe(dono, ids.lojaA, 1000, apos);
      expect(pagina.total).toBe(2_400);
      expect(pagina.itens).toHaveLength(esperado);
      for (const l of pagina.itens) vistos.add(l.item_id);
    }
    expect(vistos.size).toBe(2_400);
  });

  it("período sem datas, invertido ou maior que 400 dias é recusado; página fora do limite também", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    for (const sql of ["select public.margem_painel($1, $2, $3)", "select public.margem_itens($1, $2, $3)"]) {
      expect(await erroDe(dono, sql, [FIM, INICIO, ids.lojaA]), sql).toBe("22023");
      expect(await erroDe(dono, sql, [INICIO, INICIO, ids.lojaA]), sql).toBe("22023");
      expect(await erroDe(dono, sql, [null, FIM, ids.lojaA]), sql).toBe("22023");
      expect(await erroDe(dono, sql, [INICIO, null, ids.lojaA]), sql).toBe("22023");
      // 400 dias exatos passam; 401 não.
      expect(await erroDe(dono, sql, ["2025-01-01T00:00:00Z", "2026-02-05T00:00:00Z", ids.lojaA]), sql).toBeNull();
      expect(await erroDe(dono, sql, ["2025-01-01T00:00:00Z", "2026-02-06T00:00:00Z", ids.lojaA]), sql).toBe("22023");
    }
    const pagina = "select public.margem_itens($1, $2, $3, $4, $5)";
    expect(await erroDe(dono, pagina, [INICIO, FIM, null, 1000, 0])).toBeNull();
    expect(await erroDe(dono, pagina, [INICIO, FIM, null, 0, 0])).toBe("22023");
    expect(await erroDe(dono, pagina, [INICIO, FIM, null, 1001, 0])).toBe("22023");
    expect(await erroDe(dono, pagina, [INICIO, FIM, null, null, 0])).toBe("22023");
    expect(await erroDe(dono, pagina, [INICIO, FIM, null, 50, -1])).toBe("22023");
    expect(await erroDe(dono, pagina, [INICIO, FIM, null, 50, null])).toBe("22023");
  });
});

describe("margem_painel e margem_itens: a margem só para quem tem custo.ver na loja da venda", () => {
  it("gerente recebe a margem da loja dele e nada de outra; dono e administrador, a da rede", async () => {
    await diaDaRede();
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    const daLojaB = { totais: LOJA_B, periodos: [{ ...LOJA_B, periodo: UM_DIA }], lojas_com_custo: 1, lojas_fora: 0 };
    expect(await margem(gerenteB)).toEqual(daLojaB);
    expect(await margem(gerenteB, ids.lojaB)).toEqual(daLojaB);
    expect(await margem(gerenteB, ids.lojaA)).toEqual(VAZIO);
    expect((await detalhe(gerenteB)).itens.map((l) => [l.unidade, l.margem])).toEqual([["Loja B", 29_900]]);
    expect(await detalhe(gerenteB, ids.lojaA)).toEqual(SEM_ITENS);

    const admin = await naLoja(ids.administrador, ids.lojaA);
    expect(await margem(admin)).toMatchObject({ totais: REDE, lojas_com_custo: 2, lojas_fora: 0 });
    expect((await detalhe(admin)).total).toBe(7);
  });

  it("vendedor não recebe margem nem custo: a loja dele fica fora e é só contada", async () => {
    await diaDaRede();
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await margem(ana)).toEqual({ ...VAZIO, lojas_fora: 1 });
    expect(await margem(ana, ids.lojaA)).toEqual({ ...VAZIO, lojas_fora: 1 });
    expect(await margem(ana, ids.lojaB)).toEqual(VAZIO);
    expect(await detalhe(ana)).toEqual(SEM_ITENS);
    expect(await linhas(ana, "select item_id from public.venda_itens_custos")).toEqual([]);
    // O Beto vende nas duas lojas e não lê custo em nenhuma.
    const beto = await naLoja(ids.vendedorAB, ids.lojaA);
    expect(await margem(beto)).toEqual({ ...VAZIO, lojas_fora: 2 });
    expect(await detalhe(beto)).toEqual(SEM_ITENS);
  });

  it("quem lê as vendas da loja sem custo.ver não recebe margem, e o custo escondido não vira item sem custo", async () => {
    await diaDaRede();
    await db.query("delete from public.papel_permissoes where papel = 'gerente' and permissao = 'custo.ver'");
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect((await vendasPainel(gerenteB)).totais).toMatchObject({ vendas: 1, vendido: 139_900 });
    expect(await margem(gerenteB)).toEqual({ ...VAZIO, lojas_fora: 1 });
    expect(await detalhe(gerenteB)).toEqual(SEM_ITENS);
    expect(await linhas(gerenteB, "select item_id from public.venda_itens_custos")).toEqual([]);
  });

  it("loja com custo.ver entra e loja sem custo.ver fica fora do numerador e do denominador, só contada", async () => {
    await diaDaRede();
    // O gerente da loja B também vende na loja A, como vendedor: lá ele lê as próprias vendas, não o custo.
    await db.query(
      "insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, inicio, fim) values ($1, $2, 'vendedor', 'unidade', $3, now() - interval '1 day', null)",
      [ids.gerenteB, ids.organizacao, ids.lojaA],
    );
    const naA = await naLoja(ids.gerenteB, ids.lojaA);
    await abrirCaixa(naA);
    const venda = await novaVenda(naA);
    await adicionar(naA, venda, cat.capa, null);
    await concluir(naA, venda, [{ meio: "dinheiro", valor: 7_900 }]);

    // No turno da loja B: a loja B inteira com margem; a venda dele na loja A aparece nas vendas, não na margem.
    const naB = await naLoja(ids.gerenteB, ids.lojaB);
    expect((await vendasPainel(naB)).totais).toMatchObject({ vendas: 2, vendido: 147_800 });
    expect(await margem(naB)).toEqual({ totais: LOJA_B, periodos: [{ ...LOJA_B, periodo: UM_DIA }], lojas_com_custo: 1, lojas_fora: 1 });
    expect(await margem(naB, ids.lojaA)).toEqual({ ...VAZIO, lojas_fora: 1 });
    expect((await detalhe(naB)).itens.map((l) => l.unidade_id)).toEqual([ids.lojaB]);
    // No turno da loja A ele é vendedor: nenhuma margem, e a loja A contada como fora.
    expect(await margem(naA)).toEqual({ ...VAZIO, lojas_fora: 1 });
    expect(await detalhe(naA)).toEqual(SEM_ITENS);
  });

  it("outra rede, técnico e quem não tem vínculo recebem zero; visitante não executa", async () => {
    await diaDaRede();
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await margem(outraRede)).toEqual(VAZIO);
    expect(await margem(outraRede, ids.lojaA)).toEqual(VAZIO);
    expect(await detalhe(outraRede)).toEqual(SEM_ITENS);
    expect(await detalhe(outraRede, ids.lojaA)).toEqual(SEM_ITENS);
    const tecnico = await naLoja(ids.tecnico, ids.assistencia);
    expect(await margem(tecnico)).toEqual(VAZIO);
    expect(await detalhe(tecnico)).toEqual(SEM_ITENS);
    const semVinculo = { usuario: ids.semVinculo, sessao: "68000000-0000-4000-8000-999999999999" };
    expect(await margem(semVinculo)).toEqual(VAZIO);
    expect(await detalhe(semVinculo)).toEqual(SEM_ITENS);
    expect(await erroDe(null, "select public.margem_painel($1, $2)", [INICIO, FIM])).toBe("42501");
    expect(await erroDe(null, "select public.margem_itens($1, $2)", [INICIO, FIM])).toBe("42501");
  });

  it("loja inativada continua na margem da rede; o detalhe traz a venda sem o nome da loja", async () => {
    const { v6 } = await diaDaRede();
    await db.query("update public.unidades set status = 'inativa' where id = $1", [ids.lojaB]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await margem(dono)).toMatchObject({ totais: REDE, lojas_com_custo: 2, lojas_fora: 0 });
    expect((await detalhe(dono)).itens.filter((l) => l.venda_id === v6)).toEqual([
      expect.objectContaining({ unidade_id: ids.lojaB, unidade: null, margem: 29_900 }),
    ]);
  });
});

describe("margem_itens: o detalhe por item das vendas concluídas no período", () => {
  it("uma linha por item, da venda mais nova para a mais antiga, com preço, desconto, custo gravado e margem", async () => {
    const { v1, v2, v3, v4, v5, v6, itemV2 } = await diaDaRede();
    const dono = await naLoja(ids.dono, ids.lojaA);
    const d = await detalhe(dono);
    expect(d.total).toBe(7);
    // Todas concluídas no mesmo instante (a transação do teste): vale o número da venda, do maior para o menor.
    expect(d.itens.map((l) => l.venda_id)).toEqual([v6, v4, v5, v5, v3, v2, v1]);
    const daVenda = (venda: string) => d.itens.filter((l) => l.venda_id === venda);

    expect(daVenda(v2)).toEqual([{
      venda_id: v2, numero: expect.any(Number), concluida_em: expect.any(String), unidade_id: ids.lojaA, unidade: "Loja A",
      situacao: "concluida", item_id: itemV2, tipo: "acessorio", variante: "Capa de proteção", sku: "ACE-0001", quantidade: 2,
      preco_unitario: 7_900, desconto: 100, valor: 15_700, custo_unitario: 1_800, margem: 12_100, devolvidos: 1,
    }]);
    expect(daVenda(v4)).toEqual([
      expect.objectContaining({ situacao: "cancelada", valor: 7_900, custo_unitario: 1_800, margem: 6_100, devolvidos: 0 }),
    ]);
    expect(daVenda(v6)).toEqual([expect.objectContaining({
      unidade_id: ids.lojaB, unidade: "Loja B", tipo: "aparelho", variante: "Galaxy A15 128 GB Azul", sku: "APA-0001",
      quantidade: 1, preco_unitario: 139_900, desconto: 0, valor: 139_900, custo_unitario: 110_000, margem: 29_900,
    })]);
    // Os dois itens da V5 foram criados no mesmo instante: entre eles vale o identificador, não a ordem de entrada.
    expect(daVenda(v5).map((l) => `${l.tipo}:${l.margem}`).sort()).toEqual(["acessorio:6100", "aparelho:39900"]);
    expect(daVenda(v3)).toEqual([expect.objectContaining({ tipo: "aparelho", preco_unitario: 149_900, margem: 39_900 })]);
    expect(daVenda(v1)).toEqual([expect.objectContaining({ tipo: "acessorio", margem: 6_100 })]);

    // Por loja, e em páginas que não repetem nem pulam item.
    expect((await detalhe(dono, ids.lojaB)).itens.map((l) => l.venda_id)).toEqual([v6]);
    expect((await detalhe(dono, ids.lojaA)).total).toBe(6);
    const paginas = [await detalhe(dono, null, 3, 0), await detalhe(dono, null, 3, 3), await detalhe(dono, null, 3, 6), await detalhe(dono, null, 3, 9)];
    expect(paginas.map((p) => [p.total, p.itens.length])).toEqual([[7, 3], [7, 3], [7, 1], [7, 0]]);
    expect(paginas.flatMap((p) => p.itens.map((l) => l.item_id))).toEqual(d.itens.map((l) => l.item_id));
  });
});
