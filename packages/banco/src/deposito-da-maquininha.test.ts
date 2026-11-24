// Lote FIN-006a (24/11/2026; ORA-FIN-006: "conciliação bancária e contas multiempresa; imports e matches reproduzíveis com
// aprovação"; migration 20261124111725_deposito_da_maquininha_no_banco): o depósito agrupado da maquininha conferido com o
// extrato do banco. O depósito é o conjunto dos pagamentos da mesma maquininha com o dinheiro para o mesmo dia (gravado na
// conciliação), e casar é dizer qual linha de crédito do extrato do banco da rede é ele. Aqui: o painel, casar (com o
// motivo quando diverge), repetir sem gravar de novo, desfazer, o uso único da linha (AUD-c) dos dois lados, quem pode e a
// regra nas tabelas. A disputa com duas conexões está em deposito-da-maquininha-concorrencia.test.ts. Dados FICTÍCIOS; cada
// teste numa transação desfeita.
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
  await db.query("select privado.lancar_movimento($1, $2, 20, 'entrada_importacao', null, null, null, null, 'deposito:capas')", [ids.lojaA, cat.capa]);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let arquivos = 0;
let chaves = 0;
const impressao = () => `a${String(++arquivos).padStart(63, "0")}`;
const chave = (p: string) => `${p}:deposito:${String(++chaves).padStart(5, "0")}`;
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
  const s = { usuario, sessao: `4f000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const recusa = (s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });
const recusaDireta = (sql: string, params: unknown[] = []) => erroDe(() => db.query(sql, params));
const dia = async (mais = 0) => (await db.query<{ d: string }>("select to_char((now() at time zone 'America/Sao_Paulo')::date + $1::int, 'YYYY-MM-DD') as d", [mais])).rows[0]?.d ?? "";

const PAINEL = "select public.maquininha_depositos_painel($1::date, $2::date) as v";
const CASAR = "select public.maquininha_deposito_casar($1, $2::date, $3, $4) as v";
const DESFAZER = "select public.maquininha_deposito_desfazer($1, $2::date, $3) as v";
const EXTRATO = "select public.extrato_importar(null, 'banco', 'Banco Fictício', array['pix_direto']::text[], 'extrato.ofx', $1, $2::jsonb, '{\"data\": 0}'::jsonb) as v";
type Deposito = {
  provedor: string; data_liquidacao: string; pagamentos: number; esperado: number; bruto: number;
  casado: { linha: string; recebido: number; esperado_ao_casar: number; motivo: string | null } | null;
  sugestoes: { linha: string; valor: number }[];
};
type Painel = { depositos: Deposito[]; sem_conciliacao: { pagamentos: number; valor: number } };

/** Uma venda de capas concluída por quem está logado (com o caixa aberto), com o pagamento dado; devolve o pagamento. */
async function vender(s: Sessao, pagamento: Record<string, unknown>, quantidade = 1): Promise<{ venda: string; pagamento: string }> {
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, null, $3, $4) as v", [venda, cat.capa, quantidade, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, JSON.stringify([pagamento]), chave("fim")]);
  const p = (await db.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1", [venda])).rows[0]?.id ?? "";
  return { venda, pagamento: p };
}
/** A conciliação de sempre (L7a): o líquido e o dia em que o dinheiro cai. */
const conciliar = (s: Sessao, pagamento: string, liquido: number, quando: string) =>
  valor(s, "select public.pagamento_conciliar($1, $2, $3, $4::date) as v", [pagamento, chave("NSU").slice(0, 40), liquido, quando]);
/** O extrato do banco da rede, com as linhas dadas; devolve o id de cada linha, pela ordem. */
async function extratoDoBanco(s: Sessao, lista: { data: string; valor: number; descricao?: string }[]): Promise<string[]> {
  const r = await valor<{ extrato: string }>(s, EXTRATO, [impressao(), JSON.stringify(lista.map((l, i) => ({ numero: i + 1, ...l })))]);
  return (await db.query<{ id: string }>("select id from public.extrato_linhas where extrato_id = $1 order by numero", [r.extrato])).rows.map((l) => l.id);
}
const linhaDe = async (id: string) => (await db.query<{ situacao: string; decidida_por: string | null }>(
  "select situacao, decidida_por from public.extrato_linhas where id = $1", [id])).rows[0];

/**
 * O dia da rede: na loja A, três vendas na PicPay (cartão de R$ 79,00 e Pix de R$ 158,00, conciliadas com o dinheiro para
 * hoje: R$ 77,42 e R$ 156,42 líquidos; e um cartão de R$ 79,00 ainda sem conciliação) e uma no cartão PagSeguro (R$ 79,00,
 * conciliada com R$ 76,00 para hoje). O extrato do banco da rede tem o depósito da PicPay certo (R$ 233,84), o da PagBank
 * com R$ 1,00 a menos (R$ 75,00) e uma TED que não é de maquininha.
 */
async function diaDaRede() {
  const dono = await naLoja(ids.dono, ids.lojaA);
  await valor(dono, "select public.abrir_caixa(0, $1) as v", [chave("caixa")]);
  const hoje = await dia();
  const cartao = await vender(dono, { meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-1" });
  const pix = await vender(dono, { meio: "pix_picpay", valor: 15_800, comprovante: "PIX-2" }, 2);
  const semConciliar = await vender(dono, { meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-3" });
  const pagSeguro = await vender(dono, { meio: "cartao_pagseguro", valor: 7_900, comprovante: "NSU-4" });
  await conciliar(dono, cartao.pagamento, 7_742, hoje);
  await conciliar(dono, pix.pagamento, 15_642, hoje);
  await conciliar(dono, pagSeguro.pagamento, 7_600, hoje);
  const [picpay, pagbank, ted] = await extratoDoBanco(dono, [
    { data: hoje, valor: 23_384, descricao: "PICPAY REPASSE" }, { data: hoje, valor: 7_500, descricao: "PAGBANK" }, { data: hoje, valor: 50_000, descricao: "TED" },
  ]) as [string, string, string];
  return { dono, hoje, cartao, pix, semConciliar, pagSeguro, picpay, pagbank, ted };
}

describe("o depósito da maquininha conferido com o extrato do banco (FIN-006a)", () => {
  it("o painel agrupa os pagamentos conciliados por maquininha e dia, com as linhas que podem ser o depósito; casar marca a linha; repetir não grava de novo", async () => {
    const { dono, hoje, picpay, pagbank, ted } = await diaDaRede();
    const painel = await valor<Painel>(dono, PAINEL, [hoje, hoje]);
    expect(painel.depositos.map((d) => ({ provedor: d.provedor, data: d.data_liquidacao, pagamentos: Number(d.pagamentos), esperado: Number(d.esperado), bruto: Number(d.bruto) })))
      .toEqual([
        { provedor: "pagbank", data: hoje, pagamentos: 1, esperado: 7_600, bruto: 7_900 },
        { provedor: "picpay", data: hoje, pagamentos: 2, esperado: 23_384, bruto: 23_700 },
      ]);
    // As sugestões: as linhas de crédito livres do dia (até 3 dias depois), o mesmo valor primeiro.
    const doPicpay = painel.depositos.find((d) => d.provedor === "picpay") as Deposito;
    expect(doPicpay.sugestoes.map((s) => s.linha)).toEqual([picpay, pagbank, ted]);
    expect(doPicpay.casado).toBeNull();
    // O cartão ainda sem conciliação não tem dia: fica contado à parte.
    expect({ pagamentos: Number(painel.sem_conciliacao.pagamentos), valor: Number(painel.sem_conciliacao.valor) }).toEqual({ pagamentos: 1, valor: 7_900 });

    expect(await valor(dono, CASAR, ["picpay", hoje, picpay, null])).toEqual({ pagamentos: 2, esperado: 23_384, recebido: 23_384, diferenca: 0, repetida: false });
    expect(await linhaDe(picpay)).toEqual({ situacao: "deposito", decidida_por: ids.dono });
    expect(await valor(dono, CASAR, ["picpay", hoje, picpay, null])).toMatchObject({ repetida: true, diferenca: 0 });
    expect(Number((await db.query<{ n: string }>("select count(*) as n from public.maquininha_depositos")).rows[0]?.n)).toBe(1);
    // A linha casada sai das sugestões; o depósito diz qual linha é.
    const depois = await valor<Painel>(dono, PAINEL, [hoje, hoje]);
    expect((depois.depositos.find((d) => d.provedor === "picpay") as Deposito).casado).toMatchObject({ linha: picpay, recebido: 23_384, esperado_ao_casar: 23_384, motivo: null });
    expect((depois.depositos.find((d) => d.provedor === "pagbank") as Deposito).sugestoes.map((s) => s.linha)).toEqual([pagbank, ted]);
    // O resumo e a lista do extrato contam a linha de depósito à parte.
    const extrato = (await db.query<{ id: string }>("select extrato_id as id from public.extrato_linhas where id = $1", [picpay])).rows[0]?.id;
    expect(await valor(dono, "select public.extrato_resumo($1) as v", [extrato])).toMatchObject({ pendentes: 2, depositos: 1, repasses: 0, estornos: 0 });
    expect(await valor<{ depositos: number }[]>(dono, "select coalesce(jsonb_agg(jsonb_build_object('depositos', x.depositos)), '[]') as v from public.extratos_recentes(10) x where x.id = $1", [extrato]))
      .toEqual([{ depositos: 1 }]);
  });

  it("o valor diferente pede o motivo, que fica gravado; desfazer pede o motivo, solta a linha e fica na auditoria", async () => {
    const { dono, hoje, pagbank } = await diaDaRede();
    expect(await recusa(dono, CASAR, ["pagbank", hoje, pagbank, null])).toBe("22023");
    expect(await recusa(dono, CASAR, ["pagbank", hoje, pagbank, "ab"])).toBe("22023");
    expect(await valor(dono, CASAR, ["pagbank", hoje, pagbank, "  Tarifa  de transferência "])).toMatchObject({ esperado: 7_600, recebido: 7_500, diferenca: -100, repetida: false });
    expect((await db.query("select motivo, esperado_centavos as esperado, recebido_centavos as recebido from public.maquininha_depositos where linha_id = $1", [pagbank])).rows)
      .toEqual([{ motivo: "Tarifa de transferência", esperado: "7600", recebido: "7500" }].map((r) => ({ ...r, esperado: Number(r.esperado), recebido: Number(r.recebido) })));
    expect(await recusa(dono, DESFAZER, ["pagbank", hoje, null])).toBe("22023");
    expect(await valor(dono, DESFAZER, ["pagbank", hoje, "Era outra linha"])).toBe(true);
    expect(await linhaDe(pagbank)).toEqual({ situacao: "pendente", decidida_por: null });
    expect(await valor(dono, DESFAZER, ["pagbank", hoje, "De novo"])).toBe(false);
    const auditoria = (await db.query<{ acao: string; motivo: string }>(
      "select acao, motivo from public.auditoria where acao like 'maquininha_depositos.%' order by id")).rows;
    expect(auditoria).toEqual([
      { acao: "maquininha_depositos.criado", motivo: "Tarifa de transferência" },
      { acao: "maquininha_depositos.removido", motivo: "Era outra linha" },
    ]);
  });

  it("um uso só: a linha do depósito não concilia venda, não sai da conta, não se desfaz pelo extrato e não é repasse; a linha com outro uso não vira depósito", async () => {
    const { dono, hoje, picpay, pagbank, ted } = await diaDaRede();
    await valor(dono, CASAR, ["picpay", hoje, picpay, null]);
    // A mesma linha em outro depósito, ou outra linha no mesmo depósito: OR045.
    expect(await recusa(dono, CASAR, ["pagbank", hoje, picpay, "Tentativa"])).toBe("OR045");
    expect(await recusa(dono, CASAR, ["picpay", hoje, pagbank, "Tentativa"])).toBe("OR045");
    // Pelo extrato: nada mexe na linha do depósito (OR046).
    // (Um Pix direto qualquer: a recusa do uso vem antes da conferência do valor.)
    const pixDireto = await vender(dono, { meio: "pix_direto", valor: 7_900, comprovante: "E2E-FICTICIO-DEP" });
    expect(await recusa(dono, "select public.extrato_conciliar($1, $2)", [picpay, pixDireto.pagamento])).toBe("OR046");
    expect(await recusa(dono, "select public.extrato_ignorar($1, 'Tentativa')", [picpay])).toBe("OR046");
    expect(await recusa(dono, "select public.extrato_desfazer($1, 'Tentativa')", [picpay])).toBe("OR046");
    expect(await linhaDe(picpay)).toMatchObject({ situacao: "deposito" });
    // A linha que já tem outro uso não vira depósito: fora da conta (OR046).
    await valor(dono, "select public.extrato_ignorar($1, 'TED de sócio')", [ted]);
    expect(await recusa(dono, CASAR, ["pagbank", hoje, ted, "Tentativa"])).toBe("OR046");
    // A linha de débito e a linha de outro extrato (o da loja) não são depósito.
    const [debito] = await extratoDoBanco(dono, [{ data: hoje, valor: -1_000, descricao: "Tarifa" }]);
    expect(await recusa(dono, CASAR, ["pagbank", hoje, debito, "Tentativa"])).toBe("22023");
    const daLoja = await valor<{ extrato: string }>(dono, "select public.extrato_importar($1, 'maquininha', 'PicPay', array['cartao_picpay']::text[], 'x.csv', $2, $3::jsonb, '{}'::jsonb) as v",
      [ids.lojaA, impressao(), JSON.stringify([{ numero: 1, data: hoje, valor: 7_500 }])]);
    const linhaDaLoja = (await db.query<{ id: string }>("select id from public.extrato_linhas where extrato_id = $1", [daLoja.extrato])).rows[0]?.id;
    expect(await recusa(dono, CASAR, ["pagbank", hoje, linhaDaLoja, "Tentativa"])).toBe("22023");
    // Sem pagamento conciliado da maquininha no dia: nada a casar.
    expect(await recusa(dono, CASAR, ["pagbank", await dia(-1), pagbank, "Tentativa"])).toBe("P0002");
  });

  it("quem pode: só quem concilia pela rede inteira (o dono); a gerência da loja e o vendedor não; o dono de outra rede só vê a dele", async () => {
    const { dono, hoje, picpay, pagbank } = await diaDaRede();
    await valor(dono, CASAR, ["picpay", hoje, picpay, null]);
    for (const [usuario, unidade] of [[ids.gerenteB, ids.lojaB], [ids.vendedorA, ids.lojaA]] as const) {
      const s = await naLoja(usuario, unidade);
      expect(await recusa(s, PAINEL, [hoje, hoje]), usuario).toBe("42501");
      expect(await recusa(s, CASAR, ["pagbank", hoje, pagbank, "Tentativa"]), usuario).toBe("42501");
      expect(await recusa(s, DESFAZER, ["picpay", hoje, "Tentativa"]), usuario).toBe("42501");
      expect(await valor<number>(s, "select count(*)::int as v from public.maquininha_depositos"), usuario).toBe(0);
    }
    // O dono de outra rede: o painel da rede dele (vazio); a linha desta rede não existe para ele; desfazer não acha nada.
    const outra = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await valor<Painel>(outra, PAINEL, [hoje, hoje])).toMatchObject({ depositos: [] });
    expect(await recusa(outra, CASAR, ["pagbank", hoje, pagbank, "Tentativa"])).toBe("P0002");
    expect(await valor(outra, DESFAZER, ["picpay", hoje, "Tentativa"])).toBe(false);
    expect(await valor<number>(outra, "select count(*)::int as v from public.maquininha_depositos")).toBe(0);
    expect([await linhaDe(picpay), await linhaDe(pagbank)]).toEqual([{ situacao: "deposito", decidida_por: ids.dono }, { situacao: "pendente", decidida_por: null }]);
  });

  it("o esperado é o que a conciliação disse: o pagamento de venda cancelada depois conta; o dia do dinheiro decide o depósito", async () => {
    const { dono, hoje, cartao, picpay } = await diaDaRede();
    // A venda do cartão é cancelada depois de conciliada: o dinheiro dela caiu no depósito, e o estorno é um débito à parte.
    await valor(dono, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [cartao.venda]);
    const painel = await valor<Painel>(dono, PAINEL, [hoje, hoje]);
    expect(Number((painel.depositos.find((d) => d.provedor === "picpay") as Deposito).esperado)).toBe(23_384);
    expect(await valor(dono, CASAR, ["picpay", hoje, picpay, null])).toMatchObject({ pagamentos: 2, diferenca: 0 });
    // O pagamento com o dinheiro para outro dia (a venda de ontem, com o dinheiro ontem) é de outro depósito.
    const ontem = await dia(-1);
    const outro = await vender(dono, { meio: "cartao_picpay", valor: 7_900, comprovante: "NSU-9" });
    await db.query("update public.vendas set concluida_em = ($2::date + interval '12 hours') at time zone 'America/Sao_Paulo' where id = $1", [outro.venda, ontem]);
    await conciliar(dono, outro.pagamento, 7_742, ontem);
    const dois = await valor<Painel>(dono, PAINEL, [ontem, hoje]);
    expect(dois.depositos.map((d) => [d.provedor, d.data_liquidacao, Number(d.pagamentos), Number(d.esperado)])).toEqual([
      ["pagbank", hoje, 1, 7_600], ["picpay", hoje, 2, 23_384], ["picpay", ontem, 1, 7_742],
    ]);
  });

  it("a regra vale para qualquer caminho: a linha não vira depósito sem o depósito, não se solta com ele casado, e o depósito não muda de linha", async () => {
    const { dono, hoje, picpay, pagbank, ted } = await diaDaRede();
    expect(await recusaDireta("update public.extrato_linhas set situacao = 'deposito', decidida_por = $2, decidida_em = now() where id = $1", [ted, ids.dono])).toBe("OR046");
    await valor(dono, CASAR, ["picpay", hoje, picpay, null]);
    expect(await recusaDireta("update public.extrato_linhas set situacao = 'pendente', decidida_por = null, decidida_em = null where id = $1", [picpay])).toBe("OR046");
    expect(await recusaDireta("update public.maquininha_depositos set linha_id = $1 where linha_id = $2", [pagbank, picpay])).toBe("OR045");
    expect(await recusaDireta("update public.maquininha_depositos set data_liquidacao = data_liquidacao - 1 where linha_id = $1", [picpay])).toBe("OR045");
    // O depósito direto na tabela também ocupa a linha (e recusa a que já tem outro uso).
    await valor(dono, "select public.extrato_ignorar($1, 'TED de sócio')", [ted]);
    expect(await recusaDireta(
      "insert into public.maquininha_depositos (organizacao_id, provedor, data_liquidacao, linha_id, pagamentos, esperado_centavos, recebido_centavos, motivo, casado_por) values ($1, 'pagbank', $2::date, $3, 1, 7600, 50000, 'Direto', $4)",
      [ids.organizacao, hoje, ted, ids.dono])).toBe("OR046");
    expect(await linhaDe(ted)).toMatchObject({ situacao: "ignorada" });
  });
});
