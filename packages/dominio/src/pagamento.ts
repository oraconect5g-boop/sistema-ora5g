import { exigirCentavos, type Centavos } from "./dinheiro";

// Pagamento misto (ORA-POS-007) e venda financiada (DEC-U38):
// na PayJoy/Aiva lança-se o preço do aparelho e a entrada; o restante fica "a receber da
// financeira". Juros da financeira NUNCA entram. E-mail do cliente obrigatório só na PayJoy (DEC-U30).

// comprovante: o meio só se confirma com o código do comprovante (maquininha/Pix) ou o número do
// vale — inclusive como ENTRADA de financiamento (#46). Mesma regra de privado.meio_com_comprovante.
export const MEIOS = {
  dinheiro: { nome: "Dinheiro", aceitaTroco: true, financeira: false, comprovante: false },
  pix_direto: { nome: "Pix direto", aceitaTroco: false, financeira: false, comprovante: true },
  pix_picpay: { nome: "Pix na maquininha PicPay", aceitaTroco: false, financeira: false, comprovante: true },
  cartao_picpay: { nome: "Cartão na maquininha PicPay", aceitaTroco: false, financeira: false, comprovante: true },
  cartao_pagseguro: { nome: "Cartão na maquininha PagSeguro", aceitaTroco: false, financeira: false, comprovante: true },
  link_pagamento: { nome: "Link de pagamento", aceitaTroco: false, financeira: false, comprovante: false },
  payjoy: { nome: "Financiamento PayJoy", aceitaTroco: false, financeira: true, comprovante: false },
  aiva: { nome: "Financiamento Aiva (Flexphone)", aceitaTroco: false, financeira: true, comprovante: false },
  // Crédito de uma devolução (troca): o número do vale vai no campo do comprovante (adendo do ADR-004).
  vale_troca: { nome: "Vale-troca", aceitaTroco: false, financeira: false, comprovante: true },
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
  exigirCentavos(total, "total da venda");
  const erros: string[] = [];
  let recebidoNaLoja = 0;
  let aReceberDeFinanceiras = 0;
  let pagoEmDinheiro = 0;

  for (const p of pagamentos) {
    if (!Object.hasOwn(MEIOS, p.meio)) {
      erros.push("Meio de pagamento desconhecido");
      continue;
    }
    if (!Number.isSafeInteger(p.valor) || p.valor <= 0) {
      erros.push(`${MEIOS[p.meio].nome}: valor precisa ser maior que zero`);
      continue;
    }
    if (MEIOS[p.meio].financeira) {
      const entrada = p.entrada ?? 0;
      if (!Number.isSafeInteger(entrada) || entrada < 0) {
        erros.push(`${MEIOS[p.meio].nome}: entrada inválida`);
        continue;
      }
      if (entrada > p.valor) {
        erros.push(`${MEIOS[p.meio].nome}: entrada maior que o valor financiado`);
        continue;
      }
      recebidoNaLoja += entrada;
      aReceberDeFinanceiras += p.valor - entrada;
      if (p.meio === "payjoy" && !cliente.email) erros.push("PayJoy exige o e-mail do cliente");
    } else {
      recebidoNaLoja += p.valor;
      if (p.meio === "dinheiro") pagoEmDinheiro += p.valor;
    }
  }

  const pago = recebidoNaLoja + aReceberDeFinanceiras;
  if (!Number.isSafeInteger(pago)) erros.push("Soma dos pagamentos grande demais");
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
