// Ora Connect de ponta a ponta SEM credencial real (cenários F e G): banco com todas as migrations
// (PGlite), a loja registrando como a pessoa logada, o worker de verdade (pedido, transporte HTTP,
// token, leitura da resposta e da evidência) e um servidor local que responde com os EXEMPLOS DA
// DOCUMENTAÇÃO OFICIAL da Nogle. Prova o fluxo; não prova a Contel (isso é a homologação).
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import type { PGlite } from "@electric-sql/pglite";
import { comoUsuario, criarBanco, type Sessao } from "@ora5g/banco/src/banco-de-teste.ts";
import { ids, montarCenario } from "@ora5g/banco/src/cenario.ts";
import { cat, itens, montarCatalogo } from "@ora5g/banco/src/cenario-catalogo.ts";
import type { OperacaoParaConsultar, OperacaoParaEnviar, TipoOperacao } from "@ora5g/dominio/nogle";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClienteNogle } from "./cliente-nogle.ts";
import { consultarPendentes, enviarPendentes, sincronizarReferencias, type BancoConnect } from "./processar.ts";
import { transporteHttp } from "./transporte.ts";

type Funcao = { request: { method: string; url: string | { raw?: string } }; response?: { body?: string }[] };
type Grupo = { item?: (Grupo | Funcao)[] };
const COLECAO = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../docs/integracoes/nogle/colecao-postman-2026-11-07.json", import.meta.url)), "utf8")) as Grupo;
const todas = (g: Grupo): Funcao[] => (g.item ?? []).flatMap((i) => ("item" in i ? todas(i as Grupo) : [i as Funcao]));
const exemplo = (caminho: string, indice = 0) => {
  const f = todas(COLECAO).find((x) => (typeof x.request.url === "string" ? x.request.url : x.request.url.raw ?? "").endsWith(caminho));
  return JSON.parse(f?.response?.[indice]?.body ?? "null") as Record<string, unknown>;
};

const TIPOS: TipoOperacao[] = ["ativacao", "recarga", "portabilidade"];
let db: PGlite;
let servidor: Server;
let base = "";
let logins = 0;
let expirouUmaVez = false;
const recebidos: { metodo: string; caminho: string; corpo: string }[] = [];

beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  servidor = createServer((req, res) => {
    let corpo = "";
    req.on("data", (parte: Buffer) => { corpo += parte.toString("utf8"); });
    req.on("end", () => {
      const caminho = req.url ?? "";
      recebidos.push({ metodo: req.method ?? "", caminho, corpo });
      const json = (status: number, dados: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(dados)); };
      if (caminho === "/auth/token") return json(200, { retorno: true, mensagem: "", token: `tk-${++logins}` });
      if (!req.headers.authorization?.startsWith("Bearer tk-")) return json(401, { message: "Unauthenticated." });
      if (caminho === "/ativacao/solicitar" && !expirouUmaVez) { expirouUmaVez = true; return json(401, { message: "Token expirado." }); }
      if (caminho === "/ativacao/solicitar") return json(200, exemplo("/ativacao/solicitar"));
      // Exemplo oficial da recarga, com a data de cadastro do exemplo oficial do histórico (para casar).
      if (caminho === "/recarga/solicitar") {
        const r = exemplo("/recarga/solicitar");
        return json(200, { ...r, recarga: { ...(r.recarga as object), data_cadastro: "2022-06-15 11:59:34.553" } });
      }
      if (caminho === "/portabilidade/solicitar") return; // não responde: tempo esgotado depois do envio
      if (caminho === "/ativacao/validaIccid") return json(200, { ...exemplo("/ativacao/validaIccid"), codigo: 11, info: "ICCID ativo.", linha: "51900000000" });
      if (caminho === "/linhas/historico") return json(200, exemplo("/linhas/historico"));
      if (caminho === "/portabilidade/status") return json(200, { retorno: true, mensagem: "", status: { status: "Sucesso", data_sucesso: "2022-06-08" } });
      if (caminho === "/planos") return json(200, exemplo("/planos"));
      if (caminho === "/ddds") return json(200, exemplo("/ddds"));
      if (caminho === "/portabilidade/operadorasDisponiveis") return json(200, exemplo("/portabilidade/operadorasDisponiveis"));
      if (caminho === "/cidades/RS") return json(200, exemplo("/cidades/UF"));
      return json(404, { erro: "Endpoint inexistente ou recurso não encontrato." });
    });
  });
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", () => pronto()));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  servidor.closeAllConnections();
  await new Promise<void>((pronto) => servidor.close(() => pronto()));
  await db.close();
});

// As funções connect_worker_* como o worker as chama (service_role), sobre o PGlite.
const comoServico = async <T>(acao: () => Promise<T>) => {
  await db.exec("set role service_role");
  try { return await acao(); } finally { await db.exec("reset role"); }
};
const banco: BancoConnect = {
  reivindicarEnvios: (tipos, limite) => comoServico(async () => (await db.query<OperacaoParaEnviar>(
    "select * from public.connect_worker_reivindicar_envios($1, $2::text[], $3)", [ids.organizacao, `{${tipos.join(",")}}`, limite])).rows),
  registrarEnvio: (op, r) => comoServico(async () => (await db.query<{ v: string }>(
    "select public.connect_worker_registrar_envio($1, $2::jsonb) as v", [op, JSON.stringify(r)])).rows[0]?.v ?? ""),
  operacoesAConsultar: (tipos, limite) => comoServico(async () => (await db.query<OperacaoParaConsultar>(
    "select * from public.connect_worker_operacoes_a_consultar($1, $2::text[], $3)", [ids.organizacao, `{${tipos.join(",")}}`, limite])).rows),
  registrarConsulta: (op, e) => comoServico(async () => (await db.query<{ v: string }>(
    "select public.connect_worker_registrar_consulta($1, $2::jsonb) as v", [op, JSON.stringify(e)])).rows[0]?.v ?? ""),
  atualizarReferencias: (tipo, lista) => comoServico(async () => (await db.query<{ v: number }>(
    "select public.connect_worker_atualizar_referencias($1, $2, $3::jsonb) as v", [ids.organizacao, tipo, JSON.stringify(lista)])).rows[0]?.v ?? 0),
};

let sessoes = 0;
const naLoja = async (usuario: string, unidade: string): Promise<Sessao> => {
  const s = { usuario, sessao: `47000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
};
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const vencerEspera = () => db.query("update public.connect_operacoes set proxima_consulta_em = now() - interval '1 second' where proxima_consulta_em is not null");
const operacao = async (id: string) => (await db.query<Record<string, unknown>>(
  "select situacao, id_externo, numero_ativado, valor_debitado_centavos, link_pagamento from public.connect_operacoes where id = $1", [id])).rows[0];

describe("Ora Connect de ponta a ponta com o formato oficial (sem credencial real)", () => {
  it("listas, venda do chip, ativação, recarga SALDO e portabilidade: confirma só com evidência, sem reenviar o desconhecido", async () => {
    const admin = await naLoja(ids.administrador, ids.lojaA);
    for (const tipo of TIPOS) await valor(admin, "select public.connect_habilitar($1, true, 'Homologação simulada com o formato oficial') as v", [tipo]);
    const nogle = new ClienteNogle({ tipo: "marca", chaveAcesso: "chave-ficticia" }, transporteHttp(base, 500), { getComCorpo: false });

    // Listas oficiais pelo worker: o plano e o valor de face vêm da Contel, não da tela.
    const listas = await sincronizarReferencias(banco, nogle, ["RS"]);
    expect(listas).toMatchObject({ listas: 4, falhas: 0 });
    expect((await db.query("select codigo, nome, valor_centavos from public.connect_referencias where tipo = 'plano'")).rows)
      .toEqual([{ codigo: "99999", nome: "7 GB", valor_centavos: 4490 }]);

    // A loja vende o chip e a recarga (SALDO = cliente paga na loja) e registra as operações.
    await db.query(`insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem)
      values ($1, $2, null, 1000, now() - interval '1 day', 'manual'), ($1, $3, null, 4990, now() - interval '1 day', 'manual')`, [ids.organizacao, cat.chip, cat.recarga]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, 'e2e:caixa') as v");
    const venda = await valor<string>(ana, "select public.criar_venda('e2e:venda') as v");
    await valor(ana, "select public.adicionar_item($1, $2, $3, 1, 'e2e:chip') as v", [venda, cat.chip, itens.chipA]);
    const servicoPago = await valor<string>(ana, "select public.adicionar_item($1, $2, null, 1, 'e2e:recarga') as v", [venda, cat.recarga]);
    await valor(ana, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":5990}]'::jsonb, '{}'::jsonb, 'e2e:concluir') as v", [venda]);
    const registrar = (tipo: string, pedido: object, k: string) => valor<string>(ana, "select public.connect_registrar($1, $2::jsonb, $3) as v", [tipo, JSON.stringify(pedido), k]);
    const ativacao = await registrar("ativacao", {
      metodo: "LINK", iccid: cat.iccid1, ddd: 51, plano: 99999,
      cliente: { nome: "Cliente Fictício da Silva", cpf: "12345678909", data_nascimento: "1990-05-20", endereco: { rua: "Rua Exemplo", numero: "123", bairro: "Centro", cep: "90000000", id_cidade: 7703 } },
    }, "e2e:ativacao");
    const recarga = await registrar("recarga", { linha: "51988887777", plano: 99999, metodo: "SALDO", venda_item: servicoPago }, "e2e:recarga");
    const portabilidade = await registrar("portabilidade", { linha: "51900000001", linha_doadora: "51911112222", operadora: 41 }, "e2e:portabilidade");

    // Envio: token vencido renova uma vez; a portabilidade fica sem resposta → desconhecida.
    expect(await enviarPendentes(banco, nogle, TIPOS)).toEqual({ aceitas: 2, recusadas: 0, desconhecidas: 1, devolvidas: 0 });
    expect(logins).toBe(2);
    expect(await operacao(ativacao)).toMatchObject({ situacao: "aguardando_operadora", id_externo: "99999", link_pagamento: "link de pagamento" });
    expect(await operacao(portabilidade)).toMatchObject({ situacao: "resultado_desconhecido" });
    const pedidoDeAtivacao = JSON.parse(recebidos.find((r) => r.caminho === "/ativacao/solicitar" && r.corpo)?.corpo ?? "{}") as Record<string, unknown>;
    expect(pedidoDeAtivacao).toMatchObject({ metodo_pagamento: "LINK", cpf: "12345678909", chips: [{ iccid: cat.iccid1, id_plano: 99999, ddd: 51 }] });

    // Consulta com o GET com corpo ainda bloqueado: só a ativação (POST validaIccid) confirma.
    await vencerEspera();
    expect(await consultarPendentes(banco, nogle, TIPOS)).toEqual({ consultadas: 3, confirmadas: 1, bloqueadas: 2, falhas: 0 });
    expect(await operacao(ativacao)).toMatchObject({ situacao: "confirmada", numero_ativado: "51900000000" });

    // Contel confirma o GET com corpo: a recarga casa no histórico e o débito da carteira aparece;
    // a portabilidade desconhecida ganha evidência de "Sucesso", mas continua com a gerência.
    const liberado = new ClienteNogle({ tipo: "marca", chaveAcesso: "chave-ficticia" }, transporteHttp(base, 500), { getComCorpo: true });
    await vencerEspera();
    expect(await consultarPendentes(banco, liberado, TIPOS)).toEqual({ consultadas: 2, confirmadas: 1, bloqueadas: 0, falhas: 0 });
    expect(await operacao(recarga)).toMatchObject({ situacao: "confirmada", valor_debitado_centavos: 4490 });
    expect(await operacao(portabilidade)).toMatchObject({ situacao: "resultado_desconhecido" });
    expect(JSON.parse(recebidos.find((r) => r.caminho === "/linhas/historico")?.corpo ?? "{}")).toEqual({ numero: "51988887777" });

    // Nada é reenviado: a portabilidade saiu uma vez só, mesmo com novos ciclos.
    expect(await enviarPendentes(banco, liberado, TIPOS)).toEqual({ aceitas: 0, recusadas: 0, desconhecidas: 0, devolvidas: 0 });
    expect(recebidos.filter((r) => r.caminho === "/portabilidade/solicitar")).toHaveLength(1);

    // Produção: uma por operação confirmada, do vendedor e da loja de origem.
    expect((await db.query("select tipo, vendedor_id, origem from public.connect_producao order by tipo")).rows).toEqual([
      { tipo: "ativacao", vendedor_id: ids.vendedorA, origem: "evidencia_da_operadora" },
      { tipo: "recarga", vendedor_id: ids.vendedorA, origem: "evidencia_da_operadora" },
    ]);
    // Dado pessoal só foi à Contel: nada dele nos eventos, e os dados de envio foram apagados.
    expect((await db.query("select 1 from public.connect_eventos where coalesce(dados::text, '') || coalesce(mensagem, '') like '%12345678909%'")).rows).toEqual([]);
    expect((await db.query("select 1 from privado.connect_dados_envio")).rows).toEqual([]);
  });
});
