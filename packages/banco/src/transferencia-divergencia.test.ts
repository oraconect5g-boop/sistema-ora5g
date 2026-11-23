// Lote TRF-d (ORA-INV-007; o achado F21-04 da auditoria integral do Codex de 21/11/2026, PR #105): resolver a divergência
// do recebimento da transferência. O que faltou tem três destinos, e só eles: chegou depois (o destino confere e dá a
// entrada), voltou à origem (a origem confere e dá a entrada de volta) ou baixa (quem ajusta estoque na origem dá baixa em
// tudo o que ainda falta; no livro ficam a volta e a perda). Banco em memória com todas as migrations; dados FICTÍCIOS;
// cada teste numa transação desfeita.
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
  const s = { usuario, sessao: `4f000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

const solicitar = (s: Sessao, origem: string, destino: string, variante: string, quantidade: number) =>
  valor<string>(s, "select public.transferencia_solicitar($1, $2, $3, $4, $5, $6) as v", [origem, destino, variante, quantidade, "Reposição da loja", chave("t")]);
const separar = (s: Sessao, t: string, lista: string[] = []) => valor<string>(s, "select public.transferencia_separar($1, $2::uuid[]) as v", [t, lista]);
const enviar = (s: Sessao, t: string) => valor<string>(s, "select public.transferencia_enviar($1) as v", [t]);
const receber = (s: Sessao, t: string, lidos: string[], quantidade: number | null, observacao: string | null = null) =>
  valor<string>(s, "select public.transferencia_receber($1, $2::text[], $3, $4) as v", [t, lidos, quantidade, observacao]);
const RESOLVER = "select public.transferencia_resolver_divergencia($1, $2, $3::text[], $4, $5, $6) as v";
type Resultado = { situacao: string; faltaram: number; resolvidos: number; pendentes: number; repetida: boolean };
const resolver = (s: Sessao, t: string, decisao: string, lidos: string[] | null, quantidade: number | null, motivo: string, k = chave("r")) =>
  valor<Resultado>(s, RESOLVER, [t, decisao, lidos, quantidade, motivo, k]);
const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ quantidade: number; reservado: number }>("select quantidade, reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0]
  ?? { quantidade: 0, reservado: 0 };
const posicao = async (item: string) =>
  (await db.query<{ unidade_id: string; situacao: string; em_estoque: boolean }>("select unidade_id, situacao, em_estoque from public.itens_serializados where id = $1", [item])).rows[0];
const imeiDe = async (item: string) => (await db.query<{ imei: string }>("select imei from public.itens_serializados where id = $1", [item])).rows[0]?.imei ?? "";
const divergencias = async () => (await db.query("select regra from privado.divergencias_estoque()")).rows;
const resolvidaEm = async (t: string) =>
  (await db.query<{ ok: boolean }>("select divergencia_resolvida_em is not null as ok from public.transferencias where id = $1", [t])).rows[0]?.ok;
const livro = async (t: string) =>
  (await db.query<{ unidade_id: string; tipo: string; quantidade: number }>(
    "select unidade_id, tipo, quantidade from public.estoque_movimentos where referencia_tipo = 'transferencia' and referencia_id = $1 and chave_idempotencia like '%:resolucao:%' order by id", [t])).rows;

/** Uma transferência de 5 capas da loja A para a B, recebida com 2 (faltaram 3). */
async function capasComFalta() {
  const destino = await naLoja(ids.gerenteB, ids.lojaB);
  const origem = await naLoja(ids.dono, ids.lojaA);
  const t = await solicitar(destino, ids.lojaA, ids.lojaB, cat.capa, 5);
  await separar(origem, t);
  await enviar(origem, t);
  expect(await receber(destino, t, [], 2, "A caixa chegou com três capas a menos")).toBe("recebida_com_divergencia");
  return { t, origem, destino };
}
/** Uma transferência de 2 aparelhos da loja A para a B, recebida sem nenhum (faltaram os 2). */
async function aparelhosComFalta() {
  const destino = await naLoja(ids.gerenteB, ids.lojaB);
  const origem = await naLoja(ids.dono, ids.lojaA);
  const t = await solicitar(destino, ids.lojaA, ids.lojaB, cat.aparelho, 2);
  await separar(origem, t, [itens.a1, itens.a2]);
  await enviar(origem, t);
  expect(await receber(destino, t, [], null, "A caixa chegou sem os aparelhos")).toBe("recebida_com_divergencia");
  return { t, origem, destino };
}

describe("o que faltou no acessório tem destino (TRF-d)", () => {
  it("voltou à origem: a origem conta e dá a entrada de volta; o saldo dela volta e a transferência fica resolvida", async () => {
    const antesA = await saldo(ids.lojaA, cat.capa);
    const antesB = await saldo(ids.lojaB, cat.capa);
    const { t, origem } = await capasComFalta();
    expect((await saldo(ids.lojaA, cat.capa)).quantidade).toBe(antesA.quantidade - 5);
    expect(await resolvidaEm(t)).toBe(false);
    expect(await resolver(origem, t, "voltou_a_origem", null, 3, "As três capas ficaram na prateleira da origem"))
      .toEqual({ situacao: "recebida_com_divergencia", faltaram: 3, resolvidos: 3, pendentes: 0, repetida: false });
    expect((await saldo(ids.lojaA, cat.capa)).quantidade).toBe(antesA.quantidade - 2);
    expect((await saldo(ids.lojaB, cat.capa)).quantidade).toBe(antesB.quantidade + 2);
    expect(await livro(t)).toEqual([{ unidade_id: ids.lojaA, tipo: "transferencia_entrada", quantidade: 3 }]);
    expect(await resolvidaEm(t)).toBe(true);
    expect(await divergencias()).toEqual([]);
  });

  it("em partes: uma chegou depois no destino, uma voltou à origem e a que sobrou teve baixa; a soma nunca passa do que faltou", async () => {
    const antesA = await saldo(ids.lojaA, cat.capa);
    const antesB = await saldo(ids.lojaB, cat.capa);
    const { t, origem, destino } = await capasComFalta();
    expect(await resolver(destino, t, "chegou_depois", null, 1, "Achamos uma capa no fundo da caixa"))
      .toMatchObject({ faltaram: 3, resolvidos: 1, pendentes: 2 });
    expect(await resolvidaEm(t)).toBe(false);
    expect(await resolver(origem, t, "voltou_a_origem", null, 1, "Uma capa ficou na origem, não foi embalada"))
      .toMatchObject({ resolvidos: 2, pendentes: 1 });
    // Mais do que ainda falta é recusado, e zero também.
    expect(await errou(origem, RESOLVER, [t, "voltou_a_origem", null, 2, "Duas capas ficaram na origem", chave("r")])).toBe("22023");
    expect(await errou(destino, RESOLVER, [t, "chegou_depois", null, 0, "Nenhuma capa chegou depois", chave("r")])).toBe("22023");
    expect(await resolver(origem, t, "baixada", null, null, "A terceira capa não apareceu em nenhuma das lojas"))
      .toMatchObject({ resolvidos: 3, pendentes: 0 });
    expect((await saldo(ids.lojaA, cat.capa)).quantidade).toBe(antesA.quantidade - 4);
    expect((await saldo(ids.lojaB, cat.capa)).quantidade).toBe(antesB.quantidade + 3);
    expect(await livro(t)).toEqual([
      { unidade_id: ids.lojaB, tipo: "transferencia_entrada", quantidade: 1 },
      { unidade_id: ids.lojaA, tipo: "transferencia_entrada", quantidade: 1 },
      { unidade_id: ids.lojaA, tipo: "transferencia_entrada", quantidade: 1 },
      { unidade_id: ids.lojaA, tipo: "perda", quantidade: -1 },
    ]);
    expect(await resolvidaEm(t)).toBe(true);
    // Resolvida: nada mais entra.
    expect(await errou(destino, RESOLVER, [t, "chegou_depois", null, 1, "Achamos mais uma capa na loja", chave("r")])).toBe("OR004");
    expect(await divergencias()).toEqual([]);
  });

  it("o mesmo pedido de novo não lança de novo; a mesma chave com outros dados é recusada", async () => {
    const antesA = await saldo(ids.lojaA, cat.capa);
    const { t, origem } = await capasComFalta();
    const k = chave("r");
    expect(await resolver(origem, t, "voltou_a_origem", null, 2, "Duas capas ficaram na origem", k)).toMatchObject({ resolvidos: 2, repetida: false });
    expect(await resolver(origem, t, "voltou_a_origem", null, 2, "Duas capas ficaram na origem", k)).toMatchObject({ resolvidos: 2, pendentes: 1, repetida: true });
    expect(await errou(origem, RESOLVER, [t, "voltou_a_origem", null, 1, "Duas capas ficaram na origem", k])).toBe("OR004");
    expect((await saldo(ids.lojaA, cat.capa)).quantidade).toBe(antesA.quantidade - 3);
    expect(await livro(t)).toHaveLength(1);
  });

  it("cada lado faz a sua parte: o destino não diz que voltou, a origem não diz que chegou, e a baixa é de quem ajusta estoque", async () => {
    const { t, origem, destino } = await capasComFalta();
    expect(await errou(destino, RESOLVER, [t, "voltou_a_origem", null, 1, "Voltou para a loja de origem", chave("r")])).toBe("42501");
    expect(await errou(origem, RESOLVER, [t, "chegou_depois", null, 1, "Chegou depois na loja de destino", chave("r")])).toBe("42501");
    // O gerente da loja B não ajusta estoque na origem; nem o vendedor da origem.
    expect(await errou(destino, RESOLVER, [t, "baixada", null, null, "As capas não apareceram mais", chave("r")])).toBe("42501");
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await errou(vendedor, RESOLVER, [t, "baixada", null, null, "As capas não apareceram mais", chave("r")])).toBe("42501");
    expect(await errou(vendedor, RESOLVER, [t, "voltou_a_origem", null, 1, "Voltou para a loja de origem", chave("r")])).toBe("42501");
    // Quem não está em nenhuma das duas lojas não acha a transferência; outra rede também não.
    const terceira = await naLoja(ids.dono, ids.lojaC);
    expect(await errou(terceira, RESOLVER, [t, "baixada", null, null, "As capas não apareceram mais", chave("r")])).toBe("P0002");
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await errou(outraRede, RESOLVER, [t, "baixada", null, null, "As capas não apareceram mais", chave("r")])).toBe("P0002");
    // Dados: decisão desconhecida, motivo curto, sem chave.
    expect(await errou(origem, RESOLVER, [t, "sumiu", null, 1, "As capas não apareceram mais", chave("r")])).toBe("22023");
    expect(await errou(origem, RESOLVER, [t, "voltou_a_origem", null, 1, "curto", chave("r")])).toBe("22023");
    expect(await errou(origem, RESOLVER, [t, "voltou_a_origem", null, 1, "Voltou para a loja de origem", " "])).toBe("22023");
    expect(await livro(t)).toEqual([]);
  });

  it("só a transferência recebida com divergência tem o que resolver", async () => {
    const destino = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const t = await solicitar(destino, ids.lojaA, ids.lojaB, cat.capa, 2);
    await separar(origem, t);
    await enviar(origem, t);
    expect(await errou(origem, RESOLVER, [t, "voltou_a_origem", null, 1, "Voltou antes de chegar ao destino", chave("r")])).toBe("22023");
    expect(await receber(destino, t, [], 2)).toBe("recebida");
    expect(await errou(origem, RESOLVER, [t, "voltou_a_origem", null, 1, "Voltou antes de chegar ao destino", chave("r")])).toBe("22023");
  });
});

describe("o que faltou no aparelho tem destino, pelo IMEI (TRF-d)", () => {
  it("um voltou à origem e o outro chegou depois: cada um entra na loja certa, disponível, e a transferência fica resolvida", async () => {
    const { t, origem, destino } = await aparelhosComFalta();
    expect(await posicao(itens.a1)).toMatchObject({ situacao: "em_transito", em_estoque: false });
    // O IMEI que não é desta transferência, ou nenhum IMEI, é recusado.
    expect(await errou(origem, RESOLVER, [t, "voltou_a_origem", [await imeiDe(itens.b1)], null, "O aparelho ficou na origem", chave("r")])).toBe("22023");
    expect(await errou(origem, RESOLVER, [t, "voltou_a_origem", [], null, "O aparelho ficou na origem", chave("r")])).toBe("22023");
    expect(await resolver(origem, t, "voltou_a_origem", [await imeiDe(itens.a1)], null, "O aparelho ficou na origem, fora da caixa"))
      .toMatchObject({ faltaram: 2, resolvidos: 1, pendentes: 1 });
    expect(await posicao(itens.a1)).toEqual({ unidade_id: ids.lojaA, situacao: "disponivel", em_estoque: true });
    // O mesmo aparelho não é resolvido duas vezes, por nenhum dos lados.
    expect(await errou(destino, RESOLVER, [t, "chegou_depois", [await imeiDe(itens.a1)], null, "O aparelho chegou no dia seguinte", chave("r")])).toBe("22023");
    expect(await resolver(destino, t, "chegou_depois", [await imeiDe(itens.a2)], null, "O aparelho chegou no dia seguinte"))
      .toMatchObject({ resolvidos: 2, pendentes: 0 });
    expect(await posicao(itens.a2)).toEqual({ unidade_id: ids.lojaB, situacao: "disponivel", em_estoque: true });
    expect(await resolvidaEm(t)).toBe(true);
    expect(await divergencias()).toEqual([]);
  });

  it("a baixa vale para todos os que ainda faltam: saem de em trânsito para baixado, com a volta e a perda no livro da origem", async () => {
    const antesA = await saldo(ids.lojaA, cat.aparelho);
    const { t, origem } = await aparelhosComFalta();
    expect(await errou(origem, RESOLVER, [t, "baixada", [await imeiDe(itens.a1)], null, "Os aparelhos não apareceram mais", chave("r")])).toBe("22023");
    expect(await resolver(origem, t, "baixada", null, null, "Os aparelhos não apareceram em nenhuma das lojas"))
      .toMatchObject({ faltaram: 2, resolvidos: 2, pendentes: 0, repetida: false });
    for (const item of [itens.a1, itens.a2]) expect(await posicao(item)).toEqual({ unidade_id: ids.lojaA, situacao: "baixado", em_estoque: false });
    expect((await saldo(ids.lojaA, cat.aparelho)).quantidade).toBe(antesA.quantidade - 2);
    expect((await livro(t)).map((m) => `${m.tipo} ${m.quantidade}`)).toEqual(
      ["transferencia_entrada 1", "perda -1", "transferencia_entrada 1", "perda -1"]);
    expect(await resolvidaEm(t)).toBe(true);
    expect(await divergencias()).toEqual([]);
  });

  it("a auditoria guarda cada resolução, e ninguém muda nem apaga uma resolução gravada", async () => {
    const { t, origem } = await aparelhosComFalta();
    await resolver(origem, t, "voltou_a_origem", [await imeiDe(itens.a1)], null, "O aparelho ficou na origem, fora da caixa");
    const resolucoes = (await db.query<{ decisao: string; quantidade: number; item_serializado_id: string; motivo: string; criado_por: string }>(
      "select decisao, quantidade, item_serializado_id, motivo, criado_por from public.transferencia_resolucoes where transferencia_id = $1", [t])).rows;
    expect(resolucoes).toEqual([{ decisao: "voltou_a_origem", quantidade: 1, item_serializado_id: itens.a1,
      motivo: "O aparelho ficou na origem, fora da caixa", criado_por: ids.dono }]);
    expect(await erroDe(() => db.query("update public.transferencia_resolucoes set quantidade = 1 where transferencia_id = $1", [t]))).toBe("42501");
    expect(await erroDe(() => db.query("delete from public.transferencia_resolucoes where transferencia_id = $1", [t]))).toBe("42501");
    // Quem lê a transferência lê a resolução; o vendedor de outra loja, não; ninguém grava direto.
    expect(await valor<number>(origem, "select count(*)::int as v from public.transferencia_resolucoes where transferencia_id = $1", [t])).toBe(1);
    const deFora = await naLoja(ids.dono, ids.lojaC);
    expect(await errou(deFora, "insert into public.transferencia_resolucoes (organizacao_id, transferencia_id, decisao, quantidade, motivo, chave, conteudo, criado_por) values ($1, $2, 'baixada', 1, 'Tentativa de gravar direto', 'x', 'x', $3)",
      [ids.organizacao, t, ids.dono])).toBe("42501");
  });
});
