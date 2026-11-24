// Lote VEL-g (19/11/2026; ORA-QUAL-010 e ORA-INV-007; migration da tela de Transferências numa ida): a leitura única
// devolve exatamente o que as leituras uma a uma devolvem, para a mesma pessoa e com o mesmo RLS: a lista da loja do
// turno, os produtos (com o tipo), as lojas, os aparelhos separados, as remessas, os saldos e os aparelhos livres para os
// pedidos que a loja tem a separar. Lote TRF-f (24/11; o achado F24-01 do Codex): a lista são as em andamento e o
// histórico, cada parte com as suas páginas, e a busca pelo número. Dados FICTÍCIOS; cada teste numa transação desfeita.
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
// TRF-f: o tamanho da página, a página do histórico, a das em andamento e o número procurado.
const TELA_COMPLETA = "select public.transferencias_tela($1, $2, $3, $4) as v";
type Contas = { abertas: number; historico: number; pagina_abertas: number; paginas_abertas: number; pagina: number; paginas: number };
const EM_ANDAMENTO = "(situacao in ('solicitada', 'separada', 'enviada') or (situacao = 'recebida_com_divergencia' and divergencia_resolvida_em is null))";
const porId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));

/** A mesma tela, uma leitura por vez, com a mesma sessão (as consultas do PostgREST, em SQL): as em andamento e depois o
 *  histórico da primeira página de cada parte (TRF-f), as mais novas primeiro. */
async function leiturasDeAntes(s: Sessao, unidade: string, limite = 50) {
  type Linha = Record<string, unknown> & { id: string; origem_id: string; destino_id: string; variante_id: string; remessa_id: string | null; situacao: string;
    divergencia_resolvida_em: string | null };
  const parte = (aberta: boolean) => linhas<Linha>(s,
    `select id, numero, origem_id, destino_id, variante_id, quantidade, motivo, situacao, solicitado_por, quantidade_recebida, observacao, solicitado_em, remessa_id,
       divergencia_resolvida_em, ${EM_ANDAMENTO} as aberta
     from public.transferencias where (origem_id = $1 or destino_id = $1) and ${aberta ? "" : "not "}${EM_ANDAMENTO} order by numero desc limit $2`, [unidade, limite]);
  const lista = [...await parte(true), ...await parte(false)];
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

  it("o limite corta cada parte em páginas, as mais novas primeiro; quem não escolheu a loja e a outra rede não veem nada", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    for (let i = 0; i < 3; i++) await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    const umaSo = await confereIgual(pedinte, ids.lojaB, 1);
    expect(umaSo.transferencias).toHaveLength(1);
    expect(umaSo).toMatchObject({ abertas: 3, historico: 0, pagina_abertas: 1, paginas_abertas: 3, pagina: 1, paginas: 1 });
    const semLoja = { usuario: ids.dono, sessao: `4d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
    expect((await comoUsuario(db, semLoja, async () => (await db.query<{ v: Tela }>(TELA, [50])).rows[0]?.v))?.transferencias).toEqual([]);
    const outra = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect((await valor<Tela>(outra, TELA, [50])).transferencias).toEqual([]);
  });
});

// TRF-f (o achado F24-01 da revisão do Codex de 24/11, P1): a transferência em andamento não some da tela.
describe("as em andamento e o histórico, cada um com as suas páginas, e a busca pelo número (TRF-f)", () => {
  const encerrar = (s: Sessao, id: string) => valor(s, "select public.transferencia_encerrar($1, 'cancelada', 'Cancelada no teste') as v", [id]);
  const tela = (s: Sessao, limite = 50, pagina = 1, paginaAbertas = 1, numero: number | null = null) =>
    valor<Tela & Contas>(s, TELA_COMPLETA, [limite, pagina, paginaAbertas, numero]);
  const numeroDe = async (id: string) => Number((await db.query<{ n: string }>("select numero as n from public.transferencias where id = $1", [id])).rows[0]?.n);

  it("o teste do Codex: a pedida antiga segue na tela depois de 50 canceladas mais novas, e a contagem diz quantas há em cada parte", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const antiga = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    for (let i = 0; i < 50; i++) await encerrar(pedinte, await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1));
    expect((await db.query<{ situacao: string }>("select situacao from public.transferencias where id = $1", [antiga])).rows[0]?.situacao).toBe("solicitada");
    const t = await tela(pedinte);
    expect(t.transferencias.map((x) => x.id)).toContain(antiga);
    expect(t.transferencias[0]).toMatchObject({ id: antiga, aberta: true });
    expect(t).toMatchObject({ abertas: 1, historico: 50, paginas_abertas: 1, paginas: 1 });
    expect(t.transferencias.filter((x) => x.aberta === false)).toHaveLength(50);
    // A mesma resposta pelas leituras uma a uma.
    await confereIgual(pedinte, ids.lojaB);
  }, 60_000);

  it("mais de 50 em andamento: a página 2 traz as que faltam, sem repetir; o histórico tem as suas páginas", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    // 52 pedidos abertos reservam 52 capas na origem: a entrada de 60 para o teste.
    await db.query("select privado.lancar_movimento($1, $2, 60, 'ajuste', null, 'Capas para o teste das páginas') as v", [ids.lojaA, cat.capa]);
    const pedidas: string[] = [];
    for (let i = 0; i < 52; i++) pedidas.push(await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1));
    for (const id of pedidas.slice(0, 3)) await encerrar(pedinte, id);
    const primeira = await tela(pedinte, 25);
    expect(primeira).toMatchObject({ abertas: 49, historico: 3, pagina_abertas: 1, paginas_abertas: 2, pagina: 1, paginas: 1 });
    const segunda = await tela(pedinte, 25, 1, 2);
    const abertas = (x: Tela) => x.transferencias.filter((y) => y.aberta === true).map((y) => y.id);
    expect(abertas(primeira)).toHaveLength(25);
    expect(abertas(segunda)).toHaveLength(24);
    expect(new Set([...abertas(primeira), ...abertas(segunda)])).toEqual(new Set(pedidas.slice(3)));
    // A página pedida além da última vale a última; a do histórico não muda a das em andamento.
    expect(await tela(pedinte, 25, 9, 9)).toMatchObject({ pagina_abertas: 2, pagina: 1 });
  }, 60_000);

  it("a busca pelo número traz só aquela transferência, para a origem e o destino; a loja de fora e o número que não existe, nada", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const procurada = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    const n = await numeroDe(procurada);
    for (const s of [pedinte, origem]) expect((await tela(s, 50, 1, 1, n)).transferencias.map((x) => x.id)).toEqual([procurada]);
    expect((await tela(await naLoja(ids.dono, ids.lojaC), 50, 1, 1, n)).transferencias).toEqual([]);
    expect((await tela(pedinte, 50, 1, 1, 999_999)).transferencias).toEqual([]);
  });

  it("a recebida com divergência fica em andamento até tudo o que faltou ter destino; depois, vai para o histórico", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 2);
    await valor(origem, "select public.transferencia_separar($1, '{}'::uuid[]) as v", [t]);
    await valor(origem, "select public.transferencia_enviar($1) as v", [t]);
    await valor(pedinte, "select public.transferencia_receber($1, '{}'::text[], 1, 'Chegou uma capa a menos') as v", [t]);
    expect((await tela(pedinte)).transferencias.find((x) => x.id === t)).toMatchObject({ situacao: "recebida_com_divergencia", aberta: true });
    await valor(origem, "select public.transferencia_resolver_divergencia($1, 'voltou_a_origem', null, 1, 'A capa ficou na origem', 'trf-f:1') as v", [t]);
    const depois = await tela(pedinte);
    expect(depois.transferencias.find((x) => x.id === t)).toMatchObject({ aberta: false });
    expect(depois).toMatchObject({ abertas: 0, historico: 1 });
  });
});
