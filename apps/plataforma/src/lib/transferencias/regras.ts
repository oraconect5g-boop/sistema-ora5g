// Regras puras das telas de transferência (ADR-007, #60). O banco decide tudo de novo; aqui só se
// lê o formulário e se escolhe a mensagem (só por código de catálogo: o endereço não injeta texto).

export const SITUACOES_DA_TRANSFERENCIA = {
  solicitada: "Pedida",
  separada: "Separada na origem",
  enviada: "Em trânsito",
  recebida: "Recebida",
  recebida_com_divergencia: "Recebida com divergência",
  recusada: "Recusada",
  cancelada: "Cancelada",
} as const;
export type SituacaoDaTransferencia = keyof typeof SITUACOES_DA_TRANSFERENCIA;
export const nomeDaSituacao = (s: string) =>
  Object.hasOwn(SITUACOES_DA_TRANSFERENCIA, s) ? SITUACOES_DA_TRANSFERENCIA[s as SituacaoDaTransferencia] : s;

export const ERROS_DA_TRANSFERENCIA = {
  sem_permissao: "Seu papel não faz este passo nesta loja (separar e enviar: origem; receber: destino; sair de DEFEITOS: só quem ajusta estoque).",
  nao_encontrada: "Transferência não encontrada nesta loja.",
  sem_saldo: "Não há disponível suficiente na origem.",
  indisponivel: "Esse IMEI/ICCID não está disponível (reservado, vendido ou em trânsito).",
  outra_loja: "Esse IMEI/ICCID não é deste produto nesta loja.",
  repetida: "Este passo já foi feito de outro jeito. Recarregue a tela.",
  dados: "Confira os dados: quantidade, IMEI/ICCID (um por linha) e a explicação quando faltar item.",
  motivo: "Informe o motivo (fica na auditoria).",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDaTransferencia = keyof typeof ERROS_DA_TRANSFERENCIA;
const DO_BANCO: Record<string, ErroDaTransferencia> = {
  "42501": "sem_permissao", P0002: "nao_encontrada", OR001: "sem_saldo", OR002: "indisponivel", OR003: "outra_loja", OR004: "repetida", "22023": "dados",
};
export function erroDaTransferencia(erro: { code?: string } | null | undefined): ErroDaTransferencia {
  const codigo = erro?.code;
  return codigo && Object.hasOwn(DO_BANCO, codigo) ? (DO_BANCO[codigo] as ErroDaTransferencia) : "falha";
}

/** IMEI/ICCID lidos na conferência: um por linha (ou separados por vírgula/espaço), só dígitos, sem repetir. */
export function lerIdentificadores(texto: unknown): string[] | null {
  if (typeof texto !== "string") return [];
  const partes = texto.split(/[\s,;]+/).map((p) => p.replace(/\D/g, "")).filter(Boolean);
  if (partes.some((p) => !/^\d{14,20}$/.test(p))) return null;
  return [...new Set(partes)].slice(0, 100);
}

/** Quantidade inteira de 1 a 9999 (0 só onde a tela permite, na contagem do recebimento). */
export function lerQuantidade(texto: unknown, minimo = 1): number | null {
  if (typeof texto !== "string" || !/^\d{1,4}$/.test(texto.trim())) return null;
  const n = Number(texto.trim());
  return n >= minimo && n <= 9999 ? n : null;
}
