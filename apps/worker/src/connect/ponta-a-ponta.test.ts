// Ora Connect de ponta a ponta SEM credencial real (cenários F e G): banco com todas as migrations
// (PGlite), a loja registrando como a pessoa logada, o worker de verdade (pedido, transporte HTTP,
// token, leitura da resposta e da evidência) e um servidor local que responde com os EXEMPLOS DA
// DOCUMENTAÇÃO OFICIAL da Nogle. Prova o fluxo; não prova a Nogle (isso é a homologação).
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import type { PGlite } from "@electric-sql/pglite";
import { comoUsuario, criarBanco, type Sessao } from "@ora5g/banco/src/banco-de-teste.ts";
import { ids, montarCenario } from "@ora5g/banco/src/cenario.ts";
import { cat, itens, montarCatalogo } from "@ora5g/banco/src/cenario-catalogo.ts";
import type { OperacaoParaConsultar, OperacaoParaEnviar, TipoOperacao, TransferenciaParaEnviar } from "@ora5g/dominio/nogle";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClienteNogle } from "./cliente-nogle.ts";
import {
  conciliarRelatorios, consultarPendentes, enviarPendentes, enviarTransferencias, lerEstoqueDeChips, sincronizarReferencias, type BancoConnect,
  type ChipsNoEstoque, type PlanosNoCaixa,
} from "./processar.ts";
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
// CONNECT-d: chips FICTÍCIOS, na forma conferida na API de verdade em 24/11 (o físico com o dígito verificador certo: ele
// entra no estoque da loja no CONNECT-f).
const CHIP_LOJA = "8955170110000000016";
const CHIP_MVNO = "8955170110000000037";
// CONNECT-e: o estoque do PDV 5216 no servidor simulado muda com a transferência (o eSIM da MVNO chega nele).
const estoqueDaLoja: { id: string; iccid: string; data_repasse: string | null; tipo: string }[] = [
  { id: "2", iccid: CHIP_LOJA, data_repasse: "2022-03-21 22:31:23.580", tipo: "físico" },
];
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
      // CONNECT-c: o relatório oficial na primeira página; a segunda vem vazia (o fim).
      if (caminho === "/relatorios/ativacoes" || caminho === "/relatorios/recargas") {
        const pagina = (JSON.parse(corpo || "{}") as { page?: number }).page;
        return json(200, pagina === 1 ? exemplo(caminho) : { data: [] });
      }
      // CONNECT-d: o estoque de chips na forma conferida na API de verdade em 24/11 (valores fictícios, com os campos que o
      // worker precisa deixar de fora: o CPF, os usuários do PDV e o código de ativação do eSIM).
      if (caminho === "/pdv/listar") {
        return json(200, { pdvs: [{ id: "5216", nome: "LOJA A (teste)", cidade: "Curitiba", uf: "PR        ", estoque_minimo_chips: "10", cpf: "00000000191",
          usuarios: [{ id: "1", nome: "Pessoa (teste)", email: "pessoa@teste.invalid" }] }] });
      }
      if (caminho === "/linhas/estoque") {
        // Como a Nogle de verdade: a lista da MVNO traz o estoque virgem inteiro, inclusive o chip que já está no PDV.
        return json(200, { retorno: true, mensagem: "", total: 2, data: [
          { id: "1", iccid: CHIP_MVNO, tipo: "eSIM", activation_code_esim: "LPA:1$teste.invalid$X" },
          { id: "2", iccid: CHIP_LOJA, tipo: "físico", activation_code_esim: "" },
        ] });
      }
      if (caminho === "/pdv/estoque") {
        const id = (JSON.parse(corpo || "{}") as { id?: number }).id;
        return json(200, id === 5216 ? { total: estoqueDaLoja.length, data: estoqueDaLoja } : { total: 0, data: [] });
      }
      // CONNECT-e: a transferência de 1 eSIM para o PDV 5216 responde como o exemplo oficial e muda o estoque dele.
      if (caminho === "/pdv/transferir-chip-esim") {
        const pedido = JSON.parse(corpo || "{}") as { id?: number; quantidade?: number };
        if (pedido.id !== 5216 || pedido.quantidade !== 1) return json(422, { message: "Pedido inesperado no teste." });
        estoqueDaLoja.push({ id: "3", iccid: CHIP_MVNO, data_repasse: null, tipo: "eSIM" });
        return json(200, exemplo("/pdv/transferir-chip-esim"));
      }
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
  registrarConciliacao: (relatorio, de, ate, linhas) => comoServico(async () => (await db.query<{ v: { numero: number; totais: Record<string, number> } }>(
    "select public.connect_worker_registrar_conciliacao($1, $2, $3, $4, $5::jsonb) as v", [ids.organizacao, relatorio, de, ate, JSON.stringify(linhas)])).rows[0]?.v
    ?? { numero: 0, totais: {} }),
  gravarEstoque: (leitura) => comoServico(async () => {
    const v = (await db.query<{ v: Awaited<ReturnType<BancoConnect["gravarEstoque"]>> }>(
      "select public.connect_worker_gravar_estoque($1, $2::jsonb) as v", [ids.organizacao, JSON.stringify(leitura)])).rows[0]?.v;
    if (!v) throw new Error("o banco não respondeu a leitura");
    return v;
  }),
  transferenciasAEnviar: (limite) => comoServico(async () => (await db.query<TransferenciaParaEnviar>(
    "select * from public.connect_worker_transferencias_a_enviar($1, $2)", [ids.organizacao, limite])).rows),
  registrarTransferencia: (transferencia, resultado) => comoServico(async () => (await db.query<{ v: string }>(
    "select public.connect_worker_registrar_transferencia($1, $2::jsonb) as v", [transferencia, JSON.stringify(resultado)])).rows[0]?.v ?? ""),
  planosNoCaixa: () => comoServico(async () => umValor((await db.query<{ v: PlanosNoCaixa }>(
    "select public.connect_worker_planos_no_caixa($1) as v", [ids.organizacao])).rows[0]?.v)),
  chipsNoEstoque: () => comoServico(async () => umValor((await db.query<{ v: ChipsNoEstoque }>(
    "select public.connect_worker_chips_no_estoque($1) as v", [ids.organizacao])).rows[0]?.v)),
};
function umValor<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("o banco não respondeu");
  return v;
}

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
  `select o.situacao, o.id_externo, o.numero_ativado, c.valor_debitado_centavos, o.link_pagamento
   from public.connect_operacoes o left join public.connect_operacoes_custos c on c.operacao_id = o.id where o.id = $1`, [id])).rows[0];

describe("Ora Connect de ponta a ponta com o formato oficial (sem credencial real)", () => {
  it("listas, venda do chip, ativação, recarga SALDO e portabilidade: confirma só com evidência, sem reenviar o desconhecido", async () => {
    const admin = await naLoja(ids.administrador, ids.lojaA);
    for (const tipo of TIPOS) await valor(admin, "select public.connect_habilitar($1, true, 'Homologação simulada com o formato oficial') as v", [tipo]);
    const nogle = new ClienteNogle({ tipo: "marca", chaveAcesso: "chave-ficticia" }, transporteHttp(base, 500), { getComCorpo: false });

    // Listas oficiais pelo worker: o plano e o valor de face vêm da Nogle, não da tela. Com os planos em dia, o caixa vende
    // cada um pelo valor de face (CONNECT-f): a recarga do cenário já é a do plano 99999 (REC-99999) e ganha o preço; a
    // ativação do plano (ATV-99999) é criada.
    const listas = await sincronizarReferencias(banco, nogle, ["RS"]);
    expect(listas).toMatchObject({ listas: 4, falhas: 0, caixa: { criadas: 1, precos: 2, desativadas: 0 } });
    expect((await db.query("select codigo, nome, valor_centavos from public.connect_referencias where tipo = 'plano'")).rows)
      .toEqual([{ codigo: "99999", nome: "7 GB", valor_centavos: 4490 }]);
    const recargaDoPlano = (await db.query<{ id: string }>(
      "select id from public.variantes where organizacao_id = $1 and sku = 'REC-99999' and ativa", [ids.organizacao])).rows[0]?.id;

    // A loja vende o chip e a recarga do plano, pelo valor de face (SALDO = cliente paga na loja), e registra as operações.
    await db.query(`insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem)
      values ($1, $2, null, 1000, now() - interval '1 day', 'manual')`, [ids.organizacao, cat.chip]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(10000, 'e2e:caixa') as v");
    const venda = await valor<string>(ana, "select public.criar_venda('e2e:venda') as v");
    await valor(ana, "select public.adicionar_item($1, $2, $3, 1, 'e2e:chip') as v", [venda, cat.chip, itens.chipA]);
    const servicoPago = await valor<string>(ana, "select public.adicionar_item($1, $2, null, 1, 'e2e:recarga') as v", [venda, recargaDoPlano]);
    await valor(ana, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":5490}]'::jsonb, '{}'::jsonb, 'e2e:concluir') as v", [venda]);
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

    // Nogle confirma o GET com corpo: a recarga casa no histórico e o débito da carteira aparece;
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
    // Dado pessoal só foi à Nogle: nada dele nos eventos, e os dados de envio foram apagados.
    expect((await db.query("select 1 from public.connect_eventos where coalesce(dados::text, '') || coalesce(mensagem, '') like '%12345678909%'")).rows).toEqual([]);
    expect((await db.query("select 1 from privado.connect_dados_envio")).rows).toEqual([]);
  });
});

// CONNECT-c (ORA-CONNECT-009): a conciliação com os relatórios oficiais, pelo worker de verdade e o formato oficial.
describe("a conciliação com os relatórios oficiais da Nogle (CONNECT-c)", () => {
  it("lê cada relatório página por página, no GET com corpo, até a página vazia, e registra no banco só com as linhas que liga ou não", async () => {
    const nogle = new ClienteNogle({ tipo: "pdv", chaveAcesso: "chave-ficticia", chaveSecundaria: "pdv-ficticio" }, transporteHttp(base), { getComCorpo: true });
    const antes = recebidos.length;
    const r = await conciliarRelatorios(banco, nogle, "2023-05-01", "2023-05-31");
    expect(r).toMatchObject({ conciliadas: 2, linhas: 2, falhas: 0 });
    const pedidos = recebidos.slice(antes).filter((p) => p.caminho.startsWith("/relatorios/"));
    expect(pedidos.map((p) => [p.metodo, p.caminho, JSON.parse(p.corpo) as unknown])).toEqual([
      ["GET", "/relatorios/ativacoes", { data_de: "2023-05-01", data_ate: "2023-05-31", page: 1 }],
      ["GET", "/relatorios/ativacoes", { data_de: "2023-05-01", data_ate: "2023-05-31", page: 2 }],
      ["GET", "/relatorios/recargas", { data_de: "2023-05-01", data_ate: "2023-05-31", page: 1 }],
      ["GET", "/relatorios/recargas", { data_de: "2023-05-01", data_ate: "2023-05-31", page: 2 }],
    ]);
    // O exemplo oficial é de 2023: nenhuma operação deste banco é daquele dia; a linha fica "só na Nogle", sem o nome do cliente.
    const gravadas = (await db.query<{ relatorio: string; linha: string; resultado: string; plano: string; valor_centavos: number }>(
      `select c.relatorio, l.linha, l.resultado, l.plano, l.valor_centavos from public.connect_conciliacao_linhas l
       join public.connect_conciliacoes c on c.id = l.conciliacao_id where c.de = '2023-05-01' order by c.relatorio`)).rows;
    expect(gravadas).toEqual([
      { relatorio: "ativacoes", linha: "51900000000", resultado: "so_na_nogle", plano: "7 GB", valor_centavos: 4490 },
      { relatorio: "recargas", linha: "51900000000", resultado: "so_na_nogle", plano: "7 GB", valor_centavos: 4490 },
    ]);
    expect(JSON.stringify(await db.query("select * from public.connect_conciliacao_linhas"))).not.toContain("Nome do Cliente");
  });

  it("sem o GET com corpo ligado no worker, nada é pedido nem gravado", async () => {
    const nogle = new ClienteNogle({ tipo: "pdv", chaveAcesso: "chave-ficticia", chaveSecundaria: "pdv-ficticio" }, transporteHttp(base), { getComCorpo: false });
    const conciliacoes = async () => (await db.query<{ n: number }>("select count(*)::int as n from public.connect_conciliacoes")).rows[0]?.n;
    const antes = await conciliacoes();
    const r = await conciliarRelatorios(banco, nogle, "2023-05-01", "2023-05-31");
    expect(r).toMatchObject({ conciliadas: 0, falhas: 2 });
    expect(r.detalhes[0]?.falha).toContain("NOGLE_GET_COM_CORPO");
    expect(await conciliacoes()).toBe(antes);
  });
});


describe("o estoque de chips da Nogle (CONNECT-d), só leitura", () => {
  it("lê os PDVs, a MVNO e o PDV (GET com o id no corpo) e grava no banco só o ICCID, o tipo e a data do repasse", async () => {
    const nogle = new ClienteNogle({ tipo: "marca", chaveAcesso: "chave-ficticia" }, transporteHttp(base, 500), { getComCorpo: true });
    const antes = recebidos.length;
    const r = await lerEstoqueDeChips(banco, nogle);
    // O PDV ainda sem loja ligada: nenhum chip entra no estoque.
    expect(r).toMatchObject({ gravada: true, ignorados: 0, leitura: { pdvs: 1, pdvs_lidos: 1, chips: 2, falhas: 0 }, noEstoque: { entraram: 0, divergentes: 0 } });
    expect(recebidos.slice(antes).filter((p) => p.caminho !== "/auth/token")).toEqual([
      { metodo: "GET", caminho: "/pdv/listar", corpo: "" },
      { metodo: "GET", caminho: "/linhas/estoque", corpo: "" },
      { metodo: "GET", caminho: "/pdv/estoque", corpo: JSON.stringify({ id: 5216 }) },
    ]);
    expect((await db.query("select pdv_id, nome, cidade, uf, estoque_minimo, fisicos, esims from public.connect_pdvs")).rows)
      .toEqual([{ pdv_id: 5216, nome: "LOJA A (teste)", cidade: "Curitiba", uf: "PR", estoque_minimo: 10, fisicos: 1, esims: 0 }]);
    expect((await db.query("select iccid, pdv_id, tipo, repassado_em::text from public.connect_chips_nogle order by iccid")).rows).toEqual([
      { iccid: CHIP_LOJA, pdv_id: 5216, tipo: "fisico", repassado_em: "2022-03-21 22:31:23.58" },
      { iccid: CHIP_MVNO, pdv_id: null, tipo: "esim", repassado_em: null },
    ]);
    expect((await db.query("select mvno_fisicos, mvno_esims, pdvs_lidos, falhas from public.connect_leituras_nogle")).rows)
      .toEqual([{ mvno_fisicos: 0, mvno_esims: 1, pdvs_lidos: 1, falhas: 0 }]);
  });

  it("com o PDV ligado à loja, o chip físico dele entra no estoque da loja pelo ICCID, uma vez só (CONNECT-f)", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, "select public.connect_ligar_pdv(5216, $1) as v", [ids.lojaA]);
    const nogle = new ClienteNogle({ tipo: "marca", chaveAcesso: "chave-ficticia" }, transporteHttp(base, 500), { getComCorpo: true });
    // O chip vendido no primeiro teste não é divergência: só o disponível que sumiu do PDV da loja.
    expect(await lerEstoqueDeChips(banco, nogle)).toMatchObject({ gravada: true, noEstoque: { entraram: 1, fora_da_forma: 0, divergentes: 0 } });
    expect((await db.query("select unidade_id, variante_id, situacao from public.itens_serializados where iccid = $1", [CHIP_LOJA])).rows)
      .toEqual([{ unidade_id: ids.lojaA, variante_id: cat.chip, situacao: "disponivel" }]);
    expect(await lerEstoqueDeChips(banco, nogle)).toMatchObject({ noEstoque: { entraram: 0, divergentes: 0 } });
  });
});

describe("a transferência de chips pela Nogle (CONNECT-e)", () => {
  it("o dono pede 1 eSIM; o worker lê o PDV, envia uma vez pelo transporte de verdade e confirma pelo estoque de depois", async () => {
    // O estoque lido no teste anterior (CONNECT-d): o eSIM da MVNO livre, sem PDV.
    const dono = await naLoja(ids.dono, ids.lojaA);
    const pedido = await valor<{ id: string; situacao: string }>(dono,
      "select public.connect_transferir_chips(p_tipo => 'esim', p_pdv => 5216, p_quantidade => 1, p_motivo => 'Teste de ponta a ponta', p_chave => 'pp:transferencia:1') as v");
    expect(pedido.situacao).toBe("registrada");
    const nogle = new ClienteNogle({ tipo: "marca", chaveAcesso: "chave-ficticia" }, transporteHttp(base, 500), { getComCorpo: true });
    const antes = recebidos.length;
    expect(await enviarTransferencias(banco, nogle)).toMatchObject({ enviadas: 1, confirmadas: 1 });
    expect(recebidos.slice(antes).filter((p) => p.caminho !== "/auth/token")).toEqual([
      { metodo: "GET", caminho: "/pdv/estoque", corpo: JSON.stringify({ id: 5216 }) },
      { metodo: "POST", caminho: "/pdv/transferir-chip-esim", corpo: JSON.stringify({ id: 5216, quantidade: 1 }) },
      { metodo: "GET", caminho: "/pdv/estoque", corpo: JSON.stringify({ id: 5216 }) },
    ]);
    expect((await db.query("select situacao, mensagem, resultado from public.connect_transferencias_chips where id = $1", [pedido.id])).rows).toEqual([{
      situacao: "confirmada", mensagem: "Sucesso.", resultado: { antes: { fisicos: 1, esims: 0 }, depois: { fisicos: 1, esims: 1 }, novos: [CHIP_MVNO] },
    }]);
    // Nada mais na fila: rodar de novo não chama a Nogle.
    const depois = recebidos.length;
    expect(await enviarTransferencias(banco, nogle)).toMatchObject({ enviadas: 0, devolvidas: 0 });
    expect(recebidos.length).toBe(depois);
  });
});
