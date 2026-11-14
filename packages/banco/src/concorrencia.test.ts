// Concorrência real (auditoria do Codex de 08/11/2026): duas conexões simultâneas num
// PostgreSQL 17 de verdade disputando o mesmo IMEI, a mesma chave, o último item, a liberação
// e o vencimento. A segunda conexão só continua depois de o teste confirmar que ela está
// parada esperando a trava da primeira (pg_stat_activity), então a disputa acontece sempre.
// Dados fictícios; o banco é descartado no fim.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cnpj, comDigitoLuhn, cpf } from "./banco-de-teste";
import { ids, montarCenario, RAIZ } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";
import { executor, iniciarPostgresReal, type PostgresReal } from "./postgres-real";

let servidor: PostgresReal;
let admin: pg.Client;
let a: pg.Client;
let b: pg.Client;
const pid = new Map<pg.Client, number>();

beforeAll(async () => {
  servidor = await iniciarPostgresReal();
  admin = await servidor.conectar();
  await montarCenario(executor(admin));
  await montarCatalogo(executor(admin));
  for (const cliente of [(a = await servidor.conectar()), (b = await servidor.conectar())]) {
    pid.set(cliente, (await cliente.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid ?? 0);
  }
}, 120_000);

afterAll(async () => {
  for (const cliente of [a, b, admin]) await cliente?.end().catch(() => {});
  await servidor?.parar();
});

let sessoes = 0;
type Sessao = { usuario: string; sessao: string };

// A unidade da sessão é gravada antes (como no login), fora da disputa.
async function sessaoNaLoja(usuario: string, unidade: string): Promise<Sessao> {
  const sessao = { usuario, sessao: `42000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await admin.query("insert into auth.sessions (id, user_id) values ($1, $2)", [sessao.sessao, usuario]);
  await admin.query("begin");
  await admin.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: usuario, session_id: sessao.sessao, role: "authenticated" })]);
  await admin.query("set local role authenticated");
  const { rows } = await admin.query<{ ok: boolean }>("select public.selecionar_unidade($1) as ok", [unidade]);
  await admin.query("commit");
  expect(rows[0]?.ok).toBe(true);
  return sessao;
}

// Abre a transação na conexão; com sessão, como o usuário logado (papel authenticated).
async function abrir(cliente: pg.Client, sessao?: Sessao) {
  await cliente.query("begin");
  if (sessao) {
    await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: sessao.usuario, session_id: sessao.sessao, role: "authenticated" })]);
    await cliente.query("set local role authenticated");
  }
}

async function esperarTrava(cliente: pg.Client) {
  for (let i = 0; i < 400; i++) {
    const { rows } = await admin.query<{ espera: string | null }>("select wait_event_type as espera from pg_stat_activity where pid = $1", [pid.get(cliente)]);
    if (rows[0]?.espera === "Lock") return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("a segunda conexão não ficou esperando a trava da primeira");
}

// A primeira faz e segura; a segunda tenta, fica esperando; a primeira confirma; a segunda termina.
async function disputa<T>(primeira: () => Promise<unknown>, segunda: () => Promise<T>): Promise<{ ok: T } | { erro: string }> {
  await primeira();
  const resultado = segunda().then((ok) => ({ ok }), (e: { code?: string }) => ({ erro: e.code ?? "sem-codigo" }));
  await esperarTrava(b);
  await a.query("commit");
  const final = await resultado;
  await b.query("erro" in final ? "rollback" : "commit");
  return final;
}

const valor = async <T>(cliente: pg.Client, sql: string, params: unknown[]) => (await cliente.query<{ v: T }>(sql, params)).rows[0]?.v;
const contar = async (sql: string, params: unknown[] = []) => Number((await admin.query<{ n: string }>(sql, params)).rows[0]?.n);
const divergencias = async () => (await admin.query<{ regra: string }>("select regra from privado.divergencias_estoque()")).rows;
const saldo = async (unidade: string, variante: string) =>
  (await admin.query<{ quantidade: number; reservado: number }>("select quantidade, reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0];
const ENTRADA = "select privado.registrar_item_serializado($1, $2, $3, $4, null, 'entrada_compra', $5) as v";
const RESERVA = "select public.reservar_estoque($1, $2, $3, $4) as v";

describe("duas conexões ao mesmo tempo no PostgreSQL 17", () => {
  it("mesmo IMEI em duas entradas: uma entra, a outra é recusada e nada fica pela metade", async () => {
    const imei = comDigitoLuhn("35209900172001");
    await abrir(a);
    await abrir(b);
    const final = await disputa(
      () => a.query(ENTRADA, [ids.lojaA, cat.aparelho, imei, null, "conc:imei:1"]),
      () => valor(b, ENTRADA, [ids.lojaA, cat.aparelho, imei, null, "conc:imei:2"]),
    );
    expect(final).toEqual({ erro: "23505" });
    expect(await contar("select count(*) as n from public.itens_serializados where imei = $1", [imei])).toBe(1);
    expect(await contar("select count(*) as n from public.estoque_movimentos where chave_idempotencia like 'conc:imei:%'")).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("IMEI de um aparelho e IMEI2 de outro ao mesmo tempo: o segundo é recusado (REV-020)", async () => {
    const imei = comDigitoLuhn("35209900172002");
    await abrir(a);
    await abrir(b);
    const final = await disputa(
      () => a.query(ENTRADA, [ids.lojaA, cat.aparelho, imei, null, "conc:imei2:1"]),
      () => valor(b, ENTRADA, [ids.lojaA, cat.aparelho, comDigitoLuhn("35209900172003"), imei, "conc:imei2:2"]),
    );
    expect(final).toEqual({ erro: "23505" });
    expect(await divergencias()).toEqual([]);
  });

  it("mesma chave de reserva em duas conexões: a mesma reserva, contada uma vez (REV-021)", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    const antes = (await saldo(ids.lojaA, cat.capa))?.reservado ?? 0;
    await abrir(a, ana);
    await abrir(b, ana);
    let primeira: string | undefined;
    const final = await disputa(
      async () => { primeira = await valor<string>(a, RESERVA, [cat.capa, 1, null, "conc:chave:1"]); },
      () => valor<string>(b, RESERVA, [cat.capa, 1, null, "conc:chave:1"]),
    );
    expect(final).toEqual({ ok: primeira });
    expect((await saldo(ids.lojaA, cat.capa))?.reservado).toBe(antes + 1);
    expect(await divergencias()).toEqual([]);
  });

  it("mesma chave com outra quantidade ao mesmo tempo: a segunda recebe OR004", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    await abrir(a, ana);
    await abrir(b, ana);
    const final = await disputa(
      () => a.query(RESERVA, [cat.capa, 1, null, "conc:chave:2"]),
      () => valor(b, RESERVA, [cat.capa, 3, null, "conc:chave:2"]),
    );
    expect(final).toEqual({ erro: "OR004" });
    expect(await divergencias()).toEqual([]);
  });

  it("mesma chave no livro em duas conexões: um lançamento só (REV-022)", async () => {
    const lancar = "select privado.lancar_movimento($1, $2, 2, 'entrada_compra', null, null, null, null, 'conc:livro:1') as v";
    await abrir(a);
    await abrir(b);
    let primeiro: string | undefined;
    const final = await disputa(
      async () => { primeiro = await valor<string>(a, lancar, [ids.lojaB, cat.capa]); },
      () => valor<string>(b, lancar, [ids.lojaB, cat.capa]),
    );
    expect(final).toEqual({ ok: primeiro });
    expect(await contar("select count(*) as n from public.estoque_movimentos where chave_idempotencia = 'conc:livro:1'")).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("devolução do mesmo aparelho em duas conexões: ele volta ao estoque uma vez só (REV-023)", async () => {
    await admin.query("select privado.lancar_movimento($1, $2, -1, 'venda', $3, null, null, null, 'conc:venda:b1')", [ids.lojaB, cat.aparelho, itens.b1]);
    const devolver = "select privado.lancar_movimento($1, $2, 1, 'devolucao', $3, null, null, null, $4) as v";
    await abrir(a);
    await abrir(b);
    const final = await disputa(
      () => a.query(devolver, [ids.lojaB, cat.aparelho, itens.b1, "conc:devolucao:1"]),
      () => valor(b, devolver, [ids.lojaB, cat.aparelho, itens.b1, "conc:devolucao:2"]),
    );
    expect(final).toEqual({ erro: "OR005" });
    expect(await divergencias()).toEqual([]);
  });

  it("último acessório disputado por dois vendedores: um reserva, o outro recebe OR001", async () => {
    const gerente = await sessaoNaLoja(ids.gerenteB, ids.lojaB);
    const colega = await sessaoNaLoja(ids.vendedorAB, ids.lojaB);
    const atual = await saldo(ids.lojaB, cat.capa);
    const sobra = (atual?.quantidade ?? 0) - (atual?.reservado ?? 0);
    await abrir(a, colega);
    await a.query(RESERVA, [cat.capa, sobra - 1, null, "conc:ultimo:0"]);
    await a.query("commit");
    await abrir(a, gerente);
    await abrir(b, colega);
    const final = await disputa(
      () => a.query(RESERVA, [cat.capa, 1, null, "conc:ultimo:1"]),
      () => valor(b, RESERVA, [cat.capa, 1, null, "conc:ultimo:2"]),
    );
    expect(final).toEqual({ erro: "OR001" });
    const depois = await saldo(ids.lojaB, cat.capa);
    expect(depois?.reservado).toBe(depois?.quantidade);
    expect(await divergencias()).toEqual([]);
  });

  it("o mesmo aparelho disputado por dois vendedores: um reserva, o outro recebe OR002", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    const colega = await sessaoNaLoja(ids.vendedorAB, ids.lojaA);
    await abrir(a, ana);
    await abrir(b, colega);
    const final = await disputa(
      () => a.query(RESERVA, [cat.aparelho, 1, itens.a2, "conc:aparelho:1"]),
      () => valor(b, RESERVA, [cat.aparelho, 1, itens.a2, "conc:aparelho:2"]),
    );
    expect(final).toEqual({ erro: "OR002" });
    expect(await contar("select count(*) as n from public.estoque_reservas where item_serializado_id = $1 and situacao = 'ativa'", [itens.a2])).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("liberação e nova reserva ao mesmo tempo: a nova espera e fica com o aparelho", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    const colega = await sessaoNaLoja(ids.vendedorAB, ids.lojaA);
    const reserva = await admin.query<{ id: string }>("select id from public.estoque_reservas where chave_idempotencia = 'conc:aparelho:1'");
    await abrir(a, ana);
    await abrir(b, colega);
    const final = await disputa(
      () => a.query("select public.liberar_reserva($1)", [reserva.rows[0]?.id]),
      () => valor<string>(b, RESERVA, [cat.aparelho, 1, itens.a2, "conc:aparelho:3"]),
    );
    expect("ok" in final).toBe(true);
    expect(await contar("select count(*) as n from public.estoque_reservas where item_serializado_id = $1 and situacao = 'ativa'", [itens.a2])).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("reserva vencida disputada: uma conexão encerra e reserva, a outra recebe OR002; encerrada uma vez só", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    const colega = await sessaoNaLoja(ids.vendedorAB, ids.lojaA);
    await abrir(a, ana);
    const vencida = await valor<string>(a, "select public.reservar_estoque($1, 1, $2, 'conc:vencida:0', 'pdv', 1) as v", [cat.chip, itens.chipA]);
    await a.query("commit");
    await admin.query("update public.estoque_reservas set expira_em = now() - interval '1 minute' where id = $1", [vencida]);
    await abrir(a, ana);
    await abrir(b, colega);
    const final = await disputa(
      () => a.query(RESERVA, [cat.chip, 1, itens.chipA, "conc:vencida:1"]),
      () => valor(b, RESERVA, [cat.chip, 1, itens.chipA, "conc:vencida:2"]),
    );
    expect(final).toEqual({ erro: "OR002" });
    const { rows } = await admin.query<{ situacao: string }>("select situacao from public.estoque_reservas where id = $1", [vencida]);
    expect(rows[0]?.situacao).toBe("expirada");
    expect((await saldo(ids.lojaA, cat.chip))?.reservado).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("a rotina de vencimento não espera pelo aparelho que está numa venda e não encerra duas vezes", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    const atual = await admin.query<{ id: string }>("select id from public.estoque_reservas where chave_idempotencia = 'conc:vencida:1'");
    await admin.query("update public.estoque_reservas set expira_em = now() - interval '1 minute' where id = $1", [atual.rows[0]?.id]);
    await abrir(a, ana);
    await a.query(RESERVA, [cat.chip, 1, itens.chipA, "conc:vencida:3"]);
    // A venda segura o chip; a rotina passa por ele sem esperar e encerra o resto.
    const encerradas = await valor<number>(b, "select privado.expirar_reservas() as v", []);
    expect(encerradas).toBe(0);
    await a.query("commit");
    const { rows } = await admin.query<{ situacao: string; n: string }>(
      "select situacao, count(*) as n from public.estoque_reservas where item_serializado_id = $1 group by situacao order by situacao", [itens.chipA]);
    expect(rows.map((r) => [r.situacao, Number(r.n)])).toEqual([["ativa", 1], ["expirada", 2]]);
    expect(await divergencias()).toEqual([]);
  });

  it("a mesma conclusão de venda enviada duas vezes ao mesmo tempo: uma venda, um recebimento (ADR-004)", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    await abrir(a, ana);
    await a.query("select public.abrir_caixa(0, 'conc:caixa:1')");
    const venda = await valor<string>(a, "select public.criar_venda('conc:venda:1') as v", []);
    await a.query("select public.adicionar_item($1, $2, null, 1, 'conc:item:1')", [venda, cat.capa]);
    await a.query("commit");
    const concluir = "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, 'conc:concluir:1') as v";
    await abrir(a, ana);
    await abrir(b, ana);
    let primeira: { numero: number } | undefined;
    const final = await disputa(
      async () => { primeira = await valor<{ numero: number }>(a, concluir, [venda]); },
      () => valor<{ numero: number; repetida: boolean }>(b, concluir, [venda]),
    );
    expect(final).toEqual({ ok: expect.objectContaining({ numero: primeira?.numero, repetida: true }) });
    expect(await contar("select count(*) as n from public.caixa_movimentos where venda_id = $1 and tipo = 'recebimento'", [venda])).toBe(1);
    expect(await contar("select count(*) as n from public.estoque_movimentos where referencia_id = $1", [venda])).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("dois workers da Ora Connect ao mesmo tempo: cada operação é enviada por um só (ADR-005)", async () => {
    await admin.query("insert into public.connect_habilitacoes (organizacao_id, tipo, habilitada, evidencia) values ($1, 'recarga', true, 'Teste de concorrência (fictício)'), ($1, 'ativacao', true, 'Teste de concorrência (fictício)')", [ids.organizacao]);
    await admin.query("select public.connect_worker_atualizar_referencias($1, 'plano', '[{\"codigo\":\"99999\",\"nome\":\"7 GB\",\"valor_centavos\":4490}]'::jsonb)", [ids.organizacao]);
    await admin.query("select public.connect_worker_atualizar_referencias($1, 'ddd', '[{\"codigo\":\"51\",\"nome\":\"51\",\"uf\":\"RS\"}]'::jsonb)", [ids.organizacao]);
    await admin.query("select public.connect_worker_atualizar_referencias($1, 'cidade', '[{\"codigo\":\"7703\",\"nome\":\"Aceguá\",\"uf\":\"RS\"}]'::jsonb)", [ids.organizacao]);
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    await abrir(a, ana);
    for (const [linha, k] of [["51988880001", "conc:rec:1"], ["51988880002", "conc:rec:2"]]) {
      await a.query("select public.connect_registrar('recarga', $1::jsonb, $2)", [JSON.stringify({ linha, plano: 99999, metodo: "LINK" }), k]);
    }
    await a.query("commit");
    const REIVINDICAR = "select operacao_id from public.connect_worker_reivindicar_envios($1, '{recarga}'::text[], $2)";
    for (const cliente of [a, b]) {
      await cliente.query("begin");
      await cliente.query("set local role service_role");
    }
    const primeira = (await a.query<{ operacao_id: string }>(REIVINDICAR, [ids.organizacao, 1])).rows.map((r) => r.operacao_id);
    // A segunda não espera pela primeira (SKIP LOCKED): pega só o que sobrou.
    const segunda = (await b.query<{ operacao_id: string }>(REIVINDICAR, [ids.organizacao, 10])).rows.map((r) => r.operacao_id);
    await a.query("commit");
    await b.query("commit");
    expect(primeira).toHaveLength(1);
    expect(segunda).toHaveLength(1);
    expect(segunda).not.toEqual(primeira);
    expect(await contar("select count(*) as n from public.connect_eventos where tipo = 'envio_iniciado'")).toBe(2);
    expect(await contar("select count(*) as n from public.connect_operacoes where situacao = 'enviando'")).toBe(2);
  });

  it("duas pessoas ativando o mesmo chip vendido ao mesmo tempo: uma registra, a outra recebe OR013 (ADR-005)", async () => {
    const iccid = comDigitoLuhn("895510000000000777");
    const chip = await valor<string>(admin, "select privado.registrar_item_serializado($1, $2, null, null, $3, 'entrada_compra', $4) as v", [ids.lojaA, cat.chip, iccid, "conc:chip:entrada"]);
    await admin.query("select privado.lancar_movimento($1, $2, -1, 'venda', $3, 'Venda de teste', null, null, 'conc:chip:venda')", [ids.lojaA, cat.chip, chip]);
    const pedido = (k: string) => [JSON.stringify({
      metodo: "LINK", iccid, ddd: 51, plano: 99999,
      cliente: { nome: "Cliente Fictício", cpf: "12345678909", data_nascimento: "1990-01-01", endereco: { rua: "Rua A", numero: "1", bairro: "Centro", cep: "90000000", id_cidade: 7703 } },
    }), k];
    const REGISTRAR = "select public.connect_registrar('ativacao', $1::jsonb, $2) as v";
    await abrir(a, await sessaoNaLoja(ids.vendedorA, ids.lojaA));
    await abrir(b, await sessaoNaLoja(ids.vendedorAB, ids.lojaA));
    const final = await disputa(() => a.query(REGISTRAR, pedido("conc:ativ:1")), () => valor(b, REGISTRAR, pedido("conc:ativ:2")));
    expect(final).toEqual({ erro: "OR013" });
    expect(await contar("select count(*) as n from public.connect_operacoes where iccid = $1", [iccid])).toBe(1);
  });

  it("dois donos encerrando o vínculo um do outro ao mesmo tempo: um encerra, o outro recebe 23514 e a rede fica com um dono (#29)", async () => {
    const segundo = "42000000-0000-4000-8000-0000000009d0";
    await admin.query("insert into auth.users (id, email) values ($1, 'dono2@teste.invalid')", [segundo]);
    await admin.query("insert into public.perfis_usuario (id, nome, email) values ($1, 'dono2', 'dono2@teste.invalid')", [segundo]);
    const vinculoDoSegundo = await valor<string>(admin,
      "insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, inicio) values ($1, $2, 'dono', 'organizacao', now() - interval '1 day') returning id as v",
      [segundo, ids.organizacao]);
    const vinculoDoPrimeiro = await valor<string>(admin, "select id as v from public.vinculos where usuario_id = $1 and papel = 'dono' and fim is null", [ids.dono]);
    await abrir(a, await sessaoNaLoja(ids.dono, ids.lojaA));
    await abrir(b, await sessaoNaLoja(segundo, ids.lojaA));
    const final = await disputa(
      () => a.query("select public.encerrar_vinculo($1, 'Disputa de donos')", [vinculoDoSegundo]),
      () => valor(b, "select public.encerrar_vinculo($1, 'Disputa de donos') as v", [vinculoDoPrimeiro]),
    );
    expect(final).toEqual({ erro: "23514" });
    expect(await contar(`select count(*) as n from public.vinculos v join public.perfis_usuario p on p.id = v.usuario_id
      where v.organizacao_id = $1 and v.papel = 'dono' and v.fim is null and p.status = 'ativo'`, [ids.organizacao])).toBe(1);
  });

  // #53 (REV-051): a prova do Codex segurava a venda numa conexão (primeira trava de aplicar_desconto)
  // e chamava decidir_aprovacao na outra, que antes travava a APROVAÇÃO primeiro — e o desconto, ao
  // invalidar a aprovação, esperava por ela: 40P01. Agora as duas funções travam a venda primeiro.
  it("desconto e decisão da aprovação da mesma venda ao mesmo tempo, nas duas ordens: sem deadlock (#53)", async () => {
    const ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    const dono = await sessaoNaLoja(ids.dono, ids.lojaA);
    const entrar = async (cliente: pg.Client, sessao: Sessao) => {
      await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: sessao.usuario, session_id: sessao.sessao, role: "authenticated" })]);
      await cliente.query("set local role authenticated");
    };
    const DECIDIR = "select public.decidir_aprovacao($1, true, 'Conferido') as v";
    const DESCONTO = "select public.aplicar_desconto($1, $2) as v";
    await abrir(admin, ana);
    const venda = await valor<string>(admin, "select public.criar_venda('conc:aprov:venda') as v", []);
    const item = await valor<string>(admin, "select public.adicionar_item($1, $2, null, 1, 'conc:aprov:item') as v", [venda, cat.capa]);
    await admin.query(DESCONTO, [item, 500]);
    const pedido = await valor<string>(admin, "select public.pedir_aprovacao($1, 'Cliente fictício') as v", [item]);
    await admin.query("commit");

    // 1) A vendedora segura a venda; o dono decide e espera a VENDA (sem segurar a aprovação); o
    //    desconto continua sem esperar ninguém; a decisão vê o pedido invalidado pela mudança.
    await a.query("begin");
    await a.query("select id from public.vendas where id = $1 for update", [venda]);
    await entrar(a, ana);
    await abrir(b, dono);
    const decisao = valor<boolean>(b, DECIDIR, [pedido]).then((ok) => ({ ok }), (e: { code?: string }) => ({ erro: e.code ?? "sem-codigo" }));
    await esperarTrava(b);
    expect(await valor<string>(a, DESCONTO, [item, 600])).toBe("precisa_aprovacao");
    await a.query("commit");
    const primeira = await decisao;
    await b.query("erro" in primeira ? "rollback" : "commit");
    expect(primeira).toEqual({ ok: false });
    expect(await valor<string>(admin, "select situacao as v from public.aprovacoes_desconto where id = $1", [pedido])).toBe("invalidada");

    // 2) Ordem inversa: o dono segura a venda e decide; o desconto espera a venda e, depois, invalida
    //    a aprovação dada para o conteúdo antigo.
    await abrir(admin, ana);
    const segundo = await valor<string>(admin, "select public.pedir_aprovacao($1, 'Cliente fictício de novo') as v", [item]);
    await admin.query("commit");
    await a.query("begin");
    await a.query("select id from public.vendas where id = $1 for update", [venda]);
    await entrar(a, dono);
    await abrir(b, ana);
    const edicao = valor<string>(b, DESCONTO, [item, 700]).then((ok) => ({ ok }), (e: { code?: string }) => ({ erro: e.code ?? "sem-codigo" }));
    await esperarTrava(b);
    expect(await valor<boolean>(a, DECIDIR, [segundo])).toBe(true);
    await a.query("commit");
    const segunda = await edicao;
    await b.query("erro" in segunda ? "rollback" : "commit");
    expect(segunda).toEqual({ ok: "precisa_aprovacao" });
    expect(await valor<string>(admin, "select situacao as v from public.aprovacoes_desconto where id = $1", [segundo])).toBe("invalidada");
  });

  // ADR-007 (#60): reserva de venda e separação de transferência não pegam o mesmo aparelho.
  it("separação de transferência e reserva de venda do mesmo aparelho ao mesmo tempo: uma fica com ele, a outra recebe OR002", async () => {
    const imei = comDigitoLuhn("35209900172077");
    const item = await valor<string>(admin, ENTRADA, [ids.lojaA, cat.aparelho, imei, null, "conc:transf:entrada"]);
    const gerenteB = await sessaoNaLoja(ids.gerenteB, ids.lojaB);
    await abrir(admin, gerenteB);
    const t = await valor<string>(admin, "select public.transferencia_solicitar($1, $2, $3, 1, 'Reposição', 'conc:transf:1') as v", [ids.lojaA, ids.lojaB, cat.aparelho]);
    await admin.query("commit");
    await abrir(a, await sessaoNaLoja(ids.dono, ids.lojaA));
    await abrir(b, await sessaoNaLoja(ids.vendedorA, ids.lojaA));
    const final = await disputa(
      () => a.query("select public.transferencia_separar($1, $2::uuid[])", [t, [item]]),
      () => valor(b, RESERVA, [cat.aparelho, 1, item, "conc:transf:venda"]),
    );
    expect(final).toEqual({ erro: "OR002" });
    expect(await contar("select count(*) as n from public.estoque_reservas where item_serializado_id = $1 and situacao = 'ativa'", [item])).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("o mesmo envio de transferência em duas conexões: uma saída só no livro", async () => {
    const gerenteB = await sessaoNaLoja(ids.gerenteB, ids.lojaB);
    const dono = await sessaoNaLoja(ids.dono, ids.lojaA);
    await abrir(admin, gerenteB);
    const t = await valor<string>(admin, "select public.transferencia_solicitar($1, $2, $3, 1, 'Reposição', 'conc:transf:2') as v", [ids.lojaA, ids.lojaB, cat.capa]);
    await admin.query("commit");
    await abrir(admin, dono);
    await admin.query("select public.transferencia_separar($1, '{}'::uuid[])", [t]);
    await admin.query("commit");
    await abrir(a, dono);
    await abrir(b, dono);
    const final = await disputa(
      () => a.query("select public.transferencia_enviar($1)", [t]),
      () => valor<string>(b, "select public.transferencia_enviar($1) as v", [t]),
    );
    expect(final).toEqual({ ok: "enviada" });
    expect(await contar("select count(*) as n from public.estoque_movimentos where referencia_tipo = 'transferencia' and referencia_id = $1", [t])).toBe(1);
    expect(await divergencias()).toEqual([]);
  });

  it("inativar a loja e abrir caixa nela ao mesmo tempo, nas duas ordens: nunca sobra caixa aberto em loja inativa (L2)", async () => {
    // Duas lojas novas e vazias, só deste teste.
    const lojaD = "00000000-0000-4000-8000-000000000026";
    const lojaE = "00000000-0000-4000-8000-000000000027";
    await admin.query(`insert into public.unidades (id, organizacao_id, empresa_id, codigo, nome, tipo, cnpj) values
      ($1, $3, $4, 'conc-loja-d', 'Loja D', 'loja_fisica', $5), ($2, $3, $4, 'conc-loja-e', 'Loja E', 'loja_fisica', $6)`,
    [lojaD, lojaE, ids.organizacao, ids.empresa, cnpj(RAIZ, "0004"), cnpj(RAIZ, "0005")]);
    const gestor = await sessaoNaLoja(ids.administrador, ids.lojaA);
    const INATIVAR = "select public.loja_definir_situacao($1, 'inativa', 'Fechamento da loja') as v";

    // A inativação chega primeiro e segura a loja; o caixa espera e, depois, encontra a loja inativa.
    const naD = await sessaoNaLoja(ids.dono, lojaD);
    await abrir(a, gestor);
    await abrir(b, naD);
    const inativouPrimeiro = await disputa(
      () => a.query(INATIVAR, [lojaD]),
      () => valor(b, "select public.abrir_caixa(0, 'conc:lojas:1') as v", []),
    );
    expect(inativouPrimeiro).toEqual({ erro: "OR019" });
    expect(await contar("select count(*) as n from public.caixas where unidade_id = $1", [lojaD])).toBe(0);
    expect(await contar("select count(*) as n from public.unidades where id = $1 and status = 'inativa'", [lojaD])).toBe(1);

    // O caixa abre primeiro e segura a loja; a inativação espera e, depois, encontra o caixa aberto.
    const naE = await sessaoNaLoja(ids.dono, lojaE);
    await abrir(a, naE);
    await abrir(b, gestor);
    const abriuPrimeiro = await disputa(
      () => a.query("select public.abrir_caixa(0, 'conc:lojas:2')"),
      () => valor(b, INATIVAR, [lojaE]),
    );
    expect(abriuPrimeiro).toEqual({ erro: "OR019" });
    expect(await contar("select count(*) as n from public.caixas where unidade_id = $1 and situacao = 'aberto'", [lojaE])).toBe(1);
    expect(await contar("select count(*) as n from public.unidades where id = $1 and status = 'ativa'", [lojaE])).toBe(1);
  });

  it("a mesma mudança de preço enviada duas vezes ao mesmo tempo: um preço novo só, o anterior fechado uma vez (L3b)", async () => {
    const dono = await sessaoNaLoja(ids.dono, ids.lojaA);
    const DEFINIR = "select public.preco_definir($1, null, 'online', 6900, null, 'Promoção do site') as v";
    await abrir(a, dono);
    await abrir(b, dono);
    let primeira: { id: string; repetida: boolean } | undefined;
    const final = await disputa(
      async () => { primeira = await valor(a, DEFINIR, [cat.capa]); },
      () => valor<{ id: string; repetida: boolean }>(b, DEFINIR, [cat.capa]),
    );
    expect(primeira?.repetida).toBe(false);
    expect(final).toEqual({ ok: { id: primeira?.id, repetida: true } });
    expect(await contar("select count(*) as n from public.precos where variante_id = $1 and canal = 'online' and fim is null and cancelado_em is null", [cat.capa])).toBe(1);
  });

  it("o mesmo CPF cadastrado em duas lojas ao mesmo tempo: um cliente só, o outro recebe OR026 (L5a)", async () => {
    const documento = cpf("314159265");
    const naA = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    const naB = await sessaoNaLoja(ids.gerenteB, ids.lojaB);
    const SALVAR = "select public.cliente_salvar(null, $1::jsonb, null, $2) as v";
    // Desde 14/11 (#76) o cadastro novo pede o WhatsApp: um número diferente em cada loja, para a disputa ser só do CPF.
    const dados = (nome: string) => JSON.stringify({ tipo: "pessoa_fisica", nome, documento, telefone: nome.endsWith("A") ? "41987650301" : "41987650302" });
    await abrir(a, naA);
    await abrir(b, naB);
    const final = await disputa(
      () => a.query(SALVAR, [dados("Cliente na loja A"), "conc:cliente:1"]),
      () => valor(b, SALVAR, [dados("Cliente na loja B"), "conc:cliente:2"]),
    );
    expect(final).toEqual({ erro: "OR026" });
    expect(await contar("select count(*) as n from public.clientes where nome like 'Cliente na loja %'")).toBe(1);
    expect(await contar("select count(*) as n from privado.cliente_dados where documento = $1", [documento])).toBe(1);
  });

  it("entrada de mercadoria e inativação no catálogo ao mesmo tempo, nas duas ordens: nunca sobra estoque em produto ou variação inativos (R1)", async () => {
    // Quatro produtos novos e sem estoque, com uma variação cada, só deste teste (um por disputa).
    const produto = (n: number) => `00000000-0000-4000-9000-0000000000${40 + n}`;
    const variante = (n: number) => `00000000-0000-4000-9000-0000000000${50 + n}`;
    for (const n of [1, 2, 3, 4]) {
      await admin.query("insert into public.produtos (id, organizacao_id, tipo, nome, categoria_id) values ($1, $2, 'acessorio', $3, $4)",
        [produto(n), ids.organizacao, `Película da disputa ${n}`, cat.acessorios]);
      await admin.query("insert into public.variantes (id, organizacao_id, produto_id, sku, nome) values ($1, $2, $3, $4, $5)",
        [variante(n), ids.organizacao, produto(n), `CONC-PEL-${n}`, `Película da disputa ${n}`]);
    }
    const dono = await sessaoNaLoja(ids.dono, ids.lojaA);
    const RECEBER = "select public.estoque_registrar_entrada($1, 'carga_inicial', null, null, $2::jsonb, $3, 'Contagem') as v";
    const INATIVAR_PRODUTO = "select public.catalogo_salvar_produto($1, $2, null, $3, $4, null, null, null, null, false, null, 'Fim de linha') as v";
    const INATIVAR_VARIACAO = "select public.catalogo_salvar_variante($1, $2, $3, $4, null, null, null, 0, false, 'Fim de linha') as v";
    const receber = (cliente: pg.Client, n: number) => valor(cliente, RECEBER, [ids.lojaA, JSON.stringify([{ variante: variante(n), quantidade: 2 }]), `conc:r1:entrada:${n}`]);
    const inativarProduto = (cliente: pg.Client, n: number) => valor(cliente, INATIVAR_PRODUTO, [ids.organizacao, produto(n), `Película da disputa ${n}`, cat.acessorios]);
    const inativarVariacao = (cliente: pg.Client, n: number) => valor(cliente, INATIVAR_VARIACAO, [produto(n), variante(n), `CONC-PEL-${n}`, `Película da disputa ${n}`]);
    const ativos = async (n: number) => (await admin.query<{ produto: boolean; variacao: boolean }>(
      "select p.ativo as produto, v.ativa as variacao from public.variantes v join public.produtos p on p.id = v.produto_id where v.id = $1", [variante(n)])).rows[0];
    let mensagem = "";
    const guardar = (e: Error) => { mensagem = e.message; throw e; };

    // 1. A entrada chega primeiro e segura o produto; a inativação espera e, depois, encontra o estoque que entrou.
    await abrir(a, dono);
    await abrir(b, dono);
    expect(await disputa(() => receber(a, 1), () => inativarProduto(b, 1))).toEqual({ erro: "OR020" });
    expect(await ativos(1)).toEqual({ produto: true, variacao: true });
    expect((await saldo(ids.lojaA, variante(1)))?.quantidade).toBe(2);

    // 2. A inativação do produto chega primeiro; a entrada espera, relê o produto e é recusada. Nada entra.
    await abrir(a, dono);
    await abrir(b, dono);
    expect(await disputa(() => inativarProduto(a, 2), () => receber(b, 2).catch(guardar))).toEqual({ erro: "22023" });
    expect(mensagem).toContain("o produto está inativo no catálogo");
    expect(await ativos(2)).toEqual({ produto: false, variacao: true });
    expect(await saldo(ids.lojaA, variante(2))).toBeUndefined();
    expect(await contar("select count(*) as n from public.entradas_estoque where chave = 'conc:r1:entrada:2'")).toBe(0);

    // 3. A entrada chega primeiro e segura a variação; a inativação da variação espera e encontra o estoque.
    await abrir(a, dono);
    await abrir(b, dono);
    expect(await disputa(() => receber(a, 3), () => inativarVariacao(b, 3))).toEqual({ erro: "OR020" });
    expect(await ativos(3)).toEqual({ produto: true, variacao: true });
    expect((await saldo(ids.lojaA, variante(3)))?.quantidade).toBe(2);

    // 4. A inativação da variação chega primeiro; a entrada espera, relê a variação e é recusada.
    await abrir(a, dono);
    await abrir(b, dono);
    mensagem = "";
    expect(await disputa(() => inativarVariacao(a, 4), () => receber(b, 4).catch(guardar))).toEqual({ erro: "22023" });
    expect(mensagem).toContain("variação inativa");
    expect(await ativos(4)).toEqual({ produto: true, variacao: false });
    expect(await saldo(ids.lojaA, variante(4))).toBeUndefined();

    // Em nenhuma das ordens ficou estoque em produto ou variação inativos.
    expect(await contar(`select count(*) as n from public.estoque_saldos s join public.variantes v on v.id = s.variante_id
      join public.produtos p on p.id = v.produto_id where s.quantidade > 0 and (not v.ativa or not p.ativo)`)).toBe(0);
    expect(await divergencias()).toEqual([]);
  });

  it("duas entradas recebendo de volta o mesmo IMEI estornado: uma reentra, a outra é recusada porque ele já voltou (R1)", async () => {
    const dono = await sessaoNaLoja(ids.dono, ids.lojaA);
    const imei = comDigitoLuhn("35209900172050");
    const RECEBER = "select public.estoque_registrar_entrada($1, 'carga_inicial', null, null, $2::jsonb, $3, 'Contagem') as v";
    const aparelho = JSON.stringify([{ variante: cat.aparelho, identificadores: [imei] }]);
    // Entrada e estorno confirmados antes da disputa: a identidade existe e está baixada.
    await abrir(admin, dono);
    const primeira = await valor<{ id: string }>(admin, RECEBER, [ids.lojaA, aparelho, "conc:r1:reentrada:0"]);
    await admin.query("select public.estoque_estornar_entrada($1, 'Lançada por engano')", [primeira?.id]);
    await admin.query("commit");
    const item = await valor<string>(admin, "select id as v from public.itens_serializados where imei = $1 and situacao = 'baixado'", [imei]);
    expect(item).toBeTruthy();

    await abrir(a, dono);
    await abrir(b, dono);
    let mensagem = "";
    let reentrou: { reentradas: number } | undefined;
    const final = await disputa(
      async () => { reentrou = await valor(a, RECEBER, [ids.lojaA, aparelho, "conc:r1:reentrada:1"]); },
      () => valor(b, RECEBER, [ids.lojaA, aparelho, "conc:r1:reentrada:2"]).catch((e: Error) => { mensagem = e.message; throw e; }),
    );
    expect(reentrou?.reentradas).toBe(1);
    expect(final).toEqual({ erro: "23505" });
    expect(mensagem).toContain("já está no estoque desta loja");
    // Uma identidade, de volta uma vez: três lançamentos (entrada, estorno, reentrada) e um registro de reentrada.
    expect(await contar("select count(*) as n from public.itens_serializados where imei = $1 and em_estoque and situacao = 'disponivel'", [imei])).toBe(1);
    expect(await contar("select count(*) as n from public.estoque_movimentos where item_serializado_id = $1", [item])).toBe(3);
    expect(await contar("select count(*) as n from public.auditoria where acao = 'estoque.item_reentrada' and alvo_id = $1", [item])).toBe(1);
    expect(await contar("select count(*) as n from public.entradas_estoque where chave = 'conc:r1:reentrada:2'")).toBe(0);
    expect(await divergencias()).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Lote R2: o importador do catálogo e o cadastro manual ao mesmo tempo
// -----------------------------------------------------------------------------
// As prévias são geradas e confirmadas antes de cada disputa (administrador); quem aplica e desfaz é o dono.
// Os nomes que diferem só por maiúsculas usam letras sem acento: é o que qualquer configuração do banco iguala.
type LinhaR2 = Record<string, unknown>;
type PreviaR2 = { id: string; numero: number; totais: Record<string, number> };
type AplicadaR2 = { repetida: boolean; atualizada: boolean; comparacao: number; totais: Record<string, number> };
type DesfeitaR2 = { repetida: boolean; desfeitas: number; parciais: number; mantidas: number };
type Salvo = { id: string; repetida: boolean };
const linhaR2 = (numero: number, sku: string, extra: LinhaR2 = {}): LinhaR2 => ({
  numero, sku, nome: `Item ${sku}`, produto: null, tipo: "acessorio", categoria: "Acessórios", marca: null, codigo_barras: null,
  cor: null, capacidade: null, preco: null, custo: null, erros: [], ...extra,
});
const PREVIA_R2 = "select public.importacao_catalogo_previa($1, $2, $3, $4::jsonb, $5::jsonb) as v";
const APLICAR_R2 = "select public.importacao_aplicar($1, $2, $3) as v";
const DESFAZER_R2 = "select public.importacao_desfazer($1, $2) as v";
const CATEGORIA_R2 = "select public.catalogo_salvar_categoria($1, $2, $3, null, 'Organização do catálogo') as v";
const MARCA_R2 = "select public.catalogo_salvar_marca($1, $2, $3, 'Organização do catálogo') as v";
const PRECO_R2 = "select public.preco_definir($1, null, 'loja', $2, null, 'Reajuste') as v";
let arquivosR2 = 0;

// Uma chamada confirmada, como na API: abre, executa como o usuário e confirma (ou desfaz, se falhar).
async function confirmada<T>(sessao: Sessao, sql: string, params: unknown[]): Promise<T> {
  await abrir(admin, sessao);
  try {
    const v = await valor<T>(admin, sql, params);
    await admin.query("commit");
    return v as T;
  } catch (e) {
    await admin.query("rollback");
    throw e;
  }
}
const previaR2 = (adm: Sessao, linhas: LinhaR2[]) => {
  const n = ++arquivosR2;
  return confirmada<PreviaR2>(adm, PREVIA_R2, [ids.organizacao, `disputa-r2-${n}.csv`, (0x52_0000 + n).toString(16).padStart(64, "0"),
    JSON.stringify({ sku: 0, nome: 1, preco: 2 }), JSON.stringify(linhas)]);
};
const quantas = (tabela: "categorias" | "marcas", nome: string) =>
  contar(`select count(*) as n from public.${tabela} where organizacao_id = $1 and lower(nome) = lower($2)`, [ids.organizacao, nome]);
const texto = async (sql: string, params: unknown[]) => valor<string | null>(admin, sql, params);
const doProduto = (campo: "categoria_id" | "marca_id", sku: string) =>
  texto(`select p.${campo} as v from public.variantes v join public.produtos p on p.id = v.produto_id where v.sku = $1`, [sku]);

describe("importador do catálogo e cadastro manual ao mesmo tempo no PostgreSQL 17 (R2)", () => {
  let adm: Sessao;
  let dono: Sessao;
  beforeAll(async () => {
    adm = await sessaoNaLoja(ids.administrador, ids.lojaA);
    dono = await sessaoNaLoja(ids.dono, ids.lojaA);
  });

  it("categoria de mesmo nome (só as maiúsculas mudam) pelo cadastro e pela importação, nas duas ordens: fica uma só (REV-NOV-006)", async () => {
    // 1. O cadastro chega primeiro e segura o nome. A importação espera e, ao continuar, encontra uma categoria
    //    que não existia na conferência: não aplica nada e devolve a prévia para ser conferida de novo.
    const p1 = await previaR2(adm, [linhaR2(2, "CONC-R2-0001", { categoria: "Peliculas R2", preco: 1_500 })]);
    await abrir(a, dono);
    await abrir(b, dono);
    let criada: Salvo | undefined;
    const primeira = await disputa(
      async () => { criada = await valor<Salvo>(a, CATEGORIA_R2, [ids.organizacao, null, "PELICULAS R2"]); },
      () => valor<AplicadaR2>(b, APLICAR_R2, [p1.id, "Conferido", 1]),
    );
    expect(criada?.repetida).toBe(false);
    expect(primeira).toMatchObject({ ok: { repetida: false, atualizada: true, comparacao: 2, totais: { criar: 1, erro: 0 } } });
    expect(await quantas("categorias", "peliculas r2")).toBe(1);
    expect(await contar("select count(*) as n from public.variantes where sku = 'CONC-R2-0001'")).toBe(0);
    // Conferida de novo, a variação entra na categoria que o cadastro criou.
    expect(await confirmada<AplicadaR2>(dono, APLICAR_R2, [p1.id, "Conferido", 2])).toMatchObject({ repetida: false, atualizada: false });
    expect(await quantas("categorias", "peliculas r2")).toBe(1);
    expect(await doProduto("categoria_id", "CONC-R2-0001")).toBe(criada?.id);

    // 2. A importação chega primeiro e cria a categoria. O cadastro espera e recebe a que já existe.
    const p2 = await previaR2(adm, [linhaR2(2, "CONC-R2-0002", { categoria: "capinhas r2" })]);
    await abrir(a, dono);
    await abrir(b, dono);
    const segunda = await disputa(
      () => a.query(APLICAR_R2, [p2.id, "Conferido", 1]),
      () => valor<Salvo>(b, CATEGORIA_R2, [ids.organizacao, null, "CAPINHAS R2"]),
    );
    const daImportacao = await doProduto("categoria_id", "CONC-R2-0002");
    expect(daImportacao).toBeTruthy();
    expect(segunda).toEqual({ ok: { id: daImportacao, repetida: true } });
    expect(await quantas("categorias", "capinhas r2")).toBe(1);

    // 3. A importação chega primeiro; o cadastro tenta RENOMEAR outra categoria para o mesmo nome: recusado.
    const antiga = await confirmada<Salvo>(dono, CATEGORIA_R2, [ids.organizacao, null, "Suportes antigos R2"]);
    const p3 = await previaR2(adm, [linhaR2(2, "CONC-R2-0003", { categoria: "Suportes R2" })]);
    await abrir(a, dono);
    await abrir(b, dono);
    let mensagem = "";
    const terceira = await disputa(
      () => a.query(APLICAR_R2, [p3.id, "Conferido", 1]),
      () => valor<Salvo>(b, CATEGORIA_R2, [ids.organizacao, antiga.id, "SUPORTES R2"]).catch((e: Error) => { mensagem = e.message; throw e; }),
    );
    expect(terceira).toEqual({ erro: "23505" });
    expect(mensagem).toContain("Já existe outra categoria com este nome");
    expect(await quantas("categorias", "suportes r2")).toBe(1);
    expect(await quantas("categorias", "suportes antigos r2")).toBe(1);

    // 4. O cadastro renomeia primeiro; a importação que ia criar o mesmo nome espera e volta para a conferência.
    const p4 = await previaR2(adm, [linhaR2(2, "CONC-R2-0004", { categoria: "grips r2" })]);
    await abrir(a, dono);
    await abrir(b, dono);
    const quarta = await disputa(
      () => a.query(CATEGORIA_R2, [ids.organizacao, antiga.id, "GRIPS R2"]),
      () => valor<AplicadaR2>(b, APLICAR_R2, [p4.id, "Conferido", 1]),
    );
    expect(quarta).toMatchObject({ ok: { repetida: false, atualizada: true, comparacao: 2 } });
    expect(await confirmada<AplicadaR2>(dono, APLICAR_R2, [p4.id, "Conferido", 2])).toMatchObject({ repetida: false, atualizada: false });
    expect(await quantas("categorias", "grips r2")).toBe(1);
    expect(await doProduto("categoria_id", "CONC-R2-0004")).toBe(antiga.id);

    // O índice único do banco é a última barreira: nem escrevendo direto na tabela nasce a segunda.
    await expect(admin.query("insert into public.categorias (organizacao_id, nome) values ($1, 'Grips R2')", [ids.organizacao])).rejects.toMatchObject({ code: "23505" });
  });

  it("marca de mesmo nome (só as maiúsculas mudam) pelo cadastro e pela importação, nas duas ordens: fica uma só (REV-NOV-006)", async () => {
    // 1. O cadastro chega primeiro: a importação espera a marca e volta para a conferência sem aplicar nada.
    const p1 = await previaR2(adm, [linhaR2(2, "CONC-R2-0010", { marca: "Marca Alfa R2" })]);
    await abrir(a, dono);
    await abrir(b, dono);
    let criada: Salvo | undefined;
    const primeira = await disputa(
      async () => { criada = await valor<Salvo>(a, MARCA_R2, [ids.organizacao, null, "MARCA ALFA R2"]); },
      () => valor<AplicadaR2>(b, APLICAR_R2, [p1.id, "Conferido", 1]),
    );
    expect(criada?.repetida).toBe(false);
    expect(primeira).toMatchObject({ ok: { repetida: false, atualizada: true, comparacao: 2 } });
    expect(await contar("select count(*) as n from public.variantes where sku = 'CONC-R2-0010'")).toBe(0);
    expect(await confirmada<AplicadaR2>(dono, APLICAR_R2, [p1.id, "Conferido", 2])).toMatchObject({ repetida: false, atualizada: false });
    expect(await quantas("marcas", "marca alfa r2")).toBe(1);
    expect(await doProduto("marca_id", "CONC-R2-0010")).toBe(criada?.id);

    // 2. A importação chega primeiro e cria a marca: o cadastro espera e recebe a que já existe.
    const p2 = await previaR2(adm, [linhaR2(2, "CONC-R2-0011", { marca: "marca beta r2" })]);
    await abrir(a, dono);
    await abrir(b, dono);
    const segunda = await disputa(
      () => a.query(APLICAR_R2, [p2.id, "Conferido", 1]),
      () => valor<Salvo>(b, MARCA_R2, [ids.organizacao, null, "MARCA BETA R2"]),
    );
    const daImportacao = await doProduto("marca_id", "CONC-R2-0011");
    expect(daImportacao).toBeTruthy();
    expect(segunda).toEqual({ ok: { id: daImportacao, repetida: true } });
    expect(await quantas("marcas", "marca beta r2")).toBe(1);
    await expect(admin.query("insert into public.marcas (organizacao_id, nome) values ($1, 'Marca Beta R2')", [ids.organizacao])).rejects.toMatchObject({ code: "23505" });
  });

  it("duas importações da mesma rede ao mesmo tempo: uma de cada vez, e a segunda confere de novo o que a primeira mudou (REV-NOV-002 e 006)", async () => {
    // 1. A mesma prévia aprovada duas vezes no mesmo instante: aplicada uma vez só.
    const unica = await previaR2(adm, [linhaR2(2, "CONC-R2-0020", { preco: 1_000 })]);
    await abrir(a, dono);
    await abrir(b, dono);
    const dupla = await disputa(
      () => a.query(APLICAR_R2, [unica.id, "Conferido", 1]),
      () => valor<AplicadaR2>(b, APLICAR_R2, [unica.id, "Conferido", 1]),
    );
    expect(dupla).toMatchObject({ ok: { repetida: true, atualizada: false } });
    expect(await contar("select count(*) as n from public.variantes where sku = 'CONC-R2-0020'")).toBe(1);
    expect(await contar("select count(*) as n from public.precos p join public.variantes v on v.id = p.variante_id where v.sku = 'CONC-R2-0020'")).toBe(1);

    // 2. Dois arquivos com o mesmo SKU novo e a mesma categoria nova em caixas diferentes. O segundo espera o
    //    primeiro e volta para a conferência: o SKU agora existe (vira atualização) e a categoria também.
    const um = await previaR2(adm, [linhaR2(2, "CONC-R2-0021", { categoria: "Cabos R2", preco: 1_000 })]);
    const dois = await previaR2(adm, [
      linhaR2(2, "CONC-R2-0021", { categoria: "CABOS R2", preco: 1_200 }),
      linhaR2(3, "CONC-R2-0022", { categoria: "CABOS R2", preco: 900 }),
    ]);
    expect(dois.totais).toMatchObject({ criar: 2, atualizar: 0 });
    await abrir(a, dono);
    await abrir(b, dono);
    const cruzada = await disputa(
      () => a.query(APLICAR_R2, [um.id, "Conferido", 1]),
      () => valor<AplicadaR2>(b, APLICAR_R2, [dois.id, "Conferido", 1]),
    );
    expect(cruzada).toMatchObject({ ok: { repetida: false, atualizada: true, comparacao: 2, totais: { criar: 1, atualizar: 1, erro: 0 } } });
    expect(await contar("select count(*) as n from public.variantes where sku in ('CONC-R2-0021', 'CONC-R2-0022')")).toBe(1);
    expect(await confirmada<AplicadaR2>(dono, APLICAR_R2, [dois.id, "Conferido", 2])).toMatchObject({ repetida: false, atualizada: false });
    expect(await quantas("categorias", "cabos r2")).toBe(1);
    expect(await doProduto("categoria_id", "CONC-R2-0022")).toBe(await doProduto("categoria_id", "CONC-R2-0021"));
    expect(await contar(`select p.valor_centavos as n from public.precos p join public.variantes v on v.id = p.variante_id
      where v.sku = 'CONC-R2-0021' and p.unidade_id is null and p.fim is null and p.cancelado_em is null`)).toBe(1_200);
  });

  it("aplicar e desfazer na mesma rede ao mesmo tempo, nas duas ordens: um espera o outro e o que veio depois é respeitado (REV-NOV-002 e 007)", async () => {
    const nomeDe = (sku: string) => texto("select nome as v from public.variantes where sku = $1", [sku]);
    const corDe = (sku: string) => texto("select cor as v from public.variantes where sku = $1", [sku]);
    const base = await previaR2(adm, [linhaR2(2, "CONC-R2-0030", { nome: "Suporte A", preco: 2_000 }), linhaR2(3, "CONC-R2-0031", { nome: "Suporte B", preco: 2_000 })]);
    await confirmada(dono, APLICAR_R2, [base.id, "Carga", 1]);

    // 1. O desfazer chega primeiro. A importação que conferiu o nome trocado espera e, ao continuar, vê o nome
    //    de volta: a diferença mudou, então nada é aplicado e a prévia volta para a conferência.
    const renomeia = await previaR2(adm, [linhaR2(2, "CONC-R2-0030", { nome: "Suporte A v2" })]);
    await confirmada(dono, APLICAR_R2, [renomeia.id, "Nome novo", 1]);
    const reajusta = await previaR2(adm, [linhaR2(2, "CONC-R2-0030", { nome: "Suporte A v2", preco: 2_500 })]);
    expect(reajusta.totais).toMatchObject({ atualizar: 1 });
    await abrir(a, dono);
    await abrir(b, dono);
    const primeira = await disputa(
      () => a.query(DESFAZER_R2, [renomeia.id, "Nome errado"]),
      () => valor<AplicadaR2>(b, APLICAR_R2, [reajusta.id, "Conferido", 1]),
    );
    expect(primeira).toMatchObject({ ok: { repetida: false, atualizada: true, comparacao: 2 } });
    expect(await nomeDe("CONC-R2-0030")).toBe("Suporte A");
    expect(await texto("select diferencas::text as v from public.importacao_linhas where importacao_id = $1", [reajusta.id])).toContain("nome");

    // 2. A importação chega primeiro e muda a cor e o preço. O desfazer do lote que tinha trocado o nome espera
    //    e volta só o nome: a cor e o preço, que vieram depois, ficam.
    const outroNome = await previaR2(adm, [linhaR2(2, "CONC-R2-0031", { nome: "Suporte B v2" })]);
    await confirmada(dono, APLICAR_R2, [outroNome.id, "Nome novo", 1]);
    const corEPreco = await previaR2(adm, [linhaR2(2, "CONC-R2-0031", { nome: "Suporte B v2", cor: "Preto", preco: 2_700 })]);
    await abrir(a, dono);
    await abrir(b, dono);
    const segunda = await disputa(
      () => a.query(APLICAR_R2, [corEPreco.id, "Conferido", 1]),
      () => valor<DesfeitaR2>(b, DESFAZER_R2, [outroNome.id, "Nome errado"]),
    );
    expect(segunda).toEqual({ ok: { repetida: false, desfeitas: 1, parciais: 0, mantidas: 0 } });
    expect(await nomeDe("CONC-R2-0031")).toBe("Suporte B");
    expect(await corDe("CONC-R2-0031")).toBe("Preto");
    expect(await contar(`select p.valor_centavos as n from public.precos p join public.variantes v on v.id = p.variante_id
      where v.sku = 'CONC-R2-0031' and p.unidade_id is null and p.fim is null and p.cancelado_em is null`)).toBe(2_700);
  });

  it("preço manual e importação na mesma variação ao mesmo tempo: o preço que alguém decidiu não é atropelado nem desfeito (REV-NOV-002 e 007)", async () => {
    const idDe = async (sku: string) => (await texto("select id as v from public.variantes where sku = $1", [sku])) ?? "";
    const precos = async (sku: string) => (await admin.query<{ valor: string; aberto: boolean; origem: string }>(
      `select p.valor_centavos as valor, p.fim is null as aberto, p.origem from public.precos p join public.variantes v on v.id = p.variante_id
       where v.sku = $1 and p.unidade_id is null and p.cancelado_em is null order by p.inicio`, [sku])).rows.map((p) => [Number(p.valor), p.aberto, p.origem]);
    const base = await previaR2(adm, [40, 41, 42, 43].map((n, i) => linhaR2(i + 2, `CONC-R2-00${n}`, { preco: 5_000 })));
    await confirmada(dono, APLICAR_R2, [base.id, "Carga", 1]);

    // 1. O dono muda o preço primeiro. A importação, conferida contra o preço antigo, espera e volta para a
    //    conferência: o preço manual fica, e só entra o do arquivo depois de conferido contra ele.
    const p1 = await previaR2(adm, [linhaR2(2, "CONC-R2-0040", { preco: 5_500 })]);
    await abrir(a, dono);
    await abrir(b, dono);
    const primeira = await disputa(
      async () => a.query(PRECO_R2, [await idDe("CONC-R2-0040"), 6_000]),
      () => valor<AplicadaR2>(b, APLICAR_R2, [p1.id, "Conferido", 1]),
    );
    expect(primeira).toMatchObject({ ok: { repetida: false, atualizada: true, comparacao: 2, totais: { atualizar: 1 } } });
    expect(await precos("CONC-R2-0040")).toEqual([[5_000, false, "importacao"], [6_000, true, "manual"]]);
    expect(await confirmada<AplicadaR2>(dono, APLICAR_R2, [p1.id, "Conferido", 2])).toMatchObject({ repetida: false, atualizada: false });
    expect(await precos("CONC-R2-0040")).toEqual([[5_000, false, "importacao"], [6_000, false, "manual"], [5_500, true, "importacao"]]);

    // 2. A importação muda o preço primeiro; o preço manual, que tinha começado antes, espera. Ao continuar,
    //    o preço vigente já é o do lote, mais novo que o pedido: o banco pede para tentar de novo, e na nova
    //    tentativa o preço manual entra por cima do preço do lote.
    const p2 = await previaR2(adm, [linhaR2(2, "CONC-R2-0041", { preco: 5_500 })]);
    await abrir(a, dono);
    await abrir(b, dono);
    let mensagem = "";
    const segunda = await disputa(
      () => a.query(APLICAR_R2, [p2.id, "Conferido", 1]),
      async () => valor<Salvo>(b, PRECO_R2, [await idDe("CONC-R2-0041"), 6_000]).catch((e: Error) => { mensagem = e.message; throw e; }),
    );
    expect({ segunda, mensagem }).toEqual({ segunda: { erro: "40001" }, mensagem: "Outro preço começou neste mesmo instante: tente de novo" });
    expect(await precos("CONC-R2-0041")).toEqual([[5_000, false, "importacao"], [5_500, true, "importacao"]]);
    expect(await confirmada<Salvo>(dono, PRECO_R2, [await idDe("CONC-R2-0041"), 6_000])).toMatchObject({ repetida: false });
    expect(await precos("CONC-R2-0041")).toEqual([[5_000, false, "importacao"], [5_500, false, "importacao"], [6_000, true, "manual"]]);

    // 3. O mesmo, com o preço manual começando depois de a importação ter gravado: espera e entra direto.
    const p3 = await previaR2(adm, [linhaR2(2, "CONC-R2-0042", { preco: 5_500 })]);
    await abrir(a, dono);
    const terceira = await disputa(
      async () => { await a.query(APLICAR_R2, [p3.id, "Conferido", 1]); await abrir(b, dono); },
      async () => valor<Salvo>(b, PRECO_R2, [await idDe("CONC-R2-0042"), 6_000]),
    );
    expect(terceira).toMatchObject({ ok: { repetida: false } });
    expect(await precos("CONC-R2-0042")).toEqual([[5_000, false, "importacao"], [5_500, false, "importacao"], [6_000, true, "manual"]]);

    // 4. O dono muda o preço e, no mesmo instante, alguém desfaz o lote que tinha posto o preço anterior: o
    //    desfazer espera e mantém o preço manual, que é posterior ao lote.
    const p4 = await previaR2(adm, [linhaR2(2, "CONC-R2-0043", { preco: 5_500 })]);
    await confirmada(dono, APLICAR_R2, [p4.id, "Conferido", 1]);
    await abrir(a, dono);
    await abrir(b, dono);
    const quarta = await disputa(
      async () => a.query(PRECO_R2, [await idDe("CONC-R2-0043"), 6_000]),
      () => valor<DesfeitaR2>(b, DESFAZER_R2, [p4.id, "Lote errado"]),
    );
    expect(quarta).toEqual({ ok: { repetida: false, desfeitas: 0, parciais: 0, mantidas: 1 } });
    expect(await texto("select desfeito -> 'mantidos' ->> 'preco' as v from public.importacao_linhas where importacao_id = $1", [p4.id])).toBe("alterado_depois");
    expect(await precos("CONC-R2-0043")).toEqual([[5_000, false, "importacao"], [5_500, false, "importacao"], [6_000, true, "manual"]]);
  });

  it("dois preços manuais na mesma variação, o que começou antes chega depois: recebe \"tente de novo\" (ou o próprio preço, se o valor é o mesmo), nunca \"mudança agendada\" (R2)", async () => {
    const base = await previaR2(adm, [linhaR2(2, "CONC-R2-0050", { preco: 5_000 }), linhaR2(3, "CONC-R2-0051", { preco: 5_000 })]);
    await confirmada(dono, APLICAR_R2, [base.id, "Carga", 1]);
    const idDe = async (sku: string) => (await texto("select id as v from public.variantes where sku = $1", [sku])) ?? "";
    const abertos = async (sku: string) => (await admin.query<{ valor: string }>(
      `select p.valor_centavos as valor from public.precos p join public.variantes v on v.id = p.variante_id
       where v.sku = $1 and p.unidade_id is null and p.fim is null and p.cancelado_em is null`, [sku])).rows.map((p) => Number(p.valor));

    // A transação de "b" começa antes da de "a", mas "a" grava primeiro. Para "b", o preço de "a" começa depois
    // do seu "agora": não é mudança agendada, é outra decisão que chegou no mesmo instante.
    await abrir(b, dono);
    await abrir(a, dono);
    let mensagem = "";
    const outroValor = await disputa(
      async () => a.query(PRECO_R2, [await idDe("CONC-R2-0050"), 6_000]),
      async () => valor<Salvo>(b, PRECO_R2, [await idDe("CONC-R2-0050"), 7_000]).catch((e: Error) => { mensagem = e.message; throw e; }),
    );
    expect({ outroValor, mensagem }).toEqual({ outroValor: { erro: "40001" }, mensagem: "Outro preço começou neste mesmo instante: tente de novo" });
    expect(await abertos("CONC-R2-0050")).toEqual([6_000]);

    await abrir(b, dono);
    await abrir(a, dono);
    let primeiro: Salvo | undefined;
    const mesmoValor = await disputa(
      async () => { primeiro = await valor<Salvo>(a, PRECO_R2, [await idDe("CONC-R2-0051"), 6_000]); },
      async () => valor<Salvo>(b, PRECO_R2, [await idDe("CONC-R2-0051"), 6_000]),
    );
    expect(primeiro?.repetida).toBe(false);
    expect(mesmoValor).toEqual({ ok: { id: primeiro?.id, repetida: true } });
    expect(await abertos("CONC-R2-0051")).toEqual([6_000]);
  });
});

// -----------------------------------------------------------------------------
// Lote R2: o arquivo no limite (2.000 linhas) contra o limite de 8 s por chamada da API
// -----------------------------------------------------------------------------
// O papel authenticated do Supabase tem statement_timeout de 8 s. Cada chamada é medida do começo à
// confirmação num PostgreSQL 17 local: é a medida que sustenta o limite de 2.000 linhas por arquivo.
// Para ver os tempos: ORA5G_TEMPOS=1 npm --workspace @ora5g/banco exec -- vitest run src/concorrencia.test.ts -t "2.000 linhas" --silent=false
describe("arquivo no limite de 2.000 linhas no PostgreSQL 17 (R2)", () => {
  it("prévia, comparação refeita, aplicação e desfazer de 2.000 linhas cabem, cada chamada, em 8 s", async () => {
    const adm = await sessaoNaLoja(ids.administrador, ids.lojaA);
    const dono = await sessaoNaLoja(ids.dono, ids.lojaA);
    const LINHAS = 2_000;
    const LIMITE_MS = 8_000;
    const tempos: [string, number][] = [];
    const medir = async <T>(nome: string, chamada: () => Promise<T>) => {
      const inicio = performance.now();
      const resultado = await chamada();
      tempos.push([nome, Math.round(performance.now() - inicio)]);
      return resultado;
    };
    const arquivo = (prefixo: string, extra: (i: number) => LinhaR2) =>
      Array.from({ length: LINHAS }, (_, i) => linhaR2(i + 2, `${prefixo}-${String(i).padStart(4, "0")}`, extra(i)));
    const enviar = (n: number, linhas: LinhaR2[]) => confirmada<PreviaR2 & { repetida: boolean; atualizada: boolean }>(adm, PREVIA_R2, [
      ids.organizacao, `limite-r2-${n}.csv`, (0x52_9000 + n).toString(16).padStart(64, "0"), JSON.stringify({ sku: 0, nome: 1, preco: 2 }), JSON.stringify(linhas)]);
    const aplicar = (id: string) => confirmada<AplicadaR2>(dono, APLICAR_R2, [id, "Carga do catálogo", 1]);
    const desfazer = (id: string) => confirmada<DesfeitaR2>(dono, DESFAZER_R2, [id, "Planilha errada"]);
    const doLote = (prefixo: string, condicao: string) =>
      contar(`select count(*) as n from public.variantes v where v.organizacao_id = $1 and v.sku like $2 and ${condicao}`, [ids.organizacao, `${prefixo}-%`]);
    const PRECO_ABERTO = "(select p.valor_centavos from public.precos p where p.variante_id = v.id and p.unidade_id is null and p.fim is null and p.cancelado_em is null)";

    // 1. Tudo novo: 2.000 modelos, 20 categorias e 25 marcas que não existiam, código de barras, preço e custo.
    const novas = arquivo("LIMITE-R2-A", (i) => ({
      nome: `Capa modelo ${i}`, categoria: `Limite R2 categoria ${i % 20}`, marca: `Limite R2 marca ${i % 25}`,
      codigo_barras: String(7_890_100_000_000 + i), cor: "Preto", preco: 2_000 + i, custo: 800 + i,
    }));
    const previaNovas = await medir("prévia de 2.000 linhas a criar", () => enviar(1, novas));
    expect(previaNovas.totais).toMatchObject({ criar: LINHAS, atualizar: 0, erro: 0 });
    expect(await medir("aplicação de 2.000 linhas a criar", () => aplicar(previaNovas.id))).toMatchObject({ repetida: false, atualizada: false });
    expect(await doLote("LIMITE-R2-A", `v.ativa and ${PRECO_ABERTO} between 2000 and 3999`)).toBe(LINHAS);
    expect(await contar("select count(*) as n from public.categorias where organizacao_id = $1 and nome like 'Limite R2 categoria %'", [ids.organizacao])).toBe(20);
    expect(await contar("select count(*) as n from public.marcas where organizacao_id = $1 and nome like 'Limite R2 marca %'", [ids.organizacao])).toBe(25);

    // 2. Tudo muda: nome, cor, código de barras, preço e custo das 2.000 (2.000 travas de preço na aplicação e no desfazer).
    const mudadas = arquivo("LIMITE-R2-A", (i) => ({
      nome: `Capa modelo ${i} reforçada`, categoria: `Limite R2 categoria ${i % 20}`, marca: `Limite R2 marca ${i % 25}`,
      codigo_barras: String(7_890_200_000_000 + i), cor: "Azul", preco: 2_500 + i, custo: 900 + i,
    }));
    const previaMudadas = await medir("prévia de 2.000 linhas a atualizar", () => enviar(2, mudadas));
    expect(previaMudadas.totais).toMatchObject({ criar: 0, atualizar: LINHAS, erro: 0 });
    // O mesmo arquivo enviado de novo: as 2.000 linhas são comparadas outra vez com o cadastro e nada mudou.
    expect(await medir("comparação refeita de 2.000 linhas", () => enviar(2, mudadas))).toMatchObject({ id: previaMudadas.id, repetida: true, atualizada: false });
    expect(await medir("aplicação de 2.000 linhas a atualizar", () => aplicar(previaMudadas.id))).toMatchObject({ repetida: false, atualizada: false });
    expect(await doLote("LIMITE-R2-A", `v.cor = 'Azul' and v.nome like '% reforçada' and ${PRECO_ABERTO} between 2500 and 4499`)).toBe(LINHAS);
    expect(await medir("desfazer de 2.000 linhas atualizadas", () => desfazer(previaMudadas.id))).toEqual({ repetida: false, desfeitas: LINHAS, parciais: 0, mantidas: 0 });
    expect(await doLote("LIMITE-R2-A", `v.cor = 'Preto' and v.nome not like '% reforçada' and ${PRECO_ABERTO} between 2000 and 3999`)).toBe(LINHAS);

    // 3. Criar e tirar de circulação: outras 2.000, em categoria que já existe, criadas e desfeitas sem uso.
    const outras = arquivo("LIMITE-R2-C", (i) => ({ nome: `Película modelo ${i}`, preco: 1_000 + i, custo: 300 + i }));
    const previaOutras = await medir("prévia de outras 2.000 a criar", () => enviar(3, outras));
    expect(previaOutras.totais).toMatchObject({ criar: LINHAS, erro: 0 });
    expect(await medir("aplicação de outras 2.000 a criar", () => aplicar(previaOutras.id))).toMatchObject({ repetida: false, atualizada: false });
    expect(await medir("desfazer de 2.000 linhas criadas", () => desfazer(previaOutras.id))).toEqual({ repetida: false, desfeitas: LINHAS, parciais: 0, mantidas: 0 });
    expect(await doLote("LIMITE-R2-C", `not v.ativa and ${PRECO_ABERTO} is null`)).toBe(LINHAS);

    if (process.env.ORA5G_TEMPOS === "1") console.info("R2, 2.000 linhas, ms por chamada:", JSON.stringify(Object.fromEntries(tempos)));
    expect(tempos.filter(([, ms]) => ms >= LIMITE_MS)).toEqual([]);
    expect(await divergencias()).toEqual([]);
  }, 180_000);

  // O teto de travas consultivas de uma aplicação (privado.importacao_conferir_travas): 2.500 além da trava da rede.
  // O servidor do teste tem a tabela de travas do tamanho da do ora5g-dev (ver postgres-real.ts).
  it("o arquivo que pediria mais de 2.500 travas é recusado na prévia e na aplicação; no teto, passa", async () => {
    const adm = await sessaoNaLoja(ids.administrador, ids.lojaA);
    const dono = await sessaoNaLoja(ids.dono, ids.lojaA);
    const TETO = 2_500;
    expect(await valor<number>(admin, `select current_setting('max_locks_per_transaction')::int * (current_setting('max_connections')::int
      + current_setting('autovacuum_max_workers')::int + 1 + current_setting('max_worker_processes')::int
      + current_setting('max_wal_senders')::int + current_setting('max_prepared_transactions')::int) as v`, [])).toBe(4_800);
    const enviar = (n: number, linhas: LinhaR2[]) => confirmada<PreviaR2 & { repetida: boolean; atualizada: boolean }>(adm, PREVIA_R2, [
      ids.organizacao, `teto-r2-${n}.csv`, (0x52_a000 + n).toString(16).padStart(64, "0"), JSON.stringify({ sku: 0, nome: 1, preco: 2 }), JSON.stringify(linhas)]);
    const aplicar = (id: string, comparacao: number) => confirmada<AplicadaR2>(dono, APLICAR_R2, [id, "Carga do catálogo", comparacao]);
    // Cada linha a criar com a sua categoria e a sua marca: duas travas por linha.
    const proprias = (prefixo: string, linhas: number) => Array.from({ length: linhas }, (_, i) => linhaR2(i + 2, `${prefixo}-${String(i).padStart(4, "0")}`,
      { categoria: `Teto R2 categoria ${prefixo} ${i}`, marca: `Teto R2 marca ${prefixo} ${i}`, preco: 1_000 + i }));
    const criadas = async (prefixo: string) => [
      await contar("select count(*) as n from public.categorias where organizacao_id = $1 and nome like $2", [ids.organizacao, `Teto R2 categoria ${prefixo} %`]),
      await contar("select count(*) as n from public.marcas where organizacao_id = $1 and nome like $2", [ids.organizacao, `Teto R2 marca ${prefixo} %`]),
    ];
    const recusada = { code: "22023", message: expect.stringContaining("divida a planilha") };

    // 1. Uma trava a mais que o teto (1.251 categorias e 1.250 marcas): a prévia recusa e não grava nada.
    const aMais = [...proprias("TETO-R2-A", TETO / 2), linhaR2(TETO / 2 + 2, "TETO-R2-A-MAIS", { categoria: "Teto R2 categoria TETO-R2-A a mais" })];
    await expect(enviar(1, aMais)).rejects.toMatchObject(recusada);
    expect(await contar("select count(*) as n from public.importacoes where arquivo_nome = 'teto-r2-1.csv'", [])).toBe(0);

    // 2. No teto exato (1.250 categorias e 1.250 marcas): a prévia passa, a aplicação pega as 2.500 travas e cria tudo.
    const noTeto = await enviar(2, proprias("TETO-R2-B", TETO / 2));
    expect(noTeto.totais).toMatchObject({ criar: TETO / 2, erro: 0 });
    expect(await aplicar(noTeto.id, 1)).toMatchObject({ repetida: false, atualizada: false });
    expect(await criadas("TETO-R2-B")).toEqual([TETO / 2, TETO / 2]);

    // 3. A comparação cresce depois da prévia. O arquivo fica no teto e traz uma variação que já existe, sem mudança;
    //    o dono muda o preço dela antes da aplicação. A primeira tentativa volta para a conferência (a comparação
    //    nova pede a trava desse preço, a 2.501ª); a segunda, já com a comparação nova, é recusada antes de travar.
    const umaSo = await enviar(3, [linhaR2(2, "TETO-R2-P", { preco: 1_000 })]);
    await aplicar(umaSo.id, 1);
    const cheio = [...proprias("TETO-R2-C", TETO / 2), linhaR2(TETO / 2 + 2, "TETO-R2-P", { preco: 1_000 })];
    const previa = await enviar(4, cheio);
    expect(previa.totais).toMatchObject({ criar: TETO / 2, atualizar: 0, sem_mudanca: 1, erro: 0 });
    await confirmada<Salvo>(dono, PRECO_R2, [await texto("select id as v from public.variantes where sku = 'TETO-R2-P'", []), 1_100]);
    expect(await aplicar(previa.id, 1)).toMatchObject({ repetida: false, atualizada: true, comparacao: 2 });
    await expect(aplicar(previa.id, 2)).rejects.toMatchObject(recusada);
    // O mesmo arquivo enviado de novo é comparado outra vez e recusado pelo mesmo motivo; a prévia continua guardada.
    await expect(enviar(4, cheio)).rejects.toMatchObject(recusada);
    expect(await criadas("TETO-R2-C")).toEqual([0, 0]);
    expect(await contar("select count(*) as n from public.importacoes where id = $1 and situacao = 'previa' and comparacao = 2", [previa.id])).toBe(1);
    expect(await divergencias()).toEqual([]);
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------
// Painéis do Início (G1): quem lê o painel não espera a venda dos outros nem vê venda pela metade.
type GraoDoPainel = Record<string, string | number | null>;
type PainelDeVendas = {
  totais: Record<string, number>; periodos: GraoDoPainel[]; tipos: GraoDoPainel[]; categorias: GraoDoPainel[]; lojas: GraoDoPainel[]; vendedores: GraoDoPainel[];
};

describe("painel de vendas lido enquanto uma venda é concluída no PostgreSQL 17 (G1)", () => {
  it("a venda que outra conexão ainda não confirmou não aparece em nenhum grão, a leitura não espera por ela e, confirmada, aparece inteira", async () => {
    // Loja nova, só deste teste, com dez capas no estoque.
    const lojaF = "00000000-0000-4000-8000-000000000028";
    await admin.query("insert into public.unidades (id, organizacao_id, empresa_id, codigo, nome, tipo, cnpj) values ($1, $2, $3, 'conc-loja-f', 'Loja F', 'loja_fisica', $4)",
      [lojaF, ids.organizacao, ids.empresa, cnpj(RAIZ, "0006")]);
    await admin.query("select privado.lancar_movimento($1, $2, 10, 'entrada_compra', null, null, null, null, 'conc:painel:entrada')", [lojaF, cat.capa]);
    const dono = await sessaoNaLoja(ids.dono, lojaF);
    const ler = async () => {
      await abrir(b, dono);
      const painel = await valor<PainelDeVendas>(b, "select public.vendas_painel(now() - interval '1 day', now() + interval '1 day', $1) as v", [lojaF]);
      await b.query("commit");
      if (!painel) throw new Error("o painel não respondeu");
      return painel;
    };
    const somar = (grao: GraoDoPainel[], campo: string) => grao.reduce((s, l) => s + Number(l[campo] ?? 0), 0);
    const fecha = (painel: PainelDeVendas) => {
      for (const grao of [painel.periodos, painel.tipos, painel.categorias, painel.lojas, painel.vendedores]) expect(somar(grao, "vendido")).toBe(painel.totais.vendido);
    };

    // Uma venda confirmada: duas capas, dois pagamentos (R$ 158,00).
    await abrir(a, dono);
    await a.query("select public.abrir_caixa(0, 'conc:painel:caixa')");
    const primeira = await valor<string>(a, "select public.criar_venda('conc:painel:venda:1') as v", []);
    await a.query("select public.adicionar_item($1, $2, null, 2, 'conc:painel:item:1')", [primeira, cat.capa]);
    await a.query(
      `select public.concluir_venda($1, '[{"meio":"dinheiro","valor":10000},{"meio":"pix_direto","valor":5800,"comprovante":"E2E-FICTICIO-1"}]'::jsonb, '{}'::jsonb, 'conc:painel:concluir:1')`,
      [primeira],
    );
    await a.query("commit");
    const antes = await ler();
    expect(antes.totais).toMatchObject({ vendas: 1, vendido: 15_800 });
    fecha(antes);

    // A segunda venda é concluída e a conexão segura a transação aberta, com a venda, o estoque e o
    // caixa travados. O painel responde assim mesmo (se esperasse a trava, o teste pararia aqui) e
    // não traz nenhum pedaço da venda que ainda não foi confirmada.
    await abrir(a, dono);
    const segunda = await valor<string>(a, "select public.criar_venda('conc:painel:venda:2') as v", []);
    await a.query("select public.adicionar_item($1, $2, null, 1, 'conc:painel:item:2')", [segunda, cat.capa]);
    await a.query(`select public.concluir_venda($1, '[{"meio":"dinheiro","valor":7900}]'::jsonb, '{}'::jsonb, 'conc:painel:concluir:2')`, [segunda]);
    expect(await ler()).toEqual(antes);
    await a.query("commit");

    // Confirmada, entra de uma vez em todos os grãos.
    const depois = await ler();
    expect(depois.totais).toMatchObject({ vendas: 2, vendido: 23_700, subtotal: 23_700, descontos: 0 });
    expect(depois.tipos).toEqual([expect.objectContaining({ tipo: "acessorio", itens: 3, vendido: 23_700 })]);
    expect(depois.lojas).toEqual([expect.objectContaining({ unidade_id: lojaF, nome: "Loja F", vendas: 2, vendido: 23_700 })]);
    expect(depois.vendedores).toEqual([expect.objectContaining({ vendedor_id: ids.dono, vendas: 2, vendido: 23_700 })]);
    fecha(depois);
    expect(await divergencias()).toEqual([]);
  });
});

// Correção de 14/11/2026 (#83, REV-PLAN-002): o repasse da financeira e o cancelamento da venda ao mesmo tempo.
// O registro e o desfazer do repasse travam a venda antes da conta, como o cancelamento: um espera o outro e
// a conta nunca fica aberta (crédito exigível) numa venda cancelada.
describe("repasse da financeira e cancelamento da venda ao mesmo tempo no PostgreSQL 17 (#83)", () => {
  const RECEBER = "select public.financeira_receber($1, $2, $3, $4::date) as v";
  const DESFAZER = "select public.financeira_desfazer_recebimento($1, $2) as v";
  const CANCELAR = "select public.cancelar_venda($1, 'Cliente desistiu') as v";
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  let ana: Sessao;
  let dono: Sessao;
  let n = 0;
  beforeAll(async () => {
    ana = await sessaoNaLoja(ids.vendedorA, ids.lojaA);
    dono = await sessaoNaLoja(ids.dono, ids.lojaA);
    for (const s of [ana, dono]) await confirmada(s, "select public.abrir_caixa(50000, $1) as v", [`conc:83:caixa:${s.usuario}`]).catch(() => undefined);
  });
  // Uma venda de aparelho financiada pela PayJoy, com a entrada em Pix (o cancelamento não precisa de dinheiro no caixa).
  async function financiada() {
    const k = ++n;
    const item = await valor<string>(admin, ENTRADA, [ids.lojaA, cat.aparelho, comDigitoLuhn(`35209900183${String(k).padStart(3, "0")}`), null, `conc:83:entrada:${k}`]);
    const venda = await confirmada<string>(ana, "select public.criar_venda($1) as v", [`conc:83:venda:${k}`]);
    await confirmada(ana, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda, cat.aparelho, item, `conc:83:item:${k}`]);
    await confirmada(ana, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v", [venda,
      JSON.stringify([{ meio: "payjoy", valor: 149_900, entrada: 20_000, meio_entrada: "pix_direto", comprovante: `E2E-FICTICIO-83-${k}` }]),
      JSON.stringify({ nome: "Cliente Teste", email: "cliente@teste.invalid" }), `conc:83:concluir:${k}`]);
    const conta = await valor<string>(admin, "select id as v from public.contas_a_receber where venda_id = $1", [venda]);
    return { venda, conta: conta as string };
  }
  const situacao = (conta: string) => valor<string>(admin, "select situacao as v from public.contas_a_receber where id = $1", [conta]);
  const comoDono = async (cliente: pg.Client) => abrir(cliente, dono);

  it("desfazer o repasse e cancelar a venda ao mesmo tempo, nas duas ordens: a conta termina cancelada e não recebe outro repasse", async () => {
    // 1) O cancelamento segura a venda; o desfazer espera, vê a venda cancelada e deixa a conta cancelada.
    const f1 = await financiada();
    await confirmada(dono, RECEBER, [f1.conta, "REPASSE-83-1", 125_000, hoje]);
    await comoDono(a);
    const r1 = await disputa(() => valor(a, CANCELAR, [f1.venda]), async () => { await comoDono(b); return valor<boolean>(b, DESFAZER, [f1.conta, "Referência errada"]); });
    expect(r1).toEqual({ ok: true });
    expect(await situacao(f1.conta)).toBe("cancelada");
    // 2) O desfazer segura; o cancelamento espera e cancela a conta que tinha voltado a ficar aberta.
    const f2 = await financiada();
    await confirmada(dono, RECEBER, [f2.conta, "REPASSE-83-2", 125_000, hoje]);
    await comoDono(a);
    const r2 = await disputa(() => valor(a, DESFAZER, [f2.conta, "Referência errada"]), async () => { await comoDono(b); return valor<boolean>(b, CANCELAR, [f2.venda]); });
    expect(r2).toEqual({ ok: true });
    expect(await situacao(f2.conta)).toBe("cancelada");
    for (const f of [f1, f2]) {
      await expect(confirmada(dono, RECEBER, [f.conta, "REPASSE-83-NOVO", 124_000, hoje])).rejects.toMatchObject({ code: "22023" });
    }
  });

  it("registrar o repasse e cancelar a venda ao mesmo tempo, nas duas ordens: depois do cancelamento é recusado; antes, fica recebido e o desfazer cancela", async () => {
    const f1 = await financiada();
    await comoDono(a);
    const r1 = await disputa(() => valor(a, CANCELAR, [f1.venda]), async () => { await comoDono(b); return valor<boolean>(b, RECEBER, [f1.conta, "REPASSE-83-3", 125_000, hoje]); });
    expect(r1).toEqual({ erro: "22023" });
    expect(await situacao(f1.conta)).toBe("cancelada");
    const f2 = await financiada();
    await comoDono(a);
    const r2 = await disputa(() => valor(a, RECEBER, [f2.conta, "REPASSE-83-4", 125_000, hoje]), async () => { await comoDono(b); return valor<boolean>(b, CANCELAR, [f2.venda]); });
    expect(r2).toEqual({ ok: true });
    // A financeira pagou antes do cancelamento: a conta continua recebida (o acerto do contrato fica no estorno a confirmar).
    expect(await situacao(f2.conta)).toBe("recebida");
    expect(await confirmada(dono, DESFAZER, [f2.conta, "Repasse lançado na venda errada"])).toBe(true);
    expect(await situacao(f2.conta)).toBe("cancelada");
    expect(await divergencias()).toEqual([]);
  });
});
