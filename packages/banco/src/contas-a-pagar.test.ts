// Contas a pagar da empresa (lote L8a: ORA-FIN-004; decisões do proprietário de 13/11): o dono lança e
// paga em todas as lojas e na rede; o gerente, na loja dele; categorias com a lista inicial que o dono
// ajusta; conta parcelada e conta que se repete todo mês. Banco em memória com todas as migrations;
// dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = () => `l8a:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `78000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string }> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return { v };
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      return { codigo: (e as { code?: string }).code ?? "sem-codigo" };
    }
  }, { criarSessao: false });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.codigo}`);
  return r.v;
}
const codigo = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

const LANCAR = "select public.conta_pagar_lancar($1::jsonb, $2) as v";
const PAGAR = "select public.conta_pagar_pagar($1, $2::date, $3, $4) as v";
const DESFAZER = "select public.conta_pagar_desfazer_pagamento($1, $2) as v";
const CANCELAR = "select public.conta_pagar_cancelar($1, $2, $3) as v";
const CORRIGIR = "select public.conta_pagar_corrigir($1, $2::jsonb, $3) as v";
const CATEGORIA = "select public.conta_pagar_categoria_salvar($1, $2, $3) as v";
const RESUMO = "select public.contas_a_pagar_resumo($1, $2) as v";

const hoje = async (dias = 0) => (await db.query<{ v: string }>("select ((now() at time zone 'America/Sao_Paulo')::date + $1::int)::text as v", [dias])).rows[0]?.v ?? "";
const categoria = async (nome: string, org = ids.organizacao) =>
  (await db.query<{ id: string }>("select id from public.contas_pagar_categorias where organizacao_id = $1 and nome = $2", [org, nome])).rows[0]?.id ?? "";
const dados = (extra: Record<string, unknown>) => JSON.stringify({ descricao: "Aluguel da loja", valor: 650_000, forma: "unica", ...extra });
type Linha = { parcela: number; valor: string; vencimento: string; situacao: string; forma: string; parcelas: number; unidade_id: string | null };
const doGrupo = async (grupo: string) => (await db.query<Linha>(
  "select parcela, valor_centavos::text as valor, vencimento::text, situacao, forma, parcelas, unidade_id from public.contas_a_pagar where grupo_id = $1 order by parcela", [grupo])).rows;
const conta = async (grupo: string, parcela = 1) =>
  (await db.query<{ id: string }>("select id from public.contas_a_pagar where grupo_id = $1 and parcela = $2", [grupo, parcela])).rows[0]?.id ?? "";

describe("contas a pagar: quem lança (L8a)", () => {
  it("o dono lança na rede e em qualquer loja; o gerente só na loja dele; vendedor, administrador e outra rede não", async () => {
    const aluguel = await categoria("Aluguel e condomínio");
    const vencimento = await hoje(10);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const daRede = await valor<string>(dono, LANCAR, [dados({ categoria: aluguel, vencimento, unidade: null }), chave()]);
    expect((await doGrupo(daRede))[0]).toMatchObject({ unidade_id: null, situacao: "aberta", forma: "unica", parcelas: 1, valor: "650000", vencimento });
    const daLojaB = await valor<string>(dono, LANCAR, [dados({ categoria: aluguel, vencimento, unidade: ids.lojaB }), chave()]);
    expect((await doGrupo(daLojaB))[0]?.unidade_id).toBe(ids.lojaB);

    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await valor<string>(gerente, LANCAR, [dados({ categoria: aluguel, vencimento, unidade: ids.lojaB }), chave()])).toMatch(/^[0-9a-f-]{36}$/);
    expect(await codigo(gerente, LANCAR, [dados({ categoria: aluguel, vencimento, unidade: null }), chave()])).toBe("42501");
    expect(await codigo(gerente, LANCAR, [dados({ categoria: aluguel, vencimento, unidade: ids.lojaA }), chave()])).toBe("42501");
    expect(await codigo(await naLoja(ids.vendedorA, ids.lojaA), LANCAR, [dados({ categoria: aluguel, vencimento, unidade: ids.lojaA }), chave()])).toBe("42501");
    expect(await codigo(await naLoja(ids.administrador, ids.lojaA), LANCAR, [dados({ categoria: aluguel, vencimento, unidade: ids.lojaA }), chave()])).toBe("42501");
    expect(await codigo(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), LANCAR, [dados({ categoria: aluguel, vencimento, unidade: ids.lojaA }), chave()])).toBe("42501");
    // A categoria é da organização: a de outra rede não serve.
    expect(await codigo(dono, LANCAR, [dados({ categoria: await categoria("Aluguel e condomínio", ids.outraOrganizacao), vencimento, unidade: ids.lojaA }), chave()])).toBe("22023");
  });

  it("parcelada divide o total (os centavos que sobram na primeira); a repetida põe o mesmo valor em cada mês; o vencimento anda mês a mês, também no fim do mês", async () => {
    const mercadoria = await categoria("Mercadoria (fornecedor)");
    const ano = Number((await hoje()).slice(0, 4)) + 1;
    const fevereiro = new Date(Date.UTC(ano, 2, 0)).getUTCDate();
    const dono = await naLoja(ids.dono, ids.lojaA);
    const parcelada = await valor<string>(dono, LANCAR, [dados({ categoria: mercadoria, unidade: ids.lojaA, descricao: "Boleto de aparelhos", valor: 100_000, forma: "parcelada", vezes: 3, vencimento: `${ano}-01-31` }), chave()]);
    expect((await doGrupo(parcelada)).map((l) => [l.parcela, l.valor, l.vencimento])).toEqual([
      [1, "33334", `${ano}-01-31`], [2, "33333", `${ano}-02-${fevereiro}`], [3, "33333", `${ano}-03-31`],
    ]);
    const aluguel = await categoria("Aluguel e condomínio");
    const mensal = await valor<string>(dono, LANCAR, [dados({ categoria: aluguel, unidade: ids.lojaA, forma: "mensal", vezes: 12, vencimento: `${ano}-01-10` }), chave()]);
    const meses = await doGrupo(mensal);
    expect(meses).toHaveLength(12);
    expect(new Set(meses.map((l) => l.valor))).toEqual(new Set(["650000"]));
    expect([meses[0]?.vencimento, meses[11]?.vencimento]).toEqual([`${ano}-01-10`, `${ano}-12-10`]);
  });

  it("a mesma chave devolve o mesmo lançamento; com outros dados é recusada; os limites são conferidos antes de gravar", async () => {
    const aluguel = await categoria("Aluguel e condomínio");
    const vencimento = await hoje(5);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const k = chave();
    const primeiro = await valor<string>(dono, LANCAR, [dados({ categoria: aluguel, vencimento, unidade: ids.lojaA }), k]);
    expect(await valor(dono, LANCAR, [dados({ categoria: aluguel, vencimento, unidade: ids.lojaA }), k])).toBe(primeiro);
    expect(await codigo(dono, LANCAR, [dados({ categoria: aluguel, vencimento, unidade: ids.lojaA, valor: 1 }), k])).toBe("OR004");
    const invalidos: Record<string, unknown>[] = [
      { forma: "unica", vezes: 2 }, { forma: "parcelada", vezes: 1 }, { forma: "mensal", vezes: 37 }, { forma: "parcelada", vezes: 3, valor: 2 },
      { descricao: "ab" }, { valor: 0 }, { valor: "12.5" }, { vencimento: await hoje(2000) }, { vencimento: await hoje(-400) }, { forma: "semanal" },
      { documento: "x".repeat(61) },
    ];
    for (const extra of invalidos) {
      expect(await codigo(dono, LANCAR, [dados({ categoria: aluguel, vencimento, unidade: ids.lojaA, ...extra }), chave()]), JSON.stringify(extra)).toBe("22023");
    }
    // Fornecedor só da organização e ativo.
    const fornecedor = (await db.query<{ id: string }>("insert into public.fornecedores (organizacao_id, nome, criado_por, ativo) values ($1, 'Distribuidora Teste', $2, false) returning id", [ids.organizacao, ids.dono])).rows[0]?.id;
    expect(await codigo(dono, LANCAR, [dados({ categoria: aluguel, vencimento, unidade: ids.lojaA, fornecedor }), chave()])).toBe("22023");
    await db.query("update public.fornecedores set ativo = true where id = $1", [fornecedor]);
    expect(await codigo(dono, LANCAR, [dados({ categoria: aluguel, vencimento, unidade: ids.lojaA, fornecedor }), chave()])).toBeNull();
  });
});

describe("contas a pagar: pagar, desfazer, cancelar e corrigir (L8a)", () => {
  it("pagar com juros ou desconto, até hoje, com a referência; repetir igual não muda; mudar pede desfazer, que pede motivo; tudo auditado", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const grupo = await valor<string>(dono, LANCAR, [dados({ categoria: await categoria("Água, luz e internet"), vencimento: await hoje(-2), unidade: ids.lojaA, descricao: "Conta de luz", valor: 48_000 }), chave()]);
    const id = await conta(grupo);
    const ontem = await hoje(-1);
    expect(await codigo(dono, PAGAR, [id, await hoje(1), 48_000, "PIX-123"])).toBe("22023");
    expect(await codigo(dono, PAGAR, [id, ontem, 96_001, "PIX-123"])).toBe("22023");
    expect(await codigo(dono, PAGAR, [id, ontem, 48_000, "ok"])).toBe("22023");
    expect(await valor(dono, PAGAR, [id, ontem, 49_440, "  PIX   123 "])).toBe(true);
    expect(await valor(dono, PAGAR, [id, ontem, 49_440, "PIX 123"])).toBe(false);
    expect(await codigo(dono, PAGAR, [id, ontem, 48_000, "PIX 123"])).toBe("OR030");
    const paga = (await db.query("select situacao, paga_em::text, valor_pago_centavos::text as pago, referencia_pagamento, paga_por from public.contas_a_pagar where id = $1", [id])).rows[0];
    expect(paga).toEqual({ situacao: "paga", paga_em: ontem, pago: "49440", referencia_pagamento: "PIX 123", paga_por: ids.dono });
    expect(await codigo(dono, CANCELAR, [id, "Lançada em dobro", false])).toBe("22023");
    expect(await codigo(dono, DESFAZER, [id, ""])).toBe("22023");
    expect(await valor(dono, DESFAZER, [id, "Pagamento lançado na conta errada"])).toBe(true);
    expect(await valor(dono, DESFAZER, [id, "De novo"])).toBe(false);
    expect(await valor(dono, CANCELAR, [id, "Lançada em dobro", false])).toBe(1);
    expect(await codigo(dono, PAGAR, [id, ontem, 48_000, "PIX 123"])).toBe("22023");
    const motivos = (await db.query<{ motivo: string }>("select motivo from public.auditoria where alvo_id = $1 order by id", [id])).rows.map((r) => r.motivo);
    expect(motivos).toEqual([
      "Conta a pagar lançada: Conta de luz", "Conta paga: PIX 123", "Pagamento da conta desfeito: Pagamento lançado na conta errada", "Conta a pagar cancelada: Lançada em dobro",
    ]);
  });

  it("cancelar uma parcela ou as seguintes do mesmo lançamento; a cancelada não muda de novo; corrigir só a aberta, com motivo", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const grupo = await valor<string>(dono, LANCAR, [dados({ categoria: await categoria("Aluguel e condomínio"), vencimento: await hoje(3), unidade: ids.lojaA, forma: "mensal", vezes: 6 }), chave()]);
    expect(await valor(dono, CANCELAR, [await conta(grupo, 3), "Contrato encerrado", true])).toBe(4);
    expect((await doGrupo(grupo)).map((l) => l.situacao)).toEqual(["aberta", "aberta", "cancelada", "cancelada", "cancelada", "cancelada"]);
    expect(await valor(dono, CANCELAR, [await conta(grupo, 3), "Contrato encerrado", false])).toBe(0);
    const primeira = await conta(grupo, 1);
    const novoVencimento = await hoje(4);
    expect(await codigo(dono, CORRIGIR, [primeira, JSON.stringify({ valor: 700_000 }), null])).toBe("22023");
    expect(await valor(dono, CORRIGIR, [primeira, JSON.stringify({ valor: 700_000, vencimento: novoVencimento }), "Reajuste do aluguel"])).toBe(true);
    expect(await valor(dono, CORRIGIR, [primeira, JSON.stringify({ valor: 700_000, vencimento: novoVencimento }), "Reajuste do aluguel"])).toBe(false);
    expect((await doGrupo(grupo))[0]).toMatchObject({ valor: "700000", vencimento: novoVencimento });
    expect(await codigo(dono, CORRIGIR, [await conta(grupo, 4), JSON.stringify({ valor: 1 }), "Tentativa"])).toBe("22023");
    // O gerente de outra loja não encontra a conta para pagar, corrigir ou cancelar.
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await codigo(gerente, PAGAR, [primeira, await hoje(), 1_000, "PIX-1"])).toBe("P0002");
    expect(await codigo(gerente, CORRIGIR, [primeira, JSON.stringify({ valor: 1 }), "Tentativa"])).toBe("P0002");
    expect(await codigo(gerente, CANCELAR, [primeira, "Tentativa", false])).toBe("P0002");
  });
});

describe("contas a pagar: quem lê e o resumo (L8a)", () => {
  it("o gerente lê as da loja dele; o dono, todas; o vendedor, nenhuma; ninguém escreve direto na tabela", async () => {
    const aluguel = await categoria("Aluguel e condomínio");
    const vencimento = await hoje(5);
    const dono = await naLoja(ids.dono, ids.lojaA);
    for (const unidade of [null, ids.lojaA, ids.lojaB]) await valor(dono, LANCAR, [dados({ categoria: aluguel, vencimento, unidade }), chave()]);
    const quantas = async (s: Sessao) => comoUsuario(db, s, async () => (await db.query("select id from public.contas_a_pagar")).rows.length, { criarSessao: false });
    expect(await quantas(dono)).toBe(3);
    expect(await quantas(await naLoja(ids.gerenteB, ids.lojaB))).toBe(1);
    expect(await quantas(await naLoja(ids.vendedorA, ids.lojaA))).toBe(0);
    expect(await quantas(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg))).toBe(0);
    expect(await codigo(dono, "update public.contas_a_pagar set situacao = 'paga' returning 1 as v")).toBe("42501");
    expect(await codigo(dono, "insert into public.contas_pagar_categorias (organizacao_id, nome) values ($1, 'Intrusa') returning 1 as v", [ids.organizacao])).toBe("42501");
  });

  it("o resumo soma no banco o que a pessoa lê: vencidas, hoje, próximos dias, pagas no mês, por categoria, por loja e por semana", async () => {
    const aluguel = await categoria("Aluguel e condomínio");
    const luz = await categoria("Água, luz e internet");
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, LANCAR, [dados({ categoria: aluguel, vencimento: await hoje(-3), unidade: null, valor: 100_000 }), chave()]);
    await valor(dono, LANCAR, [dados({ categoria: luz, vencimento: await hoje(), unidade: ids.lojaA, valor: 20_000 }), chave()]);
    await valor(dono, LANCAR, [dados({ categoria: luz, vencimento: await hoje(5), unidade: ids.lojaB, valor: 30_000 }), chave()]);
    await valor(dono, LANCAR, [dados({ categoria: aluguel, vencimento: await hoje(20), unidade: ids.lojaB, valor: 40_000 }), chave()]);
    const pagaGrupo = await valor<string>(dono, LANCAR, [dados({ categoria: luz, vencimento: await hoje(-1), unidade: ids.lojaB, valor: 10_000 }), chave()]);
    await valor(dono, PAGAR, [await conta(pagaGrupo), await hoje(), 10_500, "PIX-9"]);

    type Resumo = Record<string, unknown> & { por_categoria: unknown[]; por_loja: unknown[]; por_semana: { inicio: string; valor: number }[]; escopo: { rede: boolean; lojas: { id: string }[] } };
    const r = await valor<Resumo>(dono, RESUMO, [null, false]);
    expect(r).toMatchObject({
      hoje: await hoje(),
      abertas: { quantidade: 4, valor: 190_000 },
      vencidas: { quantidade: 1, valor: 100_000, mais_antiga_dias: 3 },
      hoje_vencem: { quantidade: 1, valor: 20_000 },
      proximos_7: { quantidade: 1, valor: 30_000 },
      proximos_30: { quantidade: 2, valor: 70_000 },
      pagas_no_mes: { quantidade: 1, valor_pago: 10_500, valor: 10_000 },
    });
    expect(r.por_categoria).toEqual([{ categoria: aluguel, aberto: 140_000, pago_no_mes: 0 }, { categoria: luz, aberto: 50_000, pago_no_mes: 10_500 }]);
    expect(r.por_loja).toEqual([{ unidade: null, aberto: 100_000, vencido: 100_000 }, { unidade: ids.lojaB, aberto: 70_000, vencido: 0 }, { unidade: ids.lojaA, aberto: 20_000, vencido: 0 }]);
    expect(r.por_semana).toHaveLength(8);
    expect(r.por_semana.slice(0, 3).map((s) => s.valor)).toEqual([50_000, 0, 40_000]);
    expect(r.escopo.rede).toBe(true);
    expect(r.escopo.lojas.map((l) => l.id)).toEqual(expect.arrayContaining([ids.lojaA, ids.lojaB, ids.lojaC]));
    // Só a rede, ou só uma loja.
    expect(await valor<Resumo>(dono, RESUMO, [null, true])).toMatchObject({ abertas: { quantidade: 1, valor: 100_000 } });
    expect(await valor<Resumo>(dono, RESUMO, [ids.lojaB, false])).toMatchObject({ abertas: { quantidade: 2, valor: 70_000 }, pagas_no_mes: { quantidade: 1 } });

    // O gerente da loja B: só a loja dele, sem a rede; pedir a rede ou outra loja é recusado.
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const rB = await valor<Resumo>(gerente, RESUMO, [null, false]);
    expect(rB).toMatchObject({ abertas: { quantidade: 2, valor: 70_000 }, vencidas: { quantidade: 0, valor: 0 } });
    expect(rB.escopo).toEqual({ rede: false, lojas: [{ id: ids.lojaB, nome: "Loja B" }] });
    expect(await codigo(gerente, RESUMO, [null, true])).toBe("42501");
    expect(await codigo(gerente, RESUMO, [ids.lojaA, false])).toBe("42501");
    expect(await codigo(await naLoja(ids.vendedorA, ids.lojaA), RESUMO, [null, false])).toBe("42501");
  });
});

describe("contas a pagar: categorias (L8a)", () => {
  it("toda organização nasce com a lista inicial; só o dono cria, renomeia e desativa; nome repetido é recusado; a desativada não recebe conta nova", async () => {
    const lista = async (org: string) => (await db.query<{ nome: string }>("select nome from public.contas_pagar_categorias where organizacao_id = $1 and ativa order by ordem", [org])).rows.map((r) => r.nome);
    const inicial = ["Mercadoria (fornecedor)", "Aluguel e condomínio", "Água, luz e internet", "Salários e encargos", "Impostos e taxas", "Marketing", "Manutenção", "Outras"];
    expect(await lista(ids.organizacao)).toEqual(inicial);
    expect(await lista(ids.outraOrganizacao)).toEqual(inicial);

    const dono = await naLoja(ids.dono, ids.lojaA);
    const frete = await valor<string>(dono, CATEGORIA, [null, "  Frete  e   entregas ", null]);
    expect((await db.query("select nome, ativa, criada_por from public.contas_pagar_categorias where id = $1", [frete])).rows[0]).toEqual({ nome: "Frete e entregas", ativa: true, criada_por: ids.dono });
    expect(await codigo(dono, CATEGORIA, [null, "frete E ENTREGAS", null])).toBe("22023");
    expect(await codigo(dono, CATEGORIA, [null, "x", null])).toBe("22023");
    expect(await valor(dono, CATEGORIA, [frete, "Frete", null])).toBe(frete);
    expect(await valor(dono, CATEGORIA, [frete, "Frete", false])).toBe(frete);
    expect(await codigo(dono, LANCAR, [dados({ categoria: frete, vencimento: await hoje(1), unidade: ids.lojaA }), chave()])).toBe("22023");
    expect(await valor(dono, CATEGORIA, [frete, "Frete", true])).toBe(frete);
    expect(await codigo(dono, LANCAR, [dados({ categoria: frete, vencimento: await hoje(1), unidade: ids.lojaA }), chave()])).toBeNull();

    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await codigo(gerente, CATEGORIA, [null, "Do gerente", null])).toBe("42501");
    expect(await codigo(gerente, CATEGORIA, [frete, "Renomeada", null])).toBe("P0002");
    expect(await codigo(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), CATEGORIA, [frete, "Invasora", null])).toBe("P0002");
    // O gerente lê a lista (para lançar na loja dele); o vendedor, não.
    const leitura = async (s: Sessao) => comoUsuario(db, s, async () => (await db.query("select id from public.contas_pagar_categorias")).rows.length, { criarSessao: false });
    expect(await leitura(gerente)).toBe(9);
    expect(await leitura(await naLoja(ids.vendedorA, ids.lojaA))).toBe(0);
    const motivos = (await db.query<{ motivo: string }>("select motivo from public.auditoria where alvo_id = $1 order by id", [frete])).rows.map((r) => r.motivo);
    expect(motivos).toEqual([
      "Categoria das contas a pagar criada: Frete e entregas", "Categoria das contas a pagar alterada: Frete",
      "Categoria das contas a pagar alterada: Frete (desativada)", "Categoria das contas a pagar alterada: Frete (reativada)",
    ]);
  });
});
