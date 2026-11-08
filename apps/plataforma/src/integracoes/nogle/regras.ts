// Regras e formatos da API NOGLE (Contel Telecom) tirados da documentação oficial (https://docs.nogle.tech/,
// cópia em docs/integracoes/nogle/). Funções puras: servem ao futuro adaptador no servidor e à demonstração.
// Nada aqui chama a rede nem guarda credencial.

/** Formas de pagamento documentadas como padrão nas operações de ativação, recarga e compra. */
export const METODOS_PAGAMENTO = {
  LINK: "Link de pagamento enviado ao cliente",
  SALDO: "Desconta do saldo pré-pago da Ora na Contel (o cliente paga na loja)",
} as const;
export type MetodoPagamentoNogle = keyof typeof METODOS_PAGAMENTO;

/** Situação do ICCID devolvida por POST /ativacao/validaIccid ("codigo"). */
export const SITUACOES_ICCID = {
  88: { nome: "Chip virgem", podeAtivar: true, orientacao: "Pode ativar." },
  11: { nome: "Chip já ativo", podeAtivar: false, orientacao: "Já tem linha: consulte a linha em vez de ativar de novo." },
  33: { nome: "Ativação em processamento", podeAtivar: false, orientacao: "Aguarde e consulte de novo. Não reenvie a ativação." },
  22: { nome: "Erro na ativação deste chip", podeAtivar: false, orientacao: "Fale com o suporte da Contel antes de tentar de novo." },
  99: { nome: "ICCID inválido", podeAtivar: false, orientacao: "Confira os 19 dígitos impressos no chip (começa com 8955)." },
} as const;
export type CodigoIccid = keyof typeof SITUACOES_ICCID;

export function situacaoDoIccid(codigo: unknown) {
  const numero = typeof codigo === "string" ? Number(codigo) : codigo;
  return typeof numero === "number" && Object.hasOwn(SITUACOES_ICCID, numero)
    ? { codigo: numero as CodigoIccid, ...SITUACOES_ICCID[numero as CodigoIccid] }
    : { codigo: null, nome: "Situação desconhecida", podeAtivar: false, orientacao: "Resposta fora do documentado: não ative e avise o suporte." };
}

/** Status de portabilidade documentados (GET /portabilidade/status e relatório). */
export const STATUS_PORTABILIDADE = ["Aguardando confirmação", "Portabilidade em andamento", "Sucesso", "Portabilidade negada"] as const;
export type StatusPortabilidade = (typeof STATUS_PORTABILIDADE)[number];

/** Motivos aceitos por POST /atendimento/bloqueio. */
export const MOTIVOS_BLOQUEIO = ["PERDA", "ROUBO", "TROCA", "BLOQUEIO DE IMEI", "INADIMPLÊNCIA"] as const;
export type MotivoBloqueio = (typeof MOTIVOS_BLOQUEIO)[number];

/** Motivos de cancelamento de linha (campo motivo_cancelamento_linha). */
export const MOTIVOS_CANCELAMENTO = {
  EX: "Expirou: 75 dias sem recarga depois do fim do plano",
  PORTOUT: "Levada para outra operadora",
  "TROCA DE CHIP": "Chip trocado (perda, roubo...): o número segue em outro chip",
  "PORTABILIDADE ENTRE MARCAS": "Migrou para outra marca da Contel",
  "SOLICITAÇÃO DO CLIENTE": "Cancelada a pedido do cliente no SAC",
} as const;

/** Número de linha da API: 11 dígitos (DDD + número), só números. */
export const linhaValida = (texto: string) => /^[1-9]{2}9\d{8}$/.test(texto.replace(/\D/g, ""));

/** ICCID da Contel: 19 dígitos começando com 8955 (formato da documentação de ativação). */
export const iccidNoFormatoContel = (texto: string) => /^8955\d{15}$/.test(texto.replace(/\D/g, ""));

/** Saldo de minutos acima de 999 significa ligações ilimitadas (GET /linhas/saldo). */
export const minutosIlimitados = (minutos: number) => minutos > 999;

export type RespostaNogle = {
  ok: boolean;
  mensagem: string;
  dados: unknown;
  errosDeCampo: Readonly<Record<string, readonly string[]>>;
};

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const textoDe = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * A documentação usa envelopes diferentes conforme a rota; esta função devolve sempre o mesmo formato.
 * - {retorno, mensagem, <dados>}  (a maioria; retorno=false é falha de negócio mesmo com HTTP 200)
 * - {status, mensagem, data}      (atendimento e pagamento)
 * - {message, errors}             (validação, às vezes com HTTP 200)
 * - {erro}                        (404)
 * - {mensagem} sozinho            (ambíguo: sucesso no apelido, erro na ativação; decide o código HTTP)
 * - lista ou objeto sem envelope  (FAQ, logística, saldo da carteira)
 */
export function normalizarResposta(statusHttp: number, corpo: unknown): RespostaNogle {
  const sucessoHttp = statusHttp >= 200 && statusHttp < 300;
  const vazio = { errosDeCampo: {} };

  if (statusHttp >= 500 || statusHttp === 0) return { ok: false, mensagem: "Operadora sem resposta. Consulte antes de tentar de novo.", dados: null, ...vazio };
  if (Array.isArray(corpo)) return { ok: sucessoHttp, mensagem: "", dados: corpo, ...vazio };
  if (!ehObjeto(corpo)) return { ok: false, mensagem: "Resposta da operadora em formato inesperado.", dados: null, ...vazio };

  if (ehObjeto(corpo.errors)) {
    const errosDeCampo = Object.fromEntries(Object.entries(corpo.errors).map(([campo, lista]) => [campo, Array.isArray(lista) ? lista.map(String) : [String(lista)]]));
    const primeiro = Object.values(errosDeCampo)[0]?.[0];
    return { ok: false, mensagem: primeiro ?? (textoDe(corpo.message) || "Dados inválidos."), dados: null, errosDeCampo };
  }
  if (typeof corpo.erro === "string") return { ok: false, mensagem: corpo.erro, dados: null, ...vazio };

  const { retorno, status, mensagem, message, ...resto } = corpo;
  const chaves = Object.keys(resto);
  const dados = chaves.length === 1 ? resto[chaves[0] as string] : chaves.length === 0 ? null : resto;
  const texto = textoDe(mensagem) || textoDe(message);

  if (typeof retorno === "boolean") return { ok: sucessoHttp && retorno, mensagem: texto, dados, ...vazio };
  if (typeof status === "boolean") return { ok: sucessoHttp && status, mensagem: texto, dados, ...vazio };
  return { ok: sucessoHttp, mensagem: texto, dados: chaves.length === 0 ? null : dados, ...vazio };
}
