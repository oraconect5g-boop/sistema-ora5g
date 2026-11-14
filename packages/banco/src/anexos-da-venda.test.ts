// Documentos da venda: contratos e anexos (lote L5d: ORA-CRM-008). Bucket privado "anexos", registro com o SHA-256,
// retirada pela gerência e quem lê. O "envio" grava em storage.objects como o usuário logado (o conteúdo é conferido
// pelo servidor antes). Banco em memória com todas as migrations; dados FICTÍCIOS; cada teste numa transação desfeita.
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
let arquivos = 0;
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
const como = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, async () => (await db.query(sql, params)).rows);

async function vendaConcluida(s: Sessao) {
  const aberto = await db.query("select 1 from public.caixas where operador_id = $1 and situacao = 'aberto'", [s.usuario]);
  if (aberto.rows.length === 0) await valor(s, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [venda, chave("concluir")]);
  return venda;
}

const ENVIAR = "insert into storage.objects (bucket_id, name, metadata) values ('anexos', $1, $2)";
const ANEXAR = "select public.venda_anexar_documento($1, $2, $3, $4, $5) as v";
const RETIRAR = "select public.venda_retirar_anexo($1, $2) as v";
const SHA = "c".repeat(64);
const caminho = (venda: string, formato = "pdf", loja = ids.lojaA) =>
  `${ids.organizacao}/${loja}/${venda}/00000000-0000-4000-a000-${String(++arquivos).padStart(12, "0")}.${formato}`;
const MIME = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
const meta = (formato: keyof typeof MIME, bytes = 120_000) => JSON.stringify({ size: bytes, mimetype: MIME[formato] });

describe("documentos da venda (L5d, ORA-CRM-008)", () => {
  it("quem vendeu anexa o contrato e a foto do termo; o mesmo caminho devolve o mesmo; a gerência retira com motivo, uma vez; tudo na auditoria", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const venda = await vendaConcluida(ana);
    const pdf = caminho(venda);
    await como(ana, ENVIAR, [pdf, meta("pdf")]);
    const contrato = await valor<{ id: string; repetido: boolean }>(ana, ANEXAR, [venda, "contrato_financiamento", null, pdf, SHA]);
    expect(contrato.repetido).toBe(false);
    expect(await valor(ana, ANEXAR, [venda, "contrato_financiamento", null, pdf, SHA])).toEqual({ ...contrato, repetido: true });
    const foto = caminho(venda, "jpg");
    await como(ana, ENVIAR, [foto, meta("jpg", 900_000)]);
    await valor(ana, ANEXAR, [venda, "termo_garantia", "  Termo   assinado pelo cliente ", foto, "d".repeat(64)]);
    expect((await db.query("select tipo, descricao, formato, bytes, enviado_por, unidade_id from public.venda_anexos where venda_id = $1 order by enviado_em, caminho", [venda])).rows)
      .toEqual([
        { tipo: "contrato_financiamento", descricao: null, formato: "pdf", bytes: 120_000, enviado_por: ids.vendedorA, unidade_id: ids.lojaA },
        { tipo: "termo_garantia", descricao: "Termo assinado pelo cliente", formato: "jpg", bytes: 900_000, enviado_por: ids.vendedorA, unidade_id: ids.lojaA },
      ]);
    // A vendedora não retira; a gerência retira com o motivo, uma vez; o arquivo e o registro continuam.
    expect(await errou(ana, RETIRAR, [contrato.id, "Arquivo errado"])).toBe("42501");
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await errou(dono, RETIRAR, [contrato.id, null])).toBe("22023");
    expect(await valor(dono, RETIRAR, [contrato.id, "Contrato de outro cliente"])).toBe(true);
    expect(await valor(dono, RETIRAR, [contrato.id, "Contrato de outro cliente"])).toBe(false);
    expect((await db.query("select retirado_por, motivo_retirada from public.venda_anexos where id = $1", [contrato.id])).rows[0])
      .toEqual({ retirado_por: ids.dono, motivo_retirada: "Contrato de outro cliente" });
    expect((await db.query("select count(*)::int as n from storage.objects where bucket_id = 'anexos' and name = $1", [pdf])).rows[0]).toEqual({ n: 1 });
    expect((await db.query("select acao from public.auditoria where alvo_id = $1 order by id", [contrato.id])).rows.map((r) => (r as { acao: string }).acao))
      .toEqual(["venda_anexos.criado", "venda_anexos.alterado"]);
  });

  it("recusas: venda aberta, tipo, descrição do \"outro\", caminho de outra venda, formato trocado, arquivo que não chegou e o limite de 20", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const venda = await vendaConcluida(ana);
    const aberta = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    const daAberta = caminho(aberta);
    await como(ana, ENVIAR, [daAberta, meta("pdf")]);
    expect(await errou(ana, ANEXAR, [aberta, "contrato_linha", null, daAberta, SHA])).toBe("22023");
    const pdf = caminho(venda);
    await como(ana, ENVIAR, [pdf, meta("pdf")]);
    expect(await errou(ana, ANEXAR, [venda, "nota_fiscal", null, pdf, SHA])).toBe("22023");
    expect(await errou(ana, ANEXAR, [venda, "outro", null, pdf, SHA])).toBe("22023");
    expect(await errou(ana, ANEXAR, [venda, "outro", "ab", pdf, SHA])).toBe("22023");
    expect(await errou(ana, ANEXAR, [venda, "contrato_linha", null, daAberta, SHA])).toBe("22023");
    expect(await errou(ana, ANEXAR, [venda, "contrato_linha", null, pdf.replace(".pdf", ".exe"), SHA])).toBe("22023");
    expect(await errou(ana, ANEXAR, [venda, "contrato_linha", null, pdf, "curto"])).toBe("22023");
    const trocado = caminho(venda, "png");
    await como(ana, ENVIAR, [trocado, meta("pdf")]);
    expect(await errou(ana, ANEXAR, [venda, "comprovante_assinado", null, trocado, SHA])).toBe("22023");
    expect(await errou(ana, ANEXAR, [venda, "comprovante_assinado", null, caminho(venda), SHA])).toBe("P0002");
    expect(await valor(ana, ANEXAR, [venda, "outro", "Foto do documento do aparelho usado", pdf, SHA])).toMatchObject({ repetido: false });
    // O limite: 20 vigentes por venda (o retirado não conta).
    for (let i = 1; i < 20; i++) {
      const c = caminho(venda);
      await como(ana, ENVIAR, [c, meta("pdf")]);
      await valor(ana, ANEXAR, [venda, "comprovante_assinado", null, c, SHA]);
    }
    const vigesimoPrimeiro = caminho(venda);
    await como(ana, ENVIAR, [vigesimoPrimeiro, meta("pdf")]);
    expect(await errou(ana, ANEXAR, [venda, "comprovante_assinado", null, vigesimoPrimeiro, SHA])).toBe("22023");
    const umDeles = (await db.query<{ id: string }>("select id from public.venda_anexos where venda_id = $1 limit 1", [venda])).rows[0]?.id;
    await valor(await naLoja(ids.dono, ids.lojaA), RETIRAR, [umDeles, "Foto tremida"]);
    expect(await valor(ana, ANEXAR, [venda, "comprovante_assinado", null, vigesimoPrimeiro, SHA])).toMatchObject({ repetido: false });
  });

  it("quem vê e quem envia: a venda de outro vendedor e de outra loja não; a gerência da loja sim; o registro não muda nem se apaga direto", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const venda = await vendaConcluida(ana);
    const pdf = caminho(venda);
    await como(ana, ENVIAR, [pdf, meta("pdf")]);
    const anexo = await valor<{ id: string }>(ana, ANEXAR, [venda, "contrato_linha", null, pdf, SHA]);
    // Outro vendedor da mesma loja (o vendedorAB) não lê a venda da Ana, nem o documento, nem envia para ela.
    const bia = await naLoja(ids.vendedorAB, ids.lojaA);
    expect(await como(bia, "select id from public.venda_anexos")).toEqual([]);
    expect(await como(bia, "select name from storage.objects where bucket_id = 'anexos'")).toEqual([]);
    expect(await errou(bia, ENVIAR, [caminho(venda), meta("pdf")])).toBe("42501");
    expect(await errou(bia, ANEXAR, [venda, "contrato_linha", null, pdf, SHA])).toBe("P0002");
    // A gerência da loja lê e anexa; a de outra loja e a outra rede, não.
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await como(dono, "select id from public.venda_anexos")).map((l) => (l as { id: string }).id)).toEqual([anexo.id]);
    const doDono = caminho(venda);
    await como(dono, ENVIAR, [doDono, meta("pdf")]);
    expect(await valor(dono, ANEXAR, [venda, "comprovante_assinado", null, doDono, SHA])).toMatchObject({ repetido: false });
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect(await como(gerenteB, "select id from public.venda_anexos")).toEqual([]);
    expect(await como(gerenteB, "select name from storage.objects where bucket_id = 'anexos'")).toEqual([]);
    expect(await errou(gerenteB, RETIRAR, [anexo.id, "Tentativa"])).toBe("P0002");
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await como(outraRede, "select name from storage.objects where bucket_id = 'anexos'")).toEqual([]);
    // Nem a pessoa nem o dono do banco mudam ou apagam o registro direto.
    expect(await errou(ana, "update public.venda_anexos set tipo = 'outro' where id = $1", [anexo.id])).toBe("42501");
    expect(await erroDe(() => db.query("update public.venda_anexos set sha256 = $2 where id = $1", [anexo.id, "e".repeat(64)]))).toBe("42501");
    expect(await erroDe(() => db.query("delete from public.venda_anexos where id = $1", [anexo.id]))).not.toBeNull();
  });
});
