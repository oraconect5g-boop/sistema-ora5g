// Detalhamento do financeiro real (#65): os registros que explicam cada número, página a página na
// tela e completos na exportação. Tudo pelo RLS de quem pede; a loja de vendas, pagamentos e
// devoluções é a da venda (a mesma regra da leitura agregada public.financeiro_painel).
import { MEIOS, type MeioPagamento } from "@ora5g/dominio";

import { FalhaDoServico, type obterSessao } from "../acesso/sessao";
import { centavosDoBanco } from "../dinheiro";
import { MEIOS_CONCILIAVEIS, type Janela } from "./painel";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export const VISOES = {
  vendas: { rotulo: "Vendas", situacoes: { concluida: "Concluídas", cancelada: "Canceladas" } },
  // "A conciliar" e "Conciliados" (G2b): cartão e Pix confirmados, pela conciliação manual com o extrato.
  pagamentos: { rotulo: "Pagamentos", situacoes: { confirmado: "Confirmados", a_conciliar: "A conciliar", conciliado: "Conciliados", estorno_pendente: "Estorno pendente", estornado: "Estornados" } },
  devolucoes: { rotulo: "Devoluções", situacoes: {} },
  caixas: { rotulo: "Caixas", situacoes: { aberto: "Abertos", fechado: "Fechados", conferido: "Conferidos" } },
} as const satisfies Record<string, { rotulo: string; situacoes: Record<string, string> }>;
export type Visao = keyof typeof VISOES;
export const ORDEM_DAS_VISOES: readonly Visao[] = ["vendas", "pagamentos", "devolucoes", "caixas"];
export const visaoDoParametro = (valor: unknown): Visao => (typeof valor === "string" && Object.hasOwn(VISOES, valor) ? (valor as Visao) : "vendas");
export const situacaoDoParametro = (visao: Visao, valor: unknown): string | null =>
  typeof valor === "string" && Object.hasOwn(VISOES[visao].situacoes, valor) ? valor : null;

export const POR_PAGINA = 50;
const LOTE = 1000; // linhas por pedido à API (o limite do PostgREST); a exportação pede lote a lote
export const LIMITE_DA_EXPORTACAO = 20_000;

export const nomeDoMeio = (meio: string | null) => (meio && Object.hasOwn(MEIOS, meio) ? MEIOS[meio as MeioPagamento].nome : meio ?? "");

export type RegistroVenda = { id: string; numero: number; unidadeId: string; pessoaId: string; quando: string; situacao: string; total: number; devolvido: number };
export type RegistroPagamento = {
  vendaId: string; vendaNumero: number; unidadeId: string; quando: string; meio: string; situacao: string; valor: number; entrada: number; meioEntrada: string | null;
  /** G2b: cartão ou Pix (se concilia com o extrato). */
  conciliavel: boolean;
  /** Conciliação manual registrada: dia em que o dinheiro caiu, valor líquido e referência do extrato. */
  conciliacao: { liquidadoEm: string; liquido: number; referencia: string } | null;
};
export type RegistroDevolucao = { numero: number; vendaId: string; vendaNumero: number; unidadeId: string; quando: string; valor: number; motivo: string };
export type RegistroCaixa = {
  unidadeId: string; pessoaId: string; situacao: string; abertoEm: string; fechadoEm: string | null;
  fundo: number; esperado: number | null; contado: number | null; diferenca: number | null;
};
export type Registros =
  | { visao: "vendas"; linhas: RegistroVenda[] }
  | { visao: "pagamentos"; linhas: RegistroPagamento[] }
  | { visao: "devolucoes"; linhas: RegistroDevolucao[] }
  | { visao: "caixas"; linhas: RegistroCaixa[] };

const opcional = (v: unknown) => (v === null || v === undefined ? null : centavosDoBanco(v));
const umaVenda = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { id?: string; numero?: number; unidade_id?: string } | null;

// Monta a consulta de uma visão (sem paginação). `unidade` nula = a rede que o RLS deixa ver.
function consulta(supabase: Cliente, visao: Visao, janela: Janela, unidade: string | null, situacao: string | null) {
  const inicio = janela.inicio.toISOString();
  const fim = janela.fim.toISOString();
  if (visao === "vendas") {
    let q = supabase.from("vendas")
      .select("id, numero, unidade_id, vendedor_id, situacao, total_centavos, devolvido_centavos, concluida_em, cancelada_em", { count: "exact" });
    q = situacao === "cancelada"
      ? q.eq("situacao", "cancelada").not("concluida_em", "is", null).gte("cancelada_em", inicio).lt("cancelada_em", fim).order("cancelada_em", { ascending: false })
      : q.gte("concluida_em", inicio).lt("concluida_em", fim).order("concluida_em", { ascending: false });
    if (situacao === "concluida") q = q.eq("situacao", "concluida");
    return unidade ? q.eq("unidade_id", unidade) : q;
  }
  if (visao === "pagamentos") {
    let q = supabase.from("venda_pagamentos")
      .select("id, meio, situacao, valor_centavos, entrada_centavos, meio_entrada, criado_em, conciliado_em, liquidado_em, valor_liquido_centavos, referencia_conciliacao, vendas!inner(id, numero, unidade_id)", { count: "exact" })
      .gte("criado_em", inicio).lt("criado_em", fim).order("criado_em", { ascending: false });
    // Os mesmos pagamentos do painel da conciliação: cartão e Pix que continuam confirmados.
    if (situacao === "a_conciliar") q = q.eq("situacao", "confirmado").in("meio", [...MEIOS_CONCILIAVEIS]).is("conciliado_em", null);
    else if (situacao === "conciliado") q = q.eq("situacao", "confirmado").not("conciliado_em", "is", null);
    else if (situacao) q = q.eq("situacao", situacao);
    return unidade ? q.eq("vendas.unidade_id", unidade) : q;
  }
  if (visao === "devolucoes") {
    const q = supabase.from("venda_devolucoes")
      .select("numero, valor_centavos, motivo, criado_em, vendas!inner(id, numero, unidade_id)", { count: "exact" })
      .gte("criado_em", inicio).lt("criado_em", fim).order("criado_em", { ascending: false });
    return unidade ? q.eq("vendas.unidade_id", unidade) : q;
  }
  let q = supabase.from("caixas")
    .select("id, unidade_id, operador_id, situacao, aberto_em, fechado_em, fundo_centavos, esperado_centavos, contado_centavos, diferenca_centavos", { count: "exact" });
  q = situacao === "aberto"
    ? q.eq("situacao", "aberto")
    : situacao
      ? q.eq("situacao", situacao).gte("fechado_em", inicio).lt("fechado_em", fim)
      : q.or(`situacao.eq.aberto,and(fechado_em.gte.${inicio},fechado_em.lt.${fim})`);
  q = q.order("aberto_em", { ascending: false });
  return unidade ? q.eq("unidade_id", unidade) : q;
}

function converter(visao: Visao, linhas: Record<string, unknown>[]): Registros {
  if (visao === "vendas") {
    return {
      visao, linhas: linhas.map((l) => ({
        id: String(l.id), numero: Number(l.numero), unidadeId: String(l.unidade_id), pessoaId: String(l.vendedor_id),
        quando: String(l.situacao === "cancelada" ? l.cancelada_em ?? l.concluida_em : l.concluida_em), situacao: String(l.situacao),
        total: centavosDoBanco(l.total_centavos ?? 0), devolvido: centavosDoBanco(l.devolvido_centavos ?? 0),
      })),
    };
  }
  if (visao === "pagamentos") {
    return {
      visao, linhas: linhas.map((l) => {
        const venda = umaVenda(l.vendas);
        return {
          vendaId: String(venda?.id ?? ""), vendaNumero: Number(venda?.numero ?? 0), unidadeId: String(venda?.unidade_id ?? ""), quando: String(l.criado_em),
          meio: String(l.meio), situacao: String(l.situacao), valor: centavosDoBanco(l.valor_centavos), entrada: centavosDoBanco(l.entrada_centavos ?? 0),
          meioEntrada: typeof l.meio_entrada === "string" ? l.meio_entrada : null,
          conciliavel: MEIOS_CONCILIAVEIS.has(String(l.meio)),
          conciliacao: typeof l.conciliado_em === "string" && typeof l.liquidado_em === "string"
            ? { liquidadoEm: l.liquidado_em, liquido: centavosDoBanco(l.valor_liquido_centavos ?? 0), referencia: String(l.referencia_conciliacao ?? "") }
            : null,
        };
      }),
    };
  }
  if (visao === "devolucoes") {
    return {
      visao, linhas: linhas.map((l) => {
        const venda = umaVenda(l.vendas);
        return {
          numero: Number(l.numero), vendaId: String(venda?.id ?? ""), vendaNumero: Number(venda?.numero ?? 0), unidadeId: String(venda?.unidade_id ?? ""),
          quando: String(l.criado_em), valor: centavosDoBanco(l.valor_centavos), motivo: String(l.motivo ?? ""),
        };
      }),
    };
  }
  return {
    visao, linhas: linhas.map((l) => ({
      unidadeId: String(l.unidade_id), pessoaId: String(l.operador_id), situacao: String(l.situacao), abertoEm: String(l.aberto_em),
      fechadoEm: typeof l.fechado_em === "string" ? l.fechado_em : null, fundo: centavosDoBanco(l.fundo_centavos ?? 0),
      esperado: opcional(l.esperado_centavos), contado: opcional(l.contado_centavos), diferenca: opcional(l.diferenca_centavos),
    })),
  };
}

/** Uma página da visão (tela). */
export async function paginaDeRegistros(supabase: Cliente, visao: Visao, janela: Janela, unidade: string | null, situacao: string | null, pagina: number) {
  const de = (pagina - 1) * POR_PAGINA;
  const r = await consulta(supabase, visao, janela, unidade, situacao).range(de, de + POR_PAGINA - 1);
  if (r.error) throw new FalhaDoServico(`financeiro_${visao}`);
  return { registros: converter(visao, (r.data ?? []) as Record<string, unknown>[]), total: r.count ?? 0 };
}

/** Todos os registros da visão no período (exportação), lote a lote; para no limite e avisa. */
export async function todosOsRegistros(supabase: Cliente, visao: Visao, janela: Janela, unidade: string | null, situacao: string | null) {
  const linhas: Record<string, unknown>[] = [];
  for (let de = 0; de < LIMITE_DA_EXPORTACAO; de += LOTE) {
    const r = await consulta(supabase, visao, janela, unidade, situacao).range(de, Math.min(de + LOTE, LIMITE_DA_EXPORTACAO) - 1);
    if (r.error) throw new FalhaDoServico(`financeiro_exportar_${visao}`);
    const lote = (r.data ?? []) as Record<string, unknown>[];
    linhas.push(...lote);
    if (lote.length < LOTE) return { registros: converter(visao, linhas), cortado: false };
  }
  return { registros: converter(visao, linhas), cortado: true };
}

/** Ids de pessoas e lojas para buscar os nomes (uma consulta para cada, sem repetir). */
export function idsDosRegistros(r: Registros) {
  const pessoas = r.visao === "vendas" || r.visao === "caixas" ? r.linhas.map((l) => l.pessoaId) : [];
  return { pessoas: [...new Set(pessoas)], lojas: [...new Set(r.linhas.map((l) => l.unidadeId))] };
}
