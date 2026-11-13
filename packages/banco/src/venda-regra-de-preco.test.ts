// A regra de preço aplicada em cada item da venda (lote L6b: ORA-POS-014, em parte). O item guarda QUAL
// linha de public.precos deu o valor: a campanha, o preço da loja ou o da rede. A escolha é a mesma de
// preco_vigente (L3b), que passa a ler da mesma função. Banco em memória com todas as migrations; dados
// FICTÍCIOS. Cada teste numa transação desfeita.
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
const chave = (prefixo = "l6b") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `77000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  return comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
}
const daqui = (horas: number) => new Date(Date.now() + horas * 3_600_000).toISOString();
const CAMPANHA = "select public.preco_campanha($1, $2, $3, $4, $5, $6, $7) as v";

/** Abre o caixa e uma venda na loja da sessão. */
async function vendaNova(s: Sessao) {
  await valor(s, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  return valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
}
/** Acessório pela quantidade; aparelho pelo item físico (IMEI). */
const adicionar = (s: Sessao, venda: string, variante: string, fisico: string | null = null) =>
  valor<string>(s, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda, variante, fisico, chave("item")]);
async function item(id: string) {
  return (await db.query<{ preco_id: string | null; preco: string; origem: string | null; unidade_id: string | null; motivo: string | null }>(
    `select i.preco_id, i.preco_unitario_centavos::text as preco, p.origem, p.unidade_id, p.motivo
     from public.venda_itens i left join public.precos p on p.id = i.preco_id where i.id = $1`, [id])).rows[0];
}
const linhaDePreco = async (variante: string, unidade: string | null) =>
  (await db.query<{ id: string }>("select id from public.precos where variante_id = $1 and unidade_id is not distinct from $2 and origem <> 'campanha'", [variante, unidade])).rows[0]?.id;

describe("venda: a regra de preço de cada item (L6b)", () => {
  it("o item guarda a linha que deu o valor: o preço da rede, o da loja e, com campanha, a campanha", async () => {
    // Loja A: só o preço da rede.
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const vendaA = await vendaNova(ana);
    expect(await item(await adicionar(ana, vendaA, cat.capa))).toEqual({ preco_id: await linhaDePreco(cat.capa, null), preco: "7900", origem: "importacao", unidade_id: null, motivo: null });
    // Loja B: o aparelho tem preço próprio, que vale antes do da rede.
    const bia = await naLoja(ids.vendedorAB, ids.lojaB);
    const vendaB = await vendaNova(bia);
    expect(await item(await adicionar(bia, vendaB, cat.aparelho, itens.b1))).toMatchObject({ preco_id: await linhaDePreco(cat.aparelho, ids.lojaB), preco: "139900", origem: "manual", unidade_id: ids.lojaB });
    // Campanha da loja A para a capa: vale antes do preço base, e o item diz qual campanha.
    const dono = await naLoja(ids.dono, ids.lojaA);
    const campanha = await valor<{ id: string }>(dono, CAMPANHA, [cat.capa, ids.lojaA, "loja", 6_900, null, daqui(24), "Semana da capa"]);
    expect(await item(await adicionar(ana, vendaA, cat.capa))).toEqual({ preco_id: campanha.id, preco: "6900", origem: "campanha", unidade_id: ids.lojaA, motivo: "Semana da capa" });
    // A campanha da loja A não vale na loja B.
    expect(await item(await adicionar(bia, vendaB, cat.capa))).toMatchObject({ preco_id: await linhaDePreco(cat.capa, null), preco: "7900" });
  });

  it("encerrar a campanha depois não muda o item já vendido; o item seguinte volta ao preço base", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    // Uma campanha da rede que começou há uma hora (a tela só cria campanha de agora em diante).
    const campanha = (await db.query<{ id: string }>(
      "insert into public.precos (organizacao_id, variante_id, unidade_id, canal, valor_centavos, inicio, fim, origem, motivo) values ($1, $2, null, 'loja', 6500, now() - interval '1 hour', now() + interval '1 day', 'campanha', 'Queima de estoque') returning id",
      [ids.organizacao, cat.capa])).rows[0] as { id: string };
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const venda = await vendaNova(ana);
    const comCampanha = await adicionar(ana, venda, cat.capa);
    expect(await valor(dono, "select public.preco_cancelar($1, $2) as v", [campanha.id, "Acabou o estoque da promoção"])).toBe("encerrado");
    expect(await item(comCampanha)).toMatchObject({ preco_id: campanha.id, preco: "6500", origem: "campanha", motivo: "Queima de estoque" });
    expect(await item(await adicionar(ana, venda, cat.capa))).toMatchObject({ preco_id: await linhaDePreco(cat.capa, null), preco: "7900" });
  });

  it("preco_vigente segue a mesma regra: o valor da linha escolhida; loja fora do alcance de quem pergunta continua sem preço", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const vigente = (s: Sessao, variante: string, unidade: string) => valor<string | null>(s, "select public.preco_vigente($1, $2, 'loja', now())::text as v", [variante, unidade]);
    expect([await vigente(dono, cat.aparelho, ids.lojaA), await vigente(dono, cat.aparelho, ids.lojaB)]).toEqual(["149900", "139900"]);
    await valor(dono, CAMPANHA, [cat.aparelho, null, "loja", 129_900, null, daqui(24), "Black Friday"]);
    expect([await vigente(dono, cat.aparelho, ids.lojaA), await vigente(dono, cat.aparelho, ids.lojaB)]).toEqual(["129900", "129900"]);
    expect(await vigente(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), cat.aparelho, ids.lojaA)).toBeNull();
  });

  it("a função que escolhe a linha não é chamada de fora: só as funções do banco a usam", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const codigo = await comoUsuario(db, ana, async () => {
      await db.exec("savepoint fora");
      try {
        await db.query("select privado.preco_vigente_linha($1, $2)", [cat.capa, ids.lojaA]);
        return null;
      } catch (e) {
        return (e as { code?: string }).code ?? "sem-codigo";
      } finally {
        await db.exec("rollback to savepoint fora");
      }
    });
    expect(codigo).toBe("42501");
  });
});
