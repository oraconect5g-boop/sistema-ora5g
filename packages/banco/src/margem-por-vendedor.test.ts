// Margem por vendedor (lote PERF-003b: ORA-PERF-003 e ORA-PERF-005): public.margem_por_vendedor, com as regras da
// margem_painel (G2) por vendedor de origem. Banco em memória com todas as migrations; dados FICTÍCIOS.
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
  const s = { usuario, sessao: `69000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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

type Soma = Record<string, number | string>;
type PorVendedor = { vendedores: Soma[]; lojas_com_custo: number; lojas_fora: number };
const INICIO = new Date(Date.now() - 2 * 86_400_000).toISOString();
const FIM = new Date(Date.now() + 2 * 86_400_000).toISOString();
const porVendedor = (s: Sessao | null, unidade: string | null = null) =>
  valor<PorVendedor>(s, "select public.margem_por_vendedor($1, $2, $3) as v", [INICIO, FIM, unidade]);
const margemDaRede = (s: Sessao, unidade: string | null = null) =>
  valor<{ totais: Soma }>(s, "select public.margem_painel($1, $2, $3) as v", [INICIO, FIM, unidade]);

const ZERO = {
  itens: 0, vendido: 0, itens_com_custo: 0, vendido_com_custo: 0, custo: 0, itens_sem_custo: 0, vendido_sem_custo: 0,
  itens_devolvidos_com_custo: 0, devolvido_com_custo: 0, custo_devolvido: 0, itens_cancelados_com_custo: 0, cancelado_com_custo: 0, custo_cancelado: 0, margem: 0,
};
const VAZIO: PorVendedor = { vendedores: [], lojas_com_custo: 0, lojas_fora: 0 };

// O mesmo dia da rede de margem-painel.test.ts (aparelho com custo de R$ 1.100,00; capa, de R$ 18,00):
//   Ana (loja A): V1 capa; V2 duas capas com R$ 1,00 de desconto, uma devolvida pelo dono; V3 aparelho; V5 aparelho e capa.
//   Beto: V4 capa na loja A, cancelada pelo dono; V6 aparelho na loja B (preço da loja B).
//   Ana: vendido 331.300, custo 227.200, devolução 7.850 − 1.800: margem 98.050.
//   Beto: vendido 147.800, custo 111.800, cancelamento 7.900 − 1.800: margem 29.900. A rede: 127.950.
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
}

const ANA = {
  ...ZERO, vendedor: ids.vendedorA, itens: 6, vendido: 331_300, itens_com_custo: 6, vendido_com_custo: 331_300, custo: 227_200,
  itens_devolvidos_com_custo: 1, devolvido_com_custo: 7_850, custo_devolvido: 1_800, margem: 98_050,
};
const BETO = {
  ...ZERO, vendedor: ids.vendedorAB, itens: 2, vendido: 147_800, itens_com_custo: 2, vendido_com_custo: 147_800, custo: 111_800,
  itens_cancelados_com_custo: 1, cancelado_com_custo: 7_900, custo_cancelado: 1_800, margem: 29_900,
};
const BETO_NA_A = { ...ZERO, vendedor: ids.vendedorAB, itens: 1, vendido: 7_900, itens_com_custo: 1, vendido_com_custo: 7_900, custo: 1_800, itens_cancelados_com_custo: 1, cancelado_com_custo: 7_900, custo_cancelado: 1_800 };
const BETO_NA_B = { ...ZERO, vendedor: ids.vendedorAB, itens: 1, vendido: 139_900, itens_com_custo: 1, vendido_com_custo: 139_900, custo: 110_000, margem: 29_900 };

describe("margem_por_vendedor (PERF-003b): a margem bruta por vendedor de origem, com as regras da margem_painel", () => {
  it("cada vendedor com as próprias parcelas; a devolução e o cancelamento ficam com o vendedor da venda; a soma bate com a da rede", async () => {
    await diaDaRede();
    const dono = await naLoja(ids.dono, ids.lojaA);
    const r = await porVendedor(dono);
    expect(r).toEqual({ vendedores: [ANA, BETO], lojas_com_custo: 2, lojas_fora: 0 });
    // o dono devolveu e cancelou, mas não vendeu: não aparece
    expect(r.vendedores.map((v) => v.vendedor)).not.toContain(ids.dono);
    // as parcelas dos vendedores somam as da rede (margem_painel), campo a campo
    const rede = (await margemDaRede(dono)).totais;
    for (const campo of Object.keys(ZERO)) expect(Number(ANA[campo as keyof typeof ANA]) + Number(BETO[campo as keyof typeof BETO]), campo).toBe(rede[campo]);
    // o filtro de loja separa: na loja A, o Beto só com a venda cancelada (margem zero); na loja B, só ele
    expect(await porVendedor(dono, ids.lojaA)).toEqual({ vendedores: [ANA, BETO_NA_A], lojas_com_custo: 1, lojas_fora: 0 });
    expect(await porVendedor(dono, ids.lojaB)).toEqual({ vendedores: [BETO_NA_B], lojas_com_custo: 1, lojas_fora: 0 });
  });

  it("item sem custo gravado fica fora da margem do vendedor e é contado", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const comCusto = await novaVenda(ana);
    await adicionar(ana, comCusto, cat.capa, null);
    await concluir(ana, comCusto, [{ meio: "dinheiro", valor: 7_900 }]);
    await db.query("delete from public.custos where variante_id = $1", [cat.capa]);
    const semCusto = await novaVenda(ana);
    await adicionar(ana, semCusto, cat.capa, null);
    await concluir(ana, semCusto, [{ meio: "dinheiro", valor: 7_900 }]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await porVendedor(dono)).vendedores).toEqual([{
      ...ZERO, vendedor: ids.vendedorA, itens: 2, vendido: 15_800, itens_com_custo: 1, vendido_com_custo: 7_900, custo: 1_800,
      itens_sem_custo: 1, vendido_sem_custo: 7_900, margem: 6_100,
    }]);
  });

  it("só quem vê o custo: o gerente, a loja dele; o vendedor, nada (a loja contada como fora); o administrador, a rede", async () => {
    await diaDaRede();
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await porVendedor(gerenteB)).toEqual({ vendedores: [BETO_NA_B], lojas_com_custo: 1, lojas_fora: 0 });
    expect(await porVendedor(gerenteB, ids.lojaA)).toEqual(VAZIO);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await porVendedor(ana)).toEqual({ ...VAZIO, lojas_fora: 1 });
    const beto = await naLoja(ids.vendedorAB, ids.lojaA);
    expect(await porVendedor(beto)).toEqual({ ...VAZIO, lojas_fora: 2 });
    const admin = await naLoja(ids.administrador, ids.lojaA);
    expect(await porVendedor(admin)).toEqual({ vendedores: [ANA, BETO], lojas_com_custo: 2, lojas_fora: 0 });
  });

  it("outra rede, técnico e quem não tem vínculo recebem a lista vazia; visitante não executa; período inválido é recusado", async () => {
    await diaDaRede();
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await porVendedor(outraRede)).toEqual(VAZIO);
    expect(await porVendedor(outraRede, ids.lojaA)).toEqual(VAZIO);
    const tecnico = await naLoja(ids.tecnico, ids.assistencia);
    expect(await porVendedor(tecnico)).toEqual(VAZIO);
    expect(await porVendedor({ usuario: ids.semVinculo, sessao: "69000000-0000-4000-8000-999999999999" })).toEqual(VAZIO);
    expect(await erroDe(null, "select public.margem_por_vendedor($1, $2)", [INICIO, FIM])).toBe("42501");
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await erroDe(dono, "select public.margem_por_vendedor($1, $2)", [FIM, INICIO])).toBe("22023");
    expect(await erroDe(dono, "select public.margem_por_vendedor($1, $2)", [new Date(Date.now() - 500 * 86_400_000).toISOString(), FIM])).toBe("22023");
  });
});
