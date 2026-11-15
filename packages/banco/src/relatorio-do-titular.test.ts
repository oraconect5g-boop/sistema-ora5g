// Lote QUAL-011a (15/11/2026, ORA-QUAL-011 em parte; migration 20261115210000_relatorio_do_titular): o relatório dos dados
// do titular (LGPD, art. 18, I e II, e art. 19). Só o dono, na loja do turno, com a senha digitada há pouco e um motivo;
// o relatório junta o cadastro (com os dados guardados em privado), os mesclados, os consentimentos, as compras, o funil,
// a agenda, as OS e os documentos; cada relatório fica na auditoria sem o conteúdo e entra no limite de consultas.
// Dados FICTÍCIOS (CPFs gerados, telefones de teste); cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { amrDaSenha, comDigitoLuhn, comoUsuario, cpf, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
let lojaA = "";
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  lojaA = (await db.query<{ nome: string }>("select nome from public.unidades where id = $1", [ids.lojaA])).rows[0]?.nome ?? "";
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = (prefixo: string) => `${prefixo}:titular:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
type Falha = { codigo: string; mensagem: string };
async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | Falha> {
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
const codigo = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};

const RELATORIO = "select public.cliente_dados_do_titular($1, $2) as v";
const MOTIVO = "Pedido do titular por e-mail em 15/11";
const CPF_MARIA = cpf("529982247");
type Relatorio = {
  cadastro: Record<string, unknown>; mesclados: Record<string, unknown>[]; consentimentos: Record<string, unknown>[];
  compras: (Record<string, unknown> & { itens: Record<string, unknown>[]; pagamentos: Record<string, unknown>[]; notas: Record<string, unknown>[] })[];
  oportunidades: Record<string, unknown>[]; atividades: Record<string, unknown>[]; ordens_de_servico: Record<string, unknown>[]; documentos: Record<string, unknown>[];
};

async function cadastrar(s: Sessao, dados: object) {
  return valor<{ id: string; numero: number }>(s, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v", [JSON.stringify(dados), chave("cliente")]);
}
async function vendaDeCapa(s: Sessao, cliente: string, nome: string) {
  const aberto = await db.query("select 1 from public.caixas where operador_id = $1 and situacao = 'aberto'", [s.usuario]);
  if (aberto.rows.length === 0) await valor(s, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.concluir_venda($1, $2::jsonb, $3::jsonb, $4) as v",
    [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), JSON.stringify({ id: cliente, nome }), chave("concluir")]);
  return venda;
}
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000);

describe("relatório dos dados do titular (QUAL-011a)", () => {
  it("só o dono, na loja do turno, com a senha recente e um motivo; traz o cadastro com os dados guardados em privado; a auditoria guarda o motivo, não o conteúdo", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const maria = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Maria Titular", documento: CPF_MARIA, telefone: "41987650001", email: "maria@exemplo.com" });
    // Quem não tem cliente.exportar (o vendedor, o administrador, o gerente de outra loja) é recusado.
    for (const quem of [ana, await naLoja(ids.administrador, ids.lojaA), await naLoja(ids.gerenteB, ids.lojaB)]) {
      expect(await codigo(quem, RELATORIO, [maria.id, MOTIVO])).toBe("42501");
    }
    // A senha digitada há mais de 30 minutos pede a confirmação (ORG-006b); o motivo é obrigatório e curto.
    expect(await codigo({ ...dono, amr: amrDaSenha(31 * 60) }, RELATORIO, [maria.id, MOTIVO])).toBe("OR033");
    expect(await codigo(dono, RELATORIO, [maria.id, " "])).toBe("22023");
    expect(await codigo(dono, RELATORIO, [maria.id, "x".repeat(201)])).toBe("22023");
    // Cliente de outra empresa, ou que não existe: não encontrado.
    expect(await codigo(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), RELATORIO, [maria.id, MOTIVO])).toBe("P0002");
    expect(await codigo(dono, RELATORIO, ["00000000-0000-4000-8000-00000000dead", MOTIVO])).toBe("P0002");

    const r = await valor<Relatorio>(dono, RELATORIO, [maria.id, MOTIVO]);
    expect(r.cadastro).toMatchObject({
      codigo: maria.numero, tipo: "pessoa_fisica", nome: "Maria Titular", situacao: "ativo", documento: CPF_MARIA, telefone: "41987650001",
      email: "maria@exemplo.com", origem: "loja", loja_de_origem: lojaA,
    });
    expect(r.compras).toEqual([]);
    expect(r.mesclados).toEqual([]);
    // A auditoria: quem, de quem e o motivo; nenhum dado aberto.
    const auditoria = (await db.query<{ usuario_id: string; alvo_id: string; depois: Record<string, unknown> }>(
      "select usuario_id, alvo_id, depois from public.auditoria where acao = 'cliente.relatorio_do_titular'")).rows;
    expect(auditoria).toEqual([{ usuario_id: ids.dono, alvo_id: maria.id, depois: { motivo: MOTIVO, cadastros: 1, compras: 0 } }]);
    const vazou = await db.query("select 1 from public.auditoria where (coalesce(antes::text, '') || coalesce(depois::text, '') || coalesce(motivo, '')) like '%' || $1 || '%'", [CPF_MARIA]);
    expect(vazou.rows).toEqual([]);
  });

  it("junta o histórico: consentimentos, compras (itens, pagamentos e notas), funil, agenda, OS e documentos, inclusive do cadastro mesclado", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const maria = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Maria Titular", documento: CPF_MARIA, telefone: "41987650001" });
    // O cadastro repetido (só com o telefone; com outro CPF seria outra pessoa, e a mesclagem recusa).
    const jose = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Maria (cadastro repetido)", telefone: "41987650009" });
    // Consentimento dado e retirado: o histórico inteiro.
    await valor(ana, "select public.cliente_consentir($1, 'whatsapp', 'ofertas', true, 'loja') as v", [maria.id]);
    await valor(ana, "select public.cliente_consentir($1, 'whatsapp', 'ofertas', false, 'loja') as v", [maria.id]);
    // Uma compra no cadastro que fica e outra no que vai ser mesclado, com a nota pedida.
    const venda = await vendaDeCapa(ana, maria.id, "Maria na venda");
    const vendaDoMesclado = await vendaDeCapa(ana, jose.id, "Maria de novo");
    await valor(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [venda, chave("nota")]);
    // Funil e agenda.
    const op = await valor<{ id: string }>(ana, "select public.oportunidade_registrar($1, $2::jsonb, $3) as v", [maria.id,
      JSON.stringify({ origem: "whatsapp", campanha: "Black Friday", interesse: "Galaxy A15 e chip", valor_estimado: 149_900, proximo_passo: "Ligar para mostrar o aparelho", proximo_passo_em: daqui(1).toISOString() }), chave("op")]);
    await valor(ana, "select public.atividade_criar($1::jsonb, $2) as v", [JSON.stringify({ tipo: "ligacao", descricao: "Ligar sobre a proposta", vence_em: daqui(1).toISOString(), oportunidade: op.id }), chave("atividade")]);
    // Ordem de serviço da assistência.
    await valor(ana, "select public.os_abrir($1::jsonb, $2) as v", [JSON.stringify({ cliente: maria.id, aparelho: "Galaxy A15", imei: comDigitoLuhn("35209900800999"), defeito: "Tela não liga",
      estado: "Tampa traseira riscada", acessorios: ["carregador"], prazo: daqui(7).toISOString().slice(0, 10) }), chave("os")]);
    // Um documento anexado à compra (gravado direto, como a rota de envio faz depois do arquivo no armazenamento).
    await db.query(`insert into public.venda_anexos (organizacao_id, unidade_id, venda_id, tipo, descricao, caminho, formato, bytes, sha256, enviado_por)
      values ($1, $2, $3, 'termo_garantia', 'Termo de garantia assinado', $4, 'pdf', 1000, $5, $6)`,
      [ids.organizacao, ids.lojaA, venda, `${ids.organizacao}/${ids.lojaA}/${venda}/termo.pdf`, "a".repeat(64), ids.vendedorA]);
    // O cadastro repetido é mesclado no que fica.
    await valor(dono, "select public.clientes_mesclar($1, $2, $3) as v", [maria.id, jose.id, "Mesma pessoa, confirmado no balcão"]);
    expect(await codigo(dono, RELATORIO, [jose.id, MOTIVO])).toBe("22023");

    const r = await valor<Relatorio>(dono, RELATORIO, [maria.id, MOTIVO]);
    expect(r.mesclados).toEqual([expect.objectContaining({ codigo: jose.numero, nome: "Maria (cadastro repetido)" })]);
    expect(r.consentimentos.map((k) => [k.canal, k.finalidade, k.situacao, k.loja])).toEqual([["whatsapp", "ofertas", "concedido", lojaA], ["whatsapp", "ofertas", "retirado", lojaA]]);
    expect(r.compras.map((c) => [c.situacao, c.nome_na_venda, c.total_centavos, c.loja])).toEqual([["concluida", "Maria na venda", 7_900, lojaA], ["concluida", "Maria de novo", 7_900, lojaA]]);
    expect(r.compras[0]?.itens).toEqual([expect.objectContaining({ quantidade: 1, preco_unitario_centavos: 7_900, desconto_centavos: 0, imei: null })]);
    expect(r.compras[0]?.pagamentos).toEqual([{ meio: "dinheiro", valor_centavos: 7_900, entrada_centavos: 0, situacao: "confirmado" }]);
    expect(r.compras[0]?.notas).toEqual([expect.objectContaining({ tipo: "venda", situacao: "aguardando_aprovacao", chave_de_acesso: null })]);
    expect(r.compras[1]?.notas).toEqual([]);
    expect(r.oportunidades).toEqual([expect.objectContaining({ interesse: "Galaxy A15 e chip", etapa: "novo", campanha: "Black Friday", valor_estimado_centavos: 149_900 })]);
    expect(r.atividades).toEqual([expect.objectContaining({ tipo: "ligacao", descricao: "Ligar sobre a proposta", situacao: "aberta" })]);
    expect(r.ordens_de_servico).toEqual([expect.objectContaining({ aparelho: "Galaxy A15", defeito: "Tela não liga", estado_na_entrada: "Tampa traseira riscada", situacao: "aberta" })]);
    expect(r.documentos).toEqual([expect.objectContaining({ tipo: "termo_garantia", descricao: "Termo de garantia assinado" })]);
    // A auditoria conta o que entrou (dois cadastros e duas compras), sem o conteúdo.
    expect((await db.query("select depois from public.auditoria where acao = 'cliente.relatorio_do_titular'")).rows).toEqual([{ depois: { motivo: MOTIVO, cadastros: 2, compras: 2 } }]);
    expect(vendaDoMesclado).toBeTruthy();
  });

  it("o relatório entra no limite de consultas: com 30 nos últimos 10 minutos, recusa (OR028)", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const maria = await cadastrar(ana, { tipo: "pessoa_fisica", nome: "Maria Titular", documento: CPF_MARIA, telefone: "41987650001" });
    for (let i = 0; i < 29; i++) await valor(dono, RELATORIO, [maria.id, MOTIVO]);
    // A trigésima ainda passa (29 antes dela); a seguinte é recusada.
    await valor(dono, RELATORIO, [maria.id, MOTIVO]);
    expect(await codigo(dono, RELATORIO, [maria.id, MOTIVO])).toBe("OR028");
    expect((await db.query("select count(*)::int as n from public.auditoria where acao = 'cliente.relatorio_do_titular'")).rows[0]).toEqual({ n: 30 });
  });
});
