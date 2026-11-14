// /notas/conciliacao (lote L10b: ORA-FISC-008 em parte) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados
// fictícios. A tela, o período e a loja que vão ao banco, os estados sem número e a conferência de divergência. As regras
// do banco estão em packages/banco/src/conciliacao-fiscal.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const EU = "00000000-0000-4000-8000-0000000000aa";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const VENDA = "00000000-0000-4000-8000-00000000a001";
const PEDIDO = "00000000-0000-4000-8000-00000000b001";
const OUTRO_PEDIDO = "00000000-0000-4000-8000-00000000b002";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  politica: null as null | Record<string, unknown>,
  erroDaPolitica: null as null | { code: string },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
const supabase = {
  from: () => ({
    select: () => ({
      maybeSingle: async () => (cenario.erroDaPolitica ? { data: null, error: cenario.erroDaPolitica } : { data: cenario.politica, error: null }),
    }),
  }),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    cenario.chamadas.push({ nome, argumentos });
    return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: EU },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase,
  }),
}));
vi.mock("../../../lib/supabase/configuracao", () => ({ configuracaoSupabase: () => ({ url: "https://projeto.supabase.co", chavePublica: "sb_publishable_teste" }) }));

import { conferirDivergencia } from "../acoes";
import Conciliacao from "./page";

const EXECUTAR = new Set(["EstadoDoPainel", "FiltroSegmentado", "ListaDados", "ConteudoDaConciliacao", "TabelaDoGrafico"]);
function texto(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "function" && EXECUTAR.has(tipo)) andar((x.type as (p: unknown) => unknown)(x.props));
      else if (typeof x.type === "string") andar(x.props.children);
      else if (tipo === "MoldeReal") andar(x.props.children);
      else andar([x.props.titulo, x.props.subtitulo, x.props.rotulo, x.props.valor, x.props.detalhe, x.props.acao, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
};

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const contas = (extra: Linha = {}) => ({
  vendas: 6, valor_vendas: 60_000, com_nota: 3, valor_com_nota: 30_000, em_andamento: 1, valor_em_andamento: 10_000, sem_pedido: 1, valor_sem_pedido: 10_000,
  devolvidas_sem_nota: 1, valor_devolvidas_sem_nota: 10_000, atrasadas: 1, fora_do_prazo: 1, notas_emitidas: 4, sem_pdf: 1, sem_xml: 1, sem_protocolo: 0,
  devolucoes: 2, devolucoes_emitidas: 1, devolucoes_pendentes: 0, devolucoes_canceladas: 1, divergencias: 2, divergencias_abertas: 1, ...extra,
});
const resposta = () => ({
  inicio: `${hoje.slice(0, 7)}-01`, fim: hoje, unidade: null, lojas: [{ id: LOJA, nome: "Santa Cândida (teste)" }, { id: OUTRA, nome: "Centro (teste)" }],
  resumo: contas(),
  por_loja: [{ unidade: LOJA, nome: "Santa Cândida (teste)", ...contas(), alerta_minutos: 60 }],
  tempo: { emitidas: 3, media_minutos: 45, maior_minutos: 130 },
  sem_pedido: [{ venda: VENDA, numero: 101, loja: "Santa Cândida (teste)", vendedor: "Vendedora Teste", quando: "2026-11-03T15:00:00+00:00", valor: 10_000, minutos: 15_000 }],
  em_andamento: [{ pedido: PEDIDO, venda: VENDA, numero: 102, loja: "Santa Cândida (teste)", situacao: "aguardando_aprovacao", quando: "2026-11-13T15:00:00+00:00", valor: 10_000, minutos: 1_500, atrasada: true }],
  devolucoes_pendentes: [],
  sem_documento: [{ pedido: PEDIDO, venda: VENDA, numero: 103, loja: "Santa Cândida (teste)", tipo: "venda", quando: "2026-11-10T15:00:00+00:00", modelo: "65", serie: 1, numero_documento: 801, falta: ["pdf", "xml"] }],
  divergencias: [
    { tipo: "chave_fora_do_mes", pedido: PEDIDO, pedido_tipo: "venda", venda: VENDA, numero: 104, loja: "Santa Cândida (teste)", quando: "2026-11-12T15:00:00+00:00",
      modelo: "65", serie: 1, numero_documento: 821, mes_da_chave: "2026-10", mes_da_venda: "2026-11", outra_venda: null, motivo: null,
      conferida_em: null, conferida_por: null, observacao_da_conferencia: null },
    { tipo: "devolucao_sem_nota", pedido: OUTRO_PEDIDO, pedido_tipo: "devolucao", venda: VENDA, numero: 105, loja: "Santa Cândida (teste)", quando: "2026-11-11T15:00:00+00:00",
      modelo: null, serie: null, numero_documento: null, mes_da_chave: null, mes_da_venda: null, outra_venda: null, motivo: "Contador pediu para não emitir",
      conferida_em: "2026-11-12T13:00:00+00:00", conferida_por: "Dono Teste", observacao_da_conferencia: "Devolução de NFC-e sem nota, como o contador orientou" },
  ],
});
const tela = async (p: Record<string, string> = {}) => texto(await Conciliacao({ searchParams: Promise.resolve(p) }) as ReactElement);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.politica = { alerta_minutos: 60 };
  cenario.erroDaPolitica = null;
});

describe("conciliação das notas (L10b)", () => {
  it("quem aprova nota vê a cobertura, as divergências com a conferência, o que resolver e o tempo; o período e a loja vão ao banco", async () => {
    cenario.respostas.notas_conciliacao = { data: resposta(), error: null };
    const t = await tela();
    for (const trecho of ["Conciliação das notas", "Vendas com nota", "50%", "3 de 6 vendas do período", "Sem pedido de nota", "R$ 100,00 em vendas",
      "Na fila de notas", "1 passou do prazo", "Divergências abertas", "1 já conferida", "Chave de outro mês", "NFC-e nº 821 · série 1",
      "chave de 10/2026, venda de 11/2026", "Registrar a conferência", "Devolução sem nota · conferida", "Conferida por Dono Teste",
      "Devolução de NFC-e sem nota, como o contador orientou", "Venda nº 101", "Vendedora Teste", "Venda nº 102", "Aguardando aprovação", "falta: PDF, XML",
      "60 min", "Registradas depois do prazo", "Todas as lojas", "Centro (teste)", "tributos entram quando o contador definir"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(cenario.chamadas.find((c) => c.nome === "notas_conciliacao")?.argumentos).toEqual({ p_inicio: `${hoje.slice(0, 7)}-01`, p_fim: hoje, p_unidade: null });
    cenario.chamadas = [];
    await tela({ periodo: "noventa_dias", loja: LOJA });
    const inicio = new Date(new Date(`${hoje}T12:00:00Z`).getTime() - 89 * 86_400_000).toISOString().slice(0, 10);
    expect(cenario.chamadas.find((c) => c.nome === "notas_conciliacao")?.argumentos).toEqual({ p_inicio: inicio, p_fim: hoje, p_unidade: LOJA });
    // Período desconhecido vira "este mês"; loja que não é uuid, "todas".
    cenario.chamadas = [];
    await tela({ periodo: "ano", loja: "x" });
    expect(cenario.chamadas.find((c) => c.nome === "notas_conciliacao")?.argumentos).toEqual({ p_inicio: `${hoje.slice(0, 7)}-01`, p_fim: hoje, p_unidade: null });
    // Sem prazo registrado: nada conta como atrasado, e a tela diz isso.
    cenario.politica = null;
    expect(await tela()).toContain("sem prazo registrado");
  });

  it("sem permissão: o aviso; sem a função no banco: indisponível; resposta que não fecha: falha, sem número", async () => {
    cenario.respostas.notas_conciliacao = { data: null, error: { code: "42501" } };
    expect(await tela()).toContain("A conciliação das notas é do dono e do gerente");
    cenario.respostas.notas_conciliacao = { data: null, error: { code: "PGRST202" } };
    let t = await tela();
    expect(t).toContain("a conciliação das notas (migration conciliacao_fiscal)");
    expect(t).not.toContain("R$");
    const torta = resposta();
    torta.resumo.sem_pedido = 9;
    cenario.respostas.notas_conciliacao = { data: torta, error: null };
    t = await tela();
    expect(t).not.toContain("50%");
    expect(t).not.toContain("Venda nº 101");
  });

  it("as mensagens da conferência voltam na tela", async () => {
    cenario.respostas.notas_conciliacao = { data: resposta(), error: null };
    expect(await tela({ erro: "mudou" })).toContain("Esta divergência não existe mais neste pedido");
    expect(await tela({ ok: "conferida" })).toContain("Conferência registrada");
    expect(await tela({ erro: "qualquer" })).not.toContain("Esta divergência não existe mais");
  });

  it("conferir: dados inválidos, observação curta, erro do banco e sucesso voltam à conciliação com o período e a loja", async () => {
    const volta = `/notas/conciliacao?periodo=noventa_dias&loja=${LOJA}`;
    const campos = { pedido: PEDIDO, tipo: "chave_fora_do_mes", observacao: "  Nota de outra venda: o contador vai cancelar  ", periodo: "noventa_dias", loja: LOJA };
    expect(await destinoDe(conferirDivergencia(formulario({ ...campos, pedido: "x" })))).toBe(`${volta}&erro=dados`);
    expect(await destinoDe(conferirDivergencia(formulario({ ...campos, tipo: "valor_diferente" })))).toBe(`${volta}&erro=dados`);
    expect(await destinoDe(conferirDivergencia(formulario({ ...campos, observacao: " curta " })))).toBe(`${volta}&erro=observacao`);
    expect(cenario.chamadas.filter((c) => c.nome === "notas_conferir_divergencia")).toEqual([]);

    cenario.respostas.notas_conferir_divergencia = { data: null, error: { code: "22023", message: "Esta divergência não existe neste pedido (ou já mudou): recarregue a conciliação" } };
    expect(await destinoDe(conferirDivergencia(formulario(campos)))).toBe(`${volta}&erro=mudou`);
    cenario.respostas.notas_conferir_divergencia = { data: null, error: { code: "P0002" } };
    expect(await destinoDe(conferirDivergencia(formulario(campos)))).toBe(`${volta}&erro=nao_encontrado`);
    cenario.respostas.notas_conferir_divergencia = { data: true, error: null };
    expect(await destinoDe(conferirDivergencia(formulario(campos)))).toBe(`${volta}&ok=conferida`);
    expect(cenario.chamadas.filter((c) => c.nome === "notas_conferir_divergencia").at(-1)?.argumentos)
      .toEqual({ p_pedido: PEDIDO, p_tipo: "chave_fora_do_mes", p_observacao: "Nota de outra venda: o contador vai cancelar" });
    // Período ou loja inventados no formulário não vão para o endereço.
    expect(await destinoDe(conferirDivergencia(formulario({ ...campos, periodo: "ano", loja: "x" })))).toBe("/notas/conciliacao?periodo=mes&ok=conferida");
  });
});
