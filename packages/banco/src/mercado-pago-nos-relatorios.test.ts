// Revisão do #112 (lote A do ORA-PDV-maquininhas-UX, pedido ORA-ESTAVEL-26NOV, 26/11/2026): o Pix e o cartão na maquininha
// Mercado Pago nos recebíveis, na previsão de caixa e no resultado do mês, antes e depois de conciliar, comparados com a
// mesma venda na PicPay. Os juros do cliente (o acréscimo das parcelas de 13x a 18x) não são receita nem tarifa; a tarifa
// (o bruto menos o líquido conciliado) entra uma vez só, nas taxas. Banco em memória; maquininhas, NSU e valores FICTÍCIOS.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
beforeAll(async () => { db = await criarBanco(); await montarCenario(db); await montarCatalogo(db); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let n = 0;
const chave = (p: string) => `mp-relatorios:${p}:${++n}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4d000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, p: unknown[] = []) => comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, p)).rows[0]?.v as T);
const hoje = async () => (await db.query<{ v: string }>("select (now() at time zone 'America/Sao_Paulo')::date::text as v")).rows[0]?.v ?? "";
const num = (v: unknown) => Number(v ?? 0);

type Relatorios = {
  previsao: { a_conciliar: { valor: number; quantidade: number } };
  resultado: { linhas: Record<string, number> };
  recebiveis: { linhas: { adquirente: string; valor_a_receber: number; recebido_bruto: number; recebido_liquido: number }[] };
};

// A venda de uma capa (R$ 79,00): R$ 20,00 no Pix da maquininha e R$ 59,00 no cartão de crédito em 15x, com R$ 9,00 de juros do
// cliente (o total que a maquininha mostrou: R$ 68,00). Conciliação: o Pix cai com R$ 0,20 de tarifa e o cartão com R$ 3,00.
async function vendaConciliada(provedor: "picpay" | "mercado_pago") {
  const dono = await naLoja(ids.dono, ids.lojaA);
  const terminal = await valor<string>(dono, "select public.terminal_salvar($1, $2, $3, $4, $5, $6, $7) as v",
    [null, ids.lojaA, provedor, `T-${provedor}`, "Maquininha (teste)", null, "Cadastro de teste"]);
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await comoUsuario(db, ana, () => db.query("select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3)", [venda, JSON.stringify([
    { meio: `pix_${provedor}`, valor: 2_000, terminal, comprovante: "PIX-TESTE-1" },
    { meio: `cartao_${provedor}`, valor: 5_900, terminal, comprovante: "NSU-TESTE-1", modalidade_cartao: "credito", bandeira_cartao: "visa",
      parcelas: 15, acrescimo_cliente_centavos: 900 },
  ]), chave("concluir")]));
  const ler = async (): Promise<Relatorios> => ({
    previsao: await valor(dono, "select public.previsao_de_caixa(8, $1) as v", [ids.lojaA]),
    resultado: await valor(dono, "select public.resultado_do_mes(date_trunc('month', $1::date)::date, $2) as v", [await hoje(), ids.lojaA]),
    recebiveis: await valor(dono, "select public.recebiveis_painel($1, 30) as v", [ids.lojaA]),
  });
  const antes = await ler();
  const linhas = (await db.query<{ id: string; meio: string; valor_centavos: number }>(
    "select id, meio, valor_centavos from public.venda_pagamentos where venda_id = $1 order by ordem", [venda])).rows;
  for (const l of linhas) {
    const liquido = l.meio.startsWith("pix_") ? l.valor_centavos - 20 : l.valor_centavos - 300;
    expect(await valor(dono, "select public.pagamento_conciliar($1, $2, $3, $4) as v", [l.id, `EXTRATO-${l.meio}`, liquido, await hoje()])).toBeTruthy();
  }
  return { antes, depois: await ler(), adquirente: provedor };
}

describe("o Pix e o cartão da maquininha Mercado Pago nos relatórios, como os da PicPay (revisão do #112)", () => {
  for (const provedor of ["picpay", "mercado_pago"] as const) {
    it(`${provedor}: a conciliar antes, a tarifa uma vez só depois, e os juros do cliente em lugar nenhum`, async () => {
      const { antes, depois, adquirente } = await vendaConciliada(provedor);
      // Antes de conciliar: os R$ 79,00 (o principal, sem os juros) a receber e a conciliar; nenhuma tarifa ainda.
      expect(antes.recebiveis.linhas.map((l) => [l.adquirente, num(l.valor_a_receber), num(l.recebido_bruto)])).toEqual([[adquirente, 7_900, 0]]);
      expect({ valor: num(antes.previsao.a_conciliar.valor), quantidade: num(antes.previsao.a_conciliar.quantidade) }).toEqual({ valor: 7_900, quantidade: 2 });
      expect({ vendido: num(antes.resultado.linhas.vendido), a_conciliar: num(antes.resultado.linhas.a_conciliar_valor), taxas: num(antes.resultado.linhas.taxas_cartao_pix) })
        .toEqual({ vendido: 7_900, a_conciliar: 7_900, taxas: 0 });
      // Depois: recebido bruto R$ 79,00 e líquido R$ 75,80; a tarifa de R$ 3,20 nas taxas, uma vez; o resultado cai R$ 3,20.
      expect(depois.recebiveis.linhas.map((l) => [l.adquirente, num(l.valor_a_receber), num(l.recebido_bruto), num(l.recebido_liquido)]))
        .toEqual([[adquirente, 0, 7_900, 7_580]]);
      expect({ valor: num(depois.previsao.a_conciliar.valor), quantidade: num(depois.previsao.a_conciliar.quantidade) }).toEqual({ valor: 0, quantidade: 0 });
      expect({ vendido: num(depois.resultado.linhas.vendido), a_conciliar: num(depois.resultado.linhas.a_conciliar_valor),
        taxas_cartao_pix: num(depois.resultado.linhas.taxas_cartao_pix), taxas: num(depois.resultado.linhas.taxas),
        conciliados: num(depois.resultado.linhas.pagamentos_conciliados) })
        .toEqual({ vendido: 7_900, a_conciliar: 0, taxas_cartao_pix: 320, taxas: 320, conciliados: 2 });
      expect(num(depois.resultado.linhas.resultado)).toBe(num(antes.resultado.linhas.resultado) - 320);
      // Os R$ 9,00 de juros do cliente não aparecem como venda, a receber, recebido nem tarifa.
      expect(JSON.stringify([antes, depois])).not.toMatch(/(^|[^0-9])(8800|8_800|880)([^0-9]|$)/);
    });
  }
});
