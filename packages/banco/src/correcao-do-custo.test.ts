// A correção do custo atual (lote CAT-008b: ORA-CAT-008): o estorno da entrada volta o custo que o histórico diz sem
// ela, e a correção do custo com motivo (o dono e o administrador). Banco em memória com todas as migrations; dados
// FICTÍCIOS. Cada teste numa transação desfeita.
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
beforeEach(async () => { await db.exec("begin"); fornecedor = null; });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = () => `cat008b:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `7b000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string; mensagem: string }> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return { v };
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      return { codigo: (e as { code?: string }).code ?? "sem-codigo", mensagem: (e as Error).message };
    }
  }, { criarSessao: false });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const recusa = async (s: Sessao | null, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? `${r.codigo}: ${r.mensagem}` : null;
};

const ENTRADA = "select public.estoque_registrar_entrada($1, $2, $3, $4, $5::jsonb, $6, $7) as v";
const FORNECEDOR = "select public.fornecedor_salvar($1, $2, $3, $4, $5, $6, $7) as v";
/** O fornecedor das compras do teste (criado na primeira compra; cada teste desfaz o seu). */
let fornecedor: string | null = null;
const doFornecedor = async (s: Sessao) =>
  (fornecedor ??= (await valor<{ id: string }>(s, FORNECEDOR, [ids.organizacao, null, "Distribuidora Fictícia", null, null, null, "Fornecedor novo"])).id);
const ESTORNO = "select public.estoque_estornar_entrada($1, $2) as v";
const CORRIGIR = "select public.custo_corrigir($1, $2, $3) as v";
/** Uma compra de capas na loja A, com o custo de cada uma; devolve o id e o número. */
const compra = async (s: Sessao, custo: number, quantidade = 5) =>
  valor<{ id: string; numero: number }>(s, ENTRADA, [ids.lojaA, "compra", await doFornecedor(s), "NF 1", JSON.stringify([{ variante: cat.capa, quantidade, custo }]), chave(), "Compra de capas"]);
const custoAtual = async (variante = cat.capa) =>
  Number((await db.query<{ v: string }>("select privado.custo_atual($1)::text as v", [variante])).rows[0]?.v);
type LinhaDeCusto = { valor: number; origem: string; referencia: string | null };
const ultimoCusto = async (variante = cat.capa) => (await db.query<LinhaDeCusto>(
  "select valor_centavos::int as valor, origem, referencia from public.custos where variante_id = $1 order by inicio desc, criado_em desc limit 1", [variante])).rows[0];
const quantosCustos = async (variante = cat.capa) =>
  Number((await db.query<{ n: string }>("select count(*)::text as n from public.custos where variante_id = $1", [variante])).rows[0]?.n);

describe("o estorno da entrada volta o custo (CAT-008b)", () => {
  it("a entrada que definiu o custo, estornada, volta o anterior; em cadeia, volta ao de antes de todas; o motivo vai para a auditoria", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await custoAtual()).toBe(1_800);
    const a = await compra(dono, 2_000);
    const b = await compra(dono, 2_500);
    expect(await custoAtual()).toBe(2_500);
    expect(await valor<string>(dono, ESTORNO, [b.id, "Lançada em dobro"])).toBe("estornada");
    expect(await ultimoCusto()).toEqual({ valor: 2_000, origem: "estorno", referencia: `estorno:entrada:${b.numero}` });
    const auditado = await db.query<{ motivo: string; depois: { valor_centavos: number } }>(
      "select motivo, depois from public.auditoria where alvo_tipo = 'custos' order by id desc limit 1");
    expect(auditado.rows[0]).toMatchObject({ motivo: `Estorno da entrada nº ${b.numero}: Lançada em dobro`, depois: { valor_centavos: 2_000 } });
    expect(await valor<string>(dono, ESTORNO, [a.id, "Nota errada"])).toBe("estornada");
    expect(await custoAtual()).toBe(1_800);
    // estornar de novo não grava custo
    const antes = await quantosCustos();
    expect(await valor<string>(dono, ESTORNO, [a.id, "De novo"])).toBe("ja_estornada");
    expect(await quantosCustos()).toBe(antes);
  });

  it("se outra coisa definiu o custo depois, nada muda; a entrada mais nova com o mesmo custo segura o valor; a mais velha estornada não mexe", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    // a correção depois da entrada: o estorno da entrada não mexe no custo corrigido
    const a = await compra(dono, 2_000);
    expect(await valor<boolean>(dono, CORRIGIR, [cat.capa, 2_100, "Desconto na nota"])).toBe(true);
    let antes = await quantosCustos();
    await valor(dono, ESTORNO, [a.id, "Nota errada"]);
    expect([await custoAtual(), await quantosCustos()]).toEqual([2_100, antes]);
    // duas compras com o mesmo custo (a segunda não grava custo novo): estornar a primeira não muda; a segunda, sim
    const b = await compra(dono, 2_400);
    const c = await compra(dono, 2_400);
    antes = await quantosCustos();
    await valor(dono, ESTORNO, [b.id, "Lançada em dobro"]);
    expect([await custoAtual(), await quantosCustos()]).toEqual([2_400, antes]);
    await valor(dono, ESTORNO, [c.id, "Devolvida ao fornecedor"]);
    expect(await custoAtual()).toBe(2_100);
    // a compra mais velha estornada depois de uma mais nova: o custo da mais nova fica
    const d = await compra(dono, 2_600);
    await compra(dono, 2_700);
    antes = await quantosCustos();
    await valor(dono, ESTORNO, [d.id, "Nota errada"]);
    expect([await custoAtual(), await quantosCustos()]).toEqual([2_700, antes]);
  });

  it("sem custo anterior, o custo da entrada estornada fica (não há para onde voltar)", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const variante = "00000000-0000-4000-9000-00000000c0a1";
    await db.query("insert into public.variantes (id, organizacao_id, produto_id, sku, nome) values ($1, $2, $3, 'ACE-0099', 'Película nova')", [variante, ids.organizacao, cat.produtoCapa]);
    const e = await valor<{ id: string }>(dono, ENTRADA, [ids.lojaA, "compra", await doFornecedor(dono), "NF 2", JSON.stringify([{ variante, quantidade: 3, custo: 900 }]), chave(), "Primeira compra"]);
    expect(await custoAtual(variante)).toBe(900);
    await valor(dono, ESTORNO, [e.id, "Nota errada"]);
    expect([await custoAtual(variante), await quantosCustos(variante)]).toEqual([900, 1]);
  });
});

describe("a correção do custo com motivo (CAT-008b)", () => {
  it("o dono e o administrador corrigem, com o motivo na auditoria; o mesmo valor não grava; a venda já feita não muda", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await valor<boolean>(dono, CORRIGIR, [cat.capa, 2_050, "  Nota com desconto  "])).toBe(true);
    expect(await ultimoCusto()).toEqual({ valor: 2_050, origem: "correcao", referencia: "Nota com desconto" });
    const auditado = await db.query<{ motivo: string; usuario_id: string; organizacao_id: string; unidade_id: string | null }>(
      "select motivo, usuario_id, organizacao_id, unidade_id from public.auditoria where alvo_tipo = 'custos' order by id desc limit 1");
    expect(auditado.rows[0]).toEqual({ motivo: "Correção do custo: Nota com desconto", usuario_id: ids.dono, organizacao_id: ids.organizacao, unidade_id: null });
    const antes = await quantosCustos();
    expect(await valor<boolean>(dono, CORRIGIR, [cat.capa, 2_050, "De novo"])).toBe(false);
    expect(await quantosCustos()).toBe(antes);
    const admin = await naLoja(ids.administrador, ids.lojaB);
    expect(await valor<boolean>(admin, CORRIGIR, [cat.aparelho, 0, "Aparelho de brinde do fornecedor"])).toBe(true);
    expect(await custoAtual(cat.aparelho)).toBe(0);
    // o custo das vendas fica na própria venda (venda_itens_custos): a correção grava só um custo novo
    expect((await db.query("select 1 from public.venda_itens_custos")).rows.length).toBe(0);
  });

  it("valor e motivo conferidos; o vendedor, o gerente (custo só na loja), outra rede e o visitante não corrigem", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const antes = await quantosCustos();
    for (const v of [-1, 100_000_001, null]) expect(await recusa(dono, CORRIGIR, [cat.capa, v, "Tentativa"]), String(v)).toBe("22023: Custo inválido: de R$ 0,00 a R$ 1.000.000,00");
    expect(await recusa(dono, CORRIGIR, [cat.capa, 2_000, "x"])).toBe("22023: Informe o motivo");
    expect(await recusa(dono, CORRIGIR, [cat.capa, 2_000, "y".repeat(301)])).toBe("22023: O motivo tem até 300 letras");
    expect(await recusa(dono, CORRIGIR, ["00000000-0000-4000-8000-00000000dead", 2_000, "Tentativa"])).toBe("P0002: Variação não encontrada para você");
    for (const [usuario, loja] of [[ids.vendedorA, ids.lojaA], [ids.gerenteB, ids.lojaB]] as const) {
      expect(await recusa(await naLoja(usuario, loja), CORRIGIR, [cat.capa, 2_000, "Tentativa"]), usuario).toBe("P0002: Variação não encontrada para você");
    }
    const outraRede = { usuario: ids.donoOutraOrg, sessao: "7b000000-0000-4000-8000-0000000009ff" };
    await comoUsuario(db, outraRede, () => db.query("select 1"));
    expect(await recusa(outraRede, CORRIGIR, [cat.capa, 2_000, "Tentativa"])).toBe("P0002: Variação não encontrada para você");
    expect(await recusa(null, CORRIGIR, [cat.capa, 2_000, "Tentativa"])).toMatch(/^42501/);
    expect(await quantosCustos()).toBe(antes);
  });

  it("a auditoria do custo só aparece para quem vê custo na rede", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, CORRIGIR, [cat.capa, 2_050, "Nota com desconto"]);
    const lidos = async (s: Sessao) => comoUsuario(db, s, async () => (await db.query<{ custos: number; outros: number }>(
      "select count(*) filter (where alvo_tipo = 'custos')::int as custos, count(*) filter (where alvo_tipo <> 'custos' and unidade_id is null)::int as outros from public.auditoria")).rows[0], { criarSessao: false });
    const admin = await naLoja(ids.administrador, ids.lojaA);
    expect((await lidos(admin))?.custos).toBeGreaterThan(0);
    // o gerente lê a auditoria da loja dele; o custo é da rede
    expect((await lidos(await naLoja(ids.gerenteB, ids.lojaB)))?.custos).toBe(0);
    // um administrador sem custo.ver (nenhum papel padrão é assim) continua lendo a auditoria da rede, sem os custos
    await db.query("delete from public.papel_permissoes where papel = 'administrador' and permissao = 'custo.ver'");
    const semCusto = await lidos(admin);
    expect(semCusto?.custos).toBe(0);
    expect(semCusto?.outros).toBeGreaterThan(0);
  });
});
