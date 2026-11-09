// Adendo do ADR-004 (09/11): devolução parcial e troca com vale (ORA-POS-010 e ORA-POS-012).
// Banco em memória com todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
let cnpjA = "";
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  cnpjA = (await db.query<{ cnpj: string }>("select cnpj from public.unidades where id = $1", [ids.lojaA])).rows[0]?.cnpj ?? "";
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = (prefixo: string) => `${prefixo}:${++chaves}`;
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
  const s = { usuario, sessao: `49000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

const abrirCaixa = (s: Sessao, fundo = 10_000) => valor<string>(s, "select public.abrir_caixa($1, $2) as v", [fundo, chave("caixa")]);
const novaVenda = (s: Sessao) => valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
const adicionar = (s: Sessao, venda: string, variante: string, item: string | null, quantidade = 1) =>
  valor<string>(s, "select public.adicionar_item($1, $2, $3, $4, $5) as v", [venda, variante, item, quantidade, chave("item")]);
const CONCLUIR = "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v";
const concluir = (s: Sessao, venda: string, pagamentos: object[], cliente: object = {}) =>
  valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v", [venda, JSON.stringify(pagamentos), JSON.stringify(cliente), chave("concluir")]);
const DEVOLVER = "select public.devolver_itens($1, $2::jsonb, $3::jsonb, $4, $5) as v";
type Devolucao = { devolucao: string; numero: number; valor: number; vale: number | null; repetida: boolean };
const devolver = (s: Sessao, venda: string, itensDevolvidos: object[], reembolsos: object[], k = chave("dev"), motivo = "Cliente desistiu") =>
  valor<Devolucao>(s, DEVOLVER, [venda, JSON.stringify(itensDevolvidos), JSON.stringify(reembolsos), motivo, k]);
const errouDevolver = (s: Sessao, venda: string, itensDevolvidos: object[], reembolsos: object[], k = chave("dev")) =>
  errou(s, DEVOLVER, [venda, JSON.stringify(itensDevolvidos), JSON.stringify(reembolsos), "Cliente desistiu", k]);
const dinheiroNoCaixa = async (caixa: string) =>
  Number((await db.query<{ v: string }>("select coalesce(sum(valor_centavos), 0) as v from public.caixa_movimentos where caixa_id = $1 and meio = 'dinheiro'", [caixa])).rows[0]?.v);
const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ quantidade: number }>("select quantidade from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0]?.quantidade;
const divergencias = async () => (await db.query("select regra from privado.divergencias_estoque()")).rows;
const saldoDoVale = async (numero: number) =>
  Number((await db.query<{ v: string }>("select saldo_centavos as v from public.vales_troca where numero = $1", [numero])).rows[0]?.v);
function chaveDeAcesso(cnpj: string, numero: number) {
  const base = `432611${cnpj}55001${String(numero).padStart(9, "0")}112345678`;
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return base + String(resto < 2 ? 0 : 11 - resto);
}

describe("devolução parcial (ORA-POS-010)", () => {
  it("acessório em partes: volta ao estoque, o dinheiro sai do caixa da gerência e o desconto se reparte sem sobra de centavo", async () => {
    await db.query("update public.categorias set desconto_teto_pb = 1000, margem_minima_pb = 3000 where id = $1", [cat.acessorios]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    const capa = await adicionar(ana, venda, cat.capa, null, 3);
    expect(await valor<string>(ana, "select public.aplicar_desconto($1, 100) as v", [capa])).toBe("dentro_do_limite");
    await concluir(ana, venda, [{ meio: "dinheiro", valor: 23_600 }]);
    const antes = await saldo(ids.lojaA, cat.capa);

    const dono = await naLoja(ids.dono, ids.lojaA);
    const caixaDono = await abrirCaixa(dono, 50_000);
    expect(await errouDevolver(dono, venda, [{ item: capa, quantidade: 1 }], [{ meio: "dinheiro", valor: 7_900 }])).toBe("OR009");
    expect(await devolver(dono, venda, [{ item: capa, quantidade: 1 }], [{ meio: "dinheiro", valor: 7_867 }])).toMatchObject({ valor: 7_867, vale: null });
    expect(await errouDevolver(dono, venda, [{ item: capa, quantidade: 3 }], [{ meio: "dinheiro", valor: 23_600 }])).toBe("22023");
    expect(await devolver(dono, venda, [{ item: capa, quantidade: 2 }], [{ meio: "dinheiro", valor: 15_733 }])).toMatchObject({ valor: 15_733 });
    expect(await errouDevolver(dono, venda, [{ item: capa, quantidade: 1 }], [{ meio: "dinheiro", valor: 1 }])).toBe("22023");

    expect(await saldo(ids.lojaA, cat.capa)).toBe((antes ?? 0) + 3);
    expect(await dinheiroNoCaixa(caixaDono)).toBe(50_000 - 23_600);
    expect((await db.query("select devolvido_centavos, situacao from public.vendas where id = $1", [venda])).rows).toEqual([{ devolvido_centavos: 23_600, situacao: "concluida" }]);
    expect(await errou(dono, "select public.cancelar_venda($1, 'Arrependimento')", [venda])).toBe("OR017");
    expect(await divergencias()).toEqual([]);
  });

  it("aparelho volta com a condição informada; reembolso só nos meios pagos e até o que cada um pagou", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    const aparelho = await adicionar(ana, venda, cat.aparelho, itens.a1);
    await concluir(ana, venda, [{ meio: "cartao_picpay", valor: 100_000, comprovante: "123456" }, { meio: "dinheiro", valor: 49_900 }]);

    const dono = await naLoja(ids.dono, ids.lojaA);
    const caixaDono = await abrirCaixa(dono, 60_000);
    const item = [{ item: aparelho, condicao: "seminovo" }];
    expect(await errouDevolver(dono, venda, item, [{ meio: "cartao_picpay", valor: 120_000 }, { meio: "dinheiro", valor: 29_900 }])).toBe("OR009");
    expect(await errouDevolver(dono, venda, item, [{ meio: "pix_direto", valor: 149_900 }])).toBe("OR009");
    expect(await errouDevolver(dono, venda, [{ item: aparelho, condicao: "usado" }], [{ meio: "dinheiro", valor: 49_900 }, { meio: "cartao_picpay", valor: 100_000 }])).toBe("22023");
    await devolver(dono, venda, item, [{ meio: "cartao_picpay", valor: 100_000 }, { meio: "dinheiro", valor: 49_900 }]);

    expect((await db.query("select situacao, em_estoque, condicao from public.itens_serializados where id = $1", [itens.a1])).rows)
      .toEqual([{ situacao: "disponivel", em_estoque: true, condicao: "seminovo" }]);
    expect((await db.query("select meio, valor_centavos from public.caixa_movimentos where caixa_id = $1 and tipo = 'estorno' order by meio", [caixaDono])).rows)
      .toEqual([{ meio: "cartao_picpay", valor_centavos: -100_000 }, { meio: "dinheiro", valor_centavos: -49_900 }]);
    expect(await divergencias()).toEqual([]);
  });
});

describe("troca com vale (ORA-POS-012)", () => {
  it("o valor vira vale; o vale paga outra venda até o saldo, com a diferença em dinheiro; cancelar a venda devolve o saldo", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const primeira = await novaVenda(ana);
    const capa = await adicionar(ana, primeira, cat.capa, null, 1);
    await concluir(ana, primeira, [{ meio: "dinheiro", valor: 7_900 }], { nome: "Cliente Fictício" });

    const dono = await naLoja(ids.dono, ids.lojaA);
    const troca = await devolver(dono, primeira, [{ item: capa }], [{ meio: "vale_troca", valor: 7_900 }], chave("dev"), "Troca por aparelho");
    expect(troca.vale).toEqual(expect.any(Number));
    expect(await saldoDoVale(Number(troca.vale))).toBe(7_900);
    expect((await db.query("select cliente_nome from public.vales_troca where numero = $1", [troca.vale])).rows).toEqual([{ cliente_nome: "Cliente Fictício" }]);

    const segunda = await novaVenda(ana);
    await adicionar(ana, segunda, cat.aparelho, itens.a2);
    expect(await errou(ana, CONCLUIR, [segunda, JSON.stringify([{ meio: "vale_troca", valor: 7_900, comprovante: "VT-999999" }, { meio: "dinheiro", valor: 142_000 }]), chave("c")])).toBe("OR018");
    expect(await errou(ana, CONCLUIR, [segunda, JSON.stringify([{ meio: "vale_troca", valor: 8_000, comprovante: `VT-${troca.vale}` }, { meio: "dinheiro", valor: 141_900 }]), chave("c")])).toBe("OR018");
    expect(await errou(ana, CONCLUIR, [segunda, JSON.stringify([{ meio: "payjoy", valor: 149_900, entrada: 7_900, meio_entrada: "vale_troca" }]), chave("c")])).not.toBeNull();
    await concluir(ana, segunda, [{ meio: "vale_troca", valor: 7_900, comprovante: `VT-${troca.vale}` }, { meio: "dinheiro", valor: 142_000 }]);
    expect(await saldoDoVale(Number(troca.vale))).toBe(0);

    const terceira = await novaVenda(ana);
    await adicionar(ana, terceira, cat.capa, null, 1);
    expect(await errou(ana, CONCLUIR, [terceira, JSON.stringify([{ meio: "vale_troca", valor: 7_900, comprovante: `VT-${troca.vale}` }]), chave("c")])).toBe("OR018");

    await abrirCaixa(dono, 200_000);
    expect(await valor<boolean>(dono, "select public.cancelar_venda($1, 'Cliente desistiu da troca') as v", [segunda])).toBe(true);
    expect(await saldoDoVale(Number(troca.vale))).toBe(7_900);
    expect(await divergencias()).toEqual([]);
  });
});

describe("proteções", () => {
  it("só a gerência da loja devolve; financiada não; a mesma chave devolve o mesmo e outro conteúdo é OR004", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    const capa = await adicionar(ana, venda, cat.capa, null, 2);
    await concluir(ana, venda, [{ meio: "dinheiro", valor: 15_800 }]);
    expect(await errouDevolver(ana, venda, [{ item: capa }], [{ meio: "dinheiro", valor: 7_900 }])).toBe("P0002");
    expect(await errouDevolver(await naLoja(ids.gerenteB, ids.lojaB), venda, [{ item: capa }], [{ meio: "dinheiro", valor: 7_900 }])).toBe("P0002");

    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono, 50_000);
    const k = chave("dev");
    const r = await devolver(dono, venda, [{ item: capa }], [{ meio: "dinheiro", valor: 7_900 }], k);
    expect(await devolver(dono, venda, [{ item: capa }], [{ meio: "dinheiro", valor: 7_900 }], k)).toEqual({ ...r, repetida: true });
    expect(await errouDevolver(dono, venda, [{ item: capa, quantidade: 1 }], [{ meio: "vale_troca", valor: 7_900 }], k)).toBe("OR004");
    expect(await errouDevolver(dono, venda, [{ item: capa }, { item: capa }], [{ meio: "dinheiro", valor: 15_800 }])).toBe("22023");

    const financiada = await novaVenda(ana);
    const aparelho = await adicionar(ana, financiada, cat.aparelho, itens.a1);
    await concluir(ana, financiada, [{ meio: "payjoy", valor: 149_900, entrada: 20_000 }], { email: "cliente@exemplo.com" });
    expect(await errouDevolver(dono, financiada, [{ item: aparelho }], [{ meio: "dinheiro", valor: 20_000 }])).toBe("OR016");
    expect(await errou(dono, "select * from public.venda_devolucoes")).toBeNull();
    expect(await errou(dono, "update public.venda_devolucoes set motivo = 'outro'")).toBe("42501");
  });

  it("nota emitida abre pedido de nota de devolução; nota ainda não emitida recebe o aviso", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono, 50_000);

    const emitida = await novaVenda(ana);
    const capa1 = await adicionar(ana, emitida, cat.capa, null, 1);
    await concluir(ana, emitida, [{ meio: "dinheiro", valor: 7_900 }]);
    const pedido1 = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [emitida, chave("nota")]);
    await valor(dono, "select public.notas_registrar_emissao($1, $2, null) as v", [pedido1, chaveDeAcesso(cnpjA, 10)]);
    const r1 = await devolver(dono, emitida, [{ item: capa1 }], [{ meio: "dinheiro", valor: 7_900 }]);
    const [devolucaoFiscal] = (await db.query<{ id: string; situacao: string; tipo: string }>(
      "select id, situacao, tipo from public.notas_pedidos where devolucao_id = $1", [r1.devolucao])).rows;
    expect(devolucaoFiscal).toMatchObject({ situacao: "aguardando_aprovacao", tipo: "devolucao" });
    expect(await valor<string>(dono, "select public.notas_registrar_emissao($1, $2, 'Nota de devolução') as v", [devolucaoFiscal?.id, chaveDeAcesso(cnpjA, 11)])).toBe("emitida");

    const pendente = await novaVenda(ana);
    const capa2 = await adicionar(ana, pendente, cat.capa, null, 2);
    await concluir(ana, pendente, [{ meio: "dinheiro", valor: 15_800 }]);
    const pedido2 = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [pendente, chave("nota")]);
    await devolver(dono, pendente, [{ item: capa2, quantidade: 1 }], [{ meio: "dinheiro", valor: 7_900 }]);
    const [aviso] = (await db.query<{ observacao: string }>("select observacao from public.notas_pedidos where id = $1", [pedido2])).rows;
    expect(aviso?.observacao).toContain("antes da emissão");
    expect((await db.query<{ tipo: string }>("select tipo from public.notas_eventos where pedido_id = $1 order by id", [pedido2])).rows.map((e) => e.tipo))
      .toEqual(["pedida", "ajustada_por_devolucao"]);
  });

  it("serviço com operação Ora Connect viva não é devolvido", async () => {
    const admin = await naLoja(ids.administrador, ids.lojaA);
    await valor(admin, "select public.connect_habilitar('recarga', true, 'Homologado com linha de teste (fictício)') as v");
    await db.query("select public.connect_worker_atualizar_referencias($1, 'plano', '[{\"codigo\":\"99999\",\"nome\":\"7 GB\",\"valor_centavos\":4490}]'::jsonb)", [ids.organizacao]);
    await db.query("insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem) values ($1, $2, null, 4990, now() - interval '1 day', 'manual')", [ids.organizacao, cat.recarga]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    const recarga = await adicionar(ana, venda, cat.recarga, null, 1);
    await concluir(ana, venda, [{ meio: "dinheiro", valor: 4_990 }]);
    await valor(ana, "select public.connect_registrar('recarga', $1::jsonb, $2) as v",
      [JSON.stringify({ linha: "51988887777", plano: 99999, metodo: "SALDO", venda_item: recarga }), chave("op")]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono, 50_000);
    expect(await errouDevolver(dono, venda, [{ item: recarga }], [{ meio: "dinheiro", valor: 4_990 }])).toBe("OR013");
  });
});
