// O carrinho do site (lote ONLINE-d: ORA-ONLINE-002; ADR-023). Fica no aparelho do visitante, num cookie sem dado pessoal
// (o produto, a variação e a loja de retirada): até 3 unidades de uma loja só. Nada vai ao banco até "Reservar o pedido";
// aí o banco (public.loja_pedir) confere tudo de novo e reserva tudo de uma vez ou nada.
import { ehUuidDaVitrine } from "./vitrine";

export const COOKIE_DO_CARRINHO = "ora_carrinho";
export const UNIDADES_NO_CARRINHO = 3;

export type ItemDoCarrinho = { produto: string; variante: string };
export type Carrinho = { loja: string | null; itens: ItemDoCarrinho[] };
export const CARRINHO_VAZIO: Carrinho = { loja: null, itens: [] };

/** Lê o cookie com rigor: forma estranha, loja ou item que não é identificador, mais de 3 unidades: carrinho vazio. */
export function lerCarrinho(valor: string | undefined): Carrinho {
  if (!valor || valor.length > 600) return CARRINHO_VAZIO;
  let dado: unknown;
  try {
    dado = JSON.parse(valor);
  } catch {
    return CARRINHO_VAZIO;
  }
  if (!dado || typeof dado !== "object" || Array.isArray(dado)) return CARRINHO_VAZIO;
  const { l, i } = dado as { l?: unknown; i?: unknown };
  if (!ehUuidDaVitrine(l) || !Array.isArray(i) || i.length === 0 || i.length > UNIDADES_NO_CARRINHO) return CARRINHO_VAZIO;
  const itens: ItemDoCarrinho[] = [];
  for (const par of i) {
    if (!Array.isArray(par) || par.length !== 2 || !ehUuidDaVitrine(par[0]) || !ehUuidDaVitrine(par[1])) return CARRINHO_VAZIO;
    itens.push({ produto: par[0], variante: par[1] });
  }
  return { loja: l, itens };
}

/** O valor do cookie (curto: só os identificadores). */
export const escreverCarrinho = (c: Carrinho) => JSON.stringify({ l: c.loja, i: c.itens.map((x) => [x.produto, x.variante]) });

export type ProblemaDoCarrinho = "outra_loja" | "cheio";
/**
 * Põe uma unidade no carrinho. O carrinho é de uma loja só: com item de outra loja, a pessoa decide trocar (o carrinho
 * recomeça nesta loja) ou não. Cheio (3 unidades), nada muda.
 */
export function comOItem(c: Carrinho, loja: string, item: ItemDoCarrinho, trocarDeLoja = false): { carrinho: Carrinho; problema: ProblemaDoCarrinho | null } {
  if (c.itens.length > 0 && c.loja !== loja) {
    if (!trocarDeLoja) return { carrinho: c, problema: "outra_loja" };
    return { carrinho: { loja, itens: [item] }, problema: null };
  }
  if (c.itens.length >= UNIDADES_NO_CARRINHO) return { carrinho: c, problema: "cheio" };
  return { carrinho: { loja, itens: [...c.itens, item] }, problema: null };
}

/** Tira a unidade da posição dada; sem itens, o carrinho volta a ficar sem loja. */
export function semOItem(c: Carrinho, indice: number): Carrinho {
  if (!Number.isInteger(indice) || indice < 0 || indice >= c.itens.length) return c;
  const itens = c.itens.filter((_, i) => i !== indice);
  return itens.length === 0 ? CARRINHO_VAZIO : { loja: c.loja, itens };
}

export type PedidoDoSite = {
  codigo: string; situacao: "reservado" | "vencido" | "atendido" | "cancelado"; expira_em: string; total_centavos: number; unidades: number;
  itens: { produto: string; variacao: string; preco_centavos: number }[];
  loja: { nome: string; endereco: string | null; cidade: string | null };
};
const SITUACOES_DO_PEDIDO = ["reservado", "vencido", "atendido", "cancelado"] as const;
/** A resposta do banco (loja_pedir, loja_pedido_consultar) com rigor: forma estranha é nula. */
export function lerPedidoDoSite(v: unknown): PedidoDoSite | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const p = v as Record<string, unknown>;
  const loja = p.loja as Record<string, unknown> | null | undefined;
  const itens = p.itens;
  if (typeof p.codigo !== "string" || !/^[A-HJ-NP-Z2-9]{6}$/.test(p.codigo) || !(SITUACOES_DO_PEDIDO as readonly unknown[]).includes(p.situacao)
    || typeof p.expira_em !== "string" || !Number.isSafeInteger(p.total_centavos) || !Number.isSafeInteger(p.unidades)
    || !Array.isArray(itens) || !loja || typeof loja.nome !== "string") return null;
  const lidos = itens.map((x) => {
    const i = x as Record<string, unknown>;
    return typeof i?.produto === "string" && Number.isSafeInteger(i.preco_centavos)
      ? { produto: i.produto, variacao: typeof i.variacao === "string" ? i.variacao : "", preco_centavos: i.preco_centavos as number } : null;
  });
  if (lidos.some((x) => x === null)) return null;
  return {
    codigo: p.codigo, situacao: p.situacao as PedidoDoSite["situacao"], expira_em: p.expira_em, total_centavos: p.total_centavos as number,
    unidades: p.unidades as number, itens: lidos as PedidoDoSite["itens"],
    loja: { nome: loja.nome, endereco: typeof loja.endereco === "string" ? loja.endereco : null, cidade: typeof loja.cidade === "string" ? loja.cidade : null },
  };
}

/** O nome do item como o cliente o reconhece: o produto e, quando diz algo a mais, a variação (sem repetir o nome). */
export const nomeDoItem = (produto: string, variacao: string) => (variacao && variacao !== produto ? `${produto} · ${variacao}` : produto);

/** O código do pedido digitado (6 letras e números, sem os que se confundem), em maiúsculas; outro, nulo. */
export function codigoDoPedido(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6}$/.test(v) ? v : null;
}

export const ERROS_DO_PEDIDO = {
  vazio: "O carrinho está vazio: escolha um produto e uma loja.",
  dados: "Confira o nome (de 2 a 80 letras) e o WhatsApp com DDD (11 números).",
  aceite: "Para reservar, marque que concorda com o uso do nome e do WhatsApp para este pedido.",
  limite_whatsapp: "Este WhatsApp já tem 2 reservas ou pedidos ativos. Retire um deles na loja ou espere vencer.",
  limite_loja: "Muitas reservas nesta loja agora. Tente de novo daqui a pouco.",
  limite_rede: "Muitos pedidos seguidos deste aparelho. Tente de novo mais tarde.",
  sem_estoque: "Um dos itens acabou nesta loja agora: tire-o do carrinho ou escolha outra loja. Nada ficou reservado.",
  indisponivel: "Um dos itens não está mais à venda nesta loja: tire-o do carrinho. Nada ficou reservado.",
  loja_fechada: "Esta loja não está vendendo pelo site agora: escolha outra loja. Nada ficou reservado.",
  repetido: "Este pedido já foi feito com outros dados. Recarregue a página e tente de novo.",
  sem_pedido: "O pedido pelo site ainda não está disponível. Enquanto isso, reserve um item por vez.",
  falha: "Não deu para reservar agora. Tente de novo em instantes.",
} as const;
export type ErroDoPedido = keyof typeof ERROS_DO_PEDIDO;

/** A recusa do banco (public.loja_pedir) pelo código. */
export function erroDoPedido(erro: { code?: string } | null | undefined): ErroDoPedido {
  switch (erro?.code) {
    case "22023": return "dados";
    case "OR034": return "limite_whatsapp";
    case "OR035": return "limite_loja";
    case "OR001": return "sem_estoque";
    case "OR036": return "indisponivel";
    case "OR038": case "OR043": return "loja_fechada";
    case "OR004": return "repetido";
    case "PGRST202": case "42883": return "sem_pedido";
    default: return "falha";
  }
}

/** Uma linha do carrinho, com o que o visitante vê: o produto, a variação, a loja, o preço do balcão e o estoque. */
export type LinhaDoCarrinho = { indice: number; produto: string; variante: string; nome: string; variacao: string; preco_centavos: number; disponivel: boolean };
/**
 * As linhas do carrinho pelo detalhe de cada produto (public.loja_produto). O item que saiu do site, a variação que não
 * existe mais ou a loja que não vende mais o produto não vira linha: volta em "fora", para a tela pedir que saia.
 */
export function linhasDoCarrinho(c: Carrinho, detalhes: ReadonlyMap<string, { nome: string; variantes: { id: string; nome: string; lojas: { id: string; nome: string; preco_centavos: number; disponibilidade: string }[] }[] }>):
  { linhas: LinhaDoCarrinho[]; fora: number[]; loja: string | null } {
  const linhas: LinhaDoCarrinho[] = [];
  const fora: number[] = [];
  let loja: string | null = null;
  c.itens.forEach((item, indice) => {
    const produto = detalhes.get(item.produto);
    const variante = produto?.variantes.find((v) => v.id === item.variante);
    const oferta = variante?.lojas.find((l) => l.id === c.loja);
    if (!produto || !variante || !oferta) {
      fora.push(indice);
      return;
    }
    loja = oferta.nome;
    linhas.push({ indice, produto: item.produto, variante: item.variante, nome: produto.nome, variacao: variante.nome, preco_centavos: oferta.preco_centavos, disponivel: oferta.disponibilidade !== "sem_estoque" });
  });
  return { linhas, fora, loja };
}
