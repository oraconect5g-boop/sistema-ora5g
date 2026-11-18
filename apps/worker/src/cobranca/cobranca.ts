// O link de pagamento e o Pix online (lote ADAPT-a; ORA-PAY-014 e a parte do provedor do ORA-PAY-008; ADR-020). O meio
// "link" é recusado no PDV de propósito: nada fica pago sem o provedor. Aqui fica o que o provedor vai precisar quando o
// proprietário escolher (PicPay, PagBank ou os dois; pendência E1): a interface, o formato comum do aviso de pagamento e a
// regra que decide o que fazer com cada aviso. Nenhum endereço, campo ou formato de provedor é suposto: os nomes das
// variáveis são os de docs/integracoes/VARIAVEIS_DE_AMBIENTE.md, e o adaptador de cada provedor só entra com o contrato
// verificado (a credencial gerada, a documentação oficial conferida e o formato do aviso confirmado).

export const PROVEDORES_DE_COBRANCA = ["picpay", "pagbank"] as const;
export type ProvedorDeCobranca = (typeof PROVEDORES_DE_COBRANCA)[number];

/** O adaptador oficial de cada provedor, com o contrato verificado. Nenhum está pronto. */
export const ADAPTADOR_PRONTO: Readonly<Record<ProvedorDeCobranca, boolean>> = { picpay: false, pagbank: false };

const VARIAVEIS: Readonly<Record<ProvedorDeCobranca, readonly string[]>> = {
  picpay: ["PICPAY_CLIENT_ID", "PICPAY_CLIENT_SECRET", "PICPAY_WEBHOOK_SECRET"],
  pagbank: ["PAGBANK_ENVIRONMENT", "PAGBANK_API_TOKEN"],
};

/** O que falta para ligar o provedor, na ordem em que se resolve; vazio = pode ligar. Só nomes: valores nunca aparecem. */
export function oQueFaltaParaACobranca(provedor: ProvedorDeCobranca, ler: (nome: string) => string): string[] {
  return [
    ...["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", ...VARIAVEIS[provedor]].filter((nome) => !ler(nome)),
    ...(ADAPTADOR_PRONTO[provedor] ? [] : ["o adaptador oficial do provedor (espera a escolha do provedor, o contrato e o formato do aviso confirmado)"]),
  ];
}

/** O pedido de cobrança no formato comum (centavos; o identificador é nosso, para a mesma cobrança não sair duas vezes). */
export type PedidoDeCobranca = { identificador: string; valor: number; descricao: string; vencimento: string };
/** O aviso de pagamento no formato comum, depois de o adaptador conferir a assinatura do provedor. */
export type AvisoDePagamento = { idDoAviso: string; identificador: string; situacao: "pago" | "cancelado" | "outro"; valor: number; assinaturaConferida: boolean };

/** O que cada adaptador fará quando o contrato chegar. A interface é nossa; o contrato do provedor, não. */
export interface AdaptadorDeCobranca {
  readonly provedor: ProvedorDeCobranca;
  criar(pedido: PedidoDeCobranca): Promise<{ link: string; idNoProvedor: string }>;
  /** Pergunta de novo ao provedor (a reconsulta): a resposta vale mais que o aviso. */
  consultar(identificador: string): Promise<AvisoDePagamento>;
}

export type DecisaoDoAviso =
  | { acao: "confirmar" }
  | { acao: "ignorar"; motivo: "repetido" | "sem_assinatura" | "outra_situacao" }
  | { acao: "reconsultar"; motivo: "valor_diferente" | "cobranca_desconhecida" | "cancelado" };

/**
 * A regra de cada aviso (ORA-PAY-008: o mesmo aviso, repetido, nunca confirma duas vezes). Só confirma o aviso com a
 * assinatura conferida, de uma cobrança nossa, do mesmo valor e ainda não visto. Valor diferente, cobrança desconhecida ou
 * cancelamento: pergunta de novo ao provedor antes de mudar qualquer coisa. O banco confere de novo.
 */
export function decidirAviso(aviso: AvisoDePagamento, cobranca: { valor: number } | null, avisosJaVistos: ReadonlySet<string>): DecisaoDoAviso {
  if (avisosJaVistos.has(aviso.idDoAviso)) return { acao: "ignorar", motivo: "repetido" };
  if (!aviso.assinaturaConferida) return { acao: "ignorar", motivo: "sem_assinatura" };
  if (!cobranca) return { acao: "reconsultar", motivo: "cobranca_desconhecida" };
  if (aviso.situacao === "cancelado") return { acao: "reconsultar", motivo: "cancelado" };
  if (aviso.situacao !== "pago") return { acao: "ignorar", motivo: "outra_situacao" };
  if (aviso.valor !== cobranca.valor) return { acao: "reconsultar", motivo: "valor_diferente" };
  return { acao: "confirmar" };
}
