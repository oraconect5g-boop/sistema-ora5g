// A conta a pagar ligada à entrada de mercadoria (lote FIN-004a: ORA-FIN-004): o lançamento inteiro (todas as parcelas)
// ligado à compra de origem, com motivo e auditoria, e cada recusa. Banco em memória com todas as migrations; dados
// FICTÍCIOS. Cada teste numa transação desfeita.
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
const chave = () => `fin004a:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `7a000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string; mensagem: string }> {
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
  }, { criarSessao: false });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const recusa = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? `${r.codigo}: ${r.mensagem}` : null;
};

const LANCAR = "select public.conta_pagar_lancar($1::jsonb, $2) as v";
const LIGAR = "select public.conta_pagar_ligar_entrada($1, $2, $3) as v";
const FORNECEDOR = "select public.fornecedor_salvar($1, $2, $3, $4, $5, $6, $7) as v";
const ENTRADA = "select public.estoque_registrar_entrada($1, $2, $3, $4, $5::jsonb, $6, $7) as v";
const ESTORNO = "select public.estoque_estornar_entrada($1, $2) as v";
const CAPAS = JSON.stringify([{ variante: cat.capa, quantidade: 5, custo: 1_800 }]);

const categoria = async (nome: string) =>
  (await db.query<{ id: string }>("select id from public.contas_pagar_categorias where organizacao_id = $1 and nome = $2", [ids.organizacao, nome])).rows[0]?.id ?? "";
const vencimento = async () => (await db.query<{ v: string }>("select ((now() at time zone 'America/Sao_Paulo')::date + 10)::text as v")).rows[0]?.v ?? "";
const fornecedor = async (s: Sessao, nome: string) => (await valor<{ id: string }>(s, FORNECEDOR, [ids.organizacao, null, nome, null, null, null, "Fornecedor novo"])).id;
const compra = async (s: Sessao, unidade: string, forn: string) => (await valor<{ id: string }>(s, ENTRADA, [unidade, "compra", forn, "NF 123", CAPAS, chave(), "Compra"])).id;
async function lancar(s: Sessao, extra: Record<string, unknown>) {
  const grupo = await valor<string>(s, LANCAR, [JSON.stringify({ descricao: "Capas do fornecedor", valor: 9_000, forma: "unica", categoria: await categoria("Mercadoria (fornecedor)"), vencimento: await vencimento(), ...extra }), chave()]);
  return (await db.query<{ id: string }>("select id from public.contas_a_pagar where grupo_id = $1 and parcela = 1", [grupo])).rows[0]?.id ?? "";
}
type DoGrupo = { parcela: number; entrada_id: string | null; fornecedor_id: string | null };
const doGrupo = async (conta: string) => (await db.query<DoGrupo>(
  "select c.parcela, c.entrada_id, c.fornecedor_id from public.contas_a_pagar c where c.grupo_id = (select grupo_id from public.contas_a_pagar where id = $1) order by c.parcela", [conta])).rows;

describe("conta a pagar ligada à entrada de mercadoria (FIN-004a)", () => {
  it("o lançamento inteiro liga à compra, com o fornecedor dela e o motivo na auditoria; de novo não muda nada; desligar guarda o fornecedor", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const forn = await fornecedor(dono, "Distribuidora Fictícia");
    const entrada = await compra(dono, ids.lojaA, forn);
    const conta = await lancar(dono, { unidade: ids.lojaA, forma: "parcelada", vezes: 3 });
    expect(await valor<number>(dono, LIGAR, [conta, entrada, "Compra das capas"])).toBe(3);
    expect(await doGrupo(conta)).toEqual([1, 2, 3].map((parcela) => ({ parcela, entrada_id: entrada, fornecedor_id: forn })));
    const auditado = await db.query<{ motivo: string; depois: { entrada_id: string } }>(
      "select motivo, depois from public.auditoria where alvo_tipo = 'contas_a_pagar' and alvo_id = $1 order by id desc limit 1", [conta]);
    expect(auditado.rows[0]).toMatchObject({ motivo: "Conta a pagar ligada à entrada: Compra das capas", depois: { entrada_id: entrada } });
    // a mesma ligação de novo: nada muda
    expect(await valor<number>(dono, LIGAR, [conta, entrada, "De novo"])).toBe(0);
    // desligar (entrada nula): as três parcelas, e o fornecedor fica
    expect(await valor<number>(dono, LIGAR, [conta, null, "Ligada errado"])).toBe(3);
    expect(await doGrupo(conta)).toEqual([1, 2, 3].map((parcela) => ({ parcela, entrada_id: null, fornecedor_id: forn })));
  });

  it("só a compra registrada, da mesma loja e do mesmo fornecedor; a conta da rede liga a compra de qualquer loja", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const forn = await fornecedor(dono, "Distribuidora Fictícia");
    const outro = await fornecedor(dono, "Outra Distribuidora");
    const daLojaA = await compra(dono, ids.lojaA, forn);
    const daLojaB = await compra(dono, ids.lojaB, forn);
    const carga = (await valor<{ id: string }>(dono, ENTRADA, [ids.lojaA, "carga_inicial", null, null, CAPAS, chave(), "Contagem"])).id;
    const estornada = await compra(dono, ids.lojaA, forn);
    await valor(dono, ESTORNO, [estornada, "Lançada em dobro"]);

    const daLoja = await lancar(dono, { unidade: ids.lojaA });
    expect(await recusa(dono, LIGAR, [daLoja, carga, "Tentativa"])).toBe("22023: Só a entrada de compra de fornecedor tem conta a pagar");
    expect(await recusa(dono, LIGAR, [daLoja, estornada, "Tentativa"])).toBe("22023: A entrada foi estornada: não recebe conta a pagar");
    expect(await recusa(dono, LIGAR, [daLoja, daLojaB, "Tentativa"])).toBe("22023: A entrada é de outra loja");
    const deOutroFornecedor = await lancar(dono, { unidade: ids.lojaA, fornecedor: outro });
    expect(await recusa(dono, LIGAR, [deOutroFornecedor, daLojaA, "Tentativa"])).toBe("22023: A entrada é de outro fornecedor");
    expect(await recusa(dono, LIGAR, [daLoja, "00000000-0000-4000-8000-00000000dead", "Tentativa"])).toBe("P0002: Entrada de mercadoria não encontrada");
    expect(await recusa(dono, LIGAR, [daLoja, daLojaA, "x"])).toMatch(/^22023/);
    // nada mudou nas recusas
    expect((await doGrupo(daLoja))[0]?.entrada_id).toBeNull();

    const daRede = await lancar(dono, { unidade: null });
    expect(await valor<number>(dono, LIGAR, [daRede, daLojaB, "Compra central entregue na loja B"])).toBe(1);
  });

  it("quem não gere a conta não liga: o vendedor, o gerente de outra loja e outra rede recebem 'não encontrada'", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const forn = await fornecedor(dono, "Distribuidora Fictícia");
    const daLojaA = await compra(dono, ids.lojaA, forn);
    const conta = await lancar(dono, { unidade: ids.lojaA });
    for (const [usuario, loja] of [[ids.vendedorA, ids.lojaA], [ids.gerenteB, ids.lojaB], [ids.donoOutraOrg, ids.lojaOutraOrg]] as const) {
      expect(await recusa(await naLoja(usuario, loja), LIGAR, [conta, daLojaA, "Tentativa"]), usuario).toBe("P0002: Conta a pagar não encontrada para você");
    }
    // o gerente da loja B liga a conta da loja dele à compra da loja dele
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const daLojaB = await compra(gerente, ids.lojaB, forn);
    const contaB = await lancar(gerente, { unidade: ids.lojaB });
    expect(await valor<number>(gerente, LIGAR, [contaB, daLojaB, "Compra da loja"])).toBe(1);
    expect(await recusa(gerente, LIGAR, [contaB, daLojaA, "Tentativa"])).toBe("22023: A entrada é de outra loja");
    // a chave estrangeira não deixa ligar entrada de outra rede, nem por fora da função
    await db.exec("savepoint fk");
    await expect(db.query("insert into public.entradas_estoque (organizacao_id, unidade_id, tipo, chave, conteudo, total_unidades, criado_por) values ($1, $2, 'carga_inicial', 'fin004a-fk-0001', '[]', 1, $3) returning id",
      [ids.outraOrganizacao, ids.lojaOutraOrg, ids.donoOutraOrg]).then(async (r) =>
      db.query("update public.contas_a_pagar set entrada_id = $1 where id = $2", [(r.rows[0] as { id: string }).id, contaB]))).rejects.toThrow(/contas_a_pagar_entrada_fkey/);
    await db.exec("rollback to savepoint fk");
  });

  it("visitante não executa", async () => {
    const r = await comoUsuario(db, null, async () => {
      await db.exec("savepoint passo");
      try {
        await db.query(LIGAR, ["00000000-0000-4000-8000-000000000001", null, "Tentativa"]);
        return null;
      } catch (e) {
        await db.exec("rollback to savepoint passo");
        return (e as { code?: string }).code;
      }
    });
    expect(r).toBe("42501");
  });
});
