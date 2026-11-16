// O destinatário fiscal íntegro (lote INTEG-a; diagnóstico integral de 16/11/2026; migration
// 20261116095825_destinatario_fiscal_integro, antes 20261116120000). As provas REV-PROMPT-001 (#87) e REV-PROMPT-002 (#88) da revisão do Codex
// (PR #97, docs/analises/evidencias/2026-11-14-execucao-prompt/provas.test.ts) viram regressões do comportamento certo:
//   * #87: corrigir a nota não apaga mais o endereço, o cliente nem a versão do cadastro guardados; a nota no nome do
//     cliente se corrige com os dados atuais do cadastro (o CPF não se digita), e a nota digitada à mão segue igual;
//   * #88: depois de trocarem o cliente da venda, a nota de um cliente não vai ao WhatsApp de outro: o pedido de envio é
//     recusado, e o envio que já estava na fila é conferido de novo antes de expedir (nada sai se o destinatário mudou).
// Banco em memória com todas as migrations; dados FICTÍCIOS; cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, cpf, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
let cnpjA = "";
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  cnpjA = (await db.query<{ cnpj: string }>("select cnpj from public.unidades where id = $1", [ids.lojaA])).rows[0]!.cnpj;
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = (p: string) => `integ-a:${p}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string): Promise<Sessao> {
  const s = { usuario, sessao: `7d100000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [ids.lojaA]));
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
async function comoWorker<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("savepoint worker");
  await db.exec("set local role service_role");
  try {
    const linhas = (await db.query<T>(sql, params)).rows;
    await db.exec("reset role");
    await db.exec("release savepoint worker");
    return linhas;
  } catch (e) {
    await db.exec("rollback to savepoint worker");
    await db.exec("release savepoint worker");
    throw e;
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
const NOVO_ENDERECO = { cep: "82640000", logradouro: "Rua Nova Fictícia", numero: "200", bairro: "Santa Cândida", cidade: "Curitiba", uf: "PR" };
async function cliente(s: Sessao, nome: string, numero: number) {
  return (await valor<{ id: string }>(s, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v", [JSON.stringify({
    tipo: "pessoa_fisica", nome, telefone: `4198700${String(numero).padStart(4, "0")}`, documento: cpf(String(529982200 + numero)),
    finalidades: ["nota_fiscal"], endereco: ENDERECO,
  }), chave("cliente")])).id;
}
/** Venda da Ana para a cliente Alfa, concluída, com a nota pedida no nome da Alfa (o destinatário guardado completo). */
async function preparar() {
  const ana = await naLoja(ids.vendedorA);
  const dono = await naLoja(ids.dono);
  const alfa = await cliente(ana, "Cliente Alfa", 1);
  await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(ana, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
    [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), JSON.stringify({ id: alfa }), chave("concluir")]);
  const pedido = await valor<string>(ana, "select public.notas_solicitar($1, $2::jsonb, $3) as v", [venda, JSON.stringify({ cliente: alfa }), chave("nota")]);
  return { ana, dono, alfa, venda, pedido };
}
const guardado = async (pedido: string) => (await db.query<{ cliente_id: string | null; endereco: unknown; dados_de: string | null; documento: string }>(
  "select cliente_id, endereco, dados_de, documento from privado.notas_destinatarios where pedido_id = $1", [pedido])).rows[0];
const doPedido = async (pedido: string) => (await db.query<{ situacao: string; cliente_id: string | null; destinatario_nome: string | null }>(
  "select situacao, cliente_id, destinatario_nome from public.notas_pedidos where id = $1", [pedido])).rows[0];

describe("corrigir a nota não apaga o destinatário guardado (#87, REV-PROMPT-001)", () => {
  it("a nota no nome do cliente: digitar outro CPF é recusado e nada se perde; com o cadastro corrigido, guarda de novo o destinatário inteiro", async () => {
    const { ana, dono, alfa, pedido } = await preparar();
    const antes = await guardado(pedido);
    expect(antes).toMatchObject({ cliente_id: alfa, endereco: ENDERECO });
    expect(antes?.dados_de).not.toBeNull();
    expect(await doPedido(pedido)).toMatchObject({ cliente_id: alfa });
    await valor(dono, "select public.notas_decidir($1, false, 'Conferir dados antes de emitir') as v", [pedido]);
    // A prova do Codex: corrigir digitando nome e outro CPF apagava cliente, endereço e versão. Agora é recusado.
    expect(await tentar(ana, "select public.notas_corrigir($1, $2::jsonb) as v", [pedido, JSON.stringify({ nome: "Cliente Alfa", documento: cpf("529982201") })]))
      .toMatchObject({ codigo: "22023", mensagem: expect.stringContaining("está no nome do cliente do cadastro") });
    expect(await guardado(pedido)).toEqual(antes);
    // O cadastro é corrigido (o endereço novo) e a nota usa os dados atuais dele: o destinatário inteiro, com a versão nova.
    await valor(ana, "select public.cliente_salvar($1, $2::jsonb, 'Endereço corrigido a pedido do cliente', $3) as v", [alfa, JSON.stringify({
      tipo: "pessoa_fisica", nome: "Cliente Alfa", telefone: "41987000001", documento: cpf("529982201"), finalidades: ["nota_fiscal"], endereco: NOVO_ENDERECO,
    }), chave("cliente")]);
    expect(await valor<boolean>(ana, "select public.notas_corrigir($1, $2::jsonb) as v", [pedido, JSON.stringify({ cliente: alfa })])).toBe(true);
    const depois = await guardado(pedido);
    expect(depois).toMatchObject({ cliente_id: alfa, endereco: NOVO_ENDERECO, documento: antes?.documento });
    expect(Date.parse(String(depois?.dados_de))).toBeGreaterThanOrEqual(Date.parse(String(antes?.dados_de)));
    expect(await doPedido(pedido)).toMatchObject({ situacao: "aguardando_aprovacao", cliente_id: alfa, destinatario_nome: "Cliente Alfa" });
    // Quem emite vê os dados guardados completos (o que a prova encontrava nulo).
    expect(await valor<Record<string, unknown>>(dono, "select public.notas_dados_para_emitir($1) as v", [pedido]))
      .toMatchObject({ cliente: alfa, endereco: NOVO_ENDERECO, nome: "Cliente Alfa" });
    expect((await db.query("select tipo, observacao from public.notas_eventos where pedido_id = $1 and tipo = 'corrigida'", [pedido])).rows)
      .toEqual([{ tipo: "corrigida", observacao: "Com os dados do cadastro do cliente" }]);
  });

  it("só o cliente ligado à venda; a nota digitada à mão continua corrigível à mão, sem inventar cliente nem endereço", async () => {
    const { ana, dono, venda, pedido } = await preparar();
    await valor(dono, "select public.notas_decidir($1, false, 'Conferir dados antes de emitir') as v", [pedido]);
    const beta = await cliente(ana, "Cliente Beta", 2);
    expect(await tentar(ana, "select public.notas_corrigir($1, $2::jsonb) as v", [pedido, JSON.stringify({ cliente: beta })]))
      .toMatchObject({ codigo: "22023", mensagem: "Só o cliente ligado à venda vai na nota por aqui" });
    // Outra venda com a nota digitada (sem cliente do cadastro): corrigir à mão troca nome e documento, sem cliente nem endereço.
    const outra = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [outra, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [outra, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), chave("concluir")]);
    const manual = await valor<string>(ana, "select public.notas_solicitar($1, $2::jsonb, $3) as v", [outra, JSON.stringify({ nome: "Pessoa Digitada", documento: cpf("529982203") }), chave("nota")]);
    await valor(dono, "select public.notas_decidir($1, false, 'Nome errado') as v", [manual]);
    expect(await valor<boolean>(ana, "select public.notas_corrigir($1, $2::jsonb) as v", [manual, JSON.stringify({ nome: "Pessoa Corrigida", documento: cpf("529982204") })])).toBe(true);
    expect(await guardado(manual)).toEqual({ cliente_id: null, endereco: null, dados_de: null, documento: cpf("529982204") });
    expect(await doPedido(manual)).toMatchObject({ situacao: "aguardando_aprovacao", cliente_id: null, destinatario_nome: "Pessoa Corrigida" });
    expect(venda).toBeTruthy();
  });
});

describe("a nota de um cliente não vai ao WhatsApp de outro (#88, REV-PROMPT-002)", () => {
  async function emitidaComPdf(n: Awaited<ReturnType<typeof preparar>>) {
    await valor(n.dono, "select public.notas_registrar_emissao($1, $2, null) as v", [n.pedido, chaveDeAcesso(cnpjA, 1)]);
    const caminho = `${ids.organizacao}/${ids.lojaA}/${n.pedido}/00000000-0000-4000-a000-000000000001.pdf`;
    await comoUsuario(db, n.dono, () => db.query("insert into storage.objects (bucket_id, name, metadata) values ('notas', $1, $2::jsonb)",
      [caminho, JSON.stringify({ size: 50_000, mimetype: "application/pdf" })]), { criarSessao: false });
    await valor(n.dono, "select public.notas_anexar_documento($1, 'pdf', $2, $3, null) as v", [n.pedido, caminho, "c".repeat(64)]);
  }
  const ENVIAR = "select public.nota_enviar_whatsapp($1, $2, null) as v";
  const vincular = (s: Sessao, venda: string, cliente: string) =>
    valor<boolean>(s, "select public.venda_vincular_cliente($1, $2, 'Revisão do vínculo comercial') as v", [venda, cliente]);

  it("trocar o cliente da venda depois da nota: o pedido de envio é recusado e nenhuma fila é criada; de volta ao cliente da nota, vai a ele", async () => {
    const n = await preparar();
    await emitidaComPdf(n);
    const beta = await cliente(n.ana, "Cliente Beta", 2);
    expect(await vincular(n.ana, n.venda, beta)).toBe(true);
    // A prova do Codex: o PDF da Alfa ia para o WhatsApp da Beta. Agora é recusado.
    expect(await tentar(n.ana, ENVIAR, [n.pedido, chave("envio")])).toMatchObject({ codigo: "22023", mensagem: expect.stringContaining("O cliente da venda mudou depois do pedido da nota") });
    expect((await db.query("select count(*)::int as n from public.whatsapp_envios where pedido_id = $1", [n.pedido])).rows).toEqual([{ n: 0 }]);
    expect(await vincular(n.ana, n.venda, n.alfa)).toBe(true);
    const envio = await valor<string>(n.ana, ENVIAR, [n.pedido, chave("envio")]);
    const r = (await db.query<{ cliente_id: string; telefone: string; destinatario_nome: string }>(
      `select e.cliente_id, d.telefone, p.destinatario_nome from public.whatsapp_envios e join public.notas_pedidos p on p.id = e.pedido_id
       join privado.whatsapp_destinos d on d.envio_id = e.id where e.id = $1`, [envio])).rows[0];
    expect(r).toEqual({ cliente_id: n.alfa, telefone: "41987000001", destinatario_nome: "Cliente Alfa" });
  });

  it("o envio já na fila é conferido antes de expedir: cliente da venda trocado ou WhatsApp mudado no cadastro, nada sai e o envio falha com o motivo", async () => {
    const n = await preparar();
    await emitidaComPdf(n);
    const envio = await valor<string>(n.ana, ENVIAR, [n.pedido, chave("envio")]);
    const beta = await cliente(n.ana, "Cliente Beta", 2);
    await vincular(n.ana, n.venda, beta);
    expect(await comoWorker("select * from public.whatsapp_worker_reivindicar(5)")).toEqual([]);
    const falhou = (await db.query<{ situacao: string; erro: string }>("select situacao, erro from public.whatsapp_envios where id = $1", [envio])).rows[0];
    expect(falhou?.situacao).toBe("falhou");
    expect(falhou?.erro).toContain("O destinatário mudou depois do pedido");
    expect((await db.query("select situacao, origem from public.whatsapp_envio_eventos where envio_id = $1 order by id", [envio])).rows)
      .toEqual([{ situacao: "na_fila", origem: "pedido" }, { situacao: "falhou", origem: "worker" }]);
    // De volta à Alfa, um novo pedido (com motivo, porque o anterior terminou) vai; se o WhatsApp do cadastro mudar antes
    // de expedir, também não sai.
    await vincular(n.ana, n.venda, n.alfa);
    const segundo = await valor<string>(n.ana, "select public.nota_enviar_whatsapp($1, $2, 'Cliente da venda corrigido') as v", [n.pedido, chave("envio")]);
    await valor(n.ana, "select public.cliente_salvar($1, $2::jsonb, 'Cliente trocou de número', $3) as v", [n.alfa, JSON.stringify({
      tipo: "pessoa_fisica", nome: "Cliente Alfa", telefone: "41987009999", documento: cpf("529982201"), finalidades: ["nota_fiscal"], endereco: ENDERECO,
    }), chave("cliente")]);
    expect(await comoWorker("select * from public.whatsapp_worker_reivindicar(5)")).toEqual([]);
    expect((await db.query("select situacao from public.whatsapp_envios where id = $1", [segundo])).rows).toEqual([{ situacao: "falhou" }]);
    // Com tudo conferindo (um terceiro pedido, com o número novo), o worker pega e o destino é o da Alfa.
    const terceiro = await valor<string>(n.ana, "select public.nota_enviar_whatsapp($1, $2, 'Número novo do cliente') as v", [n.pedido, chave("envio")]);
    const pegos = await comoWorker<{ envio_id: string; telefone: string; cliente_nome: string }>("select envio_id, telefone, cliente_nome from public.whatsapp_worker_reivindicar(5)");
    expect(pegos).toEqual([{ envio_id: terceiro, telefone: "41987009999", cliente_nome: "Cliente Alfa" }]);
  });

  it("nota pedida sem o cliente na venda não vai pelo WhatsApp, nem se ligarem um cliente depois", async () => {
    const ana = await naLoja(ids.vendedorA);
    const dono = await naLoja(ids.dono);
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), chave("concluir")]);
    const pedido = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [venda, chave("nota")]);
    expect(await doPedido(pedido)).toMatchObject({ cliente_id: null });
    await emitidaComPdf({ ana, dono, alfa: "", venda, pedido });
    await vincular(ana, venda, await cliente(ana, "Cliente Gama", 3));
    expect(await tentar(ana, ENVIAR, [pedido, chave("envio")])).toMatchObject({ codigo: "22023", mensagem: expect.stringContaining("A nota foi pedida sem o cliente da rede na venda") });
  });
});
