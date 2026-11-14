// Lote L10b (14/11/2026, ORA-FISC-008 em parte; migration 20261114230000_conciliacao_fiscal): a conciliação das vendas
// com as notas (os quatro grupos de venda, o que falta guardar, a nota de devolução, o prazo de alerta) e as divergências
// que não dependem de regra do contador, com a conferência de quem aprova nota. Dados FICTÍCIOS; nada é emitido.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
const cnpj: Record<string, string> = {};
// O período "este mês" e os meses (AAMM) de agora, do mês anterior e do seguinte, no fuso de São Paulo.
let mes = { inicio: "", fim: "", aamm: "", anterior: "", seguinte: "", semana: "" };
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  for (const u of (await db.query<{ id: string; cnpj: string }>("select id, cnpj from public.unidades where id in ($1, $2)", [ids.lojaA, ids.lojaB])).rows) {
    cnpj[u.id] = u.cnpj;
  }
  mes = (await db.query<typeof mes>(`
    select to_char(date_trunc('month', now() at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD') as inicio,
           to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as fim,
           to_char(now() at time zone 'America/Sao_Paulo', 'YYMM') as aamm,
           to_char((now() at time zone 'America/Sao_Paulo') - interval '1 month', 'YYMM') as anterior,
           to_char((now() at time zone 'America/Sao_Paulo') + interval '1 month', 'YYMM') as seguinte,
           to_char((now() at time zone 'America/Sao_Paulo') - interval '6 days', 'YYYY-MM-DD') as semana`)).rows[0] as typeof mes;
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
  const s = { usuario, sessao: `49000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

// Chave de acesso fictícia no padrão nacional (cUF 43, AAMM, CNPJ, modelo, série 1, número, emissão normal, código), com
// o dígito calculado aqui (oráculo independente do banco).
function chaveDeAcesso(cnpjDaLoja: string, numero: number, aamm: string, codigo = "12345678", modelo = "65") {
  const base = `43${aamm}${cnpjDaLoja}${modelo}001${String(numero).padStart(9, "0")}1${codigo}`;
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return base + String(resto < 2 ? 0 : 11 - resto);
}

// Uma capa (R$ 79,00) vendida e paga em dinheiro por quem está na loja.
async function vendaConcluida(s: Sessao) {
  const aberto = await db.query("select 1 from public.caixas where operador_id = $1 and situacao = 'aberto'", [s.usuario]);
  if (aberto.rows.length === 0) await valor(s, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  const item = await valor<string>(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [venda, chave("concluir")]);
  const numero = (await db.query<{ numero: number }>("select numero from public.vendas where id = $1", [venda])).rows[0]?.numero as number;
  return { venda, item, numero };
}
const SOLICITAR = "select public.notas_solicitar($1, '{}'::jsonb, $2) as v";
const pedirNota = (s: Sessao, venda: string) => valor<string>(s, SOLICITAR, [venda, chave("nota")]);
const emitir = (s: Sessao, pedido: string, chaveDeAcessoDaNota: string) =>
  valor(s, "select public.notas_registrar_emissao($1, $2, null) as v", [pedido, chaveDeAcessoDaNota]);
const CONCILIAR = "select public.notas_conciliacao($1::date, $2::date, $3) as v";
type Conciliacao = Record<string, unknown> & {
  resumo: Record<string, number>; por_loja: (Record<string, unknown> & { unidade: string })[]; lojas: { id: string; nome: string }[];
  tempo: { emitidas: number; media_minutos: number | null; maior_minutos: number | null };
  sem_pedido: Record<string, unknown>[]; em_andamento: Record<string, unknown>[]; devolucoes_pendentes: Record<string, unknown>[];
  sem_documento: Record<string, unknown>[]; divergencias: Record<string, unknown>[];
};
const conciliar = (s: Sessao, unidade: string | null = null, inicio = mes.inicio, fim = mes.fim) => valor<Conciliacao>(s, CONCILIAR, [inicio, fim, unidade]);
// Guardar o PDF ou o XML da nota (o arquivo chega ao Storage como a pessoa logada; o servidor já conferiu o conteúdo).
let arquivos = 0;
async function guardar(s: Sessao, pedido: string, tipo: "pdf" | "xml", protocolo: string | null) {
  const caminho = `${ids.organizacao}/${ids.lojaA}/${pedido}/00000000-0000-4000-a000-${String(++arquivos).padStart(12, "0")}.${tipo}`;
  await comoUsuario(db, s, () => db.query("insert into storage.objects (bucket_id, name, metadata) values ('notas', $1, $2)",
    [caminho, JSON.stringify({ size: 20_000, mimetype: tipo === "pdf" ? "application/pdf" : "application/xml" })]));
  await valor(s, "select public.notas_anexar_documento($1, $2, $3, $4, $5) as v", [pedido, tipo, caminho, "c".repeat(64), protocolo]);
}
const PROTOCOLO = "141260000123456";

describe("conciliação das vendas com as notas (L10b)", () => {
  it("separa as vendas do período em quatro grupos por loja, soma o valor e lista o que resolver", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    // Com nota, PDF, XML e protocolo: nada a resolver.
    const completa = await vendaConcluida(ana);
    const pedidoCompleto = await pedirNota(ana, completa.venda);
    await emitir(dono, pedidoCompleto, chaveDeAcesso(cnpj[ids.lojaA] as string, 801, mes.aamm));
    await guardar(dono, pedidoCompleto, "pdf", PROTOCOLO);
    await guardar(dono, pedidoCompleto, "xml", PROTOCOLO);
    // Com nota, sem nada guardado.
    const semDocumento = await vendaConcluida(ana);
    const pedidoSemDocumento = await pedirNota(ana, semDocumento.venda);
    await emitir(dono, pedidoSemDocumento, chaveDeAcesso(cnpj[ids.lojaA] as string, 802, mes.aamm));
    // Pedido esperando a aprovação; venda sem pedido; venda devolvida inteira sem nota; venda cancelada (fica de fora).
    const andamento = await vendaConcluida(ana);
    const pedidoAndamento = await pedirNota(ana, andamento.venda);
    const semPedido = await vendaConcluida(ana);
    const devolvida = await vendaConcluida(ana);
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    await valor(dono, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, 'Cliente desistiu', $4) as v",
      [devolvida.venda, JSON.stringify([{ item: devolvida.item, quantidade: 1, condicao: "novo" }]), JSON.stringify([{ meio: "dinheiro", valor: 7900 }]), chave("dev")]);
    const cancelada = await vendaConcluida(ana);
    await valor(dono, "select public.cancelar_venda($1, 'Venda de teste cancelada') as v", [cancelada.venda]);
    // Loja B: uma venda sem pedido.
    const bia = await naLoja(ids.vendedorAB, ids.lojaB);
    const daLojaB = await vendaConcluida(bia);

    const r = await conciliar(dono);
    expect(r.resumo).toMatchObject({
      vendas: 6, valor_vendas: 47_400, com_nota: 2, valor_com_nota: 15_800, em_andamento: 1, valor_em_andamento: 7_900,
      sem_pedido: 2, valor_sem_pedido: 15_800, devolvidas_sem_nota: 1, valor_devolvidas_sem_nota: 7_900, atrasadas: 0, fora_do_prazo: 0,
      notas_emitidas: 2, sem_pdf: 1, sem_xml: 1, sem_protocolo: 1, devolucoes: 0, divergencias: 0, divergencias_abertas: 0,
    });
    expect(r.por_loja.map((l) => [l.nome, l.vendas, l.com_nota, l.em_andamento, l.sem_pedido, l.devolvidas_sem_nota]))
      .toEqual([["Loja A", 5, 2, 1, 1, 1], ["Loja B", 1, 0, 0, 1, 0]]);
    expect(r.lojas.map((l) => l.nome)).toEqual(["Loja A", "Loja B", "Loja C", "Loja Online"]);
    expect(r.sem_pedido.map((s) => [s.numero, s.loja, s.vendedor, s.valor])).toEqual([
      [semPedido.numero, "Loja A", "vendedor.a", 7_900], [daLojaB.numero, "Loja B", "vendedor.ab", 7_900],
    ]);
    expect(r.em_andamento).toEqual([expect.objectContaining({
      pedido: pedidoAndamento, venda: andamento.venda, numero: andamento.numero, situacao: "aguardando_aprovacao", atrasada: false,
    })]);
    expect(r.sem_documento).toEqual([expect.objectContaining({
      pedido: pedidoSemDocumento, numero: semDocumento.numero, tipo: "venda", modelo: "65", serie: 1, numero_documento: 802,
      falta: ["pdf", "xml", "protocolo"],
    })]);
    expect(r.tempo).toMatchObject({ emitidas: 2 });
    expect(r.devolucoes_pendentes).toEqual([]);
    expect(r.divergencias).toEqual([]);

    // Só uma loja; a gerência da loja B vê só a dela e não pede a da loja A.
    expect((await conciliar(dono, ids.lojaA)).resumo).toMatchObject({ vendas: 5, sem_pedido: 1 });
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    const daGerencia = await conciliar(gerenteB);
    expect(daGerencia.resumo).toMatchObject({ vendas: 1, sem_pedido: 1, com_nota: 0 });
    expect(daGerencia.lojas.map((l) => l.nome)).toEqual(["Loja B"]);
    expect(await errou(gerenteB, CONCILIAR, [mes.inicio, mes.fim, ids.lojaA])).toBe("42501");
  });

  it("o prazo de alerta da fila: sem prazo nada passa dele; com prazo, o pedido atrasado e a nota registrada depois contam", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const esperando = await vendaConcluida(ana);
    await pedirNota(ana, esperando.venda);
    const emitida = await vendaConcluida(ana);
    const pedidoEmitido = await pedirNota(ana, emitida.venda);
    // As duas vendas de três horas atrás (o registro da emissão é agora).
    await db.exec("set session_replication_role = replica");
    await db.query("update public.vendas set concluida_em = now() - interval '3 hours' where id in ($1, $2)", [esperando.venda, emitida.venda]);
    await db.query("update public.notas_pedidos set venda_concluida_em = now() - interval '3 hours' where venda_id in ($1, $2)", [esperando.venda, emitida.venda]);
    await db.exec("set session_replication_role = origin");
    await emitir(dono, pedidoEmitido, chaveDeAcesso(cnpj[ids.lojaA] as string, 811, mes.aamm));

    const semPrazo = await conciliar(dono, ids.lojaA, mes.semana);
    expect(semPrazo.resumo).toMatchObject({ em_andamento: 1, atrasadas: 0, com_nota: 1, fora_do_prazo: 0 });
    expect(semPrazo.por_loja[0]).toMatchObject({ alerta_minutos: null });
    expect(semPrazo.tempo.maior_minutos).toBeGreaterThanOrEqual(179);

    await valor(dono, "select public.fiscal_definir_politica(60, 'Orientação do contador por e-mail de 10/11') as v");
    const comPrazo = await conciliar(dono, ids.lojaA, mes.semana);
    expect(comPrazo.resumo).toMatchObject({ em_andamento: 1, atrasadas: 1, com_nota: 1, fora_do_prazo: 1 });
    expect(comPrazo.por_loja[0]).toMatchObject({ alerta_minutos: 60 });
    expect(comPrazo.em_andamento[0]).toMatchObject({ venda: esperando.venda, atrasada: true });
    expect(comPrazo.em_andamento[0]?.minutos).toBeGreaterThanOrEqual(179);
  });

  it("divergências: chave de antes da venda ou do futuro, número repetido e devolução sem nota; a conferência registra uma vez", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const cnpjA = cnpj[ids.lojaA] as string;
    // A chave é de um mês antes da venda; outra, do mês seguinte ao registro.
    const antiga = await vendaConcluida(ana);
    const pedidoAntigo = await pedirNota(ana, antiga.venda);
    await emitir(dono, pedidoAntigo, chaveDeAcesso(cnpjA, 821, mes.anterior));
    const futura = await vendaConcluida(ana);
    const pedidoFuturo = await pedirNota(ana, futura.venda);
    await emitir(dono, pedidoFuturo, chaveDeAcesso(cnpjA, 822, mes.seguinte));
    // O mesmo número de nota (CNPJ, modelo, série e número) em duas vendas, com códigos diferentes.
    const primeira = await vendaConcluida(ana);
    const pedidoPrimeira = await pedirNota(ana, primeira.venda);
    await emitir(dono, pedidoPrimeira, chaveDeAcesso(cnpjA, 830, mes.aamm, "11111111"));
    const segunda = await vendaConcluida(ana);
    const pedidoSegunda = await pedirNota(ana, segunda.venda);
    await emitir(dono, pedidoSegunda, chaveDeAcesso(cnpjA, 830, mes.aamm, "22222222"));
    // Devolução de venda com nota: o pedido da nota de devolução nasce sozinho; cancelado, a devolução fica sem nota.
    const devolvida = await vendaConcluida(ana);
    const pedidoDevolvida = await pedirNota(ana, devolvida.venda);
    await emitir(dono, pedidoDevolvida, chaveDeAcesso(cnpjA, 840, mes.aamm));
    await valor(dono, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    await valor(dono, "select public.devolver_itens($1, $2::jsonb, $3::jsonb, 'Defeito de fábrica', $4) as v",
      [devolvida.venda, JSON.stringify([{ item: devolvida.item, quantidade: 1, condicao: "avariado" }]), JSON.stringify([{ meio: "dinheiro", valor: 7900 }]), chave("dev")]);
    const pedidoDaDevolucao = (await db.query<{ id: string }>("select id from public.notas_pedidos where venda_id = $1 and tipo = 'devolucao'", [devolvida.venda])).rows[0]?.id as string;

    const antes = await conciliar(dono);
    expect(antes.resumo).toMatchObject({ devolucoes: 1, devolucoes_pendentes: 1, devolucoes_canceladas: 0, com_nota: 5, devolvidas_sem_nota: 0 });
    expect(antes.devolucoes_pendentes).toEqual([expect.objectContaining({ pedido: pedidoDaDevolucao, numero: devolvida.numero, situacao: "aguardando_aprovacao" })]);

    await valor(dono, "select public.notas_cancelar($1, 'Contador pediu para não emitir') as v", [pedidoDaDevolucao]);
    const r = await conciliar(dono);
    expect(r.resumo).toMatchObject({ devolucoes: 1, devolucoes_pendentes: 0, devolucoes_canceladas: 1, divergencias: 5, divergencias_abertas: 5 });
    const porTipo = (tipo: string) => r.divergencias.filter((d) => d.tipo === tipo);
    expect(porTipo("chave_fora_do_mes").map((d) => [d.pedido, d.mes_da_chave, d.mes_da_venda]).sort()).toEqual([
      [pedidoAntigo, `20${mes.anterior.slice(0, 2)}-${mes.anterior.slice(2)}`, `20${mes.aamm.slice(0, 2)}-${mes.aamm.slice(2)}`],
      [pedidoFuturo, `20${mes.seguinte.slice(0, 2)}-${mes.seguinte.slice(2)}`, `20${mes.aamm.slice(0, 2)}-${mes.aamm.slice(2)}`],
    ].sort());
    expect(porTipo("numero_repetido").map((d) => [d.pedido, d.numero_documento, d.outra_venda]).sort()).toEqual([
      [pedidoPrimeira, 830, segunda.numero], [pedidoSegunda, 830, primeira.numero],
    ].sort());
    expect(porTipo("devolucao_sem_nota")).toEqual([expect.objectContaining({
      pedido: pedidoDaDevolucao, pedido_tipo: "devolucao", numero: devolvida.numero, motivo: "Contador pediu para não emitir", conferida_em: null,
    })]);

    // A conferência: só quem aprova nota na loja do pedido, com o que viu, e a divergência tem de existir.
    const CONFERIR = "select public.notas_conferir_divergencia($1, $2, $3) as v";
    expect(await errou(ana, CONFERIR, [pedidoAntigo, "chave_fora_do_mes", "Conferido no portal da Sefaz"])).toBe("P0002");
    expect(await errou(await naLoja(ids.gerenteB, ids.lojaB), CONFERIR, [pedidoAntigo, "chave_fora_do_mes", "Conferido no portal da Sefaz"])).toBe("P0002");
    expect(await errou(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), CONFERIR, [pedidoAntigo, "chave_fora_do_mes", "Conferido no portal da Sefaz"])).toBe("P0002");
    expect(await errou(dono, CONFERIR, [pedidoAntigo, "chave_fora_do_mes", "curta"])).toBe("22023");
    expect(await errou(dono, CONFERIR, [pedidoAntigo, "valor_diferente", "Conferido no portal da Sefaz"])).toBe("22023");
    expect(await errou(dono, CONFERIR, [pedidoAntigo, "numero_repetido", "Conferido no portal da Sefaz"])).toBe("22023");
    expect(await errou(dono, CONFERIR, [pedidoPrimeira, "devolucao_sem_nota", "Conferido no portal da Sefaz"])).toBe("22023");
    expect(await valor<boolean>(dono, CONFERIR, [pedidoAntigo, "chave_fora_do_mes", "  Nota de outra venda: o contador vai cancelar  "])).toBe(true);
    expect(await valor<boolean>(dono, CONFERIR, [pedidoAntigo, "chave_fora_do_mes", "Outra observação qualquer"])).toBe(false);
    expect(await valor<boolean>(dono, CONFERIR, [pedidoDaDevolucao, "devolucao_sem_nota", "Devolução de NFC-e sem nota, como o contador orientou"])).toBe(true);

    const depois = await conciliar(dono);
    expect(depois.resumo).toMatchObject({ divergencias: 5, divergencias_abertas: 3 });
    // As abertas primeiro; a conferida mostra quem conferiu e o que escreveu.
    expect(depois.divergencias.slice(0, 3).every((d) => d.conferida_em === null)).toBe(true);
    expect(depois.divergencias.find((d) => d.pedido === pedidoAntigo)).toMatchObject({
      conferida_por: "dono", observacao_da_conferencia: "Nota de outra venda: o contador vai cancelar",
    });
    expect((await db.query("select acao, motivo from public.auditoria where acao = 'notas_divergencias_conferidas.criado' order by id")).rows)
      .toEqual([
        { acao: "notas_divergencias_conferidas.criado", motivo: "Nota de outra venda: o contador vai cancelar" },
        { acao: "notas_divergencias_conferidas.criado", motivo: "Devolução de NFC-e sem nota, como o contador orientou" },
      ]);
    // Só inserção: nem o dono do banco muda ou apaga a conferência.
    expect(await erroDe(() => db.query("update public.notas_divergencias_conferidas set observacao = 'Mudou depois de registrada'"))).not.toBeNull();
    expect(await erroDe(() => db.query("delete from public.notas_divergencias_conferidas"))).not.toBeNull();
    expect(await erroDe(() => db.query("truncate public.notas_divergencias_conferidas"))).not.toBeNull();
    // Quem lê a conferência: quem lê o pedido (o vendedor da venda sim; a gerência da loja B não).
    const leitura = (s: Sessao) => comoUsuario(db, s, async () => (await db.query("select pedido_id from public.notas_divergencias_conferidas")).rows.length);
    expect(await leitura(dono)).toBe(2);
    expect(await leitura(await naLoja(ids.gerenteB, ids.lojaB))).toBe(0);
    expect(await errou(ana, "insert into public.notas_divergencias_conferidas (organizacao_id, unidade_id, pedido_id, tipo, observacao, conferida_por) values ($1, $2, $3, 'numero_repetido', 'Gravado direto na tabela', $4)",
      [ids.organizacao, ids.lojaA, pedidoPrimeira, ids.vendedorA])).toBe("42501");
  });

  it("quem lê: vendedor, técnico e outra rede são recusados; o período vai de um dia a um ano", async () => {
    expect(await errou(await naLoja(ids.vendedorA, ids.lojaA), CONCILIAR, [mes.inicio, mes.fim, null])).toBe("42501");
    expect(await errou(await naLoja(ids.tecnico, ids.assistencia), CONCILIAR, [mes.inicio, mes.fim, null])).toBe("42501");
    const outraRede = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await errou(outraRede, CONCILIAR, [mes.inicio, mes.fim, ids.lojaA])).toBe("42501");
    await vendaConcluida(await naLoja(ids.vendedorA, ids.lojaA));
    const daOutraRede = await conciliar(outraRede);
    expect(daOutraRede.resumo).toMatchObject({ vendas: 0 });
    expect(daOutraRede.lojas.map((l) => l.nome)).toEqual(["Loja X"]);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await errou(dono, CONCILIAR, ["2026-02-10", "2026-02-01", null])).toBe("22023");
    expect(await errou(dono, CONCILIAR, ["2025-01-01", "2026-06-30", null])).toBe("22023");
    expect(await errou(dono, CONCILIAR, [null, mes.fim, null])).toBe("22023");
  });
});
