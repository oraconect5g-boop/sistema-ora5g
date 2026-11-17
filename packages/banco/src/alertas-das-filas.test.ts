// Lote QUAL-a (17/11/2026; ORA-QUAL-006; migration 20261117221322_alertas_das_filas): o aviso no celular quando uma
// fila passa do limite (desconto, nota ou saída de caixa esperando demais numa loja) ou quando uma rotina do banco falha
// ou atrasa. Usa a fila e o envio do PWA-b. Endereços, chaves e segredo FICTÍCIOS; cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

const SEGREDO = "segredo-ficticio-dos-avisos-para-o-teste-0123456789";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
});
beforeEach(async () => {
  await db.exec("begin");
  await db.query("insert into privado.segredos_de_rotina (nome, impressao) values ('avisos_no_celular', sha256(convert_to($1, 'UTF8')))", [SEGREDO]);
});
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
let celulares = 0;
const chave = (p: string) => `${p}:alertas:${String(++chaves).padStart(5, "0")}`;
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
  const s = { usuario, sessao: `4c000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = <T>(s: Sessao | null, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
async function inscrever(s: Sessao) {
  const n = String(++celulares).padStart(4, "0");
  const endpoint = `https://push.exemplo.invalid/alertas/${n}`;
  await valor(s, "select public.aviso_inscrever($1, $2, $3, null) as v", [endpoint, `B${"A".repeat(82)}${n}`, `auth${"x".repeat(14)}${n}`]);
  return endpoint;
}
type Lote = { id: string; tipo: string; titulo: string; corpo: string; endereco: string; inscricoes: { endpoint: string }[] }[];
const lote = () => valor<Lote>(null, "select public.avisos_a_enviar($1, 100) as v", [SEGREDO]);
const alertar = async () => (await db.query<{ v: number }>("select privado.alertas_das_filas() as v")).rows[0]?.v;
const alertas = async () => (await db.query<{ titulo: string; corpo: string; endereco: string; permissao: string; unidade_id: string | null; organizacao_id: string }>(
  "select titulo, corpo, endereco, permissao, unidade_id, organizacao_id from privado.avisos where tipo = 'alerta' order by titulo, organizacao_id")).rows;

/** Um desconto pedido pela vendedora na loja dela; devolve o pedido. */
async function pedirDesconto(s: Sessao) {
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  const item = await valor<string>(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.aplicar_desconto($1, 500) as v", [item]);
  return valor<string>(s, "select public.pedir_aprovacao($1, 'Cliente antigo') as v", [item]);
}

describe("a fila acima do limite (QUAL-a)", () => {
  it("vira um alerta por fila, loja e dia, para quem decide na loja; repetir no mesmo dia não manda de novo", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const doDono = await inscrever(dono);
    await inscrever(ana);
    const [d1, d2] = [await pedirDesconto(ana), await pedirDesconto(ana)];
    await pedirDesconto(ana);
    await db.query("update public.aprovacoes_desconto set solicitado_em = now() - interval '31 minutes' where id = any($1)", [[d1, d2]]);
    await valor(ana, "select public.abrir_caixa(500000, $1) as v", [chave("caixa")]);
    const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [venda, chave("concluir")]);
    const nota = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [venda, chave("nota")]);
    await db.query("update public.notas_pedidos set criado_em = now() - interval '241 minutes' where id = $1", [nota]);
    const saida = await valor<string>(ana, "select public.caixa_pedir_saida(5000, 'Troco para a loja vizinha', $1) as v", [chave("saida")]);
    await db.query("update public.caixa_saidas set pedida_em = now() - interval '31 minutes' where id = $1", [saida]);

    expect(await alertar()).toBe(3);
    expect(await alertas()).toEqual([
      { titulo: "Descontos esperando aprovação", corpo: "Loja A: 2 pedidos de desconto esperando há mais de 30 min", endereco: "/aprovacoes", permissao: "desconto.aprovar", unidade_id: ids.lojaA, organizacao_id: ids.organizacao },
      { titulo: "Notas esperando aprovação", corpo: "Loja A: 1 pedido de nota esperando há mais de 4 h", endereco: "/notas", permissao: "nota.aprovar", unidade_id: ids.lojaA, organizacao_id: ids.organizacao },
      { titulo: "Saídas de caixa esperando", corpo: "Loja A: 1 saída de caixa esperando há mais de 30 min", endereco: "/caixa", permissao: "caixa.conferir", unidade_id: ids.lojaA, organizacao_id: ids.organizacao },
    ]);
    expect(await alertar()).toBe(0);
    // Quem decide na loja recebe (o dono, pela rede); a vendedora, sem a permissão, não.
    const doLote = (await lote()).filter((a) => a.tipo === "alerta");
    expect(doLote).toHaveLength(3);
    for (const a of doLote) expect(a.inscricoes.map((i) => i.endpoint)).toEqual([doDono]);
  });

  it("o limite muda sem migration: com 60 minutos, o desconto de 31 minutos não vira alerta", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const d = await pedirDesconto(ana);
    await db.query("update public.aprovacoes_desconto set solicitado_em = now() - interval '31 minutes' where id = $1", [d]);
    await db.query("update privado.limites_dos_alertas set minutos = 60, atualizado_em = now() where fila = 'desconto'");
    expect(await alertar()).toBe(0);
    await db.query("update public.aprovacoes_desconto set solicitado_em = now() - interval '61 minutes' where id = $1", [d]);
    expect(await alertar()).toBe(1);
    expect((await alertas())[0]?.corpo).toBe("Loja A: 1 pedido de desconto esperando há mais de 1 h");
  });
});

describe("a rotina do banco com problema (QUAL-a)", () => {
  it("a falha vira alerta para quem vê a auditoria da rede inteira (o dono e o administrador; o gerente da loja, não), com o endereço da Saúde da operação", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const doDono = await inscrever(dono);
    const doAdministrador = await inscrever(await naLoja(ids.administrador, ids.lojaA));
    await inscrever(await naLoja(ids.gerenteB, ids.lojaB));
    const daOutraRede = await inscrever(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg));
    await db.query("insert into privado.rotinas_execucoes (rotina, iniciada_em, terminada_em, situacao, erro) values ('reservas_vencidas', now() - interval '1 minute', now(), 'falha', '57014')");
    expect(await alertar()).toBe(2);
    const deRotina = (await alertas()).filter((a) => a.titulo === "Rotina do banco com falha");
    expect(deRotina.map((a) => [a.organizacao_id, a.unidade_id, a.permissao, a.endereco, a.corpo])).toEqual([
      [ids.organizacao, null, "auditoria.ver", "/operacao", "Vencimento das reservas (PDV e site): ainda sem rodada certa"],
      [ids.outraOrganizacao, null, "auditoria.ver", "/operacao", "Vencimento das reservas (PDV e site): ainda sem rodada certa"],
    ].sort((x, y) => String(x[0]).localeCompare(String(y[0]))));
    const porRede = new Map((await lote()).filter((a) => a.tipo === "alerta").map((a) => [a.corpo + a.id, a.inscricoes.map((i) => i.endpoint).sort()]));
    const destinos = [...porRede.values()].sort((x, y) => x.length - y.length);
    expect(destinos).toEqual([[daOutraRede], [doDono, doAdministrador].sort()]);
    expect(await alertar()).toBe(0);
  });

  it("a rotina sem rodada certa no prazo vira o alerta de atrasada", async () => {
    await db.query("update privado.rotinas set criada_em = now() - interval '2 days' where nome = 'limpeza_dos_registros'");
    await db.query("insert into privado.rotinas_execucoes (rotina, iniciada_em, terminada_em, situacao, quantidade) values ('reservas_vencidas', now() - interval '1 minute', now(), 'ok', 0)");
    expect(await alertar()).toBe(2);
    expect((await alertas()).map((a) => [a.titulo, a.corpo])).toEqual([
      ["Rotina do banco atrasada", "Limpeza do registro das rotinas: ainda sem rodada certa"],
      ["Rotina do banco atrasada", "Limpeza do registro das rotinas: ainda sem rodada certa"],
    ]);
  });

  it("roda pelo agendador a cada 10 minutos e fica no registro das rotinas", async () => {
    expect((await db.query<{ schedule: string; command: string }>("select schedule, command from cron.job where jobname = 'ora5g-alertas-das-filas'")).rows)
      .toEqual([{ schedule: "*/10 * * * *", command: "select privado.rodar_rotina('alertas_das_filas')" }]);
    expect((await db.query<{ v: string }>("select privado.rodar_rotina('alertas_das_filas') as v")).rows[0]?.v).toBe("ok");
    expect((await db.query<{ situacao: string; quantidade: number }>("select situacao, quantidade from privado.rotinas_execucoes where rotina = 'alertas_das_filas'")).rows)
      .toEqual([{ situacao: "ok", quantidade: 0 }]);
  });
});

describe("as regras da fila dos avisos (QUAL-a)", () => {
  it("o alerta não tem quem pediu; o pedido tem loja e quem pediu; o teste não tem loja", async () => {
    const inserir = (tipo: string, unidade: string | null, solicitante: string | null, permissao: string | null) => erroDe(() => db.query(
      `insert into privado.avisos (organizacao_id, unidade_id, tipo, alvo_id, solicitante_id, permissao, titulo, corpo, endereco)
       values ($1, $2, $3, gen_random_uuid(), $4, $5, 'Título', 'Texto', '/inicio')`, [ids.organizacao, unidade, tipo, solicitante, permissao]));
    expect(await inserir("alerta", ids.lojaA, ids.dono, "desconto.aprovar")).toBe("23514");
    expect(await inserir("alerta", null, null, null)).toBe("23514");
    expect(await inserir("desconto", null, ids.vendedorA, "desconto.aprovar")).toBe("23514");
    expect(await inserir("teste", ids.lojaA, ids.dono, null)).toBe("23514");
    expect(await inserir("alerta", null, null, "auditoria.ver")).toBeNull();
    expect(await inserir("alerta", ids.lojaA, null, "nota.aprovar")).toBeNull();
  });
});
