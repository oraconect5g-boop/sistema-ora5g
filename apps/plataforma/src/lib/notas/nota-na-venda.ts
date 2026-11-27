// NFE55-b (a NF-e modelo 55 no fluxo interno, pedido do proprietário de 27/11/2026): na própria tela da venda, o
// cadastro rápido do cliente (nome completo + WhatsApp) e, quando a nota no nome dele pede, o CPF/CNPJ e o endereço no
// MESMO cadastro, com o pedido da nota no mesmo toque. Só as funções do banco que já existem (cliente_ficha,
// cliente_salvar, venda_vincular_cliente, notas_solicitar), que decidem tudo de novo. DESLIGADO por padrão: só com
// ORA_NOTA_NA_VENDA=1 no ambiente do site; sem ele, a tela leva à ficha do cliente, como antes.
import { ehFinalidade, type Finalidade } from "../clientes/regras";
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto } from "../leitura-do-banco";

export const notaNaVendaLigada = (valor: string | undefined = process.env.ORA_NOTA_NA_VENDA) => valor === "1";

/** O que a nota no nome do cliente recusou (o código de ERROS_DAS_NOTAS), e o que a tela pede para completar. */
const FALTAS = ["cliente_sem_documento", "cliente_sem_endereco"] as const;
export type FaltaDaNota = (typeof FALTAS)[number];
export const ehFaltaDaNota = (v: unknown): v is FaltaDaNota => typeof v === "string" && (FALTAS as readonly string[]).includes(v);
export type FaltaParaANota = { documento: boolean; endereco: boolean };

/**
 * Sem o endereço, o documento já está no cadastro (o banco confere o documento antes do endereço). Sem o documento, o
 * endereço só é pedido se o cadastro não o tiver; sem saber (null), pede, e o banco confere de novo.
 */
export function faltaParaANota(falta: FaltaDaNota, enderecoInformado: boolean | null): FaltaParaANota {
  return falta === "cliente_sem_endereco" ? { documento: false, endereco: true } : { documento: true, endereco: enderecoInformado !== true };
}

/** Se a ficha diz que o endereço está guardado (a ficha não mostra o endereço, só se ele existe); null quando não diz. */
export function enderecoInformado(ficha: unknown): boolean | null {
  return ehObjeto(ficha) && typeof ficha.endereco_informado === "boolean" ? ficha.endereco_informado : null;
}

/**
 * As finalidades da ficha mais a nota fiscal. A lista vai inteira a cada gravação (substitui a anterior), e o endereço só
 * fica guardado com uma finalidade que o pede (dados mínimos): mandar só "nota_fiscal" apagaria as outras.
 */
export function finalidadesComANota(ficha: unknown): Finalidade[] {
  if (!ehObjeto(ficha) || !Array.isArray(ficha.finalidades) || !ficha.finalidades.every(ehFinalidade)) throw new RespostaInesperada("finalidades");
  return [...new Set<Finalidade>([...ficha.finalidades, "nota_fiscal"])].sort();
}

/** O motivo que vai para a auditoria do cadastro, com o número da venda quando ele vem certo do formulário. */
export function motivoDaNota(numero: unknown): string {
  return typeof numero === "string" && /^\d{1,9}$/.test(numero)
    ? `Dados para a nota fiscal da venda nº ${numero}, pedidos no comprovante`
    : "Dados para a nota fiscal pedidos no comprovante da venda";
}
