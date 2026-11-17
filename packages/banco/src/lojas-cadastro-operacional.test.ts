// Lote ORG-a (17/11/2026; plano do proprietário de 16/11, Onda 1, item 2; ORA-ORG-001; migration
// 20261117160216_lojas_cadastro_operacional): a loja física pelo cadastro operacional, sem CNPJ. Ela existe, entra na
// rede e recebe estoque, mas não vende (OR038), por nenhum caminho, nem aparece na vitrine do site até o CNPJ da filial
// chegar. O CNPJ de uma loja que já o tem não se apaga. Dados FICTÍCIOS.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cnpj, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario, RAIZ } from "./cenario";
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
const chave = (prefixo: string) => `${prefixo}:${++chaves}`;
const sessao = (usuario: string): Sessao => ({ usuario, sessao: `66500000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = sessao(usuario);
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
type Falha = { codigo: string; mensagem: string };
async function tentar<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<{ v: T } | Falha> {
  const passo = async () => {
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
  };
  return s ? comoUsuario(db, s, passo) : passo();
}
async function valor<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}

const CRIAR = "select public.loja_criar($1, $2, $3, $4, $5, $6, $7, $8, $9) as v";
const ATUALIZAR = "select public.loja_atualizar($1, $2, $3, $4, $5, $6) as v";
const criarSemCnpj = async (codigo: string, nome: string, tipo = "loja_fisica") =>
  (await valor<{ id: string }>(sessao(ids.dono), CRIAR, [ids.empresa, codigo, nome, tipo, null, null, null, null, "Cadastro operacional, sem o CNPJ"])).id;
const ofertas = async (produto: string) =>
  (await db.query<{ unidade_id: string }>("select distinct unidade_id from privado.ofertas_da_vitrine($1, $2)", [ids.organizacao, produto])).rows.map((r) => r.unidade_id);

describe("a loja física pelo cadastro operacional, sem CNPJ (ORG-a)", () => {
  it("o dono cadastra a loja física e o local DEFEITOS sem CNPJ; os dois aparecem na rede, sem CNPJ", async () => {
    const loja = await criarSemCnpj("loja-santa-felicidade", "Santa Felicidade");
    const defeitos = await criarSemCnpj("defeitos", "DEFEITOS", "excecao");
    const rede = await comoUsuario(db, sessao(ids.dono), async () =>
      (await db.query<{ id: string; tipo: string; cnpj: string | null; status: string }>("select id, tipo, cnpj, status from public.lojas_da_rede()")).rows);
    expect(rede.find((l) => l.id === loja)).toMatchObject({ tipo: "loja_fisica", cnpj: null, status: "ativa" });
    expect(rede.find((l) => l.id === defeitos)).toMatchObject({ tipo: "excecao", cnpj: null, status: "ativa" });
    // Quem não gere a rede continua sem cadastrar.
    expect(await tentar(sessao(ids.vendedorA), CRIAR, [ids.empresa, "loja-x", "Loja X", "loja_fisica", null, null, null, null, "Tentativa de cadastro"]))
      .toMatchObject({ codigo: "42501" });
  });

  it("sem o CNPJ a loja não vende nem reserva para venda (OR038), por nenhum caminho; com o CNPJ, vende", async () => {
    const loja = await criarSemCnpj("loja-colombo", "Colombo");
    const dono = await naLoja(ids.dono, loja);
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    const recusa = await tentar(dono, "select public.criar_venda($1) as v", [chave("venda")]);
    expect(recusa).toMatchObject({ codigo: "OR038" });
    expect((recusa as Falha).mensagem).toContain("falta o CNPJ da filial");
    // Nem pelo dono das tabelas: a venda e a reserva de venda (do PDV e do site) pedem a loja liberada.
    const direto = (sql: string, params: unknown[]) => tentar(null, sql, params);
    expect(await direto("insert into public.vendas (organizacao_id, unidade_id, vendedor_id, chave_criacao) values ($1, $2, $3, $4)",
      [ids.organizacao, loja, ids.dono, chave("venda-direta")])).toMatchObject({ codigo: "OR038" });
    for (const origem of ["pdv", "online"]) {
      expect(await direto("insert into public.estoque_reservas (organizacao_id, unidade_id, variante_id, quantidade, origem, chave_idempotencia, expira_em) values ($1, $2, $3, 1, $4, $5, now() + interval '30 minutes')",
        [ids.organizacao, loja, cat.capa, origem, chave("reserva-direta")])).toMatchObject({ codigo: "OR038" });
    }

    // O CNPJ da filial chega pelo cadastro: a loja passa a vender.
    expect(await valor<boolean>(sessao(ids.dono), ATUALIZAR, [loja, "Colombo", cnpj(RAIZ, "0007"), "PR", null, "CNPJ da filial informado"])).toBe(true);
    expect(typeof await valor<string>(dono, "select public.criar_venda($1) as v", [chave("venda")])).toBe("string");
  });

  it("o CNPJ de uma loja que já o tem pode ser trocado, mas não apagado", async () => {
    const r = await tentar(sessao(ids.dono), ATUALIZAR, [ids.lojaC, "Loja C", null, "PR", null, "Tirar o CNPJ"]);
    expect(r).toMatchObject({ codigo: "22023" });
    expect((r as Falha).mensagem).toContain("não apagado");
    expect(await valor<boolean>(sessao(ids.dono), ATUALIZAR, [ids.lojaC, "Loja C", cnpj(RAIZ, "0008"), "PR", null, "CNPJ corrigido"])).toBe(true);
    // A loja sem CNPJ continua podendo ser editada sem ele (o nome, por exemplo).
    const loja = await criarSemCnpj("loja-ventania", "Ventania");
    expect(await valor<boolean>(sessao(ids.dono), ATUALIZAR, [loja, "Ventania (centro)", null, null, null, "Nome conferido"])).toBe(true);
  });

  it("a vitrine do site não oferece a loja sem CNPJ; com o CNPJ, oferece", async () => {
    await db.query("update public.produtos set publicar_online = true where id = $1", [cat.produtoCapa]);
    const loja = await criarSemCnpj("loja-dubai", "Dubai");
    const antes = await ofertas(cat.produtoCapa);
    expect(antes).toContain(ids.lojaA);
    expect(antes).not.toContain(loja);
    await valor<boolean>(sessao(ids.dono), ATUALIZAR, [loja, "Dubai", cnpj(RAIZ, "0009"), "PR", null, "CNPJ da filial informado"]);
    expect(await ofertas(cat.produtoCapa)).toContain(loja);
  });
});
