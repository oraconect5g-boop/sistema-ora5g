// Lote L10c (14/11/2026, ORA-FISC-009 e ORA-FISC-006 em parte; migration 20261114233000_cancelamento_da_nota): o
// cancelamento da nota feito no portal do fisco, registrado com o protocolo e a justificativa (depois dele a venda pode
// ser cancelada ou pedir outra nota), e a correção da chave registrada errada. Dados FICTÍCIOS; nada é emitido.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
const cnpj: Record<string, string> = {};
let aamm = "";
let anterior = "";
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  for (const u of (await db.query<{ id: string; cnpj: string }>("select id, cnpj from public.unidades where id in ($1, $2)", [ids.lojaA, ids.lojaB])).rows) {
    cnpj[u.id] = u.cnpj;
  }
  const meses = (await db.query<{ aamm: string; anterior: string }>(`
    select to_char(now() at time zone 'America/Sao_Paulo', 'YYMM') as aamm,
           to_char((now() at time zone 'America/Sao_Paulo') - interval '1 month', 'YYMM') as anterior`)).rows[0];
  aamm = meses?.aamm ?? "";
  anterior = meses?.anterior ?? "";
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
  const s = { usuario, sessao: `4a000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

// Chave de acesso fictícia (cUF 43, AAMM, CNPJ, modelo, série 1, número, emissão normal, código), dígito calculado aqui.
function chaveDeAcesso(cnpjDaLoja: string, numero: number, mes = aamm, modelo = "65", codigo = "12345678") {
  const base = `43${mes}${cnpjDaLoja}${modelo}001${String(numero).padStart(9, "0")}1${codigo}`;
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return base + String(resto < 2 ? 0 : 11 - resto);
}

// Uma capa (R$ 79,00) vendida e paga em dinheiro, com a nota pedida por quem vendeu e registrada pelo dono.
async function vendaComNota(ana: Sessao, dono: Sessao, numero: number) {
  const aberto = await db.query("select 1 from public.caixas where operador_id = $1 and situacao = 'aberto'", [ana.usuario]);
  if (aberto.rows.length === 0) await valor(ana, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
  const item = await valor<string>(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(ana, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [venda, chave("concluir")]);
  const pedido = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [venda, chave("nota")]);
  const chaveDaNota = chaveDeAcesso(cnpj[ids.lojaA] as string, numero);
  await valor(dono, "select public.notas_registrar_emissao($1, $2, null) as v", [pedido, chaveDaNota]);
  return { venda, item, pedido, chaveDaNota };
}
const CANCELAR_NO_FISCO = "select public.notas_registrar_cancelamento($1, $2, $3) as v";
const CORRIGIR = "select public.notas_corrigir_chave($1, $2, $3) as v";
const PROTOCOLO = "141260000654321";
const JUSTIFICATIVA = "Cliente desistiu da compra antes de sair da loja";
const pedidoNoBanco = async (id: string) => (await db.query<Record<string, unknown>>(
  `select situacao, chave_acesso, modelo, serie, numero_documento, protocolo, motivo_cancelamento, cancelada_no_fisco_por,
          protocolo_cancelamento, cancelada_no_fisco_em is not null as no_fisco
   from public.notas_pedidos where id = $1`, [id])).rows[0];
const eventos = async (id: string) => (await db.query<{ tipo: string; observacao: string | null }>(
  "select tipo, observacao from public.notas_eventos where pedido_id = $1 order by id", [id])).rows;

describe("cancelamento da nota no fisco, registrado (L10c)", () => {
  it("quem aprova registra com o protocolo e a justificativa; uma vez; a chave fica gravada; depois a venda pede outra nota", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const nota = await vendaComNota(ana, dono, 901);
    expect(await errou(ana, CANCELAR_NO_FISCO, [nota.pedido, PROTOCOLO, JUSTIFICATIVA])).toBe("P0002");
    expect(await errou(await naLoja(ids.gerenteB, ids.lojaB), CANCELAR_NO_FISCO, [nota.pedido, PROTOCOLO, JUSTIFICATIVA])).toBe("P0002");
    expect(await errou(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), CANCELAR_NO_FISCO, [nota.pedido, PROTOCOLO, JUSTIFICATIVA])).toBe("P0002");
    expect(await errou(dono, CANCELAR_NO_FISCO, [nota.pedido, "14126000065432", JUSTIFICATIVA])).toBe("22023");
    expect(await errou(dono, CANCELAR_NO_FISCO, [nota.pedido, PROTOCOLO, "Desistiu"])).toBe("22023");
    expect(await errou(dono, CANCELAR_NO_FISCO, [nota.pedido, PROTOCOLO, "x".repeat(256)])).toBe("22023");
    expect(await valor<boolean>(dono, CANCELAR_NO_FISCO, [nota.pedido, "141.260.000.654.321", `  ${JUSTIFICATIVA}  `])).toBe(true);
    expect(await valor<boolean>(dono, CANCELAR_NO_FISCO, [nota.pedido, PROTOCOLO, JUSTIFICATIVA])).toBe(false);
    expect(await errou(dono, CANCELAR_NO_FISCO, [nota.pedido, "141260000999999", JUSTIFICATIVA])).toBe("22023");
    expect(await pedidoNoBanco(nota.pedido)).toMatchObject({
      situacao: "cancelada", chave_acesso: nota.chaveDaNota, protocolo_cancelamento: PROTOCOLO, cancelada_no_fisco_por: ids.dono, no_fisco: true,
      motivo_cancelamento: `Cancelada no fisco: ${JUSTIFICATIVA}`,
    });
    expect((await eventos(nota.pedido)).at(-1)).toEqual({ tipo: "cancelada_no_fisco", observacao: `Protocolo ${PROTOCOLO}: ${JUSTIFICATIVA}` });
    // A chave cancelada não serve para outro pedido; a venda pede outra nota, que é registrada com outra chave.
    const outro = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [nota.venda, chave("nota")]);
    expect(await errou(dono, "select public.notas_registrar_emissao($1, $2, null)", [outro, nota.chaveDaNota])).toBe("22023");
    await valor(dono, "select public.notas_registrar_emissao($1, $2, null) as v", [outro, chaveDeAcesso(cnpj[ids.lojaA] as string, 902)]);
    expect(await pedidoNoBanco(outro)).toMatchObject({ situacao: "emitida", numero_documento: 902 });
    // Só a nota emitida tem cancelamento no fisco: o pedido ainda na fila é recusado (o caminho dele é "cancelar pedido").
    const naFila = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [naFila, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [naFila, chave("concluir")]);
    const pendente = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [naFila, chave("nota")]);
    expect(await errou(dono, CANCELAR_NO_FISCO, [pendente, PROTOCOLO, JUSTIFICATIVA])).toBe("22023");
    // A marca do fisco só existe com a nota cancelada e a chave gravada (nem o dono do banco grava diferente).
    expect(await erroDe(() => db.query("update public.notas_pedidos set cancelada_no_fisco_em = now(), cancelada_no_fisco_por = $2, protocolo_cancelamento = $3 where id = $1",
      [outro, ids.dono, PROTOCOLO]))).toBe("23514");
  });

  it("a venda com nota emitida só é cancelada depois do registro do cancelamento no fisco", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const nota = await vendaComNota(ana, dono, 911);
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    const CANCELAR_VENDA = "select public.cancelar_venda($1, 'Cliente desistiu') as v";
    expect(await errou(dono, CANCELAR_VENDA, [nota.venda])).toBe("OR015");
    await valor(dono, CANCELAR_NO_FISCO, [nota.pedido, PROTOCOLO, JUSTIFICATIVA]);
    expect(await valor<boolean>(dono, CANCELAR_VENDA, [nota.venda])).toBe(true);
    expect((await db.query("select situacao from public.vendas where id = $1", [nota.venda])).rows[0]).toEqual({ situacao: "cancelada" });
    // O pedido cancelado no fisco continua com a marca (a venda cancelada não mexe nele).
    expect(await pedidoNoBanco(nota.pedido)).toMatchObject({ situacao: "cancelada", no_fisco: true });
  });

  it("nota de venda com nota de devolução não se cancela aqui; a própria nota de devolução, emitida, sim", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const nota = await vendaComNota(ana, dono, 921);
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    await valor(dono, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, 'Defeito de fábrica', $4) as v",
      [nota.venda, JSON.stringify([{ item: nota.item, quantidade: 1, condicao: "avariado" }]), JSON.stringify([{ meio: "dinheiro", valor: 7900 }]), chave("dev")]);
    expect(await errou(dono, CANCELAR_NO_FISCO, [nota.pedido, PROTOCOLO, JUSTIFICATIVA])).toBe("22023");
    const daDevolucao = (await db.query<{ id: string }>("select id from public.notas_pedidos where venda_id = $1 and tipo = 'devolucao'", [nota.venda])).rows[0]?.id as string;
    expect(await errou(dono, CANCELAR_NO_FISCO, [daDevolucao, PROTOCOLO, JUSTIFICATIVA])).toBe("22023");
    await valor(dono, "select public.notas_registrar_emissao($1, $2, null) as v", [daDevolucao, chaveDeAcesso(cnpj[ids.lojaA] as string, 77, aamm, "55")]);
    expect(await valor<boolean>(dono, CANCELAR_NO_FISCO, [daDevolucao, PROTOCOLO, "Nota de devolução emitida com o item errado"])).toBe(true);
    expect(await pedidoNoBanco(daDevolucao)).toMatchObject({ situacao: "cancelada", no_fisco: true });
  });
});

describe("correção da chave registrada errada (L10c)", () => {
  it("quem aprova troca pela certa com o motivo; a anterior fica no histórico; o protocolo volta a vazio; a conciliação deixa de acusar", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    // A chave registrada é de um mês antes da venda (divergência da conciliação, L10b).
    const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [venda, chave("concluir")]);
    const pedido = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [venda, chave("nota")]);
    const errada = chaveDeAcesso(cnpj[ids.lojaA] as string, 931, anterior);
    await valor(dono, "select public.notas_registrar_emissao($1, $2, null) as v", [pedido, errada]);
    // O PDF com o protocolo da chave errada.
    const pdf = `${ids.organizacao}/${ids.lojaA}/${pedido}/00000000-0000-4000-a000-000000000931.pdf`;
    await comoUsuario(db, dono, () => db.query("insert into storage.objects (bucket_id, name, metadata) values ('notas', $1, $2)", [pdf, JSON.stringify({ size: 20_000, mimetype: "application/pdf" })]));
    await valor(dono, "select public.notas_anexar_documento($1, 'pdf', $2, $3, $4) as v", [pedido, pdf, "d".repeat(64), "141260000111111"]);
    const CONCILIAR = "select (public.notas_conciliacao((now() at time zone 'America/Sao_Paulo')::date - 1, (now() at time zone 'America/Sao_Paulo')::date, $1) -> 'resumo' ->> 'divergencias')::int as v";
    expect(await valor<number>(dono, CONCILIAR, [ids.lojaA])).toBe(1);

    const certa = chaveDeAcesso(cnpj[ids.lojaA] as string, 932);
    expect(await errou(ana, CORRIGIR, [pedido, certa, "Digitada errada na hora"])).toBe("P0002");
    expect(await errou(await naLoja(ids.gerenteB, ids.lojaB), CORRIGIR, [pedido, certa, "Digitada errada na hora"])).toBe("P0002");
    expect(await errou(dono, CORRIGIR, [pedido, certa, "Errada"])).toBe("22023");
    expect(await errou(dono, CORRIGIR, [pedido, `${certa.slice(0, 43)}${(Number(certa[43]) + 1) % 10}`, "Digitada errada na hora"])).toBe("22023");
    expect(await errou(dono, CORRIGIR, [pedido, chaveDeAcesso(cnpj[ids.lojaB] as string, 932), "Digitada errada na hora"])).toBe("22023");
    expect(await valor<boolean>(dono, CORRIGIR, [pedido, errada, "Digitada errada na hora"])).toBe(false);
    // Chave já registrada em outro pedido é recusada.
    const outra = await vendaComNota(ana, dono, 933);
    expect(await errou(dono, CORRIGIR, [pedido, outra.chaveDaNota, "Digitada errada na hora"])).toBe("22023");

    expect(await valor<boolean>(dono, CORRIGIR, [pedido, certa, "  Digitada errada na hora  "])).toBe(true);
    expect(await pedidoNoBanco(pedido)).toMatchObject({ situacao: "emitida", chave_acesso: certa, modelo: "65", serie: 1, numero_documento: 932, protocolo: null });
    expect((await eventos(pedido)).at(-1)).toEqual({ tipo: "chave_corrigida", observacao: `Chave anterior ${errada}: Digitada errada na hora` });
    expect(await valor<number>(dono, CONCILIAR, [ids.lojaA])).toBe(0);
  });

  it("com o XML guardado a chave não se corrige; nota fora da emissão também não", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const nota = await vendaComNota(ana, dono, 941);
    const xml = `${ids.organizacao}/${ids.lojaA}/${nota.pedido}/00000000-0000-4000-a000-000000000941.xml`;
    await comoUsuario(db, dono, () => db.query("insert into storage.objects (bucket_id, name, metadata) values ('notas', $1, $2)", [xml, JSON.stringify({ size: 20_000, mimetype: "application/xml" })]));
    await valor(dono, "select public.notas_anexar_documento($1, 'xml', $2, $3, null) as v", [nota.pedido, xml, "e".repeat(64)]);
    expect(await errou(dono, CORRIGIR, [nota.pedido, chaveDeAcesso(cnpj[ids.lojaA] as string, 942), "A chave do XML é a errada"])).toBe("22023");
    await valor(dono, CANCELAR_NO_FISCO, [nota.pedido, PROTOCOLO, JUSTIFICATIVA]);
    expect(await errou(dono, CORRIGIR, [nota.pedido, chaveDeAcesso(cnpj[ids.lojaA] as string, 943), "Depois do cancelamento"])).toBe("22023");
  });
});
