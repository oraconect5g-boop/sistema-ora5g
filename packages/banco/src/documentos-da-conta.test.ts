// Documentos da conta a pagar: o boleto, a nota e o comprovante (lote FIN-004b: ORA-FIN-004). Bucket privado "contas",
// registro com o SHA-256, retirada com motivo e quem lê. O "envio" grava em storage.objects como o usuário logado (o
// conteúdo é conferido pelo servidor antes). Banco em memória com todas as migrations; dados FICTÍCIOS; cada teste numa
// transação desfeita.
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
let arquivos = 0;
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
  const s = { usuario, sessao: `7b000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao | null, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao | null, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));
const como = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, async () => (await db.query(sql, params)).rows);

const vencimento = async () => (await db.query<{ v: string }>("select ((now() at time zone 'America/Sao_Paulo')::date + 10)::text as v")).rows[0]?.v ?? "";
const categoria = async () =>
  (await db.query<{ id: string }>("select id from public.contas_pagar_categorias where organizacao_id = $1 and nome = 'Mercadoria (fornecedor)'", [ids.organizacao])).rows[0]?.id ?? "";
async function conta(s: Sessao, unidade: string | null) {
  const grupo = await valor<string>(s, "select public.conta_pagar_lancar($1::jsonb, $2) as v", [
    JSON.stringify({ unidade, descricao: "Boleto da compra", valor: 90_000, forma: "unica", categoria: await categoria(), vencimento: await vencimento() }), `fin004b:${++chaves}`]);
  return (await db.query<{ id: string }>("select id from public.contas_a_pagar where grupo_id = $1", [grupo])).rows[0]?.id ?? "";
}

const ENVIAR = "insert into storage.objects (bucket_id, name, metadata) values ('contas', $1, $2)";
const ANEXAR = "select public.conta_pagar_anexar($1, $2, $3, $4, $5) as v";
const RETIRAR = "select public.conta_pagar_retirar_anexo($1, $2) as v";
const SHA = "c".repeat(64);
const caminho = (contaId: string, formato = "pdf", org = ids.organizacao) =>
  `${org}/${contaId}/00000000-0000-4000-a000-${String(++arquivos).padStart(12, "0")}.${formato}`;
const MIME = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
const meta = (formato: keyof typeof MIME, bytes = 120_000) => JSON.stringify({ size: bytes, mimetype: MIME[formato] });

describe("documentos da conta a pagar (FIN-004b)", () => {
  it("o dono anexa o boleto e a foto da nota; o mesmo caminho devolve o mesmo; retira com motivo, uma vez; tudo na auditoria", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const c = await conta(dono, ids.lojaA);
    const pdf = caminho(c);
    await como(dono, ENVIAR, [pdf, meta("pdf")]);
    const boleto = await valor<{ id: string; repetido: boolean }>(dono, ANEXAR, [c, "boleto", null, pdf, SHA]);
    expect(boleto.repetido).toBe(false);
    expect(await valor(dono, ANEXAR, [c, "boleto", null, pdf, SHA])).toEqual({ ...boleto, repetido: true });
    const foto = caminho(c, "jpg");
    await como(dono, ENVIAR, [foto, meta("jpg", 900_000)]);
    await valor(dono, ANEXAR, [c, "nota_fiscal", "  NF   do fornecedor ", foto, "d".repeat(64)]);
    expect((await db.query("select tipo, descricao, formato, bytes, enviado_por, unidade_id from public.conta_pagar_anexos where conta_id = $1 order by enviado_em, caminho", [c])).rows)
      .toEqual([
        { tipo: "boleto", descricao: null, formato: "pdf", bytes: 120_000, enviado_por: ids.dono, unidade_id: ids.lojaA },
        { tipo: "nota_fiscal", descricao: "NF do fornecedor", formato: "jpg", bytes: 900_000, enviado_por: ids.dono, unidade_id: ids.lojaA },
      ]);
    expect(await errou(dono, RETIRAR, [boleto.id, null])).toBe("22023");
    expect(await valor(dono, RETIRAR, [boleto.id, "Boleto de outra conta"])).toBe(true);
    expect(await valor(dono, RETIRAR, [boleto.id, "Boleto de outra conta"])).toBe(false);
    expect((await db.query("select retirado_por, motivo_retirada from public.conta_pagar_anexos where id = $1", [boleto.id])).rows[0])
      .toEqual({ retirado_por: ids.dono, motivo_retirada: "Boleto de outra conta" });
    // o arquivo continua guardado e nada se apaga
    expect((await db.query("select count(*)::int as n from storage.objects where bucket_id = 'contas' and name = $1", [pdf])).rows[0]).toEqual({ n: 1 });
    expect(await erroDe(() => db.query("delete from public.conta_pagar_anexos where id = $1", [boleto.id]))).not.toBeNull();
    expect((await db.query("select acao from public.auditoria where alvo_id = $1 order by id", [boleto.id])).rows.map((r) => (r as { acao: string }).acao))
      .toEqual(["conta_pagar_anexos.criado", "conta_pagar_anexos.alterado"]);
  });

  it("recusas: tipo, descrição do \"outro\", caminho de outra conta, formato trocado, arquivo que não chegou, resumo inválido e o limite de 20", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const c = await conta(dono, ids.lojaA);
    const outra = await conta(dono, null);
    const pdf = caminho(c);
    await como(dono, ENVIAR, [pdf, meta("pdf")]);
    expect(await errou(dono, ANEXAR, [c, "contrato", null, pdf, SHA])).toBe("22023");
    expect(await errou(dono, ANEXAR, [c, "outro", null, pdf, SHA])).toBe("22023");
    expect(await errou(dono, ANEXAR, [c, "outro", "ab", pdf, SHA])).toBe("22023");
    const daOutra = caminho(outra);
    await como(dono, ENVIAR, [daOutra, meta("pdf")]);
    expect(await errou(dono, ANEXAR, [c, "boleto", null, daOutra, SHA])).toBe("22023");
    expect(await errou(dono, ANEXAR, [c, "boleto", null, pdf.replace(".pdf", ".exe"), SHA])).toBe("22023");
    expect(await errou(dono, ANEXAR, [c, "boleto", null, pdf, "curto"])).toBe("22023");
    const trocado = caminho(c, "png");
    await como(dono, ENVIAR, [trocado, meta("pdf")]);
    expect(await errou(dono, ANEXAR, [c, "boleto", null, trocado, SHA])).toBe("22023");
    expect(await errou(dono, ANEXAR, [c, "boleto", null, caminho(c), SHA])).toBe("P0002");
    expect(await valor(dono, ANEXAR, [c, "outro", "Comprovante do frete", pdf, SHA])).toMatchObject({ repetido: false });
    for (let i = 1; i < 20; i++) {
      const p = caminho(c);
      await como(dono, ENVIAR, [p, meta("pdf")]);
      await valor(dono, ANEXAR, [c, "comprovante_pagamento", null, p, SHA]);
    }
    const vigesimoPrimeiro = caminho(c);
    await como(dono, ENVIAR, [vigesimoPrimeiro, meta("pdf")]);
    expect(await errou(dono, ANEXAR, [c, "boleto", null, vigesimoPrimeiro, SHA])).toBe("22023");
  });

  it("só quem gere a conta: o gerente na loja dele; o vendedor, o gerente de outra loja e outra rede não enviam, não leem e não registram", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const daLojaA = await conta(dono, ids.lojaA);
    const pdf = caminho(daLojaA);
    await como(dono, ENVIAR, [pdf, meta("pdf")]);
    const registrado = await valor<{ id: string }>(dono, ANEXAR, [daLojaA, "boleto", null, pdf, SHA]);
    for (const [usuario, loja] of [[ids.vendedorA, ids.lojaA], [ids.gerenteB, ids.lojaB], [ids.donoOutraOrg, ids.lojaOutraOrg]] as const) {
      const s = await naLoja(usuario, loja);
      expect(await errou(s, ENVIAR, [caminho(daLojaA), meta("pdf")]), usuario).toBe("42501");
      expect(await como(s, "select name from storage.objects where bucket_id = 'contas'"), usuario).toEqual([]);
      expect(await como(s, "select id from public.conta_pagar_anexos"), usuario).toEqual([]);
      expect(await errou(s, ANEXAR, [daLojaA, "boleto", null, pdf, SHA]), usuario).toBe("P0002");
      expect(await errou(s, RETIRAR, [registrado.id, "Tentativa"]), usuario).toBe("P0002");
    }
    // o gerente da loja B, na conta da loja dele
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const daLojaB = await conta(gerente, ids.lojaB);
    const webp = caminho(daLojaB, "webp");
    await como(gerente, ENVIAR, [webp, meta("webp")]);
    expect(await valor(gerente, ANEXAR, [daLojaB, "nota_fiscal", null, webp, SHA])).toMatchObject({ repetido: false });
    // o caminho com a organização errada não entra no Storage, nem para o dono
    expect(await errou(dono, ENVIAR, [caminho(daLojaA, "pdf", ids.outraOrganizacao), meta("pdf")])).toBe("42501");
  });

  it("visitante não executa", async () => {
    expect(await errou(null, "select public.conta_pagar_anexar($1, 'boleto', null, 'x', $2)", ["00000000-0000-4000-8000-000000000001", SHA])).toBe("42501");
    expect(await errou(null, "select public.conta_pagar_retirar_anexo($1, 'Tentativa')", ["00000000-0000-4000-8000-000000000001"])).toBe("42501");
  });
});
