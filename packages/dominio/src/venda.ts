import type { Centavos } from "./dinheiro";
import { iccidValido, imeiValido } from "./identificadores";

// Uma operação comercial, muitos itens de naturezas diferentes (invariante 1).
// Cada tipo tem exigências próprias; a produção do vendedor conta cada fato uma única vez.

export const TIPOS_DE_ITEM = {
  aparelho: { nome: "Aparelho", exigeImei: true, exigeIccid: false, movimentaEstoque: true },
  acessorio: { nome: "Acessório", exigeImei: false, exigeIccid: false, movimentaEstoque: true },
  chip: { nome: "Chip", exigeImei: false, exigeIccid: true, movimentaEstoque: true },
  ativacao: { nome: "Ativação", exigeImei: false, exigeIccid: false, movimentaEstoque: false },
  portabilidade: { nome: "Portabilidade", exigeImei: false, exigeIccid: false, movimentaEstoque: false },
  recarga: { nome: "Recarga", exigeImei: false, exigeIccid: false, movimentaEstoque: false },
  servico: { nome: "Assistência / serviço", exigeImei: false, exigeIccid: false, movimentaEstoque: false },
} as const;

export type TipoItem = keyof typeof TIPOS_DE_ITEM;

// Operações telecom só contam depois da confirmação real da Nogle (invariante 6).
export type SituacaoTelecom = "pendente" | "confirmada" | "falhou";

export type ItemVenda = {
  tipo: TipoItem;
  descricao: string;
  quantidade: number;
  precoUnitario: Centavos;
  desconto?: Centavos;
  imei?: string;
  iccid?: string;
  situacaoTelecom?: SituacaoTelecom;
};

export function validarItem(item: ItemVenda): string[] {
  const erros: string[] = [];
  const tipo = TIPOS_DE_ITEM[item.tipo];
  if (!Number.isSafeInteger(item.quantidade) || item.quantidade < 1) erros.push("Quantidade inválida");
  if (tipo.exigeImei) {
    if (item.quantidade !== 1) erros.push("Aparelho é vendido um por IMEI");
    if (!item.imei || !imeiValido(item.imei)) erros.push("IMEI inválido");
  }
  if (tipo.exigeIccid && (!item.iccid || !iccidValido(item.iccid))) erros.push("ICCID inválido");
  if ((item.desconto ?? 0) > item.precoUnitario * item.quantidade) erros.push("Desconto maior que o item");
  return erros;
}

export function totalDoItem(item: ItemVenda): Centavos {
  return item.precoUnitario * item.quantidade - (item.desconto ?? 0);
}

// Recarga: o valor de face NÃO é receita da Ora (invariante 4); fica separado no total.
export function totaisDaVenda(itens: readonly ItemVenda[]) {
  let total = 0;
  let descontos = 0;
  let valorDeFaceRecargas = 0;
  for (const item of itens) {
    total += totalDoItem(item);
    descontos += item.desconto ?? 0;
    if (item.tipo === "recarga") valorDeFaceRecargas += totalDoItem(item);
  }
  return { total, descontos, valorDeFaceRecargas };
}

export type Producao = Record<TipoItem, number>;

// Contagem da produção do vendedor (ORA-PERF-001, DEC-U46): chips, ativações,
// portabilidades, recargas e assistências contam. Telecom só quando confirmada.
export function producaoDaVenda(itens: readonly ItemVenda[]): Producao {
  const producao = Object.fromEntries(Object.keys(TIPOS_DE_ITEM).map((t) => [t, 0])) as Producao;
  for (const item of itens) {
    const telecom = item.tipo === "ativacao" || item.tipo === "portabilidade" || item.tipo === "recarga";
    if (telecom && item.situacaoTelecom !== "confirmada") continue;
    producao[item.tipo] += item.quantidade;
  }
  return producao;
}
