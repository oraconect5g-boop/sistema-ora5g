// Lote CONNECT-f (25/11/2026; ORA-CONNECT-001, ORA-CONNECT-003 e ORA-INV-011): a Ora Connect pronta para operar nas lojas.
// Os planos da Nogle viram os serviços do caixa (recarga e ativação, pelo valor de face) e os chips físicos que a Nogle mostra
// no PDV de cada loja entram no estoque dela pelo ICCID. PLANOS, PDVs e ICCIDs FICTÍCIOS. Cada teste roda numa transação
// desfeita no fim.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
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
async function comoServico<T>(acao: () => Promise<T>): Promise<T> {
  await db.exec("set role service_role");
  try { return await acao(); } finally { await db.exec("reset role"); }
}
let sessoes = 0;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4f000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const erroComo = (s: Sessao | null, sql: string, parametros: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, parametros)));
const planos = (lista: { codigo: string; nome: string; valor_centavos: number }[]) => comoServico(() => db.query(
  "select public.connect_worker_atualizar_referencias($1, 'plano', $2::jsonb)", [ids.organizacao, JSON.stringify(lista)]));
const noCaixa = () => comoServico(async () => (await db.query<{ v: Record<string, number> }>(
  "select public.connect_worker_planos_no_caixa($1) as v", [ids.organizacao])).rows[0]?.v);
const noEstoque = () => comoServico(async () => (await db.query<{ v: Record<string, number> }>(
  "select public.connect_worker_chips_no_estoque($1) as v", [ids.organizacao])).rows[0]?.v);
/** A variação de um serviço pelo SKU, com o preço vigente da rede no caixa (pelo relógio: a função grava com o relógio). */
const servico = async (sku: string) => (await db.query<{ ativa: boolean; nome: string; tipo: string; preco: string | null }>(
  `select v.ativa, v.nome, p.tipo, (select pr.valor_centavos::text from public.precos pr where pr.variante_id = v.id and pr.unidade_id is null
     and pr.canal = 'loja' and pr.cancelado_em is null and pr.inicio <= clock_timestamp() and (pr.fim is null or pr.fim > clock_timestamp())
     order by pr.inicio desc limit 1) as preco
   from public.variantes v join public.produtos p on p.id = v.produto_id where v.organizacao_id = $1 and v.sku = $2`, [ids.organizacao, sku])).rows[0];

const iccid = (n: number) => comDigitoLuhn(`89551701100000${String(n).padStart(4, "0")}`);
const [F1, F2, F3] = [501, 502, 503].map(iccid) as [string, string, string];
const E1 = iccid(601);
// O mesmo número com o dígito verificador errado.
const TORTO = `${iccid(701).slice(0, -1)}${(Number(iccid(701).slice(-1)) + 1) % 10}`;
const LOJA = { id: 5216, nome: "SUPERCELL LOJA A", cidade: "Curitiba", uf: "PR", estoque_minimo: 10 };
const REVENDA = { id: 5250, nome: "Revenda (teste)" };
async function leitura(chipsDaLoja: { iccid: string; tipo: string }[], chipsDaRevenda: { iccid: string; tipo: string }[] = []) {
  await comoServico(() => db.query("select public.connect_worker_gravar_estoque($1, $2::jsonb)", [ids.organizacao, JSON.stringify({
    pdvs: [LOJA, REVENDA], mvno: [{ iccid: F3, tipo: "fisico" }],
    estoques: [{ pdv: 5216, chips: chipsDaLoja }, { pdv: 5250, chips: chipsDaRevenda }], falhas: 0,
  })]));
}

describe("a Ora Connect pronta para operar nas lojas (CONNECT-f)", () => {
  it("os planos da Nogle viram a recarga e a ativação do caixa, pelo valor de face; o plano que sai é desativado", async () => {
    await planos([{ codigo: "11", nome: "7 GB", valor_centavos: 4490 }, { codigo: "12", nome: "15 GB", valor_centavos: 5990 }]);
    expect(await noCaixa()).toEqual({ criadas: 4, precos: 4, desativadas: 1 });
    expect(await servico("REC-11")).toEqual({ ativa: true, nome: "7 GB", tipo: "recarga", preco: "4490" });
    expect(await servico("ATV-11")).toEqual({ ativa: true, nome: "7 GB", tipo: "ativacao", preco: "4490" });
    expect(await servico("ATV-12")).toMatchObject({ ativa: true, preco: "5990" });
    // A recarga do cenário (REC-99999, sem preço), de um plano que não está nesta lista, sai do caixa.
    expect(await servico("REC-99999")).toMatchObject({ ativa: false });
    expect((await db.query("select 1 from public.produtos where organizacao_id = $1 and tipo = 'ativacao'", [ids.organizacao])).rows).toHaveLength(1);
    // O caixa vende pelo preço do plano: o preço vigente, visto pelo vendedor na loja A.
    const variante = (await db.query<{ id: string }>("select id from public.variantes where organizacao_id = $1 and sku = 'REC-12'", [ids.organizacao])).rows[0]?.id;
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const preco = await comoUsuario(db, vendedor, async () => (await db.query<{ v: string }>(
      "select public.preco_vigente($1, $2, 'loja', clock_timestamp())::text as v", [variante, ids.lojaA])).rows[0]?.v);
    expect(preco).toBe("5990");

    // A lista muda: o 7 GB sobe para R$ 49,90 e o 15 GB sai. O preço antigo é encerrado, não apagado.
    await planos([{ codigo: "11", nome: "7 GB", valor_centavos: 4990 }]);
    expect(await noCaixa()).toEqual({ criadas: 0, precos: 2, desativadas: 2 });
    expect(await servico("REC-11")).toMatchObject({ ativa: true, preco: "4990" });
    expect(await servico("REC-12")).toMatchObject({ ativa: false, preco: null });
    expect((await db.query("select 1 from public.precos p join public.variantes v on v.id = p.variante_id where v.sku = 'REC-11' and p.fim is not null")).rows).toHaveLength(1);
    // De novo, nada muda.
    expect(await noCaixa()).toEqual({ criadas: 0, precos: 0, desativadas: 0 });
  });

  it("os chips físicos do PDV de cada loja entram no estoque pelo ICCID, uma vez; o dono vê as divergências", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await leitura([{ iccid: F1, tipo: "fisico" }, { iccid: F2, tipo: "fisico" }, { iccid: E1, tipo: "esim" }, { iccid: TORTO, tipo: "fisico" }],
      [{ iccid: iccid(801), tipo: "fisico" }]);
    // Sem a loja ligada ao PDV, nada entra.
    expect(await noEstoque()).toEqual({ entraram: 0, fora_da_forma: 0, divergentes: 0 });
    await comoUsuario(db, dono, () => db.query("select public.connect_ligar_pdv(5216, $1)", [ids.lojaA]));
    // Entram os dois físicos válidos da loja; o eSIM não (a ativação de eSIM não leva ICCID); o número torto fica de fora. O
    // chip do cenário (no estoque da loja A e fora do PDV dela na Nogle) é divergência.
    expect(await noEstoque()).toEqual({ entraram: 2, fora_da_forma: 1, divergentes: 1 });
    const naLojaA = (await db.query<{ iccid: string; situacao: string; variante_id: string }>(
      "select iccid, situacao, variante_id from public.itens_serializados where unidade_id = $1 and iccid = any($2::text[]) order by iccid",
      [ids.lojaA, [F1, F2, E1, TORTO]])).rows;
    expect(naLojaA).toEqual([{ iccid: F1, situacao: "disponivel", variante_id: cat.chip }, { iccid: F2, situacao: "disponivel", variante_id: cat.chip }]);
    // A leitura seguinte não duplica.
    expect(await noEstoque()).toMatchObject({ entraram: 0 });
    // O F2 sumiu do PDV da loja na Nogle (vendido ou ativado por fora): divergência, sem apagar nada.
    await leitura([{ iccid: F1, tipo: "fisico" }]);
    expect(await noEstoque()).toMatchObject({ entraram: 0, divergentes: 2 });
    const divergencias = await comoUsuario(db, dono, async () => (await db.query<{ iccid: string; onde_na_nogle: string }>(
      "select iccid, onde_na_nogle from public.connect_chips_divergentes() order by iccid")).rows);
    expect(divergencias).toEqual([
      { iccid: cat.iccid1, onde_na_nogle: "fora dos PDVs e do estoque geral da Nogle" },
      { iccid: F2, onde_na_nogle: "fora dos PDVs e do estoque geral da Nogle" },
    ].sort((a, b) => a.iccid.localeCompare(b.iccid)));
    // Quem só opera a loja não vê as divergências da rede; o visitante não chama.
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    expect((await comoUsuario(db, vendedor, () => db.query("select * from public.connect_chips_divergentes()"))).rows).toEqual([]);
    expect(await erroComo(null, "select * from public.connect_chips_divergentes()")).toBe("42501");
  });

  it("as funções do worker são só do servidor; rede desconhecida é recusada", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await erroComo(dono, "select public.connect_worker_planos_no_caixa($1)", [ids.organizacao])).toBe("42501");
    expect(await erroComo(dono, "select public.connect_worker_chips_no_estoque($1)", [ids.organizacao])).toBe("42501");
    const desconhecida = "00000000-0000-4000-8000-000000009999";
    expect(await comoServico(() => erroDe(() => db.query("select public.connect_worker_planos_no_caixa($1)", [desconhecida])))).toBe("22023");
    expect(await comoServico(() => erroDe(() => db.query("select public.connect_worker_chips_no_estoque($1)", [desconhecida])))).toBe("22023");
  });
});
