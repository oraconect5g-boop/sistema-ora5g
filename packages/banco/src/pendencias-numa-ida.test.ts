import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

// VEL-c (ORA-QUAL-010, D-047; ADR-010): as pendências da loja do turno numa ida só (public.pendencias_da_loja). A função
// não decide nada por conta própria: cada chave só aparece para quem tem a permissão da fila (a mesma tem_permissao), e
// cada contagem é igual à contagem separada que o sino fazia, com as regras de leitura (RLS) de quem chama.

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
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s: Sessao = { usuario, sessao: `6c000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);

// As mesmas contagens de apps/plataforma/src/lib/inicio/pendencias.ts (o caminho uma a uma), com a permissão de cada fila.
// $1: a loja do turno; $2: quem chama.
const HOJE = "(now() at time zone 'America/Sao_Paulo')::date";
const CONTAGENS: Record<string, { permissoes: string[]; sql: string }> = {
  aprovacoes: { permissoes: ["desconto.aprovar"], sql: "select count(*) from public.aprovacoes_desconto where unidade_id = $1 and situacao = 'pendente'" },
  notas: { permissoes: ["nota.aprovar"], sql: "select count(*) from public.notas_pedidos where unidade_id = $1 and situacao in ('aguardando_aprovacao', 'aprovada')" },
  notas_paradas: { permissoes: ["nota.aprovar"], sql: "select count(*) from public.notas_pedidos where unidade_id = $1 and situacao in ('aguardando_aprovacao', 'correcao_solicitada', 'aprovada') and criado_em < now() - interval '1 day'" },
  caixas: { permissoes: ["caixa.conferir"], sql: "select count(*) from public.caixas where unidade_id = $1 and situacao = 'fechado'" },
  saidas: { permissoes: ["caixa.conferir"], sql: "select count(*) from public.caixa_saidas where unidade_id = $1 and situacao = 'pendente' and pedida_por <> $2" },
  caixas_com_diferenca: { permissoes: ["caixa.conferir"], sql: "select count(*) from public.caixas where unidade_id = $1 and diferenca_centavos <> 0 and fechado_em >= now() - interval '7 days'" },
  contas_a_pagar: { permissoes: ["conta_pagar.gerir"], sql: `select count(*) from public.contas_a_pagar where situacao = 'aberta' and vencimento <= ${HOJE}` },
  fechamentos: { permissoes: ["bonus.aprovar"], sql: "select count(*) from public.bonus_fechamentos where situacao = 'enviado'" },
  // TRF-e: conta também a recebida com falta sem o destino do que faltou, para a origem e para o destino.
  transferencias: { permissoes: ["estoque.consultar"], sql: "select count(*) from public.transferencias where (origem_id = $1 and situacao in ('solicitada', 'separada')) or (destino_id = $1 and situacao = 'enviada') or (situacao = 'recebida_com_divergencia' and divergencia_resolvida_em is null and $1 in (origem_id, destino_id))" },
  connect: { permissoes: ["connect.gerir"], sql: "select count(*) from public.connect_operacoes where unidade_id = $1 and situacao = 'resultado_desconhecido'" },
  ativacoes_com_falha: { permissoes: ["connect.gerir"], sql: "select count(*) from public.connect_operacoes where unidade_id = $1 and tipo in ('ativacao', 'portabilidade') and situacao in ('recusada', 'negada', 'erro_operadora') and atualizado_em >= now() - interval '7 days'" },
  estornos: { permissoes: ["venda.ver_unidade"], sql: "select count(*) from public.estornos_externos where unidade_id = $1 and situacao = 'pendente'" },
  retornos: { permissoes: ["venda.ver_unidade"], sql: "select count(*) from public.venda_retornos where unidade_id = $1 and situacao = 'pendente'" },
  os_atrasadas: { permissoes: ["os.abrir", "os.gerir"], sql: `select count(*) from public.ordens_servico where situacao = 'aberta' and prazo < ${HOJE}` },
  os_prontas: { permissoes: ["os.abrir", "os.gerir"], sql: "select count(*) from public.ordens_servico where situacao = 'aberta' and local = 'loja' and servico = 'concluido'" },
  os_do_tecnico: { permissoes: ["os.orcar"], sql: "select count(*) from public.ordens_servico where situacao = 'aberta' and local = 'com_tecnico' and servico in ('aguardando_orcamento', 'aprovado')" },
  // FIN-007b: para quem concilia na loja, os repasses das financeiras que passaram do prazo em vigor e as cobranças cuja
  // volta ao assunto chegou (vale a cobrança mais recente de cada conta). Escritas de outro jeito que o da função; os
  // casos com conta atrasada de verdade estão em aviso-do-repasse-e-previsao.test.ts.
  repasses_atrasados: { permissoes: ["pagamento.conciliar"], sql: `select count(*) from public.contas_a_receber c join public.vendas v on v.id = c.venda_id
    left join lateral (select p.dias from public.prazos_de_repasse p where p.organizacao_id = c.organizacao_id and p.devedor = c.devedor order by p.criado_em desc, p.id desc limit 1) pz on true
    where c.situacao = 'aberta' and v.unidade_id = $1 and pz.dias is not null and (v.concluida_em at time zone 'America/Sao_Paulo')::date + pz.dias < ${HOJE}` },
  cobrancas_a_retomar: { permissoes: ["pagamento.conciliar"], sql: `select count(*) from public.contas_a_receber c join public.vendas v on v.id = c.venda_id
    where c.situacao = 'aberta' and v.unidade_id = $1 and exists (
      select 1 from public.cobrancas_de_repasse k where k.conta_id = c.id and k.retornar_em <= ${HOJE}
        and not exists (select 1 from public.cobrancas_de_repasse k2 where k2.conta_id = c.id and (k2.criado_em, k2.id) > (k.criado_em, k.id)))` },
};

/** O que a função devolve e o que as contagens separadas dariam, para a mesma pessoa na mesma loja. */
async function compararCom(s: Sessao, unidade: string, usuario: string) {
  const numaIda = await valor<Record<string, number>>(s, "select public.pendencias_da_loja() as v");
  const esperado: Record<string, number> = {};
  for (const [chave, c] of Object.entries(CONTAGENS)) {
    let pode = false;
    for (const p of c.permissoes) pode ||= await valor<boolean>(s, "select public.tem_permissao($1, $2) as v", [p, unidade]);
    if (!pode) continue;
    const params = c.sql.includes("$2") ? [unidade, usuario] : c.sql.includes("$1") ? [unidade] : [];
    esperado[chave] = Number(await valor<string | number>(s, c.sql.replace("select count(*)", "select count(*) as v"), params));
  }
  return { numaIda, esperado };
}

describe("VEL-c — as pendências da loja numa ida só", () => {
  it("para cada perfil, as mesmas chaves (pela permissão) e as mesmas contagens (pelo RLS) das contagens separadas", async () => {
    // Pendências de verdade: duas transferências da loja A (a pedir e a receber) e uma da loja B, de fora da loja A.
    const transferencia = (origem: string, destino: string, situacao: string, chave: string) => db.query(
      `insert into public.transferencias (organizacao_id, origem_id, destino_id, variante_id, quantidade, motivo, chave, conteudo, situacao, solicitado_por, enviado_em)
       values ($1, $2, $3, $4, 1, 'Reposição (teste)', $5, 'teste', $6, $7, case when $6 = 'enviada' then now() end)`,
      [ids.organizacao, origem, destino, cat.capa, chave, situacao, ids.dono]);
    await transferencia(ids.lojaA, ids.lojaB, "solicitada", "teste:pend-1");
    await transferencia(ids.lojaB, ids.lojaA, "enviada", "teste:pend-2");
    await transferencia(ids.lojaB, ids.lojaC, "solicitada", "teste:pend-3");
    // TRF-e: recebidas com falta. A sem destino conta para a origem (A) e para o destino (B); a resolvida não conta; a
    // de outras lojas (B para C) não conta para a loja A.
    const comFalta = (origem: string, destino: string, resolvida: boolean, chave: string) => db.query(
      `insert into public.transferencias (organizacao_id, origem_id, destino_id, variante_id, quantidade, motivo, chave, conteudo, situacao, solicitado_por, enviado_em,
         quantidade_recebida, observacao, recebido_por, recebido_em, divergencia_resolvida_em)
       values ($1, $2, $3, $4, 2, 'Reposição (teste)', $5, 'teste', 'recebida_com_divergencia', $6, now(), 1, 'A caixa chegou com uma a menos', $6, now(),
         case when $7 then now() end)`,
      [ids.organizacao, origem, destino, cat.capa, chave, ids.dono, resolvida]);
    await comFalta(ids.lojaA, ids.lojaB, false, "teste:pend-falta-1");
    await comFalta(ids.lojaA, ids.lojaB, true, "teste:pend-falta-2");
    await comFalta(ids.lojaB, ids.lojaC, false, "teste:pend-falta-3");

    const casos: [string, string, string][] = [
      ["o dono na loja A", ids.dono, ids.lojaA],
      ["o gerente na loja B", ids.gerenteB, ids.lojaB],
      ["o vendedor na loja A", ids.vendedorA, ids.lojaA],
      ["o técnico na assistência", ids.tecnico, ids.assistencia],
    ];
    for (const [quem, usuario, unidade] of casos) {
      const s = await naLoja(usuario, unidade);
      const { numaIda, esperado } = await compararCom(s, unidade, usuario);
      expect(numaIda, quem).toEqual(esperado);
    }

    const dono = await naLoja(ids.dono, ids.lojaA);
    // O dono vê todas as filas da loja, menos a do técnico (orçar e consertar é do técnico, não do dono).
    expect(await valor<boolean>(dono, "select public.tem_permissao('os.orcar', $1) as v", [ids.lojaA])).toBe(false);
    expect(Object.keys(await valor<Record<string, number>>(dono, "select public.pendencias_da_loja() as v")).sort())
      .toEqual(Object.keys(CONTAGENS).filter((k) => k !== "os_do_tecnico").sort());
    // Na loja A: a pedida (a separar), a enviada (a receber) e a recebida com falta sem destino. A resolvida não conta.
    expect((await valor<Record<string, number>>(dono, "select public.pendencias_da_loja() as v")).transferencias).toBe(3);
    // Na loja B, o destino da que tem falta e a origem de outra com falta: as duas contam, além da que ela tem a separar.
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    expect((await valor<Record<string, number>>(gerenteB, "select public.pendencias_da_loja() as v")).transferencias).toBe(3);
  });

  it("quem não escolheu a loja ou não entrou não recebe contagem nenhuma; quem não entrou nem executa", async () => {
    const semLoja: Sessao = { usuario: ids.dono, sessao: "6c000000-0000-4000-8000-0000000000ff" };
    expect(await valor<Record<string, number>>(semLoja, "select public.pendencias_da_loja() as v")).toEqual({});
    const r = await db.query<{ v: boolean }>("select has_function_privilege('anon', 'public.pendencias_da_loja()', 'execute') as v");
    expect(r.rows[0]?.v).toBe(false);
  });
});
