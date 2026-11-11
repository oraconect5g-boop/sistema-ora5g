// Importação do catálogo por planilha (lote L3c: ORA-CAT-002): prévia validada sem mexer no catálogo,
// aplicação tudo-ou-nada por outra pessoa, desfazer lógico e arquivo que não se aplica duas vezes.
// Banco em memória com todas as migrations; dados FICTÍCIOS (o formato real da Rein é a pendência B1).
// Cada teste numa transação desfeita.
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
const sessao = (usuario: string): Sessao => ({ usuario, sessao: `69000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = sessao(usuario);
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
type Falha = { codigo: string; mensagem: string };
async function tentar<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<{ v: T } | Falha> {
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
  });
}
async function valor<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const codigo = async (s: Sessao | null, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

type Linha = Record<string, unknown>;
const linha = (numero: number, sku: string, extra: Linha = {}): Linha => ({
  numero, sku, nome: `Item ${sku}`, produto: null, tipo: "acessorio", categoria: "Acessórios", marca: null, codigo_barras: null,
  cor: null, capacidade: null, preco: null, custo: null, erros: [], ...extra,
});
const sha = (n: number) => n.toString(16).padStart(64, "0");
const MAPA = { sku: 0, nome: 1, preco: 2 };
type Previa = { id: string; numero: number; repetida: boolean; totais: Record<string, number> };
const PREVIA = "select public.importacao_catalogo_previa($1, $2, $3, $4::jsonb, $5::jsonb) as v";
const APLICAR = "select public.importacao_aplicar($1, $2) as v";
const DESFAZER = "select public.importacao_desfazer($1, $2) as v";
const DESCARTAR = "select public.importacao_descartar($1, $2) as v";
const previa = (s: Sessao, n: number, linhas: Linha[], mapa: object = MAPA) =>
  valor<Previa>(s, PREVIA, [ids.organizacao, `catalogo-${n}.csv`, sha(n), JSON.stringify(mapa), JSON.stringify(linhas)]);
// O preço vigente lê pela visibilidade de quem pergunta: o dono vê a loja A.
const precoParaDono = async (dono: Sessao, variante: string) =>
  Number(await valor<string>(dono, "select public.preco_vigente($1, $2, 'loja', clock_timestamp()) as v", [variante, ids.lojaA]));
const custoAtual = async (variante: string) =>
  Number((await db.query<{ v: string }>("select valor_centavos as v from public.custos where variante_id = $1 order by inicio desc, criado_em desc limit 1", [variante])).rows[0]?.v);

describe("importação do catálogo (L3c)", () => {
  it("prévia: valida cada linha e compara com o catálogo, sem mexer em nada; o mesmo arquivo devolve a mesma prévia", async () => {
    const admin = sessao(ids.administrador);
    const linhas = [
      linha(2, "IMP-0001", { categoria: "acessórios", marca: "Marca Nova", preco: 4_990, custo: 1_500 }),
      linha(3, "ACE-0001", { nome: "Capa de proteção", preco: 8_490 }),
      linha(4, "APA-0001", { nome: "Galaxy A15 128 GB Azul", tipo: "aparelho", preco: 149_900 }),
      linha(5, "SKU COM ESPAÇO"),
      linha(6, "imp-0001"),
      linha(7, "CHI-0001", { tipo: "acessorio" }),
      linha(8, "IMP-0002", { codigo_barras: "7890000000028" }),
      linha(9, "IMP-0003", { tipo: null, erros: ['Tipo desconhecido: "geladeira"'] }),
    ];
    const p = await previa(admin, 1, linhas);
    expect(p.repetida).toBe(false);
    expect(p.totais).toMatchObject({ linhas: 8, criar: 1, atualizar: 1, sem_mudanca: 1, erro: 5, categorias_novas: 0, marcas_novas: 1 });
    const { rows } = await db.query<{ numero: number; acao: string; erros: string[]; diferencas: object }>(
      "select numero, acao, erros, diferencas from public.importacao_linhas where importacao_id = $1 order by numero", [p.id]);
    expect(rows.map((r) => [r.numero, r.acao])).toEqual([[2, "criar"], [3, "atualizar"], [4, "sem_mudanca"], [5, "erro"], [6, "erro"], [7, "erro"], [8, "erro"], [9, "erro"]]);
    expect(rows[1]?.diferencas).toEqual({ preco: [7_900, 8_490] });
    expect(rows[4]?.erros).toEqual(["SKU repetido no arquivo (já na linha 2)"]);
    expect(rows[5]?.erros).toEqual(["O SKU já existe como chip: o tipo não muda pela importação"]);
    expect(rows[6]?.erros).toEqual(["Código de barras já está no SKU ACE-0001"]);
    expect(rows[7]?.erros).toEqual(['Tipo desconhecido: "geladeira"']);
    // Nada mudou no catálogo.
    expect((await db.query("select 1 from public.variantes where sku = 'IMP-0001'")).rows).toHaveLength(0);
    expect(await precoParaDono(sessao(ids.dono), cat.capa)).toBe(7_900);
    expect(await previa(admin, 1, linhas)).toEqual({ ...p, repetida: true });
  });

  it("aplicar: outra pessoa, sem linha com erro, tudo numa transação, com antes e depois guardados", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const comErro = await previa(admin, 2, [linha(2, "IMP-0010"), linha(3, "SKU INVÁLIDO")]);
    expect(await codigo(dono, APLICAR, [comErro.id, "Carga inicial"])).toBe("22023");

    const limpa = await previa(admin, 3, [
      linha(2, "IMP-0011", { nome: "Fone Bluetooth Azul", produto: "Fone Bluetooth", categoria: "Áudio", marca: "Marca Nova", cor: "Azul", preco: 9_990, custo: 4_000 }),
      linha(3, "IMP-0012", { nome: "Fone Bluetooth Preto", produto: "Fone Bluetooth", categoria: "Áudio", marca: "Marca Nova", cor: "Preto", preco: 9_990 }),
      linha(4, "ACE-0001", { nome: "Capa de proteção", preco: 8_490, custo: 2_000 }),
    ]);
    expect(limpa.totais).toMatchObject({ criar: 2, atualizar: 1, erro: 0, categorias_novas: 1, marcas_novas: 1 });
    expect(await codigo(admin, APLICAR, [limpa.id, "Carga inicial"])).toBe("P0002"); // administrador gera, não aplica
    expect(await valor<{ repetida: boolean }>(dono, APLICAR, [limpa.id, "Carga inicial da Santa Cândida"])).toMatchObject({ repetida: false });
    expect(await valor<{ repetida: boolean }>(dono, APLICAR, [limpa.id, "Carga inicial da Santa Cândida"])).toMatchObject({ repetida: true });

    const fones = (await db.query<{ produto_id: string; sku: string; cor: string }>(
      "select produto_id, sku, cor from public.variantes where sku in ('IMP-0011', 'IMP-0012') order by sku")).rows;
    expect(fones.map((f) => [f.sku, f.cor])).toEqual([["IMP-0011", "Azul"], ["IMP-0012", "Preto"]]);
    expect(fones[0]?.produto_id).toBe(fones[1]?.produto_id); // o mesmo modelo agrupa as cores
    const fone = (await db.query<{ id: string }>("select id from public.variantes where sku = 'IMP-0011'")).rows[0]?.id ?? "";
    expect(await precoParaDono(dono, fone)).toBe(9_990);
    expect(await precoParaDono(dono, cat.capa)).toBe(8_490);
    expect(await custoAtual(cat.capa)).toBe(2_000);
    const capa = (await db.query<{ antes: Record<string, unknown>; depois: Record<string, unknown> }>(
      "select antes, depois from public.importacao_linhas where importacao_id = $1 and numero = 4", [limpa.id])).rows[0];
    expect([capa?.antes.preco, capa?.depois.preco, capa?.antes.custo, capa?.depois.custo]).toEqual([7_900, 8_490, 1_800, 2_000]);
    const origem = (await db.query<{ origem: string; motivo: string }>(
      "select origem, motivo from public.precos where variante_id = $1 and fim is null and unidade_id is null and canal = 'loja'", [cat.capa])).rows[0];
    expect(origem).toEqual({ origem: "importacao", motivo: expect.stringMatching(/^Importação nº \d+: Carga inicial da Santa Cândida$/) });

    // O mesmo arquivo não se aplica de novo, nem por prévia nova.
    expect(await codigo(admin, PREVIA, [ids.organizacao, "catalogo-3.csv", sha(3), JSON.stringify({ outro: 1 }), JSON.stringify([linha(2, "IMP-0013")])])).toBe("OR023");
  });

  it("quem gerou a prévia não aprova, mesmo tendo as duas permissões (OR024)", async () => {
    await db.query("insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, inicio) values ($1, $2, 'dono', 'organizacao', now() - interval '1 day')",
      [ids.administrador, ids.organizacao]);
    const admin = sessao(ids.administrador);
    const p = await previa(admin, 4, [linha(2, "IMP-0020")]);
    expect(await codigo(admin, APLICAR, [p.id, "Aprovando a própria"])).toBe("OR024");
  });

  it("desfazer: volta o que ainda está como a importação deixou, inativa o criado sem uso e mantém o que mudou depois", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const p = await previa(admin, 5, [
      linha(2, "IMP-0030", { nome: "Carregador Turbo", preco: 5_990 }),
      linha(3, "ACE-0001", { nome: "Capa de proteção premium", preco: 8_490, custo: 2_000 }),
    ]);
    await valor(dono, APLICAR, [p.id, "Carga de teste"]);
    const carregador = (await db.query<{ id: string }>("select id from public.variantes where sku = 'IMP-0030'")).rows[0]?.id ?? "";
    // Depois da importação, alguém troca o nome da capa pela tela: o desfazer não mexe nesse nome.
    await valor(dono, "select public.catalogo_salvar_variante($1, $2, 'ACE-0001', 'Capa de proteção slim', null, null, '7890000000028', 0, null, 'Nome novo') as v",
      [cat.produtoCapa, cat.capa]);

    const r = await valor<{ desfeitas: number; mantidas: number }>(dono, DESFAZER, [p.id, "Arquivo errado"]);
    expect(r).toMatchObject({ desfeitas: 2, mantidas: 0 });
    const variantes = (await db.query<{ sku: string; nome: string; ativa: boolean }>(
      "select sku, nome, ativa from public.variantes where sku in ('IMP-0030', 'ACE-0001') order by sku")).rows;
    expect(variantes).toEqual([{ sku: "ACE-0001", nome: "Capa de proteção slim", ativa: true }, { sku: "IMP-0030", nome: "Carregador Turbo", ativa: false }]);
    expect(await precoParaDono(dono, cat.capa)).toBe(7_900);
    expect(await custoAtual(cat.capa)).toBe(1_800);
    // O preço aberto pela importação foi fechado: a variação fica sem preço (e não aparece para venda).
    expect(await valor<string | null>(dono, "select public.preco_vigente($1, $2, 'loja', clock_timestamp()) as v", [carregador, ids.lojaA])).toBeNull();
    expect((await db.query("select situacao from public.importacoes where id = $1", [p.id])).rows[0]).toEqual({ situacao: "desfeita" });
    expect(await valor<{ repetida: boolean }>(dono, DESFAZER, [p.id, "Arquivo errado"])).toMatchObject({ repetida: true });
    // Nada foi apagado: o histórico tem o preço de antes, o da importação e o que o desfazer gravou.
    const historico = (await db.query<{ valor_centavos: string; aberto: boolean; motivo: string | null }>(
      "select valor_centavos, fim is null as aberto, motivo from public.precos where variante_id = $1 and unidade_id is null and canal = 'loja' order by inicio", [cat.capa])).rows;
    expect(historico.map((h) => [Number(h.valor_centavos), h.aberto])).toEqual([[7_900, false], [8_490, false], [7_900, true]]);
    expect(historico[2]?.motivo).toMatch(/^Desfaz a importação nº \d+: Arquivo errado$/);
  });

  it("descartar encerra a prévia; permissões: dono não gera, vendedor, gerente e outra rede não fazem nada e não leem", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const p = await previa(admin, 6, [linha(2, "IMP-0040")]);
    expect(await codigo(dono, PREVIA, [ids.organizacao, "x.csv", sha(7), JSON.stringify(MAPA), JSON.stringify([linha(2, "IMP-0041")])])).toBe("42501");
    for (const s of [await naLoja(ids.vendedorA, ids.lojaA), await naLoja(ids.gerenteB, ids.lojaB), sessao(ids.donoOutraOrg)]) {
      expect(await codigo(s, PREVIA, [ids.organizacao, "x.csv", sha(8), JSON.stringify(MAPA), JSON.stringify([linha(2, "IMP-0042")])])).toBe("42501");
      expect(await codigo(s, APLICAR, [p.id, "Tentativa"])).toBe("P0002");
      expect(await codigo(s, DESCARTAR, [p.id, "Tentativa"])).toBe("P0002");
      expect(await comoUsuario(db, s, async () => (await db.query("select id from public.importacoes")).rows)).toEqual([]);
      expect(await comoUsuario(db, s, async () => (await db.query("select numero from public.importacao_linhas")).rows)).toEqual([]);
    }
    expect((await comoUsuario(db, dono, async () => (await db.query("select id from public.importacoes")).rows)).length).toBe(1);
    expect(await valor<boolean>(admin, DESCARTAR, [p.id, "Arquivo da semana errada"])).toBe(true);
    expect(await codigo(dono, APLICAR, [p.id, "Tentativa"])).toBe("22023");
    expect(await codigo(admin, PREVIA, [ids.organizacao, "x.csv", sha(9), JSON.stringify(MAPA), "[]"])).toBe("22023");
  });
});
