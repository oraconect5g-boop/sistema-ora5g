import {readFileSync, appendFileSync} from "node:fs";
// #101: prova de backfill legado; apenas dados fictícios em banco descartável.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, cpf, criarBanco, type Sessao } from "../../../../packages/banco/src/banco-de-teste";
import { ids, montarCenario } from "../../../../packages/banco/src/cenario";
import { cat, montarCatalogo } from "../../../../packages/banco/src/cenario-catalogo";

let db: PGlite;
let cnpjA = "";
beforeAll(async () => {
  db = await criarBanco({ antesDe: "20261116095825" });
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


  it("REV-NOVO: a migração atribui ao cliente atual uma nota antiga de outro destinatário", async () => {
    const n = await preparar();
    await emitidaComPdf(n);
    const beta = await cliente(n.ana, "Cliente Beta", 2);
    await vincular(n.ana, n.venda, beta);
    expect(await guardado(n.pedido)).toBeUndefined();
    await db.exec(readFileSync(new URL("../../../../packages/banco/supabase/migrations/20261116095825_destinatario_fiscal_integro.sql",import.meta.url),"utf8"));
    const envio = await valor<string>(n.ana, ENVIAR, [n.pedido, chave("envio-legado")]);
    const fato = (await db.query<{ destinatario_nome: string; telefone: string; atribuido_ao_cliente_atual: boolean }>(
      "select p.destinatario_nome,d.telefone,e.cliente_id=$2::uuid as atribuido_ao_cliente_atual from public.whatsapp_envios e join public.notas_pedidos p on p.id=e.pedido_id join privado.whatsapp_destinos d on d.envio_id=e.id where e.id=$1",[envio,beta])).rows[0];
    expect(fato).toEqual({destinatario_nome:"Cliente Alfa",telefone:"41987000002",atribuido_ao_cliente_atual:true});
    appendFileSync(new URL("./prova-legado.jsonl",import.meta.url),JSON.stringify({prova:"backfill legado",documento_cliente:"Alfa",destino_cliente:"Beta",reproduzido:true})+"\n");
  });

