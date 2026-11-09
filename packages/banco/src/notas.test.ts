// ADR-006: fila fiscal interna. Pedido a partir da venda concluída, aprovação do dono/gerente que
// nunca impede a emissão, registro da nota emitida no portal pela chave de acesso (dígito e CNPJ
// conferidos), cancelamento ligado à venda. Dados FICTÍCIOS; nada é emitido.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
let cnpjA = "";
let cnpjB = "";
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  const cnpjs = (await db.query<{ id: string; cnpj: string }>("select id, cnpj from public.unidades where id in ($1, $2)", [ids.lojaA, ids.lojaB])).rows;
  cnpjA = cnpjs.find((u) => u.id === ids.lojaA)?.cnpj ?? "";
  cnpjB = cnpjs.find((u) => u.id === ids.lojaB)?.cnpj ?? "";
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
  const s = { usuario, sessao: `48000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

// Chave de acesso fictícia no padrão nacional, com o dígito calculado aqui (oráculo independente do banco).
function chaveDeAcesso(cnpj: string, numero: number, modelo = "65") {
  const base = `432611${cnpj}${modelo}001${String(numero).padStart(9, "0")}112345678`;
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return base + String(resto < 2 ? 0 : 11 - resto);
}

async function vendaConcluida(s: Sessao) {
  const aberto = await db.query("select 1 from public.caixas where operador_id = $1 and situacao = 'aberto'", [s.usuario]);
  if (aberto.rows.length === 0) await valor(s, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [venda, chave("concluir")]);
  return venda;
}
const SOLICITAR = "select public.notas_solicitar($1, $2::jsonb, $3) as v";
const pedido = async (id: string) => (await db.query<Record<string, unknown>>(
  "select situacao, destinatario_mascarado, aprovado_por, emitida_por, modelo, serie, numero_documento, chave_acesso from public.notas_pedidos where id = $1", [id])).rows[0];
const eventos = async (id: string) => (await db.query<{ tipo: string }>("select tipo from public.notas_eventos where pedido_id = $1 order by id", [id])).rows.map((e) => e.tipo);
const documentoGuardado = async (id: string) => (await db.query("select 1 from privado.notas_destinatarios where pedido_id = $1", [id])).rows.length;

describe("pedido de nota a partir da venda", () => {
  it("só venda concluída; CPF na nota mascarado; mesma chave devolve o mesmo pedido; um pedido vivo por venda", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const rascunho = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    expect(await errou(ana, SOLICITAR, [rascunho, "{}", chave("nota")])).toBe("22023");

    const venda = await vendaConcluida(await naLoja(ids.vendedorA, ids.lojaA));
    expect(await errou(ana, SOLICITAR, [venda, JSON.stringify({ documento: "123.456.789-00" }), chave("nota")])).toBe("22023");
    const k = chave("nota");
    const id = await valor<string>(ana, SOLICITAR, [venda, JSON.stringify({ nome: "Cliente Fictício", documento: "123.456.789-09" }), k]);
    expect(await valor<string>(ana, SOLICITAR, [venda, "{}", k])).toBe(id);
    expect(await errou(ana, SOLICITAR, [venda, "{}", chave("nota")])).toBe("OR014");
    expect(await pedido(id)).toMatchObject({ situacao: "aguardando_aprovacao", destinatario_mascarado: "•••.•••.789-09" });
    expect(await documentoGuardado(id)).toBe(1);
    expect(await errou(ana, "select * from privado.notas_destinatarios")).toBe("42501");
  });

  it("outra loja, outra rede e técnico não pedem; o colega vendedor não pede pela venda alheia", async () => {
    const venda = await vendaConcluida(await naLoja(ids.vendedorA, ids.lojaA));
    expect(await errou(await naLoja(ids.gerenteB, ids.lojaB), SOLICITAR, [venda, "{}", chave("nota")])).toBe("P0002");
    expect(await errou(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), SOLICITAR, [venda, "{}", chave("nota")])).toBe("P0002");
    expect(await errou(await naLoja(ids.tecnico, ids.assistencia), SOLICITAR, [venda, "{}", chave("nota")])).toBe("P0002");
    expect(await errou(await naLoja(ids.vendedorAB, ids.lojaA), SOLICITAR, [venda, "{}", chave("nota")])).toBe("P0002");
    expect(await valor<string>(await naLoja(ids.dono, ids.lojaA), SOLICITAR, [venda, "{}", chave("nota")])).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("aprovação e registro da emissão", () => {
  it("dono aprova; correção volta ao pedido; vendedor não aprova; registro confere dígito e CNPJ e apaga o documento", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const venda = await vendaConcluida(ana);
    const id = await valor<string>(ana, SOLICITAR, [venda, JSON.stringify({ documento: "12345678909" }), chave("nota")]);
    expect(await errou(ana, "select public.notas_decidir($1, true, null)", [id])).toBe("P0002");
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await errou(dono, "select public.notas_decidir($1, false, null)", [id])).toBe("22023");
    expect(await valor<string>(dono, "select public.notas_decidir($1, false, 'CPF do cliente errado') as v", [id])).toBe("correcao_solicitada");
    expect(await valor<boolean>(ana, "select public.notas_corrigir($1, $2::jsonb) as v", [id, JSON.stringify({ nome: "Cliente Fictício", documento: "11.222.333/0001-81" })])).toBe(true);
    expect(await pedido(id)).toMatchObject({ situacao: "aguardando_aprovacao", destinatario_mascarado: "••.•••.•••/0001-81" });
    expect(await valor<string>(dono, "select public.notas_decidir($1, true, null) as v", [id])).toBe("aprovada");

    const boa = chaveDeAcesso(cnpjA, 123);
    expect(await errou(dono, "select public.notas_registrar_emissao($1, $2, null)", [id, `${boa.slice(0, 43)}${(Number(boa[43]) + 1) % 10}`])).toBe("22023");
    expect(await errou(dono, "select public.notas_registrar_emissao($1, $2, null)", [id, chaveDeAcesso(cnpjB, 123)])).toBe("22023");
    expect(await errou(ana, "select public.notas_registrar_emissao($1, $2, null)", [id, boa])).toBe("P0002");
    expect(await valor<string>(dono, "select public.notas_registrar_emissao($1, $2, 'Emitida no portal') as v", [id, boa.replace(/(\d{4})/g, "$1 ")])).toBe("emitida");
    expect(await pedido(id)).toMatchObject({ situacao: "emitida", modelo: "65", serie: 1, numero_documento: 123, chave_acesso: boa, emitida_por: ids.dono });
    expect(await documentoGuardado(id)).toBe(0);
    expect(await eventos(id)).toEqual(["pedida", "correcao_solicitada", "corrigida", "aprovada", "emitida"]);
    expect(await errou(dono, "select public.notas_cancelar($1, 'Desistência')", [id])).toBe("OR015");
  });

  it("a aprovação não segura a emissão: registrar sem aprovação vale como aprovação, com evento; a mesma chave não serve a dois pedidos", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const v1 = await vendaConcluida(ana);
    const v2 = await vendaConcluida(await naLoja(ids.vendedorA, ids.lojaA));
    const p1 = await valor<string>(ana, SOLICITAR, [v1, "{}", chave("nota")]);
    const p2 = await valor<string>(ana, SOLICITAR, [v2, "{}", chave("nota")]);
    const k = chaveDeAcesso(cnpjA, 500);
    expect(await valor<string>(dono, "select public.notas_registrar_emissao($1, $2, null) as v", [p1, k])).toBe("emitida");
    expect(await pedido(p1)).toMatchObject({ aprovado_por: ids.dono });
    expect(await eventos(p1)).toEqual(["pedida", "emitida_sem_aprovacao_previa", "emitida"]);
    expect(await errou(dono, "select public.notas_registrar_emissao($1, $2, null)", [p2, k])).toBe("22023");
  });
});

describe("ligação com a venda", () => {
  it("venda cancelada cancela o pedido sem nota; com nota emitida, a venda espera o tratamento fiscal", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    const v1 = await vendaConcluida(ana);
    const p1 = await valor<string>(ana, SOLICITAR, [v1, JSON.stringify({ documento: "12345678909" }), chave("nota")]);
    expect(await valor<boolean>(dono, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [v1])).toBe(true);
    expect(await pedido(p1)).toMatchObject({ situacao: "cancelada" });
    expect(await documentoGuardado(p1)).toBe(0);

    const v2 = await vendaConcluida(await naLoja(ids.vendedorA, ids.lojaA));
    const p2 = await valor<string>(ana, SOLICITAR, [v2, "{}", chave("nota")]);
    await valor(dono, "select public.notas_registrar_emissao($1, $2, null) as v", [p2, chaveDeAcesso(cnpjA, 777)]);
    expect(await errou(dono, "select public.cancelar_venda($1, 'Cliente desistiu')", [v2])).toBe("OR015");
  });

  it("prazo de alerta só com a fonte, por quem gere as lojas; leitura pela rede", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await errou(ana, "select public.fiscal_definir_politica(30, 'Orientação do contador por e-mail')")).toBe("42501");
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await errou(dono, "select public.fiscal_definir_politica(30, 'curto')")).toBe("22023");
    expect(await valor<boolean>(dono, "select public.fiscal_definir_politica(30, 'Orientação do contador por e-mail (fictício)') as v")).toBe(true);
    expect(await valor<number>(ana, "select alerta_minutos as v from public.fiscal_politicas")).toBe(30);
    expect((await db.query("select acao from public.auditoria where alvo_tipo = 'fiscal_politicas'")).rows).toEqual([{ acao: "fiscal_politicas.criado" }]);
  });
});
