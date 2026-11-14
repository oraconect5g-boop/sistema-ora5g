// A ficha 360 do cliente (lote L5e: ORA-CRM-002 em parte): as ordens de serviço da assistência (L12), o funil e a
// agenda (L5b) e as operações do Ora Connect das compras dele, cada bloco lido à parte e pelo RLS (cada pessoa vê o que
// já pode ver, como nas compras). Tabela ou coluna que o banco ainda não tem: o bloco some. Outra falha: o bloco diz que
// não leu (nunca "nenhum"). O número da linha aparece só com os quatro últimos dígitos.
import type { obterSessao } from "../acesso/sessao";
import { tabelaAusente } from "../caixa/saidas";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export type Bloco<T> = { estado: "ok"; itens: T[] } | { estado: "indisponivel" } | { estado: "falha" };
export type OsDoCliente = {
  id: string; numero: number; aparelho: string; situacao: string; servico: string; aberta_em: string; encerrada_em: string | null; prazo: string | null;
};
export type OportunidadeDoCliente = {
  id: string; numero: number; etapa: string; interesse: string; proximo_passo: string | null; proximo_passo_em: string | null; encerrado_em: string | null; criado_em: string;
};
export type AtividadeDoCliente = { id: string; tipo: string; descricao: string; situacao: string; vence_em: string; encerrada_em: string | null };
export type OperacaoDoCliente = { id: string; numero: number; tipo: string; situacao: string; criado_em: string; linha: string | null; plano: string | null };

const LIMITE = 20;

/** Erro de leitura: some (o banco ainda não tem a tabela ou a coluna) ou falha, com o código no log e nada do cliente. */
function bloco<T>(resposta: { data: T[] | null; error: { code?: string } | null }, fonte: string): Bloco<T> {
  if (resposta.error) {
    if (tabelaAusente(resposta.error) || ["42703", "PGRST204"].includes(resposta.error.code ?? "")) return { estado: "indisponivel" };
    console.error("clientes: falha ao ler o histórico da ficha", { fonte, codigo: resposta.error.code ?? null });
    return { estado: "falha" };
  }
  return { estado: "ok", itens: resposta.data ?? [] };
}

/** O número da linha do cliente, só com o DDD e os quatro últimos dígitos (a ficha não mostra o dado inteiro). */
export function linhaMascarada(linha: string | null | undefined): string | null {
  const digitos = (linha ?? "").replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 11) return null;
  return `(${digitos.slice(0, 2)}) •••••-${digitos.slice(-4)}`;
}

/**
 * Lê os três blocos da ficha. As operações do Ora Connect vêm das compras que a pessoa já vê: o chip vendido nelas
 * (venda_chip_id) ou o item da venda (recarga e ativação lançadas no PDV, venda_item_id).
 */
export async function lerHistoricoDoCliente(supabase: Cliente, cliente: string, vendas: readonly string[]) {
  const itensDasVendas = vendas.length
    ? await supabase.from("venda_itens").select("id").in("venda_id", [...vendas])
    : { data: [] as { id: string }[], error: null };
  const itens = itensDasVendas.error ? [] : (itensDasVendas.data ?? []).map((i) => i.id);
  const filtroDoConnect = [vendas.length ? `venda_chip_id.in.(${vendas.join(",")})` : null, itens.length ? `venda_item_id.in.(${itens.join(",")})` : null]
    .filter((f): f is string => f !== null).join(",");
  const [os, oportunidades, atividades, connect] = await Promise.all([
    supabase.from("ordens_servico").select("id, numero, aparelho, situacao, servico, aberta_em, encerrada_em, prazo")
      .eq("cliente_id", cliente).order("aberta_em", { ascending: false }).limit(LIMITE),
    supabase.from("oportunidades").select("id, numero, etapa, interesse, proximo_passo, proximo_passo_em, encerrado_em, criado_em")
      .eq("cliente_id", cliente).order("criado_em", { ascending: false }).limit(LIMITE),
    supabase.from("atividades").select("id, tipo, descricao, situacao, vence_em, encerrada_em")
      .eq("cliente_id", cliente).order("vence_em", { ascending: false }).limit(LIMITE),
    filtroDoConnect
      ? supabase.from("connect_operacoes").select("id, numero, tipo, situacao, criado_em, linha, numero_ativado, plano_nome")
        .or(filtroDoConnect).order("criado_em", { ascending: false }).limit(LIMITE)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const operacoes = bloco(connect as { data: { id: string; numero: number; tipo: string; situacao: string; criado_em: string; linha: string | null; numero_ativado: string | null; plano_nome: string | null }[] | null; error: { code?: string } | null }, "connect_operacoes");
  // A leitura dos itens que falhou entra como falha do bloco do Ora Connect (sem ela, a lista ficaria incompleta).
  const connectFinal: Bloco<OperacaoDoCliente> = itensDasVendas.error
    ? bloco({ data: null, error: itensDasVendas.error }, "venda_itens")
    : operacoes.estado === "ok"
      ? { estado: "ok", itens: operacoes.itens.map((o) => ({ id: o.id, numero: o.numero, tipo: o.tipo, situacao: o.situacao, criado_em: o.criado_em,
        linha: linhaMascarada(o.numero_ativado ?? o.linha), plano: o.plano_nome })) }
      : operacoes;
  return {
    os: bloco(os as { data: OsDoCliente[] | null; error: { code?: string } | null }, "ordens_servico"),
    oportunidades: bloco(oportunidades as { data: OportunidadeDoCliente[] | null; error: { code?: string } | null }, "oportunidades"),
    atividades: bloco(atividades as { data: AtividadeDoCliente[] | null; error: { code?: string } | null }, "atividades"),
    connect: connectFinal,
  };
}
