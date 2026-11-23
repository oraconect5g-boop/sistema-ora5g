// Lote AUD-c (23/11/2026; a auditoria do Codex de 21/11, PR #105, achado F21-02; ORA-PAY-009, ORA-FIN-006, ORA-MKTPL-005 e
// ORA-MKTPL-008; migration 20261123121828_linha_do_extrato_um_uso): a linha de crédito do extrato tem um uso só. As duas
// provas do Codex (evidencias/F21-02-conciliacao.test.ts: a mesma linha conciliava uma venda e era o recebimento de um
// repasse, nas duas ordens) viram regressão aqui, com o que a correção promete além delas: o código da recusa, a linha
// fora da conta, desfazer dos dois lados, a repetição sem gravar de novo, as sugestões, o resumo, a auditoria, a regra
// nas tabelas (para qualquer caminho) e a outra rede. A disputa com duas conexões está em
// linha-do-extrato-um-uso-concorrencia.test.ts. Dados FICTÍCIOS; cada teste numa transação desfeita.
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
const impressao = () => `d${String(++arquivos).padStart(63, "0")}`;
const chave = (p: string) => `${p}:um-uso:${String(++chaves).padStart(5, "0")}`;
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
  const s = { usuario, sessao: `4d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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

const PEDIDOS = "select public.marketplace_importar($1, 'vendas.xlsx', $2, $3, $4::jsonb, '{}'::jsonb) as v";
const EXTRATO = "select public.extrato_importar(null, 'banco', 'Banco Fictício', array['pix_direto']::text[], 'extrato.ofx', $1, $2::jsonb, '{\"data\": 0}'::jsonb) as v";
const CASAR = "select public.marketplace_repasse_casar($1, $2::date, $3, $4) as v";
const DESFAZER_REPASSE = "select public.marketplace_repasse_desfazer($1, $2::date, $3) as v";
const PAINEL = "select public.marketplace_repasses_painel($1::date, $2::date) as v";
const CONCILIAR = "select public.extrato_conciliar($1, $2) as v";
const IGNORAR = "select public.extrato_ignorar($1, $2) as v";
const DESFAZER_LINHA = "select public.extrato_desfazer($1, $2) as v";
type Pedido = { id_externo: string; data: string; bruto: number; liquido?: number; data_repasse?: string };
const pedidos = (s: Sessao, lista: Pedido[], canal = "mercado_livre") =>
  valor(s, PEDIDOS, [canal, impressao(), lista.length, JSON.stringify(lista.map((p, i) => ({ ...p, itens: [{ numero: i + 1, quantidade: 1, valor: p.bruto }] })))]);
/** Importa o extrato do banco da rede e devolve o extrato e o id de cada linha, pela ordem. */
async function extrato(s: Sessao, lista: { data: string; valor: number; descricao?: string }[]): Promise<{ extrato: string; linhas: string[] }> {
  const r = await valor<{ extrato: string }>(s, EXTRATO, [impressao(), JSON.stringify(lista.map((l, i) => ({ numero: i + 1, ...l })))]);
  const lidas = (await db.query<{ id: string }>("select id from public.extrato_linhas where extrato_id = $1 order by numero", [r.extrato])).rows.map((l) => l.id);
  return { extrato: r.extrato, linhas: lidas };
}
type Repasse = { canal: string; casado: Record<string, unknown> | null; sugestoes: { linha: string }[] };
const painel = async (s: Sessao, dia: string) => valor<{ repasses: Repasse[] }>(s, PAINEL, [dia, dia]);
const linhaDe = async (id: string) =>
  (await db.query<{ situacao: string; pagamento_id: string | null; decidida_por: string | null; decidida_em: string | null; motivo: string | null }>(
    "select situacao, pagamento_id, decidida_por, decidida_em::text, motivo from public.extrato_linhas where id = $1", [id])).rows[0];
const conciliado = async (pagamento: string) =>
  (await db.query<{ ok: boolean }>("select conciliado_em is not null as ok from public.venda_pagamentos where id = $1", [pagamento])).rows[0]?.ok;
const repasses = async () => Number((await db.query<{ n: string }>("select count(*) as n from public.marketplace_repasses")).rows[0]?.n);

/**
 * O cenário das provas do Codex: uma venda de R$ 79,00 em Pix direto, um pedido de marketplace independente, também de
 * R$ 79,00, com o repasse para hoje, e UMA linha de crédito de R$ 79,00 no extrato do banco da rede.
 */
async function preparar(canal = "mercado_livre") {
  const dono = await naLoja(ids.dono, ids.lojaA);
  const d = (await db.query<{ d: string }>("select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d")).rows[0]?.d ?? "";
  await valor(dono, "select public.abrir_caixa(0, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(dono, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(dono, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(dono, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v",
    [venda, JSON.stringify([{ meio: "pix_direto", valor: 7900, comprovante: "PIX-AUDITORIA" }]), chave("fim")]);
  const pag = (await db.query<{ id: string }>("select id from public.venda_pagamentos where venda_id = $1", [venda])).rows[0]?.id ?? "";
  await pedidos(dono, [{ id_externo: "OUTRA-VENDA-ML", data: d, bruto: 7900, liquido: 7900, data_repasse: d }], canal);
  const e = await extrato(dono, [{ data: d, valor: 7900 }]);
  return { dono, d, pag, linha: e.linhas[0] ?? "", extrato: e.extrato, canal };
}

describe("as duas provas do Codex (F21-02): o mesmo crédito não serve a duas obrigações", () => {
  it("F21-02a: uma linha já conciliada com venda não pode quitar outro repasse", async () => {
    const { dono, d, pag, linha } = await preparar();
    await valor(dono, CONCILIAR, [linha, pag]);
    expect(await recusa(dono, CASAR, ["mercado_livre", d, linha, null])).toBe("OR046");
    expect(await linhaDe(linha)).toMatchObject({ situacao: "conciliada", pagamento_id: pag });
    expect(await repasses()).toBe(0);
  });

  it("F21-02b: uma linha usada por repasse não pode conciliar outra venda", async () => {
    const { dono, d, pag, linha } = await preparar();
    await valor(dono, CASAR, ["mercado_livre", d, linha, null]);
    expect(await recusa(dono, CONCILIAR, [linha, pag])).toBe("OR046");
    expect(await linhaDe(linha)).toMatchObject({ situacao: "repasse", pagamento_id: null, decidida_por: ids.dono });
    expect(await conciliado(pag)).toBe(false);
  });
});

describe("a linha do extrato tem um uso só (AUD-c)", () => {
  it("fora da conta e repasse também não se misturam, nas duas ordens", async () => {
    const { dono, d, linha } = await preparar();
    await valor(dono, IGNORAR, [linha, "Entrada que não é de venda"]);
    expect(await recusa(dono, CASAR, ["mercado_livre", d, linha, null])).toBe("OR046");
    expect(await valor(dono, DESFAZER_LINHA, [linha, "Era o repasse do canal"])).toBe(true);
    await valor(dono, CASAR, ["mercado_livre", d, linha, null]);
    expect(await recusa(dono, IGNORAR, [linha, "Tirar da conta depois de casar"])).toBe("OR046");
    expect(await linhaDe(linha)).toMatchObject({ situacao: "repasse", motivo: null });
  });

  it("desfazer solta a linha dos dois lados: o repasse desfeito deixa conciliar a venda, e a conciliação desfeita deixa casar o repasse", async () => {
    const { dono, d, pag, linha } = await preparar();
    await valor(dono, CASAR, ["mercado_livre", d, linha, null]);
    // A linha de um repasse só se solta pela tela dos repasses: desfazer pelo extrato é recusado, e nada muda.
    expect(await recusa(dono, DESFAZER_LINHA, [linha, "Pelo extrato"])).toBe("OR046");
    expect(await repasses()).toBe(1);
    expect(await valor(dono, DESFAZER_REPASSE, ["mercado_livre", d, "Casado com a linha errada"])).toBe(true);
    expect(await linhaDe(linha)).toMatchObject({ situacao: "pendente", decidida_por: null, decidida_em: null });
    expect(await valor(dono, CONCILIAR, [linha, pag])).toEqual({ conciliada: true, repetida: false });
    expect(await conciliado(pag)).toBe(true);
    expect(await valor(dono, DESFAZER_LINHA, [linha, "A linha é do repasse"])).toBe(true);
    expect(await conciliado(pag)).toBe(false);
    expect(await valor(dono, CASAR, ["mercado_livre", d, linha, null])).toMatchObject({ diferenca: 0, repetida: false });
    expect(await linhaDe(linha)).toMatchObject({ situacao: "repasse" });
  });

  it("o mesmo pedido de novo não grava de novo: casar e conciliar devolvem o que já estava, com repetida", async () => {
    const { dono, d, pag, linha } = await preparar();
    const primeira = await valor<Record<string, unknown>>(dono, CASAR, ["mercado_livre", d, linha, null]);
    expect(primeira).toEqual({ pedidos: 1, esperado: 7900, recebido: 7900, diferenca: 0, estimados: 0, repetida: false });
    expect(await valor(dono, CASAR, ["mercado_livre", d, linha, "O toque repetido"])).toEqual({ ...primeira, repetida: true });
    expect(await repasses()).toBe(1);
    const auditoria = await db.query<{ acao: string }>("select acao from public.auditoria where acao like 'marketplace_repasses.%'");
    expect(auditoria.rows.map((r) => r.acao)).toEqual(["marketplace_repasses.criado"]);
    await valor(dono, DESFAZER_REPASSE, ["mercado_livre", d, "Para conciliar a venda"]);
    expect(await valor(dono, CONCILIAR, [linha, pag])).toEqual({ conciliada: true, repetida: false });
    expect(await valor(dono, CONCILIAR, [linha, pag])).toEqual({ conciliada: true, repetida: true });
  });

  it("as sugestões só oferecem a linha livre: nem o painel dos repasses nem o extrato sugerem a linha que já tem uso", async () => {
    const { dono, d, pag, linha, extrato: doBanco } = await preparar();
    const sugeridasAoRepasse = async () => (await painel(dono, d)).repasses[0]?.sugestoes.map((s) => s.linha);
    const sugeridasAVenda = async () => (await linhas<{ linha_id: string }>(dono, "select linha_id from public.extrato_sugestoes($1)", [doBanco])).map((s) => s.linha_id);
    expect(await sugeridasAoRepasse()).toEqual([linha]);
    expect(await sugeridasAVenda()).toEqual([linha]);
    // Conciliada com a venda: o repasse deixa de ver a linha (antes da correção, ela continuava sugerida).
    await valor(dono, CONCILIAR, [linha, pag]);
    expect(await sugeridasAoRepasse()).toEqual([]);
    await valor(dono, DESFAZER_LINHA, [linha, "Voltar para testar o outro lado"]);
    // Fora da conta: também não é sugerida ao repasse.
    await valor(dono, IGNORAR, [linha, "Entrada que não é de venda"]);
    expect(await sugeridasAoRepasse()).toEqual([]);
    await valor(dono, DESFAZER_LINHA, [linha, "Voltar para a conta"]);
    // Casada com o repasse: o extrato deixa de sugerir a venda para ela.
    await valor(dono, CASAR, ["mercado_livre", d, linha, null]);
    expect(await sugeridasAVenda()).toEqual([]);
    expect(await valor(dono, "select public.extrato_conciliar_certas($1) as v", [doBanco])).toEqual({ conciliadas: 0 });
    expect(await conciliado(pag)).toBe(false);
  });

  it("o resumo e a lista contam a linha de repasse à parte, e o total fecha; a auditoria guarda quem casou e o motivo", async () => {
    const { dono, d, linha, extrato: doBanco } = await preparar();
    await valor(dono, CASAR, ["mercado_livre", d, linha, null]);
    expect(await valor(dono, "select public.extrato_resumo($1) as v", [doBanco])).toMatchObject({ creditos: 1, pendentes: 0, conciliadas: 0, ignoradas: 0, repasses: 1 });
    expect(await linhas(dono, "select linhas, pendentes, conciliadas, ignoradas, repasses from public.extratos_recentes(50) where id = $1", [doBanco]))
      .toEqual([{ linhas: 1, pendentes: 0, conciliadas: 0, ignoradas: 0, repasses: 1 }]);
    const auditoria = await db.query<{ acao: string; motivo: string | null; usuario_id: string | null }>(
      "select acao, motivo, usuario_id from public.auditoria where alvo_id = $1 and acao = 'extrato_linhas.alterado' order by id", [linha]);
    expect(auditoria.rows).toEqual([{ acao: "extrato_linhas.alterado", motivo: "Repasse casado com o extrato do banco", usuario_id: ids.dono }]);
  });

  it("a regra está nas tabelas: nenhuma escrita direta deixa a linha com dois usos, nem o repasse trocar de linha", async () => {
    const { dono, d, pag, linha } = await preparar();
    await pedidos(dono, [{ id_externo: "SH-UM-USO", data: d, bruto: 7900, liquido: 7900, data_repasse: d }], "shopee");
    const outra = (await extrato(dono, [{ data: d, valor: 7900, descricao: "Outra entrada" }])).linhas[0] ?? "";
    await valor(dono, CASAR, ["mercado_livre", d, linha, null]);
    // A linha de um repasse não sai de "repasse" por fora, e uma linha livre não entra em "repasse" sem repasse.
    expect(await recusaDireta("update public.extrato_linhas set situacao = 'pendente', decidida_por = null, decidida_em = null where id = $1", [linha])).toBe("OR046");
    expect(await recusaDireta("update public.extrato_linhas set situacao = 'repasse', decidida_por = $2, decidida_em = now() where id = $1", [outra, ids.dono])).toBe("OR046");
    // O repasse casado não troca de linha.
    expect(await recusaDireta("update public.marketplace_repasses set linha_id = $1 where linha_id = $2", [outra, linha])).toBe("OR045");
    // Um repasse gravado por fora das funções também não ocupa a linha conciliada com uma venda.
    await valor(dono, CONCILIAR, [outra, pag]);
    expect(await recusaDireta(
      "insert into public.marketplace_repasses (organizacao_id, canal, data_repasse, linha_id, pedidos, esperado_centavos, recebido_centavos, casado_por) values ($1, 'shopee', $2::date, $3, 1, 7900, 7900, $4)",
      [ids.organizacao, d, outra, ids.dono])).toBe("OR046");
    expect(await linhaDe(outra)).toMatchObject({ situacao: "conciliada", pagamento_id: pag });
    expect(await repasses()).toBe(1);
  });

  it("a outra rede e quem não concilia pela rede não usam a linha, por nenhum dos caminhos", async () => {
    const { dono, d, pag, linha } = await preparar();
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await linhas(outraRede, "select id from public.extrato_linhas where id = $1", [linha])).toEqual([]);
    expect(await recusa(outraRede, CASAR, ["mercado_livre", d, linha, null])).toBe("P0002");
    expect(await recusa(outraRede, CONCILIAR, [linha, pag])).toBe("42501");
    expect(await recusa(outraRede, IGNORAR, [linha, "De outra rede"])).toBe("42501");
    expect(await recusa(outraRede, DESFAZER_LINHA, [linha, "De outra rede"])).toBe("42501");
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await recusa(gerente, CASAR, ["mercado_livre", d, linha, null])).toBe("42501");
    expect(await recusa(gerente, CONCILIAR, [linha, pag])).toBe("42501");
    expect(await linhaDe(linha)).toMatchObject({ situacao: "pendente" });
    // Com a linha casada pelo dono, a outra rede também não desfaz o repasse dele (o dela, do mesmo canal e dia, não existe).
    await valor(dono, CASAR, ["mercado_livre", d, linha, null]);
    expect(await valor(outraRede, DESFAZER_REPASSE, ["mercado_livre", d, "De outra rede"])).toBe(false);
    expect(await linhaDe(linha)).toMatchObject({ situacao: "repasse" });
  });
});
