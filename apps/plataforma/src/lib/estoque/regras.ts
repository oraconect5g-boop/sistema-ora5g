// Regras puras da tela de estoque (ORA-INV-001/004). O banco decide quem vê e quem confere (RLS
// e conferir_item); aqui só nomes, mensagens e a janela do dia.
export const NOMES_DOS_MOVIMENTOS: Record<string, string> = {
  entrada_importacao: "Entrada (importação)", entrada_compra: "Entrada (compra)", ajuste_conciliacao: "Ajuste de conciliação",
  ajuste: "Ajuste", perda: "Perda", venda: "Venda", devolucao: "Devolução", transferencia_saida: "Transferência (saída)",
  transferencia_entrada: "Transferência (entrada)",
};
export const NOMES_DAS_SITUACOES: Record<string, string> = {
  disponivel: "Disponível", reservado: "Reservado (numa venda)", vendido: "Vendido", em_transito: "Em trânsito",
  em_assistencia: "Na assistência", baixado: "Baixado",
};
export const nomeDe = (catalogo: Record<string, string>, codigo: string) => (Object.hasOwn(catalogo, codigo) ? catalogo[codigo] : codigo);

export const ERROS_DO_ESTOQUE = {
  nao_encontrado: "IMEI/ICCID não encontrado nesta loja (confira os dígitos ou se o item é de outra loja).",
  sem_permissao: "Seu papel não confere estoque nesta loja.",
  dados: "Digite o IMEI ou ICCID completo (só números).",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDoEstoque = keyof typeof ERROS_DO_ESTOQUE;
export function erroDoEstoque(erro: { code?: string } | null | undefined): ErroDoEstoque {
  const codigo = erro?.code;
  return codigo === "P0002" ? "nao_encontrado" : codigo === "42501" ? "sem_permissao" : "falha";
}

/** Meia-noite de hoje em São Paulo (sem horário de verão desde 2019: UTC−3), em ISO. */
export function inicioDoDiaEmSaoPaulo(agora: Date = new Date()): string {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
  return new Date(`${dia}T00:00:00-03:00`).toISOString();
}

// IMEI/ICCID: a mesma regra do catálogo e do PDV (lib/catalogo/termos.ts).
export { identificadorDigitado } from "../catalogo/termos";
