// Lote CONNECT-m (25/11/2026): as regras puras das listas de operações da Ora Connect (as abas da demonstração): os filtros
// por situação, o tom de cada situação e a hora em Brasília. A situação vem do banco; a tela só agrupa.
import type { SituacaoOperacao } from "@ora5g/dominio/nogle";

import type { Tom } from "../../componentes/ui";

export const TOM_DA_SITUACAO: Record<SituacaoOperacao, Tom> = {
  registrada: "info", enviando: "info", aguardando_operadora: "aviso", resultado_desconhecido: "perigo", confirmada: "sucesso",
  recusada: "neutro", negada: "neutro", erro_operadora: "perigo", nao_recebida: "neutro", cancelada: "neutro",
};

export const FILTROS_DA_LISTA = {
  todas: { rotulo: "Todas", situacoes: null },
  aguardando: { rotulo: "Aguardando", situacoes: ["registrada", "enviando", "aguardando_operadora", "resultado_desconhecido"] },
  confirmadas: { rotulo: "Confirmadas", situacoes: ["confirmada"] },
  falharam: { rotulo: "Falharam", situacoes: ["recusada", "negada", "erro_operadora", "nao_recebida"] },
} as const satisfies Record<string, { rotulo: string; situacoes: readonly SituacaoOperacao[] | null }>;
export type FiltroDaLista = keyof typeof FILTROS_DA_LISTA;

export const filtroDaLista = (v: string | null | undefined): FiltroDaLista => (v && Object.hasOwn(FILTROS_DA_LISTA, v) ? (v as FiltroDaLista) : "todas");
/** A operação entra no filtro? (Todas: sim; as outras, pela situação.) */
export const naLista = (filtro: FiltroDaLista, situacao: string) => {
  const situacoes: readonly string[] | null = FILTROS_DA_LISTA[filtro].situacoes;
  return situacoes === null || situacoes.includes(situacao);
};

export const quando = (data: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(data));
/** Só a hora (o dia é o de hoje, na aba Operações do dia), em Brasília. */
export const hora = (data: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(data));
const dataEmBrasilia = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(d);
/** A hora, se a operação é do mesmo dia (em Brasília) de `agora`; se não, o dia e o mês (as abertas de antes ficam na lista). */
export const horaOuDia = (data: string, agora: Date) => {
  const d = new Date(data);
  const dia = dataEmBrasilia(d);
  return dia === dataEmBrasilia(agora) ? hora(data) : dia.slice(0, 5);
};
/** As que ainda não terminaram (esperam a Nogle ou a decisão da gerência): seguem na aba Operações do dia, de qualquer dia. */
export const ABERTAS = ["registrada", "enviando", "aguardando_operadora", "resultado_desconhecido", "erro_operadora"] as const satisfies readonly SituacaoOperacao[];
