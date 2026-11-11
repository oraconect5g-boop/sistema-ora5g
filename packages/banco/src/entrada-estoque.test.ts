// Entrada de mercadoria (lote L4a: ORA-INV-009, ORA-INV-004, ORA-CAT-008): compra com fornecedor e carga
// inicial, aparelho e chip pelo IMEI/ICCID, acessório por quantidade, custo de entrada e estorno pelo
// livro. Banco em memória com todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
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
