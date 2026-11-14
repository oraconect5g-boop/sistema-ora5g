// Envio da nota ao cliente pelo WhatsApp oficial (lote K1c; #76, decisão do proprietário de 12/11/2026): a fila, os
// estados e a idempotência no banco. O worker real (credenciais da Meta) não existe ainda: aqui ele é o papel
// service_role chamando as funções dele. Banco em memória com todas as migrations; dados FICTÍCIOS.
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
const chave = (p: string) => `k1c:${p}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `7c100000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string; mensagem: string }> {
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
  });
}
async function valor<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const codigo = async (s: Sessao | null, sql: string, params: unknown[] = []) => { const r = await tentar(s, sql, params); return "codigo" in r ? r.codigo : null; };
// O worker: o papel service_role, sem sessão de usuário.
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

const ENVIAR = "select public.nota_enviar_whatsapp($1, $2, $3) as v";
const envio = async (id: string) => (await db.query<Record<string, unknown>>(
  "select situacao, tentativas, provedor_id, destino_mascarado, motivo, erro from public.whatsapp_envios where id = $1", [id])).rows[0];
const eventos = async (id: string) => (await db.query<{ situacao: string; origem: string }>("select situacao, origem from public.whatsapp_envio_eventos where envio_id = $1 order by id", [id])).rows.map((e) => `${e.situacao}/${e.origem}`);

/** Venda da Ana com a cliente Carla (WhatsApp no cadastro), nota emitida pelo dono e o PDF guardado. */
async function notaEmitida(numero: number, opcoes: { comPdf?: boolean; cliente?: "com_whatsapp" | "sem_cliente" } = {}) {
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  const dono = await naLoja(ids.dono, ids.lojaA);
  await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]).catch(() => undefined);
  const carla = (await valor<{ id: string }>(ana, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v",
    [JSON.stringify({ tipo: "pessoa_fisica", nome: "Carla Cliente", documento: cpf(String(529982200 + numero)), telefone: `4198765${String(numero).padStart(4, "0")}` }), chave("cli")])).id;
  const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(ana, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
    [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), JSON.stringify(opcoes.cliente === "sem_cliente" ? {} : { id: carla }), chave("concluir")]);
  const pedido = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [venda, chave("nota")]);
  await valor(dono, "select public.notas_registrar_emissao($1, $2, null) as v", [pedido, chaveDeAcesso(cnpjA, numero)]);
  if (opcoes.comPdf !== false) {
    const caminho = `${ids.organizacao}/${ids.lojaA}/${pedido}/00000000-0000-4000-a000-${String(numero).padStart(12, "0")}.pdf`;
    await comoUsuario(db, dono, () => db.query("insert into storage.objects (bucket_id, name, metadata) values ('notas', $1, $2)", [caminho, JSON.stringify({ size: 50_000, mimetype: "application/pdf" })]));
    await valor(dono, "select public.notas_anexar_documento($1, 'pdf', $2, $3, null) as v", [pedido, caminho, "c".repeat(64)]);
  }
  return { ana, dono, carla, venda, pedido };
}

describe("envio da nota pelo WhatsApp: o pedido (K1c)", () => {
  it("a vendedora pede; o destino fica mascarado e o número só no privado; repetir ou pedir de novo na fila não duplica", async () => {
    const n = await notaEmitida(801);
    const id = await valor<string>(n.ana, ENVIAR, [n.pedido, "form:envio:0001", null]);
    expect(await envio(id)).toEqual({ situacao: "na_fila", tentativas: 0, provedor_id: null, destino_mascarado: "(41) •••••-0801", motivo: null, erro: null });
    expect((await db.query("select telefone from privado.whatsapp_destinos where envio_id = $1", [id])).rows[0]).toEqual({ telefone: "41987650801" });
    expect(await valor<string>(n.ana, ENVIAR, [n.pedido, "form:envio:0001", null])).toBe(id); // a mesma chave
    expect(await valor<string>(n.dono, ENVIAR, [n.pedido, "form:envio:0002", null])).toBe(id); // outro clique com o envio na fila
    expect(await eventos(id)).toEqual(["na_fila/pedido"]);
    // Ninguém da loja lê o número completo; a vendedora acompanha o envio da própria venda; outra loja não.
    expect(await codigo(n.ana, "select telefone from privado.whatsapp_destinos")).toBe("42501");
    expect((await comoUsuario(db, n.ana, async () => (await db.query("select id from public.whatsapp_envios")).rows)).length).toBe(1);
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect((await comoUsuario(db, gerenteB, async () => (await db.query("select id from public.whatsapp_envios")).rows)).length).toBe(0);
  });

  it("só nota emitida, com o PDF guardado, cliente ligado com WhatsApp; outra loja e outro vendedor não pedem", async () => {
    const semPdf = await notaEmitida(802, { comPdf: false });
    expect(await tentar(semPdf.ana, ENVIAR, [semPdf.pedido, chave("envio"), null])).toMatchObject({ codigo: "22023", mensagem: "Guarde o PDF da nota antes de enviar pelo WhatsApp" });
    const semCliente = await notaEmitida(803, { cliente: "sem_cliente" });
    expect(await tentar(semCliente.ana, ENVIAR, [semCliente.pedido, chave("envio"), null])).toMatchObject({ codigo: "22023", mensagem: "Ligue a venda ao cliente da rede antes de enviar a nota pelo WhatsApp" });
    const n = await notaEmitida(804);
    // Cadastro antigo sem WhatsApp (o número tirado à força, como os anteriores ao #76).
    await db.exec("set session_replication_role = replica");
    await db.query("update privado.cliente_dados set telefone = null where cliente_id = $1", [n.carla]);
    await db.exec("set session_replication_role = origin");
    expect(await tentar(n.ana, ENVIAR, [n.pedido, chave("envio"), null])).toMatchObject({ codigo: "22023", mensagem: "O cliente da venda não tem WhatsApp no cadastro: complete o cadastro" });
    const outroVendedor = await naLoja(ids.vendedorAB, ids.lojaA);
    expect(await codigo(outroVendedor, ENVIAR, [n.pedido, chave("envio"), null])).toBe("P0002");
    expect(await codigo(await naLoja(ids.gerenteB, ids.lojaB), ENVIAR, [n.pedido, chave("envio"), null])).toBe("P0002");
    // Nota ainda não emitida.
    const pendente = await valor<string>(n.ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v",
      [await (async () => { const v = await valor<string>(n.ana, "select public.criar_venda($1) as v", [chave("venda")]); await valor(n.ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [v, cat.capa, chave("item")]); await valor(n.ana, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v", [v, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), JSON.stringify({ id: n.carla }), chave("concluir")]); return v; })(), chave("nota")]);
    expect(await tentar(n.ana, ENVIAR, [pendente, chave("envio"), null])).toMatchObject({ codigo: "22023", mensagem: "Só a nota emitida vai ao cliente pelo WhatsApp" });
  });
});

describe("envio da nota pelo WhatsApp: o worker e os avisos da Meta (K1c)", () => {
  it("pega a fila uma vez, registra a resposta, e os avisos de entrega e leitura entram uma vez, sem voltar estado", async () => {
    const n = await notaEmitida(805);
    const id = await valor<string>(n.ana, ENVIAR, [n.pedido, chave("envio"), null]);
    const pegos = await comoWorker<{ envio_id: string; telefone: string; documento_caminho: string; chave_acesso: string; cliente_nome: string }>("select * from public.whatsapp_worker_reivindicar(5)");
    expect(pegos).toHaveLength(1);
    expect(pegos[0]).toMatchObject({ envio_id: id, telefone: "41987650805", cliente_nome: "Carla Cliente" });
    expect(pegos[0]?.documento_caminho).toMatch(/\.pdf$/);
    expect(await comoWorker("select * from public.whatsapp_worker_reivindicar(5)")).toHaveLength(0); // já está enviando
    expect(await envio(id)).toMatchObject({ situacao: "enviando", tentativas: 1 });
    const resultado = (r: object) => comoWorker<{ v: string }>("select public.whatsapp_worker_resultado($1, $2::jsonb) as v", [id, JSON.stringify(r)]);
    expect((await resultado({ situacao: "aceito", provedor_id: "wamid.FICTICIO.1" }))[0]?.v).toBe("aceito");
    expect((await resultado({ situacao: "aceito", provedor_id: "wamid.FICTICIO.1" }))[0]?.v).toBe("aceito"); // repetição
    await expect(resultado({ situacao: "falhou", erro: "x" })).rejects.toThrow();
    const aviso = async (status: string) => (await comoWorker<{ v: boolean }>("select public.whatsapp_aviso_de_status($1, $2, null) as v", ["wamid.FICTICIO.1", status]))[0]?.v;
    expect(await aviso("sent")).toBe(false);
    expect(await aviso("delivered")).toBe(true);
    expect(await aviso("delivered")).toBe(false); // repetido
    expect(await aviso("read")).toBe(true);
    expect(await aviso("delivered")).toBe(false); // fora de ordem: não volta
    expect(await aviso("failed")).toBe(false); // depois de entregue não falha
    expect((await comoWorker<{ v: boolean }>("select public.whatsapp_aviso_de_status('wamid.DE.OUTRO', 'read', null) as v"))[0]?.v).toBe(false);
    expect(await envio(id)).toMatchObject({ situacao: "lido", provedor_id: "wamid.FICTICIO.1" });
    expect(await eventos(id)).toEqual(["na_fila/pedido", "enviando/worker", "aceito/worker", "entregue/aviso", "lido/aviso"]);
    // Quem é da loja não chama as funções do worker.
    expect(await codigo(n.dono, "select public.whatsapp_worker_reivindicar(5)")).toBe("42501");
    expect(await codigo(n.dono, "select public.whatsapp_aviso_de_status('wamid.FICTICIO.1', 'read', null)")).toBe("42501");
  });

  it("reenviar pede motivo e cria outro envio; envio parado vira desconhecido, que espera a conferência da gerência", async () => {
    const n = await notaEmitida(806);
    const primeiro = await valor<string>(n.ana, ENVIAR, [n.pedido, chave("envio"), null]);
    await comoWorker("select * from public.whatsapp_worker_reivindicar(5)");
    await comoWorker("select public.whatsapp_worker_resultado($1, $2::jsonb)", [primeiro, JSON.stringify({ situacao: "falhou", erro: "Número sem WhatsApp (fictício)" })]);
    expect(await tentar(n.ana, ENVIAR, [n.pedido, chave("envio"), null])).toMatchObject({ codigo: "22023", mensagem: "Para reenviar a nota, informe o motivo (de 3 a 200 letras)" });
    const segundo = await valor<string>(n.ana, ENVIAR, [n.pedido, chave("envio"), "Cliente corrigiu o número"]);
    expect(segundo).not.toBe(primeiro);
    expect(await envio(segundo)).toMatchObject({ situacao: "na_fila", motivo: "Cliente corrigiu o número" });
    // O worker pega e para no meio (sem registrar): passados 5 minutos, a próxima rodada marca desconhecido.
    await comoWorker("select * from public.whatsapp_worker_reivindicar(5)");
    await db.query("update public.whatsapp_envios set enviando_desde = now() - interval '6 minutes' where id = $1", [segundo]);
    await comoWorker("select * from public.whatsapp_worker_reivindicar(5)");
    expect(await envio(segundo)).toMatchObject({ situacao: "desconhecido" });
    expect(await tentar(n.ana, ENVIAR, [n.pedido, chave("envio"), "De novo"])).toMatchObject({ codigo: "22023", mensagem: "O último envio está com resultado desconhecido: aguarde a conferência com o WhatsApp antes de reenviar" });
    // A vendedora não confere; quem aprova a nota, sim, e só pode concluir "não chegou".
    expect(await codigo(n.ana, "select public.whatsapp_envio_resolver($1, 'Cliente disse que não chegou')", [segundo])).toBe("P0002");
    expect(await valor<boolean>(n.dono, "select public.whatsapp_envio_resolver($1, 'Cliente disse que não chegou') as v", [segundo])).toBe(true);
    expect(await envio(segundo)).toMatchObject({ situacao: "falhou", erro: "Conferido pela loja: Cliente disse que não chegou" });
    expect(await valor<string>(n.ana, ENVIAR, [n.pedido, chave("envio"), "Reenvio depois da conferência"])).toMatch(/^[0-9a-f-]{36}$/);
  });
});
