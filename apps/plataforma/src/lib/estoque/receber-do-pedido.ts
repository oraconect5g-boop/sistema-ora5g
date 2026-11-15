// Receber a mercadoria a partir do pedido de compra (lote INV-009b: ORA-INV-009): o que falta receber do pedido aberto
// vira as linhas da entrada de mercadoria — o item, a quantidade que falta e o custo combinado (só para quem vê custo) —,
// e a entrada registrada já sai ligada ao pedido. Quem confere tudo de novo é o banco: a entrada
// (estoque_registrar_entrada) e a ligação ao pedido (pedido_compra_ligar_entrada, a mesma loja e o mesmo fornecedor).
import type { obterSessao } from "../acesso/sessao";
import type { PedidoDeCompra } from "./pedidos-de-compra";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
export type TipoQueEntra = "aparelho" | "chip" | "acessorio";
const TIPOS_QUE_ENTRAM: readonly string[] = ["aparelho", "chip", "acessorio"];

export type PedidoParaReceber = {
  id: string; numero: number; fornecedorId: string; fornecedor: string;
  linhas: { item: { id: string; sku: string; nome: string; tipo: TipoQueEntra }; falta: number; custo: string }[];
  /** Linhas que faltam, mas cujo item não entra mais no estoque (variação ou produto inativo): ficam de fora, com aviso. */
  deFora: number;
};

export const AVISOS_DO_PEDIDO = {
  nao_encontrado: "Pedido de compra não encontrado para você. A entrada segue como sempre, sem o pedido.",
  outra_loja: "Este pedido é de outra loja: troque para a loja do pedido para receber a mercadoria dele.",
  encerrado: "Este pedido já foi encerrado. Registre a entrada como sempre, sem o pedido.",
  completo: "Nada falta receber neste pedido: tudo o que foi pedido já entrou.",
  inativos: "Os itens que faltam deste pedido estão inativos no catálogo: reative-os antes de receber.",
  indisponivel: "Os pedidos de compra ainda não estão disponíveis neste ambiente. A entrada segue como sempre.",
  falha: "Não deu para ler o pedido agora. A entrada segue como sempre; tente de novo em instantes.",
} as const;
export type AvisoDoPedido = keyof typeof AVISOS_DO_PEDIDO;

/** Centavos para o campo do formulário, como a pessoa digitaria: 1800 → "18,00" (o servidor relê com lerReais). */
export const reaisDoCampo = (centavos: number) => `${Math.trunc(centavos / 100)},${String(centavos % 100).padStart(2, "0")}`;

/**
 * As linhas da entrada a partir do pedido: cada item do pedido com falta (pedido menos recebido nas entradas
 * registradas ligadas), na ordem do pedido. O item que não entra mais no estoque fica de fora (e é contado); o custo
 * combinado só vai para quem vê custo (o banco já esconde dos outros).
 */
export function montarPedidoParaReceber(pedido: PedidoDeCompra, tipos: ReadonlyMap<string, TipoQueEntra>): PedidoParaReceber | "completo" | "inativos" {
  const faltam = pedido.itens.filter((i) => i.quantidade > i.recebida);
  if (faltam.length === 0) return "completo";
  const linhas = faltam.flatMap((i) => {
    const tipo = tipos.get(i.varianteId);
    if (!tipo) return [];
    const custo = pedido.veCusto && i.custoCombinado !== null ? reaisDoCampo(i.custoCombinado) : "";
    return [{ item: { id: i.varianteId, sku: i.sku, nome: i.nome, tipo }, falta: i.quantidade - i.recebida, custo }];
  });
  if (linhas.length === 0) return "inativos";
  return { id: pedido.id, numero: pedido.numero, fornecedorId: pedido.fornecedorId, fornecedor: pedido.fornecedor, linhas, deFora: faltam.length - linhas.length };
}

/** O tipo de cada variação que ainda entra no estoque (ativa, de produto ativo, aparelho, chip ou acessório). Falha: nulo. */
export async function tiposQueEntram(supabase: Cliente, ids: readonly string[]): Promise<Map<string, TipoQueEntra> | null> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("variantes").select("id, produtos!inner(tipo)").in("id", [...ids]).eq("ativa", true).eq("produtos.ativo", true);
  if (error || !Array.isArray(data)) return null;
  const tipos = new Map<string, TipoQueEntra>();
  for (const v of data as unknown as { id: string; produtos: { tipo: string } | null }[]) {
    const tipo = v.produtos?.tipo;
    if (typeof tipo === "string" && TIPOS_QUE_ENTRAM.includes(tipo)) tipos.set(v.id, tipo as TipoQueEntra);
  }
  return tipos;
}
