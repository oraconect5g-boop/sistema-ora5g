// Lote TRF-a (17/11/2026; plano do proprietário de 16/11, Onda 1, item 5; ORA-INV-007, #60; migration
// 20261117165326_transferencia_remessa): a remessa, com vários produtos pedidos de uma vez entre as mesmas duas lojas.
// Cada produto é uma transferência, com o próprio caminho (separar, enviar, receber); a remessa as agrupa e a origem
// envia de uma vez as que já foram separadas. Banco em memória com todas as migrations; dados FICTÍCIOS.
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
const chave = (prefixo: string) => `${prefixo}:${++chaves}`;
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
  const s = { usuario, sessao: `4f000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

type Remessa = { remessa: string; numero: number; repetida: boolean; transferencias: string[] };
const PEDIR = "select public.transferencia_solicitar_remessa($1, $2, $3::jsonb, $4, $5) as v";
const pedir = (s: Sessao, origem: string, destino: string, linhas: { variante: string; quantidade: number }[], k = chave("r"), motivo = "Reposição da semana") =>
  valor<Remessa>(s, PEDIR, [origem, destino, JSON.stringify(linhas), motivo, k]);
const ENVIAR = "select public.transferencia_remessa_enviar($1) as v";
const separar = (s: Sessao, t: string, lista: string[] = []) => valor<string>(s, "select public.transferencia_separar($1, $2::uuid[]) as v", [t, lista]);
const receber = (s: Sessao, t: string, lidos: string[], quantidade: number | null) =>
  valor<string>(s, "select public.transferencia_receber($1, $2::text[], $3, $4) as v", [t, lidos, quantidade, null]);
const situacoes = async (remessa: string) =>
  (await db.query<{ variante_id: string; quantidade: number; situacao: string; chave: string }>(
    "select variante_id, quantidade, situacao, chave from public.transferencias where remessa_id = $1 order by numero", [remessa])).rows;
const imeiDe = async (item: string) => (await db.query<{ imei: string }>("select imei from public.itens_serializados where id = $1", [item])).rows[0]?.imei ?? "";

describe("a remessa: vários produtos pedidos de uma vez (TRF-a)", () => {
  it("cada produto vira uma transferência da remessa, com o próprio caminho até o recebimento; a mesma chave devolve a mesma remessa", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const k = chave("r");
    const linhas = [{ variante: cat.capa, quantidade: 2 }, { variante: cat.aparelho, quantidade: 1 }];
    const r = await pedir(pedinte, ids.lojaA, ids.lojaB, linhas, k);
    expect(r).toMatchObject({ repetida: false });
    expect(r.transferencias).toHaveLength(2);
    expect(await situacoes(r.remessa)).toEqual([
      { variante_id: cat.capa, quantidade: 2, situacao: "solicitada", chave: `${k}:1` },
      { variante_id: cat.aparelho, quantidade: 1, situacao: "solicitada", chave: `${k}:2` },
    ]);
    // Repetir com a mesma chave devolve a mesma remessa; com outro conteúdo, OR004.
    expect(await pedir(pedinte, ids.lojaA, ids.lojaB, linhas, k)).toEqual({ ...r, repetida: true });
    expect(await errou(pedinte, PEDIR, [ids.lojaA, ids.lojaB, JSON.stringify([{ variante: cat.capa, quantidade: 3 }]), "Reposição da semana", k])).toBe("OR004");

    const [tCapa, tAparelho] = r.transferencias as [string, string];
    expect(await separar(origem, tCapa)).toBe("separada");
    expect(await separar(origem, tAparelho, [itens.a1])).toBe("separada");
    expect(await valor(origem, ENVIAR, [r.remessa])).toEqual({ enviadas: 2, a_separar: 0 });
    expect((await situacoes(r.remessa)).map((t) => t.situacao)).toEqual(["enviada", "enviada"]);
    // Repetir o envio não envia de novo.
    expect(await valor(origem, ENVIAR, [r.remessa])).toEqual({ enviadas: 0, a_separar: 0 });
    expect(await receber(pedinte, tCapa, [], 2)).toBe("recebida");
    expect(await receber(pedinte, tAparelho, [await imeiDe(itens.a1)], null)).toBe("recebida");
  });

  it("enviar a remessa manda só as separadas; as outras esperam; só a loja de origem envia", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const r = await pedir(pedinte, ids.lojaA, ids.lojaB, [{ variante: cat.capa, quantidade: 1 }, { variante: cat.aparelho, quantidade: 1 }]);
    await separar(origem, r.transferencias[0] as string);
    expect(await errou(pedinte, ENVIAR, [r.remessa])).toBe("42501");
    expect(await valor(origem, ENVIAR, [r.remessa])).toEqual({ enviadas: 1, a_separar: 1 });
    expect((await situacoes(r.remessa)).map((t) => t.situacao)).toEqual(["enviada", "solicitada"]);
    // Remessa que não existe: a mesma recusa, sem dizer se existe.
    expect(await errou(origem, ENVIAR, ["4f000000-0000-4000-8000-00000000ffff"])).toBe("42501");
  });

  it("as regras: de 1 a 30 produtos, cada um uma vez, quantidade de 1 a 9.999, duas lojas da rede e a pessoa numa delas", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const tentar = (linhas: unknown, origem: string = ids.lojaA, destino: string = ids.lojaB, motivo = "Reposição da semana") =>
      errou(pedinte, PEDIR, [origem, destino, JSON.stringify(linhas), motivo, chave("r")]);
    expect(await tentar([])).toBe("22023");
    expect(await tentar(Array.from({ length: 31 }, () => ({ variante: cat.capa, quantidade: 1 })))).toBe("22023");
    expect(await tentar([{ variante: cat.capa, quantidade: 1 }, { variante: cat.capa, quantidade: 2 }])).toBe("22023");
    expect(await tentar([{ variante: cat.capa, quantidade: 0 }])).toBe("22023");
    expect(await tentar([{ variante: cat.capa, quantidade: "muitos" }])).toBe("22023");
    expect(await tentar([{ variante: "não é um produto", quantidade: 1 }])).toBe("22023");
    expect(await tentar([{ variante: cat.recarga, quantidade: 1 }])).toBe("22023");
    expect(await tentar([{ variante: cat.capa, quantidade: 1 }], ids.lojaB, ids.lojaB)).toBe("22023");
    expect(await tentar([{ variante: cat.capa, quantidade: 1 }], ids.lojaA, ids.lojaB, "ok")).toBe("22023");
    // Quem não está na origem nem no destino não pede.
    const deFora = await naLoja(ids.dono, ids.lojaC);
    expect(await errou(deFora, PEDIR, [ids.lojaA, ids.lojaB, JSON.stringify([{ variante: cat.capa, quantidade: 1 }]), "Reposição da semana", chave("r")])).toBe("42501");
    // Nada ficou gravado pelas tentativas recusadas.
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.transferencia_remessas")).rows[0]?.n).toBe(0);
  });

  it("a leitura: as lojas envolvidas leem a remessa; outra rede não", async () => {
    const r = await pedir(await naLoja(ids.gerenteB, ids.lojaB), ids.lojaA, ids.lojaB, [{ variante: cat.capa, quantidade: 1 }]);
    const ler = "select count(*)::int as v from public.transferencia_remessas where id = $1";
    expect(await valor<number>(await naLoja(ids.vendedorA, ids.lojaA), ler, [r.remessa])).toBe(1);
    expect(await valor<number>(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), ler, [r.remessa])).toBe(0);
  });
});
