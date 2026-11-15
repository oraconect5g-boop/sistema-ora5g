// Carga e recuperação num PostgreSQL 17 de verdade (lote QUAL-012a: ORA-QUAL-012, "testes de carga, concorrência e
// disaster recovery — sem venda/IMEI duplo, serviço retorna ao estado previsto"). A concorrência de duas conexões está
// em concorrencia.test.ts; aqui, muitas vendas ao mesmo tempo e o que acontece quando a conexão ou o servidor caem.
//   * carga: VENDEDORES vendedores (uma conexão cada) vendendo ao mesmo tempo na mesma loja — acessórios do mesmo
//     estoque e aparelhos disputados pelo IMEI —; no fim, cada IMEI vendido uma vez só, o estoque e os recebimentos
//     fechando com as vendas, e o tempo de cada conclusão medido (o mais lento entra no limite do teste);
//   * a conexão que cai no meio da venda: nada fica pela metade;
//   * o servidor que cai de repente (parada imediata, sem checkpoint, como uma queda de energia) e volta: o que estava
//     confirmado continua, o que estava no meio sumiu, e as vendas seguem.
// Dados FICTÍCIOS; o banco é descartado no fim.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { amrDaSenha, comDigitoLuhn } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";
import { executor, iniciarPostgresReal, type PostgresReal } from "./postgres-real";

const VENDEDORES = 8;
const ACESSORIOS_POR_VENDEDOR = 6;
const APARELHOS = 12;
const ESTOQUE_DE_CAPAS = 100;

let servidor: PostgresReal;
let admin: pg.Client;
const vendedores: { id: string; sessao: string; cliente: pg.Client }[] = [];
/** Os aparelhos da carga: o id (a venda pede o id do item) e o IMEI. */
const aparelhos: { id: string; imei: string }[] = [];
let chaves = 0;
const chave = (p: string) => `${p}-carga-${String(++chaves).padStart(6, "0")}`;

beforeAll(async () => {
  servidor = await iniciarPostgresReal({ persistente: true });
  admin = await servidor.conectar();
  await montarCenario(executor(admin));
  await montarCatalogo(executor(admin));
  // Mais estoque para a carga: capas e aparelhos com IMEI fictício válido, na loja A.
  await admin.query("select privado.lancar_movimento($1, $2, $3, 'entrada_importacao', null, null, null, null, 'carga:capas')", [ids.lojaA, cat.capa, ESTOQUE_DE_CAPAS]);
  for (let i = 0; i < APARELHOS; i++) {
    const imei = comDigitoLuhn(`3520990019${String(i).padStart(4, "0")}`);
    const r = await admin.query<{ id: string }>("select privado.registrar_item_serializado($1, $2, $3, null, null, 'entrada_importacao', $4) as id", [ids.lojaA, cat.aparelho, imei, `carga:a${i}`]);
    aparelhos.push({ id: r.rows[0]?.id as string, imei });
  }
  // Vendedores fictícios da loja A, cada um com a sua sessão do turno, a loja escolhida e o caixa aberto.
  for (let n = 0; n < VENDEDORES; n++) {
    const id = `00000000-0000-4000-8000-${String(900 + n).padStart(12, "0")}`;
    await admin.query("insert into auth.users (id, email) values ($1, $2)", [id, `carga${n}@teste.invalid`]);
    await admin.query("insert into public.perfis_usuario (id, nome, email) values ($1, $2, $3)", [id, `Vendedor de carga ${n}`, `carga${n}@teste.invalid`]);
    await admin.query("insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, inicio) values ($1, $2, 'vendedor', 'unidade', $3, now() - interval '1 day')", [id, ids.organizacao, ids.lojaA]);
    const sessao = `43000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`;
    await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [sessao, id]);
    const cliente = await servidor.conectar();
    vendedores.push({ id, sessao, cliente });
    await como(vendedores[n] as (typeof vendedores)[number], "select public.selecionar_unidade($1)", [ids.lojaA]);
    await como(vendedores[n] as (typeof vendedores)[number], "select public.abrir_caixa(10000, $1)", [chave("caixa")]);
  }
}, 240_000);

afterAll(async () => {
  for (const v of vendedores) await v.cliente.end().catch(() => {});
  await admin?.end().catch(() => {});
  await servidor?.parar();
});

/** Uma chamada como o vendedor (a sessão dele e o login recente), numa transação só, como a API faz. */
async function como<T = Record<string, unknown>>(v: { id: string; sessao: string; cliente: pg.Client }, sql: string, params: unknown[] = []) {
  await v.cliente.query("begin");
  try {
    await v.cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: v.id, session_id: v.sessao, role: "authenticated", amr: amrDaSenha() })]);
    await v.cliente.query("set local role authenticated");
    const r = await v.cliente.query(sql, params);
    await v.cliente.query("commit");
    return r.rows as T[];
  } catch (e) {
    await v.cliente.query("rollback").catch(() => {});
    throw e;
  }
}
/** O estoque de um produto na loja A: o saldo (a quantidade e o reservado) e o livro (a soma dos movimentos). */
async function estoque(variante: string) {
  const r = await admin.query<{ quantidade: number; reservado: number; livro: number }>(`
    select coalesce((select s.quantidade from public.estoque_saldos s where s.unidade_id = $1 and s.variante_id = $2), 0) as quantidade,
           coalesce((select s.reservado from public.estoque_saldos s where s.unidade_id = $1 and s.variante_id = $2), 0) as reservado,
           (select coalesce(sum(m.quantidade), 0)::int from public.estoque_movimentos m where m.unidade_id = $1 and m.variante_id = $2) as livro`,
    [ids.lojaA, variante]);
  return r.rows[0] as { quantidade: number; reservado: number; livro: number };
}
/** As reservas de estoque que os itens de uma venda abriram (a chave de cada uma começa por "venda:<id>:"). */
const reservasDaVenda = async (venda: string | undefined) =>
  (await admin.query("select 1 from public.estoque_reservas where chave_idempotencia like $1", [`venda:${venda}:%`])).rows.length;
const codigo = (e: unknown) => (e as { code?: string }).code ?? "sem-codigo";
const percentil = (valores: number[], p: number) => [...valores].sort((a, b) => a - b)[Math.min(valores.length - 1, Math.ceil((p / 100) * valores.length) - 1)] ?? 0;

describe("carga: muitas vendas ao mesmo tempo no PostgreSQL 17 (QUAL-012a)", () => {
  it("cada IMEI vendido uma vez só; o estoque e os recebimentos fecham com as vendas; o tempo de cada conclusão medido", async () => {
    const tempos: number[] = [];
    const recusasDoAparelho: string[] = [];
    const capasAntes = await estoque(cat.capa);
    const aparelhosAntes = await estoque(cat.aparelho);
    // Cada vendedor vende capas e tenta vender todos os aparelhos, começando de um ponto da lista que depende dele
    // (de 3 em 3; dois a dois no mesmo ponto): todos disputam todos os aparelhos ao mesmo tempo.
    await Promise.all(vendedores.map(async (v, n) => {
      for (let k = 0; k < ACESSORIOS_POR_VENDEDOR; k++) {
        const [venda] = await como<{ v: string }>(v, "select public.criar_venda($1) as v", [chave("venda")]);
        await como(v, "select public.adicionar_item($1, $2, null, 1, $3)", [venda?.v, cat.capa, chave("item")]);
        const inicio = performance.now();
        await como(v, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2)", [venda?.v, chave("concluir")]);
        tempos.push(performance.now() - inicio);
      }
      for (let k = 0; k < APARELHOS; k++) {
        const aparelho = aparelhos[(n * 3 + k) % APARELHOS] as (typeof aparelhos)[number];
        const [venda] = await como<{ v: string }>(v, "select public.criar_venda($1) as v", [chave("venda")]);
        try {
          await como(v, "select public.adicionar_item($1, $2, $3, 1, $4)", [venda?.v, cat.aparelho, aparelho.id, chave("item")]);
          const inicio = performance.now();
          await como(v, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":149900}]'::jsonb, '{}'::jsonb, $2)", [venda?.v, chave("concluir")]);
          tempos.push(performance.now() - inicio);
        } catch (e) {
          recusasDoAparelho.push(codigo(e));
        }
      }
    }));

    // Cada aparelho da carga saiu numa venda concluída só; as recusas foram as de aparelho indisponível.
    const vendidos = await admin.query<{ imei: string; vendas: number }>(`
      select s.imei, count(distinct v.id)::int as vendas
      from public.itens_serializados s
      join public.venda_itens vi on vi.item_serializado_id = s.id
      join public.vendas v on v.id = vi.venda_id and v.situacao = 'concluida'
      where s.id = any($1) group by s.imei`, [aparelhos.map((a) => a.id)]);
    expect(vendidos.rows).toHaveLength(APARELHOS);
    expect(vendidos.rows.every((r) => r.vendas === 1)).toBe(true);
    expect(new Set(recusasDoAparelho)).toEqual(new Set(["OR002"]));
    expect(recusasDoAparelho).toHaveLength(VENDEDORES * APARELHOS - APARELHOS);
    const situacoes = await admin.query<{ situacao: string }>("select distinct situacao from public.itens_serializados where id = any($1)", [aparelhos.map((a) => a.id)]);
    expect(situacoes.rows).toEqual([{ situacao: "vendido" }]);
    // O estoque fecha: o saldo e o livro descem exatamente o que foi vendido, um igual ao outro, sem reserva pendurada.
    const capasVendidas = VENDEDORES * ACESSORIOS_POR_VENDEDOR;
    const capasDepois = await estoque(cat.capa);
    const aparelhosDepois = await estoque(cat.aparelho);
    expect(capasDepois).toEqual({ quantidade: capasAntes.quantidade - capasVendidas, reservado: capasAntes.reservado, livro: capasAntes.livro - capasVendidas });
    expect(capasDepois.quantidade).toBe(capasDepois.livro);
    expect(aparelhosDepois).toEqual({ quantidade: aparelhosAntes.quantidade - APARELHOS, reservado: aparelhosAntes.reservado, livro: aparelhosAntes.livro - APARELHOS });
    expect(aparelhosDepois.quantidade).toBe(aparelhosDepois.livro);
    // Os recebimentos fecham com as vendas concluídas da carga.
    const somas = await admin.query<{ vendas: number; pagamentos: number }>(`
      select (select coalesce(sum(v.total_centavos), 0) from public.vendas v where v.situacao = 'concluida' and v.vendedor_id = any($1))::bigint as vendas,
             (select coalesce(sum(p.valor_centavos), 0) from public.venda_pagamentos p join public.vendas v on v.id = p.venda_id where v.situacao = 'concluida' and v.vendedor_id = any($1))::bigint as pagamentos`,
      [vendedores.map((v) => v.id)]);
    expect(Number(somas.rows[0]?.vendas)).toBe(capasVendidas * 7900 + APARELHOS * 149900);
    expect(Number(somas.rows[0]?.pagamentos)).toBe(Number(somas.rows[0]?.vendas));
    // O tempo: a mediana e o mais lento das conclusões (o limite é folgado; o número vai para o registro do lote).
    const p50 = percentil(tempos, 50);
    const p95 = percentil(tempos, 95);
    console.info(`carga: ${tempos.length} conclusões com ${VENDEDORES} vendedores; mediana ${p50.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, máximo ${Math.max(...tempos).toFixed(0)} ms`);
    expect(p95).toBeLessThan(5_000);
  }, 240_000);
});

describe("recuperação: a conexão e o servidor que caem (QUAL-012a)", () => {
  it("a conexão que cai no meio da venda (antes do commit): a venda e a reserva não ficam pela metade", async () => {
    const v = vendedores[0] as (typeof vendedores)[number];
    const [venda] = await como<{ v: string }>(v, "select public.criar_venda($1) as v", [chave("venda")]);
    const antes = await estoque(cat.capa);
    // A conexão nova abre a transação, reserva a capa e cai antes de confirmar.
    const caindo = await servidor.conectar();
    const pid = (await caindo.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid;
    await caindo.query("begin");
    await caindo.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: v.id, session_id: v.sessao, role: "authenticated", amr: amrDaSenha() })]);
    await caindo.query("set local role authenticated");
    await caindo.query("select public.adicionar_item($1, $2, null, 1, $3)", [venda?.v, cat.capa, chave("item")]);
    caindo.on("error", () => {});
    await admin.query("select pg_terminate_backend($1)", [pid]);
    await caindo.end().catch(() => {});
    const itens = await admin.query("select 1 from public.venda_itens where venda_id = $1", [venda?.v]);
    expect(itens.rows).toEqual([]);
    expect(await reservasDaVenda(venda?.v)).toBe(0);
    expect(await estoque(cat.capa)).toEqual(antes);
  });

  it("o servidor que cai de repente e volta: o confirmado continua, o que estava no meio sumiu, e as vendas seguem", async () => {
    const v = vendedores[1] as (typeof vendedores)[number];
    const confirmadas = (await admin.query<{ n: number }>("select count(*)::int as n from public.vendas where situacao = 'concluida'")).rows[0]?.n ?? 0;
    // Uma venda no meio (transação aberta, item reservado, sem commit) quando o servidor cai.
    const [venda] = await como<{ v: string }>(v, "select public.criar_venda($1) as v", [chave("venda")]);
    const antes = await estoque(cat.capa);
    const noMeio = await servidor.conectar();
    noMeio.on("error", () => {});
    await noMeio.query("begin");
    await noMeio.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: v.id, session_id: v.sessao, role: "authenticated", amr: amrDaSenha() })]);
    await noMeio.query("set local role authenticated");
    await noMeio.query("select public.adicionar_item($1, $2, null, 1, $3)", [venda?.v, cat.capa, chave("item")]);
    for (const c of [admin, ...vendedores.map((x) => x.cliente)]) c.on("error", () => {});
    await servidor.cairDeRepente();
    await servidor.religar();
    admin = await servidor.conectar();
    for (const x of vendedores) x.cliente = await servidor.conectar();
    expect((await admin.query<{ n: number }>("select count(*)::int as n from public.vendas where situacao = 'concluida'")).rows[0]?.n).toBe(confirmadas);
    expect((await admin.query("select 1 from public.venda_itens where venda_id = $1", [venda?.v])).rows).toEqual([]);
    expect(await reservasDaVenda(venda?.v)).toBe(0);
    expect(await estoque(cat.capa)).toEqual(antes);
    // As vendas seguem: o mesmo vendedor conclui uma venda nova depois da volta.
    const [nova] = await como<{ v: string }>(v, "select public.criar_venda($1) as v", [chave("venda")]);
    await como(v, "select public.adicionar_item($1, $2, null, 1, $3)", [nova?.v, cat.capa, chave("item")]);
    await como(v, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2)", [nova?.v, chave("concluir")]);
    expect((await admin.query<{ n: number }>("select count(*)::int as n from public.vendas where situacao = 'concluida'")).rows[0]?.n).toBe(confirmadas + 1);
  }, 120_000);
});
