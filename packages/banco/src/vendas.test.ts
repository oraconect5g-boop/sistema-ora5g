// ADR-004: venda, pagamentos e caixa (cenários A, B, C, D, E, H e I do bloco 12 do prompt de
// execução prioritária). Banco em memória com todas as migrations; dados fictícios. Cada teste
// roda numa transação desfeita no fim. Concorrência real da reserva: concorrencia.test.ts.
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
  const s = { usuario, sessao: `45000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const linhas = <T>(s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

const abrirCaixa = (s: Sessao, fundo = 10_000) => valor<string>(s, "select public.abrir_caixa($1, $2) as v", [fundo, chave("caixa")]);
const novaVenda = (s: Sessao) => valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
const adicionar = (s: Sessao, venda: string, variante: string, item: string | null, quantidade = 1) =>
  valor<string>(s, "select public.adicionar_item($1, $2, $3, $4, $5) as v", [venda, variante, item, quantidade, chave("item")]);
const CONCLUIR = "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v";
type Resultado = { venda: string; numero: number; total: number; troco: number; recebido: number; a_receber: number; repetida: boolean };
const concluir = (s: Sessao, venda: string, pagamentos: object[], cliente: object = {}, k = chave("concluir")) =>
  valor<Resultado>(s, CONCLUIR, [venda, JSON.stringify(pagamentos), JSON.stringify(cliente), k]);
const dinheiroNoCaixa = async (caixa: string) =>
  Number((await db.query<{ v: string }>("select coalesce(sum(valor_centavos), 0) as v from public.caixa_movimentos where caixa_id = $1 and meio = 'dinheiro'", [caixa])).rows[0]?.v);
const item = async (id: string) =>
  (await db.query<{ situacao: string; em_estoque: boolean }>("select situacao, em_estoque from public.itens_serializados where id = $1", [id])).rows[0];
const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ quantidade: number; reservado: number }>("select quantidade, reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0];
const divergencias = async () => (await db.query("select regra from privado.divergencias_estoque()")).rows;

describe("A — venda à vista e mista", () => {
  it("dinheiro com troco: estoque baixa, caixa registra recebimento e troco, venda numerada", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const caixa = await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.aparelho, itens.a1);
    await adicionar(ana, venda, cat.capa, null, 2);
    const r = await concluir(ana, venda, [{ meio: "dinheiro", valor: 170_000 }]);
    expect(r).toMatchObject({ total: 149_900 + 15_800, troco: 4_300, recebido: 165_700, a_receber: 0, repetida: false });
    expect(r.numero).toBeGreaterThan(0);
    expect(await item(itens.a1)).toEqual({ situacao: "vendido", em_estoque: false });
    expect(await saldo(ids.lojaA, cat.aparelho)).toEqual({ quantidade: 1, reservado: 0 });
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: 8, reservado: 0 });
    expect(await dinheiroNoCaixa(caixa)).toBe(10_000 + 170_000 - 4_300);
    expect(await divergencias()).toEqual([]);
  });

  it("misto com cartão e Pix exige o comprovante; troco só sai do dinheiro; link fica bloqueado", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const caixa = await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.aparelho, itens.a2);
    const k = chave("concluir");
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify([{ meio: "cartao_picpay", valor: 100_000, comprovante: "123456" }, { meio: "pix_direto", valor: 49_900 }]), "{}", k])).toBe("OR009");
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify([{ meio: "cartao_picpay", valor: 160_000, comprovante: "123456" }]), "{}", chave("c")])).toBe("OR009");
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify([{ meio: "link_pagamento", valor: 149_900 }]), "{}", chave("c")])).toBe("OR009");
    const r = await concluir(ana, venda, [{ meio: "cartao_picpay", valor: 100_000, comprovante: "123456" }, { meio: "pix_direto", valor: 49_900, comprovante: "E2E-0001" }]);
    expect(r).toMatchObject({ total: 149_900, troco: 0, recebido: 149_900 });
    const meios = (await db.query<{ meio: string; valor_centavos: string }>("select meio, valor_centavos from public.caixa_movimentos where caixa_id = $1 and tipo = 'recebimento' order by meio", [caixa])).rows;
    expect(meios.map((m) => [m.meio, Number(m.valor_centavos)])).toEqual([["cartao_picpay", 100_000], ["pix_direto", 49_900]]);
    expect(await dinheiroNoCaixa(caixa)).toBe(10_000);
  });
});

describe("D — reenvio", () => {
  it("a mesma conclusão repetida devolve o mesmo resultado sem lançar de novo; outro conteúdo com a chave é OR004", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const caixa = await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.capa, null, 1);
    const k = chave("concluir");
    const primeira = await concluir(ana, venda, [{ meio: "dinheiro", valor: 7_900 }], {}, k);
    const repetida = await concluir(ana, venda, [{ meio: "dinheiro", valor: 7_900 }], {}, k);
    expect(repetida).toMatchObject({ venda: primeira.venda, numero: primeira.numero, repetida: true });
    expect(await dinheiroNoCaixa(caixa)).toBe(10_000 + 7_900);
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify([{ meio: "dinheiro", valor: 8_000 }]), "{}", k])).toBe("OR004");
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), "{}", chave("outra")])).toBe("22023");
  });

  it("criar venda e adicionar item com a mesma chave não duplicam", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const k = chave("venda");
    const v1 = await valor<string>(ana, "select public.criar_venda($1) as v", [k]);
    expect(await valor<string>(ana, "select public.criar_venda($1) as v", [k])).toBe(v1);
    const ki = chave("item");
    const i1 = await valor<string>(ana, "select public.adicionar_item($1, $2, null, 2, $3) as v", [v1, cat.capa, ki]);
    expect(await valor<string>(ana, "select public.adicionar_item($1, $2, null, 2, $3) as v", [v1, cat.capa, ki])).toBe(i1);
    expect(await errou(ana, "select public.adicionar_item($1, $2, null, 3, $3)", [v1, cat.capa, ki])).toBe("OR004");
    expect((await saldo(ids.lojaA, cat.capa))?.reservado).toBe(2);
  });
});

describe("B — desconto e aprovação", () => {
  it("sem política na categoria todo desconto pede aprovação; ninguém aprova o próprio; mudar o item invalida", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    const capa = await adicionar(ana, venda, cat.capa, null, 1);
    expect(await valor<string>(ana, "select public.aplicar_desconto($1, 500) as v", [capa])).toBe("precisa_aprovacao");
    const pagar = [{ meio: "dinheiro", valor: 7_400 }];
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify(pagar), "{}", chave("c")])).toBe("OR010");
    const pedido = await valor<string>(ana, "select public.pedir_aprovacao($1, 'Cliente antigo da loja') as v", [capa]);
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify(pagar), "{}", chave("c")])).toBe("OR010");
    expect(await errou(ana, "select public.decidir_aprovacao($1, true, null)", [pedido])).toBe("P0002");

    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await valor<boolean>(dono, "select public.decidir_aprovacao($1, true, 'Ok') as v", [pedido])).toBe(true);
    const r = await concluir(ana, venda, pagar);
    expect(r).toMatchObject({ total: 7_400 });
    const [aprov] = (await db.query("select situacao, decidido_por, solicitado_por from public.aprovacoes_desconto where id = $1", [pedido])).rows;
    expect(aprov).toEqual({ situacao: "aprovada", decidido_por: ids.dono, solicitado_por: ids.vendedorA });
  });

  it("T5 — o dono também não aprova o próprio pedido de desconto", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    const venda = await novaVenda(dono);
    const capa = await adicionar(dono, venda, cat.capa, null, 1);
    expect(await valor<string>(dono, "select public.aplicar_desconto($1, 500) as v", [capa])).toBe("precisa_aprovacao");
    const pedido = await valor<string>(dono, "select public.pedir_aprovacao($1, 'Cliente antigo da loja') as v", [capa]);
    expect(await errou(dono, "select public.decidir_aprovacao($1, true, null)", [pedido])).toBe("42501");
    expect((await db.query("select situacao from public.aprovacoes_desconto where id = $1", [pedido])).rows).toEqual([{ situacao: "pendente" }]);
  });

  it("aprovação cai se o desconto mudar depois", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    const capa = await adicionar(ana, venda, cat.capa, null, 1);
    await valor(ana, "select public.aplicar_desconto($1, 500) as v", [capa]);
    const pedido = await valor<string>(ana, "select public.pedir_aprovacao($1, 'Cliente antigo') as v", [capa]);
    await valor(await naLoja(ids.dono, ids.lojaA), "select public.decidir_aprovacao($1, true, null) as v", [pedido]);
    await valor(ana, "select public.aplicar_desconto($1, 900) as v", [capa]);
    expect((await db.query("select situacao from public.aprovacoes_desconto where id = $1", [pedido])).rows).toEqual([{ situacao: "invalidada" }]);
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_000 }]), "{}", chave("c")])).toBe("OR010");
  });

  it("com política na categoria, até o limite (teto × margem) dispensa aprovação", async () => {
    await db.query("update public.categorias set desconto_teto_pb = 1000, margem_minima_pb = 3000 where id = $1", [cat.acessorios]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const venda = await novaVenda(ana);
    const capa = await adicionar(ana, venda, cat.capa, null, 1);
    // preço 7900, custo 1800: teto 10% = 790; pela margem de 30% sobraria 5328; vale o menor.
    expect(await valor<string>(ana, "select public.aplicar_desconto($1, 790) as v", [capa])).toBe("dentro_do_limite");
    expect(await valor<string>(ana, "select public.aplicar_desconto($1, 791) as v", [capa])).toBe("precisa_aprovacao");
    expect(await valor<string>(ana, "select public.aplicar_desconto($1, 7000) as v", [capa])).toBe("abaixo_do_custo");
  });
});

describe("E — financiamento", () => {
  it("PayJoy: e-mail opcional (16/11, a DEC-U30 substituída); entrada no caixa; restante a receber da financeira; juros fora", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const caixa = await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.aparelho, itens.a1);
    const payjoy = [{ meio: "payjoy", valor: 149_900, entrada: 30_000, meio_entrada: "dinheiro", parcelas: 12 }];
    // Sem e-mail a venda fecha (antes: OR009 "PayJoy exige o e-mail do cliente"); o e-mail digitado continua conferido.
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify(payjoy), JSON.stringify({ email: "sem-arroba" }), chave("c")])).toBe("22023");
    const r = await concluir(ana, venda, payjoy, { nome: "Cliente Teste" });
    expect(r).toMatchObject({ total: 149_900, recebido: 30_000, a_receber: 119_900 });
    const receber = (await db.query<{ devedor: string; valor_centavos: string; vencimento: string | null }>("select devedor, valor_centavos, vencimento from public.contas_a_receber where venda_id = $1", [venda])).rows;
    expect(receber.map((x) => [x.devedor, Number(x.valor_centavos), x.vencimento])).toEqual([["payjoy", 119_900, null]]);
    expect(await dinheiroNoCaixa(caixa)).toBe(10_000 + 30_000);
  });
});

describe("C — disputa e validade", () => {
  it("o aparelho no carrinho de um vendedor não entra no de outro; reserva vencida e preço mudado barram a conclusão", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    const aparelho = await adicionar(ana, venda, cat.aparelho, itens.a1);
    const colega = await naLoja(ids.vendedorAB, ids.lojaA);
    const outra = await novaVenda(colega);
    expect(await errou(colega, "select public.adicionar_item($1, $2, $3, 1, 'x')", [outra, cat.aparelho, itens.a1])).toBe("OR002");

    await db.query("update public.estoque_reservas set expira_em = now() - interval '1 minute' where id = (select reserva_id from public.venda_itens where id = $1)", [aparelho]);
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify([{ meio: "dinheiro", valor: 149_900 }]), "{}", chave("c")])).toBe("OR002");
    await db.query("update public.estoque_reservas set expira_em = now() + interval '10 minutes' where id = (select reserva_id from public.venda_itens where id = $1)", [aparelho]);
    await db.query("insert into public.precos (organizacao_id, variante_id, valor_centavos, inicio, fim, origem, motivo) values ($1, $2, 99900, now() - interval '1 minute', now() + interval '1 day', 'campanha', 'teste')", [ids.organizacao, cat.aparelho]);
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify([{ meio: "dinheiro", valor: 149_900 }]), "{}", chave("c")])).toBe("OR007");
  });
});

describe("H — cancelamento e fechamento", () => {
  it("antes de concluir, cancelar libera o aparelho", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.aparelho, itens.a2);
    expect(await item(itens.a2)).toMatchObject({ situacao: "reservado" });
    expect(await valor<boolean>(ana, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [venda])).toBe(true);
    expect(await item(itens.a2)).toEqual({ situacao: "disponivel", em_estoque: true });
  });

  it("concluída: só a gerência cancela, com estorno no caixa; o aparelho volta só no retorno conferido; caixas fecham e conferem", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const caixaAna = await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.aparelho, itens.a1);
    await concluir(ana, venda, [{ meio: "dinheiro", valor: 150_000 }]);
    expect(await errou(ana, "select public.cancelar_venda($1, 'Arrependimento')", [venda])).toBe("P0002");

    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await errou(dono, "select public.cancelar_venda($1, 'Arrependimento')", [venda])).toBe("OR008");
    const caixaDono = await abrirCaixa(dono, 200_000);
    expect(await valor<boolean>(dono, "select public.cancelar_venda($1, 'Arrependimento do cliente') as v", [venda])).toBe(true);
    // Cancelamento comercial não repõe estoque (#51): o aparelho espera o retorno físico conferido.
    expect(await item(itens.a1)).toEqual({ situacao: "vendido", em_estoque: false });
    expect(await dinheiroNoCaixa(caixaDono)).toBe(200_000 - 149_900);
    const retorno = (await db.query<{ id: string }>("select id from public.venda_retornos where venda_id = $1 and situacao = 'pendente'", [venda])).rows[0]?.id;
    const imei = (await db.query<{ imei: string }>("select imei from public.itens_serializados where id = $1", [itens.a1])).rows[0]?.imei;
    expect(await valor(dono, "select public.conferir_retorno($1, true, $2, 'novo', null) as v", [retorno, imei])).toBe("recebido");
    expect(await item(itens.a1)).toEqual({ situacao: "disponivel", em_estoque: true });
    expect(await divergencias()).toEqual([]);

    const [fechamento] = await linhas<{ esperado: string; contado: string; diferenca: string }>(ana, "select * from public.fechar_caixa($1, null)", [10_000 + 149_900]);
    expect(Number(fechamento?.diferenca)).toBe(0);
    expect(await errou(ana, "select public.conferir_caixa($1, null)", [caixaAna])).toBe("P0002");
    expect(await valor<boolean>(dono, "select public.conferir_caixa($1, 'Conferido') as v", [caixaAna])).toBe(true);
  });

  it("caixa: um aberto por pessoa e loja; sangria não passa do dinheiro; diferença no fechamento exige explicação", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana, 5_000);
    expect(await errou(ana, "select public.abrir_caixa(0, $1)", [chave("caixa")])).toBe("23505");
    expect(await errou(ana, "select public.movimentar_caixa('sangria', 6000, 'Depósito', $1)", [chave("m")])).toBe("23514");
    await valor(ana, "select public.movimentar_caixa('suprimento', 2000, 'Troco do banco', $1) as v", [chave("m")]);
    expect(await errou(ana, "select * from public.fechar_caixa(6000, null)")).toBe("22023");
    const [r] = await linhas<{ diferenca: string }>(ana, "select * from public.fechar_caixa(6000, 'Faltou uma nota de 10')");
    expect(Number(r?.diferenca)).toBe(-1_000);
  });
});

describe("I — papel, loja e organização", () => {
  it("só quem vende mexe na própria venda; técnico não vende; outra rede não vê; custo só com custo.ver", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.capa, null, 1);
    await concluir(ana, venda, [{ meio: "dinheiro", valor: 7_900 }]);

    const colegaB = await naLoja(ids.vendedorAB, ids.lojaB);
    expect(await errou(colegaB, "select public.adicionar_item($1, $2, null, 1, 'x')", [venda, cat.capa])).toBe("P0002");
    expect(await linhas(colegaB, "select id from public.vendas")).toEqual([]);
    expect(await errou(await naLoja(ids.tecnico, ids.assistencia), "select public.criar_venda('t')")).toBe("42501");
    expect(await linhas(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), "select id from public.vendas")).toEqual([]);
    expect(await linhas(await naLoja(ids.gerenteB, ids.lojaB), "select id from public.vendas")).toEqual([]);

    expect(await linhas(ana, "select item_id from public.venda_itens_custos")).toEqual([]);
    expect(await linhas(await naLoja(ids.dono, ids.lojaA), "select custo_unitario_centavos from public.venda_itens_custos")).toHaveLength(1);
    expect(await linhas(ana, "select id from public.vendas")).toHaveLength(1);
  });
});

// PDV-c (pedido do proprietário de 18/11): a PayJoy e a Aiva financiam o celular; a entrada é um lançamento à parte, na
// mesma venda; as parcelas contam em todos os casos que parcelam; o chip e os acessórios entram na mesma venda, pagos à parte.
describe("PDV-c — a entrada à parte, as parcelas e o financiamento só do celular", () => {
  const pagamentos = async (venda: string) => (await db.query<{ meio: string; valor_centavos: number; parcelas: number | null; entrada_do_financiamento: boolean }>(
    "select meio, valor_centavos, parcelas, entrada_do_financiamento from public.venda_pagamentos where venda_id = $1 order by ordem", [venda])).rows;
  const comChip = async () => {
    await db.query("insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem) values ($1, $2, null, 1000, now() - interval '1 day', 'manual')",
      [ids.organizacao, cat.chip]);
  };

  it("celular pela PayJoy em 12 parcelas, a entrada em dinheiro à parte e o chip no Pix: tudo na mesma venda, cada um no seu lançamento", async () => {
    await comChip();
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const caixa = await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.aparelho, itens.a1);
    await adicionar(ana, venda, cat.chip, itens.chipA);
    const r = await concluir(ana, venda, [
      { meio: "payjoy", valor: 119_900, parcelas: 12, comprovante: "CONTRATO-FICTICIO-1" },
      { meio: "dinheiro", valor: 30_000, entrada_do_financiamento: true },
      { meio: "pix_direto", valor: 1_000, comprovante: "PIX-FICTICIO-1" },
    ]);
    expect(r).toMatchObject({ total: 149_900 + 1_000, recebido: 31_000, a_receber: 119_900, troco: 0 });
    expect(await pagamentos(venda)).toEqual([
      { meio: "payjoy", valor_centavos: 119_900, parcelas: 12, entrada_do_financiamento: false },
      { meio: "dinheiro", valor_centavos: 30_000, parcelas: null, entrada_do_financiamento: true },
      { meio: "pix_direto", valor_centavos: 1_000, parcelas: null, entrada_do_financiamento: false },
    ]);
    expect((await db.query("select devedor, valor_centavos from public.contas_a_receber where venda_id = $1", [venda])).rows)
      .toEqual([{ devedor: "payjoy", valor_centavos: 119_900 }]);
    expect(await dinheiroNoCaixa(caixa)).toBe(10_000 + 30_000);
    expect(await divergencias()).toEqual([]);
  });

  it("a PayJoy e a Aiva financiam só o celular: acima do valor dele, ou numa venda sem celular, é recusado", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.aparelho, itens.a1);
    await adicionar(ana, venda, cat.capa, null, 2);
    // A capa (15.800) não entra no financiamento: financiar o total é recusado.
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify([{ meio: "aiva", valor: 165_700, parcelas: 10 }]), "{}", chave("c")])).toBe("OR009");
    expect(await errou(ana, CONCLUIR, [venda, JSON.stringify([
      { meio: "aiva", valor: 149_901, parcelas: 10 }, { meio: "dinheiro", valor: 15_799 }]), "{}", chave("c")])).toBe("OR009");
    // Até o valor do celular, com a capa paga à parte, passa.
    const r = await concluir(ana, venda, [{ meio: "aiva", valor: 149_900, parcelas: 10 }, { meio: "cartao_picpay", valor: 15_800, parcelas: 3, comprovante: "NSU-FICTICIO-1" }]);
    expect(r).toMatchObject({ a_receber: 149_900, recebido: 15_800 });
    expect((await pagamentos(venda)).map((p) => [p.meio, p.parcelas])).toEqual([["aiva", 10], ["cartao_picpay", 3]]);
    const semCelular = await novaVenda(ana);
    await adicionar(ana, semCelular, cat.capa, null, 1);
    expect(await errou(ana, CONCLUIR, [semCelular, JSON.stringify([{ meio: "payjoy", valor: 7_900, parcelas: 2 }]), "{}", chave("c")])).toBe("OR009");
  });

  it("as parcelas: obrigatórias na PayJoy e na Aiva (1 a 48); no cartão, de 1 a 24 (sem informar, à vista); nos outros meios, nenhuma", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.aparelho, itens.a1);
    for (const errado of [
      [{ meio: "payjoy", valor: 149_900 }],
      [{ meio: "payjoy", valor: 149_900, parcelas: 0 }],
      [{ meio: "payjoy", valor: 149_900, parcelas: 49 }],
      [{ meio: "payjoy", valor: 149_900, parcelas: "12" }],
      [{ meio: "cartao_pagseguro", valor: 149_900, parcelas: 25, comprovante: "NSU-FICTICIO-2" }],
      [{ meio: "dinheiro", valor: 149_900, parcelas: 3 }],
      [{ meio: "pix_direto", valor: 149_900, parcelas: 2, comprovante: "PIX-FICTICIO-2" }],
    ]) {
      expect(await errou(ana, CONCLUIR, [venda, JSON.stringify(errado), "{}", chave("c")]), JSON.stringify(errado)).toBe("OR009");
    }
    await concluir(ana, venda, [{ meio: "cartao_pagseguro", valor: 149_900, comprovante: "NSU-FICTICIO-3" }]);
    expect((await pagamentos(venda)).map((p) => p.parcelas)).toEqual([1]);
  });

  it("a entrada é paga em dinheiro, Pix ou cartão, e só existe numa venda com a PayJoy ou a Aiva", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.aparelho, itens.a1);
    for (const errado of [
      [{ meio: "payjoy", valor: 149_900, parcelas: 12, entrada_do_financiamento: true }],
      [{ meio: "payjoy", valor: 119_900, parcelas: 12 }, { meio: "vale_troca", valor: 30_000, comprovante: "VALE-0001", entrada_do_financiamento: true }],
      [{ meio: "dinheiro", valor: 149_900, entrada_do_financiamento: true }],
      [{ meio: "payjoy", valor: 119_900, parcelas: 12 }, { meio: "dinheiro", valor: 30_000, entrada_do_financiamento: "sim" }],
    ]) {
      expect(await errou(ana, CONCLUIR, [venda, JSON.stringify(errado), "{}", chave("c")]), JSON.stringify(errado)).toBe("OR009");
    }
    const r = await concluir(ana, venda, [
      { meio: "payjoy", valor: 119_900, parcelas: 18 },
      { meio: "cartao_picpay", valor: 30_000, parcelas: 2, comprovante: "NSU-FICTICIO-4", entrada_do_financiamento: true },
    ]);
    expect(r).toMatchObject({ a_receber: 119_900, recebido: 30_000 });
    expect((await pagamentos(venda)).map((p) => [p.meio, p.parcelas, p.entrada_do_financiamento])).toEqual([["payjoy", 18, false], ["cartao_picpay", 2, true]]);
  });
});

