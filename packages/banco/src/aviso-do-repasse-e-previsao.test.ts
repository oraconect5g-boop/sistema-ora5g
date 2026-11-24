// Lote FIN-007b (ORA-FIN-007, a segunda parte, e a previsão de caixa do ORA-FIN-010): o aviso do repasse atrasado e da
// cobrança a retomar nas pendências da loja (o sino e o Início), e a previsão de caixa com as contas a receber das
// financeiras pelo vencimento. Banco em memória com todas as migrations; dados FICTÍCIOS. Cada teste numa transação
// desfeita. As duas contas novas têm de ser as mesmas de public.repasses_atrasados (FIN-007a): os testes comparam.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
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
const chave = (prefixo = "fin7b") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `7b000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string }> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return { v };
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      return { codigo: (e as { code?: string }).code ?? "sem-codigo" };
    }
  });
}
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.codigo}`);
  return r.v;
}
const codigo = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somarDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const PRAZO = "select public.prazo_de_repasse_definir($1, $2, $3) as v";
const COBRAR = "select public.cobranca_de_repasse_registrar($1, $2, $3, $4, $5::date, $6) as v";
const ATRASADOS = "select public.repasses_atrasados($1) as v";
const PENDENCIAS = "select public.pendencias_da_loja() as v";
const PREVISAO = "select public.previsao_de_caixa($1, $2) as v";

/** Uma venda de aparelho financiada (entrada de R$ 200,00 em dinheiro) há N dias, e a conta a receber que ela gera. */
async function financiada(s: Sessao, aparelho: string, meio: "payjoy" | "aiva", valorTotal: number, haDias: number) {
  await valor(s, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]).catch(() => undefined);
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [venda, cat.aparelho, aparelho, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
    [venda, JSON.stringify([{ meio, valor: valorTotal, entrada: 20_000, meio_entrada: "dinheiro", parcelas: 12 }]), JSON.stringify({ nome: "Cliente Teste", email: "cliente@teste.invalid" }), chave("concluir")]);
  await db.query("update public.vendas set concluida_em = concluida_em - make_interval(days => $2) where id = $1", [venda, haDias]);
  const conta = (await db.query<{ id: string }>("select id from public.contas_a_receber where venda_id = $1", [venda])).rows[0];
  return { venda, conta: conta?.id ?? "" };
}

/** A loja A com um PayJoy de 40 dias e um Aiva de 10 (R$ 1.299,00 a receber cada); a loja B com um PayJoy de 5 dias (R$ 1.199,00). */
async function cenario() {
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  const a1 = await financiada(ana, itens.a1, "payjoy", 149_900, 40);
  const a2 = await financiada(ana, itens.a2, "aiva", 149_900, 10);
  const bia = await naLoja(ids.vendedorAB, ids.lojaB);
  const b1 = await financiada(bia, itens.b1, "payjoy", 139_900, 5);
  const dono = await naLoja(ids.dono, ids.lojaA);
  const donoNaB = await naLoja(ids.dono, ids.lojaB);
  const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
  return { ana, bia, dono, donoNaB, gerenteB, a1, a2, b1 };
}
const A1 = 129_900, A2 = 129_900, B1 = 119_900;

type Pendencias = Record<string, number>;
const pendencias = (s: Sessao) => valor<Pendencias>(s, PENDENCIAS);
const avisos = async (s: Sessao) => { const p = await pendencias(s); return [p.repasses_atrasados, p.cobrancas_a_retomar]; };
type Atrasados = { totais: { atrasadas: number; valor_atrasado: number; valor_no_prazo: number; valor_sem_prazo: number }; contas: { id: string; historico: { retornar_em: string | null }[] }[] };
const atrasados = (s: Sessao, unidade: string | null) => valor<Atrasados>(s, ATRASADOS, [unidade]);
/** As contas da lista do FIN-007a cuja cobrança mais recente pede para voltar ao assunto hoje ou antes. */
const aRetomar = (t: Atrasados) => t.contas.filter((c) => { const dia = c.historico[0]?.retornar_em ?? null; return dia !== null && dia <= hoje(); }).length;

describe("as pendências da loja: o repasse atrasado e a cobrança a retomar (FIN-007b)", () => {
  it("sem prazo gravado, nada é atrasado; a chave só existe para quem concilia na loja do turno", async () => {
    const { ana, dono, gerenteB } = await cenario();
    expect(await avisos(dono)).toEqual([0, 0]);
    expect(await avisos(gerenteB)).toEqual([0, 0]);
    // O vendedor não concilia: as duas chaves nem vêm (a pendência não é dele).
    const daAna = await pendencias(ana);
    expect("repasses_atrasados" in daAna || "cobrancas_a_retomar" in daAna).toBe(false);
    // O administrador também não concilia.
    const doAdministrador = await pendencias(await naLoja(ids.administrador, ids.lojaA));
    expect("repasses_atrasados" in doAdministrador || "cobrancas_a_retomar" in doAdministrador).toBe(false);
  });

  it("com o prazo, conta o que passou dele na loja do turno, igual à lista do FIN-007a; no dia do vencimento ainda não conta", async () => {
    const { dono, donoNaB, gerenteB } = await cenario();
    const confere = async (s: Sessao, unidade: string, esperado: number) => {
      expect((await pendencias(s)).repasses_atrasados, unidade).toBe(esperado);
      expect((await atrasados(s, unidade)).totais.atrasadas, unidade).toBe(esperado);
    };
    // PayJoy em 30 dias: a de 40 dias da loja A passou; a de 5 dias da loja B, não.
    await valor(dono, PRAZO, ["payjoy", 30, "Contrato da PayJoy"]);
    await confere(dono, ids.lojaA, 1);
    await confere(gerenteB, ids.lojaB, 0);
    // O dono conta a loja do turno, não a rede: na loja B, zero.
    await confere(donoNaB, ids.lojaB, 0);
    // PayJoy em 4 dias: a da loja B também passou. A Aiva segue sem prazo: não conta.
    await valor(dono, PRAZO, ["payjoy", 4, "Aditivo"]);
    await confere(dono, ids.lojaA, 1);
    await confere(gerenteB, ids.lojaB, 1);
    // Aiva em 9 dias: a de 10 dias passou, e a loja A fica com duas.
    await valor(dono, PRAZO, ["aiva", 9, "Contrato da Aiva"]);
    await confere(dono, ids.lojaA, 2);
    // No dia do vencimento ainda não está atrasada: PayJoy em 40 dias vence hoje para a venda de 40 dias; em 39, venceu ontem.
    await valor(dono, PRAZO, ["payjoy", 40, "Prazo novo"]);
    await confere(dono, ids.lojaA, 1);
    await valor(dono, PRAZO, ["payjoy", 39, "Prazo novo"]);
    await confere(dono, ids.lojaA, 2);
    // Retirar o prazo tira o atraso.
    await valor(dono, PRAZO, ["payjoy", null, "Prazo retirado"]);
    await valor(dono, PRAZO, ["aiva", null, "Prazo retirado"]);
    await confere(dono, ids.lojaA, 0);
  });

  it("a conta recebida ou de venda cancelada sai da conta dos atrasados", async () => {
    const { dono, a1, a2 } = await cenario();
    await valor(dono, PRAZO, ["payjoy", 30, "Contrato"]);
    await valor(dono, PRAZO, ["aiva", 5, "Contrato"]);
    expect((await pendencias(dono)).repasses_atrasados).toBe(2);
    // O repasse da PayJoy cai: a conta deixa de estar em aberto.
    expect(await valor(dono, "select public.financeira_receber($1, $2, $3, $4::date) as v", [a1.conta, "REPASSE-FICTICIO-1", 125_000, hoje()])).toBeTruthy();
    expect((await pendencias(dono)).repasses_atrasados).toBe(1);
    // A venda da Aiva é cancelada (quem cancela devolve a entrada em dinheiro do próprio caixa): a conta fica cancelada,
    // e não é mais devida.
    await valor(dono, "select public.abrir_caixa(30000, $1) as v", [chave("caixa-do-dono")]);
    await valor(dono, "select public.cancelar_venda($1, $2) as v", [a2.venda, "Cliente desistiu (teste)"]);
    expect((await db.query<{ situacao: string }>("select situacao from public.contas_a_receber where id = $1", [a2.conta])).rows[0]?.situacao).toBe("cancelada");
    expect((await pendencias(dono)).repasses_atrasados).toBe(0);
    expect((await atrasados(dono, ids.lojaA)).totais.atrasadas).toBe(0);
  });

  it("a cobrança a retomar: vale a mais recente de cada conta, com a data em hoje ou antes; outra cobrança tira o lembrete", async () => {
    const { dono, donoNaB, gerenteB, a1, b1 } = await cenario();
    const confere = async (s: Sessao, unidade: string, esperado: number) => {
      expect((await pendencias(s)).cobrancas_a_retomar, unidade).toBe(esperado);
      expect(aRetomar(await atrasados(s, unidade)), unidade).toBe(esperado);
    };
    // Sem prazo gravado também se cobra: a cobrança com a volta para hoje já conta.
    await valor(gerenteB, COBRAR, [b1.conta, "telefone", "Atendente pediu para ligar hoje à tarde", null, hoje(), chave("cob")]);
    await confere(gerenteB, ids.lojaB, 1);
    await confere(donoNaB, ids.lojaB, 1);
    await confere(dono, ids.lojaA, 0);
    // A volta marcada para daqui a três dias ainda não conta, e tira o lembrete da anterior.
    await valor(gerenteB, COBRAR, [b1.conta, "email", "Prometeram a resposta em três dias", "PROT-9", somarDias(hoje(), 3), chave("cob")]);
    await confere(gerenteB, ids.lojaB, 0);
    // Passado o dia combinado (a data fabricada por fora da função, que não aceita data passada), conta de novo.
    const organizacao = ids.organizacao;
    await db.query(
      `insert into public.cobrancas_de_repasse (organizacao_id, unidade_id, conta_id, canal, resumo, retornar_em, chave, conteudo, registrado_por)
       values ($1, $2, $3, 'portal', 'Chamado aberto no portal (data fabricada pelo teste)', $4::date, $5, 'teste', $6)`,
      [organizacao, ids.lojaB, b1.conta, somarDias(hoje(), -2), chave("fabricada"), ids.gerenteB]);
    await confere(gerenteB, ids.lojaB, 1);
    // Outra cobrança, sem data de volta: o lembrete some (quem cobrou de novo já voltou ao assunto).
    await valor(gerenteB, COBRAR, [b1.conta, "telefone", "Repasse confirmado para amanhã", null, null, chave("cob")]);
    await confere(gerenteB, ids.lojaB, 0);
    // A conta recebida não pede mais nada, mesmo com a volta marcada para hoje.
    await valor(dono, COBRAR, [a1.conta, "whatsapp", "Voltar a falar hoje", null, hoje(), chave("cob")]);
    await confere(dono, ids.lojaA, 1);
    await valor(dono, "select public.financeira_receber($1, $2, $3, $4::date) as v", [a1.conta, "REPASSE-FICTICIO-2", 125_000, hoje()]);
    expect((await pendencias(dono)).cobrancas_a_retomar).toBe(0);
  });
});

type Parte = { valor: number; quantidade: number };
type Previsao = {
  hoje: string;
  semanas: { inicio: string; fim: string; contas: number; quantidade: number; financeiras: number; financeiras_quantidade: number }[];
  financeiras: Parte & { atrasadas: Parte; no_periodo: Parte; depois: Parte; sem_prazo: Parte };
};
const previsao = (s: Sessao, semanas = 8, unidade: string | null = null) => valor<Previsao>(s, PREVISAO, [semanas, unidade]);
const parte = (p: Parte) => [Number(p.valor), Number(p.quantidade)];
const partes = (p: Previsao) => ({
  total: parte(p.financeiras), atrasadas: parte(p.financeiras.atrasadas), no_periodo: parte(p.financeiras.no_periodo), depois: parte(p.financeiras.depois), sem_prazo: parte(p.financeiras.sem_prazo),
});
const porSemana = (p: Previsao) => p.semanas.map((s) => [Number(s.financeiras), Number(s.financeiras_quantidade)]);
/** As quatro partes somam o total, e as semanas somam o que vence no período: nada fica de fora nem entra duas vezes. */
function fecha(p: Previsao) {
  const f = p.financeiras;
  expect(Number(f.atrasadas.valor) + Number(f.no_periodo.valor) + Number(f.depois.valor) + Number(f.sem_prazo.valor)).toBe(Number(f.valor));
  expect(Number(f.atrasadas.quantidade) + Number(f.no_periodo.quantidade) + Number(f.depois.quantidade) + Number(f.sem_prazo.quantidade)).toBe(Number(f.quantidade));
  expect(p.semanas.reduce((s, x) => s + Number(x.financeiras), 0)).toBe(Number(f.no_periodo.valor));
  expect(p.semanas.reduce((s, x) => s + Number(x.financeiras_quantidade), 0)).toBe(Number(f.no_periodo.quantidade));
}
const ZERO = [0, 0];

describe("a previsão de caixa com o vencimento das financeiras (FIN-007b)", () => {
  it("sem prazo gravado, tudo o que as financeiras devem segue sem data: nenhuma semana recebe nada", async () => {
    const { dono } = await cenario();
    const p = await previsao(dono);
    expect(partes(p)).toEqual({ total: [A1 + A2 + B1, 3], atrasadas: ZERO, no_periodo: ZERO, depois: ZERO, sem_prazo: [A1 + A2 + B1, 3] });
    expect(porSemana(p)).toEqual(Array.from({ length: 8 }, () => ZERO));
    fecha(p);
  });

  it("com o prazo, cada conta entra na semana do vencimento; o que passa do período fica depois; a sem prazo segue sem data", async () => {
    const { dono } = await cenario();
    // PayJoy em 45 dias: a venda de 40 dias vence daqui a 5 (primeira semana); a de 5 dias, daqui a 40 (sexta semana).
    await valor(dono, PRAZO, ["payjoy", 45, "Contrato da PayJoy"]);
    const oito = await previsao(dono);
    expect(partes(oito)).toEqual({ total: [A1 + A2 + B1, 3], atrasadas: ZERO, no_periodo: [A1 + B1, 2], depois: ZERO, sem_prazo: [A2, 1] });
    expect(porSemana(oito)).toEqual([[A1, 1], ZERO, ZERO, ZERO, ZERO, [B1, 1], ZERO, ZERO]);
    expect(oito.semanas[5]?.inicio).toBe(somarDias(hoje(), 35));
    fecha(oito);
    // Em 4 semanas, a que vence daqui a 40 dias fica "depois".
    const quatro = await previsao(dono, 4);
    expect(partes(quatro)).toEqual({ total: [A1 + A2 + B1, 3], atrasadas: ZERO, no_periodo: [A1, 1], depois: [B1, 1], sem_prazo: [A2, 1] });
    expect(porSemana(quatro)).toEqual([[A1, 1], ZERO, ZERO, ZERO]);
    fecha(quatro);
    // Por loja: cada uma com as suas.
    const daA = await previsao(dono, 8, ids.lojaA);
    expect(partes(daA)).toEqual({ total: [A1 + A2, 2], atrasadas: ZERO, no_periodo: [A1, 1], depois: ZERO, sem_prazo: [A2, 1] });
    const daB = await previsao(dono, 8, ids.lojaB);
    expect(partes(daB)).toEqual({ total: [B1, 1], atrasadas: ZERO, no_periodo: [B1, 1], depois: ZERO, sem_prazo: ZERO });
    expect(porSemana(daB)[5]).toEqual([B1, 1]);
    fecha(daA);
    fecha(daB);
  });

  it("o que já passou do prazo não entra em semana nenhuma: aparece como atrasado, igual à lista do FIN-007a; o que vence hoje entra na primeira semana", async () => {
    const { dono } = await cenario();
    // PayJoy em 30 dias: a de 40 dias venceu há 10; a de 5 dias vence daqui a 25 (quarta semana). Aiva em 10: vence hoje.
    await valor(dono, PRAZO, ["payjoy", 30, "Contrato da PayJoy"]);
    await valor(dono, PRAZO, ["aiva", 10, "Contrato da Aiva"]);
    const p = await previsao(dono);
    expect(partes(p)).toEqual({ total: [A1 + A2 + B1, 3], atrasadas: [A1, 1], no_periodo: [A2 + B1, 2], depois: ZERO, sem_prazo: ZERO });
    expect(porSemana(p)).toEqual([[A2, 1], ZERO, ZERO, [B1, 1], ZERO, ZERO, ZERO, ZERO]);
    fecha(p);
    const lista = await atrasados(dono, null);
    expect(Number(p.financeiras.atrasadas.valor)).toBe(lista.totais.valor_atrasado);
    expect(Number(p.financeiras.no_periodo.valor) + Number(p.financeiras.depois.valor)).toBe(lista.totais.valor_no_prazo);
    expect(Number(p.financeiras.sem_prazo.valor)).toBe(lista.totais.valor_sem_prazo);
    // A conta recebida sai de tudo.
    await valor(dono, "select public.financeira_receber($1, $2, $3, $4::date) as v", [(await cenarioContas()).a1, "REPASSE-FICTICIO-3", 125_000, hoje()]);
    const depois = await previsao(dono);
    expect(partes(depois)).toEqual({ total: [A2 + B1, 2], atrasadas: ZERO, no_periodo: [A2 + B1, 2], depois: ZERO, sem_prazo: ZERO });
    fecha(depois);
  });

  it("a previsão passa a exigir também a permissão de conciliar (que lê o prazo): sem ela, nem o dono vê", async () => {
    await db.exec("savepoint sem_permissao");
    await db.query("select set_config('ora.motivo', 'Teste da previsão sem a permissão de conciliar', true)");
    await db.query("delete from public.papel_permissoes where papel = 'dono' and permissao = 'pagamento.conciliar'");
    expect(await codigo(await naLoja(ids.dono, ids.lojaA), PREVISAO, [8, null])).toBe("42501");
    await db.exec("rollback to savepoint sem_permissao");
    await db.exec("release savepoint sem_permissao");
    expect((await previsao(await naLoja(ids.dono, ids.lojaA))).semanas).toHaveLength(8);
    // Quem já não via continua sem ver.
    for (const [usuario, unidade] of [[ids.gerenteB, ids.lojaB], [ids.administrador, ids.lojaA], [ids.vendedorA, ids.lojaA]] as const) {
      expect(await codigo(await naLoja(usuario, unidade), PREVISAO, [8, null]), usuario).toBe("42501");
    }
  });
});

/** A conta a receber em aberto da PayJoy na loja A (a do aparelho a1), para o teste que a recebe. */
async function cenarioContas() {
  const r = await db.query<{ id: string }>(
    "select c.id from public.contas_a_receber c join public.vendas v on v.id = c.venda_id where v.unidade_id = $1 and c.devedor = 'payjoy' and c.situacao = 'aberta'", [ids.lojaA]);
  return { a1: r.rows[0]?.id ?? "" };
}
