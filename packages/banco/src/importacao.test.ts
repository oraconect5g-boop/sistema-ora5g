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
type Previa = { id: string; numero: number; repetida: boolean; atualizada: boolean; totais: Record<string, number> };
const PREVIA = "select public.importacao_catalogo_previa($1, $2, $3, $4::jsonb, $5::jsonb) as v";
const APLICAR = "select public.importacao_aplicar($1, $2, $3) as v";
const DESFAZER = "select public.importacao_desfazer($1, $2) as v";
const DESCARTAR = "select public.importacao_descartar($1, $2) as v";
type Aplicada = { repetida: boolean; atualizada: boolean; comparacao: number; totais: Record<string, number> };
type Desfeita = { repetida: boolean; desfeitas: number; parciais: number; mantidas: number };
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
    expect(await codigo(dono, APLICAR, [comErro.id, "Carga inicial", 1])).toBe("22023");

    const limpa = await previa(admin, 3, [
      linha(2, "IMP-0011", { nome: "Fone Bluetooth Azul", produto: "Fone Bluetooth", categoria: "Áudio", marca: "Marca Nova", cor: "Azul", preco: 9_990, custo: 4_000 }),
      linha(3, "IMP-0012", { nome: "Fone Bluetooth Preto", produto: "Fone Bluetooth", categoria: "Áudio", marca: "Marca Nova", cor: "Preto", preco: 9_990 }),
      linha(4, "ACE-0001", { nome: "Capa de proteção", preco: 8_490, custo: 2_000 }),
    ]);
    expect(limpa.totais).toMatchObject({ criar: 2, atualizar: 1, erro: 0, categorias_novas: 1, marcas_novas: 1 });
    expect(await codigo(admin, APLICAR, [limpa.id, "Carga inicial", 1])).toBe("P0002"); // administrador gera, não aplica
    expect(await valor<{ repetida: boolean }>(dono, APLICAR, [limpa.id, "Carga inicial da Santa Cândida", 1])).toMatchObject({ repetida: false });
    expect(await valor<{ repetida: boolean }>(dono, APLICAR, [limpa.id, "Carga inicial da Santa Cândida", 1])).toMatchObject({ repetida: true });

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
    expect(await codigo(admin, APLICAR, [p.id, "Aprovando a própria", 1])).toBe("OR024");
  });

  it("desfazer: volta o que ainda está como a importação deixou, inativa o criado sem uso e mantém o que mudou depois", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const p = await previa(admin, 5, [
      linha(2, "IMP-0030", { nome: "Carregador Turbo", preco: 5_990 }),
      linha(3, "ACE-0001", { nome: "Capa de proteção premium", preco: 8_490, custo: 2_000 }),
    ]);
    await valor(dono, APLICAR, [p.id, "Carga de teste", 1]);
    const carregador = (await db.query<{ id: string }>("select id from public.variantes where sku = 'IMP-0030'")).rows[0]?.id ?? "";
    // Depois da importação, alguém troca o nome da capa pela tela: o desfazer não mexe nesse nome.
    await valor(dono, "select public.catalogo_salvar_variante($1, $2, 'ACE-0001', 'Capa de proteção slim', null, null, '7890000000028', 0, null, 'Nome novo') as v",
      [cat.produtoCapa, cat.capa]);

    const r = await valor<Desfeita>(dono, DESFAZER, [p.id, "Arquivo errado"]);
    expect(r).toEqual({ repetida: false, desfeitas: 1, parciais: 1, mantidas: 0 });
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
      expect(await codigo(s, APLICAR, [p.id, "Tentativa", 1])).toBe("P0002");
      expect(await codigo(s, DESCARTAR, [p.id, "Tentativa"])).toBe("P0002");
      expect(await comoUsuario(db, s, async () => (await db.query("select id from public.importacoes")).rows)).toEqual([]);
      expect(await comoUsuario(db, s, async () => (await db.query("select numero from public.importacao_linhas")).rows)).toEqual([]);
    }
    expect((await comoUsuario(db, dono, async () => (await db.query("select id from public.importacoes")).rows)).length).toBe(1);
    expect(await valor<boolean>(admin, DESCARTAR, [p.id, "Arquivo da semana errada"])).toBe(true);
    expect(await codigo(dono, APLICAR, [p.id, "Tentativa", 1])).toBe("22023");
    expect(await codigo(admin, PREVIA, [ids.organizacao, "x.csv", sha(9), JSON.stringify(MAPA), "[]"])).toBe("22023");
  });
});

// ---------------------------------------------------------------------------------------------------------
// Lote R2 (migration *_importador_correcoes): prévia desatualizada (REV-NOV-002), unicidade sem diferença de
// maiúsculas (REV-NOV-006), desfazer por identidade (REV-NOV-007 e observação REV-NOV-003) e conferência do
// arquivo inteiro (REV-NOV-008, a parte do banco). Preço mudado DEPOIS de aplicar e dados anteriores à
// migration ficam em importacao-correcoes.test.ts: aqui cada teste é uma transação só, e nela now() não anda.
// ---------------------------------------------------------------------------------------------------------
const DEFINIR = "select public.preco_definir($1, $2, 'loja', $3, null, $4) as v";
const SALVAR_VARIANTE = "select public.catalogo_salvar_variante($1, $2, $3, $4, $5, $6, $7, 0, $8, $9) as v";
const SALVAR_CATEGORIA = "select public.catalogo_salvar_categoria($1, $2, $3, $4, $5) as v";
const SALVAR_MARCA = "select public.catalogo_salvar_marca($1, $2, $3, $4) as v";
const ENTRADA = "select public.estoque_registrar_entrada($1, 'carga_inicial', null, null, $2::jsonb, $3, $4) as v";
const aplicar = (s: Sessao, id: string, comparacao: number, motivo = "Conferido") => valor<Aplicada>(s, APLICAR, [id, motivo, comparacao]);
type Desfeito = { situacao: string; revertidos: string[]; mantidos: Record<string, string> };
type LinhaLida = {
  numero: number; acao: string; erros: string[]; diferencas: Record<string, unknown>; base: Record<string, unknown> | null;
  antes: Record<string, unknown> | null; depois: Record<string, unknown> | null; desfeito: Desfeito | null;
  preco_id: string | null; custo_id: string | null; variante_id: string | null;
};
const linhasDe = async (id: string) => (await db.query<LinhaLida>(
  "select numero, acao, erros, diferencas, base, antes, depois, desfeito, preco_id, custo_id, variante_id from public.importacao_linhas where importacao_id = $1 order by numero", [id])).rows;
type ImportacaoLida = { situacao: string; comparacao: number; comparado_em: Date | null; desfazer: Record<string, number> | null; totais: Record<string, number> };
const importacao = async (id: string) => (await db.query<ImportacaoLida>(
  "select situacao, comparacao, comparado_em, desfazer, totais from public.importacoes where id = $1", [id])).rows[0];
const variante = async (sku: string) => (await db.query<{ id: string; produto_id: string; sku: string; nome: string; cor: string | null; codigo_barras: string | null; ativa: boolean }>(
  "select id, produto_id, sku, nome, cor, codigo_barras, ativa from public.variantes where sku = $1", [sku])).rows[0];
// Escrita direta (sem sessão, como o dono do banco): devolve o código do erro ou nulo.
async function direto(sql: string, params: unknown[] = []): Promise<string | null> {
  await db.exec("savepoint direto");
  try {
    await db.query(sql, params);
    await db.exec("release savepoint direto");
    return null;
  } catch (e) {
    await db.exec("rollback to savepoint direto");
    await db.exec("release savepoint direto");
    return (e as { code?: string }).code ?? "sem-codigo";
  }
}

describe("importação do catálogo: correções do lote R2", () => {
  it("REV-NOV-002: preço mudado depois da prévia não é sobrescrito; a comparação é refeita e só a versão conferida se aplica", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const p = await previa(admin, 20, [linha(2, "ACE-0001", { nome: "Capa de proteção", preco: 9_000 })]);
    expect(p).toMatchObject({ repetida: false, atualizada: false, totais: { atualizar: 1 } });
    expect((await linhasDe(p.id))[0]).toMatchObject({ acao: "atualizar", diferencas: { preco: [7_900, 9_000] }, base: { nome: "Capa de proteção", preco: 7_900 } });
    expect(await importacao(p.id)).toMatchObject({ situacao: "previa", comparacao: 1, comparado_em: null });
    // Depois da prévia, o dono troca o preço da capa pela tela de preços.
    await valor(dono, DEFINIR, [cat.capa, null, 12_000, "Reajuste da semana"]);

    // A pessoa conferiu a comparação 1 (R$ 79,00 → R$ 90,00): nada é gravado e a prévia volta comparada de novo.
    expect(await aplicar(dono, p.id, 1)).toMatchObject({ repetida: false, atualizada: true, comparacao: 2, totais: { atualizar: 1 } });
    expect(await precoParaDono(dono, cat.capa)).toBe(12_000);
    const refeita = await importacao(p.id);
    expect(refeita).toMatchObject({ situacao: "previa", comparacao: 2 });
    expect(refeita?.comparado_em).not.toBeNull();
    expect((await linhasDe(p.id))[0]).toMatchObject({ acao: "atualizar", diferencas: { preco: [12_000, 9_000] }, base: { preco: 12_000 }, antes: null, depois: null });
    const evento = (await db.query<{ motivo: string; antes: { comparacao: number }; depois: { comparacao: number } }>(
      "select motivo, antes, depois from public.auditoria where alvo_tipo = 'importacoes' and alvo_id = $1 order by id desc limit 1", [p.id])).rows[0];
    expect(evento?.motivo).toBe("Comparação da prévia refeita: o cadastro mudou depois dela");
    expect([evento?.antes.comparacao, evento?.depois.comparacao]).toEqual([1, 2]);
    // Insistir na versão antiga continua sem gravar; sem dizer a versão conferida não se aplica.
    expect(await aplicar(dono, p.id, 1)).toMatchObject({ repetida: false, atualizada: true, comparacao: 2 });
    expect(await codigo(dono, APLICAR, [p.id, "Conferido", null])).toBe("22023");
    expect(await precoParaDono(dono, cat.capa)).toBe(12_000);
    expect((await importacao(p.id))?.comparacao).toBe(2);
    // Conferida a comparação 2 (R$ 120,00 → R$ 90,00), aplica.
    expect(await aplicar(dono, p.id, 2)).toMatchObject({ repetida: false, atualizada: false, comparacao: 2 });
    expect(await precoParaDono(dono, cat.capa)).toBe(9_000);
    const [aplicada] = await linhasDe(p.id);
    expect([aplicada?.antes?.preco, aplicada?.depois?.preco]).toEqual([12_000, 9_000]);
    expect(aplicada?.preco_id).not.toBeNull();
    expect(await aplicar(dono, p.id, 1)).toMatchObject({ repetida: true, atualizada: false });
  });

  it("REV-NOV-002: reenviar o mesmo arquivo refaz a comparação; quem conferiu a anterior não aplica sem conferir de novo", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const linhas = [
      linha(2, "ACE-0001", { nome: "Capa de proteção", preco: 8_490 }),
      linha(3, "APA-0001", { nome: "Galaxy A15 128 GB Azul", tipo: "aparelho", preco: 149_900 }),
      linha(4, "IMP-0100", { nome: "Película 3D", preco: 2_990 }),
    ];
    const p = await previa(admin, 21, linhas);
    expect(p.totais).toMatchObject({ linhas: 3, criar: 1, atualizar: 1, sem_mudanca: 1, erro: 0 });
    // Enquanto a prévia espera: o aparelho ganha outro preço e o SKU novo é cadastrado pela tela, em minúsculas.
    await valor(dono, DEFINIR, [cat.aparelho, null, 159_900, "Reajuste"]);
    await valor(dono, SALVAR_VARIANTE, [cat.produtoCapa, null, "imp-0100", "Película 3D fosca", null, null, null, null, "Cadastro pela tela"]);

    const deNovo = await previa(admin, 21, linhas);
    expect(deNovo).toMatchObject({ id: p.id, numero: p.numero, repetida: true, atualizada: true });
    expect(deNovo.totais).toMatchObject({ linhas: 3, criar: 0, atualizar: 3, sem_mudanca: 0, erro: 0 });
    expect((await linhasDe(p.id)).map((l) => [l.numero, l.acao, l.diferencas])).toEqual([
      [2, "atualizar", { preco: [7_900, 8_490] }],
      [3, "atualizar", { preco: [159_900, 149_900] }],
      [4, "atualizar", { nome: ["Película 3D fosca", "Película 3D"], preco: [null, 2_990] }],
    ]);
    // Sem mudança no cadastro, reenviar de novo não cria outra comparação.
    expect(await previa(admin, 21, linhas)).toMatchObject({ id: p.id, repetida: true, atualizada: false });
    expect((await importacao(p.id))?.comparacao).toBe(2);
    expect((await db.query("select 1 from public.importacoes where arquivo_sha256 = $1", [sha(21)])).rows).toHaveLength(1);

    // Quem conferiu a comparação 1 não aplica: nada muda no cadastro.
    expect(await aplicar(dono, p.id, 1)).toMatchObject({ repetida: false, atualizada: true, comparacao: 2 });
    expect([await precoParaDono(dono, cat.capa), await precoParaDono(dono, cat.aparelho)]).toEqual([7_900, 159_900]);
    // Conferida a comparação 2, aplica o que ela mostra; o SKU fica como foi cadastrado.
    expect(await aplicar(dono, p.id, 2)).toMatchObject({ repetida: false, atualizada: false });
    expect([await precoParaDono(dono, cat.capa), await precoParaDono(dono, cat.aparelho)]).toEqual([8_490, 149_900]);
    const peliculas = (await db.query<{ sku: string; nome: string }>("select sku, nome from public.variantes where lower(sku) = 'imp-0100'")).rows;
    expect(peliculas).toEqual([{ sku: "imp-0100", nome: "Película 3D" }]);
  });

  it("REV-NOV-002: cadastro que passa a conflitar com a prévia vira erro na comparação refeita e a aplicação é recusada", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const categoria = (await valor<{ id: string }>(admin, SALVAR_CATEGORIA, [ids.organizacao, null, "Sazonais", null, "Categoria nova"])).id;
    const p = await previa(admin, 22, [
      linha(2, "IMP-0200", { codigo_barras: "7890000000035" }),
      linha(3, "IMP-0201", { nome: "Enfeite de Natal", categoria: "sazonais" }),
    ]);
    expect(p.totais).toMatchObject({ criar: 2, erro: 0, categorias_novas: 0 });
    expect((await linhasDe(p.id))[1]?.base).toEqual({ categoria_id: categoria, marca_id: null, produto_id: null });
    // Antes da aplicação, o código de barras do arquivo vai para o chip e a categoria é inativada.
    await valor(dono, SALVAR_VARIANTE, [cat.produtoChip, cat.chip, "CHI-0001", "Chip pré-pago", null, null, "7890000000035", null, "Código do chip"]);
    await valor(dono, SALVAR_CATEGORIA, [ids.organizacao, categoria, "Sazonais", false, "Fora de linha"]);

    expect(await aplicar(dono, p.id, 1)).toMatchObject({ repetida: false, atualizada: true, comparacao: 2, totais: { criar: 0, erro: 2 } });
    expect((await linhasDe(p.id)).map((l) => [l.numero, l.acao, l.erros])).toEqual([
      [2, "erro", ["Código de barras já está no SKU CHI-0001"]],
      [3, "erro", ["A categoria Sazonais está inativa: reative no cadastro antes de importar"]],
    ]);
    // Conferida ou não, comparação com erro não se aplica.
    expect(await codigo(dono, APLICAR, [p.id, "Conferido", 2])).toBe("22023");
    expect((await db.query("select 1 from public.variantes where sku in ('IMP-0200', 'IMP-0201')")).rows).toHaveLength(0);
    // Corrigido o cadastro, a mesma prévia volta a servir: compara de novo (3) e aplica depois de conferida.
    await valor(dono, SALVAR_CATEGORIA, [ids.organizacao, categoria, "Sazonais", true, "De volta à linha"]);
    await valor(dono, SALVAR_VARIANTE, [cat.produtoChip, cat.chip, "CHI-0001", "Chip pré-pago", null, null, null, null, "Código lançado no produto errado"]);
    expect(await aplicar(dono, p.id, 2)).toMatchObject({ repetida: false, atualizada: true, comparacao: 3, totais: { criar: 2, erro: 0 } });
    expect(await aplicar(dono, p.id, 3)).toMatchObject({ repetida: false, atualizada: false, comparacao: 3 });
    expect((await variante("IMP-0200"))?.codigo_barras).toBe("7890000000035");
    const enfeite = (await db.query<{ categoria_id: string }>(
      "select p.categoria_id from public.variantes v join public.produtos p on p.id = v.produto_id where v.sku = 'IMP-0201'")).rows[0];
    expect(enfeite?.categoria_id).toBe(categoria);
  });

  it("REV-NOV-006: categoria e marca cadastradas depois da prévia, com outras maiúsculas, são reaproveitadas e não duplicadas", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const p = await previa(admin, 23, [linha(2, "IMP-0400", { nome: "Caixa de som", categoria: "Audio R2", marca: "Marca R2" })]);
    expect(p.totais).toMatchObject({ criar: 1, categorias_novas: 1, marcas_novas: 1 });
    const categoria = (await valor<{ id: string }>(dono, SALVAR_CATEGORIA, [ids.organizacao, null, "AUDIO R2", null, "Categoria nova"])).id;
    const marca = (await valor<{ id: string }>(dono, SALVAR_MARCA, [ids.organizacao, null, "MARCA R2", "Marca nova"])).id;

    expect(await aplicar(dono, p.id, 1)).toMatchObject({ repetida: false, atualizada: true, comparacao: 2, totais: { criar: 1, categorias_novas: 0, marcas_novas: 0 } });
    expect(await aplicar(dono, p.id, 2)).toMatchObject({ repetida: false, atualizada: false });
    const produto = (await db.query<{ categoria_id: string; marca_id: string }>(
      "select p.categoria_id, p.marca_id from public.variantes v join public.produtos p on p.id = v.produto_id where v.sku = 'IMP-0400'")).rows[0];
    expect(produto).toEqual({ categoria_id: categoria, marca_id: marca });
    expect((await db.query("select nome from public.categorias where lower(nome) = 'audio r2'")).rows).toEqual([{ nome: "AUDIO R2" }]);
    expect((await db.query("select nome from public.marcas where lower(nome) = 'marca r2'")).rows).toEqual([{ nome: "MARCA R2" }]);
    // A unicidade agora é do banco: nenhum escritor grava o nome equivalente, nem por fora das funções.
    expect(await direto("insert into public.categorias (organizacao_id, nome) values ($1, 'audio r2')", [ids.organizacao])).toBe("23505");
    expect(await direto("insert into public.marcas (organizacao_id, nome) values ($1, 'marca r2')", [ids.organizacao])).toBe("23505");
    expect(await direto("insert into public.variantes (organizacao_id, produto_id, sku, nome) values ($1, $2, 'imp-0400', 'Outra caixa')", [ids.organizacao, cat.produtoCapa])).toBe("23505");
    // O mesmo nome em outra rede continua livre.
    expect(await direto("insert into public.categorias (organizacao_id, nome) values ($1, 'audio r2')", [ids.outraOrganizacao])).toBeNull();
  });

  it("REV-NOV-007: desfazer não volta campo nem custo mexidos depois do lote, mesmo que o valor seja de novo o do lote", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const donoNaLoja = await naLoja(ids.dono, ids.lojaA);
    const p = await previa(admin, 24, [
      linha(2, "ACE-0001", { nome: "Capa premium", cor: "Preta", custo: 2_000 }),
      linha(3, "APA-0001", { nome: "Galaxy A15 128 GB Azul", tipo: "aparelho", codigo_barras: "7890000000042" }),
    ]);
    expect((await linhasDe(p.id)).map((l) => l.diferencas)).toEqual([
      { nome: ["Capa de proteção", "Capa premium"], cor: [null, "Preta"], custo: [1_800, 2_000] },
      { codigo_barras: ["7890000000011", "7890000000042"] },
    ]);
    expect(await aplicar(dono, p.id, 1)).toMatchObject({ repetida: false, atualizada: false });
    const loteCusto = (await linhasDe(p.id))[0]?.custo_id;
    expect(loteCusto).not.toBeNull();

    // Depois do lote: o nome da capa muda e volta ao valor do lote; o custo muda por duas entradas e volta ao
    // valor do lote; o código de barras antigo do aparelho é dado a outra variação. A cor ninguém tocou.
    await valor(dono, SALVAR_VARIANTE, [cat.produtoCapa, cat.capa, "ACE-0001", "Capa slim", "Preta", null, "7890000000028", null, "Nome novo"]);
    await valor(dono, SALVAR_VARIANTE, [cat.produtoCapa, cat.capa, "ACE-0001", "Capa premium", "Preta", null, "7890000000028", null, "Voltou o nome"]);
    const item = (custo: number) => JSON.stringify([{ variante: cat.capa, quantidade: 1, custo }]);
    await valor(donoNaLoja, ENTRADA, [ids.lojaA, item(2_500), "form:r2:custo:0001", "Contagem"]);
    await valor(donoNaLoja, ENTRADA, [ids.lojaA, item(2_000), "form:r2:custo:0002", "Contagem"]);
    await valor(dono, SALVAR_VARIANTE, [cat.produtoChip, cat.chip, "CHI-0001", "Chip pré-pago", null, null, "7890000000011", null, "Código do chip"]);
    expect(await custoAtual(cat.capa)).toBe(2_000);
    const custosAntes = (await db.query("select id from public.custos where variante_id = $1", [cat.capa])).rows.length;
    expect(custosAntes).toBe(4); // o do cenário, o do lote e os das duas entradas

    expect(await valor<Desfeita>(dono, DESFAZER, [p.id, "Arquivo errado"])).toEqual({ repetida: false, desfeitas: 0, parciais: 1, mantidas: 1 });
    expect((await linhasDe(p.id)).map((l) => l.desfeito)).toEqual([
      { situacao: "parcial", revertidos: ["cor"], mantidos: { nome: "alterado_depois", custo: "alterado_depois" } },
      { situacao: "mantida", revertidos: [], mantidos: { codigo_barras: "codigo_em_uso" } },
    ]);
    expect(await variante("ACE-0001")).toMatchObject({ nome: "Capa premium", cor: null, codigo_barras: "7890000000028" });
    expect((await variante("APA-0001"))?.codigo_barras).toBe("7890000000042");
    // O custo vigente continua sendo o da última entrada: o desfazer não gravou custo nenhum.
    expect(await custoAtual(cat.capa)).toBe(2_000);
    expect((await db.query("select id from public.custos where variante_id = $1", [cat.capa])).rows).toHaveLength(custosAntes);
    expect(await importacao(p.id)).toMatchObject({ situacao: "desfeita", desfazer: { desfeitas: 0, parciais: 1, mantidas: 1 } });
  });

  it("observação REV-NOV-003: variação criada pelo lote só sai de circulação se ninguém a usou nem mexeu nela; o resultado fica gravado", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const p = await previa(admin, 25, [
      linha(2, "IMP-0300", { nome: "Cabo USB-C", preco: 2_990, custo: 900 }),
      linha(3, "IMP-0301", { nome: "Cabo Lightning", preco: 3_990 }),
      linha(4, "IMP-0302", { nome: "Cabo micro USB", preco: 1_990 }),
      linha(5, "IMP-0303", { nome: "Suporte veicular" }),
      linha(6, "IMP-0304", { nome: "Película fosca", preco: 1_500 }),
    ]);
    expect(await aplicar(dono, p.id, 1)).toMatchObject({ repetida: false, atualizada: false, totais: { criar: 5 } });
    const [usb, lightning, micro, suporte, pelicula] = await Promise.all(["IMP-0300", "IMP-0301", "IMP-0302", "IMP-0303", "IMP-0304"].map(variante));
    // IMP-0300 recebe estoque; IMP-0301 é editada pela tela; IMP-0304 ganha preço próprio numa loja.
    // IMP-0302 (com preço) e IMP-0303 (sem preço) ficam como o lote deixou.
    await db.query("select privado.lancar_movimento($1, $2, 3, 'entrada_importacao', null, null, null, null, 'teste:r2:cabo')", [ids.lojaA, usb?.id]);
    await valor(dono, SALVAR_VARIANTE, [lightning?.produto_id, lightning?.id, "IMP-0301", "Cabo Lightning 2 m", null, null, null, null, "Nome completo"]);
    await valor(dono, DEFINIR, [pelicula?.id, ids.lojaA, 1_400, "Preço da loja A"]);

    expect(await valor<Desfeita>(dono, DESFAZER, [p.id, "Arquivo errado"])).toEqual({ repetida: false, desfeitas: 2, parciais: 0, mantidas: 3 });
    expect((await linhasDe(p.id)).map((l) => [l.numero, l.desfeito])).toEqual([
      [2, { situacao: "mantida", revertidos: [], mantidos: { variacao: "em_uso" } }],
      [3, { situacao: "mantida", revertidos: [], mantidos: { variacao: "alterada_depois" } }],
      [4, { situacao: "desfeita", revertidos: ["variacao"], mantidos: {} }],
      [5, { situacao: "desfeita", revertidos: ["variacao"], mantidos: {} }],
      [6, { situacao: "mantida", revertidos: [], mantidos: { variacao: "alterada_depois" } }],
    ]);
    const ativas = (await db.query<{ sku: string; ativa: boolean }>("select sku, ativa from public.variantes where sku like 'IMP-030%' order by sku")).rows;
    expect(ativas.map((v) => v.ativa)).toEqual([true, true, false, false, true]);
    // O que ficou continua vendável com o preço do lote; o que saiu ficou sem preço aberto.
    expect([await precoParaDono(dono, usb?.id ?? ""), await precoParaDono(dono, lightning?.id ?? "")]).toEqual([2_990, 3_990]);
    expect(await precoParaDono(dono, pelicula?.id ?? "")).toBe(1_400);
    expect((await db.query("select 1 from public.precos where variante_id = any($1) and fim is null", [[micro?.id, suporte?.id]])).rows).toHaveLength(0);
    // A contagem fica na importação e é a mesma resposta para quem repetir o pedido.
    expect(await importacao(p.id)).toMatchObject({ situacao: "desfeita", desfazer: { desfeitas: 2, parciais: 0, mantidas: 3 } });
    expect(await valor<Desfeita>(dono, DESFAZER, [p.id, "Arquivo errado"])).toEqual({ repetida: true, desfeitas: 2, parciais: 0, mantidas: 3 });
    // Categorias, marcas e modelos criados pelo lote ficam (outros cadastros podem depender deles).
    expect((await db.query("select 1 from public.produtos where id = $1 and ativo", [micro?.produto_id])).rows).toHaveLength(1);
  });

  it("REV-NOV-006: a reconciliação renomeia os nomes equivalentes que já existirem, sem apagar nem mesclar, e o índice único passa a valer", async () => {
    // Estado anterior à migration: sem os índices normalizados e com duplicatas que só diferem nas maiúsculas.
    expect(await direto("drop index public.categorias_nome_normalizado, public.marcas_nome_normalizado, public.variantes_sku_normalizado")).toBeNull();
    const longa = `${"a".repeat(45)} ${"b".repeat(14)}`; // 60 caracteres, com um espaço bem onde o nome é cortado
    const skuLongo = "S".repeat(60);
    await db.query(
      `insert into public.categorias (organizacao_id, nome, criado_em) values
         ($1, 'chips (duplicada 2)', '2020-01-01'), ($1, 'CHIPS', '2030-01-01'), ($1, 'chips', '2030-01-02'),
         ($1, $3, '2030-01-01'), ($1, upper($3), '2030-01-02'), ($2, 'chips', '2030-01-01')`,
      [ids.organizacao, ids.outraOrganizacao, longa]);
    await db.query("insert into public.marcas (organizacao_id, nome, criado_em) values ($1, 'SAMSUNG', '2030-01-01')", [ids.organizacao]);
    await db.query(
      `insert into public.variantes (organizacao_id, produto_id, sku, nome, criado_em) values
         ($1, $2, 'ace-0001', 'Capa repetida', '2030-01-01'), ($1, $2, $3, 'SKU comprido', '2030-01-01'), ($1, $2, lower($3), 'SKU comprido repetido', '2030-01-02')`,
      [ids.organizacao, cat.produtoCapa, skuLongo]);
    const linhasAntes = async (tabela: string) => Number((await db.query<{ n: string }>(`select count(*) as n from public.${tabela}`)).rows[0]?.n);
    const antes = [await linhasAntes("categorias"), await linhasAntes("marcas"), await linhasAntes("variantes"), await linhasAntes("produtos")];

    const reconciliar = async () => (await db.query<{ v: Record<string, number> }>("select privado.reconciliar_identidades_do_catalogo() as v")).rows[0]?.v;
    expect(await reconciliar()).toEqual({ categorias: 3, marcas: 1, variantes: 2 });

    // Fica com o nome a linha mais antiga; as outras ganham o primeiro sufixo livre (o 2 de "chips" já existia).
    const nomes = async (tabela: string, coluna: string, organizacao: string) =>
      (await db.query<{ v: string }>(`select ${coluna} as v from public.${tabela} where organizacao_id = $1 order by criado_em, ${coluna}`, [organizacao])).rows.map((r) => r.v);
    expect(await nomes("categorias", "nome", ids.organizacao)).toEqual([
      "chips (duplicada 2)", "Acessórios", "Celulares", "Chips",
      "CHIPS (duplicada 3)", longa, `${"A".repeat(45)} (duplicada 2)`, "chips (duplicada 4)",
    ]);
    expect(await nomes("categorias", "nome", ids.outraOrganizacao)).toEqual(["Celulares", "chips"]);
    expect(await nomes("marcas", "nome", ids.organizacao)).toEqual(["Samsung", "SAMSUNG (duplicada 2)"]);
    const skus = await nomes("variantes", "sku", ids.organizacao);
    expect(skus).toEqual(expect.arrayContaining(["ACE-0001", "ace-0001-DUP2", skuLongo, `${"s".repeat(55)}-DUP2`]));
    expect(skus.every((sku) => sku.length <= 60)).toBe(true);
    // Nada foi apagado nem mesclado, e cada troca ficou na auditoria com o motivo da reconciliação.
    expect([await linhasAntes("categorias"), await linhasAntes("marcas"), await linhasAntes("variantes"), await linhasAntes("produtos")]).toEqual(antes);
    const trilha = (await db.query<{ alvo_tipo: string; de: string; para: string }>(
      `select alvo_tipo, antes ->> (case alvo_tipo when 'variantes' then 'sku' else 'nome' end) as de,
              depois ->> (case alvo_tipo when 'variantes' then 'sku' else 'nome' end) as para
       from public.auditoria where motivo = 'Reconciliação de nomes equivalentes (R2)' order by id`)).rows;
    expect(trilha.map((t) => t.alvo_tipo)).toEqual(["categorias", "categorias", "categorias", "marcas", "variantes", "variantes"]);
    expect(trilha).toContainEqual({ alvo_tipo: "categorias", de: "CHIPS", para: "CHIPS (duplicada 3)" });
    expect(trilha).toContainEqual({ alvo_tipo: "variantes", de: "ace-0001", para: "ace-0001-DUP2" });

    // Sem duplicata restante: repetir não muda nada, os índices únicos são criados e passam a recusar a próxima.
    expect(await reconciliar()).toEqual({ categorias: 0, marcas: 0, variantes: 0 });
    expect(await direto("create unique index categorias_nome_normalizado on public.categorias (organizacao_id, lower(nome))")).toBeNull();
    expect(await direto("create unique index marcas_nome_normalizado on public.marcas (organizacao_id, lower(nome))")).toBeNull();
    expect(await direto("create unique index variantes_sku_normalizado on public.variantes (organizacao_id, lower(sku))")).toBeNull();
    expect(await direto("insert into public.categorias (organizacao_id, nome) values ($1, 'CHIPS')", [ids.organizacao])).toBe("23505");
    expect(await direto("insert into public.categorias (organizacao_id, nome) values ($1, 'CHIPS')", [ids.outraOrganizacao])).toBe("23505");
  });

  it("REV-NOV-008: a prévia guarda todas as linhas de um arquivo grande; o erro da última linha conta e é achado; acima de 2.000 linhas é recusada", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const linhas = Array.from({ length: 300 }, (_, i) => linha(i + 2, `IMP-${1000 + i}`));
    linhas.push(linha(302, "IMP-1300", { erros: ['Preço inválido: "abc"'] }));
    const p = await previa(admin, 26, linhas);
    expect(p.totais).toMatchObject({ linhas: 301, criar: 300, atualizar: 0, sem_mudanca: 0, erro: 1 });
    expect(Number((await db.query<{ n: string }>("select count(*) as n from public.importacao_linhas where importacao_id = $1", [p.id])).rows[0]?.n)).toBe(301);
    // O único erro está depois da linha 300: a consulta por situação o encontra sem depender de limite de página.
    const erros = (await db.query<{ numero: number; erros: string[] }>(
      "select numero, erros from public.importacao_linhas where importacao_id = $1 and acao = 'erro' order by numero", [p.id])).rows;
    expect(erros).toEqual([{ numero: 302, erros: ['Preço inválido: "abc"'] }]);
    // Com erro, o lote inteiro não se aplica: nenhum dos 300 itens válidos entra.
    expect(await codigo(dono, APLICAR, [p.id, "Conferido", 1])).toBe("22023");
    expect((await db.query("select 1 from public.variantes where sku like 'IMP-1%'")).rows).toHaveLength(0);

    const demais = Array.from({ length: 2_001 }, (_, i) => linha(i + 2, `IMP-${3000 + i}`));
    expect(await codigo(admin, PREVIA, [ids.organizacao, "catalogo-27.csv", sha(27), JSON.stringify(MAPA), JSON.stringify(demais)])).toBe("22023");
    expect((await db.query("select 1 from public.importacoes where arquivo_sha256 = $1", [sha(27)])).rows).toHaveLength(0);
  }, 60_000);

  it("quem lê a importação também lê custo: todo papel com importacao.executar ou importacao.aprovar tem custo.ver", async () => {
    // As linhas da prévia guardam o custo do arquivo, e a tela o mostra a quem lê a importação (importacoes_ler:
    // importacao.executar ou importacao.aprovar na rede). Isso só vale enquanto esses papéis também tiverem
    // custo.ver, que na rede se resolve pelo mesmo vínculo (privado.organizacoes_com_permissao). Migration que
    // dê permissão de importação a papel sem custo.ver precisa, antes, tirar o custo da leitura das linhas.
    const papeis = async (sql: string) => (await db.query<{ v: string[] }>(sql)).rows[0]?.v;
    const leitores = await papeis(
      `select coalesce(array_agg(distinct papel order by papel), '{}') as v from public.papel_permissoes
       where permissao in ('importacao.executar', 'importacao.aprovar')`);
    expect(leitores).toEqual(expect.arrayContaining(["administrador", "dono"]));
    expect(await papeis(
      `select coalesce(array_agg(distinct pp.papel order by pp.papel), '{}') as v from public.papel_permissoes pp
       where pp.permissao in ('importacao.executar', 'importacao.aprovar')
         and not exists (select 1 from public.papel_permissoes c where c.papel = pp.papel and c.permissao = 'custo.ver')`)).toEqual([]);
    // Na sessão: quem gera e quem aprova já leem o custo do catálogo da rede; a prévia não mostra nada a mais.
    for (const s of [sessao(ids.administrador), sessao(ids.dono)]) {
      const lidos = await comoUsuario(db, s, async () => (await db.query("select 1 from public.custos where variante_id = $1", [cat.capa])).rows);
      expect(lidos).toHaveLength(1);
    }
  });
});
