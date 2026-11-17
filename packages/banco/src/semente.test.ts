// A semente do banco de desenvolvimento e a ligação dos usuários de teste rodam do zero, podem
// rodar de novo sem duplicar e deixam o estoque coerente com o livro.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco } from "./banco-de-teste";

const PASTA = join(new URL("..", import.meta.url).pathname, "supabase", "semente");
const semente = readFileSync(join(PASTA, "desenvolvimento.sql"), "utf8");
const vincular = readFileSync(join(PASTA, "vincular-usuarios-de-teste.sql"), "utf8");

const VENDEDOR = "00000000-0000-4000-a000-000000000001";
const DONO = "00000000-0000-4000-a000-000000000002";
const OUTRO = "00000000-0000-4000-a000-000000000003";
const GERENTE = "00000000-0000-4000-a000-000000000004";
const SANTA = "0a5e0000-0000-4000-8000-000000000020";
const LOJA2 = "0a5e0000-0000-4000-8000-000000000021";

let db: PGlite;
const contar = async (tabela: string) => (await db.query<{ n: number }>(`select count(*)::int as n from public.${tabela}`)).rows[0]?.n;

beforeAll(async () => {
  db = await criarBanco();
  await db.exec(semente);
  await db.query("insert into auth.users (id, email) values ($1, 'pessoa+vendedor@teste.invalid'), ($2, 'pessoa+dono@teste.invalid'), ($3, 'qualquer@teste.invalid'), ($4, 'pessoa+gerente@teste.invalid')", [VENDEDOR, DONO, OUTRO, GERENTE]);
  await db.exec(vincular);
});

describe("semente do desenvolvimento", () => {
  it("cria a organização de teste, 3 unidades e o catálogo fictício", async () => {
    expect(await contar("unidades")).toBe(3);
    expect(await contar("variantes")).toBe(6);
    expect(await contar("itens_serializados")).toBe(17);
  });

  it("rodar de novo não duplica nada", async () => {
    const antes = await Promise.all(["unidades", "variantes", "precos", "custos", "itens_serializados", "estoque_movimentos", "vinculos"].map(contar));
    await db.exec(semente);
    await db.exec(vincular);
    const depois = await Promise.all(["unidades", "variantes", "precos", "custos", "itens_serializados", "estoque_movimentos", "vinculos"].map(contar));
    expect(depois).toEqual(antes);
  });

  it("saldo igual à soma do livro e o cabo com 3 unidades na Santa Cândida, como na demonstração", async () => {
    const { rows } = await db.query<{ diferencas: number }>(`
      select count(*)::int as diferencas from (
        select unidade_id, variante_id, sum(quantidade) as soma from public.estoque_movimentos group by 1, 2
      ) l full join public.estoque_saldos s using (unidade_id, variante_id)
      where coalesce(l.soma, 0) <> coalesce(s.quantidade, 0)`);
    expect(rows[0]?.diferencas).toBe(0);
    const cabo = await db.query<{ quantidade: number }>("select quantidade from public.estoque_saldos where unidade_id = $1 and variante_id = '0a5e0000-0000-4000-8000-000000000304'", [SANTA]);
    expect(cabo.rows[0]?.quantidade).toBe(3);
  });

  it("a semente fica registrada na auditoria com o motivo", async () => {
    const { rows } = await db.query<{ motivo: string }>("select distinct motivo from public.auditoria where acao = 'unidades.criado'");
    expect(rows.map((r) => r.motivo)).toEqual(["Semente de desenvolvimento (dados fictícios)"]);
  });
});

describe("usuários de teste", () => {
  it("só os e-mails com +vendedor, +gerente e +dono ganham perfil", async () => {
    const { rows } = await db.query<{ id: string }>("select id from public.perfis_usuario order by nome");
    expect(rows.map((r) => r.id).sort()).toEqual([VENDEDOR, GERENTE, DONO].sort());
  });

  it("o vendedor de teste trabalha nas duas lojas e só nelas; o dono vê as três unidades", async () => {
    const sessao = { usuario: VENDEDOR, sessao: "40000000-0000-4000-8000-000000000001" };
    const lojas = await comoUsuario(db, sessao, async () => (await db.query<{ id: string }>("select id from public.unidades order by codigo")).rows);
    expect(lojas.map((l) => l.id).sort()).toEqual([LOJA2, SANTA].sort());
    const aceita = await comoUsuario(db, sessao, async () => (await db.query<{ ok: boolean }>("select public.selecionar_unidade($1) as ok", [SANTA])).rows[0]?.ok);
    expect(aceita).toBe(true);
    const dono = await comoUsuario(db, { usuario: DONO, sessao: "40000000-0000-4000-8000-000000000002" }, async () => (await db.query("select id from public.unidades")).rows);
    expect(dono).toHaveLength(3);
  });

  it("o gerente só vê e aprova na Santa Cândida, sem gerir os usuários da rede", async () => {
    await comoUsuario(db, { usuario: GERENTE, sessao: "40000000-0000-4000-8000-000000000004" }, async () => {
      const lojas = await db.query<{ id: string }>("select id from public.unidades");
      expect(lojas.rows.map((l) => l.id)).toEqual([SANTA]);
      const selecionada = await db.query<{ ok: boolean }>("select public.selecionar_unidade($1) as ok", [SANTA]);
      expect(selecionada.rows[0]?.ok).toBe(true);
      const permissoes = await db.query<{ local: boolean; outra: boolean; equipe: boolean }>(`
        select public.tem_permissao('desconto.aprovar', $1) as local,
               public.tem_permissao('desconto.aprovar', $2) as outra,
               public.tem_permissao('usuarios.gerir') as equipe`, [SANTA, LOJA2]);
      expect(permissoes.rows[0]).toEqual({ local: true, outra: false, equipe: false });
      const outra = await db.query<{ ok: boolean }>("select public.selecionar_unidade($1) as ok", [LOJA2]);
      expect(outra.rows[0]?.ok).toBe(false);
    });
  });
});

// Lote ORG-a (17/11): as 11 lojas e DEFEITOS confirmados pelo proprietário em 09/11, pelo cadastro operacional. Roda
// depois dos outros blocos deste arquivo, que contam as 3 unidades da semente.
describe("as 11 lojas e DEFEITOS confirmados (ORG-a)", () => {
  const lojasConfirmadas = readFileSync(join(PASTA, "lojas-confirmadas.sql"), "utf8");
  const CODIGOS = [
    "loja-santa-felicidade", "loja-agua-verde", "loja-colonia", "loja-almirante-tamandare", "loja-dubai", "loja-colombo",
    "loja-muffato-santa", "loja-butiatuvinha", "loja-ventania", "loja-balneario", "loja-santa-candida", "defeitos",
  ];
  type Loja = { codigo: string; nome: string; tipo: string; cnpj: string | null; cidade: string | null; uf: string | null; endereco: string | null };
  const confirmadas = async () =>
    (await db.query<Loja>("select codigo, nome, tipo, cnpj, cidade, uf, endereco from public.unidades where codigo = any($1) order by codigo", [CODIGOS])).rows;

  it("entram só com o nome, o código e o tipo, sem CNPJ nem endereço, e rodar de novo não duplica", async () => {
    await db.exec(lojasConfirmadas);
    const lojas = await confirmadas();
    expect(lojas).toHaveLength(12);
    expect(lojas.filter((l) => l.tipo === "loja_fisica")).toHaveLength(11);
    expect(lojas.find((l) => l.codigo === "defeitos")).toMatchObject({ nome: "DEFEITOS", tipo: "excecao" });
    expect(lojas.every((l) => l.cnpj === null && l.cidade === null && l.uf === null && l.endereco === null)).toBe(true);
    await db.exec(lojasConfirmadas);
    expect(await contar("unidades")).toBe(15);
    // As de teste continuam como estavam, com o "(teste)" no nome.
    const { rows } = await db.query<{ nome: string }>("select nome from public.unidades where id = $1", [SANTA]);
    expect(rows[0]?.nome).toBe("Santa Cândida (teste)");
  });

  it("ficam na auditoria com o motivo do cadastro operacional", async () => {
    const { rows } = await db.query<{ motivo: string }>(`
      select distinct a.motivo from public.auditoria a join public.unidades u on u.id::text = a.alvo_id::text
      where a.acao = 'unidades.criado' and u.codigo = any($1)`, [CODIGOS]);
    expect(rows.map((r) => r.motivo)).toEqual(["Cadastro operacional das 11 lojas e de DEFEITOS confirmados pelo proprietário em 09/11 (ORG-a)"]);
  });
});
