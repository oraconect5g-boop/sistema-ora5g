// Lote ONLINE-d (18/11/2026; ORA-ONLINE-002 e ORA-ONLINE-006; ADR-023; migration 20261118031404_pedido_do_site): o pedido do site
// com carrinho, reservado de uma vez para retirar e pagar na loja. Até 3 unidades numa loja; tudo ou nada; cada unidade é
// uma reserva do site ligada ao pedido, pela mesma regra da reserva avulsa. O pedido conta como um compromisso do WhatsApp.
// A loja atende o pedido numa venda só, ou cancela. Dados FICTÍCIOS; cada teste numa transação desfeita.
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
let chaves = 0;
const chave = (p: string) => `${p}:pedido:${String(++chaves).padStart(5, "0")}`;
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
type Pedido = { codigo: string; situacao: string; expira_em: string; total_centavos: number; unidades: number; itens: { produto: string; preco_centavos: number }[]; loja: { nome: string } };
const PEDIR = "select public.loja_pedir($1, $2, $3::jsonb, $4, $5, $6) as v";
const pedir = (itens: string[], loja: string = ids.lojaA, whatsapp = "41987650001", k = chave("p"), nome = "Cliente do Site") =>
  comoUsuario(db, null, async () => (await db.query<{ v: Pedido }>(PEDIR, [ids.organizacao, loja, JSON.stringify(itens.map((v) => ({ variante: v }))), nome, whatsapp, k])).rows[0]?.v as Pedido);
const recusaAoVisitante = (params: unknown[]) => comoUsuario(db, null, () => erroDe(() => db.query(PEDIR, params)));
const CONSULTAR = "select public.loja_pedido_consultar($1, $2, $3) as v";
const consultar = (codigo: string, whatsapp: string) =>
  comoUsuario(db, null, async () => (await db.query<{ v: Pedido | null }>(CONSULTAR, [ids.organizacao, codigo, whatsapp])).rows[0]?.v ?? null);
const comoLoja = <T>(s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const recusaALoja = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });
const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ quantidade: number; reservado: number }>("select quantidade, reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0];
const pedidoDoCodigo = async (codigo: string) =>
  (await db.query<Record<string, unknown>>("select * from public.loja_pedidos where codigo = $1", [codigo])).rows[0] as Record<string, unknown>;
const publicar = () => db.query("update public.produtos set publicar_online = true where id = any($1)", [[cat.produtoAparelho, cat.produtoCapa]]);

describe("o pedido pelo visitante (ONLINE-d)", () => {
  it("reserva o carrinho de uma vez: o código do pedido, o total do balcão, uma reserva por unidade; o WhatsApp só em privado", async () => {
    await publicar();
    const capaAntes = await saldo(ids.lojaA, cat.capa);
    const p = await pedir([cat.capa, cat.capa, cat.aparelho], ids.lojaA, "(41) 98765-0001");
    expect(p).toMatchObject({ situacao: "reservado", unidades: 3, total_centavos: 7_900 * 2 + 149_900, loja: { nome: "Loja A" } });
    expect(p.codigo).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(p.itens.map((i) => i.produto)).toEqual(["Capa de proteção", "Capa de proteção", "Galaxy A15"]);
    expect(JSON.stringify(p)).not.toContain("Cliente do Site");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: capaAntes?.quantidade, reservado: (capaAntes?.reservado ?? 0) + 2 });
    const linha = await pedidoDoCodigo(p.codigo);
    const reservas = (await db.query<{ situacao: string; pedido_id: string; item_serializado_id: string | null }>(
      "select situacao, pedido_id, item_serializado_id from public.loja_reservas where pedido_id = $1 order by numero", [linha.id])).rows;
    expect(reservas.map((r) => [r.situacao, r.item_serializado_id === null])).toEqual([["ativa", true], ["ativa", true], ["ativa", false]]);
    expect((await db.query("select whatsapp from privado.loja_pedidos_contato where pedido_id = $1", [linha.id])).rows).toEqual([{ whatsapp: "41987650001" }]);
    // O visitante acompanha pelo código e pelo WhatsApp; sem o par certo, nada.
    expect(await consultar(p.codigo, "41987650001")).toMatchObject({ codigo: p.codigo, situacao: "reservado", unidades: 3 });
    expect(await consultar(p.codigo, "41987650002")).toBeNull();
    expect(await consultar("AAAAAA", "41987650001")).toBeNull();
  });

  it("tudo ou nada: faltou uma unidade, nenhuma fica reservada (OR001); a mesma chave devolve o mesmo pedido", async () => {
    await publicar();
    const antes = await saldo(ids.lojaB, cat.capa);
    // A loja B tem 3 capas: um pedido de 3 passa; o de outras 3, não, e não deixa nada preso.
    expect(await recusaAoVisitante([ids.organizacao, ids.lojaB, JSON.stringify([{ variante: cat.capa }, { variante: cat.capa }, { variante: cat.capa }, { variante: cat.capa }]), "Cliente", "41987650003", chave("p")])).toBe("22023");
    const k = chave("p");
    const p = await pedir([cat.capa, cat.capa, cat.capa], ids.lojaB, "41987650003", k);
    expect(await pedir([cat.capa, cat.capa, cat.capa], ids.lojaB, "41987650003", k)).toMatchObject({ codigo: p.codigo });
    expect(await recusaAoVisitante([ids.organizacao, ids.lojaB, JSON.stringify([{ variante: cat.capa }]), "Outro nome", "41987650003", k])).toBe("OR004");
    expect(await recusaAoVisitante([ids.organizacao, ids.lojaB, JSON.stringify([{ variante: cat.capa }]), "Cliente", "41987650004", chave("p")])).toBe("OR001");
    expect(await saldo(ids.lojaB, cat.capa)).toEqual({ quantidade: antes?.quantidade, reservado: (antes?.reservado ?? 0) + 3 });
  });

  it("o WhatsApp: o pedido conta um compromisso, como a reserva avulsa; o terceiro é recusado (OR034)", async () => {
    await publicar();
    await pedir([cat.capa], ids.lojaA, "41987650005");
    await comoUsuario(db, null, () => db.query("select public.loja_reservar($1, $2, $3, 'Cliente', '41987650005', $4)", [ids.organizacao, cat.capa, ids.lojaA, chave("r")]));
    expect(await recusaAoVisitante([ids.organizacao, ids.lojaA, JSON.stringify([{ variante: cat.capa }]), "Cliente", "41987650005", chave("p")])).toBe("OR034");
  });

  it("recusa o produto fora do site, a loja que não vende, o item fora do formato e o carrinho vazio", async () => {
    await publicar();
    const base = (itens: unknown, loja: string = ids.lojaA) => [ids.organizacao, loja, JSON.stringify(itens), "Cliente", "41987650006", chave("p")];
    expect(await recusaAoVisitante(base([{ variante: cat.chip }]))).toBe("OR036");
    expect(await recusaAoVisitante(base([{ variante: cat.capa }], ids.online))).toBe("OR036");
    expect(await recusaAoVisitante(base([{ variante: "1 or 1=1" }]))).toBe("22023");
    expect(await recusaAoVisitante(base([]))).toBe("22023");
    // A loja sem o CNPJ da filial não vende (OR038, o gatilho da reserva de estoque): o pedido inteiro volta.
    await db.query("update public.unidades set cnpj = null where id = $1", [ids.lojaA]);
    const antes = await saldo(ids.lojaA, cat.capa);
    expect(await recusaAoVisitante(base([{ variante: cat.capa }]))).toBe("OR038");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual(antes);
    expect((await db.query("select count(*)::int as n from public.loja_pedidos")).rows).toEqual([{ n: 0 }]);
  });
});

describe("o pedido na loja (ONLINE-d)", () => {
  it("atende numa venda só, com todas as unidades; o total anunciado e o de hoje; repetir devolve a mesma venda; o pedido sai como atendido", async () => {
    await publicar();
    const p = await pedir([cat.capa, cat.aparelho], ids.lojaA, "41987650007");
    // Depois da reserva, a capa sobe na loja A: a oferta anunciada vale, e o banco devolve os dois totais para o PDV avisar.
    await db.query("insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem) values ($1, $2, $3, 9900, now(), 'manual')",
      [ids.organizacao, cat.capa, ids.lojaA]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await comoLoja(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const id = (await pedidoDoCodigo(p.codigo)).id as string;
    const k = chave("atender");
    const r = await comoLoja<{ venda: string; repetida: boolean; total_reservado_centavos: number; total_atual_centavos: number }>(ana, "select public.loja_pedido_atender($1, $2) as v", [id, k]);
    expect(r).toMatchObject({ repetida: false, total_reservado_centavos: 7_900 + 149_900, total_atual_centavos: 9_900 + 149_900 });
    expect((await db.query("select count(*)::int as n from public.venda_itens where venda_id = $1", [r.venda])).rows).toEqual([{ n: 2 }]);
    expect(await comoLoja(ana, "select public.loja_pedido_atender($1, $2) as v", [id, k])).toMatchObject({ venda: r.venda, repetida: true });
    expect(await consultar(p.codigo, "41987650007")).toMatchObject({ situacao: "atendido" });
    expect((await db.query<{ situacao: string }>("select situacao from public.loja_reservas where pedido_id = $1", [id])).rows.every((x) => x.situacao === "atendida")).toBe(true);
  });

  it("cancelar devolve as unidades; a loja de outro lugar não vê nem mexe no pedido", async () => {
    await publicar();
    const antes = await saldo(ids.lojaA, cat.capa);
    const p = await pedir([cat.capa, cat.capa], ids.lojaA, "41987650008");
    const id = (await pedidoDoCodigo(p.codigo)).id as string;
    const outra = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await recusaALoja(outra, "select public.loja_pedido_cancelar($1, 'Cliente desistiu')", [id])).toBe("P0002");
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await comoLoja(ana, "select public.loja_pedido_cancelar($1, 'Cliente desistiu') as v", [id])).toBe(true);
    expect(await saldo(ids.lojaA, cat.capa)).toEqual(antes);
    expect(await consultar(p.codigo, "41987650008")).toMatchObject({ situacao: "cancelado" });
    expect(await recusaALoja(ana, "select public.loja_pedido_atender($1, $2)", [id, chave("atender")])).toBe("22023");
  });
});
