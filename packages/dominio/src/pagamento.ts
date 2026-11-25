import { exigirCentavos, type Centavos } from "./dinheiro";

// Pagamento misto (ORA-POS-007) e venda financiada (DEC-U38):
// na PayJoy/Aiva lança-se o preço do aparelho e a entrada; o restante fica "a receber da
// financeira". Juros da financeira NUNCA entram. E-mail do cliente sempre opcional, também na PayJoy (16/11/2026: a regra
// do proprietário de 12/11, #76, substitui a DEC-U30; exigência de parceiro só com o contrato dele, no adaptador).

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
  // PAY-015a (a D-062: "pagamento oficial da loja será a asaas"): o QR Code do Pix gerado no caixa. A tela não declara este
  // meio: o banco põe a linha de cada QR pago na conclusão (o comprovante é a cobrança da Asaas).
  pix_asaas: { nome: "Pix pela Asaas (QR Code)", aceitaTroco: false, financeira: false, comprovante: false },
  // PAY-015b: o cartão pela Asaas no caixa (o link de pagamento no cartão, com o QR Code); como o Pix pela Asaas, só o banco
  // grava a linha, na conclusão, depois de a consulta do worker confirmar.
  cartao_asaas: { nome: "Cartão pela Asaas (link)", aceitaTroco: false, financeira: false, comprovante: false },
} as const;

export type MeioPagamento = keyof typeof MEIOS;

export type Pagamento = {
  meio: MeioPagamento;
  valor: Centavos;
  entrada?: Centavos;
  /** PDV-c (o proprietário, 18/11): em quantas parcelas (a PayJoy e a Aiva, 1 a 48; o cartão, 1 a 24). */
  parcelas?: number;
  /** PDV-c: este pagamento é a entrada da PayJoy ou da Aiva, à parte (dinheiro, Pix ou cartão). */
  entradaDoFinanciamento?: boolean;
};

/** PDV-c: o máximo de parcelas de cada meio que parcela (a mesma regra da concluir_venda). */
export const MAXIMO_DE_PARCELAS: Partial<Record<MeioPagamento, number>> = { payjoy: 48, aiva: 48, cartao_picpay: 24, cartao_pagseguro: 24 };

/** PDV-c: a entrada da PayJoy e da Aiva é paga num destes meios (dinheiro, Pix ou cartão). */
export const ehMeioDaEntrada = (m: MeioPagamento) => !MEIOS[m].financeira && m !== "vale_troca" && m !== "link_pagamento" && m !== "pix_asaas" && m !== "cartao_asaas";
/** Os meios que só o banco grava (na conclusão): o pago pelo site e o Pix pela Asaas do caixa. A tela não os declara. */
export const MEIOS_SO_DO_BANCO: readonly MeioPagamento[] = ["link_pagamento", "pix_asaas", "cartao_asaas"];

/**
 * PDV-c (o proprietário, 18/11): o nome do pagamento na tela e no comprovante. A PayJoy e a Aiva aparecem como o
 * recebimento via a financeira; a entrada aparece à parte, com o meio em que foi paga.
 */
export function nomeDoPagamento(p: { meio: string; entradaDoFinanciamento?: boolean | null }): string {
  if (!Object.hasOwn(MEIOS, p.meio)) return p.meio;
  const meio = p.meio as MeioPagamento;
  if (meio === "payjoy") return "Recebimento via PayJoy";
  if (meio === "aiva") return "Recebimento via Aiva";
  return p.entradaDoFinanciamento ? `Entrada do financiamento (${MEIOS[meio].nome})` : MEIOS[meio].nome;
}

/** PDV-c: as parcelas como o comprovante mostra: " em 12x"; " (1x)" no meio que parcela; vazio no resto. */
export function textoDasParcelas(meio: string, parcelas: number | null | undefined): string {
  if (parcelas === null || parcelas === undefined || !Number.isSafeInteger(parcelas) || parcelas < 1) return "";
  if (parcelas > 1) return ` em ${parcelas}x`;
  return Object.hasOwn(MAXIMO_DE_PARCELAS, meio) ? " (1x)" : "";
}

export type ResultadoPagamento = {
  valido: boolean;
  recebidoNaLoja: Centavos; // o que entra na loja agora (inclui entradas de financiamento)
  aReceberDeFinanceiras: Centavos;
  troco: Centavos;
  falta: Centavos;
  erros: string[];
};

/**
 * A conferência do pagamento misto, a mesma regra da concluir_venda. Com `valorDosCelulares` (PDV-c), a PayJoy e a Aiva
 * financiam no máximo o valor dos celulares da venda: o chip, os acessórios e os serviços são pagos à parte.
 */
export function conferirPagamentos(total: Centavos, pagamentos: readonly Pagamento[], opcoes: { valorDosCelulares?: Centavos } = {}): ResultadoPagamento {
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
    const maximo = MAXIMO_DE_PARCELAS[p.meio];
    if (MEIOS[p.meio].financeira && (p.parcelas === undefined || !Number.isSafeInteger(p.parcelas) || p.parcelas < 1 || p.parcelas > (maximo ?? 0))) {
      erros.push(`${MEIOS[p.meio].nome}: informe as parcelas (de 1 a ${maximo})`);
      continue;
    }
    if (!MEIOS[p.meio].financeira && p.parcelas !== undefined && (maximo === undefined ? p.parcelas !== 1 : !Number.isSafeInteger(p.parcelas) || p.parcelas < 1 || p.parcelas > maximo)) {
      erros.push(maximo === undefined ? `${MEIOS[p.meio].nome} não tem parcelas` : `${MEIOS[p.meio].nome}: de 1 a ${maximo} parcelas`);
      continue;
    }
    if (p.entradaDoFinanciamento && !ehMeioDaEntrada(p.meio)) {
      erros.push("A entrada do financiamento é paga em dinheiro, Pix ou cartão");
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
    } else {
      recebidoNaLoja += p.valor;
      if (p.meio === "dinheiro") pagoEmDinheiro += p.valor;
    }
  }

  if (pagamentos.some((p) => p.entradaDoFinanciamento) && !pagamentos.some((p) => Object.hasOwn(MEIOS, p.meio) && MEIOS[p.meio].financeira)) {
    erros.push("A entrada só existe numa venda com a PayJoy ou a Aiva");
  }
  if (opcoes.valorDosCelulares !== undefined && aReceberDeFinanceiras > opcoes.valorDosCelulares) {
    erros.push(opcoes.valorDosCelulares === 0
      ? "A PayJoy e a Aiva financiam só o celular: esta venda não tem celular"
      : "A PayJoy e a Aiva financiam só o valor do celular: o chip, os acessórios e os serviços são pagos à parte");
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
