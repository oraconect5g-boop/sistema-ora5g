// Lote CONNECT-d (24/11/2026; ORA-INV-011): o estoque de chips da Nogle no sistema, só leitura. As leituras aqui têm a
// forma que o domínio entrega ao banco (packages/dominio/src/nogle.ts: lerPdvs e lerChips), com PDVs e ICCIDs FICTÍCIOS.
// Cada teste roda numa transação desfeita no fim.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

const iccid = (n: number) => comDigitoLuhn(`89551701100000${String(n).padStart(4, "0")}`);
type Chip = { iccid: string; tipo: string; repassado_em?: string | null };
type Leitura = { pdvs: unknown[]; mvno: Chip[] | null; estoques: { pdv: number; chips: Chip[] }[]; falhas?: number };
type Gravada = { numero: number; pdvs: number; pdvs_lidos: number; chips: number; falhas: number };
const LOJA = { id: 5216, nome: "SUPERCELL LOJA A", cidade: "Curitiba", uf: "PR", estoque_minimo: 10 };
const REVENDA = { id: 5250, nome: "Revenda (teste)", cidade: "São Paulo", uf: "SP", estoque_minimo: null };
const GRAVAR = "select public.connect_worker_gravar_estoque($1, $2::jsonb) as v";

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
async function gravar(leitura: Leitura, organizacao = ids.organizacao): Promise<Gravada> {
  await db.exec("set role service_role");
  try {
    const v = (await db.query<{ v: Gravada }>(GRAVAR, [organizacao, JSON.stringify({ falhas: 0, ...leitura })])).rows[0]?.v;
    if (!v) throw new Error("sem resposta");
    return v;
  } finally {
    await db.exec("reset role");
  }
}
const comoServico = async (acao: () => Promise<unknown>) => {
  await db.exec("set role service_role");
  try { return await erroDe(acao); } finally { await db.exec("reset role"); }
};
let sessoes = 0;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const ligar = (s: Sessao, pdv: number, unidade: string | null) => comoUsuario(db, s, async () =>
  (await db.query<{ v: { pdv: number; unidade: string | null; mudou: boolean } }>("select public.connect_ligar_pdv($1, $2) as v", [pdv, unidade])).rows[0]?.v);
// O erro é pego dentro da sessão da pessoa: fora dela, a volta do papel numa transação abortada esconderia o código.
const erroComo = (s: Sessao | null, sql: string, parametros: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, parametros)));
const erroAoLigar = (s: Sessao, pdv: number, unidade: string | null) => erroComo(s, "select public.connect_ligar_pdv($1, $2)", [pdv, unidade]);
const chipsDe = async (pdv: number | null) => (await db.query<{ iccid: string; tipo: string; repassado_em: string | null }>(
  "select iccid, tipo, repassado_em::text from public.connect_chips_nogle where organizacao_id = $1 and pdv_id is not distinct from $2::int order by iccid",
  [ids.organizacao, pdv])).rows;
const pdv = async (id: number) => (await db.query<{ ativo: boolean; fisicos: number; esims: number; lido: boolean; unidade_id: string | null; uf: string | null; estoque_minimo: number | null }>(
  "select ativo, fisicos, esims, estoque_lido_em is not null as lido, unidade_id, uf, estoque_minimo from public.connect_pdvs where organizacao_id = $1 and pdv_id = $2",
  [ids.organizacao, id])).rows[0];

describe("o estoque de chips da Nogle (CONNECT-d; ORA-INV-011)", () => {
  it("grava os PDVs, a MVNO e o estoque de cada PDV; a leitura seguinte troca só o que respondeu", async () => {
    // A lista da MVNO traz o estoque virgem INTEIRO, inclusive o que já está nos PDVs (como a Nogle de verdade respondeu
    // na primeira leitura, 24/11): "sem PDV" é só o que não está em nenhum PDV.
    const [c1, c2, c3, m1, m2] = [1, 2, 3, 4, 5].map(iccid) as [string, string, string, string, string];
    const r1 = await gravar({
      pdvs: [LOJA, REVENDA],
      mvno: [{ iccid: m1, tipo: "fisico" }, { iccid: m2, tipo: "esim" }, { iccid: c1, tipo: "fisico" }, { iccid: c2, tipo: "esim" }, { iccid: c3, tipo: "fisico" }],
      estoques: [
        { pdv: 5216, chips: [{ iccid: c1, tipo: "fisico", repassado_em: "2022-03-21 22:31:23.580" }, { iccid: c2, tipo: "esim", repassado_em: null }] },
        { pdv: 5250, chips: [{ iccid: c3, tipo: "fisico" }] },
      ],
    });
    expect(r1).toMatchObject({ pdvs: 2, pdvs_lidos: 2, chips: 5, falhas: 0 });
    expect(await pdv(5216)).toEqual({ ativo: true, fisicos: 1, esims: 1, lido: true, unidade_id: null, uf: "PR", estoque_minimo: 10 });
    expect(await chipsDe(5216)).toEqual([
      { iccid: c1, tipo: "fisico", repassado_em: "2022-03-21 22:31:23.58" },
      { iccid: c2, tipo: "esim", repassado_em: null },
    ]);
    expect((await chipsDe(null)).map((c) => c.tipo)).toEqual(["fisico", "esim"]);

    // A segunda: a revenda e a MVNO falharam (ficam como estavam); a loja agora só tem o c1.
    const r2 = await gravar({ pdvs: [LOJA, REVENDA], mvno: null, estoques: [{ pdv: 5216, chips: [{ iccid: c1, tipo: "fisico" }] }], falhas: 2 });
    expect(r2).toMatchObject({ pdvs_lidos: 1, chips: 4, falhas: 2 });
    expect(await pdv(5216)).toMatchObject({ fisicos: 1, esims: 0 });
    expect((await chipsDe(5250)).map((c) => c.iccid)).toEqual([c3]);
    expect((await chipsDe(null)).map((c) => c.iccid)).toEqual([m1, m2]);
    const leituras = (await db.query<{ mvno_fisicos: number | null; mvno_esims: number | null; pdvs_lidos: number; falhas: number }>(
      "select mvno_fisicos, mvno_esims, pdvs_lidos, falhas from public.connect_leituras_nogle where organizacao_id = $1 order by numero",
      [ids.organizacao])).rows;
    expect(leituras).toEqual([
      { mvno_fisicos: 1, mvno_esims: 1, pdvs_lidos: 2, falhas: 0 },
      { mvno_fisicos: null, mvno_esims: null, pdvs_lidos: 1, falhas: 2 },
    ]);

    // A terceira: o eSIM m2 saiu da MVNO para a loja; a revenda sumiu da lista da Nogle (inativa, com o estoque de antes).
    await gravar({
      pdvs: [LOJA], mvno: [{ iccid: m1, tipo: "fisico" }, { iccid: m2, tipo: "esim" }, { iccid: c1, tipo: "fisico" }],
      estoques: [{ pdv: 5216, chips: [{ iccid: c1, tipo: "fisico" }, { iccid: m2, tipo: "esim" }] }],
    });
    expect(await pdv(5216)).toMatchObject({ fisicos: 1, esims: 1 });
    expect((await chipsDe(null)).map((c) => c.iccid)).toEqual([m1]);
    expect(await pdv(5250)).toMatchObject({ ativo: false, fisicos: 1 });

    // A quarta: a revenda volta à lista, mas a leitura do estoque dela falha. A lista da MVNO traz o c3 (que está nela):
    // ele fica na revenda, como estava, e não vira "sem PDV".
    await gravar({
      pdvs: [LOJA, REVENDA], mvno: [{ iccid: m1, tipo: "fisico" }, { iccid: m2, tipo: "esim" }, { iccid: c1, tipo: "fisico" }, { iccid: c3, tipo: "fisico" }],
      estoques: [{ pdv: 5216, chips: [{ iccid: c1, tipo: "fisico" }, { iccid: m2, tipo: "esim" }] }], falhas: 1,
    });
    expect(await pdv(5250)).toMatchObject({ ativo: true, fisicos: 1, esims: 0 });
    expect((await chipsDe(5250)).map((c) => c.iccid)).toEqual([c3]);
    expect((await chipsDe(null)).map((c) => c.iccid)).toEqual([m1]);
    // A quinta: o eSIM m2 voltou da loja para o estoque da Ora; a revenda responde de novo.
    await gravar({
      pdvs: [LOJA, REVENDA], mvno: [{ iccid: m1, tipo: "fisico" }, { iccid: m2, tipo: "esim" }, { iccid: c1, tipo: "fisico" }, { iccid: c3, tipo: "fisico" }],
      estoques: [{ pdv: 5216, chips: [{ iccid: c1, tipo: "fisico" }] }, { pdv: 5250, chips: [{ iccid: c3, tipo: "fisico" }] }],
    });
    expect(await pdv(5216)).toMatchObject({ fisicos: 1, esims: 0 });
    expect((await chipsDe(null)).map((c) => c.iccid)).toEqual([m1, m2]);
    const ultimas = (await db.query<{ mvno_fisicos: number | null; mvno_esims: number | null }>(
      "select mvno_fisicos, mvno_esims from public.connect_leituras_nogle where organizacao_id = $1 order by numero desc limit 2", [ids.organizacao])).rows;
    expect(ultimas).toEqual([{ mvno_fisicos: 1, mvno_esims: 1 }, { mvno_fisicos: 1, mvno_esims: 0 }]);
    // Outra rede não se mistura.
    expect((await db.query("select 1 from public.connect_pdvs where organizacao_id = $1", [ids.outraOrganizacao])).rows).toEqual([]);
  });

  it("recusa a leitura fora da forma, de rede desconhecida ou que não vem do servidor", async () => {
    const ok = { pdvs: [LOJA], mvno: null, estoques: [] };
    const casos: [string, unknown][] = [
      ["sem PDVs", { ...ok, pdvs: [] }],
      ["PDV sem id", { ...ok, pdvs: [{ nome: "X" }] }],
      ["PDV repetido", { ...ok, pdvs: [LOJA, LOJA] }],
      ["UF fora da forma", { ...ok, pdvs: [{ ...LOJA, uf: "Paraná" }] }],
      ["ICCID fora da forma", { ...ok, mvno: [{ iccid: "123", tipo: "fisico" }] }],
      ["tipo desconhecido", { ...ok, mvno: [{ iccid: iccid(1), tipo: "chip" }] }],
      ["estoque de PDV fora da lista", { ...ok, estoques: [{ pdv: 9999, chips: [] }] }],
      ["data do repasse fora da forma", { ...ok, estoques: [{ pdv: 5216, chips: [{ iccid: iccid(1), tipo: "fisico", repassado_em: "21/03/2022" }] }] }],
      ["chips que não são lista", { ...ok, estoques: [{ pdv: 5216, chips: {} }] }],
      ["PDV repetido nos estoques", { ...ok, estoques: [{ pdv: 5216, chips: [] }, { pdv: 5216, chips: [] }] }],
    ];
    for (const [nome, leitura] of casos) {
      expect(await comoServico(() => db.query(GRAVAR, [ids.organizacao, JSON.stringify(leitura)])), nome).toBe("22023");
    }
    expect(await comoServico(() => db.query(GRAVAR, ["00000000-0000-4000-8000-000000009999", JSON.stringify(ok)]))).toBe("22023");
    // Pessoa logada, mesmo o dono, não grava a leitura nem mexe nas tabelas: só o servidor.
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await erroComo(dono, GRAVAR, [ids.organizacao, JSON.stringify(ok)])).toBe("42501");
    expect(await erroComo(dono, "insert into public.connect_chips_nogle (organizacao_id, iccid, tipo) values ($1, $2, 'fisico')", [ids.organizacao, iccid(1)])).toBe("42501");
    expect(await erroComo(null, "select 1 from public.connect_pdvs")).toBe("42501");
  });

  it("quem vê: o dono tudo; o administrador os PDVs e as leituras; quem opera numa loja, só o PDV ligado a ela", async () => {
    const [c1, c3, m1] = [1, 3, 4].map(iccid) as [string, string, string];
    await gravar({
      pdvs: [LOJA, REVENDA], mvno: [{ iccid: m1, tipo: "fisico" }],
      estoques: [{ pdv: 5216, chips: [{ iccid: c1, tipo: "fisico" }] }, { pdv: 5250, chips: [{ iccid: c3, tipo: "esim" }] }],
    });
    const ve = (s: Sessao) => comoUsuario(db, s, async () => ({
      pdvs: (await db.query<{ pdv_id: number }>("select pdv_id from public.connect_pdvs order by pdv_id")).rows.map((r) => r.pdv_id),
      chips: (await db.query<{ iccid: string }>("select iccid from public.connect_chips_nogle order by iccid")).rows.map((r) => r.iccid),
      leituras: (await db.query("select 1 from public.connect_leituras_nogle")).rows.length,
    }));
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await ve(dono)).toEqual({ pdvs: [5216, 5250], chips: [c1, c3, m1], leituras: 1 });
    expect(await ve(await naLoja(ids.administrador, ids.lojaA))).toEqual({ pdvs: [5216, 5250], chips: [], leituras: 1 });
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await ve(vendedor)).toEqual({ pdvs: [], chips: [], leituras: 0 });
    await ligar(dono, 5216, ids.lojaA);
    expect(await ve(vendedor)).toEqual({ pdvs: [5216], chips: [c1], leituras: 0 });
    expect(await ve(await naLoja(ids.gerenteB, ids.lojaB))).toEqual({ pdvs: [], chips: [], leituras: 0 });
    expect(await ve(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg))).toEqual({ pdvs: [], chips: [], leituras: 0 });
  });

  it("a ligação do PDV com a loja: o dono ou o administrador; só loja física da rede; uma loja, um PDV; fica na auditoria", async () => {
    await gravar({ pdvs: [LOJA, REVENDA], mvno: null, estoques: [] });
    const dono = await naLoja(ids.dono, ids.lojaA);
    const administrador = await naLoja(ids.administrador, ids.lojaA);
    expect(await ligar(dono, 5216, ids.lojaA)).toEqual({ pdv: 5216, unidade: ids.lojaA, mudou: true });
    expect((await db.query("select acao, motivo, unidade_id, usuario_id from public.auditoria where alvo_tipo = 'connect_pdvs'")).rows).toEqual([
      { acao: "connect_pdvs.alterado", motivo: "PDV 5216 da Nogle (SUPERCELL LOJA A) ligado à loja Loja A", unidade_id: ids.lojaA, usuario_id: ids.dono },
    ]);
    // A mesma ligação de novo não muda nada nem vai para a auditoria.
    expect(await ligar(dono, 5216, ids.lojaA)).toMatchObject({ mudou: false });
    expect((await db.query("select 1 from public.auditoria where alvo_tipo = 'connect_pdvs'")).rows).toHaveLength(1);
    // A loja já ligada a outro PDV: recusa; o administrador desliga aquele e liga este.
    expect(await erroAoLigar(administrador, 5250, ids.lojaA)).toBe("OR051");
    expect(await ligar(administrador, 5216, null)).toMatchObject({ mudou: true });
    expect(await ligar(administrador, 5250, ids.lojaA)).toMatchObject({ mudou: true });
    expect(await pdv(5216)).toMatchObject({ unidade_id: null });
    expect(await pdv(5250)).toMatchObject({ unidade_id: ids.lojaA });
    // Só loja física da mesma rede.
    expect(await erroAoLigar(dono, 5216, ids.online)).toBe("22023");
    expect(await erroAoLigar(dono, 5216, ids.lojaOutraOrg)).toBe("22023");
    // Quem só opera a loja, o gerente (connect.gerir só na loja dele) e o dono de outra rede não ligam.
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const outro = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await erroAoLigar(vendedor, 5216, ids.lojaB)).toBe("42501");
    expect(await erroAoLigar(gerente, 5216, ids.lojaB)).toBe("42501");
    expect(await erroAoLigar(outro, 5216, ids.lojaB)).toBe("42501");
  });
});
