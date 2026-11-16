// A reserva do site e a venda no balcão disputando os mesmos aparelhos, num PostgreSQL 17 de verdade (lote ONLINE-b;
// ORA-ONLINE-006: "pedido online concorrente com loja não vende unidade duplicada"; migration
// 20261115230000_loja_online_reserva). A reserva do site usa a mesma reserva de estoque do PDV, então:
//   * o site segura o aparelho e o balcão pede o mesmo: o balcão espera a trava e depois recebe OR002;
//   * o balcão segura o aparelho e o site pede o produto: o site pula a unidade presa, espera só o saldo (que o balcão
//     também trava) e fica com outra unidade livre;
//   * muitos ao mesmo tempo (visitantes e vendedores, cada um na sua conexão) disputando todos os aparelhos da loja:
//     cada unidade com uma reserva só, o saldo igual às reservas e nenhuma divergência no estoque.
// Dados FICTÍCIOS; o banco é descartado no fim.
import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { amrDaSenha, comDigitoLuhn } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";
import { executor, iniciarPostgresReal, type PostgresReal } from "./postgres-real";

const APARELHOS_A_MAIS = 6;
const VISITANTES = 3;

let servidor: PostgresReal;
let admin: pg.Client;
let a: pg.Client;
let b: pg.Client;
const extras: pg.Client[] = [];
const pid = new Map<pg.Client, number>();

beforeAll(async () => {
  servidor = await iniciarPostgresReal();
  admin = await servidor.conectar();
  await montarCenario(executor(admin));
  await montarCatalogo(executor(admin));
  await admin.query("update public.produtos set publicar_online = true where id = $1", [cat.produtoAparelho]);
  for (let i = 0; i < APARELHOS_A_MAIS; i++) {
    await admin.query("select privado.registrar_item_serializado($1, $2, $3, null, null, 'entrada_importacao', $4)",
      [ids.lojaA, cat.aparelho, comDigitoLuhn(`3520990027${String(i).padStart(4, "0")}`), `site-conc:a${i}`]);
  }
  for (const cliente of [(a = await servidor.conectar()), (b = await servidor.conectar())]) {
    pid.set(cliente, (await cliente.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid ?? 0);
  }
  for (let i = 0; i < VISITANTES + 3; i++) extras.push(await servidor.conectar());
}, 120_000);

// Um teste que falha no meio não deixa transação aberta (e travas) para o próximo.
afterEach(async () => { for (const cliente of [a, b]) await cliente.query("rollback").catch(() => {}); });

afterAll(async () => {
  for (const cliente of [a, b, admin, ...extras]) await cliente?.end().catch(() => {});
  await servidor?.parar();
});

let sessoes = 0;
let numeros = 0;
let chaves = 0;
type Sessao = { usuario: string; sessao: string };
const chave = (p: string) => `${p}:site-conc:${String(++chaves).padStart(5, "0")}`;
/** Um WhatsApp fictício novo a cada reserva (o limite de 2 por número não entra nesta disputa). */
const whatsapp = () => `4199${String(++numeros).padStart(7, "0")}`;

// A unidade da sessão é gravada antes (como no login), fora da disputa.
async function sessaoNaLoja(usuario: string): Promise<Sessao> {
  const sessao = { usuario, sessao: `4e000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [sessao.sessao, usuario]);
  await abrir(admin, sessao);
  await admin.query("select public.selecionar_unidade($1)", [ids.lojaA]);
  await admin.query("commit");
  return sessao;
}
/** Abre a transação: com sessão, como o vendedor logado; sem, como o visitante do site (papel anon). */
async function abrir(cliente: pg.Client, sessao?: Sessao) {
  await cliente.query("begin");
  if (sessao) {
    await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: sessao.usuario, session_id: sessao.sessao, role: "authenticated", amr: amrDaSenha() })]);
    await cliente.query("set local role authenticated");
  } else {
    await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    await cliente.query("set local role anon");
  }
}
async function esperarTrava(cliente: pg.Client) {
  for (let i = 0; i < 400; i++) {
    const { rows } = await admin.query<{ espera: string | null }>("select wait_event_type as espera from pg_stat_activity where pid = $1", [pid.get(cliente)]);
    if (rows[0]?.espera === "Lock") return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("a segunda conexão não ficou esperando a trava da primeira");
}
/** Uma chamada inteira (abre, chama, confirma; desfaz se der erro), como a API faz. */
async function chamada<T>(cliente: pg.Client, sessao: Sessao | undefined, sql: string, params: unknown[]): Promise<T> {
  await abrir(cliente, sessao);
  try {
    const r = await cliente.query<{ v: T }>(sql, params);
    await cliente.query("commit");
    return r.rows[0]?.v as T;
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    throw e;
  }
}

const RESERVAR_NO_SITE = "select public.loja_reservar($1, $2, $3, 'Cliente do Site', $4, $5) as v";
const RESERVAR_NO_BALCAO = "select public.reservar_estoque($1, 1, $2, $3) as v";
const reservarNoSite = (cliente: pg.Client) => cliente.query<{ v: { codigo: string } }>(RESERVAR_NO_SITE, [ids.organizacao, cat.aparelho, ids.lojaA, whatsapp(), chave("site")]);
const codigo = (e: unknown) => (e as { code?: string }).code ?? "sem-codigo";
const divergencias = async () => (await admin.query<{ regra: string }>("select regra from privado.divergencias_estoque()")).rows;
const livres = async () => (await admin.query<{ id: string }>(
  "select id from public.itens_serializados where unidade_id = $1 and variante_id = $2 and situacao = 'disponivel' and em_estoque order by criado_em, id",
  [ids.lojaA, cat.aparelho])).rows.map((r) => r.id);
const itemDoCodigo = async (c: string) => (await admin.query<{ item: string }>("select item_serializado_id as item from public.loja_reservas where codigo = $1", [c])).rows[0]?.item;
const reservasAtivasDo = async (item: string) =>
  (await admin.query<{ origem: string }>("select origem from public.estoque_reservas where item_serializado_id = $1 and situacao = 'ativa'", [item])).rows.map((r) => r.origem);

describe("o site e o balcão disputando o mesmo aparelho no PostgreSQL 17 (ONLINE-b)", () => {
  it("o site segura o aparelho; o balcão pede o mesmo, espera a trava e recebe OR002; a unidade fica com o site", async () => {
    const vendedor = await sessaoNaLoja(ids.vendedorA);
    const [primeiro] = await livres();
    await abrir(a);
    const site = await reservarNoSite(a);
    await abrir(b, vendedor);
    const balcao = b.query(RESERVAR_NO_BALCAO, [cat.aparelho, primeiro, chave("balcao")]).then(() => "ok", codigo);
    await esperarTrava(b);
    await a.query("commit");
    expect(await balcao).toBe("OR002");
    await b.query("rollback");
    expect(await itemDoCodigo(site.rows[0]?.v.codigo as string)).toBe(primeiro);
    expect(await reservasAtivasDo(primeiro as string)).toEqual(["online"]);
    expect(await divergencias()).toEqual([]);
  });

  it("o balcão segura o aparelho; o site pula a unidade presa, espera só o saldo e fica com outra unidade livre", async () => {
    const vendedor = await sessaoNaLoja(ids.vendedorAB);
    const [primeiro] = await livres();
    await abrir(a, vendedor);
    await a.query(RESERVAR_NO_BALCAO, [cat.aparelho, primeiro, chave("balcao")]);
    await abrir(b);
    const pedido = reservarNoSite(b);
    await esperarTrava(b);
    await a.query("commit");
    const site = await pedido;
    await b.query("commit");
    const doSite = await itemDoCodigo(site.rows[0]?.v.codigo as string);
    expect(doSite).toBeTruthy();
    expect(doSite).not.toBe(primeiro);
    expect([await reservasAtivasDo(primeiro as string), await reservasAtivasDo(doSite as string)]).toEqual([["pdv"], ["online"]]);
    expect(await divergencias()).toEqual([]);
  });

  it("muitos ao mesmo tempo: visitantes e vendedores disputando todos os aparelhos da loja; cada unidade com uma reserva só", async () => {
    const vendedores: Sessao[] = [];
    for (const usuario of [ids.vendedorA, ids.vendedorAB, ids.dono]) vendedores.push(await sessaoNaLoja(usuario));
    const disputados = await livres();
    expect(disputados.length).toBeGreaterThanOrEqual(4);
    const noSite: string[] = [];
    const noBalcao: string[] = [];
    const recusas: string[] = [];
    await Promise.all([
      // Cada visitante reserva até o site dizer que acabou (OR001); qualquer outra recusa também para (e falha abaixo).
      ...extras.slice(0, VISITANTES).map(async (cliente) => {
        for (let tentativa = 0; tentativa <= disputados.length; tentativa++) {
          try {
            const r = await chamada<{ codigo: string }>(cliente, undefined, RESERVAR_NO_SITE, [ids.organizacao, cat.aparelho, ids.lojaA, whatsapp(), chave("site")]);
            noSite.push(r.codigo);
          } catch (e) {
            recusas.push(codigo(e));
            return;
          }
        }
      }),
      // Cada vendedor tenta todos os aparelhos, cada um começando de um ponto da lista.
      ...vendedores.map(async (vendedor, n) => {
        const cliente = extras[VISITANTES + n] as pg.Client;
        for (let k = 0; k < disputados.length; k++) {
          const item = disputados[(n * 2 + k) % disputados.length] as string;
          try {
            await chamada(cliente, vendedor, RESERVAR_NO_BALCAO, [cat.aparelho, item, chave("balcao")]);
            noBalcao.push(item);
          } catch (e) {
            recusas.push(codigo(e));
          }
        }
      }),
    ]);

    // Todas as unidades foram reservadas, cada uma por um lado só; as recusas foram "acabou" (site) e "indisponível" (balcão).
    const itensDoSite = await Promise.all(noSite.map(itemDoCodigo));
    expect(new Set(itensDoSite).size).toBe(itensDoSite.length);
    expect(itensDoSite.filter((i) => noBalcao.includes(i as string))).toEqual([]);
    expect([...itensDoSite, ...noBalcao].sort()).toEqual([...disputados].sort());
    expect(new Set(recusas)).toEqual(new Set(["OR001", "OR002"]));
    for (const item of disputados) expect((await reservasAtivasDo(item)).length, item).toBe(1);
    const saldo = await admin.query<{ reservado: number; ativas: number }>(`
      select (select s.reservado from public.estoque_saldos s where s.unidade_id = $1 and s.variante_id = $2) as reservado,
             (select count(*)::int from public.estoque_reservas r where r.unidade_id = $1 and r.variante_id = $2 and r.situacao = 'ativa') as ativas`,
      [ids.lojaA, cat.aparelho]);
    expect(saldo.rows[0]?.reservado).toBe(saldo.rows[0]?.ativas);
    expect(await livres()).toEqual([]);
    expect(await divergencias()).toEqual([]);
  }, 120_000);
});
