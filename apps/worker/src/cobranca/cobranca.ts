// O link de pagamento e o Pix online (lote ADAPT-a; ORA-PAY-014 e a parte do provedor do ORA-PAY-008; ADR-020). O meio
// "link" é recusado no PDV de propósito: nada fica pago sem o provedor. Aqui fica o que o provedor vai precisar quando o
// proprietário escolher (PicPay, PagBank ou os dois; pendência E1): a interface, o formato comum do aviso de pagamento e as
// regras que decidem o que fazer com cada aviso e com cada reconsulta. Nenhum endereço, campo ou formato de provedor é
// suposto: os nomes das variáveis são os de docs/integracoes/VARIAVEIS_DE_AMBIENTE.md, e o adaptador de cada provedor só
// entra com o contrato verificado (a credencial gerada, a documentação oficial conferida e o formato do aviso confirmado).
//
// Lote PAY-b (achado F18-06 da reanálise do Codex de 18/11): o aviso do provedor, mesmo assinado, de cobrança nossa e do
// mesmo valor, NUNCA confirma sozinho. Ele só faz perguntar de novo ao provedor (a reconsulta), e é a resposta da
// reconsulta que decide, conferindo a cobrança, o valor, a moeda e a situação que já está registrada. O retorno do
// navegador (a página de "obrigado") não confirma nada. Criar a cobrança com resultado desconhecido (tempo esgotado, queda)
// nunca cria outra às cegas: consulta-se antes pelo identificador, que é o mesmo em toda tentativa.

// PAY-014a (24/11): o proprietário escolheu a Asaas (ADR-025); o adaptador dela está em pagamentos/asaas.ts, com o
// contrato da documentação oficial, e usa as regras daqui (o aviso nunca confirma; a reconsulta decide).
export const PROVEDORES_DE_COBRANCA = ["picpay", "pagbank", "asaas"] as const;
export type ProvedorDeCobranca = (typeof PROVEDORES_DE_COBRANCA)[number];

/** O adaptador oficial de cada provedor, com o contrato verificado. Nenhum está pronto. */
export const ADAPTADOR_PRONTO: Readonly<Record<ProvedorDeCobranca, boolean>> = { picpay: false, pagbank: false, asaas: true };

const VARIAVEIS: Readonly<Record<ProvedorDeCobranca, readonly string[]>> = {
  picpay: ["PICPAY_CLIENT_ID", "PICPAY_CLIENT_SECRET", "PICPAY_WEBHOOK_SECRET"],
  pagbank: ["PAGBANK_ENVIRONMENT", "PAGBANK_API_TOKEN"],
  asaas: ["ASAAS_AMBIENTE", "ASAAS_API_KEY", "ASAAS_EMAIL_DOS_AVISOS"],
};

/** O que falta para ligar o provedor, na ordem em que se resolve; vazio = pode ligar. Só nomes: valores nunca aparecem. */
export function oQueFaltaParaACobranca(provedor: ProvedorDeCobranca, ler: (nome: string) => string): string[] {
  return [
    ...["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", ...VARIAVEIS[provedor]].filter((nome) => !ler(nome)),
    ...(ADAPTADOR_PRONTO[provedor] ? [] : ["o adaptador oficial do provedor (espera a escolha do provedor, o contrato e o formato do aviso confirmado)"]),
  ];
}

/** A moeda da cobrança: só o real. */
export const MOEDA = "BRL" as const;

/** O pedido de cobrança no formato comum (centavos; o identificador é nosso, o mesmo em toda tentativa de criar). */
export type PedidoDeCobranca = { identificador: string; valor: number; moeda: typeof MOEDA; descricao: string; vencimento: string };

/** O aviso de pagamento no formato comum, depois de o adaptador conferir a assinatura do provedor. */
export type AvisoDePagamento = {
  idDoAviso: string;
  identificador: string;
  situacao: "pago" | "cancelado" | "estornado" | "outro";
  valor: number;
  moeda: string;
  assinaturaConferida: boolean;
};

/** A resposta da reconsulta ao provedor: a fonte que decide. "desconhecida" é a resposta que não veio ou não se entende. */
export type ConsultaDaCobranca = {
  identificador: string;
  situacao: "pago" | "pendente" | "cancelado" | "estornado" | "desconhecida";
  valor: number;
  moeda: string;
};

/** A cobrança como está registrada do nosso lado. */
export type CobrancaRegistrada = { identificador: string; valor: number; moeda: typeof MOEDA; situacao: "aguardando" | "paga" | "cancelada" | "estornada" };

/** O resultado de uma tentativa de criar a cobrança no provedor. */
export type ResultadoDaCriacao =
  | { tipo: "criada"; link: string; idNoProvedor: string }
  | { tipo: "recusada"; motivo: string }
  | { tipo: "desconhecido" };

/** O que cada adaptador fará quando o contrato chegar. A interface é nossa; o contrato do provedor, não. */
export interface AdaptadorDeCobranca {
  readonly provedor: ProvedorDeCobranca;
  /** Cria a cobrança com o NOSSO identificador (a mesma chave em toda tentativa, se o provedor aceitar chave de repetição). */
  criar(pedido: PedidoDeCobranca): Promise<ResultadoDaCriacao>;
  /** Pergunta de novo ao provedor (a reconsulta): a resposta vale mais que o aviso. Nula: o provedor não conhece a cobrança. */
  consultar(identificador: string): Promise<ConsultaDaCobranca | null>;
}

export type DecisaoDoAviso =
  | { acao: "ignorar"; motivo: "repetido" | "sem_assinatura" | "outra_situacao" }
  | { acao: "reconsultar"; motivo: "pagamento_informado" | "cancelamento_informado" | "estorno_informado" | "cobranca_desconhecida" | "valor_diferente" | "moeda_diferente" };

/**
 * A regra de cada aviso (ORA-PAY-008 e F18-06). O aviso nunca confirma, nem o repetido, nem o assinado de mesmo valor: o
 * que vale ser ouvido (assinado, de situação conhecida, ainda não visto) só leva à reconsulta, com o motivo. O sem
 * assinatura e o repetido são ignorados, e o banco confere de novo o que vier da reconsulta.
 */
export function decidirAviso(aviso: AvisoDePagamento, cobranca: CobrancaRegistrada | null, avisosJaVistos: ReadonlySet<string>): DecisaoDoAviso {
  if (avisosJaVistos.has(aviso.idDoAviso)) return { acao: "ignorar", motivo: "repetido" };
  if (!aviso.assinaturaConferida) return { acao: "ignorar", motivo: "sem_assinatura" };
  if (aviso.situacao === "outro") return { acao: "ignorar", motivo: "outra_situacao" };
  if (!cobranca) return { acao: "reconsultar", motivo: "cobranca_desconhecida" };
  if (aviso.moeda !== cobranca.moeda) return { acao: "reconsultar", motivo: "moeda_diferente" };
  if (aviso.valor !== cobranca.valor) return { acao: "reconsultar", motivo: "valor_diferente" };
  if (aviso.situacao === "cancelado") return { acao: "reconsultar", motivo: "cancelamento_informado" };
  if (aviso.situacao === "estornado") return { acao: "reconsultar", motivo: "estorno_informado" };
  return { acao: "reconsultar", motivo: "pagamento_informado" };
}

export type DecisaoDaConsulta =
  | { acao: "confirmar" }
  | { acao: "cancelar" }
  | { acao: "registrar_estorno" }
  | { acao: "nada"; motivo: "ja_registrado" }
  | { acao: "aguardar"; motivo: "pendente" | "resposta_desconhecida" }
  | { acao: "divergencia"; motivo: "outra_cobranca" | "desconhecida_no_provedor" | "valor_diferente" | "moeda_diferente" | "paga_depois_de_cancelada" | "cancelada_depois_de_paga" | "estorno_sem_pagamento" };

/**
 * A regra da reconsulta (F18-06): é a única que confirma. Confere a cobrança (o mesmo identificador), o valor e a moeda, e a
 * passagem da situação registrada para a do provedor, qualquer que tenha sido a ordem dos avisos. O que não fecha vira
 * divergência para a conciliação, sem mudar nada sozinho: pagamento depois de cancelado, cancelamento depois de pago,
 * estorno sem pagamento. A resposta que não veio (ou não se entende) espera e pergunta de novo depois; nunca confirma.
 */
export function decidirConsulta(consulta: ConsultaDaCobranca | null, cobranca: CobrancaRegistrada): DecisaoDaConsulta {
  if (!consulta) return { acao: "divergencia", motivo: "desconhecida_no_provedor" };
  if (consulta.identificador !== cobranca.identificador) return { acao: "divergencia", motivo: "outra_cobranca" };
  if (consulta.situacao === "desconhecida") return { acao: "aguardar", motivo: "resposta_desconhecida" };
  if (consulta.moeda !== cobranca.moeda) return { acao: "divergencia", motivo: "moeda_diferente" };
  if (consulta.valor !== cobranca.valor) return { acao: "divergencia", motivo: "valor_diferente" };
  const de = cobranca.situacao;
  switch (consulta.situacao) {
    case "pendente":
      return de === "aguardando" ? { acao: "aguardar", motivo: "pendente" } : { acao: "nada", motivo: "ja_registrado" };
    case "pago":
      if (de === "aguardando") return { acao: "confirmar" };
      if (de === "cancelada") return { acao: "divergencia", motivo: "paga_depois_de_cancelada" };
      return { acao: "nada", motivo: "ja_registrado" };
    case "cancelado":
      if (de === "aguardando") return { acao: "cancelar" };
      if (de === "paga") return { acao: "divergencia", motivo: "cancelada_depois_de_paga" };
      return { acao: "nada", motivo: "ja_registrado" };
    case "estornado":
      if (de === "paga") return { acao: "registrar_estorno" };
      if (de === "estornada") return { acao: "nada", motivo: "ja_registrado" };
      return { acao: "divergencia", motivo: "estorno_sem_pagamento" };
  }
}

export type PassoDaCriacao =
  | { passo: "criar" }
  | { passo: "consultar_antes"; motivo: "resultado_desconhecido" }
  | { passo: "pronta"; link: string; idNoProvedor: string }
  | { passo: "parar"; motivo: string };

/**
 * O próximo passo de criar a cobrança, pelas tentativas até aqui (a mais recente por último). Depois de um resultado
 * desconhecido, nunca se cria de novo às cegas: o próximo passo é consultar pelo identificador. Se o provedor já tem a
 * cobrança, é ela (a consulta entra em `aposConsultar`); se não tem, cria-se de novo com o MESMO identificador.
 */
export function proximoPassoDaCriacao(tentativas: readonly ResultadoDaCriacao[]): PassoDaCriacao {
  const ultima = tentativas.at(-1);
  if (!ultima) return { passo: "criar" };
  if (ultima.tipo === "criada") return { passo: "pronta", link: ultima.link, idNoProvedor: ultima.idNoProvedor };
  if (ultima.tipo === "recusada") return { passo: "parar", motivo: ultima.motivo };
  return { passo: "consultar_antes", motivo: "resultado_desconhecido" };
}

/** Depois da consulta que segue o resultado desconhecido: a cobrança que o provedor já tem não é criada de novo. */
export function aposConsultar(consulta: ConsultaDaCobranca | null, pedido: PedidoDeCobranca): { passo: "criar" } | { passo: "usar_a_existente" } | { passo: "parar"; motivo: string } {
  if (!consulta) return { passo: "criar" };
  if (consulta.identificador !== pedido.identificador) return { passo: "parar", motivo: "o provedor respondeu outra cobrança" };
  if (consulta.situacao === "desconhecida") return { passo: "parar", motivo: "a consulta não respondeu: tente consultar de novo depois, sem criar" };
  if (consulta.valor !== pedido.valor || consulta.moeda !== pedido.moeda) return { passo: "parar", motivo: "a cobrança do provedor tem outro valor ou outra moeda" };
  return { passo: "usar_a_existente" };
}
