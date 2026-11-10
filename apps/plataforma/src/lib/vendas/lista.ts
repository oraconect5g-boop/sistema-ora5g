// Lista real de vendas (revisão de 10/11/2026): antes não havia como voltar a uma venda concluída
// (pedir nota, devolver, trocar, cancelar) sem o endereço do comprovante. O banco decide o que cada
// um vê (RLS: o vendedor, as próprias; a gerência, a loja); aqui só filtros, nomes e o resumo.
import { centavosDoBanco } from "../dinheiro";
import { inicioDoDiaEmSaoPaulo } from "../estoque/regras";

export const PERIODOS = { hoje: { rotulo: "Hoje", dias: 0 }, "7": { rotulo: "7 dias", dias: 6 }, "30": { rotulo: "30 dias", dias: 29 } } as const;
export type Periodo = keyof typeof PERIODOS;

/** Meia-noite (São Paulo) do primeiro dia do período, em ISO. */
export function inicioDoPeriodo(periodo: Periodo, agora: Date = new Date()): string {
  return new Date(new Date(inicioDoDiaEmSaoPaulo(agora)).getTime() - PERIODOS[periodo].dias * 86_400_000).toISOString();
}

export const FILTROS_DA_LISTA = {
  todas: { rotulo: "Todas", situacoes: null },
  concluidas: { rotulo: "Concluídas", situacoes: ["concluida"] },
  abertas: { rotulo: "Em aberto", situacoes: ["rascunho", "aguardando_aprovacao"] },
  canceladas: { rotulo: "Canceladas", situacoes: ["cancelada"] },
} as const;
export type FiltroDaLista = keyof typeof FILTROS_DA_LISTA;

export const NOMES_DA_SITUACAO: Record<string, { nome: string; tom: "sucesso" | "aviso" | "info" | "neutro" }> = {
  rascunho: { nome: "em andamento", tom: "info" },
  aguardando_aprovacao: { nome: "aguardando aprovação", tom: "aviso" },
  concluida: { nome: "concluída", tom: "sucesso" },
  cancelada: { nome: "cancelada", tom: "neutro" },
};
export const situacaoDaVenda = (codigo: string) => NOMES_DA_SITUACAO[codigo] ?? { nome: codigo, tom: "neutro" as const };

// Pedido de nota da venda, como a fila do gerente (ADR-006). Cancelado não aparece.
export const NOMES_DA_NOTA: Record<string, string> = {
  aguardando_aprovacao: "nota pedida", correcao_solicitada: "nota: corrigir dados", aprovada: "nota aprovada", emitida: "nota emitida",
};

/**
 * Resumo do período: só venda concluída conta como vendida; devolução abate do vendido; cancelada e
 * em aberto aparecem só na contagem. Centavos inteiros, sem arredondar (lib/dinheiro).
 */
export function resumoDasVendas(linhas: readonly { situacao: string; total_centavos: unknown; devolvido_centavos: unknown }[]) {
  let concluidas = 0;
  let vendido = 0;
  let devolvido = 0;
  let abertas = 0;
  let canceladas = 0;
  for (const l of linhas) {
    if (l.situacao === "concluida") {
      concluidas += 1;
      vendido += centavosDoBanco(l.total_centavos ?? 0);
      devolvido += centavosDoBanco(l.devolvido_centavos ?? 0);
    } else if (l.situacao === "cancelada") canceladas += 1;
    else abertas += 1;
  }
  return { concluidas, vendido, devolvido, liquido: vendido - devolvido, abertas, canceladas };
}
