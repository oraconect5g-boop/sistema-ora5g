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
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

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
let sessoes = 0;
let chaves = 0;
const chave = (prefixo: string) => `${prefixo}:${++chaves}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4f000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);

const SALVAR = "select public.terminal_salvar($1, $2, $3, $4, $5, $6, $7) as v";
async function vender(s: Sessao, pagamentos: object[], erroEsperado = false) {
  const aberto = await db.query("select 1 from public.caixas where operador_id = $1 and situacao = 'aberto'", [s.usuario]);
  if (aberto.rows.length === 0) await valor(s, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  const concluir = () => db.query("select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3)", [venda, JSON.stringify(pagamentos), chave("concluir")]);
  if (erroEsperado) return comoUsuario(db, s, () => erroDe(concluir));
  await comoUsuario(db, s, concluir);
  return venda;
}

describe("cartão manual por linha do PDV", () => {
  async function cenario() {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const mp = await valor<string>(dono, SALVAR, [null, ids.lojaA, "mercado_pago", "MP-101", "Mercado Pago do caixa", null, "Cadastro"]);
    const pp = await valor<string>(dono, SALVAR, [null, ids.lojaA, "picpay", "PP-101", "PicPay do caixa", null, "Cadastro"]);
    const pb = await valor<string>(dono, SALVAR, [null, ids.lojaA, "pagbank", "PB-101", "PagBank do caixa", null, "Cadastro"]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const linha = { meio: "cartao_mercado_pago", valor: 7_900, comprovante: "NSU-TESTE", terminal: mp, modalidade_cartao: "credito", bandeira_cartao: "visa" };
    return { ana, mp, pp, pb, linha };
  }

  it("guarda NSU, maquininha, bandeira e juros numa venda mista, sem alterar o principal, troco ou taxa da loja", async () => {
    const { ana, mp, linha } = await cenario();
    const venda = await vender(ana, [
      { meio: "dinheiro", valor: 3_000 },
      { ...linha, valor: 5_000, parcelas: 18, acrescimo_cliente_centavos: 700 },
    ]);
    expect((await db.query("select meio, valor_centavos, comprovante, terminal_id, parcelas, modalidade_cartao, bandeira_cartao, acrescimo_cliente_centavos, valor_liquido_centavos from public.venda_pagamentos where venda_id = $1 order by ordem", [venda])).rows).toEqual([
      { meio: "dinheiro", valor_centavos: 3000, comprovante: null, terminal_id: null, parcelas: null, modalidade_cartao: null, bandeira_cartao: null, acrescimo_cliente_centavos: null, valor_liquido_centavos: null },
      { meio: "cartao_mercado_pago", valor_centavos: 5000, comprovante: "NSU-TESTE", terminal_id: mp, parcelas: 18, modalidade_cartao: "credito", bandeira_cartao: "visa", acrescimo_cliente_centavos: 700, valor_liquido_centavos: null },
    ]);
    expect((await db.query("select total_centavos, troco_centavos, recebido_centavos from public.vendas where id = $1", [venda])).rows[0]).toEqual({
      total_centavos: 7900, troco_centavos: 100, recebido_centavos: 7900,
    });
  });

  it("aceita 12x sem juros e 13x/18x com valor do terminal; bloqueia 12x com juros, 13x sem e 19x ou 0x", async () => {
    const { ana, linha } = await cenario();
    for (const parcelas of [0, 13, 19]) expect(await vender(ana, [{ ...linha, parcelas }], true)).toBe("OR009");
    expect(await vender(ana, [{ ...linha, parcelas: 12, acrescimo_cliente_centavos: 1 }], true)).toBe("OR009");
    expect(await vender(ana, [{ ...linha, parcelas: 13, acrescimo_cliente_centavos: "1" }], true)).toBe("OR009");
    await vender(ana, [{ ...linha, parcelas: 12 }]);
    await vender(ana, [{ ...linha, parcelas: 13, acrescimo_cliente_centavos: 1 }]);
    await vender(ana, [{ ...linha, parcelas: 18, acrescimo_cliente_centavos: 1 }]);
  });

  it("Simp é somente no crédito Mercado Pago até 6x, sem inventar regra de juros", async () => {
    const { ana, linha, pp } = await cenario();
    const simp = { ...linha, bandeira_cartao: "simp", parcelas: 6 };
    await vender(ana, [simp]);
    await vender(ana, [{ ...simp, acrescimo_cliente_centavos: 123 }]);
    expect(await vender(ana, [{ ...simp, parcelas: 7 }], true)).toBe("OR009");
    expect(await vender(ana, [{ ...simp, meio: "cartao_picpay", terminal: pp }], true)).toBe("OR009");
    expect(await vender(ana, [{ ...simp, terminal: pp }], true)).toBe("OR009");
    expect(await vender(ana, [{ ...simp, terminal: null }], true)).toBe("OR009");
  });

  it("débito a 1x, Pix de terminal separado e dinheiro não recebem dados de cartão", async () => {
    const { ana, linha, mp, pb } = await cenario();
    await vender(ana, [{ ...linha, modalidade_cartao: "debito", parcelas: 1 }]);
    await vender(ana, [{ meio: "pix_mercado_pago", valor: 7900, terminal: mp, comprovante: "PIX-TESTE" }]);
    await vender(ana, [{ meio: "cartao_pagseguro", valor: 7900, terminal: pb, comprovante: "NSU-LEGADO" }]);
    expect(await vender(ana, [{ ...linha, modalidade_cartao: "debito", parcelas: 2 }], true)).toBe("OR009");
    expect(await vender(ana, [{ meio: "dinheiro", valor: 7900, acrescimo_cliente_centavos: 1 }], true)).toBe("OR009");
  });
});
