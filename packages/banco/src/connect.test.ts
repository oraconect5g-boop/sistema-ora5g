// ADR-005: operações da Ora Connect (cenários F, G e I do bloco 12 do prompt de execução
// prioritária). Banco em memória com todas as migrations; dados e respostas FICTÍCIOS no formato
// da documentação da Nogle. O worker é simulado chamando as funções connect_worker_* como
// service_role. Cada teste roda numa transação desfeita no fim.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

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
  const s = { usuario, sessao: `46000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const linhas = <T>(s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, async () => (await db.query<T>(sql, params)).rows);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));
const servico = async <T>(acao: () => Promise<T>) => {
  await db.exec("set role service_role");
  try { return await acao(); } finally { await db.exec("reset role"); }
};

// Venda (ADR-004), para o chip vendido e o serviço pago na loja.
const abrirCaixa = (s: Sessao, fundo = 10_000) => valor<string>(s, "select public.abrir_caixa($1, $2) as v", [fundo, chave("caixa")]);
const novaVenda = (s: Sessao) => valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
const adicionar = (s: Sessao, venda: string, variante: string, item: string | null) =>
  valor<string>(s, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda, variante, item, chave("item")]);
const concluir = (s: Sessao, venda: string, total: number) =>
  valor(s, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, JSON.stringify([{ meio: "dinheiro", valor: total }]), chave("concluir")]);

const REGISTRAR = "select public.connect_registrar($1, $2::jsonb, $3) as v";
const registrar = (s: Sessao, tipo: string, pedido: object, k = chave("op")) => valor<string>(s, REGISTRAR, [tipo, JSON.stringify(pedido), k]);
const TIPOS = "{ativacao,recarga,portabilidade}";
const reivindicar = () => servico(async () => (await db.query<{ operacao_id: string; tipo: string; dados: Record<string, unknown> | null }>(
  "select * from public.connect_worker_reivindicar_envios($1, $2::text[], 10)", [ids.organizacao, TIPOS])).rows);
const registrarEnvio = (op: string, resultado: object) => servico(async () =>
  (await db.query<{ v: string }>("select public.connect_worker_registrar_envio($1, $2::jsonb) as v", [op, JSON.stringify(resultado)])).rows[0]?.v);
const aConsultar = async () => {
  await db.query("update public.connect_operacoes set proxima_consulta_em = now() - interval '1 second' where proxima_consulta_em is not null");
  return servico(async () => (await db.query<{ operacao_id: string; situacao: string }>(
    "select * from public.connect_worker_operacoes_a_consultar($1, $2::text[], 10)", [ids.organizacao, TIPOS])).rows);
};
const registrarConsulta = (op: string, evidencia: object) => servico(async () =>
  (await db.query<{ v: string }>("select public.connect_worker_registrar_consulta($1, $2::jsonb) as v", [op, JSON.stringify(evidencia)])).rows[0]?.v);
type Operacao = { situacao: string; vendedor_id: string; venda_chip_id: string | null; id_externo: string | null; numero_ativado: string | null;
  valor_face_centavos: number | null; recebido_na_loja_centavos: number | null; documento_mascarado: string | null; cliente_nome: string | null };
const operacao = async (id: string) => (await db.query<Operacao>(
  `select situacao, vendedor_id, venda_chip_id, id_externo, numero_ativado, valor_face_centavos, recebido_na_loja_centavos,
          documento_mascarado, cliente_nome from public.connect_operacoes where id = $1`, [id])).rows[0];
const producao = async (id: string) => (await db.query<{ origem: string; vendedor_id: string; unidade_id: string }>(
  "select origem, vendedor_id, unidade_id from public.connect_producao where operacao_id = $1", [id])).rows;
const dadosDeEnvio = async (id: string) => (await db.query("select 1 from privado.connect_dados_envio where operacao_id = $1", [id])).rows.length;

const CLIENTE = {
  nome: "Cliente Fictício da Silva", cpf: "123.456.789-09", data_nascimento: "1990-05-20", email: "cliente@exemplo.com",
  telefone: "51999990000", endereco: { rua: "Rua Exemplo", numero: "123", bairro: "Centro", cep: "90000-000", id_cidade: 7703 },
};
const ativacao = (extra: object = {}) => ({ metodo: "LINK", iccid: cat.iccid1, ddd: 51, plano: 99999, cliente: CLIENTE, ...extra });

async function prepararConnect(tipos = ["ativacao", "recarga", "portabilidade"]) {
  const admin = await naLoja(ids.administrador, ids.lojaA);
  for (const tipo of tipos) {
    await valor(admin, "select public.connect_habilitar($1, true, 'Homologado com linha de teste (fictício)') as v", [tipo]);
  }
  const listas: [string, object[]][] = [
    ["plano", [{ codigo: "99999", nome: "7 GB", valor_centavos: 4490 }, { codigo: "12345", nome: "4 GB", valor_centavos: 3990 }]],
    ["ddd", [{ codigo: "51", nome: "51", uf: "RS" }]],
    ["cidade", [{ codigo: "7703", nome: "Aceguá", uf: "RS" }]],
    ["operadora", [{ codigo: "41", nome: "CLARO" }]],
  ];
  for (const [tipo, lista] of listas) {
    await servico(() => db.query("select public.connect_worker_atualizar_referencias($1, $2, $3::jsonb)", [ids.organizacao, tipo, JSON.stringify(lista)]));
  }
  await db.query(
    `insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem)
     values ($1, $2, null, 1000, now() - interval '1 day', 'manual'), ($1, $3, null, 4990, now() - interval '1 day', 'manual')`,
    [ids.organizacao, cat.chip, cat.recarga]);
}

// Vende o chip do estoque da loja A (a venda do chip é um fato; a ativação é outro).
async function venderChip(s: Sessao) {
  await abrirCaixa(s);
  const venda = await novaVenda(s);
  await adicionar(s, venda, cat.chip, itens.chipA);
  await concluir(s, venda, 1000);
  return venda;
}

describe("F — chip vendido, ativação pendente e confirmada, sem dupla produção", () => {
  it("chip do estoque só ativa depois de vendido; a Nogle aceita, a consulta confirma e a produção conta uma vez", async () => {
    await prepararConnect();
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await errou(ana, REGISTRAR, ["ativacao", JSON.stringify(ativacao()), chave("op")])).toBe("OR011");

    const vendaDoChip = await venderChip(ana);
    const k = chave("op");
    const op = await registrar(ana, "ativacao", ativacao(), k);
    expect(await registrar(ana, "ativacao", ativacao(), k)).toBe(op);
    expect(await errou(ana, REGISTRAR, ["ativacao", JSON.stringify(ativacao({ plano: 12345 })), k])).toBe("OR004");
    expect(await errou(ana, REGISTRAR, ["ativacao", JSON.stringify(ativacao()), chave("op")])).toBe("OR013");
    expect(await operacao(op)).toMatchObject({
      situacao: "registrada", venda_chip_id: vendaDoChip, documento_mascarado: "•••.•••.789-09", cliente_nome: "Cliente Fictício da Silva",
    });
    expect(await dadosDeEnvio(op)).toBe(1);

    const [enviar] = await reivindicar();
    expect(enviar).toMatchObject({ operacao_id: op, tipo: "ativacao" });
    expect(enviar?.dados).toMatchObject({ cpf: "12345678909", data_nascimento: "1990-05-20", endereco: { cep: "90000000", id_cidade: 7703 } });
    expect(await reivindicar()).toEqual([]);
    expect(await registrarEnvio(op, { resultado: "aceita", status_http: 200, id_externo: "99999", data_cadastro: "2022-09-09 16:53:38.753", link_pagamento: "https://pagamento.exemplo/1" })).toBe("aguardando_operadora");
    expect(await dadosDeEnvio(op)).toBe(0);

    expect((await aConsultar()).map((o) => o.operacao_id)).toEqual([op]);
    expect(await registrarConsulta(op, { evidencia: "em_andamento", mensagem: "ICCID com ativação em processamento (33)" })).toBe("aguardando_operadora");
    await aConsultar();
    expect(await registrarConsulta(op, { evidencia: "confirmada", numero: "51900000000", mensagem: "ICCID ativo (11)" })).toBe("confirmada");
    expect(await operacao(op)).toMatchObject({ situacao: "confirmada", numero_ativado: "51900000000", id_externo: "99999" });
    expect(await producao(op)).toEqual([{ origem: "evidencia_da_operadora", vendedor_id: ids.vendedorA, unidade_id: ids.lojaA }]);
    expect(await registrarConsulta(op, { evidencia: "confirmada", numero: "51900000000" })).toBe("confirmada");
    expect(await producao(op)).toHaveLength(1);
    expect(await aConsultar()).toEqual([]);

    // Chip ativado não volta ao estoque pelo cancelamento da venda do chip.
    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono, 50_000);
    expect(await errou(dono, "select public.cancelar_venda($1, 'Cliente desistiu do chip')", [vendaDoChip])).toBe("OR013");
  });

  it("eSIM: sem ICCID no pedido; o ICCID chega na resposta da Nogle; erro da operadora para a consulta e vai à gerência", async () => {
    await prepararConnect();
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await errou(ana, REGISTRAR, ["ativacao", JSON.stringify(ativacao({ esim: true })), chave("op")])).toBe("22023");
    const op = await registrar(ana, "ativacao", ativacao({ esim: true, iccid: null }));
    await reivindicar();
    const iccidEsim = comDigitoLuhn("895510000000000099");
    await registrarEnvio(op, { resultado: "aceita", status_http: 200, id_externo: "777", iccid: iccidEsim, link_esim: "https://esim.exemplo/qr" });
    expect((await db.query("select iccid, link_esim from public.connect_operacoes where id = $1", [op])).rows).toEqual([{ iccid: iccidEsim, link_esim: "https://esim.exemplo/qr" }]);
    await aConsultar();
    expect(await registrarConsulta(op, { evidencia: "erro_operadora", mensagem: "Erro na ativação deste chip (22)" })).toBe("erro_operadora");
    expect(await aConsultar()).toEqual([]);
    const gerente = await naLoja(ids.dono, ids.lojaA);
    expect(await valor<string>(gerente, "select public.connect_resolver($1, 'nao_recebida', 'Suporte da Nogle: ativação não concluída, chip liberado') as v", [op])).toBe("nao_recebida");
    expect(await producao(op)).toEqual([]);
  });
});

describe("F — recarga: SALDO só com serviço pago na loja; valor de face da lista oficial", () => {
  it("SALDO exige a venda concluída do serviço; o item vale uma vez; recarga em curso bloqueia outra na mesma linha", async () => {
    await prepararConnect();
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const linha = { linha: "51988887777", plano: 99999 };
    expect(await errou(ana, REGISTRAR, ["recarga", JSON.stringify({ ...linha, metodo: "SALDO" }), chave("op")])).toBe("22023");

    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    const servicoPago = await adicionar(ana, venda, cat.recarga, null);
    expect(await errou(ana, REGISTRAR, ["recarga", JSON.stringify({ ...linha, metodo: "SALDO", venda_item: servicoPago }), chave("op")])).toBe("P0002");
    await concluir(ana, venda, 4990);
    const op = await registrar(ana, "recarga", { ...linha, metodo: "SALDO", venda_item: servicoPago });
    expect(await operacao(op)).toMatchObject({ situacao: "registrada", valor_face_centavos: 4490, recebido_na_loja_centavos: 4990 });
    expect(await dadosDeEnvio(op)).toBe(0);
    expect(await errou(ana, REGISTRAR, ["recarga", JSON.stringify({ ...linha, metodo: "LINK" }), chave("op")])).toBe("OR013");
    expect(await errou(ana, REGISTRAR, ["recarga", JSON.stringify({ linha: "51977776666", plano: 99999, metodo: "SALDO", venda_item: servicoPago }), chave("op")])).toBe("OR013");
    // LINK: o cliente paga direto à Nogle; a loja não precisa vender nada.
    expect(await registrar(ana, "recarga", { linha: "51977776666", plano: 12345, metodo: "LINK" })).toMatch(/^[0-9a-f-]{36}$/);
    // Plano fora da lista oficial não passa (o valor nunca é digitado).
    expect(await errou(ana, REGISTRAR, ["recarga", JSON.stringify({ linha: "51966665555", plano: 11111, metodo: "LINK" }), chave("op")])).toBe("P0002");
  });

  it("resultado desconhecido: não reenvia, a consulta não confirma sozinha; a gerência decide e não a própria; venda não é cancelada com a operação viva", async () => {
    await prepararConnect();
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    const servicoPago = await adicionar(ana, venda, cat.recarga, null);
    await concluir(ana, venda, 4990);
    const op = await registrar(ana, "recarga", { linha: "51988887777", plano: 99999, metodo: "SALDO", venda_item: servicoPago });

    await reivindicar();
    expect(await registrarEnvio(op, { resultado: "desconhecida", mensagem: "Tempo esgotado depois do envio" })).toBe("resultado_desconhecido");
    expect(await reivindicar()).toEqual([]);
    await aConsultar();
    expect(await registrarConsulta(op, { evidencia: "confirmada", valor_debitado_centavos: 3592, mensagem: "Recarga no histórico com a mesma data de cadastro" })).toBe("resultado_desconhecido");
    expect(await producao(op)).toEqual([]);
    expect((await db.query<{ evidencia: { evidencia: string } }>("select evidencia from public.connect_operacoes where id = $1", [op])).rows[0]?.evidencia.evidencia).toBe("confirmada");

    const dono = await naLoja(ids.dono, ids.lojaA);
    await abrirCaixa(dono, 50_000);
    expect(await errou(dono, "select public.cancelar_venda($1, 'Cliente desistiu da recarga')", [venda])).toBe("OR013");
    expect(await errou(ana, "select public.connect_resolver($1, 'confirmada', 'Recarga apareceu no histórico da linha')", [op])).toBe("42501");
    expect(await errou(dono, "select public.connect_resolver($1, 'confirmada', 'curto')", [op])).toBe("22023");
    expect(await valor<string>(dono, "select public.connect_resolver($1, 'confirmada', 'Recarga apareceu no histórico da linha às 14:32') as v", [op])).toBe("confirmada");
    expect(await producao(op)).toEqual([{ origem: "revisao_da_gerencia", vendedor_id: ids.vendedorA, unidade_id: ids.lojaA }]);
    expect(await errou(dono, "select public.connect_resolver($1, 'nao_recebida', 'Tentando resolver de novo')", [op])).toBe("22023");
  });
});

describe("F — portabilidade", () => {
  it("sem forma de pagamento; uma em curso por linha doadora; negada encerra sem produção e libera nova", async () => {
    await prepararConnect();
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const pedido = { linha: "51900000001", linha_doadora: "51911112222", operadora: 41 };
    expect(await errou(ana, REGISTRAR, ["portabilidade", JSON.stringify({ ...pedido, metodo: "LINK" }), chave("op")])).toBe("22023");
    expect(await errou(ana, REGISTRAR, ["portabilidade", JSON.stringify({ ...pedido, operadora: 99 }), chave("op")])).toBe("22023");
    const op = await registrar(ana, "portabilidade", pedido);
    expect(await errou(ana, REGISTRAR, ["portabilidade", JSON.stringify(pedido), chave("op")])).toBe("OR013");
    await reivindicar();
    await registrarEnvio(op, { resultado: "aceita", status_http: 200, id_externo: "12345" });
    await aConsultar();
    expect(await registrarConsulta(op, { evidencia: "em_andamento", mensagem: "Aguardando confirmação" })).toBe("aguardando_operadora");
    await aConsultar();
    expect(await registrarConsulta(op, { evidencia: "negada", mensagem: "Portabilidade negada" })).toBe("negada");
    expect(await producao(op)).toEqual([]);
    expect(await registrar(ana, "portabilidade", pedido)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("G — falha de rede e worker interrompido", () => {
  it("sem conexão volta para a fila; envio que não terminou vira resultado desconhecido e não é reenviado; resposta atrasada ainda vale", async () => {
    await prepararConnect();
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const op = await registrar(ana, "recarga", { linha: "51988887777", plano: 99999, metodo: "LINK" });
    await reivindicar();
    expect(await registrarEnvio(op, { resultado: "nao_enviada", mensagem: "Sem conexão com a Nogle" })).toBe("registrada");
    expect((await reivindicar()).map((o) => o.operacao_id)).toEqual([op]);

    await db.query("update public.connect_operacoes set enviando_desde = now() - interval '6 minutes' where id = $1", [op]);
    expect(await reivindicar()).toEqual([]);
    expect((await operacao(op))?.situacao).toBe("resultado_desconhecido");
    expect(await reivindicar()).toEqual([]);
    expect(await registrarEnvio(op, { resultado: "aceita", status_http: 200, id_externo: "4321", data_cadastro: "2022-01-01 14:29:35.057" })).toBe("aguardando_operadora");
    expect(await servico(() => erroDe(() => db.query("select public.connect_worker_registrar_envio($1, '{\"resultado\":\"aceita\"}'::jsonb)", [op])))).toBe("22023");
    const eventos = (await db.query<{ tipo: string }>("select tipo from public.connect_eventos where operacao_id = $1 order by id", [op])).rows.map((e) => e.tipo);
    expect(eventos).toEqual(["registrada", "envio_iniciado", "sem_conexao", "envio_iniciado", "envio_expirado", "resposta"]);
    expect(await servico(() => erroDe(() => db.query("delete from public.connect_eventos where operacao_id = $1", [op])))).toBe("42501");
  });

  it("cancelar só antes do envio; listas oficiais: o que some fica inativo", async () => {
    await prepararConnect();
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const op = await registrar(ana, "recarga", { linha: "51988887777", plano: 99999, metodo: "LINK" });
    expect(await valor<boolean>(ana, "select public.connect_cancelar($1, 'Cliente desistiu') as v", [op])).toBe(true);
    expect(await reivindicar()).toEqual([]);
    const outra = await registrar(ana, "recarga", { linha: "51988887777", plano: 99999, metodo: "LINK" });
    await reivindicar();
    expect(await errou(ana, "select public.connect_cancelar($1, 'Cliente desistiu')", [outra])).toBe("22023");

    await servico(() => db.query("select public.connect_worker_atualizar_referencias($1, 'plano', $2::jsonb)",
      [ids.organizacao, JSON.stringify([{ codigo: "12345", nome: "4 GB", valor_centavos: 3990 }])]));
    expect((await db.query("select codigo, ativo from public.connect_referencias where tipo = 'plano' order by codigo")).rows)
      .toEqual([{ codigo: "12345", ativo: true }, { codigo: "99999", ativo: false }]);
    expect(await errou(ana, REGISTRAR, ["recarga", JSON.stringify({ linha: "51977776666", plano: 99999, metodo: "LINK" }), chave("op")])).toBe("P0002");
  });
});

describe("I — habilitação, papel, loja e organização", () => {
  it("sem habilitação nada é registrado; só integracoes.gerir habilita, com evidência; técnico não opera", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await errou(ana, REGISTRAR, ["recarga", JSON.stringify({ linha: "51988887777", plano: 99999, metodo: "LINK" }), chave("op")])).toBe("OR012");
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await errou(dono, "select public.connect_habilitar('recarga', true, 'Homologado com linha de teste')")).toBe("42501");
    const admin = await naLoja(ids.administrador, ids.lojaA);
    expect(await errou(admin, "select public.connect_habilitar('recarga', true, 'ok')")).toBe("22023");
    await prepararConnect(["recarga"]);
    expect((await db.query("select acao, motivo from public.auditoria where alvo_tipo = 'connect_habilitacoes' order by id")).rows)
      .toEqual([{ acao: "connect_habilitacoes.criado", motivo: "Homologado com linha de teste (fictício)" }]);
    expect(await errou(ana, REGISTRAR, ["portabilidade", JSON.stringify({ linha: "51900000001", linha_doadora: "51911112222", operadora: 41 }), chave("op")])).toBe("OR012");
    const tecnico = await naLoja(ids.tecnico, ids.assistencia);
    expect(await errou(tecnico, REGISTRAR, ["recarga", JSON.stringify({ linha: "51988887777", plano: 99999, metodo: "LINK" }), chave("op")])).toBe("42501");
  });

  it("vendedor vê as próprias; gerente de outra loja e outra rede não veem; dados pessoais e funções do worker fora do alcance", async () => {
    await prepararConnect();
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await venderChip(ana);
    const op = await registrar(ana, "ativacao", ativacao());
    const contar = (s: Sessao) => valor<number>(s, "select count(*)::int as v from public.connect_operacoes");
    expect(await contar(ana)).toBe(1);
    expect(await contar(await naLoja(ids.dono, ids.lojaA))).toBe(1);
    expect(await contar(await naLoja(ids.gerenteB, ids.lojaB))).toBe(0);
    expect(await contar(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg))).toBe(0);
    expect(await contar(await naLoja(ids.vendedorAB, ids.lojaA))).toBe(0);
    expect(await valor<number>(ana, "select count(*)::int as v from public.connect_eventos")).toBe(1);

    expect(await errou(ana, "select * from privado.connect_dados_envio")).toBe("42501");
    expect(await errou(ana, "select * from public.connect_worker_reivindicar_envios($1, $2::text[], 10)", [ids.organizacao, TIPOS])).toBe("42501");
    expect(await errou(ana, "select public.connect_worker_registrar_consulta($1, '{\"evidencia\":\"confirmada\"}'::jsonb)", [op])).toBe("42501");
    expect(await errou(ana, "update public.connect_operacoes set situacao = 'confirmada' where id = $1", [op])).toBe("42501");
    expect(await errou(ana, "insert into public.connect_producao (organizacao_id, unidade_id, vendedor_id, operacao_id, tipo, origem) values ($1, $2, $3, $4, 'ativacao', 'revisao_da_gerencia')",
      [ids.organizacao, ids.lojaA, ids.vendedorA, op])).toBe("42501");
    const outro = await naLoja(ids.vendedorAB, ids.lojaA);
    expect(await errou(outro, "select public.connect_cancelar($1, 'Não é minha')", [op])).toBe("P0002");
    expect(await linhas(ana, "select codigo from public.connect_referencias where tipo = 'operadora'")).toEqual([{ codigo: "41" }]);
    expect(await linhas(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), "select codigo from public.connect_referencias")).toEqual([]);
  });
});
