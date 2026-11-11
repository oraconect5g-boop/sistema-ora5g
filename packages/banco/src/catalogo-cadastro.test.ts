// Catálogo pela tela (lote L3a: ORA-CAT-001, ORA-CAT-005): categorias, marcas, produtos e variações
// cadastrados e editados com motivo e auditoria. Banco em memória com todas as migrations; dados
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
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
const sessao = (usuario: string): Sessao => ({ usuario, sessao: `67000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = sessao(usuario);
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
type Falha = { codigo: string; mensagem: string };
async function tentar<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<{ v: T } | Falha> {
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
  });
}
async function valor<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const codigo = async (s: Sessao | null, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

type Salvo = { id: string; repetida: boolean };
const CATEGORIA = "select public.catalogo_salvar_categoria($1, $2, $3, $4, $5) as v";
const MARCA = "select public.catalogo_salvar_marca($1, $2, $3, $4) as v";
const PRODUTO = "select public.catalogo_salvar_produto($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as v";
const VARIANTE = "select public.catalogo_salvar_variante($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as v";
const POLITICA = "select public.catalogo_definir_politica_desconto($1, $2, $3, $4) as v";
const novoProduto = (chave: string, nome = "Moto G35", tipo = "aparelho", categoria = cat.celulares) =>
  [ids.organizacao, null, tipo, nome, categoria, cat.marca, "XT2433", null, false, null, chave, "Produto novo na rede"];
const novaVariante = (produto: string, sku: string, nome = "Moto G35 128 GB Verde", codigoBarras: string | null = null) =>
  [produto, null, sku, nome, "Verde", "128 GB", codigoBarras, 1, null, "Variação nova"];
const auditoria = async (alvoTipo: string, alvo: string) =>
  (await db.query<{ acao: string; motivo: string | null; usuario_id: string | null }>(
    "select acao, motivo, usuario_id from public.auditoria where alvo_tipo = $1 and alvo_id = $2 and usuario_id is not null order by id",
    [alvoTipo, alvo],
  )).rows;

describe("cadastro do catálogo (L3a)", () => {
  it("o dono cria categoria, marca, produto e variação com motivo; repetir devolve os mesmos, sem duplicar", async () => {
    const dono = sessao(ids.dono);
    const categoria = await valor<Salvo>(dono, CATEGORIA, [ids.organizacao, null, "  Tablets  ", null, "Linha nova"]);
    expect(categoria.repetida).toBe(false);
    expect(await valor<Salvo>(dono, CATEGORIA, [ids.organizacao, null, "tablets", null, "Linha nova"])).toEqual({ id: categoria.id, repetida: true });
    const marca = await valor<Salvo>(dono, MARCA, [ids.organizacao, null, "Motorola", "Marca nova"]);
    expect(await valor<Salvo>(dono, MARCA, [ids.organizacao, null, "MOTOROLA", "Marca nova"])).toEqual({ id: marca.id, repetida: true });

    const produto = await valor<Salvo>(dono, PRODUTO, novoProduto("form:produto:0001"));
    expect(await valor<Salvo>(dono, PRODUTO, novoProduto("form:produto:0001"))).toEqual({ id: produto.id, repetida: true });
    expect(await codigo(dono, PRODUTO, novoProduto("form:produto:0001", "Outro nome"))).toBe("OR004");

    const variante = await valor<Salvo>(dono, VARIANTE, novaVariante(produto.id, "MOT-G35-128-VD", undefined, "7891234567895"));
    expect(await valor<Salvo>(dono, VARIANTE, novaVariante(produto.id, "MOT-G35-128-VD", undefined, "7891234567895"))).toEqual({ id: variante.id, repetida: true });
    const { rows } = await db.query("select sku, nome, cor, capacidade, codigo_barras, estoque_minimo, ativa from public.variantes where id = $1", [variante.id]);
    expect(rows[0]).toEqual({ sku: "MOT-G35-128-VD", nome: "Moto G35 128 GB Verde", cor: "Verde", capacidade: "128 GB", codigo_barras: "7891234567895", estoque_minimo: 1, ativa: true });

    expect((await auditoria("categorias", categoria.id)).map((e) => [e.acao, e.motivo])).toEqual([["categorias.criado", "Linha nova"]]);
    expect((await auditoria("produtos", produto.id)).map((e) => [e.acao, e.motivo, e.usuario_id])).toEqual([["produtos.criado", "Produto novo na rede", ids.dono]]);
    expect((await auditoria("variantes", variante.id)).map((e) => e.acao)).toEqual(["variantes.criado"]);
  });

  it("regras: nome, tipo, categoria ativa e da rede, SKU, código de barras, cor e estoque mínimo", async () => {
    const dono = sessao(ids.dono);
    expect(await codigo(dono, CATEGORIA, [ids.organizacao, null, " ", null, "Sem nome"])).toBe("22023");
    expect(await codigo(dono, PRODUTO, [...novoProduto("form:produto:0002").slice(0, 2), "eletrodomestico", ...novoProduto("form:produto:0002").slice(3)])).toBe("22023");
    expect(await codigo(dono, PRODUTO, novoProduto("form:produto:0003", "Moto", "aparelho", cat.categoriaOutraOrg))).toBe("22023");
    expect(await codigo(dono, PRODUTO, novoProduto("curta"))).toBe("22023");
    const produto = await valor<Salvo>(dono, PRODUTO, novoProduto("form:produto:0004"));
    expect(await codigo(dono, VARIANTE, novaVariante(produto.id, "SKU COM ESPAÇO"))).toBe("22023");
    expect(await codigo(dono, VARIANTE, novaVariante(produto.id, "APA-0001"))).toBe("23505"); // SKU do cenário
    expect(await codigo(dono, VARIANTE, novaVariante(produto.id, "apa-0001"))).toBe("23505"); // sem diferença de maiúsculas
    expect(await codigo(dono, VARIANTE, novaVariante(produto.id, "MOT-1", "Moto", "7890000000011"))).toBe("23505"); // código de barras do cenário
    expect(await codigo(dono, VARIANTE, novaVariante(produto.id, "MOT-2", "Moto", "12345"))).toBe("22023");
    expect(await codigo(dono, VARIANTE, [produto.id, null, "MOT-3", "Moto", "x".repeat(41), null, null, 0, null, "Cor longa"])).toBe("22023");
    expect(await codigo(dono, VARIANTE, [produto.id, null, "MOT-4", "Moto", null, null, null, -1, null, "Mínimo negativo"])).toBe("22023");
    expect(await codigo(dono, VARIANTE, [produto.id, null, "MOT-5", "Moto", null, null, null, 0, null, "ok"])).toBe("22023"); // motivo curto
  });

  it("só quem tem catalogo.gerir na rede cadastra: administrador sim; vendedor, gerente e dono de outra rede não", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const outraRede = sessao(ids.donoOutraOrg);
    for (const s of [vendedor, gerente, outraRede]) {
      expect(await codigo(s, CATEGORIA, [ids.organizacao, null, "Invasão", null, "Tentativa"])).toBe("42501");
      expect(await codigo(s, MARCA, [ids.organizacao, null, "Invasão", "Tentativa"])).toBe("42501");
      expect(await codigo(s, PRODUTO, novoProduto("form:invasao:0001"))).toBe("42501");
      expect(await codigo(s, VARIANTE, novaVariante(cat.produtoAparelho, "INV-0001"))).toBe("P0002");
      expect(await codigo(s, POLITICA, [cat.celulares, 1000, 500, "Tentativa"])).toBe("P0002");
    }
    const admin = sessao(ids.administrador);
    expect((await valor<Salvo>(admin, MARCA, [ids.organizacao, null, "Xiaomi", "Marca nova"])).repetida).toBe(false);
    // Escrita direta continua fechada para todos.
    expect(await codigo(admin, "update public.produtos set nome = 'x' where id = $1", [cat.produtoAparelho])).toBe("42501");
  });

  it("o tipo do produto não muda; edição sem mudança não grava; a auditoria guarda antes e depois", async () => {
    const dono = sessao(ids.dono);
    const editar = (tipo: string, nome: string, ativo: boolean | null = null) =>
      [ids.organizacao, cat.produtoCapa, tipo, nome, cat.acessorios, null, null, null, false, ativo, null, "Ajuste de nome"];
    expect(await codigo(dono, PRODUTO, editar("aparelho", "Capa"))).toBe("22023");
    expect(await valor<Salvo>(dono, PRODUTO, editar("acessorio", "Capa de proteção"))).toEqual({ id: cat.produtoCapa, repetida: true });
    expect((await valor<Salvo>(dono, PRODUTO, editar("acessorio", "Capa de silicone"))).repetida).toBe(false);
    const { rows } = await db.query<{ antes: { nome: string }; depois: { nome: string } }>(
      "select antes, depois from public.auditoria where alvo_tipo = 'produtos' and alvo_id = $1 and acao = 'produtos.alterado'", [cat.produtoCapa]);
    expect([rows[0]?.antes.nome, rows[0]?.depois.nome]).toEqual(["Capa de proteção", "Capa de silicone"]);
  });

  it("SKU só muda enquanto a variação nunca foi usada; inativar exige estoque zerado e sem reserva (OR020)", async () => {
    const dono = sessao(ids.dono);
    // Aparelho e capa do cenário têm estoque e livro: SKU fixo e não inativam.
    expect(await codigo(dono, VARIANTE, [cat.produtoAparelho, cat.aparelho, "APA-9999", "Galaxy A15 128 GB Azul", null, null, "7890000000011", 0, null, "Troca de SKU"])).toBe("OR020");
    expect(await codigo(dono, VARIANTE, [cat.produtoCapa, cat.capa, "ACE-0001", "Capa de proteção", null, null, "7890000000028", 0, false, "Fim de linha"])).toBe("OR020");
    expect(await codigo(dono, PRODUTO, [ids.organizacao, cat.produtoCapa, "acessorio", "Capa de proteção", cat.acessorios, null, null, null, false, false, null, "Fim de linha"])).toBe("OR020");
    expect(await codigo(dono, CATEGORIA, [ids.organizacao, cat.acessorios, "Acessórios", false, "Fim da categoria"])).toBe("OR020");

    // Variação nova, nunca usada: o SKU pode ser corrigido e ela inativa.
    const produto = await valor<Salvo>(dono, PRODUTO, novoProduto("form:produto:0005"));
    const variante = await valor<Salvo>(dono, VARIANTE, novaVariante(produto.id, "MOT-G35-ERRADO"));
    const corrigir = (sku: string, ativa: boolean | null) => [produto.id, variante.id, sku, "Moto G35 128 GB Verde", "Verde", "128 GB", null, 1, ativa, "Correção do SKU"];
    expect((await valor<Salvo>(dono, VARIANTE, corrigir("MOT-G35-128-VD", null))).repetida).toBe(false);
    expect(await codigo(dono, VARIANTE, corrigir("APA-0001", null))).toBe("23505");
    expect((await valor<Salvo>(dono, VARIANTE, corrigir("MOT-G35-128-VD", false))).repetida).toBe(false);
    // Produto sem estoque inativa; a variação não volta enquanto o produto estiver inativo.
    expect((await valor<Salvo>(dono, PRODUTO, [ids.organizacao, produto.id, "aparelho", "Moto G35", cat.celulares, cat.marca, "XT2433", null, false, false, null, "Fora de linha"])).repetida).toBe(false);
    expect(await codigo(dono, VARIANTE, corrigir("MOT-G35-128-VD", true))).toBe("22023");
    expect(await codigo(dono, VARIANTE, novaVariante(produto.id, "MOT-G35-256"))).toBe("22023");
  });

  it("categoria: nome único sem diferença de maiúsculas; inativa só sem produto ativo", async () => {
    const dono = sessao(ids.dono);
    const nova = await valor<Salvo>(dono, CATEGORIA, [ids.organizacao, null, "Smartwatches", null, "Linha nova"]);
    expect(await codigo(dono, CATEGORIA, [ids.organizacao, nova.id, "celulares", null, "Renomear"])).toBe("23505");
    expect((await valor<Salvo>(dono, CATEGORIA, [ids.organizacao, nova.id, "Relógios", false, "Sem produtos ainda"])).repetida).toBe(false);
    // Produto não entra em categoria inativa.
    expect(await codigo(dono, PRODUTO, novoProduto("form:produto:0006", "Relógio", "acessorio", nova.id))).toBe("22023");
  });

  it("política de desconto (P14): só quem altera preço; teto e margem juntos, de 0% a 100%; nulos desligam", async () => {
    const dono = sessao(ids.dono);
    const admin = sessao(ids.administrador);
    expect(await codigo(admin, POLITICA, [cat.celulares, 1000, 500, "Política de desconto"])).toBe("P0002");
    expect(await codigo(dono, POLITICA, [cat.celulares, 1000, null, "Só o teto"])).toBe("22023");
    expect(await codigo(dono, POLITICA, [cat.celulares, 10001, 500, "Teto acima de 100%"])).toBe("22023");
    expect(await valor<boolean>(dono, POLITICA, [cat.celulares, 1000, 500, "Política definida pelo dono"])).toBe(true);
    expect(await valor<boolean>(dono, POLITICA, [cat.celulares, 1000, 500, "Política definida pelo dono"])).toBe(false);
    const { rows } = await db.query("select desconto_teto_pb, margem_minima_pb from public.categorias where id = $1", [cat.celulares]);
    expect(rows[0]).toEqual({ desconto_teto_pb: 1000, margem_minima_pb: 500 });
    expect(await valor<boolean>(dono, POLITICA, [cat.celulares, null, null, "Desliga até decidir"])).toBe(true);
    expect((await auditoria("categorias", cat.celulares)).map((e) => e.motivo)).toEqual(["Política definida pelo dono", "Desliga até decidir"]);
  });
});
