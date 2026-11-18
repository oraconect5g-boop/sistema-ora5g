// Lote REPASSE-a (18/11/2026; ORA-MKTPL-005 e ORA-MKTPL-008; migration dos repasses dos marketplaces): o repasse do canal
// (os pedidos com a mesma data de repasse) casado com a linha de crédito do extrato do banco, a divergência com motivo e o
// painel. Dados FICTÍCIOS (pedidos, extratos e valores inventados aqui); cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let arquivos = 0;
const impressao = () => `d${String(++arquivos).padStart(63, "0")}`;
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
const recusa = (s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });

const PEDIDOS = "select public.marketplace_importar($1, 'vendas.xlsx', $2, $3, $4::jsonb, '{}'::jsonb) as v";
const EXTRATO = "select public.extrato_importar(null, 'banco', 'Banco Fictício', array['pix_direto']::text[], 'extrato.ofx', $1, $2::jsonb, '{\"data\": 0}'::jsonb) as v";
const CASAR = "select public.marketplace_repasse_casar($1, $2::date, $3, $4) as v";
const DESFAZER = "select public.marketplace_repasse_desfazer($1, $2::date, $3) as v";
const PAINEL = "select public.marketplace_repasses_painel($1::date, $2::date) as v";
type Pedido = { id_externo: string; data: string; bruto: number; tarifas?: number; liquido?: number; data_repasse?: string };
const pedidos = (s: Sessao, lista: Pedido[], canal = "mercado_livre") =>
  valor(s, PEDIDOS, [canal, impressao(), lista.length, JSON.stringify(lista.map((p, i) => ({ ...p, itens: [{ numero: i + 1, quantidade: 1, valor: p.bruto }] })))]);
/** Importa o extrato do banco da rede e devolve o id de cada linha, pela ordem. */
async function extrato(s: Sessao, linhas: { data: string; valor: number; descricao?: string }[]): Promise<string[]> {
  const r = await valor<{ extrato: string }>(s, EXTRATO, [impressao(), JSON.stringify(linhas.map((l, i) => ({ numero: i + 1, ...l })))]);
  return (await db.query<{ id: string }>("select id from public.extrato_linhas where extrato_id = $1 order by numero", [r.extrato])).rows.map((l) => l.id);
}
type Repasse = { canal: string; data_repasse: string; pedidos: number; esperado: number; estimados: number; casado: Record<string, unknown> | null; sugestoes: { linha: string; valor: number }[] };
const painel = async (s: Sessao) => valor<{ repasses: Repasse[]; sem_data_de_repasse: number }>(s, PAINEL, ["2026-11-01", "2026-11-30"]);

describe("o repasse dos marketplaces casado com o extrato do banco (REPASSE-a)", () => {
  it("o esperado é a soma do líquido dos pedidos do repasse; a linha do mesmo valor vem primeiro e casa sem motivo", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await pedidos(dono, [
      { id_externo: "ML-1", data: "2026-11-03", bruto: 10_000, tarifas: 1_300, liquido: 8_700, data_repasse: "2026-11-10" },
      { id_externo: "ML-2", data: "2026-11-04", bruto: 20_000, tarifas: 2_600, data_repasse: "2026-11-10" },   // líquido estimado: 17.400
      { id_externo: "ML-3", data: "2026-11-05", bruto: 5_000, liquido: 4_350 },                                // ainda sem data de repasse
    ]);
    const [quase, certa, antes] = await extrato(dono, [
      { data: "2026-11-11", valor: 26_000, descricao: "TED MERCADO PAGO" },
      { data: "2026-11-12", valor: 26_100, descricao: "TED MERCADO PAGO" },
      { data: "2026-11-02", valor: 26_100, descricao: "Outra entrada, antes do repasse" },
    ]);
    const p = await painel(dono);
    expect(p.sem_data_de_repasse).toBe(1);
    expect(p.repasses).toHaveLength(1);
    expect(p.repasses[0]).toMatchObject({ canal: "mercado_livre", data_repasse: "2026-11-10", pedidos: 2, esperado: 26_100, estimados: 1, casado: null });
    expect(p.repasses[0]?.sugestoes.map((s) => s.linha)).toEqual([certa, quase]);
    expect(p.repasses[0]?.sugestoes.map((s) => s.linha)).not.toContain(antes);

    expect(await valor(dono, CASAR, ["mercado_livre", "2026-11-10", certa, null])).toEqual({ pedidos: 2, esperado: 26_100, recebido: 26_100, diferenca: 0, estimados: 1 });
    const depois = (await painel(dono)).repasses[0];
    expect(depois?.casado).toMatchObject({ linha: certa, recebido: 26_100, esperado_ao_casar: 26_100, motivo: null });
    // A linha casada sai das sugestões dos outros; a situação dela no extrato não muda (casar repasse não é conciliar venda).
    expect((await db.query<{ situacao: string }>("select situacao from public.extrato_linhas where id = $1", [certa])).rows[0]?.situacao).toBe("pendente");
  });

  it("valor diferente pede o motivo (a divergência fica registrada); a mesma linha ou o mesmo repasse não casa duas vezes", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await pedidos(dono, [{ id_externo: "SH-1", data: "2026-11-03", bruto: 10_000, liquido: 9_000, data_repasse: "2026-11-08" }], "shopee");
    await pedidos(dono, [{ id_externo: "TT-1", data: "2026-11-03", bruto: 5_000, liquido: 4_500, data_repasse: "2026-11-08" }], "tiktok_shop");
    const [linha, outra] = await extrato(dono, [{ data: "2026-11-09", valor: 8_950 }, { data: "2026-11-09", valor: 4_500 }]);
    expect(await recusa(dono, CASAR, ["shopee", "2026-11-08", linha, null])).toBe("22023");
    expect(await valor(dono, CASAR, ["shopee", "2026-11-08", linha, "Tarifa de saque de R$ 0,50"])).toMatchObject({ diferenca: -50 });
    expect(await recusa(dono, CASAR, ["tiktok_shop", "2026-11-08", linha, "A mesma linha"])).toBe("OR045");
    expect(await recusa(dono, CASAR, ["shopee", "2026-11-08", outra, "Outra linha para o mesmo repasse"])).toBe("OR045");
    expect(await valor(dono, CASAR, ["tiktok_shop", "2026-11-08", outra, null])).toMatchObject({ diferenca: 0 });
    const registro = await db.query<{ motivo: string | null; esperado_centavos: string; recebido_centavos: string }>(
      "select motivo, esperado_centavos, recebido_centavos from public.marketplace_repasses where canal = 'shopee'");
    expect(registro.rows[0]).toMatchObject({ motivo: "Tarifa de saque de R$ 0,50" });
    expect(Number(registro.rows[0]?.esperado_centavos) - Number(registro.rows[0]?.recebido_centavos)).toBe(50);
  });

  it("só a linha de crédito do extrato do banco da rede; repasse sem pedido não existe", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await pedidos(dono, [{ id_externo: "ML-9", data: "2026-11-03", bruto: 10_000, liquido: 9_000, data_repasse: "2026-11-08" }]);
    const [debito] = await extrato(dono, [{ data: "2026-11-09", valor: -9_000 }]);
    expect(await recusa(dono, CASAR, ["mercado_livre", "2026-11-08", debito, null])).toBe("22023");
    const [credito] = await extrato(dono, [{ data: "2026-11-09", valor: 9_000 }]);
    expect(await recusa(dono, CASAR, ["mercado_livre", "2026-11-09", credito, null])).toBe("P0002");
    expect(await recusa(dono, CASAR, ["amazon", "2026-11-08", credito, null])).toBe("22023");
  });

  it("desfazer pede o motivo e fica na auditoria; depois, a linha volta a ser sugestão", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await pedidos(dono, [{ id_externo: "ML-5", data: "2026-11-03", bruto: 10_000, liquido: 9_000, data_repasse: "2026-11-08" }]);
    const [linha] = await extrato(dono, [{ data: "2026-11-08", valor: 9_000 }]);
    await valor(dono, CASAR, ["mercado_livre", "2026-11-08", linha, null]);
    expect(await recusa(dono, DESFAZER, ["mercado_livre", "2026-11-08", " "])).toBe("22023");
    expect(await valor(dono, DESFAZER, ["mercado_livre", "2026-11-08", "Casado com a linha errada"])).toBe(true);
    expect(await valor(dono, DESFAZER, ["mercado_livre", "2026-11-08", "De novo"])).toBe(false);
    const p = await painel(dono);
    expect(p.repasses[0]).toMatchObject({ casado: null });
    expect(p.repasses[0]?.sugestoes.map((s) => s.linha)).toEqual([linha]);
    const auditoria = await db.query<{ acao: string; motivo: string | null }>(
      "select acao, motivo from public.auditoria where acao like 'marketplace_repasses.%' order by id");
    expect(auditoria.rows.map((r) => [r.acao, r.motivo])).toEqual([
      ["marketplace_repasses.criado", "Repasse casado com o extrato do banco"], ["marketplace_repasses.removido", "Casado com a linha errada"]]);
  });

  it("o gerente da loja e a outra rede não veem nem casam", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await pedidos(dono, [{ id_externo: "ML-7", data: "2026-11-03", bruto: 10_000, liquido: 9_000, data_repasse: "2026-11-08" }]);
    const [linha] = await extrato(dono, [{ data: "2026-11-08", valor: 9_000 }]);
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await recusa(gerente, PAINEL, ["2026-11-01", "2026-11-30"])).toBe("42501");
    expect(await recusa(gerente, CASAR, ["mercado_livre", "2026-11-08", linha, null])).toBe("42501");
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await recusa(outraRede, CASAR, ["mercado_livre", "2026-11-08", linha, null])).toBe("P0002");
    expect(await valor(outraRede, PAINEL, ["2026-11-01", "2026-11-30"])).toEqual({ repasses: [], sem_data_de_repasse: 0 });
  });
});
