// Lote EXT-a (17/11/2026; ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006; migration 20261117225818_extratos_e_conciliacao): o
// extrato da maquininha ou do banco importado por arquivo, as sugestões de conciliação, conciliar (uma linha ou as certas),
// ignorar, desfazer e o resumo. Dados FICTÍCIOS (NSU, comprovantes e valores inventados aqui); cada teste numa transação
// desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  await db.query("select privado.lancar_movimento($1, $2, 20, 'entrada_importacao', null, null, null, null, 'extratos:capaB')", [ids.lojaB, cat.capa]);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
let arquivos = 0;
const chave = (p: string) => `${p}:extratos:${String(++chaves).padStart(5, "0")}`;
const impressao = () => String(++arquivos).padStart(64, "0");
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
  const s = { usuario, sessao: `4b000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const linhas = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows, { criarSessao: false });
const recusa = (s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });
const hoje = async () => (await db.query<{ d: string }>("select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d")).rows[0]?.d ?? "";
const amanha = async () => (await db.query<{ d: string }>("select to_char((now() at time zone 'America/Sao_Paulo')::date + 1, 'YYYY-MM-DD') as d")).rows[0]?.d ?? "";

/** Uma venda da capa (R$ 79,00) concluída pela vendedora, com o pagamento dado; devolve o id do pagamento. */
async function vender(s: Sessao, pagamento: Record<string, unknown>): Promise<string> {
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, JSON.stringify([pagamento]), chave("concluir")]);
  return (await db.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1", [venda])).rows[0]?.id ?? "";
}
const IMPORTAR = "select public.extrato_importar($1, $2, $3, $4::text[], $5, $6, $7::jsonb, '{\"data\": 0}'::jsonb) as v";
const MEIOS = ["pix_picpay", "cartao_picpay", "pix_direto"];
type Importado = { extrato: string; numero: number; linhas: number; repetido: boolean };
const importar = (s: Sessao, unidade: string | null, l: unknown[], arquivo = impressao(), tipo = "maquininha", meios = MEIOS) =>
  valor<Importado>(s, IMPORTAR, [unidade, tipo, "PicPay da loja", meios, "extrato.csv", arquivo, JSON.stringify(l)]);
const linhaDe = async (extrato: string, numero: number) =>
  (await db.query<Record<string, unknown>>("select * from public.extrato_linhas where extrato_id = $1 and numero = $2", [extrato, numero])).rows[0] ?? {};
const pagamento = async (id: string) =>
  (await db.query<Record<string, unknown>>("select liquidado_em::text, valor_liquido_centavos, referencia_conciliacao, conciliado_em from public.venda_pagamentos where id = $1", [id])).rows[0] ?? {};

describe("a importação do extrato (EXT-a)", () => {
  it("grava o extrato e as linhas como chegaram; o mesmo arquivo devolve o mesmo extrato", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const d = await hoje();
    const arquivo = impressao();
    const r = await importar(dono, ids.lojaA, [
      { numero: 2, data: d, valor: 7900, taxa: 79, liquido: 7821, data_liquidacao: d, referencia: " NSU  123 ", terminal: "PP-01", descricao: "Venda crédito" },
      { numero: 3, data: d, valor: -7900, descricao: "Chargeback" },
    ], arquivo);
    expect(r).toMatchObject({ linhas: 2, repetido: false });
    expect(await linhaDe(r.extrato, 2)).toMatchObject({ valor_centavos: 7900, taxa_centavos: 79, liquido_centavos: 7821, referencia: "NSU 123", terminal: "PP-01", situacao: "pendente" });
    expect(await linhaDe(r.extrato, 3)).toMatchObject({ valor_centavos: -7900, taxa_centavos: null, situacao: "pendente" });
    expect(await importar(dono, ids.lojaA, [{ numero: 1, data: d, valor: 100 }], arquivo)).toMatchObject({ extrato: r.extrato, repetido: true, linhas: 2 });
    // O mesmo arquivo em outro lugar (outra loja ou a rede) é engano: recusa, sem misturar os extratos.
    expect(await recusa(dono, IMPORTAR, [ids.lojaB, "maquininha", "PicPay", MEIOS, "x.csv", arquivo, JSON.stringify([{ numero: 1, data: d, valor: 1 }])])).toBe("22023");
    const [extrato] = await linhas<{ periodo_inicio: string; fonte: string; unidade_id: string }>(dono, "select periodo_inicio::text, fonte, unidade_id from public.extratos where id = $1", [r.extrato]);
    expect(extrato).toEqual({ periodo_inicio: d, fonte: "PicPay da loja", unidade_id: ids.lojaA });
  });

  it("recusa a linha fora do formato e quem não concilia pagamentos ali; a rede só para quem concilia pela rede", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const d = await hoje();
    for (const l of [{ numero: 1, data: "17/11/2026", valor: 100 }, { numero: 1, data: d, valor: 0 }, { numero: 1, data: d, valor: "1,00" },
      { numero: 1, data: d, valor: 100, taxa: -1 }, { numero: 1, data: "2026-02-30", valor: 100 }, { numero: 0, data: d, valor: 100 }]) {
      expect(await recusa(dono, IMPORTAR, [ids.lojaA, "maquininha", "PicPay", MEIOS, "x.csv", impressao(), JSON.stringify([l])]), JSON.stringify(l)).toBe("22023");
    }
    expect(await recusa(dono, IMPORTAR, [ids.lojaA, "maquininha", "PicPay", MEIOS, "x.csv", impressao(), JSON.stringify([{ numero: 1, data: d, valor: 1 }, { numero: 1, data: d, valor: 2 }])])).toBe("22023");
    // Os meios: ao menos um, e só os que se conciliam (dinheiro e financeira não).
    for (const meios of [[], ["dinheiro"], ["pix_picpay", "payjoy"]]) {
      expect(await recusa(dono, IMPORTAR, [ids.lojaA, "maquininha", "PicPay", meios, "x.csv", impressao(), JSON.stringify([{ numero: 1, data: d, valor: 1 }])]), meios.join()).toBe("22023");
    }
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await recusa(ana, IMPORTAR, [ids.lojaA, "maquininha", "PicPay", MEIOS, "x.csv", impressao(), JSON.stringify([{ numero: 1, data: d, valor: 1 }])])).toBe("42501");
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await recusa(gerenteB, IMPORTAR, [ids.lojaA, "maquininha", "PicPay", MEIOS, "x.csv", impressao(), JSON.stringify([{ numero: 1, data: d, valor: 1 }])])).toBe("42501");
    expect(await recusa(gerenteB, IMPORTAR, [null, "banco", "Banco", ["pix_direto"], "x.ofx", impressao(), JSON.stringify([{ numero: 1, data: d, valor: 1 }])])).toBe("42501");
    const rede = await importar(dono, null, [{ numero: 1, data: d, valor: 3900, referencia: "E2E-9" }], impressao(), "banco", ["pix_direto", "pix_direto"]);
    expect(rede).toMatchObject({ linhas: 1 });
    expect(await linhas(dono, "select unidade_id, meios from public.extratos where id = $1", [rede.extrato])).toEqual([{ unidade_id: null, meios: ["pix_direto"] }]);
  });
});

describe("as sugestões e a conciliação (EXT-a)", () => {
  it("sugere o pagamento de mesmo valor, da loja, no dia; concilia com o líquido e a data do repasse; desfaz", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const pix = await vender(ana, { meio: "pix_picpay", valor: 7900, comprovante: "NSU-123" });
    await vender(ana, { meio: "cartao_picpay", valor: 7900, comprovante: "NSU-999" });
    const pagSeguro = await vender(ana, { meio: "cartao_pagseguro", valor: 7900, comprovante: "NSU-555" });
    const dono = await naLoja(ids.dono, ids.lojaA);
    const d = await hoje();
    const { extrato } = await importar(dono, ids.lojaA, [{ numero: 1, data: d, valor: 7900, taxa: 79, data_liquidacao: d, referencia: "NSU-123" }]);
    const sugestoes = await linhas<{ pagamento_id: string; pela_referencia: boolean; venda_numero: string }>(dono, "select * from public.extrato_sugestoes($1)", [extrato]);
    expect(sugestoes).toHaveLength(2);
    expect(sugestoes[0]).toMatchObject({ pagamento_id: pix, pela_referencia: true });
    expect(sugestoes.map((x) => x.pagamento_id)).not.toContain(pagSeguro);
    const linha = (await linhaDe(extrato, 1)).id as string;
    expect(await recusa(dono, "select public.extrato_conciliar($1, $2)", [linha, pagSeguro])).toBe("22023");
    expect(await valor(dono, "select public.extrato_conciliar($1, $2) as v", [linha, pix])).toEqual({ conciliada: true, repetida: false });
    expect(await pagamento(pix)).toMatchObject({ liquidado_em: d, valor_liquido_centavos: 7821, referencia_conciliacao: "NSU-123" });
    expect(await linhaDe(extrato, 1)).toMatchObject({ situacao: "conciliada", pagamento_id: pix });
    expect(await valor(dono, "select public.extrato_conciliar($1, $2) as v", [linha, pix])).toEqual({ conciliada: true, repetida: true });
    expect(await linhas(dono, "select * from public.extrato_sugestoes($1)", [extrato])).toEqual([]);
    expect(await valor(dono, "select public.extrato_desfazer($1, 'Linha errada') as v", [linha])).toBe(true);
    expect(await pagamento(pix)).toMatchObject({ liquidado_em: null, conciliado_em: null });
    expect(await linhaDe(extrato, 1)).toMatchObject({ situacao: "pendente", pagamento_id: null, decidida_em: null });
    // Desfeita na tela da conciliação (fora do extrato), a linha também volta para pendente.
    await valor(dono, "select public.extrato_conciliar($1, $2) as v", [linha, pix]);
    expect(await valor(dono, "select public.pagamento_desconciliar($1, 'Pela tela da conciliação') as v", [pix])).toBe(true);
    expect(await linhaDe(extrato, 1)).toMatchObject({ situacao: "pendente", pagamento_id: null });
  });

  it("o repasse no futuro ainda não concilia; as certas em lote: uma sugestão só, que não é de outra linha", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const cartao = await vender(ana, { meio: "cartao_picpay", valor: 7900, comprovante: "NSU-1" });
    const pixDireto = await vender(ana, { meio: "pix_direto", valor: 7900, comprovante: "E2E-1" });
    const dono = await naLoja(ids.dono, ids.lojaA);
    const d = await hoje();
    const { extrato } = await importar(dono, ids.lojaA, [
      { numero: 1, data: d, valor: 7900, data_liquidacao: await amanha(), referencia: "NSU-1" },
      { numero: 2, data: d, valor: 7900, referencia: "E2E-1" },
    ]);
    expect(await recusa(dono, "select public.extrato_conciliar($1, $2)", [(await linhaDe(extrato, 1)).id, cartao])).toBe("22023");
    // As duas linhas têm os dois pagamentos como sugestão (mesmo valor e dia): nenhuma é "certa".
    expect(await valor(dono, "select public.extrato_conciliar_certas($1) as v", [extrato])).toEqual({ conciliadas: 0 });
    await valor(dono, "select public.extrato_ignorar($1, 'Repasse ainda por vir') as v", [(await linhaDe(extrato, 1)).id]);
    expect(await valor(dono, "select public.extrato_conciliar_certas($1) as v", [extrato])).toEqual({ conciliadas: 0 });
    // Com o cartão conciliado à mão, sobra uma sugestão para a linha 2: aí ela é certa.
    await valor(dono, "select public.pagamento_conciliar($1, 'NSU-1', 7800, $2::date) as v", [cartao, d]);
    expect(await valor(dono, "select public.extrato_conciliar_certas($1) as v", [extrato])).toEqual({ conciliadas: 1 });
    expect(await linhaDe(extrato, 2)).toMatchObject({ situacao: "conciliada", pagamento_id: pixDireto });
  });

  it("um pagamento, uma linha só; a referência curta vira o número do extrato e da linha", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const pix = await vender(ana, { meio: "pix_picpay", valor: 7900, comprovante: "E2E-7" });
    const dono = await naLoja(ids.dono, ids.lojaA);
    const d = await hoje();
    const { extrato, numero } = await importar(dono, ids.lojaA, [{ numero: 1, data: d, valor: 7900, referencia: "12" }, { numero: 2, data: d, valor: 7900 }]);
    await valor(dono, "select public.extrato_conciliar($1, $2) as v", [(await linhaDe(extrato, 1)).id, pix]);
    expect(await pagamento(pix)).toMatchObject({ referencia_conciliacao: `Extrato ${numero}, linha 1`, valor_liquido_centavos: 7900 });
    expect(await recusa(dono, "select public.extrato_conciliar($1, $2)", [(await linhaDe(extrato, 2)).id, pix])).toBe("22023");
    expect(await recusa(dono, "select public.extrato_ignorar($1, $2)", [(await linhaDe(extrato, 1)).id, "Já conciliada"])).toBe("22023");
  });

  it("o resumo: créditos, débitos, taxas, líquido, o que ainda vai cair e as linhas por situação", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const d = await hoje();
    const { extrato } = await importar(dono, ids.lojaA, [
      { numero: 1, data: d, valor: 10000, taxa: 200, data_liquidacao: d },
      { numero: 2, data: d, valor: 5000, taxa: 100, liquido: 4900, data_liquidacao: await amanha() },
      { numero: 3, data: d, valor: -3000, descricao: "Chargeback" },
    ]);
    await valor(dono, "select public.extrato_ignorar($1, 'Chargeback contestado') as v", [(await linhaDe(extrato, 3)).id]);
    expect(await valor(dono, "select public.extrato_resumo($1) as v", [extrato])).toEqual({
      creditos: 2, creditos_centavos: 15000, debitos: 1, debitos_centavos: 3000, taxas_centavos: 300,
      liquido_centavos: 9800 + 4900 - 3000, a_cair_centavos: 4900, pendentes: 2, conciliadas: 0, ignoradas: 1,
    });
  });

  it("quem não concilia nessa loja não vê o extrato nem as sugestões; a lista traz as linhas por situação", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const { extrato } = await importar(dono, ids.lojaA, [{ numero: 1, data: await hoje(), valor: 7900 }, { numero: 2, data: await hoje(), valor: -100 }]);
    await valor(dono, "select public.extrato_ignorar($1, 'Tarifa do mês') as v", [(await linhaDe(extrato, 2)).id]);
    expect(await linhas(dono, "select id, loja, linhas, pendentes, conciliadas, ignoradas from public.extratos_recentes(50)")).toEqual([
      { id: extrato, loja: "Loja A", linhas: 2, pendentes: 1, conciliadas: 0, ignoradas: 1 },
    ]);
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await linhas(gerenteB, "select id from public.extratos_recentes(50)")).toEqual([]);
    expect(await linhas(gerenteB, "select id from public.extratos")).toEqual([]);
    expect(await linhas(gerenteB, "select id from public.extrato_linhas")).toEqual([]);
    expect(await recusa(gerenteB, "select * from public.extrato_sugestoes($1)", [extrato])).toBe("42501");
    expect(await recusa(gerenteB, "select public.extrato_conciliar_certas($1)", [extrato])).toBe("42501");
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await linhas(ana, "select id from public.extratos")).toEqual([]);
  });
});
