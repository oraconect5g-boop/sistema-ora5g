// Lote MKT-a (17/11/2026, ORA-ONLINE-003 e ORA-META-002; migration 20261117190000_origem_das_reservas_do_site): a reserva
// do site guarda de onde o visitante chegou (a origem, os cinco parâmetros de campanha do link e o domínio do site que
// o mandou), limpa no banco; o painel dos Relatórios soma as reservas por origem e campanha, com as vendas concluídas
// que vieram delas, e por vendedor. Dados FICTÍCIOS; cada teste numa transação desfeita.
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
beforeEach(async () => {
  await db.exec("begin");
  await db.query("update public.produtos set publicar_online = true where id = any($1)", [[cat.produtoAparelho, cat.produtoCapa]]);
});
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
let telefones = 0;
const chave = (p: string) => `${p}:mkt:${String(++chaves).padStart(5, "0")}`;
const whatsapp = () => `4198765${String(++telefones).padStart(4, "0")}`;
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
  const s = { usuario, sessao: `4e000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const recusa = (s: Sessao | null, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });

type Reserva = { codigo: string };
/** O visitante, sem login: com a origem (7 parâmetros) ou sem ela (os 6 da versão anterior do site). */
async function reservar(origem?: unknown, k = chave("r"), variante = cat.capa): Promise<Reserva> {
  const sql = origem === undefined
    ? "select public.loja_reservar($1, $2, $3, 'Cliente do Site', $4, $5) as v"
    : "select public.loja_reservar($1, $2, $3, 'Cliente do Site', $4, $5, $6::jsonb) as v";
  const params = [ids.organizacao, variante, ids.lojaA, whatsapp(), k, ...(origem === undefined ? [] : [JSON.stringify(origem)])];
  return comoUsuario(db, null, async () => (await db.query<{ v: Reserva }>(sql, params)).rows[0]?.v as Reserva);
}
const ORIGEM = "select origem, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referencia from public.loja_reservas where codigo = $1";
const origemDe = async (codigo: string) => (await db.query<Record<string, string | null>>(ORIGEM, [codigo])).rows[0];
const VAZIA = { origem: null, utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null, referencia: null };

describe("a origem da reserva do site (MKT-a)", () => {
  it("guarda a origem, a campanha do link e o domínio, limpos; a chamada antiga, sem a origem, continua valendo", async () => {
    const r = await reservar({
      origem: "instagram", utm_source: "Instagram", utm_medium: "  paid \n social ", utm_campaign: "Natal\t2026",
      utm_content: "X".repeat(150), utm_term: 5, referencia: "L.Instagram.com", outro: "fica de fora",
    });
    expect(await origemDe(r.codigo)).toEqual({
      origem: "instagram", utm_source: "instagram", utm_medium: "paid social", utm_campaign: "natal 2026",
      utm_content: "x".repeat(100), utm_term: null, referencia: "l.instagram.com",
    });
    const antiga = await reservar();
    expect(await origemDe(antiga.codigo)).toEqual(VAZIA);
  });

  it("o que não serve fica vazio, e a reserva segue", async () => {
    const r = await reservar({ origem: "hacker", utm_source: "   ", utm_campaign: "\u0007\u001b", referencia: "https://exemplo.com/caminho" });
    expect(await origemDe(r.codigo)).toEqual(VAZIA);
    const lista = await reservar([{ origem: "google" }]);
    expect(await origemDe(lista.codigo)).toEqual(VAZIA);
    const direto = await reservar({ origem: "direto" });
    expect(await origemDe(direto.codigo)).toEqual({ ...VAZIA, origem: "direto" });
  });

  it("a mesma chave devolve a mesma reserva, com a origem da primeira vez", async () => {
    const k = chave("repetida");
    const sql = "select public.loja_reservar($1, $2, $3, 'Cliente do Site', '41987659999', $4, $5::jsonb) as v";
    const primeira = await comoUsuario(db, null, async () =>
      (await db.query<{ v: Reserva }>(sql, [ids.organizacao, cat.capa, ids.lojaA, k, JSON.stringify({ origem: "instagram", utm_campaign: "natal" })])).rows[0]?.v as Reserva);
    const segunda = await comoUsuario(db, null, async () =>
      (await db.query<{ v: Reserva }>(sql, [ids.organizacao, cat.capa, ids.lojaA, k, JSON.stringify({ origem: "google" })])).rows[0]?.v as Reserva);
    expect(segunda.codigo).toBe(primeira.codigo);
    expect(await origemDe(primeira.codigo)).toMatchObject({ origem: "instagram", utm_campaign: "natal" });
  });

  it("a tabela recusa a origem fora da lista, a campanha sem limpar e o domínio com caminho", async () => {
    const r = await reservar({ origem: "google" });
    const mudar = (coluna: string, novo: string) => erroDe(() => db.query(`update public.loja_reservas set ${coluna} = $1 where codigo = $2`, [novo, r.codigo]));
    expect(await mudar("origem", "outdoor")).toBe("23514");
    expect(await mudar("utm_source", "Google")).toBe("23514");
    expect(await mudar("utm_campaign", " natal")).toBe("23514");
    expect(await mudar("utm_term", "x".repeat(101))).toBe("23514");
    expect(await mudar("referencia", "exemplo.com/a")).toBe("23514");
    expect(await mudar("origem", "facebook")).toBeNull();
  });
});

describe("o painel das reservas do site (MKT-a)", () => {
  const PAINEL = "select public.reservas_do_site_painel(now() - interval '1 hour', now() + interval '1 hour') as v";
  type Painel = { origens: Record<string, unknown>[]; vendedores: Record<string, unknown>[] };

  it("soma por origem e campanha (reservas, atendidas, canceladas, vencidas, vendas concluídas) e por vendedor", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const natal = { origem: "instagram", utm_source: "instagram", utm_campaign: "natal" };
    const vendida = await reservar(natal);
    const cancelada = await reservar(natal);
    await reservar({ origem: "google" });
    const vencida = await reservar({ origem: "google" });
    await reservar();
    await db.query("update public.loja_reservas set expira_em = now() - interval '1 minute' where codigo = $1", [vencida.codigo]);
    const id = async (codigo: string) => (await db.query<{ id: string }>("select id from public.loja_reservas where codigo = $1", [codigo])).rows[0]?.id;

    await valor(ana, "select public.loja_reserva_cancelar($1, 'Cliente desistiu') as v", [await id(cancelada.codigo)]);
    const atendida = await valor<{ venda: string }>(ana, "select public.loja_reserva_atender($1, $2) as v", [await id(vendida.codigo), chave("atender")]);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    await valor(ana, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [atendida.venda, chave("concluir")]);

    const painel = await valor<Painel>(ana, PAINEL);
    expect(painel.origens).toEqual([
      { origem: "google", fonte: null, campanha: null, reservas: 2, atendidas: 0, canceladas: 0, vencidas: 1, vendas: 0, vendas_centavos: 0 },
      { origem: "instagram", fonte: "instagram", campanha: "natal", reservas: 2, atendidas: 1, canceladas: 1, vencidas: 0, vendas: 1, vendas_centavos: 7900 },
      { origem: "sem_registro", fonte: null, campanha: null, reservas: 1, atendidas: 0, canceladas: 0, vencidas: 0, vendas: 0, vendas_centavos: 0 },
    ]);
    expect(painel.vendedores).toEqual([{ vendedor_id: ids.vendedorA, vendas: 1, vendas_centavos: 7900 }]);
    // O filtro da loja: a Loja B não tem reserva.
    expect(await valor<Painel>(ana, "select public.reservas_do_site_painel(now() - interval '1 hour', now() + interval '1 hour', $1) as v", [ids.lojaB]))
      .toEqual({ origens: [], vendedores: [] });
  });

  it("cada um vê as lojas em que vende; o visitante não chama; o período tem regra", async () => {
    await reservar({ origem: "instagram" });
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await valor<Painel>(gerenteB, PAINEL)).toEqual({ origens: [], vendedores: [] });
    expect(await recusa(null, PAINEL)).toBe("42501");
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await recusa(ana, "select public.reservas_do_site_painel(now(), now()) as v")).toBe("22023");
    expect(await recusa(ana, "select public.reservas_do_site_painel(now() - interval '401 days', now()) as v")).toBe("22023");
  });
});
