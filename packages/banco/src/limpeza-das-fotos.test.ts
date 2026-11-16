// A limpeza das fotos enviadas sem registro (lote CAT-011b: ORA-CAT-011). O "envio" grava em storage.objects como o
// usuário logado (é o que a API do Storage faz); a política de apagar decide o que sai. Dados fictícios; cada teste numa
// transação desfeita.
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
async function naLoja(usuario: string, unidade: string | null): Promise<Sessao> {
  const s = { usuario, sessao: `4c000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  if (unidade) await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string; mensagem: string }> {
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
  if ("codigo" in r) throw new Error(`${sql.slice(0, 60)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const recusa = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

const LISTAR = "select public.fotos_sem_registro() as v";
const LIMPAR = "select public.fotos_sem_registro_limpar($1::text[]) as v";
const caminho = (org = ids.organizacao) => `${org}/${cat.produtoCapa}/produto/${randomUUID()}.webp`;
/** Um arquivo no Storage, enviado há tantas horas (gravado pelo banco do teste, como a API faria). */
async function arquivo(nome: string, horas: number, bytes = 50_000) {
  await db.query("insert into storage.objects (bucket_id, name, metadata, created_at) values ('produtos', $1, $2, now() - make_interval(hours => $3))",
    [nome, JSON.stringify({ size: bytes, mimetype: "image/webp" }), horas]);
}
/** Um arquivo já registrado como foto do produto (há tantas horas). */
async function registrada(gerente: Sessao, horas: number) {
  const nome = caminho();
  await arquivo(nome, 0);
  await valor(gerente, "select public.registrar_foto($1, null, $2, 1200, 1200, false) as v", [cat.produtoCapa, nome]);
  await db.query("update storage.objects set created_at = now() - make_interval(hours => $2) where name = $1", [nome, horas]);
  return nome;
}
type Lista = { quantos: number; bytes: number; arquivos: { caminho: string; bytes: number }[] };

describe("limpeza das fotos enviadas sem registro (CAT-011b)", () => {
  it("lista só os arquivos da rede sem foto registrada, enviados há mais de um dia; o mais antigo primeiro", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const velho = caminho();
    const maisVelho = caminho();
    await arquivo(velho, 30, 40_000);
    await arquivo(maisVelho, 72, 60_000);
    await arquivo(caminho(), 2);
    await registrada(gerente, 48);
    await arquivo(caminho(ids.outraOrganizacao), 48);
    expect(await valor<Lista>(gerente, LISTAR)).toEqual({
      quantos: 2, bytes: 100_000,
      arquivos: [expect.objectContaining({ caminho: maisVelho, bytes: 60_000 }), expect.objectContaining({ caminho: velho, bytes: 40_000 })],
    });
    // o dono da outra rede só vê os da rede dele; o vendedor (sem catalogo.fotos) é recusado
    const outraRede = { usuario: ids.donoOutraOrg, sessao: "4c000000-0000-4000-8000-0000000009ff" };
    await comoUsuario(db, outraRede, () => db.query("select 1"));
    expect((await valor<Lista>(outraRede, LISTAR)).quantos).toBe(1);
    expect(await recusa(await naLoja(ids.vendedorA, ids.lojaA), LISTAR)).toBe("42501");
  });

  it("limpar confere tudo de novo, tudo ou nada, e registra na auditoria quem, quantos e quais", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const soltos = [caminho(), caminho()];
    for (const c of soltos) await arquivo(c, 30);
    const novo = caminho();
    await arquivo(novo, 2);
    const comFoto = await registrada(gerente, 48);
    const deFora = caminho(ids.outraOrganizacao);
    await arquivo(deFora, 48);
    for (const pedido of [[...soltos, comFoto], [novo], [deFora], [caminho()]]) {
      expect(await recusa(gerente, LIMPAR, [pedido]), pedido.join()).toBe("P0002");
    }
    expect(await recusa(gerente, LIMPAR, [[]])).toBe("22023");
    expect(await recusa(gerente, LIMPAR, [Array.from({ length: 501 }, () => caminho())])).toBe("22023");
    expect(Number((await db.query<{ n: string }>("select count(*)::text as n from public.auditoria where acao = 'storage.fotos_sem_registro_limpeza_pedida'")).rows[0]?.n)).toBe(0);
    // repetido no pedido conta uma vez
    const r = await valor<{ caminhos: string[] }>(gerente, LIMPAR, [[...soltos, soltos[0]]]);
    expect(r.caminhos).toEqual([...soltos].sort());
    const auditoria = await db.query<{ usuario_id: string; organizacao_id: string; depois: { quantos: number; caminhos: string[] }; motivo: string }>(
      "select usuario_id, organizacao_id, depois, motivo from public.auditoria where acao = 'storage.fotos_sem_registro_limpeza_pedida'");
    expect(auditoria.rows).toEqual([{ usuario_id: ids.gerenteB, organizacao_id: ids.organizacao, depois: { quantos: 2, caminhos: [...soltos].sort() }, motivo: "Limpeza das fotos enviadas sem registro: separadas para apagar" }]);
    // #98: a separação fica gravada (o registro passa a recusar estes arquivos e o Storage passa a deixar apagá-los).
    expect((await db.query("select caminho, tentativas, removida_em from privado.fotos_em_limpeza order by caminho")).rows)
      .toEqual([...soltos].sort().map((c) => ({ caminho: c, tentativas: 1, removida_em: null })));
    expect(await recusa(await naLoja(ids.vendedorA, ids.lojaA), LIMPAR, [soltos])).toBe("42501");
  });

  it("a regra do Storage: quem envia fotos apaga só o arquivo separado da rede dele, sem registro e de mais de um dia", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const solto = caminho();
    await arquivo(solto, 30);
    const novo = caminho();
    await arquivo(novo, 2);
    const comFoto = await registrada(gerente, 48);
    const deFora = caminho(ids.outraOrganizacao);
    await arquivo(deFora, 48);
    const apagar = async (s: Sessao, nome: string) => comoUsuario(db, s, async () =>
      (await db.query("delete from storage.objects where bucket_id = 'produtos' and name = $1 returning name", [nome])).rows.length, { criarSessao: false });
    // o vendedor não apaga nada, nem o arquivo solto
    expect(await apagar(await naLoja(ids.vendedorA, ids.lojaA), solto)).toBe(0);
    expect([await apagar(gerente, comFoto), await apagar(gerente, novo), await apagar(gerente, deFora)]).toEqual([0, 0, 0]);
    // #98: sem a separação, nem o arquivo solto se apaga direto; separado, apaga.
    expect(await apagar(gerente, solto)).toBe(0);
    await valor(gerente, LIMPAR, [[solto]]);
    expect(await apagar(gerente, solto)).toBe(1);
    const restam = (await db.query<{ name: string }>("select name from storage.objects where bucket_id = 'produtos' order by name")).rows.map((l) => l.name);
    expect(restam).toEqual(expect.arrayContaining([comFoto, novo, deFora]));
    expect(restam).not.toContain(solto);
  });

  it("#98: o arquivo separado não vira foto; a conclusão confere o que saiu do Storage e o que ficou pendente; separar de novo tenta outra vez", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const [a, b] = [caminho(), caminho()];
    for (const c of [a, b]) await arquivo(c, 30);
    await valor(gerente, LIMPAR, [[a, b]]);
    // O registro de um arquivo separado é recusado (envie a foto de novo).
    expect(await tentar(gerente, "select public.registrar_foto($1, null, $2, 1200, 1200, false) as v", [cat.produtoCapa, a]))
      .toMatchObject({ codigo: "OR004", mensagem: expect.stringContaining("separado para a limpeza") });
    // O Storage apagou só o "a" (o "b" falhou na chamada HTTP): a conclusão marca o removido e devolve o pendente.
    await comoUsuario(db, gerente, () => db.query("delete from storage.objects where bucket_id = 'produtos' and name = $1", [a]), { criarSessao: false });
    const CONCLUIR = "select public.fotos_limpeza_concluir($1::text[]) as v";
    expect(await valor(gerente, CONCLUIR, [[a, b, caminho()]])).toEqual({ removidos: [a], pendentes: [b] });
    expect((await db.query("select caminho, removida_em is not null as removida from privado.fotos_em_limpeza order by caminho")).rows)
      .toEqual([{ caminho: a, removida: true }, { caminho: b, removida: false }].sort((x, y) => x.caminho.localeCompare(y.caminho)));
    expect((await db.query<{ depois: { caminhos: string[] }; motivo: string }>("select depois, motivo from public.auditoria where acao = 'storage.fotos_sem_registro_removidas'")).rows)
      .toEqual([{ depois: { quantos: 1, caminhos: [a] }, motivo: "Limpeza das fotos enviadas sem registro: conferido que o arquivo saiu do Storage" }]);
    // A nova tentativa: separar de novo o pendente conta mais uma tentativa; apagar e concluir fecham.
    await valor(gerente, LIMPAR, [[b]]);
    expect((await db.query("select tentativas from privado.fotos_em_limpeza where caminho = $1", [b])).rows).toEqual([{ tentativas: 2 }]);
    await comoUsuario(db, gerente, () => db.query("delete from storage.objects where bucket_id = 'produtos' and name = $1", [b]), { criarSessao: false });
    expect(await valor(gerente, CONCLUIR, [[b]])).toEqual({ removidos: [b], pendentes: [] });
    // Nada mais aberto para concluir: recusa (P0002), sem marcar de novo.
    expect(await recusa(gerente, CONCLUIR, [[b]])).toBe("P0002");
    // Quem não envia fotos não conclui; o pedido vazio ou grande demais é recusado.
    expect(await recusa(await naLoja(ids.vendedorA, ids.lojaA), CONCLUIR, [[b]])).toBe("42501");
    expect(await recusa(gerente, CONCLUIR, [[]])).toBe("22023");
  });
});
