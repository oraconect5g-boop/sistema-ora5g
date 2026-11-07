import type { Centavos } from "./dinheiro";

// Pagamento misto (ORA-POS-007) e venda financiada (DEC-U38):
// na PayJoy/Aiva lança-se o preço do aparelho e a entrada; o restante fica "a receber da
// financeira". Juros da financeira NUNCA entram. E-mail do cliente obrigatório só na PayJoy (DEC-U30).

export const MEIOS = {
  dinheiro: { nome: "Dinheiro", aceitaTroco: true, financeira: false },
  pix_direto: { nome: "Pix direto", aceitaTroco: false, financeira: false },
  pix_picpay: { nome: "Pix na maquininha PicPay", aceitaTroco: false, financeira: false },
  cartao_picpay: { nome: "Cartão na maquininha PicPay", aceitaTroco: false, financeira: false },
  cartao_pagseguro: { nome: "Cartão na maquininha PagSeguro", aceitaTroco: false, financeira: false },
  link_pagamento: { nome: "Link de pagamento", aceitaTroco: false, financeira: false },
  payjoy: { nome: "Financiamento PayJoy", aceitaTroco: false, financeira: true },
  aiva: { nome: "Financiamento Aiva (Flexphone)", aceitaTroco: false, financeira: true },
} as const;

export type MeioPagamento = keyof typeof MEIOS;

export type Pagamento = { meio: MeioPagamento; valor: Centavos; entrada?: Centavos };

export type ResultadoPagamento = {
  valido: boolean;
  recebidoNaLoja: Centavos; // o que entra na loja agora (inclui entradas de financiamento)
  aReceberDeFinanceiras: Centavos;
  troco: Centavos;
  falta: Centavos;
  erros: string[];
};

export function conferirPagamentos(
  total: Centavos,
  pagamentos: readonly Pagamento[],
  cliente: { email?: string | null } = {},
): ResultadoPagamento {
  const erros: string[] = [];
  let recebidoNaLoja = 0;
  let aReceberDeFinanceiras = 0;
  let pagoEmDinheiro = 0;

  for (const p of pagamentos) {
    if (!Number.isSafeInteger(p.valor) || p.valor <= 0) erros.push(`${MEIOS[p.meio].nome}: valor precisa ser maior que zero`);
    if (MEIOS[p.meio].financeira) {
      const entrada = p.entrada ?? 0;
      if (entrada < 0 || entrada > p.valor) erros.push(`${MEIOS[p.meio].nome}: entrada maior que o valor financiado`);
      recebidoNaLoja += entrada;
      aReceberDeFinanceiras += p.valor - entrada;
      if (p.meio === "payjoy" && !cliente.email) erros.push("PayJoy exige o e-mail do cliente");
    } else {
      recebidoNaLoja += p.valor;
      if (p.meio === "dinheiro") pagoEmDinheiro += p.valor;
    }
  }

  const pago = recebidoNaLoja + aReceberDeFinanceiras;
  const excedente = Math.max(0, pago - total);
  const troco = Math.min(excedente, pagoEmDinheiro);
  if (excedente > troco) erros.push("Pagamento maior que o total sem dinheiro para dar troco");
  const falta = Math.max(0, total - pago);
  if (pagamentos.length === 0) erros.push("Nenhum pagamento informado");

  return {
    valido: erros.length === 0 && falta === 0,
    recebidoNaLoja: recebidoNaLoja - troco,
    aReceberDeFinanceiras,
    troco,
    falta,
    erros,
  };
}
