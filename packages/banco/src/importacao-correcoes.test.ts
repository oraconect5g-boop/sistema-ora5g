// Correções do importador (lote R2) que precisam de transações de verdade. O preço manual começa na hora de
// início da transação, e por isso não cabe duas vezes no teste que roda inteiro numa transação só; e a migration
// tem de ser provada sobre dados deixados pelas funções ANTIGAS. Aqui cada bloco monta o seu banco em memória e
// cada comando é uma transação (como na API), sem desfazer no fim. Dados FICTÍCIOS.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, migrations, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let sessoes = 0;
const sessao = (usuario: string): Sessao => ({ usuario, sessao: `69200000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });
const chamar = <T>(db: PGlite, s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const codigoDe = async (db: PGlite, s: Sessao, sql: string, params: unknown[] = []) => {
  try {
    await chamar(db, s, sql, params);
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "sem-codigo";
  }
};
// O relógio do banco em memória anda em milissegundos: dois preços seguidos da mesma variação poderiam cair no
// mesmo instante, que o banco recusa (40001, "tente de novo"). A pausa tira essa sorte do teste.
const pausa = () => new Promise((pronto) => setTimeout(pronto, 15));

type Linha = Record<string, unknown>;
const linha = (numero: number, sku: string, extra: Linha = {}): Linha => ({
  numero, sku, nome: `Item ${sku}`, produto: null, tipo: "acessorio", categoria: "Acessórios", marca: null, codigo_barras: null,
  cor: null, capacidade: null, preco: null, custo: null, erros: [], ...extra,
});
const sha = (n: number) => n.toString(16).padStart(64, "0");
const MAPA = { sku: 0, nome: 1, preco: 2 };
const PREVIA = "select public.importacao_catalogo_previa($1, $2, $3, $4::jsonb, $5::jsonb) as v";
const APLICAR = "select public.importacao_aplicar($1, $2, $3) as v";
const APLICAR_ANTIGA = "select public.importacao_aplicar($1, $2) as v";
const DESFAZER = "select public.importacao_desfazer($1, $2) as v";
const DEFINIR = "select public.preco_definir($1, $2, 'loja', $3, null, $4) as v";
type Previa = { id: string; numero: number; totais: Record<string, number> };
type Aplicada = { repetida: boolean; atualizada: boolean; comparacao: number; totais: Record<string, number> };
type Desfeito = { situacao: string; revertidos: string[]; mantidos: Record<string, string> };
type LinhaLida = {
  numero: number; acao: string; erros: string[]; erros_arquivo: string[]; base: object | null; desfeito: Desfeito | null;
  preco_id: string | null; custo_id: string | null; auditoria_id: string | number | null; variante_id: string | null;
};

const previa = (db: PGlite, s: Sessao, n: number, linhas: Linha[]) =>
  chamar<Previa>(db, s, PREVIA, [ids.organizacao, `catalogo-${n}.csv`, sha(n), JSON.stringify(MAPA), JSON.stringify(linhas)]);
const linhasDe = async (db: PGlite, id: string) =>
  (await db.query<LinhaLida>(
    "select numero, acao, erros, erros_arquivo, base, desfeito, preco_id, custo_id, auditoria_id, variante_id from public.importacao_linhas where importacao_id = $1 order by numero", [id])).rows;
const variante = async (db: PGlite, sku: string) =>
  (await db.query<{ id: string; nome: string; ativa: boolean }>("select id, nome, ativa from public.variantes where sku = $1", [sku])).rows[0];
const precoNaLojaA = async (db: PGlite, dono: Sessao, id: string) =>
  Number(await chamar<string>(db, dono, "select public.preco_vigente($1, $2, 'loja', clock_timestamp()) as v", [id, ids.lojaA]));
type Preco = { id: string; valor: number; aberto: boolean; cancelado: boolean; origem: string };
const precosGerais = async (db: PGlite, id: string) =>
  (await db.query<{ id: string; valor: string; aberto: boolean; cancelado: boolean; origem: string }>(
    `select id, valor_centavos as valor, fim is null as aberto, cancelado_em is not null as cancelado, origem
     from public.precos where variante_id = $1 and unidade_id is null and canal = 'loja' order by inicio, criado_em`, [id]))
    .rows.map((p): Preco => ({ ...p, valor: Number(p.valor) }));
const custos = async (db: PGlite, id: string) =>
  (await db.query<{ id: string; valor: string; origem: string; referencia: string | null }>(
    "select id, valor_centavos as valor, origem, referencia from public.custos where variante_id = $1 order by inicio, criado_em", [id]))
    .rows.map((c) => ({ ...c, valor: Number(c.valor) }));

describe("importador R2: preço definido depois do lote (REV-NOV-007)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await criarBanco();
    await montarCenario(db);
    await montarCatalogo(db);
  });
  afterAll(async () => { await db.close(); });

  it("desfazer mantém o preço que o dono definiu depois do lote, mesmo igual ao do lote, e volta só o preço que ninguém tocou", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const p = await previa(db, admin, 1, [
      linha(2, "ACE-0001", { nome: "Capa de proteção", preco: 9_000 }),
      linha(3, "APA-0001", { nome: "Galaxy A15 128 GB Azul", tipo: "aparelho", preco: 159_900 }),
      linha(4, "IMP-0500", { nome: "Fone R2", preco: 5_000 }),
    ]);
    expect(await chamar<Aplicada>(db, dono, APLICAR, [p.id, "Conferido", 1])).toMatchObject({ repetida: false, atualizada: false });
    const doLote = (await linhasDe(db, p.id)).map((l) => l.preco_id);
    expect(doLote.every((id) => id !== null)).toBe(true);
    const fone = await variante(db, "IMP-0500");

    // Depois do lote, o dono leva a capa de R$ 90 a R$ 120 e de volta a R$ 90: o valor é o do lote, mas a
    // decisão é dele e é posterior. O fone, criado pelo lote, ganha preço manual. O aparelho ninguém tocou.
    await pausa();
    await chamar(db, dono, DEFINIR, [cat.capa, null, 12_000, "Reajuste"]);
    await pausa();
    await chamar(db, dono, DEFINIR, [cat.capa, null, 9_000, "Voltou ao preço"]);
    await chamar(db, dono, DEFINIR, [fone?.id, null, 6_000, "Preço do fone"]);
    const capaAntes = await precosGerais(db, cat.capa);
    expect(capaAntes.map((x) => [x.valor, x.aberto])).toEqual([[7_900, false], [9_000, false], [12_000, false], [9_000, true]]);
    expect(capaAntes[1]?.id).toBe(doLote[0]);
    await pausa();

    expect(await chamar(db, dono, DESFAZER, [p.id, "Arquivo errado"])).toEqual({ repetida: false, desfeitas: 1, parciais: 0, mantidas: 2 });
    expect((await linhasDe(db, p.id)).map((l) => l.desfeito)).toEqual([
      { situacao: "mantida", revertidos: [], mantidos: { preco: "alterado_depois" } },
      { situacao: "desfeita", revertidos: ["preco"], mantidos: {} },
      { situacao: "mantida", revertidos: [], mantidos: { variacao: "alterada_depois" } },
    ]);
    // A capa continua com o preço manual e o histórico dela ficou como estava: nada fechado, nada cancelado.
    expect(await precoNaLojaA(db, dono, cat.capa)).toBe(9_000);
    expect(await precosGerais(db, cat.capa)).toEqual(capaAntes);
    // O aparelho voltou ao preço anterior ao lote; o preço do lote ficou fechado no histórico.
    expect(await precoNaLojaA(db, dono, cat.aparelho)).toBe(149_900);
    expect((await precosGerais(db, cat.aparelho)).map((x) => [x.valor, x.aberto, x.cancelado])).toEqual([
      [149_900, false, false], [159_900, false, false], [149_900, true, false],
    ]);
    // O fone continua à venda pelo preço que o dono definiu.
    expect(await variante(db, "IMP-0500")).toMatchObject({ ativa: true });
    expect(await precoNaLojaA(db, dono, fone?.id ?? "")).toBe(6_000);
  });
});

describe("importador R2: a migration sobre dados deixados pelas funções antigas", () => {
  const r2 = migrations().find((m) => m.nome.endsWith("_importador_correcoes.sql"));
  let db: PGlite;
  let admin: Sessao;
  let dono: Sessao;
  let desfeitaAntes: Previa; // aplicada e desfeita pelas funções antigas
  let aplicada: Previa; // aplicada pela função antiga, ainda de pé
  let aberta: Previa; // prévia antiga sem erro, ainda não aplicada
  let comErro: Previa; // prévia antiga com erros do arquivo e do cadastro

  beforeAll(async () => {
    if (!r2) throw new Error("migration do lote R2 não encontrada");
    db = await criarBanco({ antesDe: r2.nome });
    await montarCenario(db);
    await montarCatalogo(db);
    admin = sessao(ids.administrador);
    dono = sessao(ids.dono);

    desfeitaAntes = await previa(db, admin, 10, [linha(2, "CHI-0001", { nome: "Chip pré-pago 5G", tipo: "chip" })]);
    await chamar(db, dono, APLICAR_ANTIGA, [desfeitaAntes.id, "Conferido"]);
    await chamar(db, dono, DESFAZER, [desfeitaAntes.id, "Nome errado"]);

    aplicada = await previa(db, admin, 11, [
      linha(2, "ACE-0001", { nome: "Capa premium", preco: 8_490, custo: 2_000 }),
      linha(3, "APA-0001", { nome: "Galaxy A15 128 GB Azul", tipo: "aparelho", preco: 159_900 }),
      linha(4, "LEG-0001", { nome: "Cabo legado", preco: 2_990, custo: 900 }),
      linha(5, "LEG-0002", { nome: "Suporte legado", preco: 1_990 }),
    ]);
    await pausa();
    await chamar(db, dono, APLICAR_ANTIGA, [aplicada.id, "Conferido"]);
    // Depois do lote antigo: o dono muda o preço do aparelho e o suporte recebe estoque.
    await pausa();
    await chamar(db, dono, DEFINIR, [cat.aparelho, null, 169_900, "Reajuste"]);
    const suporte = await variante(db, "LEG-0002");
    await db.query("select privado.lancar_movimento($1, $2, 3, 'entrada_importacao', null, null, null, null, 'teste:r2:legado')", [ids.lojaA, suporte?.id]);

    aberta = await previa(db, admin, 12, [
      linha(2, "CHI-0001", { nome: "Chip pré-pago 4G", tipo: "chip" }),
      linha(3, "LEG-0003", { nome: "Película legada" }),
    ]);
    comErro = await previa(db, admin, 13, [
      linha(2, "LEG-0004", { codigo_barras: "7890000000028", erros: ['Preço inválido: "abc"'] }),
      linha(3, "CHI-0001", { tipo: "acessorio" }),
      linha(4, "SKU COM ESPAÇO"),
    ]);

    // O esquema antigo aceitava nomes e SKUs que só diferem nas maiúsculas.
    await db.query("insert into public.categorias (organizacao_id, nome, criado_em) values ($1, 'CHIPS', '2030-01-01')", [ids.organizacao]);
    await db.query("insert into public.marcas (organizacao_id, nome, criado_em) values ($1, 'SAMSUNG', '2030-01-01')", [ids.organizacao]);
    await db.query("insert into public.variantes (organizacao_id, produto_id, sku, nome, criado_em) values ($1, $2, 'ace-0001', 'Capa repetida', '2030-01-01')",
      [ids.organizacao, cat.produtoCapa]);

    for (const m of migrations()) {
      if (m.nome >= r2.nome) await db.exec(m.sql);
    }
  }, 120_000);
  afterAll(async () => { await db.close(); });

  it("renomeia as duplicatas que o esquema antigo deixou, com auditoria, e cria os índices únicos", async () => {
    const nomes = async (sql: string) => (await db.query<{ v: string }>(sql, [ids.organizacao])).rows.map((r) => r.v);
    expect(await nomes("select nome as v from public.categorias where organizacao_id = $1 and lower(nome) like 'chips%' order by criado_em")).toEqual(["Chips", "CHIPS (duplicada 2)"]);
    expect(await nomes("select nome as v from public.marcas where organizacao_id = $1 order by criado_em")).toEqual(["Samsung", "SAMSUNG (duplicada 2)"]);
    expect(await nomes("select sku as v from public.variantes where organizacao_id = $1 and lower(sku) like 'ace-0001%' order by criado_em")).toEqual(["ACE-0001", "ace-0001-DUP2"]);
    const trilha = (await db.query<{ alvo_tipo: string }>(
      "select alvo_tipo from public.auditoria where motivo = 'Reconciliação de nomes equivalentes (R2)' order by id")).rows;
    expect(trilha.map((t) => t.alvo_tipo)).toEqual(["categorias", "marcas", "variantes"]);
    const indices = (await db.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'public' and indexname like '%\\_normalizado' order by indexname")).rows.map((r) => r.indexname);
    expect(indices).toEqual(["categorias_nome_normalizado", "marcas_nome_normalizado", "produtos_nome_normalizado", "variantes_sku_normalizado"]);
    await expect(db.query("insert into public.categorias (organizacao_id, nome) values ($1, 'chips')", [ids.organizacao])).rejects.toMatchObject({ code: "23505" });
  });

  it("separa, nas prévias antigas, os erros do arquivo dos erros que dependem do cadastro", async () => {
    const linhas = await linhasDe(db, comErro.id);
    expect(linhas.map((l) => l.erros)).toEqual([
      ['Preço inválido: "abc"', "Código de barras já está no SKU ACE-0001"],
      ["O SKU já existe como chip: o tipo não muda pela importação"],
      ["SKU ausente ou inválido (letras, números, ponto, hífen, barra ou sublinhado, até 60)"],
    ]);
    expect(linhas.map((l) => l.erros_arquivo)).toEqual([
      ['Preço inválido: "abc"'],
      [],
      ["SKU ausente ou inválido (letras, números, ponto, hífen, barra ou sublinhado, até 60)"],
    ]);
    expect(linhas.every((l) => l.base === null)).toBe(true);
  });

  it("acha o preço, o custo e o evento de auditoria que a aplicação antiga gravou em cada linha", async () => {
    const linhas = await linhasDe(db, aplicada.id);
    const capaPrecos = await precosGerais(db, cat.capa);
    const capaCustos = await custos(db, cat.capa);
    // O preço do cenário também tem origem "importacao": o que identifica o do lote é o motivo com o número dele.
    expect(capaPrecos.map((x) => [x.valor, x.aberto, x.origem])).toEqual([[7_900, false, "importacao"], [8_490, true, "importacao"]]);
    expect(linhas[0]?.preco_id).toBe(capaPrecos[1]?.id);
    expect(capaCustos.map((c) => [c.valor, c.referencia])).toEqual([[1_800, capaCustos[0]?.referencia], [2_000, `importacao:${aplicada.numero}:2`]]);
    expect(linhas[0]?.custo_id).toBe(capaCustos[1]?.id);
    // Aparelho e suporte não trouxeram custo; a linha do aparelho não mudou campo nenhum (sem evento: marco zero).
    expect(linhas.map((l) => [l.numero, l.preco_id !== null, l.custo_id !== null, Number(l.auditoria_id) > 0])).toEqual([
      [2, true, true, true], [3, true, false, false], [4, true, true, true], [5, true, false, true],
    ]);
    // A prévia antiga que ninguém aplicou não ganha identidade nenhuma.
    expect((await linhasDe(db, aberta.id)).every((l) => l.preco_id === null && l.custo_id === null && l.auditoria_id === null)).toBe(true);
  });

  it("desfaz pela identidade uma importação aplicada pela função antiga: volta o que é do lote e mantém o que mudou depois", async () => {
    expect(await chamar(db, dono, DESFAZER, [aplicada.id, "Arquivo errado"])).toEqual({ repetida: false, desfeitas: 2, parciais: 0, mantidas: 2 });
    expect((await linhasDe(db, aplicada.id)).map((l) => l.desfeito)).toEqual([
      { situacao: "desfeita", revertidos: ["nome", "preco", "custo"], mantidos: {} },
      { situacao: "mantida", revertidos: [], mantidos: { preco: "alterado_depois" } },
      { situacao: "desfeita", revertidos: ["variacao"], mantidos: {} },
      { situacao: "mantida", revertidos: [], mantidos: { variacao: "em_uso" } },
    ]);
    expect(await variante(db, "ACE-0001")).toMatchObject({ nome: "Capa de proteção", ativa: true });
    expect(await precoNaLojaA(db, dono, cat.capa)).toBe(7_900);
    const capaCustos = await custos(db, cat.capa);
    expect(capaCustos.map((c) => c.valor)).toEqual([1_800, 2_000, 1_800]);
    expect(capaCustos[2]).toMatchObject({ origem: "manual", referencia: `desfaz:importacao:${aplicada.numero}:2` });
    expect(await precoNaLojaA(db, dono, cat.aparelho)).toBe(169_900);
    expect(await variante(db, "LEG-0001")).toMatchObject({ ativa: false });
    expect(await variante(db, "LEG-0002")).toMatchObject({ ativa: true });
    // A que já tinha sido desfeita pela função antiga não tem contagem gravada: a repetição diz só que é repetida.
    expect(await chamar(db, dono, DESFAZER, [desfeitaAntes.id, "Nome errado"])).toEqual({ repetida: true });
  });

  it("prévia antiga não se aplica sem nova conferência: a função antiga some e a primeira tentativa refaz a comparação", async () => {
    // Quem ainda chamar a função antiga (sem a comparação conferida) recebe erro, nunca uma aplicação às cegas.
    expect(await codigoDe(db, dono, APLICAR_ANTIGA, [aberta.id, "Conferido"])).toBe("42883");
    expect(await chamar<Aplicada>(db, dono, APLICAR, [aberta.id, "Conferido", 1])).toMatchObject({
      repetida: false, atualizada: true, comparacao: 2, totais: { linhas: 2, criar: 1, atualizar: 1, erro: 0 },
    });
    expect(await variante(db, "LEG-0003")).toBeUndefined();
    expect((await linhasDe(db, aberta.id)).every((l) => l.base !== null)).toBe(true);
    expect(await chamar<Aplicada>(db, dono, APLICAR, [aberta.id, "Conferido", 2])).toMatchObject({ repetida: false, atualizada: false });
    expect(await variante(db, "CHI-0001")).toMatchObject({ nome: "Chip pré-pago 4G" });
    expect(await variante(db, "LEG-0003")).toMatchObject({ ativa: true });

    // Na prévia antiga com erro, a comparação refeita guarda os erros do arquivo e recalcula os do cadastro.
    expect(await chamar<Aplicada>(db, dono, APLICAR, [comErro.id, "Conferido", 1])).toMatchObject({ atualizada: true, comparacao: 2, totais: { erro: 3 } });
    expect((await linhasDe(db, comErro.id)).map((l) => l.erros)).toEqual([
      ['Preço inválido: "abc"', "Código de barras já está no SKU ACE-0001"],
      ["O SKU já existe como chip: o tipo não muda pela importação"],
      ["SKU ausente ou inválido (letras, números, ponto, hífen, barra ou sublinhado, até 60)"],
    ]);
    expect(await codigoDe(db, dono, APLICAR, [comErro.id, "Conferido", 2])).toBe("22023");
  });
});
