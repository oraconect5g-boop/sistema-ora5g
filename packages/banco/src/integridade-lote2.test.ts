// Lote 2 do prompt consolidado (09/11/2026): regressões permanentes das provas do Codex
// (docs/analises/evidencias/2026-11-08-vendas e 2026-11-08-setores na PR #33), adaptadas ao contrato
// novo sem afrouxar a regra, cada uma com controle positivo. Banco em memória com todas as
// migrations; dados FICTÍCIOS; cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { conferirPagamentos, MEIOS, type MeioPagamento, type Pagamento } from "../../dominio/src/pagamento";
import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
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
async function naLoja(usuario: string, unidade = ids.lojaA): Promise<Sessao> {
  const s = { usuario, sessao: `4b000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

const abrirCaixa = (s: Sessao, fundo = 0) => valor<string>(s, "select public.abrir_caixa($1, $2) as v", [fundo, chave("caixa")]);
async function vendaCom(s: Sessao, variante = cat.aparelho, item: string | null = itens.a1) {
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  const linha = await valor<string>(s, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda, variante, item, chave("item")]);
  return { venda, linha };
}
const CONCLUIR = "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v";
type Conclusao = { total: number; troco: number; recebido: number; a_receber: number };
const concluir = (s: Sessao, venda: string, pagamentos: object[], cliente: object = { email: "cliente@exemplo.com" }) =>
  valor<Conclusao>(s, CONCLUIR, [venda, JSON.stringify(pagamentos), JSON.stringify(cliente), chave("concluir")]);
const errouConcluir = (s: Sessao, venda: string, pagamentos: object[]) =>
  errou(s, CONCLUIR, [venda, JSON.stringify(pagamentos), JSON.stringify({ email: "cliente@exemplo.com" }), chave("concluir")]);
const cancelar = (s: Sessao, venda: string) => valor<boolean>(s, "select public.cancelar_venda($1, 'Cliente desistiu da compra') as v", [venda]);
const dinheiroNoCaixa = async (caixa: string) =>
  Number((await db.query<{ v: string }>("select coalesce(sum(valor_centavos), 0) as v from public.caixa_movimentos where caixa_id = $1 and meio = 'dinheiro'", [caixa])).rows[0]?.v);
const pagamentosDa = async (venda: string) => (await db.query<{ meio: string; situacao: string; estornado_em: string | null }>(
  "select meio, situacao, estornado_em from public.venda_pagamentos where venda_id = $1 order by ordem", [venda])).rows;
const estornosDa = async (venda: string) => (await db.query<{ id: string; meio: string; valor_centavos: number; situacao: string }>(
  "select id, meio, valor_centavos, situacao from public.estornos_externos where venda_id = $1 order by numero", [venda])).rows;
const posicao = async (item: string) =>
  (await db.query<{ situacao: string; em_estoque: boolean; condicao: string }>("select situacao, em_estoque, condicao from public.itens_serializados where id = $1", [item])).rows[0];
const imeiDe = async (item: string) => (await db.query<{ imei: string | null; iccid: string | null }>("select imei, iccid from public.itens_serializados where id = $1", [item])).rows[0];
const divergencias = async () => (await db.query("select regra from privado.divergencias_estoque()")).rows;

describe("#46 — entrada de financiamento por Pix ou cartão exige comprovante", () => {
  it.each(["pix_direto", "pix_picpay", "cartao_picpay", "cartao_pagseguro"])("entrada %s sem comprovante é recusada sem baixa nem conta a receber; com comprovante conclui", async (meio) => {
    const ana = await naLoja(ids.vendedorA);
    await abrirCaixa(ana);
    const { venda } = await vendaCom(ana);
    expect(await errouConcluir(ana, venda, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: meio, parcelas: 12 }])).toBe("OR009");
    expect(await errouConcluir(ana, venda, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: meio, comprovante: "12", parcelas: 12 }])).toBe("OR009");
    expect(await posicao(itens.a1)).toMatchObject({ situacao: "reservado", em_estoque: true });
    expect((await db.query("select 1 from public.contas_a_receber where venda_id = $1", [venda])).rows).toHaveLength(0);
    const r = await concluir(ana, venda, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: meio, comprovante: "FICTICIO-1234", parcelas: 12 }]);
    expect(r).toMatchObject({ recebido: 20_000, a_receber: 129_900, troco: 0 });
  });

  it("vale-troca não paga entrada de financiamento", async () => {
    const ana = await naLoja(ids.vendedorA);
    await abrirCaixa(ana);
    const { venda } = await vendaCom(ana);
    expect(await errouConcluir(ana, venda, [{ meio: "aiva", valor: 149_900, entrada: 20_000, meio_entrada: "vale_troca", comprovante: "VT-1", parcelas: 12 }])).toBe("OR009");
  });

  it("banco e domínio concordam sobre quais meios pedem comprovante e quais são financeiras", async () => {
    for (const meio of Object.keys(MEIOS) as MeioPagamento[]) {
      const r = (await db.query<{ comprovante: boolean; financeira: boolean }>(
        "select privado.meio_com_comprovante($1) as comprovante, privado.meio_financeira($1) as financeira", [meio])).rows[0];
      expect({ meio, ...r }).toEqual({ meio, comprovante: MEIOS[meio].comprovante, financeira: MEIOS[meio].financeira });
    }
  });
});

describe("#48 — troco só de linha em dinheiro: banco = domínio", () => {
  // Mesmos vetores no SQL (concluir_venda) e no TypeScript (conferirPagamentos). Preço do aparelho: 149.900.
  const vetores: { nome: string; pagamentos: (Pagamento & { meio_entrada?: string })[]; valido: boolean }[] = [
    { nome: "financiamento acima do preço com entrada em dinheiro", pagamentos: [{ meio: "aiva", valor: 150_000, entrada: 20_000, meio_entrada: "dinheiro", parcelas: 12 }], valido: false },
    { nome: "financiamento acima do preço sem entrada", pagamentos: [{ meio: "aiva", valor: 150_000, parcelas: 12 }], valido: false },
    { nome: "financiamento exato com entrada em dinheiro", pagamentos: [{ meio: "aiva", valor: 149_900, entrada: 20_000, meio_entrada: "dinheiro", parcelas: 12 }], valido: true },
    { nome: "financiamento e dinheiro com troco do dinheiro", pagamentos: [{ meio: "aiva", valor: 140_000, entrada: 20_000, meio_entrada: "dinheiro", parcelas: 12 }, { meio: "dinheiro", valor: 10_000 }], valido: true },
    { nome: "financiamento grande e pouco dinheiro", pagamentos: [{ meio: "aiva", valor: 149_000, parcelas: 12 }, { meio: "dinheiro", valor: 1_000 }], valido: true },
    { nome: "excedente maior que o dinheiro", pagamentos: [{ meio: "aiva", valor: 149_500, parcelas: 12 }, { meio: "dinheiro", valor: 300 }], valido: false },
    { nome: "dinheiro com troco", pagamentos: [{ meio: "dinheiro", valor: 150_000 }], valido: true },
  ];
  it.each(vetores)("$nome", async ({ pagamentos, valido }) => {
    const dominio = conferirPagamentos(149_900, pagamentos);
    expect(dominio.valido).toBe(valido);
    const ana = await naLoja(ids.vendedorA);
    await abrirCaixa(ana);
    const { venda } = await vendaCom(ana);
    if (!valido) {
      expect(await errouConcluir(ana, venda, pagamentos)).toBe("OR009");
      return;
    }
    const r = await concluir(ana, venda, pagamentos);
    expect({ troco: r.troco, recebido: r.recebido, a_receber: r.a_receber })
      .toEqual({ troco: dominio.troco, recebido: dominio.recebidoNaLoja, a_receber: dominio.aReceberDeFinanceiras });
  });
});

describe("#47 e #49 — estorno em dinheiro: saldo do caixa e recebido líquido", () => {
  it("estorno de entrada em dinheiro em caixa sem saldo é recusado e nada muda; com saldo, devolve só o retido", async () => {
    const ana = await naLoja(ids.vendedorA);
    const caixaAna = await abrirCaixa(ana);
    const { venda } = await vendaCom(ana);
    await concluir(ana, venda, [{ meio: "aiva", valor: 140_000, entrada: 20_000, meio_entrada: "dinheiro", parcelas: 12 }, { meio: "dinheiro", valor: 10_000 }]);
    const retido = await dinheiroNoCaixa(caixaAna);
    expect(retido).toBe(29_900);

    const dono = await naLoja(ids.dono);
    const vazio = await abrirCaixa(dono, 29_899);
    expect(await errou(dono, "select public.cancelar_venda($1, 'Cliente desistiu da compra')", [venda])).toBe("23514");
    expect(await dinheiroNoCaixa(vazio)).toBe(29_899);
    expect(await pagamentosDa(venda)).toEqual([
      { meio: "aiva", situacao: "confirmado", estornado_em: null }, { meio: "dinheiro", situacao: "confirmado", estornado_em: null }]);

    await valor(dono, "select public.movimentar_caixa('suprimento', 1, 'Troco do cofre', $1) as v", [chave("m")]);
    expect(await cancelar(dono, venda)).toBe(true);
    expect(await dinheiroNoCaixa(vazio)).toBe(0);
    expect((await db.query("select valor_centavos from public.caixa_movimentos where caixa_id = $1 and tipo = 'estorno' order by valor_centavos", [vazio])).rows)
      .toEqual([{ valor_centavos: -19_900 }, { valor_centavos: -10_000 }]);
  });
});

describe("#50 — Pix, cartão e financeira: estorno pedido não é estorno confirmado", () => {
  it.each(["pix_direto", "cartao_picpay"])("%s: o cancelamento deixa o estorno a confirmar; só o comprovante confirma, com autor e data", async (meio) => {
    const ana = await naLoja(ids.vendedorA);
    await abrirCaixa(ana);
    const { venda } = await vendaCom(ana);
    await concluir(ana, venda, [{ meio, valor: 149_900, comprovante: "VENDA-FICTICIA-1234" }]);
    const dono = await naLoja(ids.dono);
    const caixaDono = await abrirCaixa(dono);
    await cancelar(dono, venda);

    expect(await pagamentosDa(venda)).toEqual([{ meio, situacao: "estorno_pendente", estornado_em: null }]);
    expect((await db.query("select 1 from public.caixa_movimentos where caixa_id = $1 and tipo = 'estorno'", [caixaDono])).rows).toHaveLength(0);
    const [estorno] = await estornosDa(venda);
    expect(estorno).toMatchObject({ meio, valor_centavos: 149_900, situacao: "pendente" });

    expect(await errou(ana, "select public.confirmar_estorno_externo($1, 'EST-123456', null)", [estorno?.id])).toBe("P0002");
    expect(await errou(dono, "select public.confirmar_estorno_externo($1, '   ', null)", [estorno?.id])).toBe("22023");
    expect(await errou(dono, "update public.estornos_externos set situacao = 'confirmado' where id = $1", [estorno?.id])).toBe("42501");
    expect(await valor(dono, "select public.confirmar_estorno_externo($1, 'EST-123456', 'Estornado na maquininha') as v", [estorno?.id])).toBe("confirmado");
    expect(await valor(dono, "select public.confirmar_estorno_externo($1, 'EST-123456', null) as v", [estorno?.id])).toBe("confirmado");
    expect(await errou(dono, "select public.confirmar_estorno_externo($1, 'EST-999999', null)", [estorno?.id])).toBe("OR004");
    const [pago] = await pagamentosDa(venda);
    expect(pago).toMatchObject({ meio, situacao: "estornado" });
    expect(pago?.estornado_em).not.toBeNull();
    expect((await db.query("select confirmado_por, comprovante from public.estornos_externos where id = $1", [estorno?.id])).rows)
      .toEqual([{ confirmado_por: ids.dono, comprovante: "EST-123456" }]);
    expect(await errou(dono, "delete from public.estornos_externos where id = $1", [estorno?.id])).toBe("42501");
  });

  it("financiada com entrada por Pix: contrato e entrada ficam a confirmar; o pagamento só fica estornado depois dos dois", async () => {
    const ana = await naLoja(ids.vendedorA);
    await abrirCaixa(ana);
    const { venda } = await vendaCom(ana);
    await concluir(ana, venda, [{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: "pix_direto", comprovante: "PIX-ENTRADA-1", parcelas: 12 }]);
    const dono = await naLoja(ids.dono);
    await abrirCaixa(dono);
    await cancelar(dono, venda);
    expect((await db.query("select situacao from public.contas_a_receber where venda_id = $1", [venda])).rows).toEqual([{ situacao: "cancelada" }]);
    const estornos = await estornosDa(venda);
    expect(estornos.map(({ meio, valor_centavos, situacao }) => ({ meio, valor_centavos, situacao }))).toEqual([
      { meio: "payjoy", valor_centavos: 129_900, situacao: "pendente" }, { meio: "pix_direto", valor_centavos: 20_000, situacao: "pendente" }]);
    await valor(dono, "select public.confirmar_estorno_externo($1, 'PROTOCOLO-PAYJOY-77', null) as v", [estornos[0]?.id]);
    expect(await pagamentosDa(venda)).toEqual([{ meio: "payjoy", situacao: "estorno_pendente", estornado_em: null }]);
    await valor(dono, "select public.confirmar_estorno_externo($1, 'PIX-DEVOLVIDO-9', null) as v", [estornos[1]?.id]);
    expect((await pagamentosDa(venda))[0]?.situacao).toBe("estornado");
  });

  it("controle: dinheiro e vale-troca se resolvem no cancelamento", async () => {
    const ana = await naLoja(ids.vendedorA);
    await abrirCaixa(ana);
    const { venda } = await vendaCom(ana, cat.capa, null);
    await concluir(ana, venda, [{ meio: "dinheiro", valor: 7_900 }]);
    const dono = await naLoja(ids.dono);
    await abrirCaixa(dono, 10_000);
    await cancelar(dono, venda);
    expect((await pagamentosDa(venda))[0]?.situacao).toBe("estornado");
    expect(await estornosDa(venda)).toEqual([]);
  });
});

describe("#51 — cancelamento comercial não repõe estoque sem o retorno conferido", () => {
  it("aparelho: fica vendido; IMEI errado é recusado; o certo volta com a condição; repetir igual não duplica", async () => {
    const ana = await naLoja(ids.vendedorA);
    await abrirCaixa(ana);
    const { venda } = await vendaCom(ana);
    await concluir(ana, venda, [{ meio: "pix_direto", valor: 149_900, comprovante: "VENDA-FICTICIA-1234" }]);
    const dono = await naLoja(ids.dono);
    await abrirCaixa(dono);
    await cancelar(dono, venda);
    expect(await posicao(itens.a1)).toMatchObject({ situacao: "vendido", em_estoque: false });
    const retorno = (await db.query<{ id: string; situacao: string; quantidade: number }>("select id, situacao, quantidade from public.venda_retornos where venda_id = $1", [venda])).rows;
    expect(retorno.map(({ situacao, quantidade }) => ({ situacao, quantidade }))).toEqual([{ situacao: "pendente", quantidade: 1 }]);
    const id = retorno[0]?.id;
    const imei = (await imeiDe(itens.a1))?.imei;

    expect(await errou(ana, "select public.conferir_retorno($1, true, $2, 'novo', null)", [id, imei])).toBe("P0002");
    expect(await errou(dono, "select public.conferir_retorno($1, true, $2, 'novo', null)", [id, comDigitoLuhn("35209900111111")])).toBe("22023");
    expect(await errou(dono, "select public.conferir_retorno($1, true, null, 'novo', null)", [id])).toBe("22023");
    expect(await errou(dono, "select public.conferir_retorno($1, true, $2, 'usado', null)", [id, imei])).toBe("22023");
    expect(await valor(dono, "select public.conferir_retorno($1, true, $2, 'seminovo', 'Caixa aberta') as v", [id, imei])).toBe("recebido");
    expect(await valor(dono, "select public.conferir_retorno($1, true, $2, 'seminovo', null) as v", [id, imei])).toBe("recebido");
    expect(await errou(dono, "select public.conferir_retorno($1, true, $2, 'avariado', null)", [id, imei])).toBe("OR004");
    expect(await posicao(itens.a1)).toEqual({ situacao: "disponivel", em_estoque: true, condicao: "seminovo" });
    expect(await divergencias()).toEqual([]);
  });

  it("chip: fica vendido até a conferência pelo ICCID; item que não voltou fecha o retorno sem estoque, com explicação", async () => {
    await db.query("insert into public.precos (organizacao_id, variante_id, valor_centavos, inicio, origem) values ($1, $2, 1000, now() - interval '1 day', 'manual')", [ids.organizacao, cat.chip]);
    const ana = await naLoja(ids.vendedorA);
    await abrirCaixa(ana);
    const { venda } = await vendaCom(ana, cat.chip, itens.chipA);
    await concluir(ana, venda, [{ meio: "pix_direto", valor: 1_000, comprovante: "VENDA-FICTICIA-1234" }]);
    const dono = await naLoja(ids.dono);
    await abrirCaixa(dono);
    await cancelar(dono, venda);
    expect(await posicao(itens.chipA)).toMatchObject({ situacao: "vendido", em_estoque: false });
    const id = (await db.query<{ id: string }>("select id from public.venda_retornos where venda_id = $1", [venda])).rows[0]?.id;
    expect(await errou(dono, "select public.conferir_retorno($1, false, null, null, 'Perdeu')", [id])).toBe("22023");
    expect(await valor(dono, "select public.conferir_retorno($1, false, null, null, 'Cliente ficou com o chip e não voltou') as v", [id])).toBe("nao_recebido");
    expect(await errou(dono, "select public.conferir_retorno($1, true, $2, 'novo', null)", [id, (await imeiDe(itens.chipA))?.iccid])).toBe("OR004");
    expect(await posicao(itens.chipA)).toMatchObject({ situacao: "vendido", em_estoque: false });
    expect(await divergencias()).toEqual([]);
  });

  it("chip com ativação viva na Ora Connect impede o cancelamento (chip usado não volta como virgem)", async () => {
    const admin = await naLoja(ids.administrador);
    await valor(admin, "select public.connect_habilitar('ativacao', true, 'Homologado com linha de teste (fictício)') as v");
    for (const [tipo, lista] of [["plano", [{ codigo: "99999", nome: "7 GB", valor_centavos: 4490 }]], ["ddd", [{ codigo: "51", nome: "51", uf: "RS" }]],
      ["cidade", [{ codigo: "7703", nome: "Aceguá", uf: "RS" }]]] as const) {
      await db.exec("set role service_role");
      try { await db.query("select public.connect_worker_atualizar_referencias($1, $2, $3::jsonb)", [ids.organizacao, tipo, JSON.stringify(lista)]); } finally { await db.exec("reset role"); }
    }
    await db.query("insert into public.precos (organizacao_id, variante_id, valor_centavos, inicio, origem) values ($1, $2, 1000, now() - interval '1 day', 'manual')", [ids.organizacao, cat.chip]);
    const ana = await naLoja(ids.vendedorA);
    await abrirCaixa(ana);
    const { venda } = await vendaCom(ana, cat.chip, itens.chipA);
    await concluir(ana, venda, [{ meio: "dinheiro", valor: 1_000 }]);
    await valor(ana, "select public.connect_registrar('ativacao', $1::jsonb, $2) as v", [JSON.stringify({
      metodo: "LINK", iccid: cat.iccid1, ddd: 51, plano: 99999,
      cliente: { nome: "Cliente Fictício da Silva", cpf: "123.456.789-09", data_nascimento: "1990-05-20",
        endereco: { rua: "Rua Exemplo", numero: "123", bairro: "Centro", cep: "90000-000", id_cidade: 7703 } } }), chave("op")]);
    const dono = await naLoja(ids.dono);
    await abrirCaixa(dono, 10_000);
    expect(await errou(dono, "select public.cancelar_venda($1, 'Cliente desistiu da compra')", [venda])).toBe("OR013");
    expect(await posicao(itens.chipA)).toMatchObject({ situacao: "vendido", em_estoque: false });
  });
});

describe("#34 — repetição da chave confere o conteúdo inteiro", () => {
  it("reserva com produto nulo é recusada, também ao repetir a chave; controle: mesma chave e conteúdo devolve a mesma reserva", async () => {
    const ana = await naLoja(ids.vendedorA);
    const k = chave("reserva");
    const reserva = await valor<string>(ana, "select public.reservar_estoque($1, 1, null, $2) as v", [cat.capa, k]);
    expect(await errou(ana, "select public.reservar_estoque(null, 1, null, $1)", [k])).toBe("22023");
    expect(await errou(ana, "select public.reservar_estoque(null, 1, null, $1)", [chave("reserva")])).toBe("22023");
    expect(await valor<string>(ana, "select public.reservar_estoque($1, 1, null, $2) as v", [cat.capa, k])).toBe(reserva);
  });

  it.each(["condicao", "serie"] as const)("entrada repetida com outra %s é OR004; controle: igual devolve o mesmo item", async (campo) => {
    const imei = comDigitoLuhn("35209900997777");
    const ENTRADA = "select privado.registrar_item_serializado($1, $2, $3, null, null, 'entrada_compra', 'lote2-entrada', null, $4, $5) as v";
    const item = (await db.query<{ v: string }>(ENTRADA, [ids.lojaA, cat.aparelho, imei, "novo", "SERIE-1"])).rows[0]?.v;
    expect((await db.query<{ v: string }>(ENTRADA, [ids.lojaA, cat.aparelho, imei, "novo", "SERIE-1"])).rows[0]?.v).toBe(item);
    const condicao = campo === "condicao" ? "seminovo" : "novo";
    const serie = campo === "serie" ? "SERIE-2" : "SERIE-1";
    expect(await erroDe(() => db.query(ENTRADA, [ids.lojaA, cat.aparelho, imei, condicao, serie]))).toBe("OR004");
  });
});
