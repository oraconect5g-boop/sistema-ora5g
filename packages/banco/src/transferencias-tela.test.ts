// Lote VEL-g (19/11/2026; ORA-QUAL-010 e ORA-INV-007; migration da tela de Transferências numa ida): a leitura única
// devolve exatamente o que as leituras de antes devolviam, para a mesma pessoa e com o mesmo RLS: a lista da loja do
// turno, os produtos (com o tipo), as lojas, os aparelhos separados, as remessas, os saldos e os aparelhos livres para os
// pedidos que a loja tem a separar. Dados FICTÍCIOS; cada teste numa transação desfeita.
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
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const linhas = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows, { criarSessao: false });
const solicitar = (s: Sessao, origem: string, destino: string, variante: string, quantidade: number) =>
  valor<string>(s, "select public.transferencia_solicitar($1, $2, $3, $4, 'Reposição da loja', $5) as v", [origem, destino, variante, quantidade, `vel-g:${++chaves}`]);

type Tela = {
  transferencias: Record<string, unknown>[]; variantes: { id: string; nome: string; sku: string; tipo: string | null }[];
  unidades: { id: string; nome: string; tipo: string }[]; itens: { transferencia_id: string; item_serializado_id: string; recebido: boolean | null }[];
  remessas: { id: string; numero: number; origem_id: string }[]; saldos: { unidade_id: string; variante_id: string; quantidade: number; reservado: number }[];
  disponiveis: { id: string; variante_id: string; imei: string | null; iccid: string | null }[];
  /** TRF-d: o destino de cada unidade que faltou no recebimento. */
  resolucoes: { transferencia_id: string; decisao: string; quantidade: number; item_serializado_id: string | null; motivo: string; criado_em: string }[];
};
const TELA = "select public.transferencias_tela($1) as v";
const porId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));

/** O que a tela lia antes, uma leitura por vez, com a mesma sessão (as consultas do PostgREST, em SQL). */
async function leiturasDeAntes(s: Sessao, unidade: string, limite = 50) {
  const lista = await linhas<Record<string, unknown> & { id: string; origem_id: string; destino_id: string; variante_id: string; remessa_id: string | null; situacao: string;
    divergencia_resolvida_em: string | null }>(s,
    `select id, numero, origem_id, destino_id, variante_id, quantidade, motivo, situacao, solicitado_por, quantidade_recebida, observacao, solicitado_em, remessa_id,
       divergencia_resolvida_em
     from public.transferencias where origem_id = $1 or destino_id = $1 order by numero desc limit $2`, [unidade, limite]);
  const varianteIds = [...new Set(lista.map((t) => t.variante_id))];
  const unidadeIds = [...new Set(lista.flatMap((t) => [t.origem_id, t.destino_id]))];
  const remessaIds = [...new Set(lista.flatMap((t) => (t.remessa_id ? [t.remessa_id] : [])))];
  const variantes = await linhas<Tela["variantes"][number]>(s,
    "select v.id, v.nome, v.sku, p.tipo from public.variantes v left join public.produtos p on p.id = v.produto_id where v.id = any($1::uuid[])", [varianteIds]);
  const unidades = await linhas<Tela["unidades"][number]>(s, "select id, nome, tipo from public.unidades where id = any($1::uuid[])", [unidadeIds]);
  const itensLidos = await linhas<Tela["itens"][number]>(s,
    "select transferencia_id, item_serializado_id, recebido from public.transferencia_itens where transferencia_id = any($1::uuid[]) order by transferencia_id, item_serializado_id", [lista.map((t) => t.id)]);
  const remessas = await linhas<Tela["remessas"][number]>(s, "select id, numero, origem_id from public.transferencia_remessas where id = any($1::uuid[]) order by numero", [remessaIds]);
  const saldos = await linhas<Tela["saldos"][number]>(s,
    "select unidade_id, variante_id, quantidade, reservado from public.estoque_saldos where unidade_id = any($1::uuid[]) and variante_id = any($2::uuid[]) order by unidade_id, variante_id",
    [unidadeIds, varianteIds]);
  const serializado = (id: string) => ["aparelho", "chip"].includes(variantes.find((v) => v.id === id)?.tipo ?? "");
  const aSeparar = [...new Set(lista.filter((t) => t.situacao === "solicitada" && t.origem_id === unidade && serializado(t.variante_id)).map((t) => t.variante_id))];
  const disponiveis = await linhas<Tela["disponiveis"][number]>(s,
    `select id, variante_id, imei, iccid from public.itens_serializados where unidade_id = $1 and em_estoque and situacao = 'disponivel' and variante_id = any($2::uuid[])
     order by variante_id, id limit 100`, [unidade, aSeparar]);
  const resolucoes = await linhas<Omit<Tela["resolucoes"][number], "criado_em">>(s,
    "select transferencia_id, decisao, quantidade, item_serializado_id, motivo from public.transferencia_resolucoes where transferencia_id = any($1::uuid[]) order by criado_em, id",
    [lista.map((t) => t.id)]);
  return { lista, variantes, unidades, itens: itensLidos, remessas, saldos, disponiveis, resolucoes };
}

/** A resposta da função, com as datas e os números como a API os entrega, comparada às leituras de antes. */
async function confereIgual(s: Sessao, unidade: string, limite = 50) {
  const tela = await valor<Tela>(s, TELA, [limite]);
  const antes = await leiturasDeAntes(s, unidade, limite);
  expect(tela.transferencias.map((t) => t.id)).toEqual(antes.lista.map((t) => t.id));
  expect(tela.transferencias).toEqual(antes.lista.map((t) => ({ ...t, numero: Number(t.numero), solicitado_em: new Date(t.solicitado_em as string).toISOString() }))
    .map((t) => ({ ...t, solicitado_em: expect.any(String), divergencia_resolvida_em: t.divergencia_resolvida_em === null ? null : expect.any(String) })));
  for (const [i, t] of tela.transferencias.entries()) {
    expect(new Date(t.solicitado_em as string).getTime()).toBe(new Date(antes.lista[i]?.solicitado_em as string).getTime());
  }
  expect(porId(tela.variantes)).toEqual(porId(antes.variantes));
  expect(porId(tela.unidades)).toEqual(porId(antes.unidades));
  expect(tela.itens).toEqual(antes.itens);
  expect(tela.remessas.map((r) => ({ ...r, numero: Number(r.numero) }))).toEqual(antes.remessas.map((r) => ({ ...r, numero: Number(r.numero) })));
  expect(tela.saldos).toEqual(antes.saldos);
  expect(tela.disponiveis).toEqual(antes.disponiveis);
  expect(tela.resolucoes).toEqual(antes.resolucoes.map((r) => ({ ...r, criado_em: expect.any(String) })));
  return tela;
}

describe("a tela de Transferências numa ida (VEL-g)", () => {
  it("devolve o mesmo que as leituras de antes, para a origem e para o destino, com acessório e aparelho, pedido, separado, enviado e recebido", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    // Um pedido de capas e um de aparelho, da loja B para a A, ainda na origem; outro de capa, enviado e recebido.
    await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 2);
    await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.aparelho, 1);
    const recebida = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    await valor(origem, "select public.transferencia_separar($1, '{}'::uuid[]) as v", [recebida]);
    await valor(origem, "select public.transferencia_enviar($1) as v", [recebida]);
    await valor(pedinte, "select public.transferencia_receber($1, '{}'::text[], 1, null) as v", [recebida]);

    const naOrigem = await confereIgual(origem, ids.lojaA);
    expect(naOrigem.transferencias).toHaveLength(3);
    expect(naOrigem.variantes.find((v) => v.id === cat.aparelho)?.tipo).toBe("aparelho");
    // A loja A tem o aparelho a separar: os IMEIs livres dela vêm junto.
    expect(naOrigem.disponiveis.map((d) => d.id).sort()).toEqual([itens.a1, itens.a2].sort());
    expect(naOrigem.saldos.some((s) => s.unidade_id === ids.lojaA && s.variante_id === cat.capa)).toBe(true);

    const noDestino = await confereIgual(pedinte, ids.lojaB);
    expect(noDestino.transferencias).toHaveLength(3);
    // O destino não separa: nenhum aparelho livre vem para ele.
    expect(noDestino.disponiveis).toEqual([]);
  });

  it("o aparelho separado aparece nos itens da transferência; os livres que sobram continuam para os outros pedidos", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const t1 = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.aparelho, 1);
    await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.aparelho, 1);
    await valor(origem, "select public.transferencia_separar($1, $2::uuid[]) as v", [t1, [itens.a1]]);
    const tela = await confereIgual(origem, ids.lojaA);
    expect(tela.itens).toEqual([{ transferencia_id: t1, item_serializado_id: itens.a1, recebido: null }]);
    expect(tela.disponiveis.map((d) => d.id)).toEqual([itens.a2]);
  });

  // TRF-d (o achado F21-04 da auditoria do Codex de 21/11): o que faltou no recebimento e o destino que cada parte teve.
  it("a transferência recebida com divergência traz cada resolução e, com tudo resolvido, quando ficou resolvida", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 3);
    await valor(origem, "select public.transferencia_separar($1, '{}'::uuid[]) as v", [t]);
    await valor(origem, "select public.transferencia_enviar($1) as v", [t]);
    await valor(pedinte, "select public.transferencia_receber($1, '{}'::text[], 1, 'A caixa chegou com duas capas a menos') as v", [t]);
    expect((await confereIgual(origem, ids.lojaA)).resolucoes).toEqual([]);
    const RESOLVER = "select public.transferencia_resolver_divergencia($1, $2, null, 1, $3, $4) as v";
    await valor(origem, RESOLVER, [t, "voltou_a_origem", "Uma capa ficou na prateleira da origem", "tela:1"]);
    const parcial = await confereIgual(pedinte, ids.lojaB);
    const semAHora = ({ transferencia_id, decisao, quantidade, item_serializado_id, motivo }: Tela["resolucoes"][number]) =>
      ({ transferencia_id, decisao, quantidade, item_serializado_id, motivo });
    expect(parcial.resolucoes.map(semAHora)).toEqual([
      { transferencia_id: t, decisao: "voltou_a_origem", quantidade: 1, item_serializado_id: null, motivo: "Uma capa ficou na prateleira da origem" }]);
    expect(parcial.transferencias.find((x) => x.id === t)?.divergencia_resolvida_em).toBeNull();
    await valor(pedinte, RESOLVER, [t, "chegou_depois", "A outra capa estava no fundo da caixa", "tela:2"]);
    const resolvida = await confereIgual(origem, ids.lojaA);
    expect(resolvida.resolucoes.map((r) => r.decisao)).toEqual(["voltou_a_origem", "chegou_depois"]);
    expect(resolvida.transferencias.find((x) => x.id === t)?.divergencia_resolvida_em).toEqual(expect.any(String));
    // A loja que não é a origem nem o destino não vê a transferência nem as resoluções dela.
    const deFora = await naLoja(ids.dono, ids.lojaC);
    expect((await valor<Tela>(deFora, TELA, [50])).resolucoes).toEqual([]);
  });

  it("o limite corta a lista nas mais novas; quem não escolheu a loja e a outra rede não veem nada", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    for (let i = 0; i < 3; i++) await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    const umaSo = await confereIgual(pedinte, ids.lojaB, 1);
    expect(umaSo.transferencias).toHaveLength(1);
    const semLoja = { usuario: ids.dono, sessao: `4d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
    expect((await comoUsuario(db, semLoja, async () => (await db.query<{ v: Tela }>(TELA, [50])).rows[0]?.v))?.transferencias).toEqual([]);
    const outra = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect((await valor<Tela>(outra, TELA, [50])).transferencias).toEqual([]);
  });
});
