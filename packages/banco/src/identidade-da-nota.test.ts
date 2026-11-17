// #101 (lote INTEG-c; revisão do Codex de 16/11/2026, PR #100, commit e311060): a nota antiga, emitida sem o
// destinatário guardado, não fica atribuída ao cliente de hoje da venda, e o envio pelo WhatsApp exige a identidade
// comprovada. Cada banco começa ANTES da migration do INTEG-a (20261116095825), com uma nota de Alfa pedida e emitida no
// esquema de então (a emissão apaga o destinatário guardado), e depois recebe as migrations seguintes, em ordem, como
// um banco real. É a prova do Codex (revalidacao-legado.test.ts) virada regressão do comportamento certo.
// Dados fictícios; bancos em memória (PGlite).
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { comoUsuario, cpf, criarBanco, migrations, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

const INTEG_A = "20261116095825";
const INTEG_C = migrations().find((m) => m.nome.endsWith("_identidade_da_nota_e_cota_da_loja.sql"))?.nome ?? "";

const abertos: PGlite[] = [];
afterEach(async () => { while (abertos.length) await abertos.pop()?.close(); });

/** O banco no esquema de antes do INTEG-a, com o cenário fictício de sempre. */
async function bancoAntigo(): Promise<PGlite> {
  const db = await criarBanco({ antesDe: INTEG_A });
  abertos.push(db);
  await montarCenario(db);
  await montarCatalogo(db);
  return db;
}
/** As migrations de `desde` (inclusive) até `ate` (exclusive), em ordem. */
async function aplicar(db: PGlite, desde: string, ate?: string) {
  for (const { nome, sql } of migrations()) {
    if (nome < desde) continue;
    if (ate && nome >= ate) break;
    await db.exec(sql);
  }
}

function chaveDeAcesso(cnpj: string, numero: number) {
  const base = `432611${cnpj}65001${String(numero).padStart(9, "0")}112345678`;
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) { soma += Number(base[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11;
  return base + String(resto < 2 ? 0 : 11 - resto);
}
const ENDERECO = { cep: "80000000", logradouro: "Rua Fictícia", numero: "10", bairro: "Centro", cidade: "Curitiba", uf: "PR" };

function mundo(db: PGlite) {
  let sessoes = 0;
  let chaves = 0;
  const chave = (p: string) => `integ-c:${p}:${String(++chaves).padStart(4, "0")}`;
  async function naLoja(usuario: string): Promise<Sessao> {
    const s = { usuario, sessao: `7d200000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
    await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [ids.lojaA]));
    return s;
  }
  async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string; mensagem: string }> {
    return comoUsuario(db, s, async () => {
      await db.exec("begin");
      try {
        const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
        await db.exec("commit");
        return { v };
      } catch (e) {
        await db.exec("rollback");
        return { codigo: (e as { code?: string }).code ?? "sem-codigo", mensagem: (e as Error).message };
      }
    }, { criarSessao: false });
  }
  async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
    const r = await tentar<T>(s, sql, params);
    if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
    return r.v;
  }
  async function cliente(s: Sessao, nome: string, numero: number) {
    return (await valor<{ id: string }>(s, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v", [JSON.stringify({
      tipo: "pessoa_fisica", nome, telefone: `4198700${String(numero).padStart(4, "0")}`, documento: cpf(String(529982200 + numero)),
      finalidades: ["nota_fiscal"], endereco: ENDERECO,
    }), chave("cliente")])).id;
  }
  /** A venda da Ana para Alfa, concluída, com a nota pedida no nome da Alfa, emitida e com o PDF guardado. */
  async function notaEmitidaDeAlfa() {
    const ana = await naLoja(ids.vendedorA);
    const dono = await naLoja(ids.dono);
    const alfa = await cliente(ana, "Cliente Alfa", 1);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
      [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), JSON.stringify({ id: alfa }), chave("concluir")]);
    const pedido = await valor<string>(ana, "select public.notas_solicitar($1, $2::jsonb, $3) as v", [venda, JSON.stringify({ cliente: alfa }), chave("nota")]);
    const cnpj = (await db.query<{ cnpj: string }>("select cnpj from public.unidades where id = $1", [ids.lojaA])).rows[0]?.cnpj ?? "";
    await valor(dono, "select public.notas_registrar_emissao($1, $2, null) as v", [pedido, chaveDeAcesso(cnpj, 1)]);
    const caminho = `${ids.organizacao}/${ids.lojaA}/${pedido}/00000000-0000-4000-a000-000000000001.pdf`;
    await comoUsuario(db, dono, () => db.query("insert into storage.objects (bucket_id, name, metadata) values ('notas', $1, $2::jsonb)",
      [caminho, JSON.stringify({ size: 50_000, mimetype: "application/pdf" })]), { criarSessao: false });
    await valor(dono, "select public.notas_anexar_documento($1, 'pdf', $2, $3, null) as v", [pedido, caminho, "c".repeat(64)]);
    return { ana, dono, alfa, venda, pedido };
  }
  const vincular = (s: Sessao, venda: string, outro: string) =>
    valor<boolean>(s, "select public.venda_vincular_cliente($1, $2, 'Revisão do vínculo comercial') as v", [venda, outro]);
  const ENVIAR = "select public.nota_enviar_whatsapp($1, $2, null) as v";
  const daNota = async (pedido: string) => (await db.query<{ cliente_id: string | null; cliente_origem: string | null; destinatario_nome: string | null; cliente_conferido_por: string | null }>(
    "select cliente_id, cliente_origem, destinatario_nome, cliente_conferido_por from public.notas_pedidos where id = $1", [pedido])).rows[0];
  const envios = async (pedido: string) => (await db.query<{ situacao: string; erro: string | null; cliente_id: string }>(
    "select situacao, erro, cliente_id from public.whatsapp_envios where pedido_id = $1 order by numero", [pedido])).rows;
  const comoWorker = async <T>(sql: string, params: unknown[] = []) => {
    await db.exec("set role service_role");
    try { return (await db.query<T>(sql, params)).rows; } finally { await db.exec("reset role"); }
  };
  return { chave, naLoja, tentar, valor, cliente, notaEmitidaDeAlfa, vincular, ENVIAR, daNota, envios, comoWorker };
}

describe("#101: a nota antiga só vai pelo WhatsApp com a identidade do destinatário comprovada (INTEG-c)", () => {
  it("a nota de Alfa, com a venda religada a Beta, não é atribuída a Beta: o envio é recusado e nada entra na fila", async () => {
    expect(INTEG_C).not.toBe("");
    const db = await bancoAntigo();
    const m = mundo(db);
    const n = await m.notaEmitidaDeAlfa();
    const beta = await m.cliente(n.ana, "Cliente Beta", 2);
    await m.vincular(n.ana, n.venda, beta);
    expect((await db.query("select 1 from privado.notas_destinatarios where pedido_id = $1", [n.pedido])).rows).toEqual([]);

    await aplicar(db, INTEG_A);

    // O INTEG-a deduziu Beta (o cliente de hoje da venda); o INTEG-c deixa sem prova.
    expect(await m.daNota(n.pedido)).toMatchObject({ destinatario_nome: "Cliente Alfa", cliente_id: beta, cliente_origem: null });
    const tentativa = await m.tentar(n.ana, m.ENVIAR, [n.pedido, m.chave("envio")]);
    expect(tentativa).toMatchObject({ codigo: "OR037" });
    expect(await m.envios(n.pedido)).toEqual([]);
  });

  it("a fila que já existia (o envio pedido entre o INTEG-a e o INTEG-c) não expede: o worker falha o envio com o motivo", async () => {
    const db = await bancoAntigo();
    const m = mundo(db);
    const n = await m.notaEmitidaDeAlfa();
    const beta = await m.cliente(n.ana, "Cliente Beta", 2);
    await m.vincular(n.ana, n.venda, beta);
    await aplicar(db, INTEG_A, INTEG_C);
    // A janela do defeito: com o INTEG-a e sem o INTEG-c, o envio da nota de Alfa entra na fila para Beta.
    await m.valor(n.ana, m.ENVIAR, [n.pedido, m.chave("envio")]);
    expect(await m.envios(n.pedido)).toMatchObject([{ situacao: "na_fila", cliente_id: beta }]);

    await aplicar(db, INTEG_C);

    expect(await m.comoWorker("select * from public.whatsapp_worker_reivindicar(5)")).toEqual([]);
    const [envio] = await m.envios(n.pedido);
    expect(envio?.situacao).toBe("falhou");
    expect(envio?.erro).toMatch(/identidade do destinatário desta nota não está comprovada/);
  });

  it("a gerência confere o PDF e confirma o cliente da venda; vai para a auditoria e o envio passa; o vendedor não confirma", async () => {
    const db = await bancoAntigo();
    const m = mundo(db);
    // A venda continua de Alfa: a nota é de Alfa, mas sem o destinatário guardado não há prova até a conferência.
    const n = await m.notaEmitidaDeAlfa();
    await aplicar(db, INTEG_A);
    expect(await m.daNota(n.pedido)).toMatchObject({ cliente_id: n.alfa, cliente_origem: null });
    expect(await m.tentar(n.ana, m.ENVIAR, [n.pedido, m.chave("envio")])).toMatchObject({ codigo: "OR037" });

    const CONFIRMAR = "select public.nota_confirmar_destinatario($1, $2) as v";
    expect(await m.tentar(n.ana, CONFIRMAR, [n.pedido, "Conferi o CPF no PDF da nota"])).toMatchObject({ codigo: "42501" });
    expect(await m.tentar(n.dono, CONFIRMAR, [n.pedido, "curto"])).toMatchObject({ codigo: "22023" });
    expect(await m.valor<boolean>(n.dono, CONFIRMAR, [n.pedido, "Conferi o CPF do DANFE com o cadastro"])).toBe(true);
    expect(await m.daNota(n.pedido)).toMatchObject({ cliente_id: n.alfa, cliente_origem: "conferencia", cliente_conferido_por: ids.dono });
    const auditoria = (await db.query<{ acao: string; motivo: string; usuario_id: string }>(
      "select acao, motivo, usuario_id from public.auditoria where alvo_id = $1 and acao = 'notas_pedidos.destinatario_conferido'", [n.pedido])).rows;
    expect(auditoria).toEqual([{ acao: "notas_pedidos.destinatario_conferido", motivo: "Conferi o CPF do DANFE com o cadastro", usuario_id: ids.dono }]);
    expect(await m.tentar(n.dono, CONFIRMAR, [n.pedido, "Conferi de novo no PDF da nota"])).toMatchObject({ codigo: "22023" });

    expect(await m.valor<string>(n.ana, m.ENVIAR, [n.pedido, m.chave("envio")])).toBeTruthy();
    expect(await m.envios(n.pedido)).toMatchObject([{ situacao: "na_fila", cliente_id: n.alfa }]);
  });

  it("o pedido novo nasce com a identidade comprovada e a mantém depois da emissão; a nota ainda não emitida não se confere", async () => {
    const db = await criarBanco();
    abertos.push(db);
    await montarCenario(db);
    await montarCatalogo(db);
    const m = mundo(db);
    const ana = await m.naLoja(ids.vendedorA);
    const dono = await m.naLoja(ids.dono);
    const carla = await m.cliente(ana, "Cliente Carla", 3);
    await m.valor(ana, "select public.abrir_caixa(10000, $1) as v", [m.chave("caixa")]);
    const venda = await m.valor<string>(ana, "select public.criar_venda($1) as v", [m.chave("venda")]);
    await m.valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, m.chave("item")]);
    await m.valor(ana, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
      [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), JSON.stringify({ id: carla }), m.chave("concluir")]);
    const pedido = await m.valor<string>(ana, "select public.notas_solicitar($1, $2::jsonb, $3) as v", [venda, JSON.stringify({ cliente: carla }), m.chave("nota")]);
    expect(await m.daNota(pedido)).toMatchObject({ cliente_id: carla, cliente_origem: "pedido", cliente_conferido_por: null });
    expect(await m.tentar(dono, "select public.nota_confirmar_destinatario($1, $2) as v", [pedido, "Conferi o CPF no PDF da nota"])).toMatchObject({ codigo: "22023" });
    const cnpj = (await db.query<{ cnpj: string }>("select cnpj from public.unidades where id = $1", [ids.lojaA])).rows[0]?.cnpj ?? "";
    await m.valor(dono, "select public.notas_registrar_emissao($1, $2, null) as v", [pedido, chaveDeAcesso(cnpj, 7)]);
    expect(await m.daNota(pedido)).toMatchObject({ cliente_id: carla, cliente_origem: "pedido" });
  });
});
