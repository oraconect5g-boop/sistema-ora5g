// ORA-CAT-011 (#26): fotos dos produtos. O "envio" grava em storage.objects como o usuário logado
// (é o que a API do Storage faz); a política de RLS decide quem envia e quem vê. Dados fictícios;
// cada teste roda numa transação desfeita no fim.
import { randomUUID } from "node:crypto";

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
async function naLoja(usuario: string, unidade: string | null): Promise<Sessao> {
  const s = { usuario, sessao: `44000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  if (unidade) await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const como = <T = Record<string, unknown>>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

const caminho = (produto: string, variante: string | null = null, ext = "webp") => `${ids.organizacao}/${produto}/${variante ?? "produto"}/${randomUUID()}.${ext}`;
const ENVIAR = "insert into storage.objects (bucket_id, name, metadata) values ('produtos', $1, $2)";
const meta = (bytes = 120_000, tipo = "image/webp") => JSON.stringify({ size: bytes, mimetype: tipo });
const REGISTRAR = "select public.registrar_foto($1, $2, $3, 1200, 1200, $4) as id";

async function enviarERegistrar(s: Sessao, produto: string, variante: string | null = null, ilustracao = false) {
  const nome = caminho(produto, variante);
  await como(s, ENVIAR, [nome, meta()]);
  const [linha] = await como<{ id: string }>(s, REGISTRAR, [produto, variante, nome, ilustracao]);
  return { id: linha?.id ?? "", nome };
}

describe("fotos dos produtos (ORA-CAT-011)", () => {
  it("gerente envia a foto pelo Storage e registra; tamanho e tipo vêm do Storage; fica na auditoria", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const { id, nome } = await enviarERegistrar(gerente, cat.produtoAparelho);
    const { rows } = await db.query("select caminho, bytes, tipo, ilustracao, criado_por from public.fotos_produto where id = $1", [id]);
    expect(rows).toEqual([{ caminho: nome, bytes: 120_000, tipo: "image/webp", ilustracao: false, criado_por: ids.gerenteB }]);
    expect((await db.query("select 1 from public.auditoria where acao = 'fotos_produto.criado' and alvo_id = $1", [id])).rows).toHaveLength(1);
  });

  it("vendedor vê a foto e não envia; outra rede não vê nem envia; sem loja na sessão o gerente não envia", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const { nome } = await enviarERegistrar(gerente, cat.produtoAparelho);
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await como(vendedor, "select name from storage.objects where bucket_id = 'produtos'")).toEqual([{ name: nome }]);
    expect(await como(vendedor, "select caminho from public.fotos_produto")).toEqual([{ caminho: nome }]);
    expect(await errou(vendedor, ENVIAR, [caminho(cat.produtoCapa), meta()])).toBe("42501");

    const outraRede = await naLoja(ids.donoOutraOrg, null);
    expect(await como(outraRede, "select name from storage.objects")).toEqual([]);
    expect(await como(outraRede, "select id from public.fotos_produto")).toEqual([]);
    expect(await errou(outraRede, ENVIAR, [caminho(cat.produtoCapa), meta()])).toBe("42501");

    expect(await errou(await naLoja(ids.gerenteB, null), ENVIAR, [caminho(cat.produtoCapa), meta()])).toBe("42501");
  });

  it("trocar a foto guarda a anterior como substituída; só uma fica em uso", async () => {
    const dono = await naLoja(ids.dono, null);
    const primeira = await enviarERegistrar(dono, cat.produtoCapa);
    const segunda = await enviarERegistrar(dono, cat.produtoCapa);
    const { rows } = await db.query<{ id: string; em_uso: boolean }>(
      "select id, substituida_em is null as em_uso from public.fotos_produto where produto_id = $1 order by criado_em, em_uso", [cat.produtoCapa]);
    expect(rows.find((r) => r.id === primeira.id)?.em_uso).toBe(false);
    expect(rows.find((r) => r.id === segunda.id)?.em_uso).toBe(true);
  });

  it("recusa caminho fora do padrão ou de outro produto, arquivo que não chegou e ilustração em produto físico", async () => {
    const dono = await naLoja(ids.dono, null);
    const deOutro = caminho(cat.produtoCapa);
    await como(dono, ENVIAR, [deOutro, meta()]);
    expect(await errou(dono, REGISTRAR, [cat.produtoAparelho, null, deOutro, false])).toBe("22023");
    expect(await errou(dono, REGISTRAR, [cat.produtoAparelho, null, "../../etc/passwd", false])).toBe("22023");
    expect(await errou(dono, REGISTRAR, [cat.produtoAparelho, null, caminho(cat.produtoAparelho), false])).toBe("P0002");
    const fisico = caminho(cat.produtoAparelho);
    await como(dono, ENVIAR, [fisico, meta()]);
    expect(await errou(dono, REGISTRAR, [cat.produtoAparelho, null, fisico, true])).toBe("22023");
    expect(await errou(dono, REGISTRAR, [cat.produtoAparelho, cat.capa, caminho(cat.produtoAparelho, cat.capa), false])).toBe("22023");
  });

  it("pendências: produto sem foto aparece; recarga aceita ilustração; produto com duas cores pede foto de cada cor", async () => {
    const dono = await naLoja(ids.dono, null);
    const pendentes = async () => (await como<{ sku: string; motivo: string }>(dono, "select sku, motivo from public.pendencias_de_foto()")).map((p) => `${p.sku}:${p.motivo}`);
    expect(await pendentes()).toEqual(expect.arrayContaining(["APA-0001:produto sem foto", "REC-0001:produto sem foto"]));

    await enviarERegistrar(dono, cat.produtoAparelho);
    await enviarERegistrar(dono, cat.produtoRecarga, null, true);
    expect(await pendentes()).not.toContain("APA-0001:produto sem foto");
    expect(await pendentes()).not.toContain("REC-0001:produto sem foto");

    await db.query(`insert into public.variantes (organizacao_id, produto_id, sku, nome, cor) values
      ($1, $2, 'ACE-0101', 'Capa preta', 'Preta'), ($1, $2, 'ACE-0102', 'Capa azul', 'Azul')`, [ids.organizacao, cat.produtoCapa]);
    expect(await pendentes()).toEqual(expect.arrayContaining(["ACE-0101:cor sem foto própria", "ACE-0102:cor sem foto própria"]));
    const azul = (await db.query<{ id: string }>("select id from public.variantes where sku = 'ACE-0102'")).rows[0]?.id ?? "";
    await enviarERegistrar(dono, cat.produtoCapa, azul);
    expect(await pendentes()).not.toContain("ACE-0102:cor sem foto própria");
    expect(await pendentes()).toContain("ACE-0101:cor sem foto própria");
  });
});
