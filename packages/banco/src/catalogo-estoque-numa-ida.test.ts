// Lote VEL-d (19/11/2026; ORA-QUAL-010; migration do Catálogo e do Estoque numa ida): as leituras únicas devolvem
// exatamente o que as leituras de antes devolviam, para a mesma pessoa e com o mesmo RLS. Dados FICTÍCIOS; cada teste numa
// transação desfeita.
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
  await db.query("select privado.lancar_movimento($1, $2, 7, 'entrada_importacao', null, null, null, null, 'vel-d:capaA')", [ids.lojaA, cat.capa]);
  await db.query("select privado.lancar_movimento($1, $2, 3, 'entrada_importacao', null, null, null, null, 'vel-d:capaB')", [ids.lojaB, cat.capa]);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4f000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const linhas = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows, { criarSessao: false });
const ordenar = <T>(xs: T[], chave: (x: T) => string) => [...xs].sort((a, b) => chave(a).localeCompare(chave(b)));
const saldoDaCapa = async (unidade: string) =>
  Number((await db.query<{ q: number }>("select quantidade as q from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, cat.capa])).rows[0]?.q);

type Catalogo = {
  pendencias: { produto_id: string; variante_id: string | null; sku: string | null; nome: string; motivo: string }[];
  produtos: { id: string; nome: string; tipo: string; organizacao_id: string }[];
  mais: boolean;
  variantes: { id: string; produto_id: string; sku: string; nome: string; cor: string | null }[];
  fotos: { id: string; produto_id: string; variante_id: string | null; caminho: string; ilustracao: boolean }[];
  saldos: { variante_id: string; quantidade: number; reservado: number }[];
};
const CATALOGO = "select public.catalogo_tela($1::uuid[], $2, $3) as v";
const LISTA = "select public.estoque_lista($1, $2) as v";

describe("o Catálogo numa ida (VEL-d)", () => {
  it("devolve o mesmo que as leituras de antes, para a mesma pessoa: produtos ativos, variações, fotos e os saldos da loja do turno", async () => {
    // Uma foto em uso da capa e uma já substituída (essa não aparece).
    await db.query(`insert into public.fotos_produto (organizacao_id, produto_id, variante_id, caminho, largura, altura, bytes, tipo, substituida_em) values
      ($1, $2, null, $3, 800, 800, 1000, 'image/webp', null), ($1, $2, null, $4, 800, 800, 1000, 'image/webp', now())`,
      [ids.organizacao, cat.produtoCapa, `${ids.organizacao}/${cat.produtoCapa}/produto/vel-d-1.webp`, `${ids.organizacao}/${cat.produtoCapa}/produto/vel-d-0.webp`]);
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const r = await valor<Catalogo>(vendedor, CATALOGO, [null, false, 200]);
    const antes = {
      pendencias: await linhas<Catalogo["pendencias"][number]>(vendedor, "select produto_id, variante_id, sku, nome, motivo from public.pendencias_de_foto()"),
      produtos: await linhas<Catalogo["produtos"][number]>(vendedor, "select id, nome, tipo, organizacao_id from public.produtos where ativo order by nome, id"),
      variantes: await linhas<Catalogo["variantes"][number]>(vendedor, "select id, produto_id, sku, nome, cor from public.variantes where ativa order by sku, id"),
      saldos: await linhas<Catalogo["saldos"][number]>(vendedor, "select variante_id, quantidade, reservado from public.estoque_saldos where unidade_id = $1 order by variante_id", [ids.lojaA]),
    };
    expect(r.produtos).toEqual(antes.produtos);
    expect(r.mais).toBe(false);
    expect(ordenar(r.variantes, (v) => v.id)).toEqual(ordenar(antes.variantes, (v) => v.id));
    expect(r.saldos).toEqual(antes.saldos);
    expect(r.saldos.find((s) => s.variante_id === cat.capa)?.quantidade).toBe(await saldoDaCapa(ids.lojaA));
    expect(ordenar(r.pendencias, (p) => `${p.produto_id}${p.variante_id}`)).toEqual(ordenar(antes.pendencias, (p) => `${p.produto_id}${p.variante_id}`));
    const fotosAntes = await linhas<Catalogo["fotos"][number]>(vendedor, "select id, produto_id, variante_id, caminho, ilustracao from public.fotos_produto where substituida_em is null order by id");
    expect(r.fotos).toEqual(fotosAntes);
    expect(r.fotos.map((f) => f.caminho)).toEqual([`${ids.organizacao}/${cat.produtoCapa}/produto/vel-d-1.webp`]);
  });

  it("os achados pela busca, só os pendentes de foto, o limite e o \"há mais\"", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const busca = await valor<Catalogo>(dono, CATALOGO, [[cat.produtoCapa, cat.produtoAparelho], false, 200]);
    expect(busca.produtos.map((p) => p.id).sort()).toEqual([cat.produtoAparelho, cat.produtoCapa].sort());
    expect(new Set(busca.variantes.map((v) => v.produto_id))).toEqual(new Set([cat.produtoAparelho, cat.produtoCapa]));
    const pendentes = await valor<Catalogo>(dono, CATALOGO, [null, true, 200]);
    expect(pendentes.produtos.every((p) => pendentes.pendencias.some((x) => x.produto_id === p.id))).toBe(true);
    const um = await valor<Catalogo>(dono, CATALOGO, [null, false, 1]);
    expect(um.produtos).toHaveLength(1);
    expect(um.mais).toBe(true);
    // A loja do turno manda nos saldos: na loja B, o saldo da capa é o da loja B.
    const naB = await valor<Catalogo>(await naLoja(ids.dono, ids.lojaB), CATALOGO, [null, false, 200]);
    expect(naB.saldos.find((s) => s.variante_id === cat.capa)?.quantidade).toBe(await saldoDaCapa(ids.lojaB));
    expect(await saldoDaCapa(ids.lojaB)).not.toBe(await saldoDaCapa(ids.lojaA));
  });

  it("a outra rede não vê nada desta (o RLS de quem chama)", async () => {
    const outra = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    const r = await valor<Catalogo>(outra, CATALOGO, [[cat.produtoCapa], false, 200]);
    expect(r.produtos).toEqual([]);
    expect(r.variantes).toEqual([]);
    expect(r.saldos).toEqual([]);
    expect(r.pendencias.some((p) => p.produto_id === cat.produtoCapa)).toBe(false);
  });
});

type Lista = { total: number; pagina: number; linhas: { id: string; nome: string; sku: string; estoque_minimo: number; produto_id: string; quantidade: number; reservado: number }[]; fotos: unknown[] };

describe("a lista do Estoque numa ida (VEL-d)", () => {
  it("o total e a página são os de antes (as variações com saldo na loja do turno, em ordem de nome)", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const r = await valor<Lista>(vendedor, LISTA, [1, 50]);
    const antes = await linhas<Lista["linhas"][number]>(vendedor,
      `select v.id, v.nome, v.sku, v.estoque_minimo, v.produto_id, s.quantidade, s.reservado
       from public.variantes v join public.estoque_saldos s on s.variante_id = v.id and s.unidade_id = $1 order by v.nome, v.id`, [ids.lojaA]);
    expect(r.total).toBe(antes.length);
    expect(r.pagina).toBe(1);
    expect(r.linhas).toEqual(antes);
    expect(r.linhas.find((l) => l.id === cat.capa)?.quantidade).toBe(await saldoDaCapa(ids.lojaA));
  });

  it("a página além da última vira a última; o tamanho da página tem teto", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const tudo = await valor<Lista>(vendedor, LISTA, [1, 50]);
    const porUm = await valor<Lista>(vendedor, LISTA, [999, 1]);
    expect(porUm.pagina).toBe(tudo.total);
    expect(porUm.linhas).toEqual(tudo.linhas.slice(-1));
    expect((await valor<Lista>(vendedor, LISTA, [0, 100_000])).linhas).toHaveLength(Math.min(tudo.total, 500));
  });

  it("a outra rede não vê o estoque desta", async () => {
    const outra = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    const r = await valor<Lista>(outra, LISTA, [1, 50]);
    expect(r.linhas.some((l) => l.id === cat.capa)).toBe(false);
  });
});
