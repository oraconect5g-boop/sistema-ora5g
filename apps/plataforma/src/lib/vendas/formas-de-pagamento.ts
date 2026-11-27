// As formas de pagamento por botão no PDV (lote PDV-c; pedido do proprietário de 18/11/2026): nenhuma forma aparece até a
// pessoa tocar em "Adicionar forma de pagamento" e escolher; cada uma mostra só os campos dela. Regras puras e sem
// dependência, usadas pelo componente do navegador; o servidor (lib/vendas/regras.ts) e o banco conferem tudo de novo.

import type { Bandeira, ProvedorManual } from "./cartao-manual";

export type OpcaoDeMeio = {
  meio: string;
  nome: string;
  financeira: boolean;
  comprovante: boolean;
  /** O máximo de parcelas (a PayJoy e a Aiva, 48; o cartão, 18); nulo no meio que não parcela. */
  maximoDeParcelas: number | null;
  /** A maquininha do meio (cartão e Pix na maquininha); nulo no meio sem maquininha. */
  provedor: ProvedorManual | null;
  aceitaTroco: boolean;
  /** Pode ser a entrada da PayJoy ou da Aiva (dinheiro, Pix e cartão). */
  podeSerEntrada: boolean;
};
export type LinhaNaTela = { chave: number; meio: string; valor: string; parcelas: string; comprovante: string; terminal: string; entrada: boolean; bandeira?: Bandeira; totalNaMaquininha?: string };

/** "1.299,90", "1299,9" ou "1299" → centavos; outra forma é nula (a mesma leitura de reais do servidor, sem arredondar). */
export function centavosDoTexto(texto: string): number | null {
  const t = texto.trim();
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(t)) return null;
  const [inteiro = "0", fracao = ""] = t.replace(/\./g, "").split(",");
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}
/** Centavos → "1299,90", o formato que o campo de valor aceita. */
export const textoDosCentavos = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

/** O que já foi lançado, o que falta, o troco (só do dinheiro) e o que sobra sem troco. */
export function resumoDosPagamentos(total: number, linhas: readonly LinhaNaTela[], opcoes: readonly OpcaoDeMeio[]) {
  let lancado = 0;
  let emDinheiro = 0;
  let financiado = 0;
  let invalidas = 0;
  for (const l of linhas) {
    const valor = centavosDoTexto(l.valor);
    if (valor === null || valor <= 0) {
      invalidas++;
      continue;
    }
    const opcao = opcoes.find((o) => o.meio === l.meio);
    lancado += valor;
    if (opcao?.aceitaTroco) emDinheiro += valor;
    if (opcao?.financeira) financiado += valor;
  }
  const excedente = Math.max(0, lancado - total);
  const troco = Math.min(excedente, emDinheiro);
  return { lancado, falta: Math.max(0, total - lancado), troco, sobraSemTroco: excedente - troco, financiado, invalidas };
}

/**
 * O valor que aparece ao acrescentar uma forma: o que falta pagar; na PayJoy e na Aiva, no máximo o valor dos celulares
 * ainda não financiado (o chip e os acessórios não entram no financiamento).
 */
export function valorSugerido(opcao: OpcaoDeMeio, total: number, valorDosCelulares: number, linhas: readonly LinhaNaTela[], opcoes: readonly OpcaoDeMeio[]): number {
  const resumo = resumoDosPagamentos(total, linhas, opcoes);
  if (!opcao.financeira) return resumo.falta;
  return Math.max(0, Math.min(resumo.falta, valorDosCelulares - resumo.financiado));
}
