// O preço da venda não muda: o único valor adicional é o calculado pela própria maquininha.
export const BANDEIRAS = {
  visa: "Visa", mastercard: "Mastercard", elo: "Elo", amex: "American Express",
  hipercard: "Hipercard", simp: "Simp", outra: "Outra",
} as const;
export type Bandeira = keyof typeof BANDEIRAS;
export type Modalidade = "credito" | "debito";
export type ProvedorManual = "picpay" | "pagbank" | "mercado_pago";
export const PROVEDORES_MANUAIS = { picpay: "PicPay", pagbank: "PagBank", mercado_pago: "Mercado Pago" } as const;
export const CARTAO_POR_PROVEDOR = { picpay: "cartao_picpay", pagbank: "cartao_pagseguro", mercado_pago: "cartao_mercado_pago" } as const;
export const PIX_POR_PROVEDOR = { picpay: "pix_picpay", mercado_pago: "pix_mercado_pago" } as const;
export const ehBandeira = (valor: unknown): valor is Bandeira => typeof valor === "string" && Object.hasOwn(BANDEIRAS, valor);
export const ehProvedorManual = (valor: string): valor is ProvedorManual => Object.hasOwn(PROVEDORES_MANUAIS, valor);

export function politicaDoCartao(provedor: ProvedorManual | undefined, modalidade: Modalidade, bandeira: Bandeira | undefined) {
  if (bandeira === "simp" && (provedor !== "mercado_pago" || modalidade !== "credito")) {
    return { maximo: 0, jurosApartirDe: null };
  }
  if (modalidade === "debito") return { maximo: 1, jurosApartirDe: null };
  if (bandeira === "simp") return { maximo: 6, jurosApartirDe: null };
  return { maximo: 18, jurosApartirDe: 13 };
}
