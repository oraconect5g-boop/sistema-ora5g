// Lote FIN-007a (ORA-FIN-007, a primeira parte, e o vencimento do ORA-FIN-003): o prazo de repasse de cada financeira,
// definido pelo dono; o que está atrasado, pelo prazo em vigor; e as cobranças feitas, com auditoria. Banco em memória com
// todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
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
const chave = (prefixo = "fin7") => `${prefixo}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `7a000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
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

type Cobranca = { id: string; quando: string; canal: string; resumo: string; protocolo: string | null; retornar_em: string | null; por: string | null };
type Conta = {
  id: string; venda_id: string; venda_numero: number; unidade_id: string; unidade_nome: string; devedor: string; valor: number; dias: number;
  prazo: number | null; vencimento: string | null; atraso: number | null; estado: string; cobrancas: number; historico: Cobranca[];
};
type Atrasados = {
  hoje: string; prazos: { devedor: string; dias: number | null; definido_em: string | null }[]; pode_definir_prazo: boolean;
  totais: { atrasadas: number; valor_atrasado: number; no_prazo: number; valor_no_prazo: number; sem_prazo: number; valor_sem_prazo: number; maior_atraso: number };
  por_loja: { unidade_id: string; nome: string; abertas: number; atrasadas: number; valor_atrasado: number }[]; contas: Conta[];
};
const ler = (s: Sessao, unidade: string | null = null) => valor<Atrasados>(s, ATRASADOS, [unidade]);
const resumo = (c: Conta) => [c.devedor, c.dias, c.prazo, c.vencimento, c.atraso, c.estado];

/** A loja A com um PayJoy de 40 dias e um Aiva de 10; a loja B com um PayJoy de 5 dias. */
async function cenario() {
  const ana = await naLoja(ids.vendedorA, ids.lojaA);
  const a1 = await financiada(ana, itens.a1, "payjoy", 149_900, 40);
  const a2 = await financiada(ana, itens.a2, "aiva", 149_900, 10);
  const bia = await naLoja(ids.vendedorAB, ids.lojaB);
  const b1 = await financiada(bia, itens.b1, "payjoy", 139_900, 5);
  const dono = await naLoja(ids.dono, ids.lojaA);
  const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
  return { ana, bia, dono, gerenteB, a1, a2, b1 };
}

describe("o prazo de repasse e o que está atrasado (FIN-007a)", () => {
  it("sem prazo definido, nenhuma conta é chamada de atrasada: o sistema mostra a idade e diz que falta o prazo", async () => {
    const { dono, gerenteB, a1, a2, b1 } = await cenario();
    const t = await ler(dono);
    expect(t.hoje).toBe(hoje());
    expect(t.prazos).toEqual([{ devedor: "aiva", dias: null, definido_em: null }, { devedor: "payjoy", dias: null, definido_em: null }]);
    expect(t.pode_definir_prazo).toBe(true);
    expect(t.totais).toEqual({ atrasadas: 0, valor_atrasado: 0, no_prazo: 0, valor_no_prazo: 0, sem_prazo: 3, valor_sem_prazo: 129_900 + 129_900 + 119_900, maior_atraso: 0 });
    // Sem atraso para ordenar, da venda mais antiga para a mais nova.
    expect(t.contas.map((c) => c.id)).toEqual([a1.conta, a2.conta, b1.conta]);
    expect(t.contas.map(resumo)).toEqual([
      ["payjoy", 40, null, null, null, "sem_prazo"], ["aiva", 10, null, null, null, "sem_prazo"], ["payjoy", 5, null, null, null, "sem_prazo"]]);
    // O gerente da loja B lê só a loja dele, e não define o prazo.
    const daLojaB = await ler(gerenteB);
    expect(daLojaB.contas.map((c) => c.id)).toEqual([b1.conta]);
    expect(daLojaB.pode_definir_prazo).toBe(false);
    expect(daLojaB.por_loja).toEqual([{ unidade_id: ids.lojaB, nome: expect.any(String), abertas: 1, atrasadas: 0, valor_atrasado: 0 }]);
  });

  it("com o prazo do dono, o vencimento é o dia da venda mais o prazo; no dia do vencimento ainda não está atrasada; mudar o prazo muda o atraso; retirar volta a sem prazo", async () => {
    const { dono, gerenteB, a1, a2, b1 } = await cenario();
    expect(await valor(dono, PRAZO, ["payjoy", 30, "Contrato da PayJoy: repasse em 30 dias"])).toEqual({ devedor: "payjoy", dias: 30, repetida: false });
    let t = await ler(dono);
    expect(t.prazos).toEqual([{ devedor: "aiva", dias: null, definido_em: null }, { devedor: "payjoy", dias: 30, definido_em: expect.any(String) }]);
    // A de 40 dias passou 10 do prazo; a de 5 dias vence em 25; a da Aiva segue sem prazo. A atrasada vem primeiro,
    // depois a que tem vencimento e, por fim, a sem prazo.
    expect(t.contas.map((c) => c.id)).toEqual([a1.conta, b1.conta, a2.conta]);
    expect(t.contas.map(resumo)).toEqual([
      ["payjoy", 40, 30, somarDias(hoje(), -10), 10, "atrasada"],
      ["payjoy", 5, 30, somarDias(hoje(), 25), 0, "no_prazo"],
      ["aiva", 10, null, null, null, "sem_prazo"],
    ]);
    expect(t.totais).toEqual({ atrasadas: 1, valor_atrasado: 129_900, no_prazo: 1, valor_no_prazo: 119_900, sem_prazo: 1, valor_sem_prazo: 129_900, maior_atraso: 10 });
    expect(t.por_loja).toEqual([
      { unidade_id: ids.lojaA, nome: expect.any(String), abertas: 2, atrasadas: 1, valor_atrasado: 129_900 },
      { unidade_id: ids.lojaB, nome: expect.any(String), abertas: 1, atrasadas: 0, valor_atrasado: 0 },
    ]);
    // O gerente da loja B vê o prazo da rede valendo na conta dele.
    expect((await ler(gerenteB)).contas.map(resumo)).toEqual([["payjoy", 5, 30, somarDias(hoje(), 25), 0, "no_prazo"]]);

    // No dia do vencimento (40 dias de prazo para a venda de 40 dias) ainda não está atrasada; com 39, um dia de atraso.
    await valor(dono, PRAZO, ["payjoy", 40, "Aditivo: 40 dias"]);
    expect(resumo((await ler(dono)).contas.find((c) => c.id === a1.conta) as Conta)).toEqual(["payjoy", 40, 40, hoje(), 0, "no_prazo"]);
    await valor(dono, PRAZO, ["payjoy", 39, "Corrigido: 39 dias"]);
    expect(resumo((await ler(dono)).contas.find((c) => c.id === a1.conta) as Conta)).toEqual(["payjoy", 40, 39, somarDias(hoje(), -1), 1, "atrasada"]);
    // A Aiva ganha o prazo dela; o da PayJoy é retirado e as contas dela voltam a "sem prazo".
    await valor(dono, PRAZO, ["aiva", 7, "Contrato da Aiva: 7 dias"]);
    expect(await valor(dono, PRAZO, ["payjoy", null, "O contrato mudou; o prazo novo ainda não foi informado"])).toEqual({ devedor: "payjoy", dias: null, repetida: false });
    t = await ler(dono);
    expect(t.prazos).toEqual([{ devedor: "aiva", dias: 7, definido_em: expect.any(String) }, { devedor: "payjoy", dias: null, definido_em: null }]);
    expect(t.contas.map(resumo)).toEqual([
      ["aiva", 10, 7, somarDias(hoje(), -3), 3, "atrasada"],
      ["payjoy", 40, null, null, null, "sem_prazo"],
      ["payjoy", 5, null, null, null, "sem_prazo"],
    ]);
    // O mesmo prazo de novo não grava outra linha; cada mudança ficou na trilha, com o motivo.
    expect(await valor(dono, PRAZO, ["aiva", 7, "De novo"])).toEqual({ devedor: "aiva", dias: 7, repetida: true });
    expect(await valor(dono, PRAZO, ["payjoy", null, "De novo"])).toEqual({ devedor: "payjoy", dias: null, repetida: true });
    const linhas = (await db.query<{ devedor: string; dias: number | null; motivo: string }>("select devedor, dias, motivo from public.prazos_de_repasse order by criado_em, id")).rows;
    expect(linhas.map((l) => [l.devedor, l.dias])).toEqual([["payjoy", 30], ["payjoy", 40], ["payjoy", 39], ["aiva", 7], ["payjoy", null]]);
    expect(linhas[0]?.motivo).toBe("Contrato da PayJoy: repasse em 30 dias");
    expect(a2.conta).not.toBe("");
  });

  it("só quem concilia pela rede define o prazo; dado inválido é recusado; a outra rede tem o prazo dela", async () => {
    const { ana, dono, gerenteB } = await cenario();
    for (const s of [gerenteB, ana, await naLoja(ids.administrador, ids.lojaA)]) expect(await codigo(s, PRAZO, ["payjoy", 30, "Tentativa"])).toBe("42501");
    for (const [devedor, dias, motivo] of [["picpay", 30, "Motivo"], [null, 30, "Motivo"], ["payjoy", 0, "Motivo"], ["payjoy", 181, "Motivo"], ["payjoy", 30, "ab"], ["payjoy", 30, null]]) {
      expect(await codigo(dono, PRAZO, [devedor, dias, motivo]), JSON.stringify([devedor, dias, motivo])).toBe("22023");
    }
    expect((await db.query("select 1 from public.prazos_de_repasse")).rows).toHaveLength(0);
    // O prazo da outra rede não vale nesta: cada rede lê o dela.
    const outra = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    await valor(outra, PRAZO, ["payjoy", 15, "Contrato da outra rede"]);
    expect((await ler(dono)).prazos.find((p) => p.devedor === "payjoy")?.dias).toBeNull();
    expect((await ler(outra)).prazos.find((p) => p.devedor === "payjoy")?.dias).toBe(15);
    expect((await ler(dono)).totais.sem_prazo).toBe(3);
    // A linha gravada não muda nem some.
    for (const sql of ["update public.prazos_de_repasse set dias = 1", "delete from public.prazos_de_repasse"]) {
      await db.exec("savepoint tentativa");
      const erro = await db.query(sql).then(() => null, (e: { code?: string }) => e.code);
      await db.exec("rollback to savepoint tentativa");
      expect(erro, sql).toBe("42501");
    }
  });
});

describe("as cobranças feitas à financeira (FIN-007a)", () => {
  it("quem concilia na loja registra a cobrança da conta em aberto; ela aparece na conta, da mais nova para a mais antiga, com quem fez", async () => {
    const { dono, gerenteB, b1 } = await cenario();
    const k1 = chave("cobranca");
    const primeira = await valor<{ id: string; repetida: boolean }>(gerenteB, COBRAR, [b1.conta, "telefone", "  Falei com o   atendimento: repasse   previsto para sexta ", " PROT-123 ", somarDias(hoje(), 3), k1]);
    expect(primeira.repetida).toBe(false);
    // A repetição com a mesma chave devolve a mesma cobrança; a mesma chave com outro conteúdo é recusada.
    expect(await valor(gerenteB, COBRAR, [b1.conta, "telefone", "Falei com o atendimento: repasse previsto para sexta", "PROT-123", somarDias(hoje(), 3), k1])).toEqual({ id: primeira.id, repetida: true });
    expect(await codigo(gerenteB, COBRAR, [b1.conta, "email", "Outro texto", null, null, k1])).toBe("OR004");
    await valor(gerenteB, COBRAR, [b1.conta, "email", "Mandei o comprovante da venda", null, null, chave("cobranca")]);
    const conta = (await ler(gerenteB)).contas[0] as Conta;
    expect(conta.cobrancas).toBe(2);
    expect(conta.historico.map((h) => [h.canal, h.resumo, h.protocolo, h.retornar_em])).toEqual([
      ["email", "Mandei o comprovante da venda", null, null],
      ["telefone", "Falei com o atendimento: repasse previsto para sexta", "PROT-123", somarDias(hoje(), 3)],
    ]);
    const nome = (await db.query<{ nome: string }>("select nome from public.perfis_usuario where id = $1", [ids.gerenteB])).rows[0]?.nome;
    expect(conta.historico.map((h) => h.por)).toEqual([nome, nome]);
    // O dono lê a mesma cobrança pela rede.
    expect((await ler(dono)).contas.find((c) => c.id === b1.conta)?.cobrancas).toBe(2);
    // A trilha de auditoria guarda cada cobrança.
    const trilha = (await db.query<{ motivo: string; usuario_id: string }>("select motivo, usuario_id from public.auditoria where alvo_tipo = 'cobrancas_de_repasse' order by id")).rows;
    expect(trilha).toHaveLength(2);
    expect(trilha.map((l) => l.usuario_id)).toEqual([ids.gerenteB, ids.gerenteB]);
    expect(trilha[0]?.motivo).toMatch(/^Cobrança do repasse da venda nº \d+$/);
  });

  it("recusa: a conta de outra loja, quem não concilia, a conta recebida ou cancelada, e o dado inválido; a cobrança gravada não muda", async () => {
    const { ana, dono, gerenteB, a1, a2, b1 } = await cenario();
    // O gerente da loja B não cobra conta da loja A; a vendedora não cobra.
    expect(await codigo(gerenteB, COBRAR, [a1.conta, "telefone", "Tentativa", null, null, chave("c")])).toBe("P0002");
    expect(await codigo(ana, COBRAR, [a1.conta, "telefone", "Tentativa", null, null, chave("c")])).toBe("P0002");
    expect(await codigo(dono, COBRAR, ["00000000-0000-4000-8000-00000000dead", "telefone", "Tentativa", null, null, chave("c")])).toBe("P0002");
    for (const [canal, texto, protocolo, retornar] of [
      ["sinal de fumaça", "Texto", null, null], [null, "Texto", null, null], ["telefone", "ab", null, null], ["telefone", "x".repeat(501), null, null],
      ["telefone", "Texto", "p".repeat(81), null], ["telefone", "Texto", null, somarDias(hoje(), -1)], ["telefone", "Texto", null, somarDias(hoje(), 366)],
    ]) expect(await codigo(dono, COBRAR, [a1.conta, canal, texto, protocolo, retornar, chave("c")]), JSON.stringify([canal, String(texto).slice(0, 10), retornar])).toBe("22023");
    expect(await codigo(dono, COBRAR, [a1.conta, "telefone", "Texto", null, null, "   "])).toBe("22023");
    // A conta recebida e a da venda cancelada não se cobram.
    await valor(dono, "select public.financeira_registrar_repasse($1::uuid, $2::text, $3::bigint, $4::date, 4900, md5($1::uuid::text || regexp_replace(trim($2::text), '\\s+', ' ', 'g'))::uuid) as v", [a1.conta, "REPASSE-1", 125_000, hoje()]);
    expect(await codigo(dono, COBRAR, [a1.conta, "telefone", "Tentativa", null, null, chave("c")])).toBe("22023");
    await valor(dono, "select public.abrir_caixa(100000, $1) as v", [chave("caixa")]);
    await valor(dono, "select public.cancelar_venda($1, 'Cliente desistiu do financiamento') as v", [a2.venda]);
    expect(await codigo(dono, COBRAR, [a2.conta, "telefone", "Tentativa", null, null, chave("c")])).toBe("22023");
    // As duas saem da lista dos atrasados: só a da loja B continua em aberto.
    expect((await ler(dono)).contas.map((c) => c.id)).toEqual([b1.conta]);
    expect((await db.query("select 1 from public.cobrancas_de_repasse")).rows).toHaveLength(0);
    // A cobrança gravada não muda nem some.
    await valor(gerenteB, COBRAR, [b1.conta, "portal", "Abri o chamado no portal", "CH-9", null, chave("c")]);
    for (const sql of ["update public.cobrancas_de_repasse set resumo = 'outro'", "delete from public.cobrancas_de_repasse"]) {
      await db.exec("savepoint tentativa");
      const erro = await db.query(sql).then(() => null, (e: { code?: string }) => e.code);
      await db.exec("rollback to savepoint tentativa");
      expect(erro, sql).toBe("42501");
    }
  });

  it("só quem concilia lê os atrasados, e só as lojas dele; as tabelas seguem a mesma regra", async () => {
    const { ana, dono, gerenteB, a1, b1 } = await cenario();
    await valor(dono, PRAZO, ["payjoy", 30, "Contrato"]);
    await valor(dono, COBRAR, [a1.conta, "telefone", "Cobrança da loja A", null, null, chave("c")]);
    await valor(gerenteB, COBRAR, [b1.conta, "telefone", "Cobrança da loja B", null, null, chave("c")]);
    expect(await codigo(ana, ATRASADOS, [null])).toBe("42501");
    expect(await codigo(ana, ATRASADOS, [ids.lojaA])).toBe("42501");
    expect(await codigo(gerenteB, ATRASADOS, [ids.lojaA])).toBe("42501");
    expect((await ler(dono, ids.lojaB)).contas.map((c) => c.id)).toEqual([b1.conta]);
    const outra = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    expect(await codigo(outra, ATRASADOS, [ids.lojaA])).toBe("42501");
    expect((await ler(outra)).contas).toEqual([]);
    // Pela leitura direta das tabelas (RLS): o gerente da loja B vê só a cobrança da loja dele; a vendedora, nenhuma; e o
    // prazo, só quem concilia.
    const linhas = (s: Sessao, tabela: string) => comoUsuario(db, s, async () => (await db.query<{ n: string }>(`select count(*)::text as n from public.${tabela}`)).rows[0]?.n);
    expect([await linhas(dono, "cobrancas_de_repasse"), await linhas(gerenteB, "cobrancas_de_repasse"), await linhas(ana, "cobrancas_de_repasse"), await linhas(outra, "cobrancas_de_repasse")]).toEqual(["2", "1", "0", "0"]);
    expect([await linhas(dono, "prazos_de_repasse"), await linhas(gerenteB, "prazos_de_repasse"), await linhas(ana, "prazos_de_repasse"), await linhas(outra, "prazos_de_repasse")]).toEqual(["1", "1", "0", "0"]);
  });
});
