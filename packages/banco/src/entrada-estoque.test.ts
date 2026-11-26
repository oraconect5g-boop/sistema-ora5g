// Entrada de mercadoria (lote L4a: ORA-INV-009, ORA-INV-004, ORA-CAT-008): compra com fornecedor e carga
// inicial, aparelho e chip pelo IMEI/ICCID, acessório por quantidade, custo de entrada e estorno pelo
// livro. Correções do recebimento (lote R1, revisão integral de 11/11/2026): custo só com custo.ver, histórico
// completo, reentrada da identidade estornada e produto inativo. Banco em memória com todas as migrations;
// dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens as itensDoCenario, montarCatalogo } from "./cenario-catalogo";

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
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `6a000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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

type Registro = { id: string; numero: number; repetida: boolean };
const FORNECEDOR = "select public.fornecedor_salvar($1, $2, $3, $4, $5, $6, $7) as v";
const ENTRADA = "select public.estoque_registrar_entrada($1, $2, $3, $4, $5::jsonb, $6, $7) as v";
const ESTORNO = "select public.estoque_estornar_entrada($1, $2) as v";
const imei = (n: number) => comDigitoLuhn(`35209900180${String(n).padStart(3, "0")}`);
const iccid = (n: number) => comDigitoLuhn(`89551000000099${String(n).padStart(4, "0")}`);
const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ quantidade: number; reservado: number }>("select quantidade, reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0] ?? { quantidade: 0, reservado: 0 };
const custoAtual = async (variante: string) =>
  Number((await db.query<{ v: string }>("select valor_centavos as v from public.custos where variante_id = $1 order by inicio desc, criado_em desc limit 1", [variante])).rows[0]?.v);
const divergencias = async () => (await db.query("select * from privado.divergencias_estoque()")).rows;

async function fornecedor(s: Sessao, nome = "Distribuidora Fictícia") {
  return (await valor<Registro>(s, FORNECEDOR, [ids.organizacao, null, nome, null, null, null, "Fornecedor novo"])).id;
}

// --- Apoio das correções do recebimento (R1) ---
type Entrada = Registro & { reentradas: number };
type Identificador = { identificador: string; situacao: string; livre: boolean; reentrada: boolean };
type Linha = { linha: number; sku: string; nome: string; quantidade: number; condicao: string; custo_unitario: number | null; reentradas: number; saldo_livre: number | null; identificadores: Identificador[] | null };
type Lida = { id: string; numero: number; tipo: string; documento: string | null; situacao: string; total_unidades: number; total_custo: number | null; criado_por: string | null; estornado_por: string | null; motivo_estorno: string | null; fornecedor: string | null; itens: Linha[] };
type Historico = { ve_custo: boolean; total: number; entradas: Lida[]; proxima: number | null };
type Detalhe = Lida & { ve_custo: boolean };
const ENTRADAS = "select public.estoque_entradas($1, $2, $3) as v";
const DETALHE = "select public.estoque_entrada($1, $2, $3) as v";
const OUTRA_VARIANTE = "00000000-0000-4000-9000-000000000034";
// Leitura direta como o usuário (tabela ou visão): se falhar, o erro original aparece e a transação do teste segue.
async function lerComo<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint leitura");
    try {
      const linhas = (await db.query<T>(sql, params)).rows;
      await db.exec("release savepoint leitura");
      return linhas;
    } catch (e) {
      await db.exec("rollback to savepoint leitura");
      throw e;
    }
  });
}
const falha = async (s: Sessao | null, sql: string, params: unknown[] = []): Promise<Falha | null> => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r : null;
};
type Item = { id: string; variante_id: string; unidade_id: string; situacao: string; em_estoque: boolean; condicao: string };
const itemDe = async (identificador: string) =>
  (await db.query<Item>("select id, variante_id, unidade_id, situacao, em_estoque, condicao from public.itens_serializados where $1 in (imei, iccid)", [identificador])).rows[0] as Item;
const livroDe = async (item: string) =>
  (await db.query<{ quantidade: number; tipo: string; referencia_tipo: string | null; unidade_id: string; variante_id: string }>(
    "select quantidade, tipo, referencia_tipo, unidade_id, variante_id from public.estoque_movimentos where item_serializado_id = $1 order by id", [item])).rows;
const reentradasAuditadas = async () =>
  (await db.query<{ usuario_id: string; unidade_id: string; alvo_tipo: string; alvo_id: string; antes: Record<string, unknown>; depois: Record<string, unknown>; motivo: string; origem: string }>(
    "select usuario_id, unidade_id, alvo_tipo, alvo_id, antes, depois, motivo, origem from public.auditoria where acao = 'estoque.item_reentrada' order by id")).rows;
const numerosEm = (v: unknown): number[] =>
  typeof v === "number" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(numerosEm) : [];
const aparelhos = (identificadores: string[], variante = cat.aparelho, extra: Record<string, unknown> = {}) =>
  JSON.stringify([{ variante, identificadores, ...extra }]);
const cargaInicial = (s: Sessao, unidade: string, itens: string, chave: string, motivo = "Contagem") =>
  valor<Entrada>(s, ENTRADA, [unidade, "carga_inicial", null, null, itens, chave, motivo]);

describe("entrada de mercadoria (L4a)", () => {
  it("compra: aparelhos pelo IMEI, chips pelo ICCID e capas por quantidade, com custo e o livro em dia", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const forn = await fornecedor(gerente);
    const itens = [
      { variante: cat.aparelho, identificadores: [imei(1), imei(2)], custo: 105_000 },
      { variante: cat.chip, identificadores: [iccid(1)] },
      { variante: cat.capa, quantidade: 20, custo: 1_700 },
    ];
    const e = await valor<Registro>(gerente, ENTRADA, [ids.lojaB, "compra", forn, "NF 1234", JSON.stringify(itens), "form:entrada:0001", "Pedido da semana"]);
    expect(e.repetida).toBe(false);
    expect(await saldo(ids.lojaB, cat.aparelho)).toMatchObject({ quantidade: 3 }); // 1 do cenário + 2
    expect(await saldo(ids.lojaB, cat.chip)).toMatchObject({ quantidade: 1 });
    expect(await saldo(ids.lojaB, cat.capa)).toMatchObject({ quantidade: 23 }); // 3 do cenário + 20
    expect(await custoAtual(cat.aparelho)).toBe(105_000);
    expect(await custoAtual(cat.capa)).toBe(1_700);
    const cabecalho = (await db.query("select tipo, documento, total_unidades, total_custo_centavos, situacao from public.entradas_estoque where id = $1", [e.id])).rows[0];
    expect(cabecalho).toEqual({ tipo: "compra", documento: "NF 1234", total_unidades: 23, total_custo_centavos: 244000, situacao: "registrada" });
    const aparelhos = (await db.query<{ unidade_id: string; situacao: string; condicao: string }>(
      "select unidade_id, situacao, condicao from public.itens_serializados where imei = any($1)", [[imei(1), imei(2)]])).rows;
    expect(aparelhos).toEqual([
      { unidade_id: ids.lojaB, situacao: "disponivel", condicao: "novo" },
      { unidade_id: ids.lojaB, situacao: "disponivel", condicao: "novo" },
    ]);
    // Repetir não duplica; a mesma chave com outro conteúdo é recusada.
    expect(await valor<Registro>(gerente, ENTRADA, [ids.lojaB, "compra", forn, "NF 1234", JSON.stringify(itens), "form:entrada:0001", "Pedido da semana"]))
      .toEqual({ ...e, repetida: true });
    expect(await codigo(gerente, ENTRADA, [ids.lojaB, "compra", forn, "NF 9999", JSON.stringify(itens), "form:entrada:0001", "Pedido da semana"])).toBe("OR004");
    expect(await divergencias()).toEqual([]);
  });

  it("carga inicial sem fornecedor; aparelho seminovo entra como seminovo", async () => {
    const dono = await naLoja(ids.dono, ids.lojaC);
    await valor(dono, ENTRADA, [ids.lojaC, "carga_inicial", null, null, JSON.stringify([{ variante: cat.aparelho, identificadores: [imei(3)], condicao: "seminovo" }]), "form:entrada:0002", "Estoque que já estava na loja"]);
    expect((await db.query("select condicao, situacao from public.itens_serializados where imei = $1", [imei(3)])).rows[0]).toEqual({ condicao: "seminovo", situacao: "disponivel" });
    const mov = (await db.query("select tipo from public.estoque_movimentos m join public.itens_serializados i on i.id = m.item_serializado_id where i.imei = $1", [imei(3)])).rows;
    expect(mov).toEqual([{ tipo: "entrada_importacao" }]);
  });

  it("regras: IMEI inválido, repetido ou já cadastrado, acessório com IMEI, serviço sem estoque, compra sem fornecedor", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const forn = await fornecedor(dono);
    const entrada = (itens: object[], tipo = "compra", f: string | null = forn) =>
      codigo(dono, ENTRADA, [ids.lojaA, tipo, f, null, JSON.stringify(itens), `form:${Math.random().toString(36).slice(2, 12)}`, "Entrada de teste"]);
    expect(await entrada([{ variante: cat.aparelho, identificadores: ["352099001800001"] }])).toBe("22023"); // dígito errado
    expect(await entrada([{ variante: cat.aparelho, identificadores: [imei(4), imei(4)] }])).toBe("22023");
    expect(await entrada([{ variante: cat.aparelho, identificadores: [cat.imei1] }])).toBe("23505"); // já está na loja A
    expect(await entrada([{ variante: cat.aparelho, identificadores: [] }])).toBe("22023");
    expect(await entrada([{ variante: cat.capa, quantidade: 2, identificadores: [imei(5)] }])).toBe("22023");
    expect(await entrada([{ variante: cat.capa, quantidade: 0 }])).toBe("22023");
    expect(await entrada([{ variante: cat.capa, quantidade: 2, condicao: "avariado" }])).toBe("22023");
    expect(await entrada([{ variante: cat.recarga, quantidade: 1 }])).toBe("22023");
    expect(await entrada([{ variante: cat.capa, quantidade: 1 }], "compra", null)).toBe("22023");
    expect(await entrada([{ variante: cat.capa, quantidade: 1 }], "carga_inicial", forn)).toBe("22023");
    expect(await entrada([{ variante: cat.capa, quantidade: 1, custo: -5 }])).toBe("22023");
    // Nada pela metade: a linha boa antes da ruim também não entrou.
    expect(await entrada([{ variante: cat.capa, quantidade: 5 }, { variante: cat.aparelho, identificadores: ["123"] }])).toBe("22023");
    expect(await saldo(ids.lojaA, cat.capa)).toMatchObject({ quantidade: 10 });
  });

  it("permissões: vendedor não recebe; gerente só na loja do turno; outra rede não; leitura pela loja", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    const itens = JSON.stringify([{ variante: cat.capa, quantidade: 1 }]);
    expect(await codigo(vendedor, ENTRADA, [ids.lojaA, "carga_inicial", null, null, itens, "form:entrada:0003", "Tentativa"])).toBe("42501");
    expect(await codigo(gerente, ENTRADA, [ids.lojaA, "carga_inicial", null, null, itens, "form:entrada:0004", "Tentativa"])).toBe("42501");
    expect(await codigo(outraRede, ENTRADA, [ids.lojaA, "carga_inicial", null, null, itens, "form:entrada:0005", "Tentativa"])).toBe("42501");
    expect(await codigo(vendedor, FORNECEDOR, [ids.organizacao, null, "Fornecedor intruso", null, null, null, "Tentativa"])).toBe("42501");
    const e = await valor<Registro>(gerente, ENTRADA, [ids.lojaB, "carga_inicial", null, null, itens, "form:entrada:0006", "Contagem inicial"]);
    expect(await codigo(vendedor, ESTORNO, [e.id, "Tentativa"])).toBe("P0002");
    // O vendedor da loja A não lê a entrada da loja B; o gerente da B lê.
    expect(await comoUsuario(db, vendedor, async () => (await db.query("select id from public.entradas_estoque")).rows)).toEqual([]);
    expect((await comoUsuario(db, gerente, async () => (await db.query("select id from public.entradas_estoque")).rows)).length).toBe(1);
    // Escrita direta continua fechada.
    expect(await codigo(gerente, "insert into public.fornecedores (organizacao_id, nome, criado_por) values ($1, 'Direto', $2)", [ids.organizacao, ids.gerenteB])).toBe("42501");
  });

  it("estorno: devolve pelo livro enquanto tudo está livre; aparelho vendido ou reservado impede", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const itens = [{ variante: cat.aparelho, identificadores: [imei(6)] }, { variante: cat.capa, quantidade: 4 }];
    const e = await valor<Registro>(dono, ENTRADA, [ids.lojaA, "carga_inicial", null, null, JSON.stringify(itens), "form:entrada:0007", "Contagem"]);
    expect(await saldo(ids.lojaA, cat.capa)).toMatchObject({ quantidade: 14 });
    expect(await valor<string>(dono, ESTORNO, [e.id, "Lançada na loja errada"])).toBe("estornada");
    expect(await valor<string>(dono, ESTORNO, [e.id, "Lançada na loja errada"])).toBe("ja_estornada");
    expect(await saldo(ids.lojaA, cat.capa)).toMatchObject({ quantidade: 10 });
    expect((await db.query("select situacao, em_estoque from public.itens_serializados where imei = $1", [imei(6)])).rows[0]).toEqual({ situacao: "baixado", em_estoque: false });
    expect(await divergencias()).toEqual([]);

    // Com o aparelho reservado no carrinho, o estorno não passa e nada muda.
    const e2 = await valor<Registro>(dono, ENTRADA, [ids.lojaA, "carga_inicial", null, null, JSON.stringify([{ variante: cat.aparelho, identificadores: [imei(7)] }]), "form:entrada:0008", "Contagem"]);
    const item = (await db.query<{ id: string }>("select id from public.itens_serializados where imei = $1", [imei(7)])).rows[0]?.id;
    await valor(dono, "select public.reservar_estoque($1, 1, $2, 'lojas:reserva:1') as v", [cat.aparelho, item]);
    expect(await codigo(dono, ESTORNO, [e2.id, "Tentativa"])).toBe("OR002");
    expect((await db.query("select situacao from public.entradas_estoque where id = $1", [e2.id])).rows[0]).toEqual({ situacao: "registrada" });
  });

  it("fornecedor: nome sem repetir (sem diferença de maiúsculas), CNPJ válido e único, inativar", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const id = await fornecedor(dono, "Atacado Teste");
    expect(await valor<Registro>(dono, FORNECEDOR, [ids.organizacao, null, "atacado teste", null, null, null, "De novo"])).toMatchObject({ id, repetida: true });
    expect(await codigo(dono, FORNECEDOR, [ids.organizacao, null, "Outro", "11.222.333/0001-82", null, null, "CNPJ errado"])).toBe("22023");
    expect((await valor<Registro>(dono, FORNECEDOR, [ids.organizacao, id, "Atacado Teste Ltda", "11.444.777/0001-61", "(41) 3000-0000", false, "Dados completos"])).repetida).toBe(false);
    expect(await codigo(dono, ENTRADA, [ids.lojaA, "compra", id, null, JSON.stringify([{ variante: cat.capa, quantidade: 1 }]), "form:entrada:0009", "Fornecedor inativo"])).toBe("22023");
  });
});

describe("correções do recebimento (R1)", () => {
  it("custo só com custo.ver: colunas fechadas na tabela, custo pelas funções e auditoria do cabeçalho (REV-NOV-001)", async () => {
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const vendedor = await naLoja(ids.vendedorAB, ids.lojaB);
    const vendedorDeFora = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const e = await valor<Entrada>(gerente, ENTRADA, [ids.lojaB, "carga_inicial", null, "Lote 7", JSON.stringify([{ variante: cat.capa, quantidade: 2, custo: 1_234 }]), "form:r1:custo:0001", "Contagem"]);

    // Leitura direta: nenhuma coluna de custo, nem o resumo do conteúdo, nem em filtro, ordem ou soma. Vale para todos.
    for (const sql of [
      "select total_custo_centavos from public.entradas_estoque",
      "select * from public.entradas_estoque",
      "select conteudo from public.entradas_estoque",
      "select chave from public.entradas_estoque",
      "select id from public.entradas_estoque where total_custo_centavos > 0",
      "select id from public.entradas_estoque order by total_custo_centavos",
      "select custo_unitario_centavos from public.entrada_itens",
      "select * from public.entrada_itens",
      "select sum(custo_unitario_centavos * quantidade) from public.entrada_itens",
      "select linha from public.entrada_itens where custo_unitario_centavos = 1234",
    ]) {
      for (const quem of [vendedor, gerente, dono]) expect([sql, await codigo(quem, sql)]).toEqual([sql, "42501"]);
    }
    // O que não é custo continua legível pela loja, com as mesmas políticas.
    expect(await lerComo(vendedor, "select numero, documento, total_unidades, situacao from public.entradas_estoque"))
      .toEqual([{ numero: e.numero, documento: "Lote 7", total_unidades: 2, situacao: "registrada" }]);
    expect(await lerComo(vendedor, "select linha, quantidade, condicao, itens, reentradas from public.entrada_itens"))
      .toEqual([{ linha: 1, quantidade: 2, condicao: "novo", itens: [], reentradas: [] }]);
    expect(await lerComo(vendedorDeFora, "select entrada_id from public.entrada_itens")).toEqual([]);
    expect(await lerComo(vendedorDeFora, "select id from public.entradas_estoque")).toEqual([]);

    // Pelas funções: o gerente e o dono veem 1.234 e 2.468; o vendedor da mesma loja recebe nulo (não zero).
    for (const quem of [gerente, dono]) {
      const lido = await valor<Historico>(quem, ENTRADAS, [ids.lojaB, null, null]);
      expect(lido).toMatchObject({ ve_custo: true, total: 1, proxima: null });
      expect(lido.entradas[0]).toMatchObject({ id: e.id, numero: e.numero, total_unidades: 2, total_custo: 2_468, criado_por: expect.any(String), itens: [{ linha: 1, sku: "ACE-0001", quantidade: 2, custo_unitario: 1_234 }] });
      expect(await valor<Detalhe>(quem, DETALHE, [ids.lojaB, e.id, null])).toMatchObject({ ve_custo: true, total_custo: 2_468, itens: [{ custo_unitario: 1_234 }] });
    }
    for (const lido of [await valor<Historico>(vendedor, ENTRADAS, [ids.lojaB, null, null]), await valor<Detalhe>(vendedor, DETALHE, [ids.lojaB, null, e.numero])]) {
      expect(lido.ve_custo).toBe(false);
      expect(numerosEm(lido)).not.toContain(1_234);
      expect(numerosEm(lido)).not.toContain(2_468);
    }
    const semCusto = await valor<Historico>(vendedor, ENTRADAS, [ids.lojaB, null, null]);
    expect(semCusto.entradas[0]).toMatchObject({ id: e.id, total_unidades: 2, total_custo: null, itens: [{ linha: 1, quantidade: 2, custo_unitario: null }] });
    // Outra loja, outra rede e sem sessão: recusa.
    for (const quem of [vendedorDeFora, await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), null]) {
      expect(await codigo(quem, ENTRADAS, [ids.lojaB, null, null])).toBe("42501");
      expect(await codigo(quem, DETALHE, [ids.lojaB, e.id, null])).toBe("42501");
    }

    // Auditoria: a imagem do cabeçalho (custo total e resumo do conteúdo) segue a mesma regra.
    const auditoriaDe = async (quem: Sessao) =>
      (await lerComo<{ alvo_tipo: string }>(quem, "select alvo_tipo from public.auditoria where unidade_id = $1 order by id", [ids.lojaB])).map((l) => l.alvo_tipo);
    const antes = await auditoriaDe(gerente);
    expect(antes).toContain("entradas_estoque");
    // Permissão retirada: o gerente passa a ler a entrada sem custo e deixa de ver a imagem na auditoria; o resto continua.
    await db.query("delete from public.papel_permissoes where papel = 'gerente' and permissao = 'custo.ver'");
    const depois = await valor<Historico>(gerente, ENTRADAS, [ids.lojaB, null, null]);
    expect(depois).toMatchObject({ ve_custo: false });
    expect(depois.entradas[0]).toMatchObject({ total_custo: null, itens: [{ custo_unitario: null }] });
    const semImagem = await auditoriaDe(gerente);
    expect(semImagem).not.toContain("entradas_estoque");
    expect(semImagem).toEqual(antes.filter((a) => a !== "entradas_estoque"));
    expect(semImagem.length).toBeGreaterThan(0);
    expect(await auditoriaDe(dono)).toContain("entradas_estoque");
  });

  it("histórico completo: 23 entradas paginadas, sem repetir nem pular, e o detalhe pelo id ou pelo número (REV-NOV-009)", async () => {
    const dono = await naLoja(ids.dono, ids.lojaC);
    const numeros: number[] = [];
    for (let n = 1; n <= 23; n += 1) {
      numeros.push((await valor<Entrada>(dono, ENTRADA, [ids.lojaC, "carga_inicial", null, `Lote ${n}`, JSON.stringify([{ variante: cat.capa, quantidade: 1 }]), `form:r1:hist:${String(n).padStart(4, "0")}`, "Contagem"])).numero);
    }
    const p1 = await valor<Historico>(dono, ENTRADAS, [ids.lojaC, null, null]);
    expect(p1.total).toBe(23);
    expect(p1.entradas).toHaveLength(20);
    expect(p1.proxima).toBe(p1.entradas[19]?.numero);
    const p2 = await valor<Historico>(dono, ENTRADAS, [ids.lojaC, p1.proxima, null]);
    expect(p2.entradas).toHaveLength(3);
    expect(p2.proxima).toBeNull();
    expect([...p1.entradas, ...p2.entradas].map((x) => x.numero)).toEqual([...numeros].reverse());
    // Na lista não vão os IMEI/ICCID nem o saldo: só no detalhe.
    expect(p1.entradas[0]).toMatchObject({ documento: "Lote 23", itens: [{ linha: 1, sku: "ACE-0001", identificadores: null, saldo_livre: null }] });
    // O limite fica entre 1 e 50; página inválida é recusada; a outra loja não tem entradas.
    expect((await valor<Historico>(dono, ENTRADAS, [ids.lojaC, null, 500])).entradas).toHaveLength(23);
    expect(await valor<Historico>(dono, ENTRADAS, [ids.lojaC, null, 0])).toMatchObject({ entradas: [{ numero: numeros[22] }], proxima: numeros[22] });
    expect(await codigo(dono, ENTRADAS, [ids.lojaC, 0, null])).toBe("22023");
    expect(await valor<Historico>(dono, ENTRADAS, [ids.lojaA, null, null])).toMatchObject({ total: 0, entradas: [], proxima: null });

    // A primeira entrada (fora das 20 mais novas) abre pelo número e pelo id, com o mesmo conteúdo.
    const porNumero = await valor<Detalhe>(dono, DETALHE, [ids.lojaC, null, numeros[0]]);
    expect(porNumero).toMatchObject({ numero: numeros[0], documento: "Lote 1", situacao: "registrada", total_unidades: 1, ve_custo: true,
      itens: [{ linha: 1, sku: "ACE-0001", quantidade: 1, identificadores: [], saldo_livre: 23 }] });
    expect(await valor<Detalhe>(dono, DETALHE, [ids.lojaC, porNumero.id, null])).toEqual(porNumero);
    // Só na loja dela; um dos dois (id ou número), nunca os dois nem nenhum.
    expect(await codigo(dono, DETALHE, [ids.lojaA, porNumero.id, null])).toBe("P0002");
    expect(await codigo(dono, DETALHE, [ids.lojaA, null, numeros[0]])).toBe("P0002");
    expect(await codigo(dono, DETALHE, [ids.lojaC, null, null])).toBe("22023");
    expect(await codigo(dono, DETALHE, [ids.lojaC, porNumero.id, numeros[0]])).toBe("22023");
  });

  it("detalhe explica o estorno recusado: mostra a posição de hoje de cada IMEI e o saldo livre do acessório", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const itens = [{ variante: cat.aparelho, identificadores: [imei(8), imei(9)] }, { variante: cat.capa, quantidade: 4 }];
    const e = await valor<Entrada>(dono, ENTRADA, [ids.lojaA, "carga_inicial", null, null, JSON.stringify(itens), "form:r1:det:0001", "Contagem"]);
    await valor(dono, "select public.reservar_estoque($1, 1, $2, 'lojas:reserva:r1') as v", [cat.aparelho, (await itemDe(imei(8))).id]);
    expect(await codigo(dono, ESTORNO, [e.id, "Tentativa"])).toBe("OR002");
    const d = await valor<Detalhe>(dono, DETALHE, [ids.lojaA, e.id, null]);
    expect(d).toMatchObject({ situacao: "registrada", total_unidades: 6, estornado_por: null });
    expect(d.itens).toMatchObject([
      { linha: 1, sku: "APA-0001", quantidade: 2, reentradas: 0, saldo_livre: null, identificadores: [
        { identificador: imei(8), situacao: "reservado", livre: false, reentrada: false },
        { identificador: imei(9), situacao: "disponivel", livre: true, reentrada: false },
      ] },
      { linha: 2, sku: "ACE-0001", quantidade: 4, saldo_livre: 14, identificadores: [] },
    ]);
  });

  it("reentrada: a identidade estornada volta pela entrada sem duplicar nem reescrever o livro, e repete sem dobrar (REV-NOV-004)", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const e1 = await cargaInicial(dono, ids.lojaA, aparelhos([imei(10)]), "form:r1:re:0001");
    expect(e1.reentradas).toBe(0);
    const original = await itemDe(imei(10));
    await valor(dono, ESTORNO, [e1.id, "Lançada por engano"]);
    expect(await itemDe(imei(10))).toMatchObject({ id: original.id, situacao: "baixado", em_estoque: false });

    const e2 = await cargaInicial(dono, ids.lojaA, aparelhos([imei(10)]), "form:r1:re:0002", "Agora certo");
    expect(e2).toMatchObject({ repetida: false, reentradas: 1 });
    expect(await itemDe(imei(10))).toEqual(original); // mesma identidade, de volta e disponível
    expect((await db.query("select count(*)::int as n from public.itens_serializados where imei = $1", [imei(10)])).rows[0]).toEqual({ n: 1 });
    expect(await livroDe(original.id)).toEqual([
      { quantidade: 1, tipo: "entrada_importacao", referencia_tipo: null, unidade_id: ids.lojaA, variante_id: cat.aparelho },
      { quantidade: -1, tipo: "ajuste", referencia_tipo: "estorno_entrada", unidade_id: ids.lojaA, variante_id: cat.aparelho },
      { quantidade: 1, tipo: "entrada_importacao", referencia_tipo: "reentrada", unidade_id: ids.lojaA, variante_id: cat.aparelho },
    ]);
    expect((await db.query("select itens, reentradas from public.entrada_itens where entrada_id = $1", [e2.id])).rows[0]).toEqual({ itens: [original.id], reentradas: [original.id] });
    expect(await reentradasAuditadas()).toEqual([{
      usuario_id: ids.dono, unidade_id: ids.lojaA, alvo_tipo: "itens_serializados", alvo_id: original.id, motivo: "Agora certo", origem: "aplicacao",
      antes: { variante_id: cat.aparelho, unidade_id: ids.lojaA, condicao: "novo", situacao: "baixado" },
      depois: { variante_id: cat.aparelho, unidade_id: ids.lojaA, condicao: "novo", situacao: "disponivel", entrada_id: e2.id, entrada_numero: e2.numero },
    }]);

    // Repetir o mesmo envio devolve a mesma resposta e não lança de novo.
    expect(await cargaInicial(dono, ids.lojaA, aparelhos([imei(10)]), "form:r1:re:0002", "Agora certo")).toEqual({ ...e2, repetida: true });
    expect(await livroDe(original.id)).toHaveLength(3);
    expect(await reentradasAuditadas()).toHaveLength(1);
    // De volta ao estoque, outra entrada do mesmo IMEI é recusada com o motivo certo.
    const recusa = await falha(dono, ENTRADA, [ids.lojaA, "carga_inicial", null, null, aparelhos([imei(10)]), "form:r1:re:0003", "De novo"]);
    expect(recusa).toMatchObject({ codigo: "23505" });
    expect(recusa?.mensagem).toContain("já está no estoque desta loja");

    // O ciclo se repete: estornar a nova entrada e receber outra vez.
    await valor(dono, ESTORNO, [e2.id, "Teste do ciclo"]);
    const e3 = await cargaInicial(dono, ids.lojaA, aparelhos([imei(10)]), "form:r1:re:0004", "Volta");
    expect(e3.reentradas).toBe(1);
    expect(await livroDe(original.id)).toHaveLength(5);
    expect(await saldo(ids.lojaA, cat.aparelho)).toMatchObject({ quantidade: 3, reservado: 0 }); // 2 do cenário + este
    expect(await divergencias()).toEqual([]);
    expect((await valor<Detalhe>(dono, DETALHE, [ids.lojaA, e3.id, null])).itens[0]).toMatchObject({
      reentradas: 1, identificadores: [{ identificador: imei(10), situacao: "disponivel", livre: true, reentrada: true }] });

    // Chip pelo ICCID segue o mesmo caminho.
    const chip = JSON.stringify([{ variante: cat.chip, identificadores: [iccid(2)] }]);
    const c1 = await cargaInicial(dono, ids.lojaA, chip, "form:r1:re:0005");
    await valor(dono, ESTORNO, [c1.id, "Chip lançado por engano"]);
    expect(await cargaInicial(dono, ids.lojaA, chip, "form:r1:re:0006")).toMatchObject({ reentradas: 1 });
    expect(await itemDe(iccid(2))).toMatchObject({ situacao: "disponivel", em_estoque: true });
    expect(await divergencias()).toEqual([]);
  });

  it("reentrada corrige a loja e a variação; identidade com outra história não muda de variação (REV-NOV-004)", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    await db.query("insert into public.variantes (id, organizacao_id, produto_id, sku, nome) values ($1, $2, $3, 'APA-0002', 'Galaxy A15 256 GB Preto')", [OUTRA_VARIANTE, ids.organizacao, cat.produtoAparelho]);

    // Loja errada: estorna na A e recebe na B. A identidade muda de loja pelo livro; o estorno fica registrado.
    const e1 = await cargaInicial(dono, ids.lojaA, aparelhos([imei(11)]), "form:r1:loja:0001");
    const id11 = (await itemDe(imei(11))).id;
    await valor(dono, ESTORNO, [e1.id, "Era da loja B"]);
    expect(await cargaInicial(gerente, ids.lojaB, aparelhos([imei(11)]), "form:r1:loja:0002", "Loja certa")).toMatchObject({ reentradas: 1 });
    expect(await itemDe(imei(11))).toMatchObject({ id: id11, unidade_id: ids.lojaB, situacao: "disponivel", em_estoque: true });
    expect(await saldo(ids.lojaA, cat.aparelho)).toMatchObject({ quantidade: 2 });
    expect(await saldo(ids.lojaB, cat.aparelho)).toMatchObject({ quantidade: 2 }); // 1 do cenário + este
    expect((await reentradasAuditadas()).at(-1)).toMatchObject({ usuario_id: ids.gerenteB, unidade_id: ids.lojaB, alvo_id: id11, antes: { unidade_id: ids.lojaA }, depois: { unidade_id: ids.lojaB } });
    // A entrada estornada da loja A mostra que o aparelho hoje está em outra loja (sem dizer qual).
    expect((await valor<Detalhe>(dono, DETALHE, [ids.lojaA, e1.id, null])).itens[0]?.identificadores).toEqual([{ identificador: imei(11), situacao: "outra_loja", livre: false, reentrada: false }]);

    // Variação errada: estorna e recebe na variação certa, como seminovo.
    const e2 = await cargaInicial(dono, ids.lojaA, aparelhos([imei(12)]), "form:r1:var:0001");
    const id12 = (await itemDe(imei(12))).id;
    await valor(dono, ESTORNO, [e2.id, "Era o de 256 GB"]);
    expect(await cargaInicial(dono, ids.lojaA, aparelhos([imei(12)], OUTRA_VARIANTE, { condicao: "seminovo" }), "form:r1:var:0002", "Variação certa")).toMatchObject({ reentradas: 1 });
    expect(await itemDe(imei(12))).toEqual({ id: id12, variante_id: OUTRA_VARIANTE, unidade_id: ids.lojaA, situacao: "disponivel", em_estoque: true, condicao: "seminovo" });
    expect(await saldo(ids.lojaA, cat.aparelho)).toMatchObject({ quantidade: 2 });
    expect(await saldo(ids.lojaA, OUTRA_VARIANTE)).toMatchObject({ quantidade: 1 });
    expect((await livroDe(id12)).map((m) => m.variante_id)).toEqual([cat.aparelho, cat.aparelho, OUTRA_VARIANTE]);
    expect((await reentradasAuditadas()).at(-1)).toMatchObject({ alvo_id: id12, antes: { variante_id: cat.aparelho, condicao: "novo" }, depois: { variante_id: OUTRA_VARIANTE, condicao: "seminovo" } });
    expect(await divergencias()).toEqual([]);

    // Com outra história (uma reserva, mesmo já liberada), a variação não muda; a loja ainda pode ser corrigida.
    const e3 = await cargaInicial(dono, ids.lojaA, aparelhos([imei(13)]), "form:r1:var:0003");
    const id13 = (await itemDe(imei(13))).id;
    const reserva = await valor<string>(dono, "select public.reservar_estoque($1, 1, $2, 'lojas:reserva:r1b') as v", [cat.aparelho, id13]);
    await valor(dono, "select public.liberar_reserva($1) as v", [reserva]);
    await valor(dono, ESTORNO, [e3.id, "Lançada por engano"]);
    const recusa = await falha(dono, ENTRADA, [ids.lojaA, "carga_inicial", null, null, aparelhos([imei(13)], OUTRA_VARIANTE), "form:r1:var:0004", "Tentativa"]);
    expect(recusa).toMatchObject({ codigo: "23505" });
    expect(recusa?.mensagem).toContain("em outra variação: receba na variação original (SKU APA-0001)");
    expect(await itemDe(imei(13))).toMatchObject({ variante_id: cat.aparelho, situacao: "baixado", em_estoque: false });
    expect(await cargaInicial(gerente, ids.lojaB, aparelhos([imei(13)]), "form:r1:var:0005", "Loja certa")).toMatchObject({ reentradas: 1 });
    expect(await itemDe(imei(13))).toMatchObject({ id: id13, unidade_id: ids.lojaB, variante_id: cat.aparelho, situacao: "disponivel" });
    expect(await divergencias()).toEqual([]);
  });

  it("reentrada recusa o que não saiu por estorno: no estoque, vendido, em transferência, baixado por perda ou ajuste e segundo IMEI", async () => {
    const dono = await naLoja(ids.dono, ids.lojaB);
    let chave = 0;
    const tentativa = async (identificador: string) =>
      falha(dono, ENTRADA, [ids.lojaB, "carga_inicial", null, null, aparelhos([identificador]), `form:r1:rec:${String(++chave).padStart(4, "0")}`, "Tentativa"]);
    const recusada = async (identificador: string, trecho: string) => {
      const f = await tentativa(identificador);
      expect([identificador, f?.codigo]).toEqual([identificador, "23505"]);
      expect(f?.mensagem).toContain(trecho);
    };
    await recusada(cat.imei3, "já está no estoque desta loja"); // b1 está na loja B
    await recusada(cat.imei1, "já está no estoque de outra loja: use a transferência"); // a1 está na loja A

    // Posições fabricadas (só o estado; as jornadas reais de venda e transferência têm testes próprios).
    await db.exec("set session_replication_role = replica");
    await db.query("update public.itens_serializados set situacao = 'vendido', em_estoque = false where id = $1", [itensDoCenario.a1]);
    await db.query("update public.itens_serializados set situacao = 'em_transito', em_estoque = false where id = $1", [itensDoCenario.a2]);
    await db.exec("set session_replication_role = origin");
    await recusada(cat.imei1, "já foi vendido: a volta ao estoque é pela devolução da venda");
    await recusada(cat.imei2, "está em transferência: conclua o recebimento da transferência");

    // Baixado por perda (ou por ajuste que não é estorno de entrada): a entrada não desfaz a baixa.
    await db.query("select privado.lancar_movimento($1, $2, -1, 'perda', $3, 'Quebra no balcão', null, null, 'teste:r1:perda', $4)", [ids.lojaB, cat.aparelho, itensDoCenario.b1, ids.dono]);
    await recusada(cat.imei3, "foi baixado por ajuste ou perda: a entrada não desfaz essa baixa");
    const e = await cargaInicial(dono, ids.lojaB, aparelhos([imei(15)]), "form:r1:rec:ajuste");
    await db.query("select privado.lancar_movimento($1, $2, -1, 'ajuste', $3, 'Contagem', 'inventario', $4, 'teste:r1:ajuste', $5)", [ids.lojaB, cat.aparelho, (await itemDe(imei(15))).id, e.id, ids.dono]);
    await recusada(imei(15), "foi baixado por ajuste ou perda");

    // Segundo IMEI de um aparelho já cadastrado: pede o principal, em qualquer posição.
    const e2 = await cargaInicial(dono, ids.lojaB, aparelhos([imei(16)]), "form:r1:rec:segundo");
    await db.query("update public.itens_serializados set imei2 = $1 where imei = $2", [imei(17), imei(16)]);
    await recusada(imei(17), "é o segundo IMEI de um aparelho já cadastrado");
    await valor(dono, ESTORNO, [e2.id, "Lançada por engano"]);
    await recusada(imei(17), "é o segundo IMEI de um aparelho já cadastrado");
    expect(await cargaInicial(dono, ids.lojaB, aparelhos([imei(16)]), "form:r1:rec:principal")).toMatchObject({ reentradas: 1 });
    expect(await reentradasAuditadas()).toHaveLength(1);
  });

  it("repetir depois do erro: nada fica pela metade e a mesma chave serve para o envio corrigido", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const e1 = await cargaInicial(dono, ids.lojaA, aparelhos([imei(14)]), "form:r1:erro:0001");
    const id14 = (await itemDe(imei(14))).id;
    await valor(dono, ESTORNO, [e1.id, "Lançada por engano"]);
    // A primeira linha é uma reentrada válida; a segunda tem um IMEI inválido: a entrada inteira é desfeita.
    const ruim = JSON.stringify([{ variante: cat.aparelho, identificadores: [imei(14)] }, { variante: cat.aparelho, identificadores: ["123"] }]);
    expect(await codigo(dono, ENTRADA, [ids.lojaA, "carga_inicial", null, null, ruim, "form:r1:erro:0002", "Volta"])).toBe("22023");
    expect(await itemDe(imei(14))).toMatchObject({ id: id14, situacao: "baixado", em_estoque: false });
    expect(await livroDe(id14)).toHaveLength(2);
    expect(await reentradasAuditadas()).toEqual([]);
    expect((await db.query("select count(*)::int as n from public.entradas_estoque where chave = 'form:r1:erro:0002'")).rows[0]).toEqual({ n: 0 });
    // O envio corrigido passa com a mesma chave do formulário.
    expect(await cargaInicial(dono, ids.lojaA, aparelhos([imei(14)]), "form:r1:erro:0002", "Volta")).toMatchObject({ repetida: false, reentradas: 1 });
    expect(await itemDe(imei(14))).toMatchObject({ id: id14, situacao: "disponivel", em_estoque: true });
    expect(await divergencias()).toEqual([]);
  });

  it("produto ou variação inativos não recebem; reativar libera (REV-NOV-005)", async () => {
    const dono = await naLoja(ids.dono, ids.lojaC);
    const capa = JSON.stringify([{ variante: cat.capa, quantidade: 1 }]);
    const tentar1 = (chave: string) => falha(dono, ENTRADA, [ids.lojaC, "carga_inicial", null, null, capa, chave, "Tentativa"]);
    // Produto inativo com a variação ainda ativa (o caso do achado).
    await db.query("update public.produtos set ativo = false where id = $1", [cat.produtoCapa]);
    const semProduto = await tentar1("form:r1:inativo:0001");
    expect(semProduto).toMatchObject({ codigo: "22023" });
    expect(semProduto?.mensagem).toContain("Linha 1 (ACE-0001): o produto está inativo no catálogo: reative antes de receber");
    await db.query("update public.produtos set ativo = true where id = $1", [cat.produtoCapa]);
    await db.query("update public.variantes set ativa = false where id = $1", [cat.capa]);
    const semVariante = await tentar1("form:r1:inativo:0002");
    expect(semVariante).toMatchObject({ codigo: "22023" });
    expect(semVariante?.mensagem).toContain("variação inativa");
    expect(await saldo(ids.lojaC, cat.capa)).toMatchObject({ quantidade: 0 });
    await db.query("update public.variantes set ativa = true where id = $1", [cat.capa]);
    expect(await cargaInicial(dono, ids.lojaC, capa, "form:r1:inativo:0003")).toMatchObject({ repetida: false, reentradas: 0 });
    expect(await saldo(ids.lojaC, cat.capa)).toMatchObject({ quantidade: 1 });
  });
});

describe("entrada com dois IMEIs por aparelho", () => {
  const argumentos = (identificadores: unknown[], chave: string, tipo = "aparelho") => [
    ids.lojaA, "carga_inicial", null, null,
    JSON.stringify([{ variante: tipo === "aparelho" ? cat.aparelho : cat.chip, identificadores, custo: 1000 }]),
    chave, "Contagem fictícia",
  ];

  it("grava um movimento, um custo e uma unidade; ambos os IMEIs identificam o mesmo aparelho", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const par = { imei: imei(991), imei2: imei(992) };
    const antes = await saldo(ids.lojaA, cat.aparelho);
    const args = argumentos([par], "imei-duplo:1");
    const r = await valor<Entrada>(dono, ENTRADA, args);
    const d = await valor<Detalhe>(dono, DETALHE, [ids.lojaA, r.id, null]);
    expect(d).toMatchObject({ total_unidades: 1, total_custo: 1000, itens: [{ quantidade: 1, identificadores: [{ identificador: par.imei, imei2: par.imei2 }] }] });
    expect((await saldo(ids.lojaA, cat.aparelho)).quantidade).toBe(antes.quantidade + 1);
    const achados = (await db.query<{ campo: string; item_serializado_id: string }>(
      "select campo, item_serializado_id from privado.identificadores_itens where organizacao_id = $1 and identificador in ($2, $3) order by campo",
      [ids.organizacao, par.imei, par.imei2],
    )).rows;
    expect(achados.map((i) => i.campo)).toEqual(["imei", "imei2"]);
    expect(achados[0]?.item_serializado_id).toBe(achados[1]?.item_serializado_id);
    expect(await valor<Entrada>(dono, ENTRADA, args)).toMatchObject({ id: r.id, repetida: true });
    await valor(dono, ESTORNO, [r.id, "Estorno fictício"]);
    const volta = await valor<Entrada>(dono, ENTRADA, argumentos([par], "imei-duplo:2"));
    expect(volta.reentradas).toBe(1);
    const d2 = await valor<Detalhe>(dono, DETALHE, [ids.lojaA, volta.id, null]);
    expect(d2.itens[0]?.identificadores).toMatchObject([{ identificador: par.imei, imei2: par.imei2, reentrada: true }]);
  });

  it("registra dez aparelhos pareados como dez unidades e vinte identificadores", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const pares = Array.from({ length: 10 }, (_, i) => ({ imei: imei(950 + 2 * i), imei2: imei(951 + 2 * i) }));
    const antes = await saldo(ids.lojaA, cat.aparelho);
    const r = await valor<Entrada>(dono, ENTRADA, argumentos(pares, "imei-duplo:lote"));
    const d = await valor<Detalhe>(dono, DETALHE, [ids.lojaA, r.id, null]);
    expect(d).toMatchObject({ total_unidades: 10, total_custo: 10_000, itens: [{ quantidade: 10 }] });
    expect(d.itens[0]?.identificadores).toHaveLength(10);
    expect((await saldo(ids.lojaA, cat.aparelho)).quantidade).toBe(antes.quantidade + 10);
    const encontrados = (await db.query<{ total: number; aparelhos: number }>(
      "select count(*)::int as total, count(distinct item_serializado_id)::int as aparelhos from privado.identificadores_itens where organizacao_id = $1 and identificador = any ($2::text[])",
      [ids.organizacao, pares.flatMap(({ imei, imei2 }) => [imei, imei2])],
    )).rows[0];
    expect(encontrados).toEqual({ total: 20, aparelhos: 10 });
  });

  it("recusa repetição cruzada na mesma carga ou no estoque e não aceita par para chip", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const par = { imei: imei(991), imei2: imei(992) };
    const antes = await saldo(ids.lojaA, cat.aparelho);
    expect(await codigo(dono, ENTRADA, argumentos([par, par.imei2], "imei-duplo:3"))).toBe("22023");
    expect(await codigo(dono, ENTRADA, argumentos([{ ...par, imei2: par.imei }], "imei-duplo:4"))).toBe("22023");
    expect(await codigo(dono, ENTRADA, argumentos([{ ...par, imei2: "123" }], "imei-duplo:5"))).toBe("22023");
    expect(await codigo(dono, ENTRADA, argumentos([par], "imei-duplo:6", "chip"))).toBe("22023");
    expect(await saldo(ids.lojaA, cat.aparelho)).toEqual(antes);
    await valor(dono, ENTRADA, argumentos([par], "imei-duplo:7"));
    expect(await codigo(dono, ENTRADA, argumentos([{ imei: imei(993), imei2: par.imei }], "imei-duplo:8"))).toBe("23505");
    expect(await codigo(dono, ENTRADA, argumentos([par.imei2], "imei-duplo:9"))).toBe("23505");
    expect(await saldo(ids.lojaA, cat.aparelho)).toEqual({ ...antes, quantidade: antes.quantidade + 1 });
  });
});
