import { lerReais, type MeioPagamento, type PoliticaDesconto } from "@ora5g/dominio";

import type { Categoria, ProdutoDemo } from "../../../demo/dados";

// Tipos e utilidades da tela de venda (demonstração). Tudo aqui é estado local do navegador:
// nada é gravado, e no sistema real o servidor confere preço, estoque e pagamentos.

export type DadosPdv = {
  loja: { codigo: string; nome: string };
  vendedor: string;
  aprovador: string;
  podeVerMargem: boolean;
  produtos: readonly ProdutoDemo[];
  /** IMEIs vendáveis nesta loja (disponível ou conferido). */
  unidades: readonly { imei: string; sku: string }[];
  saldos: Readonly<Record<string, number>>;
  chips: readonly string[];
  clientes: readonly { nome: string; telefone: string; cpf: string; email: string | null }[];
  politicas: Readonly<Record<Categoria, PoliticaDesconto>>;
  taxas: Readonly<Partial<Record<MeioPagamento, number>>>;
  valoresRecarga: readonly number[];
};

export type ItemCarrinho = {
  id: number;
  sku: string;
  quantidade: number;
  imei?: string;
  iccid?: string;
  descontoTexto: string;
  /** Recarga: valor escolhido (valor de face). */
  valor?: number;
};

export type LinhaPagamento = { id: number; meio: MeioPagamento; valorTexto: string; entradaTexto: string };

export type Cliente = { nome: string; email: string | null; novo?: boolean };

export type Aprovacao = { assinatura: string; situacao: "pedida" | "aprovada" | "negada"; motivo: string };

/** Lê um valor em reais digitado; vazio = 0; formato inválido = null (nunca derruba a tela). */
export function lerSeguro(texto: string): number | null {
  if (texto.trim() === "") return 0;
  try {
    return lerReais(texto);
  } catch {
    return null;
  }
}

export const reaisParaTexto = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

/** O que, se mudar, invalida um pedido de aprovação já feito (itens, descontos e taxa do meio). */
export const assinaturaDoCarrinho = (itens: readonly ItemCarrinho[], taxa: number) =>
  JSON.stringify([itens.map((i) => [i.sku, i.imei ?? "", i.quantidade, i.descontoTexto.trim(), i.valor ?? 0]), taxa]);
