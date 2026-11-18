// Lote REIN-b (auditoria do Codex de 17/11, "Primeiro lote"; ORA-INV-004 e ORA-CAT-002; ADR-021; migration
// 20261118021151_estoque_inicial_por_arquivo): o estoque inicial de cada loja pelo arquivo, com prévia, aprovação e
// aplicação pelo livro. Dados FICTÍCIOS (o catálogo e as lojas do cenário); cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
const DEFEITOS = "00000000-0000-4000-8000-0000000000de";
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  await db.query("insert into public.unidades (id, organizacao_id, empresa_id, codigo, nome, tipo) values ($1, $2, $3, 'defeitos', 'DEFEITOS', 'excecao')",
    [DEFEITOS, ids.organizacao, ids.empresa]);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let arquivos = 0;
const sha = () => `c${String(++arquivos).padStart(63, "0")}`;
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
const sessao = (usuario: string): Sessao => ({ usuario, sessao: `4d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });
const valor = <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const recusa = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));
const agora = async () => (await db.query<{ t: string }>("select now()::text as t")).rows[0]?.t ?? "";

const PREVIA = "select public.estoque_carga_previa($1, $2, 'relatorioProdutos.xlsx', $3, $4::timestamptz, '{\"sku\":\"Código\"}'::jsonb, $5::jsonb) as v";
const APLICAR = "select public.estoque_carga_aplicar($1, $2) as v";
const DESFAZER = "select public.estoque_carga_desfazer($1, $2) as v";
const DESCARTAR = "select public.estoque_carga_descartar($1, $2) as v";
type Previa = { id: string; numero: number; repetida: boolean; totais: Record<string, number> };
const previa = async (s: Sessao, unidade: string, linhas: unknown[], arquivo = sha(), corte?: string) =>
  valor<Previa>(s, PREVIA, [ids.organizacao, unidade, arquivo, corte ?? await agora(), JSON.stringify(linhas)]);
const linhasDa = async (carga: string) =>
  (await db.query<{ numero: number; sku: string; acao: string; motivo: string | null; saldo_no_corte: number }>(
    "select numero, sku, acao, motivo, saldo_no_corte from public.estoque_carga_linhas where carga_id = $1 order by numero", [carga])).rows;
const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ quantidade: number }>("select quantidade from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0]?.quantidade ?? 0;

describe("a prévia da carga de uma loja (REIN-b)", () => {
  it("classifica cada linha: entrar, serializado, sem produto, conferir (com o motivo) e nada; não mexe no estoque", async () => {
    const admin = sessao(ids.administrador);
    const p = await previa(admin, ids.lojaC, [
      { numero: 2, sku: "ACE-0001", fisico: 10, disponivel: 8 },
      { numero: 3, sku: "APA-0001", fisico: 2, disponivel: 2 },
      { numero: 4, sku: "CHI-0001", fisico: 5, disponivel: null },
      { numero: 5, sku: "XYZ-9999", fisico: 1, disponivel: 1 },
      { numero: 6, sku: "REC-0001", fisico: 3, disponivel: 3 },
      { numero: 7, sku: "ACE-0001", fisico: 1, disponivel: 1 },
      { numero: 8, sku: "", fisico: 4, disponivel: 4 },
      { numero: 9, sku: "OUT-1", fisico: null, disponivel: 1, problema: 'Quantidade que não é número inteiro: "1,5"' },
    ]);
    expect(p).toMatchObject({ repetida: false, totais: { linhas: 8, entrar: 1, unidades_entrar: 10, serializado: 2, unidades_serializado: 7, sem_produto: 1, conferir: 4, nada: 0, fora_do_disponivel: 2 } });
    expect(await linhasDa(p.id)).toEqual([
      { numero: 2, sku: "ACE-0001", acao: "entrar", motivo: null, saldo_no_corte: 0 },
      { numero: 3, sku: "APA-0001", acao: "serializado", motivo: "Entra pela Entrada de estoque, com o IMEI ou o ICCID de cada unidade", saldo_no_corte: 0 },
      { numero: 4, sku: "CHI-0001", acao: "serializado", motivo: "Entra pela Entrada de estoque, com o IMEI ou o ICCID de cada unidade", saldo_no_corte: 0 },
      { numero: 5, sku: "XYZ-9999", acao: "sem_produto", motivo: "O código não está no catálogo: importe o catálogo antes", saldo_no_corte: 0 },
      { numero: 6, sku: "REC-0001", acao: "conferir", motivo: "Este tipo de item não tem estoque", saldo_no_corte: 0 },
      { numero: 7, sku: "ACE-0001", acao: "conferir", motivo: "Código repetido no arquivo (já na linha 2)", saldo_no_corte: 0 },
      { numero: 8, sku: "", acao: "conferir", motivo: "Linha sem o código do produto", saldo_no_corte: 0 },
      { numero: 9, sku: "OUT-1", acao: "conferir", motivo: 'Quantidade que não é número inteiro: "1,5"', saldo_no_corte: 0 },
    ]);
    expect(await saldo(ids.lojaC, cat.capa)).toBe(0);
    // O mesmo arquivo da mesma loja devolve a mesma prévia.
    const corte = (await db.query<{ c: string }>("select corte::text as c from public.estoque_cargas where id = $1", [p.id])).rows[0]?.c;
    const arquivo = (await db.query<{ s: string }>("select arquivo_sha256 as s from public.estoque_cargas where id = $1", [p.id])).rows[0]?.s;
    expect(await valor<Previa>(admin, PREVIA, [ids.organizacao, ids.lojaC, arquivo, corte, JSON.stringify([{ numero: 2, sku: "ACE-0001", fisico: 1 }])]))
      .toMatchObject({ id: p.id, repetida: true });
  });

  it("a quantidade negativa, o disponível maior que o físico e a loja que já tinha o produto na data de corte vão para conferência; físico zero é nada", async () => {
    const admin = sessao(ids.administrador);
    const p = await previa(admin, ids.lojaA, [
      { numero: 2, sku: "ACE-0001", fisico: 4, disponivel: 4 },
      { numero: 3, sku: "APA-0001", fisico: -1, disponivel: 0 },
      { numero: 4, sku: "CHI-0001", fisico: 1, disponivel: 3 },
      { numero: 5, sku: "REC-0001", fisico: 0, disponivel: 0 },
    ]);
    expect((await linhasDa(p.id)).map((l) => [l.numero, l.acao, l.motivo, l.saldo_no_corte])).toEqual([
      [2, "conferir", "A loja já tinha 10 no sistema na data de corte: confira antes de lançar", 10],
      [3, "conferir", "Quantidade negativa no arquivo", 2],
      [4, "conferir", "O disponível é maior que o físico", 1],
      [5, "nada", null, 0],
    ]);
  });

  it("recusa a loja de outra rede, o local que não guarda estoque, a data de corte no futuro, a linha fora do formato e quem não importa", async () => {
    const admin = sessao(ids.administrador);
    const linha = JSON.stringify([{ numero: 2, sku: "ACE-0001", fisico: 1 }]);
    const t = await agora();
    expect(await recusa(admin, PREVIA, [ids.organizacao, ids.lojaOutraOrg, sha(), t, linha])).toBe("22023");
    expect(await recusa(admin, PREVIA, [ids.organizacao, ids.online, sha(), t, linha])).toBe("22023");
    expect(await recusa(admin, PREVIA, [ids.organizacao, ids.lojaC, sha(), "2099-01-01T00:00:00Z", linha])).toBe("22023");
    expect(await recusa(admin, PREVIA, [ids.organizacao, ids.lojaC, sha(), t, JSON.stringify([{ numero: 2, sku: "ACE-0001", fisico: "dez" }])])).toBe("22023");
    expect(await recusa(admin, PREVIA, [ids.organizacao, ids.lojaC, sha(), t, JSON.stringify([{ numero: 2, sku: "ACE-0001", fisico: 1.5 }])])).toBe("22023");
    expect(await recusa(admin, PREVIA, [ids.organizacao, ids.lojaC, sha(), t, "[]"])).toBe("22023");
    for (const quem of [ids.dono, ids.gerenteB, ids.vendedorA, ids.donoOutraOrg]) {
      expect(await recusa(sessao(quem), PREVIA, [ids.organizacao, ids.lojaC, sha(), t, linha]), quem).toBe("42501");
    }
  });
});

describe("aplicar, descartar e desfazer (REIN-b)", () => {
  it("o dono aplica: cada linha entra no livro uma vez; o mesmo arquivo não se aplica de novo; outra carga na loja espera (OR041)", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const arquivo = sha();
    const p = await previa(admin, ids.lojaC, [{ numero: 2, sku: "ACE-0001", fisico: 10, disponivel: 8 }, { numero: 3, sku: "APA-0001", fisico: 2 }], arquivo);
    expect(await recusa(admin, APLICAR, [p.id, "Carga da Loja C"])).toBe("42501");
    expect(await recusa(dono, APLICAR, [p.id, "x"])).toBe("22023");
    expect(await valor(dono, APLICAR, [p.id, "Carga da Loja C"])).toMatchObject({ id: p.id, entradas: 1, unidades: 10 });
    expect(await saldo(ids.lojaC, cat.capa)).toBe(10);
    expect(await saldo(ids.lojaC, cat.aparelho)).toBe(0);
    const mov = (await db.query("select tipo, quantidade, referencia_tipo, chave_idempotencia from public.estoque_movimentos where referencia_id = $1", [p.id])).rows;
    expect(mov).toEqual([{ tipo: "entrada_importacao", quantidade: 10, referencia_tipo: "estoque_carga", chave_idempotencia: `estoque_carga:${p.id}:2` }]);
    expect(await recusa(dono, APLICAR, [p.id, "De novo"])).toBe("22023");
    expect(await recusa(admin, PREVIA, [ids.organizacao, ids.lojaC, arquivo, await agora(), JSON.stringify([{ numero: 2, sku: "ACE-0001", fisico: 1 }])])).toBe("OR023");
    const outra = await previa(admin, ids.lojaC, [{ numero: 2, sku: "CHI-0001", fisico: 1 }]);
    expect(await recusa(dono, APLICAR, [outra.id, "Outra carga"])).toBe("OR041");
  });

  it("quem gerou a prévia não aplica, mesmo com as duas permissões (OR024); a prévia descartada não se aplica", async () => {
    await db.query("insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, inicio) values ($1, $2, 'dono', 'organizacao', now() - interval '1 day')",
      [ids.administrador, ids.organizacao]);
    const admin = sessao(ids.administrador);
    const p = await previa(admin, ids.lojaC, [{ numero: 2, sku: "ACE-0001", fisico: 1 }]);
    expect(await recusa(admin, APLICAR, [p.id, "Aplicando a própria"])).toBe("OR024");
    expect(await valor(admin, DESCARTAR, [p.id, "Arquivo errado"])).toBe(true);
    expect(await recusa(sessao(ids.dono), APLICAR, [p.id, "Depois de descartada"])).toBe("22023");
  });

  it("o DEFEITOS recebe a carga; desfazer devolve o que está livre e conta o que já saiu", async () => {
    const admin = sessao(ids.administrador);
    const dono = sessao(ids.dono);
    const d = await previa(admin, DEFEITOS, [{ numero: 2, sku: "ACE-0001", fisico: 3, disponivel: 3 }]);
    expect(await valor(dono, APLICAR, [d.id, "Carga do DEFEITOS"])).toMatchObject({ entradas: 1, unidades: 3 });
    expect(await saldo(DEFEITOS, cat.capa)).toBe(3);

    const p = await previa(admin, ids.lojaC, [{ numero: 2, sku: "ACE-0001", fisico: 5 }]);
    await valor(dono, APLICAR, [p.id, "Carga da Loja C"]);
    // Uma das cinco capas sai da loja (perda registrada): só a carga inteira livre volta; a linha fica e é contada.
    await db.query("select privado.lancar_movimento($1, $2, -1, 'perda', null, 'teste', null, null, 'teste:perda:c')", [ids.lojaC, cat.capa]);
    expect(await valor(dono, DESFAZER, [p.id, "Carga errada"])).toMatchObject({ desfeitas: 0, ficaram: 1 });
    expect(await saldo(ids.lojaC, cat.capa)).toBe(4);
    expect(await valor(dono, DESFAZER, [d.id, "Carga errada"])).toMatchObject({ desfeitas: 1, ficaram: 0 });
    expect(await saldo(DEFEITOS, cat.capa)).toBe(0);
    // Desfeita, a loja aceita outra carga.
    const nova = await previa(admin, DEFEITOS, [{ numero: 2, sku: "ACE-0001", fisico: 2 }]);
    expect(await valor(dono, APLICAR, [nova.id, "Carga certa"])).toMatchObject({ entradas: 1, unidades: 2 });
    expect(await recusa(dono, DESFAZER, [d.id, "De novo"])).toBe("22023");
    expect(await recusa(sessao(ids.gerenteB), DESFAZER, [nova.id, "Gerente"])).toBe("42501");
  });

  it("quem importa e quem aprova veem as cargas; o vendedor e a outra rede não", async () => {
    const admin = sessao(ids.administrador);
    const p = await previa(admin, ids.lojaC, [{ numero: 2, sku: "ACE-0001", fisico: 1 }]);
    const ver = (quem: string) => comoUsuario(db, sessao(quem), async () => (await db.query("select id from public.estoque_cargas")).rows.length);
    const verLinhas = (quem: string) => comoUsuario(db, sessao(quem), async () => (await db.query("select numero from public.estoque_carga_linhas where carga_id = $1", [p.id])).rows.length);
    expect([await ver(ids.administrador), await ver(ids.dono), await ver(ids.vendedorA), await ver(ids.gerenteB), await ver(ids.donoOutraOrg)]).toEqual([1, 1, 0, 0, 0]);
    expect([await verLinhas(ids.dono), await verLinhas(ids.vendedorA)]).toEqual([1, 0]);
  });
});
