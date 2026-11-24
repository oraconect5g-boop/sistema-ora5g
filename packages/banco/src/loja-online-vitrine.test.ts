// Lote ONLINE-a (15/11/2026, ORA-ONLINE-001 em parte; migration 20261115210812_loja_online_vitrine): a vitrine da loja
// online, que qualquer visitante vê sem login. Só o que o dono marcou para o site (produtos.publicar_online), ativo, e só
// aparelhos e acessórios; de cada um, o preço do balcão em cada loja física ativa e se há estoque, sem custo, SKU, código
// de barras, quantidade, IMEI ou outro dado interno. As fotos: só as do site, e o visitante alcança só essas.
// Dados FICTÍCIOS; cada teste numa transação desfeita.
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
type Vitrine = {
  categorias: { id: string; nome: string }[];
  produtos: { id: string; nome: string; marca: string | null; categoria: string; preco_a_partir_centavos: number; disponivel: boolean; foto: string | null }[];
  total: number; pagina: number; paginas: number;
};
type Loja = { id: string; nome: string; preco_centavos: number; disponibilidade: string; endereco?: string | null };
type Detalhe = { id: string; nome: string; marca: string | null; categoria: string; fotos: { caminho: string }[]; variantes: { id: string; nome: string; lojas: Loja[] }[] };
const VITRINE = "select public.loja_vitrine($1, $2, $3) as v";
const DETALHE = "select public.loja_produto($1, $2) as v";
// O visitante sem login (o papel anon, sem JWT).
const visitante = <T>(sql: string, params: unknown[]) => comoUsuario(db, null, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const vitrine = (busca: string | null = null, categoria: string | null = null) => visitante<Vitrine>(VITRINE, [ids.organizacao, busca, categoria]);
const detalhe = (produto: string) => visitante<Detalhe>(DETALHE, [ids.organizacao, produto]);
const naPagina = (pagina: number | null) => visitante<Vitrine>("select public.loja_vitrine($1, null, null, $2) as v", [ids.organizacao, pagina]);
// A recusa ao visitante: o savepoint dentro do papel anon (fora dele, o erro real vira "transação abortada").
const erroDoVisitante = (sql: string, params: unknown[]) => comoUsuario(db, null, () => erroDe(() => db.query(sql, params)));
const publicar = (produtos: string[]) => db.query("update public.produtos set publicar_online = true where id = any($1)", [produtos]);
const foto = (produto: string, variante: string | null, nome: string) =>
  db.query<{ caminho: string }>(`insert into public.fotos_produto (organizacao_id, produto_id, variante_id, caminho, largura, altura, bytes, tipo)
    values ($1, $2, $3, $4, 800, 800, 50000, 'image/webp') returning caminho`,
  [ids.organizacao, produto, variante, `${ids.organizacao}/${produto}/${variante ?? "produto"}/${nome}.webp`]).then((r) => r.rows[0]?.caminho as string);

describe("o endereço da loja na página do produto (ONLINE-h)", () => {
  const configurar = (desde: string, rua: string | null, numero: string | null = null, complemento: string | null = null, bairro: string | null = null) =>
    db.query(`insert into public.unidade_configuracoes (organizacao_id, unidade_id, vigente_desde, logradouro, numero, complemento, bairro, motivo, criado_por)
      values ($1, $2, ${desde}, $3, $4, $5, $6, 'Teste do endereço', $7)`, [ids.organizacao, ids.lojaB, rua, numero, complemento, bairro, ids.dono]);
  const enderecoDaLojaB = async () => (await detalhe(cat.produtoAparelho)).variantes.flatMap((v) => v.lojas).find((l) => l.nome === "Loja B")?.endereco;

  it("vale a configuração em vigor (\"rua, número - complemento - bairro\"); a futura ainda não; a nova sem rua volta ao endereço de antes", async () => {
    await publicar([cat.produtoAparelho]);
    expect(await enderecoDaLojaB()).toBeNull();
    await configurar("now() - interval '2 hours'", "Av. Exemplo", "100", "Quiosque 2", "Centro");
    await configurar("now() + interval '1 day'", "Rua Futura", "1");
    expect(await enderecoDaLojaB()).toBe("Av. Exemplo, 100 - Quiosque 2 - Centro");
    await db.query("update public.unidades set endereco = 'Rua Antiga, 5' where id = $1", [ids.lojaB]);
    await configurar("now() - interval '1 hour'", null);
    expect(await enderecoDaLojaB()).toBe("Rua Antiga, 5");
    await configurar("now() - interval '30 minutes'", "Rua Só", null, null, null);
    expect(await enderecoDaLojaB()).toBe("Rua Só");
  });
});

describe("a vitrine com o catálogo inteiro (ONLINE-f)", () => {
  // Acessórios fictícios marcados para o site, com o preço da rede e sem estoque ("Acessório 001" em diante).
  const copias = (n: number) => db.query(`
    with novos as (
      insert into public.produtos (organizacao_id, tipo, nome, categoria_id, publicar_online)
      select $1, 'acessorio', 'Acessório ' || lpad(g::text, 3, '0'), $2, true from generate_series(1, $3) g
      returning id, nome),
    vars as (
      insert into public.variantes (organizacao_id, produto_id, sku, nome)
      select $1, n.id, 'ACS-' || right(n.nome, 3), n.nome from novos n
      returning id)
    insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem)
    select $1, v.id, null, 1000, now() - interval '1 day', 'manual' from vars v`, [ids.organizacao, cat.acessorios, n]);

  it("os disponíveis primeiro e de 60 em 60, com o total e as páginas; página fora do que existe vale a primeira ou a última", async () => {
    await publicar([cat.produtoAparelho, cat.produtoCapa]);
    await copias(61);
    const primeira = await naPagina(1);
    expect(primeira).toMatchObject({ total: 63, pagina: 1, paginas: 2 });
    expect(primeira.produtos).toHaveLength(60);
    // Pelo nome, os 61 "Acessório" viriam antes; os dois com estoque passam à frente.
    expect(primeira.produtos.slice(0, 3).map((p) => [p.nome, p.disponivel])).toEqual([["Capa de proteção", true], ["Galaxy A15", true], ["Acessório 001", false]]);
    const segunda = await naPagina(2);
    expect(segunda).toMatchObject({ total: 63, pagina: 2, paginas: 2 });
    expect(segunda.produtos.map((p) => p.nome)).toEqual(["Acessório 059", "Acessório 060", "Acessório 061"]);
    expect([(await naPagina(99)).pagina, (await naPagina(0)).pagina, (await naPagina(-5)).pagina, (await naPagina(null)).pagina]).toEqual([2, 1, 1, 1]);
    // A busca e a categoria contam só o que filtram; as categorias do filtro seguem todas.
    expect(await vitrine("galaxy")).toMatchObject({ total: 1, pagina: 1, paginas: 1 });
    expect((await vitrine(null, cat.celulares)).categorias.map((c) => c.nome)).toEqual(["Acessórios", "Celulares"]);
  });
});

describe("a vitrine da loja online (ONLINE-a)", () => {
  it("sem produto marcado, nada aparece; marcados, só aparelhos e acessórios ativos, com o preço do balcão e o estoque", async () => {
    expect(await vitrine()).toEqual({ categorias: [], produtos: [], total: 0, pagina: 1, paginas: 0 });
    await publicar([cat.produtoAparelho, cat.produtoCapa, cat.produtoChip, cat.produtoRecarga]);
    const v = await vitrine();
    // Chip e recarga ficam fora; a capa (R$ 79,00) e o Galaxy (a partir de R$ 1.399,00, o preço da loja B, que tem estoque).
    expect(v.produtos.map((p) => [p.nome, p.marca, p.categoria, p.preco_a_partir_centavos, p.disponivel])).toEqual([
      ["Capa de proteção", null, "Acessórios", 7_900, true], ["Galaxy A15", "Samsung", "Celulares", 139_900, true],
    ]);
    expect(v.categorias.map((c) => c.nome)).toEqual(["Acessórios", "Celulares"]);
    // A busca (no nome, na marca e no modelo, sem curinga) e a categoria.
    expect((await vitrine("galaxy")).produtos.map((p) => p.nome)).toEqual(["Galaxy A15"]);
    expect((await vitrine("  SAMSUNG ")).produtos.map((p) => p.nome)).toEqual(["Galaxy A15"]);
    expect((await vitrine("%")).produtos).toEqual([]);
    expect((await vitrine(null, cat.acessorios)).produtos.map((p) => p.nome)).toEqual(["Capa de proteção"]);
    // Produto inativo sai; a outra empresa não vê nada desta (e esta não vê a dela).
    await db.query("update public.produtos set ativo = false where id = $1", [cat.produtoCapa]);
    expect((await vitrine()).produtos.map((p) => p.nome)).toEqual(["Galaxy A15"]);
    expect(await visitante<Vitrine>(VITRINE, [ids.outraOrganizacao, null, null])).toEqual({ categorias: [], produtos: [], total: 0, pagina: 1, paginas: 0 });
  });

  it("o detalhe: cada variação ativa, nas lojas físicas ativas com preço, disponível, últimas unidades ou sem estoque; nada interno", async () => {
    await publicar([cat.produtoAparelho, cat.produtoChip]);
    const d = await detalhe(cat.produtoAparelho);
    expect([d.nome, d.marca, d.categoria]).toEqual(["Galaxy A15", "Samsung", "Celulares"]);
    // Loja A: 2 aparelhos (últimas unidades), R$ 1.499,00 (rede); loja B: 1, R$ 1.399,00 (da loja); loja C: sem estoque.
    // A assistência, a unidade online e a loja da outra empresa não aparecem.
    expect(d.variantes.map((x) => [x.nome, x.lojas.map((l) => [l.nome, l.preco_centavos, l.disponibilidade])])).toEqual([
      ["Galaxy A15 128 GB Azul", [["Loja A", 149_900, "ultimas_unidades"], ["Loja B", 139_900, "ultimas_unidades"], ["Loja C", 149_900, "sem_estoque"]]],
    ]);
    const texto = JSON.stringify(d);
    for (const interno of ["APA-0001", "7890000000011", cat.imei1, cat.imei2, cat.imei3, "110000", "sku", "custo", "quantidade", "reservado", "Assistência", "Loja Online", "Loja X"]) {
      expect(texto, interno).not.toContain(interno);
    }
    // A capa da loja A, reservada numa venda aberta, some do disponível da loja A (o que sobra é o que se vende).
    const loja = (nome: string) => d.variantes[0]?.lojas.find((l) => l.nome === nome);
    expect(loja("Loja A")?.disponibilidade).toBe("ultimas_unidades");
    await db.query("update public.estoque_saldos set reservado = quantidade where unidade_id = $1 and variante_id = $2", [ids.lojaA, cat.aparelho]);
    expect((await detalhe(cat.produtoAparelho)).variantes[0]?.lojas.map((l) => [l.nome, l.disponibilidade])).toEqual([
      ["Loja B", "ultimas_unidades"], ["Loja A", "sem_estoque"], ["Loja C", "sem_estoque"],
    ]);
    // Loja inativa e variação inativa saem; sem preço em loja nenhuma, o produto sai do site.
    await db.query("update public.unidades set status = 'inativa' where id = $1", [ids.lojaC]);
    expect((await detalhe(cat.produtoAparelho)).variantes[0]?.lojas.map((l) => l.nome)).toEqual(["Loja B", "Loja A"]);
    // (o preço que já valeu não se cancela: termina agora, como na tela dos preços)
    await db.query("update public.precos set fim = now() where variante_id = $1", [cat.aparelho]);
    // Fora do site, o detalhe vem VAZIO, sem erro (ONLINE-c): o erro P0002 de antes virava HTTP 500 na API do banco.
    expect(await detalhe(cat.produtoAparelho)).toBeNull();
    expect((await vitrine()).produtos).toEqual([]);
    // Fora do site (não marcado, chip, de outra empresa ou que não existe): vazio também.
    expect(await detalhe(cat.produtoCapa)).toBeNull();
    expect(await detalhe(cat.produtoChip)).toBeNull();
    expect(await visitante<Detalhe | null>(DETALHE, [ids.outraOrganizacao, cat.produtoAparelho])).toBeNull();
    expect(await detalhe("6d43d3aa-4610-42cc-8573-9ccef3cdc5f3")).toBeNull();
  });

  it("as fotos: a do produto primeiro; o visitante alcança só as vigentes de produto do site", async () => {
    await publicar([cat.produtoAparelho]);
    // Uma foto em uso por produto (ou variação): a trocada fica no histórico, substituída pela do produto.
    const trocada = await foto(cat.produtoAparelho, null, "trocada");
    await db.query("update public.fotos_produto set substituida_em = now() where caminho = $1", [trocada]);
    const doProduto = await foto(cat.produtoAparelho, null, "produto");
    const daVariacao = await foto(cat.produtoAparelho, cat.aparelho, "variacao");
    const daCapa = await foto(cat.produtoCapa, null, "capa");
    expect((await vitrine()).produtos[0]?.foto).toBe(doProduto);
    expect((await detalhe(cat.produtoAparelho)).fotos.map((f) => f.caminho)).toEqual([doProduto, daVariacao]);
    // No armazenamento: o visitante lê só as duas vigentes do Galaxy (nem a trocada, nem a da capa, fora do site).
    await db.query("insert into storage.buckets (id, name) values ('produtos', 'produtos') on conflict (id) do nothing");
    for (const caminho of [daVariacao, doProduto, trocada, daCapa]) await db.query("insert into storage.objects (bucket_id, name) values ('produtos', $1)", [caminho]);
    const alcancadas = await comoUsuario(db, null, async () => (await db.query<{ name: string }>("select name from storage.objects where bucket_id = 'produtos' order by name")).rows.map((r) => r.name));
    expect(alcancadas.sort()).toEqual([daVariacao, doProduto].sort());
    // O visitante não executa nada além da conferência da foto e das duas leituras da vitrine.
    expect(await erroDoVisitante("select privado.preco_do_balcao($1, $2)", [cat.aparelho, ids.lojaA])).toBe("42501");
    expect(await erroDoVisitante("select public.cliente_buscar('documento', '12345678909')", [])).toBe("42501");
  });

  it("um usuário logado de qualquer loja vê o mesmo que o visitante", async () => {
    await publicar([cat.produtoCapa]);
    const s: Sessao = { usuario: ids.vendedorA, sessao: "4e000000-0000-4000-8000-000000000001" };
    const logado = await comoUsuario(db, s, async () => (await db.query<{ v: Vitrine }>(VITRINE, [ids.organizacao, null, null])).rows[0]?.v);
    expect(logado).toEqual(await vitrine());
  });
});

describe("as ofertas de vários produtos de uma vez (ONLINE-i, a vitrine mais rápida)", () => {
  // A regra de antes (privado.ofertas_da_vitrine do lote de 17/11), escrita aqui à parte, para todos os produtos.
  const REGRA_DE_ANTES = `
    select p.id as produto_id, v.id as variante_id, u.id as unidade_id, privado.preco_do_balcao(v.id, u.id) as preco_centavos,
           greatest(coalesce(s.quantidade - s.reservado, 0) + coalesce((
             select sum(r.quantidade)::int from public.estoque_reservas r
             where r.unidade_id = u.id and r.variante_id = v.id and r.situacao = 'ativa' and r.expira_em <= now()), 0), 0) as disponivel
    from public.produtos p
    join public.variantes v on v.produto_id = p.id and v.ativa
    join public.unidades u on u.organizacao_id = p.organizacao_id and u.tipo = 'loja_fisica' and u.status = 'ativa' and u.cnpj is not null
    left join public.estoque_saldos s on s.unidade_id = u.id and s.variante_id = v.id
    where p.organizacao_id = $1 and p.publicar_online and p.ativo and p.tipo in ('aparelho', 'acessorio')
      and privado.preco_do_balcao(v.id, u.id) is not null
    order by 1, 2, 3`;
  const DE_UMA_VEZ = `select o.produto_id, o.variante_id, o.unidade_id, o.preco_centavos, o.disponivel
    from privado.ofertas_dos_produtos($1, (select array_agg(p.id) from public.produtos p where p.organizacao_id = $1)) o order by 1, 2, 3`;
  const UM_POR_UM = `select p.id as produto_id, o.variante_id, o.unidade_id, o.preco_centavos, o.disponivel
    from public.produtos p cross join lateral privado.ofertas_da_vitrine($1, p.id) o where p.organizacao_id = $1 order by 1, 2, 3`;
  type Oferta = { produto_id: string; variante_id: string; unidade_id: string; preco_centavos: number | string; disponivel: number };
  const ler = async (sql: string) => (await db.query<Oferta>(sql, [ids.organizacao])).rows;

  it("dão o mesmo que a regra de antes, de uma vez e produto por produto: o preço de cada loja, a loja sem CNPJ, a variação inativa, o chip fora e a reserva vencida de volta", async () => {
    await publicar([cat.produtoAparelho, cat.produtoCapa, cat.produtoChip]);
    // A capa com preço próprio na Loja B; a Loja C sem CNPJ; uma variação inativa da capa, com preço; 3 capas da Loja A
    // numa reserva que venceu e ainda não foi solta (o disponível conta com elas de volta).
    await db.query("insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem) values ($1, $2, $3, 8900, now(), 'manual')",
      [ids.organizacao, cat.capa, ids.lojaB]);
    await db.query("update public.unidades set cnpj = null where id = $1", [ids.lojaC]);
    const inativa = (await db.query<{ id: string }>("insert into public.variantes (organizacao_id, produto_id, sku, nome, ativa) values ($1, $2, 'ACE-0099', 'Capa antiga', false) returning id",
      [ids.organizacao, cat.produtoCapa])).rows[0]?.id;
    await db.query("insert into public.precos (organizacao_id, variante_id, valor_centavos, inicio, origem) values ($1, $2, 5000, now(), 'manual')", [ids.organizacao, inativa]);
    const reserva = (await db.query<{ id: string }>(`insert into public.estoque_reservas (organizacao_id, unidade_id, variante_id, quantidade, origem, chave_idempotencia, expira_em)
      values ($1, $2, $3, 3, 'pdv', 'online-i:vencida', now() + interval '1 hour') returning id`, [ids.organizacao, ids.lojaA, cat.capa])).rows[0]?.id;
    await db.query("update public.estoque_reservas set expira_em = now() - interval '1 minute' where id = $1", [reserva]);

    const antes = await ler(REGRA_DE_ANTES);
    expect(new Set(antes.map((o) => o.produto_id))).toEqual(new Set([cat.produtoAparelho, cat.produtoCapa]));
    expect(antes.some((o) => o.unidade_id === ids.lojaC || o.variante_id === inativa)).toBe(false);
    const capaNa = (loja: string) => antes.find((o) => o.variante_id === cat.capa && o.unidade_id === loja);
    expect(Number(capaNa(ids.lojaB)?.preco_centavos)).toBe(8_900);
    const saldoA = (await db.query<{ livre: number }>("select (quantidade - reservado)::int as livre from public.estoque_saldos where unidade_id = $1 and variante_id = $2",
      [ids.lojaA, cat.capa])).rows[0]?.livre ?? 0;
    expect(capaNa(ids.lojaA)?.disponivel).toBe(saldoA + 3);
    expect(await ler(DE_UMA_VEZ)).toEqual(antes);
    expect(await ler(UM_POR_UM)).toEqual(antes);
  });

  it("só os produtos pedidos; a lista vazia ou nula não traz nada; o visitante não chama a função; a vitrine segue igual", async () => {
    await publicar([cat.produtoAparelho, cat.produtoCapa]);
    const produtos = async (lista: string[] | null) =>
      (await db.query<{ produto_id: string }>("select distinct produto_id from privado.ofertas_dos_produtos($1, $2)", [ids.organizacao, lista])).rows.map((r) => r.produto_id);
    expect(await produtos([cat.produtoCapa])).toEqual([cat.produtoCapa]);
    expect(await produtos([])).toEqual([]);
    expect(await produtos(null)).toEqual([]);
    expect(await erroDoVisitante("select * from privado.ofertas_dos_produtos($1, $2)", [ids.organizacao, [cat.produtoCapa]])).toBe("42501");
    const v = await vitrine();
    expect(v.produtos.map((p) => p.id).sort()).toEqual([cat.produtoAparelho, cat.produtoCapa].sort());
    expect(v.total).toBe(2);
  });
});
