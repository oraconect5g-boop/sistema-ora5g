// A compra que nasceu no site (lote CRM-009a: ORA-CRM-009, "pedido externo e venda vinculados sem sobrescrever origem").
// O visitante reserva no site (um pedido com carrinho, ADR-023, ou uma reserva avulsa, ADR-009) e retira e paga na loja: a
// loja atende abrindo uma venda do balcão. A venda continua sendo do balcão (canal "loja"); a origem fica guardada no
// pedido e na reserva, que apontam para a venda (venda_id). Aqui se lê essa ligação para as telas dizerem de onde a compra
// veio: a ficha do cliente e a tela da venda.
//
// Lido pelo RLS de quem pergunta (quem vende na loja vê as reservas e os pedidos dela), como os outros blocos da ficha: quem
// não vê a reserva não recebe a anotação. Falha de leitura aparece como falha, nunca como "não veio do site".
import type { obterSessao } from "../acesso/sessao";
import { tabelaAusente } from "../caixa/saidas";
import type { Bloco } from "../clientes/historico";
import { NOMES_DAS_ORIGENS, ORIGENS_DO_SITE, type OrigemDoSite } from "./origem";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export type VendaDoSite = {
  vendaId: string;
  /** "pedido": o carrinho reservado de uma vez; "reserva": a reserva avulsa de uma unidade. */
  tipo: "pedido" | "reserva";
  /** O código que o visitante recebeu (o do pedido, ou o da reserva avulsa). Nulo: o pedido não pôde ser lido por quem pergunta. */
  codigo: string | null;
  /** Quando o visitante fez o pedido ou a reserva no site. */
  feitoEm: string;
  unidades: number;
  /** De onde o visitante chegou ao site (nulo: sem registro). */
  origem: OrigemDoSite | null;
};

const ehOrigem = (v: unknown): v is OrigemDoSite => typeof v === "string" && (ORIGENS_DO_SITE as readonly string[]).includes(v);
const COLUNA_AUSENTE = ["42703", "PGRST204"];

/** As vendas dadas que atenderam um pedido ou uma reserva do site, uma linha por venda. Sem venda nenhuma, nada é lido. */
export async function lerVendasDoSite(supabase: Cliente, vendas: readonly string[]): Promise<Bloco<VendaDoSite>> {
  if (vendas.length === 0) return { estado: "ok", itens: [] };
  const falha = (erro: { code?: string }, fonte: string): Bloco<VendaDoSite> => {
    if (tabelaAusente(erro) || COLUNA_AUSENTE.includes(erro.code ?? "")) return { estado: "indisponivel" };
    console.error("loja: falha ao ler as vendas que vieram do site", { fonte, codigo: erro.code ?? null });
    return { estado: "falha" };
  };
  // As duas leituras saem juntas (uma rodada só): as unidades atendidas por estas vendas e os pedidos atendidos por elas.
  const [reservas, pedidos] = await Promise.all([
    supabase.from("loja_reservas").select("venda_id, numero, codigo, criada_em, origem, pedido_id").in("venda_id", [...vendas]).eq("situacao", "atendida").order("numero"),
    supabase.from("loja_pedidos").select("id, codigo, criado_em").in("venda_id", [...vendas]),
  ]);
  if (reservas.error) return falha(reservas.error, "loja_reservas");
  if (pedidos.error) return falha(pedidos.error, "loja_pedidos");
  const linhas = (reservas.data ?? []).filter((r): r is typeof r & { venda_id: string } => typeof r.venda_id === "string");
  const porVenda = new Map<string, typeof linhas>();
  for (const r of linhas) porVenda.set(r.venda_id, [...(porVenda.get(r.venda_id) ?? []), r]);
  const itens = [...porVenda.entries()].map(([vendaId, daVenda]): VendaDoSite => {
    const primeira = daVenda[0] as (typeof linhas)[number];
    const pedido = primeira.pedido_id ? (pedidos.data ?? []).find((p) => p.id === primeira.pedido_id) ?? null : null;
    const origem = daVenda.map((r) => r.origem).find(ehOrigem) ?? null;
    return primeira.pedido_id
      ? { vendaId, tipo: "pedido", codigo: pedido?.codigo ?? null, feitoEm: pedido?.criado_em ?? primeira.criada_em, unidades: daVenda.length, origem }
      : { vendaId, tipo: "reserva", codigo: primeira.codigo, feitoEm: primeira.criada_em, unidades: daVenda.length, origem };
  });
  return { estado: "ok", itens };
}

const dia = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(iso));

/** O nome curto, para uma linha de lista: "pedido do site ABC234" ou "reserva do site XYZ789" (o código que o visitante recebeu). */
export function nomeDaVendaDoSite(v: Pick<VendaDoSite, "tipo" | "codigo">): string {
  const nome = v.tipo === "pedido" ? "pedido do site" : "reserva do site";
  return v.codigo ? `${nome} ${v.codigo}` : nome;
}

/** De onde o visitante chegou, numa frase curta; nulo sem registro. */
export function chegadaDoVisitante(origem: OrigemDoSite | null): string | null {
  if (origem === null) return null;
  if (origem === "direto") return "chegou direto ao site";
  const nome = NOMES_DAS_ORIGENS[origem];
  return `chegou por ${["outro_site", "outra_campanha", "email"].includes(origem) ? nome.toLowerCase() : nome}`;
}

/** A frase da tela da venda: de onde a compra veio, sem mudar o que ela é (uma venda do balcão). */
export function fraseDaVendaDoSite(v: VendaDoSite): string {
  const feito = v.tipo === "pedido" ? "feito" : "feita";
  const detalhes = [v.unidades > 1 ? `${v.unidades} unidades` : null, chegadaDoVisitante(v.origem) ? `o visitante ${chegadaDoVisitante(v.origem)}` : null].filter((x): x is string => x !== null);
  return `Esta venda atendeu ${v.tipo === "pedido" ? "o" : "a"} ${nomeDaVendaDoSite(v)}, ${feito} em ${dia(v.feitoEm)}${detalhes.length ? ` (${detalhes.join("; ")})` : ""}. `
    + `O cliente reservou no site e retirou e pagou na loja: a venda é do balcão, e a origem fica guardada ${v.tipo === "pedido" ? "no pedido" : "na reserva"}.`;
}
