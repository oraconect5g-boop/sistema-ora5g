// Lote PAY-011a (24/11/2026; ORA-PAY-011: "gerir chargebacks, estornos, antecipação e ajustes; efeito financeiro e comissão
// não duplicado"; migration 20261124082944_debito_do_extrato_confirma_o_estorno): o débito do extrato é a prova do estorno
// da venda, e cada débito prova um estorno só. Aqui: as sugestões, ligar (confirmando o estorno pendente, ou só guardando
// a prova do que já estava confirmado), a repetição sem gravar de novo, o uso único dos dois lados, desfazer, as regras
// (valor, meio, sinal, data e loja), quem pode, a devolução, o chargeback que chega antes do cancelamento, o resumo, a
// auditoria e a regra na tabela (para qualquer caminho). A disputa com duas conexões está em
// debito-do-extrato-e-estorno-concorrencia.test.ts. Dados FICTÍCIOS; cada teste numa transação desfeita.
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

let sessoes = 0;
let arquivos = 0;
let chaves = 0;
const impressao = () => `e${String(++arquivos).padStart(63, "0")}`;
const chave = (p: string) => `${p}:pay11:${String(++chaves).padStart(5, "0")}`;
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
  const s = { usuario, sessao: `4e000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const linhas = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows, { criarSessao: false });
const recusa = (s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });
/** A recusa de uma escrita feita direto na tabela, sem passar pelas funções (o que só um caminho novo ou um erro faria). */
const recusaDireta = (sql: string, params: unknown[] = []) => erroDe(() => db.query(sql, params));
const dia = async (mais = 0) => (await db.query<{ d: string }>("select to_char((now() at time zone 'America/Sao_Paulo')::date + $1::int, 'YYYY-MM-DD') as d", [mais])).rows[0]?.d ?? "";
const diaNaTela = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

const IMPORTAR = "select public.extrato_importar($1, $2, $3, $4::text[], 'extrato.csv', $5, $6::jsonb, '{\"data\": 0}'::jsonb) as v";
const SUGESTOES = "select * from public.extrato_sugestoes_de_estorno($1)";
const CASAR = "select public.extrato_casar_estorno($1, $2, $3) as v";
const IGNORAR = "select public.extrato_ignorar($1, $2) as v";
const DESFAZER = "select public.extrato_desfazer($1, $2) as v";
const CONFIRMAR = "select public.confirmar_estorno_externo($1, $2, $3) as v";
const CHARGEBACK = "select public.extrato_estorno_chargeback($1, $2, $3) as v";
type LinhaDoArquivo = { data: string; valor: number; referencia?: string; descricao?: string };
/** Importa o extrato (da loja, ou da rede com a loja nula) e devolve o extrato, o número dele e o id de cada linha, pela ordem. */
async function extrato(s: Sessao, unidade: string | null, lista: LinhaDoArquivo[], meios = ["cartao_picpay", "pix_picpay"], fonte = "PicPay da loja") {
  const r = await valor<{ extrato: string; numero: number }>(s, IMPORTAR,
    [unidade, unidade ? "maquininha" : "banco", fonte, meios, impressao(), JSON.stringify(lista.map((l, i) => ({ numero: i + 1, ...l })))]);
  const lidas = (await db.query<{ id: string }>("select id from public.extrato_linhas where extrato_id = $1 order by numero", [r.extrato])).rows.map((l) => l.id);
  return { extrato: r.extrato, numero: Number(r.numero), linhas: lidas };
}
type Venda = { venda: string; numero: number; pagamento: string; item: string };
/** Uma venda de capas (R$ 79,00 cada) concluída por quem está logado (com o caixa aberto), com o pagamento dado. */
async function vender(s: Sessao, pagamento: Record<string, unknown>, quantidade = 1): Promise<Venda> {
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  const item = await valor<string>(s, "select public.adicionar_item($1, $2, null, $3, $4) as v", [venda, cat.capa, quantidade, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, JSON.stringify([pagamento]), chave("fim")]);
  const lida = (await db.query<{ numero: string; pagamento: string }>(
    "select v.numero, p.id as pagamento from public.vendas v join public.venda_pagamentos p on p.venda_id = v.id where v.id = $1", [venda])).rows[0];
  return { venda, numero: Number(lida?.numero), pagamento: lida?.pagamento ?? "", item };
}
type Estorno = { id: string; numero: number };
/** O cancelamento de sempre: devolve o estorno que ele deixou a confirmar. */
async function cancelar(s: Sessao, v: Venda, motivo = "Cliente desistiu"): Promise<Estorno> {
  await valor(s, "select public.cancelar_venda($1, $2) as v", [v.venda, motivo]);
  const e = (await db.query<{ id: string; numero: string }>("select id, numero from public.estornos_externos where venda_id = $1", [v.venda])).rows;
  expect(e).toHaveLength(1);
  return { id: e[0]?.id ?? "", numero: Number(e[0]?.numero) };
}
const abrirCaixa = (s: Sessao) => valor(s, "select public.abrir_caixa(0, $1) as v", [chave("caixa")]);
type LinhaGravada = { situacao: string; estorno_id: string | null; confirmou_o_estorno: boolean | null; chargeback: boolean | null; decidida_por: string | null; motivo: string | null; pagamento_id: string | null };
const linhaDe = async (id: string) => (await db.query<LinhaGravada>(
  "select situacao, estorno_id, confirmou_o_estorno, chargeback, decidida_por, motivo, pagamento_id from public.extrato_linhas where id = $1", [id])).rows[0];
type EstornoGravado = { situacao: string; comprovante: string | null; observacao: string | null; confirmado_por: string | null };
const estornoDe = async (id: string) => (await db.query<EstornoGravado>(
  "select situacao, comprovante, observacao, confirmado_por from public.estornos_externos where id = $1", [id])).rows[0];
const pagamentoDe = async (id: string) => (await db.query<{ situacao: string }>("select situacao from public.venda_pagamentos where id = $1", [id])).rows[0]?.situacao;
const auditoriaDe = async (alvo: string, acao: string) => (await db.query<{ motivo: string | null; usuario_id: string | null }>(
  "select motivo, usuario_id from public.auditoria where alvo_id = $1 and acao = $2 order by id", [alvo, acao])).rows;
type Sugestao = {
  linha_id: string; estorno_id: string; estorno_numero: number; venda_numero: number; meio: string; valor_centavos: number; situacao: string; comprovante: string | null;
  loja: string; de_devolucao: boolean; pela_referencia: boolean; pode_confirmar: boolean; na_loja_do_turno: boolean;
};
const sugestoes = (s: Sessao, e: string) => linhas<Sugestao>(s, SUGESTOES, [e]);

describe("o débito do extrato confirma o estorno da venda (PAY-011a)", () => {
  it("o estorno pendente é sugerido ao débito de mesmo valor; ligar confirma o estorno com a referência da linha, e o pagamento fica estornado; repetir não grava de novo", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    const d = await dia();
    const venda = await vender(dono, { meio: "cartao_picpay", valor: 7900, comprovante: "NSU-10" });
    const estorno = await cancelar(dono, venda);
    expect(await pagamentoDe(venda.pagamento)).toBe("estorno_pendente");
    const e = await extrato(dono, ids.lojaA, [
      { data: d, valor: 7900, referencia: "NSU-10", descricao: "Venda crédito" },
      { data: d, valor: -7900, referencia: "EST-NSU-10", descricao: "Estorno" },
      { data: d, valor: -350, descricao: "Tarifa" },
      { data: d, valor: -7900, descricao: "Outro débito do mesmo valor" },
    ]);
    const [, debito, , outro] = e.linhas as [string, string, string, string];

    // Só os débitos de mesmo valor recebem a sugestão: nem o crédito, nem a tarifa.
    const antes = await sugestoes(dono, e.extrato);
    expect(antes.map((s) => s.linha_id)).toEqual([debito, outro]);
    expect(antes[0]).toMatchObject({
      estorno_id: estorno.id, estorno_numero: estorno.numero, venda_numero: venda.numero, meio: "cartao_picpay", valor_centavos: 7900,
      situacao: "pendente", comprovante: null, loja: "Loja A", de_devolucao: false, pela_referencia: false, pode_confirmar: true, na_loja_do_turno: true,
    });

    expect(await valor(dono, CASAR, [debito, estorno.id, false]))
      .toEqual({ ligada: true, repetida: false, confirmou: true, chargeback: false, estorno: estorno.numero, venda: venda.numero });
    // O estorno fica confirmado pela confirmação de sempre: o comprovante é a referência da linha, e a observação diz de onde veio.
    expect(await estornoDe(estorno.id)).toEqual({
      situacao: "confirmado", comprovante: "EST-NSU-10", confirmado_por: ids.dono,
      observacao: `Confirmado pelo débito do extrato nº ${e.numero} (PicPay da loja), linha 2, de ${diaNaTela(d)}`,
    });
    expect(await pagamentoDe(venda.pagamento)).toBe("estornado");
    expect(await linhaDe(debito)).toEqual({ situacao: "estorno", estorno_id: estorno.id, confirmou_o_estorno: true, chargeback: false, decidida_por: ids.dono, motivo: null, pagamento_id: null });
    // O estorno já tem o débito dele: o outro débito de mesmo valor não o recebe mais como sugestão.
    expect(await sugestoes(dono, e.extrato)).toEqual([]);

    // O resumo e a lista contam a linha de estorno à parte, e o total fecha.
    expect(await valor(dono, "select public.extrato_resumo($1) as v", [e.extrato])).toMatchObject({ creditos: 1, debitos: 3, pendentes: 3, conciliadas: 0, ignoradas: 0, repasses: 0, estornos: 1 });
    expect(await linhas(dono, "select pendentes::int, conciliadas::int, ignoradas::int, repasses::int, estornos::int from public.extratos_recentes(10) where id = $1", [e.extrato]))
      .toEqual([{ pendentes: 3, conciliadas: 0, ignoradas: 0, repasses: 0, estornos: 1 }]);

    // A auditoria guarda as duas mudanças, com quem fez e por quê.
    expect(await auditoriaDe(debito, "extrato_linhas.alterado")).toEqual([
      { motivo: `Débito do extrato ligado ao estorno nº ${estorno.numero} da venda nº ${venda.numero} (o débito confirmou o estorno)`, usuario_id: ids.dono }]);
    expect(await auditoriaDe(estorno.id, "estornos_externos.alterado")).toEqual([{ motivo: "Estorno externo confirmado pelo comprovante EST-NSU-10", usuario_id: ids.dono }]);

    // O mesmo pedido de novo devolve o que já estava gravado, sem gravar nem auditar outra vez.
    expect(await valor(dono, CASAR, [debito, estorno.id, true]))
      .toEqual({ ligada: true, repetida: true, confirmou: true, chargeback: false, estorno: estorno.numero, venda: venda.numero });
    expect(await auditoriaDe(debito, "extrato_linhas.alterado")).toHaveLength(1);
    expect(await auditoriaDe(estorno.id, "estornos_externos.alterado")).toHaveLength(1);
  });

  it("a linha sem referência (ou com referência curta demais) confirma com o número do extrato e da linha", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    const d = await dia();
    const e1 = await cancelar(dono, await vender(dono, { meio: "pix_picpay", valor: 7900, comprovante: "PIX-1" }));
    const e2 = await cancelar(dono, await vender(dono, { meio: "pix_picpay", valor: 7900, comprovante: "PIX-2" }));
    const e = await extrato(dono, ids.lojaA, [{ data: d, valor: -7900 }, { data: d, valor: -7900, referencia: "AB" }]);
    await valor(dono, CASAR, [e.linhas[0], e1.id, false]);
    await valor(dono, CASAR, [e.linhas[1], e2.id, false]);
    expect((await estornoDe(e1.id))?.comprovante).toBe(`EXTRATO-${e.numero}-L1`);
    expect((await estornoDe(e2.id))?.comprovante).toBe(`EXTRATO-${e.numero}-L2`);
  });

  it("um uso só: a linha que confirmou não confirma outro estorno, não sai da conta e não se desfaz; o estorno não aceita outro débito", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    const d = await dia();
    const v1 = await vender(dono, { meio: "cartao_picpay", valor: 7900, comprovante: "NSU-21" });
    const v2 = await vender(dono, { meio: "cartao_picpay", valor: 7900, comprovante: "NSU-22" });
    const e1 = await cancelar(dono, v1);
    const e2 = await cancelar(dono, v2);
    const e = await extrato(dono, ids.lojaA, [{ data: d, valor: -7900, referencia: "EST-21" }, { data: d, valor: -7900, referencia: "EST-22" }]);
    const [l1, l2] = e.linhas as [string, string];
    // Enquanto os dois esperam, cada débito recebe os dois como sugestão (o mesmo valor): quem liga escolhe.
    expect((await sugestoes(dono, e.extrato)).map((s) => [s.linha_id, s.estorno_id])).toEqual([[l1, e1.id], [l1, e2.id], [l2, e1.id], [l2, e2.id]]);
    await valor(dono, CASAR, [l1, e1.id, false]);

    // A mesma linha não confirma o outro estorno (seria o mesmo débito provando dois estornos).
    expect(await recusa(dono, CASAR, [l1, e2.id, false])).toBe("22023");
    expect((await estornoDe(e2.id))?.situacao).toBe("pendente");
    // O estorno já provado não aceita outro débito.
    expect(await recusa(dono, CASAR, [l2, e1.id, false])).toBe("22023");
    // A linha tem o uso dela: não sai da conta, não concilia uma venda e, por ter confirmado o estorno, não se desfaz.
    expect(await recusa(dono, IGNORAR, [l1, "Tentativa"])).toBe("OR046");
    expect(await recusa(dono, "select public.extrato_conciliar($1, $2)", [l1, v2.pagamento])).toBe("22023");
    expect(await recusa(dono, DESFAZER, [l1, "Liguei errado"])).toBe("OR047");
    expect(await linhaDe(l1)).toMatchObject({ situacao: "estorno", estorno_id: e1.id, confirmou_o_estorno: true });
    // O estorno confirmado pelo extrato não é confirmado de novo à mão com outro código (a regra de sempre).
    expect(await recusa(dono, CONFIRMAR, [e1.id, "OUTRO-CODIGO", null])).toBe("OR004");

    // O outro débito agora só recebe o estorno que sobrou, e o confirma.
    expect((await sugestoes(dono, e.extrato)).map((s) => [s.linha_id, s.estorno_id])).toEqual([[l2, e2.id]]);
    await valor(dono, CASAR, [l2, e2.id, false]);
    expect([(await estornoDe(e1.id))?.comprovante, (await estornoDe(e2.id))?.comprovante]).toEqual(["EST-21", "EST-22"]);
    expect([await pagamentoDe(v1.pagamento), await pagamentoDe(v2.pagamento)]).toEqual(["estornado", "estornado"]);
  });

  it("o estorno já confirmado à mão só ganha a prova; essa ligação se desfaz com o motivo, e o estorno continua confirmado", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    const d = await dia();
    const venda = await vender(dono, { meio: "cartao_picpay", valor: 7900, comprovante: "NSU-30" });
    const estorno = await cancelar(dono, venda);
    await valor(dono, CONFIRMAR, [estorno.id, "EST-MANUAL-30", "Estorno feito na maquininha"]);
    const confirmado = await estornoDe(estorno.id);
    const e = await extrato(dono, ids.lojaA, [{ data: d, valor: -7900, referencia: "OUTRA-REF" }, { data: d, valor: -7900, referencia: "EST-MANUAL-30" }]);
    const [semReferencia, comReferencia] = e.linhas as [string, string];
    // A sugestão diz que o estorno já está confirmado e mostra o comprovante; a linha com a mesma referência é reconhecida.
    const lidas = await sugestoes(dono, e.extrato);
    expect(lidas.map((s) => ({ linha: s.linha_id, situacao: s.situacao, comprovante: s.comprovante, pela_referencia: s.pela_referencia }))).toEqual([
      { linha: semReferencia, situacao: "confirmado", comprovante: "EST-MANUAL-30", pela_referencia: false },
      { linha: comReferencia, situacao: "confirmado", comprovante: "EST-MANUAL-30", pela_referencia: true },
    ]);
    expect(await valor(dono, CASAR, [semReferencia, estorno.id, false])).toMatchObject({ ligada: true, repetida: false, confirmou: false });
    // O estorno não muda: o comprovante, a observação e quem confirmou são os de antes.
    expect(await estornoDe(estorno.id)).toEqual(confirmado);
    expect(await auditoriaDe(estorno.id, "estornos_externos.alterado")).toHaveLength(1);
    expect(await linhaDe(semReferencia)).toMatchObject({ situacao: "estorno", estorno_id: estorno.id, confirmou_o_estorno: false, chargeback: false });

    // Liguei na linha errada: desfazer pede o motivo, solta a linha e deixa o estorno como estava.
    expect(await recusa(dono, DESFAZER, [semReferencia, "x"])).toBe("22023");
    expect(await valor(dono, DESFAZER, [semReferencia, "Era a outra linha"])).toBe(true);
    expect(await linhaDe(semReferencia)).toEqual({ situacao: "pendente", estorno_id: null, confirmou_o_estorno: null, chargeback: null, decidida_por: null, motivo: null, pagamento_id: null });
    expect(await estornoDe(estorno.id)).toEqual(confirmado);
    expect((await auditoriaDe(semReferencia, "extrato_linhas.alterado")).map((a) => a.motivo)).toEqual([
      `Débito do extrato ligado ao estorno nº ${estorno.numero} da venda nº ${venda.numero} (o estorno já estava confirmado)`,
      `Débito do extrato solto do estorno nº ${estorno.numero}: Era a outra linha`,
    ]);
    expect(await valor(dono, DESFAZER, [semReferencia, "De novo"])).toBe(false);
    // A linha certa recebe a prova; a que foi solta pode sair da conta, como qualquer débito pendente.
    expect(await valor(dono, CASAR, [comReferencia, estorno.id, false])).toMatchObject({ confirmou: false, repetida: false });
    expect(await valor(dono, IGNORAR, [semReferencia, "Tarifa cobrada junto"])).toBe(true);
    expect(await valor(dono, "select public.extrato_resumo($1) as v", [e.extrato])).toMatchObject({ pendentes: 0, ignoradas: 1, estornos: 1 });
  });

  it("as regras: só débito, do mesmo valor, de um meio do extrato, com data entre o dia da venda e hoje", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    const d = await dia();
    const cartao = await cancelar(dono, await vender(dono, { meio: "cartao_picpay", valor: 7900, comprovante: "NSU-40" }));
    const pixDireto = await cancelar(dono, await vender(dono, { meio: "pix_direto", valor: 7900, comprovante: "E2E-40" }));
    const e = await extrato(dono, ids.lojaA, [
      { data: d, valor: 7900 }, { data: d, valor: -7800 }, { data: await dia(-1), valor: -7900 }, { data: await dia(1), valor: -7900 }, { data: d, valor: -7900 },
    ]);
    const [credito, outroValor, antesDaVenda, futuro, certo] = e.linhas as [string, string, string, string, string];
    // Só o débito certo recebe a sugestão, e só do estorno do cartão (o Pix direto não é um meio deste extrato).
    expect((await sugestoes(dono, e.extrato)).map((s) => [s.linha_id, s.estorno_id])).toEqual([[certo, cartao.id]]);
    for (const linha of [credito, outroValor, antesDaVenda, futuro]) expect(await recusa(dono, CASAR, [linha, cartao.id, false]), linha).toBe("22023");
    expect(await recusa(dono, CASAR, [certo, pixDireto.id, false])).toBe("22023");
    expect(await recusa(dono, CASAR, [certo, "00000000-0000-4000-8000-00000000dead", false])).toBe("42501");
    expect(await recusa(dono, CASAR, ["00000000-0000-4000-8000-00000000dead", cartao.id, false])).toBe("42501");
    // Nada mudou com as recusas.
    expect([(await estornoDe(cartao.id))?.situacao, (await estornoDe(pixDireto.id))?.situacao]).toEqual(["pendente", "pendente"]);
    expect(await valor(dono, "select public.extrato_resumo($1) as v", [e.extrato])).toMatchObject({ pendentes: 5, estornos: 0 });
    expect(await valor(dono, CASAR, [certo, cartao.id, null])).toMatchObject({ confirmou: true, chargeback: false });
  });

  it("a loja: o extrato da loja não alcança o estorno de outra; o da rede alcança, e confirmar pede a loja da venda no turno", async () => {
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    await abrirCaixa(gerenteB);
    const d = await dia();
    const vendaB = await vender(gerenteB, { meio: "pix_direto", valor: 7900, comprovante: "E2E-B" });
    const estornoB = await cancelar(gerenteB, vendaB);
    const donoNaA = await naLoja(ids.dono, ids.lojaA);
    // O extrato da loja A: o estorno da loja B não é sugerido nem aceito.
    const daLojaA = await extrato(donoNaA, ids.lojaA, [{ data: d, valor: -7900 }], ["pix_direto"]);
    expect(await sugestoes(donoNaA, daLojaA.extrato)).toEqual([]);
    expect(await recusa(donoNaA, CASAR, [daLojaA.linhas[0], estornoB.id, false])).toBe("42501");
    // O extrato da rede (o do banco): o estorno aparece, mas confirmar é na loja da venda.
    const daRede = await extrato(donoNaA, null, [{ data: d, valor: -7900, referencia: "DEVOLUCAO-PIX-B" }], ["pix_direto"], "Banco Fictício");
    expect(await sugestoes(donoNaA, daRede.extrato)).toMatchObject([{ estorno_id: estornoB.id, loja: "Loja B", pode_confirmar: true, na_loja_do_turno: false }]);
    expect(await recusa(donoNaA, CASAR, [daRede.linhas[0], estornoB.id, false])).toBe("22023");
    expect((await estornoDe(estornoB.id))?.situacao).toBe("pendente");
    // A gerente da loja B não vê o extrato da rede nem o da loja A.
    expect(await recusa(gerenteB, SUGESTOES, [daRede.extrato])).toBe("42501");
    expect(await recusa(gerenteB, CASAR, [daRede.linhas[0], estornoB.id, false])).toBe("42501");
    expect(await recusa(gerenteB, CASAR, [daLojaA.linhas[0], estornoB.id, false])).toBe("42501");
    // O dono entra na loja B e confirma pelo extrato da rede.
    const donoNaB = await naLoja(ids.dono, ids.lojaB);
    expect(await sugestoes(donoNaB, daRede.extrato)).toMatchObject([{ estorno_id: estornoB.id, na_loja_do_turno: true }]);
    expect(await valor(donoNaB, CASAR, [daRede.linhas[0], estornoB.id, false])).toMatchObject({ confirmou: true });
    expect(await estornoDe(estornoB.id)).toMatchObject({ situacao: "confirmado", comprovante: "DEVOLUCAO-PIX-B", confirmado_por: ids.dono });
    expect(await pagamentoDe(vendaB.pagamento)).toBe("estornado");
  });

  it("quem pode: quem não concilia não vê nem liga; confirmar o estorno pendente continua sendo da gerência; a outra rede não alcança", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    const d = await dia();
    const pendente = await cancelar(dono, await vender(dono, { meio: "cartao_picpay", valor: 7900, comprovante: "NSU-60" }));
    const jaConfirmado = await cancelar(dono, await vender(dono, { meio: "cartao_picpay", valor: 15800, comprovante: "NSU-61" }, 2));
    await valor(dono, CONFIRMAR, [jaConfirmado.id, "EST-61", null]);
    const e = await extrato(dono, ids.lojaA, [{ data: d, valor: -7900 }, { data: d, valor: -15800 }]);
    const [doPendente, doConfirmado] = e.linhas as [string, string];
    // A vendedora da loja não concilia: nem as sugestões, nem ligar.
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await recusa(ana, SUGESTOES, [e.extrato])).toBe("42501");
    expect(await recusa(ana, CASAR, [doPendente, pendente.id, false])).toBe("42501");
    expect(await recusa(ana, DESFAZER, [doPendente, "Tentativa"])).toBe("42501");
    // A outra rede não alcança o extrato nem o estorno.
    const outra = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await recusa(outra, SUGESTOES, [e.extrato])).toBe("42501");
    expect(await recusa(outra, CASAR, [doPendente, pendente.id, false])).toBe("42501");
    // Quem concilia sem ser da gerência (sem venda.cancelar): vê que não pode confirmar, e ligar o pendente é recusado;
    // guardar a prova de um estorno já confirmado, ele pode.
    await db.query("delete from public.papel_permissoes where papel = 'dono' and permissao = 'venda.cancelar'");
    expect((await sugestoes(dono, e.extrato)).map((s) => [s.estorno_id, s.pode_confirmar])).toEqual([[pendente.id, false], [jaConfirmado.id, false]]);
    expect(await recusa(dono, CASAR, [doPendente, pendente.id, false])).toBe("42501");
    expect((await estornoDe(pendente.id))?.situacao).toBe("pendente");
    expect(await linhaDe(doPendente)).toMatchObject({ situacao: "pendente", estorno_id: null });
    expect(await valor(dono, CASAR, [doConfirmado, jaConfirmado.id, false])).toMatchObject({ ligada: true, confirmou: false });
  });

  it("a devolução com reembolso no cartão: o débito confirma o estorno da devolução, e o pagamento da venda continua confirmado", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    const d = await dia();
    const venda = await vender(dono, { meio: "cartao_picpay", valor: 15800, comprovante: "NSU-70" }, 2);
    await valor(dono, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, $4, $5) as v",
      [venda.venda, JSON.stringify([{ item: venda.item, quantidade: 1, condicao: "novo" }]), JSON.stringify([{ meio: "cartao_picpay", valor: 7900 }]), chave("dev"), "Cliente devolveu uma capa"]);
    const estorno = (await db.query<{ id: string }>("select id from public.estornos_externos where venda_id = $1 and devolucao_id is not null", [venda.venda])).rows[0]?.id ?? "";
    const e = await extrato(dono, ids.lojaA, [{ data: d, valor: -7900, referencia: "EST-PARCIAL-70" }]);
    expect(await sugestoes(dono, e.extrato)).toMatchObject([{ estorno_id: estorno, de_devolucao: true, situacao: "pendente", valor_centavos: 7900 }]);
    expect(await valor(dono, CASAR, [e.linhas[0], estorno, false])).toMatchObject({ confirmou: true });
    expect(await estornoDe(estorno)).toMatchObject({ situacao: "confirmado", comprovante: "EST-PARCIAL-70" });
    expect(await pagamentoDe(venda.pagamento)).toBe("confirmado");
  });

  it("o chargeback: o débito chega antes do cancelamento; cancelar a venda cria o estorno, o débito o confirma como contestação, e nada é lançado duas vezes", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    const d = await dia();
    const venda = await vender(dono, { meio: "cartao_picpay", valor: 7900, comprovante: "NSU-80" });
    const e = await extrato(dono, ids.lojaA, [{ data: d, valor: 7900, referencia: "NSU-80" }, { data: d, valor: -7900, referencia: "CBK-80", descricao: "Chargeback" }]);
    const [, debito] = e.linhas as [string, string];
    // A venda ainda está concluída: não há estorno para o débito provar.
    expect(await sugestoes(dono, e.extrato)).toEqual([]);
    // A loja cancela a venda (o cancelamento de sempre): o estorno nasce, e o débito o recebe como sugestão.
    const estorno = await cancelar(dono, venda, "Chargeback: o cliente contestou a compra no banco");
    expect(await sugestoes(dono, e.extrato)).toMatchObject([{ linha_id: debito, estorno_id: estorno.id, situacao: "pendente" }]);
    expect(await valor(dono, CASAR, [debito, estorno.id, true])).toEqual({ ligada: true, repetida: false, confirmou: true, chargeback: true, estorno: estorno.numero, venda: venda.numero });
    expect(await linhaDe(debito)).toMatchObject({ situacao: "estorno", chargeback: true, confirmou_o_estorno: true });
    // A marca fica só na linha (onde pode ser corrigida); a observação do estorno, que é fixa, diz só de onde veio a prova.
    expect((await estornoDe(estorno.id))?.observacao).toBe(`Confirmado pelo débito do extrato nº ${e.numero} (PicPay da loja), linha 2, de ${diaNaTela(d)}`);
    expect((await auditoriaDe(debito, "extrato_linhas.alterado"))[0]?.motivo)
      .toBe(`Débito do extrato ligado ao estorno nº ${estorno.numero} da venda nº ${venda.numero} (o débito confirmou o estorno); chargeback`);
    // Um estorno só para o pagamento, a venda cancelada uma vez, e o extrato com os mesmos dois lançamentos (o débito
    // não virou uma saída à parte): o efeito financeiro não é contado duas vezes.
    expect((await db.query("select situacao, valor_centavos from public.estornos_externos where venda_id = $1", [venda.venda])).rows).toEqual([{ situacao: "confirmado", valor_centavos: 7900 }]);
    expect((await db.query("select situacao from public.vendas where id = $1", [venda.venda])).rows).toEqual([{ situacao: "cancelada" }]);
    expect(await pagamentoDe(venda.pagamento)).toBe("estornado");
    expect(await valor(dono, "select public.extrato_resumo($1) as v", [e.extrato])).toMatchObject({ creditos: 1, debitos: 1, debitos_centavos: 7900, pendentes: 1, estornos: 1 });
    // O aparelho ou o acessório que não voltou segue o caminho de sempre: o retorno fica a conferir na venda.
    expect((await db.query("select situacao from public.venda_retornos where venda_id = $1", [venda.venda])).rows).toEqual([{ situacao: "pendente" }]);
  });

  it("a marca de chargeback do débito já ligado se corrige com o motivo, sem mexer na ligação nem no estorno; só quem concilia no extrato", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    const d = await dia();
    const venda = await vender(dono, { meio: "cartao_picpay", valor: 7900, comprovante: "NSU-85" });
    const estorno = await cancelar(dono, venda);
    const e = await extrato(dono, ids.lojaA, [{ data: d, valor: -7900, referencia: "CBK-85" }, { data: d, valor: -7900 }]);
    const [debito, livre] = e.linhas as [string, string];
    // Só o débito já ligado a um estorno tem a marca.
    expect(await recusa(dono, CHARGEBACK, [livre, true, "Era contestação"])).toBe("22023");
    await valor(dono, CASAR, [debito, estorno.id, false]);
    const confirmado = await estornoDe(estorno.id);
    // Esqueci de marcar: a ligação não se desfaz, mas a marca se corrige, com o motivo.
    expect(await recusa(dono, CHARGEBACK, [debito, true, "x"])).toBe("22023");
    expect(await recusa(dono, CHARGEBACK, [debito, null, "Sem dizer qual"])).toBe("22023");
    expect(await valor(dono, CHARGEBACK, [debito, true, "O banco avisou a contestação"])).toBe(true);
    expect(await linhaDe(debito)).toMatchObject({ situacao: "estorno", estorno_id: estorno.id, confirmou_o_estorno: true, chargeback: true, decidida_por: ids.dono });
    // Repetir não grava de novo; desmarcar também pede o motivo e fica na auditoria.
    expect(await valor(dono, CHARGEBACK, [debito, true, "De novo"])).toBe(false);
    expect(await valor(dono, CHARGEBACK, [debito, false, "Foi estorno pedido pela loja"])).toBe(true);
    expect((await auditoriaDe(debito, "extrato_linhas.alterado")).map((a) => a.motivo).slice(1)).toEqual([
      "Débito do extrato marcado como chargeback: O banco avisou a contestação", "Débito do extrato desmarcado como chargeback: Foi estorno pedido pela loja"]);
    // O estorno não muda com a marca.
    expect(await estornoDe(estorno.id)).toEqual(confirmado);
    expect(await auditoriaDe(estorno.id, "estornos_externos.alterado")).toHaveLength(1);
    // Quem não concilia no extrato não mexe na marca.
    expect(await recusa(await naLoja(ids.vendedorA, ids.lojaA), CHARGEBACK, [debito, true, "Tentativa"])).toBe("42501");
    expect(await recusa(await naLoja(ids.gerenteB, ids.lojaB), CHARGEBACK, [debito, true, "Tentativa"])).toBe("42501");
    expect(await recusa(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), CHARGEBACK, [debito, true, "Tentativa"])).toBe("42501");
    expect((await linhaDe(debito))?.chargeback).toBe(false);
  });

  it("a regra na tabela vale para qualquer caminho: só o débito de um estorno confirmado, do mesmo valor; a que confirmou não se solta; um estorno com um débito só", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono);
    const d = await dia();
    const pendente = await cancelar(dono, await vender(dono, { meio: "cartao_picpay", valor: 7900, comprovante: "NSU-90" }));
    const confirmado = await cancelar(dono, await vender(dono, { meio: "cartao_picpay", valor: 7900, comprovante: "NSU-91" }));
    await valor(dono, CONFIRMAR, [confirmado.id, "EST-91", null]);
    const e = await extrato(dono, ids.lojaA, [{ data: d, valor: -7900 }, { data: d, valor: -7900 }, { data: d, valor: -7800 }, { data: d, valor: 7900 }]);
    const [l1, l2, outroValor, credito] = e.linhas as [string, string, string, string];
    const DIRETO = "update public.extrato_linhas set situacao = 'estorno', estorno_id = $2, confirmou_o_estorno = false, chargeback = false, decidida_por = $3, decidida_em = now() where id = $1";
    // O estorno ainda pendente, o valor diferente e o crédito não entram, nem escrevendo direto na tabela.
    expect(await recusaDireta(DIRETO, [l1, pendente.id, ids.dono])).toBe("22023");
    expect(await recusaDireta(DIRETO, [outroValor, confirmado.id, ids.dono])).toBe("22023");
    expect(await recusaDireta(DIRETO, [credito, confirmado.id, ids.dono])).toBe("22023");
    // A situação e o estorno andam juntos.
    expect(await recusaDireta("update public.extrato_linhas set situacao = 'estorno', decidida_por = $2, decidida_em = now() where id = $1", [l1, ids.dono])).toBe("23514");
    expect(await recusaDireta("update public.extrato_linhas set estorno_id = $2, confirmou_o_estorno = false, chargeback = false where id = $1", [l1, confirmado.id])).toBe("23514");
    // Um estorno com um débito só: a segunda linha no mesmo estorno é recusada pelo índice.
    await valor(dono, CASAR, [l1, confirmado.id, false]);
    expect(await recusaDireta(DIRETO, [l2, confirmado.id, ids.dono])).toBe("23505");
    // A linha que confirmou o estorno não se solta nem deixa de dizer que confirmou, por caminho nenhum.
    await valor(dono, CASAR, [l2, pendente.id, false]);
    expect(await recusaDireta("update public.extrato_linhas set situacao = 'pendente', estorno_id = null, confirmou_o_estorno = null, chargeback = null, decidida_por = null, decidida_em = null where id = $1", [l2])).toBe("OR047");
    expect(await recusaDireta("update public.extrato_linhas set confirmou_o_estorno = false where id = $1", [l2])).toBe("OR047");
    expect(await linhaDe(l2)).toMatchObject({ situacao: "estorno", estorno_id: pendente.id, confirmou_o_estorno: true });
    // O estorno confirmado continua fixo (a regra do lote de integridade): não volta a pendente.
    expect(await recusaDireta("update public.estornos_externos set situacao = 'pendente', confirmado_por = null, confirmado_em = null, comprovante = null where id = $1", [pendente.id])).toBe("42501");
  });
});
