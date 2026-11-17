// Lote ONLINE-b (15/11/2026, ORA-ONLINE-006 e ORA-ONLINE-004 em parte; migration 20261116093359_loja_online_reserva (antes 20261115230000)): a
// reserva do site com retirada na loja. O visitante reserva sem login uma unidade de produto do site por 24 horas (o
// aparelho pelo IMEI); até 2 reservas ativas por WhatsApp e 20 por loja por hora. A loja vê as reservas dela, revela o
// WhatsApp (na auditoria), cancela (devolve ao estoque) ou atende (abre a venda no PDV com a unidade reservada).
// Dados FICTÍCIOS; cada teste numa transação desfeita.
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
const chave = (p: string) => `${p}:site:${String(++chaves).padStart(5, "0")}`;
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
type Confirmacao = { codigo: string; expira_em: string; preco_centavos: number; produto: string; variacao: string; loja: { nome: string } };
const RESERVAR = "select public.loja_reservar($1, $2, $3, $4, $5, $6) as v";
const reservar = (variante: string, loja: string, whatsapp = "41987650001", k = chave("r"), nome = "Cliente do Site") =>
  comoUsuario(db, null, async () => (await db.query<{ v: Confirmacao }>(RESERVAR, [ids.organizacao, variante, loja, nome, whatsapp, k])).rows[0]?.v as Confirmacao);
const recusaAoVisitante = (params: unknown[]) => comoUsuario(db, null, () => erroDe(() => db.query(RESERVAR, params)));
const comoLoja = <T>(s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const recusaALoja = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });
const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ quantidade: number; reservado: number }>("select quantidade, reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0];
const reservaDoCodigo = async (codigo: string) =>
  (await db.query<Record<string, unknown>>("select * from public.loja_reservas where codigo = $1", [codigo])).rows[0] as Record<string, unknown>;
const publicar = () => db.query("update public.produtos set publicar_online = true where id = any($1)", [[cat.produtoAparelho, cat.produtoCapa, cat.produtoChip]]);

describe("a reserva pelo visitante (ONLINE-b)", () => {
  it("reserva a capa sem login: código de 6, 24 horas, o preço do balcão; a unidade fica segura; o WhatsApp só em privado", async () => {
    await publicar();
    const antes = await saldo(ids.lojaA, cat.capa);
    const r = await reservar(cat.capa, ids.lojaA, "(41) 98765-0001");
    expect(r.codigo).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect([r.preco_centavos, r.produto, r.loja.nome]).toEqual([7_900, "Capa de proteção", "Loja A"]);
    const horas = (Date.parse(r.expira_em) - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(23.9);
    expect(horas).toBeLessThanOrEqual(24.01);
    expect(JSON.stringify(r)).not.toContain("Cliente do Site");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: antes?.quantidade, reservado: (antes?.reservado ?? 0) + 1 });
    const linha = await reservaDoCodigo(r.codigo);
    expect(linha).toMatchObject({ nome: "Cliente do Site", situacao: "ativa", preco_centavos: 7_900, item_serializado_id: null });
    expect(linha.whatsapp_mascarado).not.toContain("98765");
    expect((await db.query("select whatsapp from privado.loja_reservas_contato where reserva_id = $1", [linha.id])).rows).toEqual([{ whatsapp: "41987650001" }]);
    expect((await db.query("select origem, criado_por, quantidade from public.estoque_reservas where id = $1", [linha.estoque_reserva_id])).rows)
      .toEqual([{ origem: "online", criado_por: null, quantidade: 1 }]);
  });

  it("o aparelho: o banco escolhe um IMEI disponível da loja; acabou, sem estoque (OR001); a mesma chave devolve a mesma reserva", async () => {
    await publicar();
    const k = chave("aparelho");
    const primeira = await reservar(cat.aparelho, ids.lojaA, "41987650001", k);
    const item = (await reservaDoCodigo(primeira.codigo)).item_serializado_id as string;
    expect([itens.a1, itens.a2]).toContain(item);
    expect((await db.query("select situacao from public.itens_serializados where id = $1", [item])).rows).toEqual([{ situacao: "reservado" }]);
    // A mesma chave: a mesma reserva; com outros dados, recusada.
    expect((await reservar(cat.aparelho, ids.lojaA, "41987650001", k)).codigo).toBe(primeira.codigo);
    expect(await recusaAoVisitante([ids.organizacao, cat.aparelho, ids.lojaA, "Outra Pessoa", "41987650001", k])).toBe("OR004");
    // A loja A tem 2 aparelhos: o segundo (outro WhatsApp) leva o outro IMEI; o terceiro fica sem estoque.
    const segunda = await reservar(cat.aparelho, ids.lojaA, "41987650002");
    expect((await reservaDoCodigo(segunda.codigo)).item_serializado_id).not.toBe(item);
    expect(await recusaAoVisitante([ids.organizacao, cat.aparelho, ids.lojaA, "Terceiro Cliente", "41987650003", chave("r")])).toBe("OR001");
  });

  it("os limites: 2 reservas ativas por WhatsApp (OR034); 20 por loja por hora (OR035); vencida não conta", async () => {
    await publicar();
    await reservar(cat.capa, ids.lojaA, "41987650001");
    const segunda = await reservar(cat.capa, ids.lojaB, "41987650001");
    expect(await recusaAoVisitante([ids.organizacao, cat.capa, ids.lojaA, "Cliente do Site", "41987650001", chave("r")])).toBe("OR034");
    // Vencida, a reserva não conta mais no limite do WhatsApp.
    await db.query("update public.loja_reservas set expira_em = now() - interval '1 minute' where codigo = $1", [segunda.codigo]);
    expect((await reservar(cat.capa, ids.lojaA, "41987650001")).codigo).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    // 20 reservas na última hora na loja A (gravadas aqui direto, com outros WhatsApps): a 21ª é recusada.
    const estoque = (await reservaDoCodigo(segunda.codigo)).estoque_reserva_id;
    for (let n = 0; n < 18; n++) {
      await db.query(`insert into public.loja_reservas (organizacao_id, unidade_id, variante_id, estoque_reserva_id, codigo, nome, whatsapp_mascarado, preco_centavos, expira_em, chave)
        values ($1, $2, $3, $4, $5, 'Outro Cliente', '(41) 9****-0000', 7900, now() + interval '1 day', $6)`,
      [ids.organizacao, ids.lojaA, cat.capa, estoque, `ZZZZ${"ABCDEFGHJKLMNPQRSTUVWXYZ"[n]}${"2"}`, chave("lote")]);
    }
    expect(await recusaAoVisitante([ids.organizacao, cat.capa, ids.lojaA, "Novo Cliente", "41987650009", chave("r")])).toBe("OR035");
  });

  it("o que se recusa: produto fora do site, chip, loja inativa ou de outra empresa, sem preço; nome, WhatsApp e chave inválidos", async () => {
    // "Não está à venda na loja online" é OR036 (ONLINE-c): o P0002 de antes virava HTTP 500 na API do banco.
    expect(await recusaAoVisitante([ids.organizacao, cat.capa, ids.lojaA, "Cliente do Site", "41987650001", chave("r")])).toBe("OR036");
    expect(await recusaAoVisitante([ids.organizacao, "6d43d3aa-4610-42cc-8573-9ccef3cdc5f3", ids.lojaA, "Cliente do Site", "41987650001", chave("r")])).toBe("OR036");
    await publicar();
    for (const [variante, loja] of [[cat.chip, ids.lojaA], [cat.capa, ids.assistencia], [cat.capa, ids.online], [cat.capa, ids.lojaOutraOrg]] as const) {
      expect(await recusaAoVisitante([ids.organizacao, variante, loja, "Cliente do Site", "41987650001", chave("r")]), `${variante} ${loja}`).toBe("OR036");
    }
    await db.query("update public.unidades set status = 'inativa' where id = $1", [ids.lojaC]);
    expect(await recusaAoVisitante([ids.organizacao, cat.capa, ids.lojaC, "Cliente do Site", "41987650001", chave("r")])).toBe("OR036");
    for (const [nome, whatsapp, k] of [["A", "41987650001", chave("r")], ["Cliente do Site", "4198765000", chave("r")], ["Cliente do Site", "4133334444", chave("r")], ["Cliente do Site", "41987650001", "curta"]]) {
      expect(await recusaAoVisitante([ids.organizacao, cat.capa, ids.lojaA, nome, whatsapp, k]), `${nome} ${whatsapp} ${k}`).toBe("22023");
    }
    // O WhatsApp com o 55 do país também vale.
    expect((await reservar(cat.capa, ids.lojaA, "+55 41 98765-0001")).codigo).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    // Sem preço na loja (o preço que valia terminou): a mesma recusa.
    await db.query("update public.precos set fim = now() where variante_id = $1", [cat.capa]);
    expect(await recusaAoVisitante([ids.organizacao, cat.capa, ids.lojaA, "Cliente do Site", "41987650002", chave("r")])).toBe("OR036");
  });
});

describe("a loja atende a reserva (ONLINE-b)", () => {
  it("só a loja da reserva vê e age; revelar o WhatsApp fica na auditoria; cancelar devolve ao estoque e vale uma vez", async () => {
    await publicar();
    const r = await reservar(cat.aparelho, ids.lojaA);
    const linha = await reservaDoCodigo(r.codigo);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect((await comoUsuario(db, ana, async () => (await db.query("select codigo from public.loja_reservas")).rows, { criarSessao: false }))).toEqual([{ codigo: r.codigo }]);
    expect((await comoUsuario(db, gerenteB, async () => (await db.query("select codigo from public.loja_reservas")).rows, { criarSessao: false }))).toEqual([]);
    expect(await recusaALoja(gerenteB, "select public.loja_reserva_contato($1)", [linha.id])).toBe("P0002");
    expect(await comoLoja<string>(ana, "select public.loja_reserva_contato($1) as v", [linha.id])).toBe("41987650001");
    expect((await db.query("select acao, usuario_id from public.auditoria where alvo_id = $1", [linha.id])).rows).toEqual([{ acao: "loja_reserva.contato_revelado", usuario_id: ids.vendedorA }]);
    // Cancelar pede motivo; devolve o aparelho ao estoque; a segunda vez não muda nada.
    expect(await recusaALoja(ana, "select public.loja_reserva_cancelar($1, ' ')", [linha.id])).toBe("22023");
    expect(await comoLoja<boolean>(ana, "select public.loja_reserva_cancelar($1, 'Cliente desistiu pelo WhatsApp') as v", [linha.id])).toBe(true);
    expect(await comoLoja<boolean>(ana, "select public.loja_reserva_cancelar($1, 'Cliente desistiu pelo WhatsApp') as v", [linha.id])).toBe(false);
    expect((await db.query("select situacao from public.itens_serializados where id = $1", [linha.item_serializado_id])).rows).toEqual([{ situacao: "disponivel" }]);
    expect(await reservaDoCodigo(r.codigo)).toMatchObject({ situacao: "cancelada", cancelada_por: ids.vendedorA, motivo_cancelamento: "Cliente desistiu pelo WhatsApp" });
    expect(await recusaALoja(ana, "select public.loja_reserva_atender($1, $2)", [linha.id, chave("atender")])).toBe("22023");
  });

  it("atender abre a venda no PDV com o IMEI reservado, na mesma transação; devolve o preço anunciado e o de agora; vencida não", async () => {
    await publicar();
    const r = await reservar(cat.aparelho, ids.lojaA);
    const linha = await reservaDoCodigo(r.codigo);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const k = chave("atender");
    const atendida = await comoLoja<{ venda: string; preco_reservado_centavos: number; preco_atual_centavos: number; repetida: boolean }>(ana, "select public.loja_reserva_atender($1, $2) as v", [linha.id, k]);
    expect(atendida).toMatchObject({ preco_reservado_centavos: 149_900, preco_atual_centavos: 149_900, repetida: false });
    expect((await db.query("select situacao, vendedor_id, unidade_id from public.vendas where id = $1", [atendida.venda])).rows).toEqual([{ situacao: "rascunho", vendedor_id: ids.vendedorA, unidade_id: ids.lojaA }]);
    expect((await db.query("select item_serializado_id from public.venda_itens where venda_id = $1", [atendida.venda])).rows).toEqual([{ item_serializado_id: linha.item_serializado_id }]);
    expect(await reservaDoCodigo(r.codigo)).toMatchObject({ situacao: "atendida", atendida_por: ids.vendedorA, venda_id: atendida.venda });
    // A reserva de estoque do site foi liberada e a da venda segura o mesmo IMEI.
    expect((await db.query("select situacao from public.estoque_reservas where id = $1", [linha.estoque_reserva_id])).rows).toEqual([{ situacao: "liberada" }]);
    expect((await db.query("select situacao from public.itens_serializados where id = $1", [linha.item_serializado_id])).rows).toEqual([{ situacao: "reservado" }]);
    // Repetir devolve a mesma venda.
    expect(await comoLoja(ana, "select public.loja_reserva_atender($1, $2) as v", [linha.id, k])).toMatchObject({ venda: atendida.venda, repetida: true });
    // A reserva vencida não se atende (a venda vai pelo PDV, se ainda houver estoque).
    const outra = await reservar(cat.capa, ids.lojaA, "41987650002");
    await db.query("update public.loja_reservas set expira_em = now() - interval '1 minute' where codigo = $1", [outra.codigo]);
    expect(await recusaALoja(ana, "select public.loja_reserva_atender($1, $2)", [(await reservaDoCodigo(outra.codigo)).id, chave("atender")])).toBe("22023");
  });

  it("a loja solta de vez as reservas do site vencidas dela (o aparelho volta livre ao PDV); a reserva vencida do PDV não", async () => {
    await publicar();
    const r = await reservar(cat.aparelho, ids.lojaA);
    const linha = await reservaDoCodigo(r.codigo);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    // Uma reserva do PDV vencida (de um carrinho) na mesma loja: continua com a regra de sempre.
    const doPdv = await comoLoja<string>(ana, "select public.reservar_estoque($1, 1, null, $2) as v", [cat.capa, chave("pdv")]);
    // Ainda no prazo: nada sai.
    expect(await comoLoja<number>(ana, "select public.loja_reservas_liberar_vencidas() as v")).toBe(0);
    await db.query("update public.loja_reservas set expira_em = now() - interval '1 minute' where id = $1", [linha.id]);
    await db.query("update public.estoque_reservas set expira_em = now() - interval '1 minute' where id = any($1)", [[linha.estoque_reserva_id, doPdv]]);
    // Quem vende em outra loja não mexe nas da loja A; o visitante não chama.
    expect(await comoLoja<number>(gerenteB, "select public.loja_reservas_liberar_vencidas() as v")).toBe(0);
    expect(await comoUsuario(db, null, () => erroDe(() => db.query("select public.loja_reservas_liberar_vencidas()")))).toBe("42501");
    const saldoAntes = await saldo(ids.lojaA, cat.aparelho);
    expect(await comoLoja<number>(ana, "select public.loja_reservas_liberar_vencidas() as v")).toBe(1);
    expect((await db.query("select situacao from public.itens_serializados where id = $1", [linha.item_serializado_id])).rows).toEqual([{ situacao: "disponivel" }]);
    expect(await saldo(ids.lojaA, cat.aparelho)).toEqual({ quantidade: saldoAntes?.quantidade, reservado: (saldoAntes?.reservado ?? 0) - 1 });
    expect((await db.query("select id, situacao from public.estoque_reservas where id = any($1) order by situacao", [[linha.estoque_reserva_id, doPdv]])).rows)
      .toEqual([{ id: doPdv, situacao: "ativa" }, { id: linha.estoque_reserva_id, situacao: "expirada" }]);
    // De novo: nada mais a soltar; a reserva do site continua no histórico (vencida, sem atender).
    expect(await comoLoja<number>(ana, "select public.loja_reservas_liberar_vencidas() as v")).toBe(0);
    expect(await reservaDoCodigo(r.codigo)).toMatchObject({ situacao: "ativa", venda_id: null });
  });

  it("a vitrine não conta como reservada a reserva vencida que ainda não foi liberada", async () => {
    await publicar();
    const visitante = async () => comoUsuario(db, null, async () => (await db.query<{ v: { variantes: { lojas: { nome: string; disponibilidade: string }[] }[] } }>(
      "select public.loja_produto($1, $2) as v", [ids.organizacao, cat.produtoAparelho])).rows[0]?.v);
    const r = await reservar(cat.aparelho, ids.lojaB);
    const loja = async (nome: string) => (await visitante())?.variantes[0]?.lojas.find((l) => l.nome === nome)?.disponibilidade;
    expect(await loja("Loja B")).toBe("sem_estoque");
    await db.query("update public.estoque_reservas set expira_em = now() - interval '1 minute' where id = $1", [(await reservaDoCodigo(r.codigo)).estoque_reserva_id]);
    expect(await loja("Loja B")).toBe("ultimas_unidades");
  });
});
