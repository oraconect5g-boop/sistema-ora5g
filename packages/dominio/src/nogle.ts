// Regras e formatos da API NOGLE tirados da documentação oficial (https://docs.nogle.tech/,
// cópia em docs/integracoes/nogle/). Funções puras, usadas pelo worker que fala com a Nogle (ADR-005), pela
// tela da Ora Connect e pela demonstração. Nada aqui chama a rede nem guarda credencial.
// Arquivo sem importações: o worker roda com o Node direto (sem empacotador).

/** Formas de pagamento documentadas como padrão nas operações de ativação, recarga e compra. */
export const METODOS_PAGAMENTO = {
  LINK: "Link de pagamento enviado ao cliente",
  SALDO: "Desconta do saldo pré-pago da Ora na Nogle (o cliente paga na loja)",
} as const;
export type MetodoPagamentoNogle = keyof typeof METODOS_PAGAMENTO;

/** Situação do ICCID devolvida por POST /ativacao/validaIccid ("codigo"). */
export const SITUACOES_ICCID = {
  88: { nome: "Chip virgem", podeAtivar: true, orientacao: "Pode ativar." },
  11: { nome: "Chip já ativo", podeAtivar: false, orientacao: "Já tem linha: consulte a linha em vez de ativar de novo." },
  33: { nome: "Ativação em processamento", podeAtivar: false, orientacao: "Aguarde e consulte de novo. Não reenvie a ativação." },
  22: { nome: "Erro na ativação deste chip", podeAtivar: false, orientacao: "Fale com o suporte da Nogle antes de tentar de novo." },
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
  "PORTABILIDADE ENTRE MARCAS": "Migrou para outra marca da Nogle",
  "SOLICITAÇÃO DO CLIENTE": "Cancelada a pedido do cliente no SAC",
} as const;

/** Número de linha da API: 11 dígitos (DDD + número), só números. */
export const linhaValida = (texto: string) => /^[1-9]{2}9\d{8}$/.test(texto.replace(/\D/g, ""));

/** ICCID da Nogle: 19 dígitos começando com 8955 (formato da documentação de ativação). */
export const iccidNoFormatoNogle = (texto: string) => /^8955\d{15}$/.test(texto.replace(/\D/g, ""));

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

// -----------------------------------------------------------------------------
// ADR-005 — operações persistentes: montar o pedido e ler a resposta e a evidência
// -----------------------------------------------------------------------------

export const TIPOS_OPERACAO = ["ativacao", "recarga", "portabilidade"] as const;
export type TipoOperacao = (typeof TIPOS_OPERACAO)[number];
export const ehTipoOperacao = (v: unknown): v is TipoOperacao => typeof v === "string" && (TIPOS_OPERACAO as readonly string[]).includes(v);

export const NOMES_DAS_OPERACOES: Record<TipoOperacao, string> = {
  ativacao: "Ativação de chip",
  recarga: "Recarga",
  portabilidade: "Portabilidade",
};

/** Situações do banco (connect_operacoes.situacao), em palavras da loja. */
export const SITUACOES_OPERACAO = {
  registrada: { nome: "Registrada", explicacao: "Aguardando o envio à Nogle pelo servidor.", final: false },
  enviando: { nome: "Enviando", explicacao: "O servidor está falando com a Nogle.", final: false },
  aguardando_operadora: { nome: "Aceita pela Nogle", explicacao: "Pedido aceito; aguardando a confirmação (pagamento do link ou processamento).", final: false },
  resultado_desconhecido: { nome: "Resultado desconhecido", explicacao: "Sem resposta clara da Nogle. Não refaça o pedido: a gerência confere a evidência.", final: false },
  confirmada: { nome: "Confirmada", explicacao: "A Nogle confirmou. Conta na produção do vendedor.", final: true },
  recusada: { nome: "Recusada", explicacao: "A Nogle não aceitou o pedido. Corrija e registre de novo.", final: true },
  negada: { nome: "Negada", explicacao: "A operadora negou (ex.: portabilidade).", final: true },
  erro_operadora: { nome: "Erro na operadora", explicacao: "A Nogle indicou erro neste chip. Fale com o suporte da Nogle; a gerência registra o desfecho.", final: false },
  nao_recebida: { nome: "Não recebida", explicacao: "A gerência confirmou que a Nogle não recebeu. Pode registrar de novo.", final: true },
  cancelada: { nome: "Cancelada", explicacao: "Cancelada antes do envio.", final: true },
} as const;
export type SituacaoOperacao = keyof typeof SITUACOES_OPERACAO;

/** Valor da Nogle ("44.90" ou 44.9) em centavos; null se não for um valor de dinheiro válido. */
export function centavosDeValorNogle(valor: unknown): number | null {
  const texto = typeof valor === "number" ? (Number.isFinite(valor) ? String(valor) : "") : typeof valor === "string" ? valor.trim() : "";
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(texto)) return null;
  const [inteiro = "0", fracao = ""] = texto.split(".");
  return Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
}

/** Operação como o worker recebe do banco (connect_worker_reivindicar_envios). */
export type OperacaoParaEnviar = {
  operacao_id: string;
  tipo: TipoOperacao;
  metodo_pagamento: MetodoPagamentoNogle | null;
  iccid: string | null;
  esim: boolean;
  ddd: number | null;
  linha: string | null;
  linha_doadora: string | null;
  operadora_doadora_id: number | null;
  plano_id: number | null;
  /** Só na ativação: dados do cliente já validados pelo banco (campos da documentação). */
  dados: Record<string, unknown> | null;
};

export type PedidoNogle = { metodo: "GET" | "POST"; caminho: string; corpo: Record<string, unknown> };

/** Nome do sistema no campo livre "sistema_origem" (documentado na recarga e na portabilidade). */
export const SISTEMA_ORIGEM = "Ora 5G";

/**
 * Corpo do pedido só com os campos da documentação de cada rota:
 * - ativação: POST /ativacao/solicitar (eSIM: sem "iccid" e com "esim": "SIM" no chip);
 * - recarga: POST /recarga/solicitar no formato "numeros: [{numero, id_plano}]" do exemplo, que é o
 *   que a validação da API cobra ("numeros.0.numero" no exemplo de erro) — pergunta 6 à Nogle;
 * - portabilidade: POST /portabilidade/solicitar.
 */
export function montarPedido(op: OperacaoParaEnviar): PedidoNogle {
  if (op.tipo === "ativacao") {
    if (!op.dados || op.ddd === null || op.plano_id === null || !op.metodo_pagamento) throw new Error("ativação incompleta");
    const chip = op.esim ? { esim: "SIM", id_plano: op.plano_id, ddd: op.ddd } : { iccid: op.iccid, id_plano: op.plano_id, ddd: op.ddd };
    if (!op.esim && !op.iccid) throw new Error("ativação sem ICCID");
    const { nome, cpf, cnpj, email, telefone, data_nascimento, endereco } = op.dados;
    return {
      metodo: "POST",
      caminho: "/ativacao/solicitar",
      corpo: limpar({ metodo_pagamento: op.metodo_pagamento, nome, cpf, cnpj, email, telefone, data_nascimento, endereco, chips: [chip] }),
    };
  }
  if (op.tipo === "recarga") {
    if (!op.linha || op.plano_id === null || !op.metodo_pagamento) throw new Error("recarga incompleta");
    return {
      metodo: "POST",
      caminho: "/recarga/solicitar",
      corpo: { metodo_pagamento: op.metodo_pagamento, sms: "N", numeros: [{ numero: op.linha, id_plano: op.plano_id }], sistema_origem: SISTEMA_ORIGEM },
    };
  }
  if (!op.linha || !op.linha_doadora || op.operadora_doadora_id === null) throw new Error("portabilidade incompleta");
  return {
    metodo: "POST",
    caminho: "/portabilidade/solicitar",
    corpo: { numero_contel: op.linha, doador_numero: op.linha_doadora, doador_id_operadora: op.operadora_doadora_id, sistema_origem: SISTEMA_ORIGEM },
  };
}

function limpar(objeto: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

const textoOuNada = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
const objeto = (v: unknown): Record<string, unknown> | undefined => (ehObjeto(v) ? v : undefined);

/** O que o worker grava no banco depois do envio (connect_worker_registrar_envio). */
export type ResultadoEnvio = {
  resultado: "aceita" | "recusada" | "desconhecida" | "nao_enviada";
  status_http?: number;
  mensagem: string;
  id_externo?: string;
  data_cadastro?: string;
  link_pagamento?: string;
  link_esim?: string;
  iccid?: string;
  /** uuid da ativação ou recarga, para GET /consultaPagamento (resposta da Nogle de 10/11/2026). */
  uuid?: string;
  /** Só identificadores e datas da Nogle: nada de dado pessoal ou token. */
  dados?: Record<string, unknown>;
};

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * uuid devolvido na ativação ou recarga. A Nogle respondeu em 10/11/2026 que toda ativação e
 * recarga devolve um uuid, mas o campo NÃO está na coleção oficial: o nome e o lugar exatos ficam a
 * confirmar na primeira resposta real (por isso só se lê "uuid", no topo ou no objeto da operação,
 * e só no formato de uuid). Sem uuid, a consulta continua pelos caminhos documentados.
 */
export function uuidDaResposta(corpo: Record<string, unknown>, operacao: Record<string, unknown> | undefined): string | undefined {
  const candidato = textoOuNada(corpo.uuid) ?? textoOuNada(operacao?.uuid);
  return candidato && FORMATO_UUID.test(candidato) ? candidato : undefined;
}

/**
 * Lê a resposta do envio. Regra da Ora (ADR-005): só "aceita" com o identificador da Nogle; recusa
 * só com recusa explícita; qualquer coisa ambígua é "desconhecida" (não reenvia, consulta e a
 * gerência decide). 429 e 401/403 não processam o pedido: voltam para a fila.
 */
export function interpretarEnvio(tipo: TipoOperacao, statusHttp: number, corpo: unknown): ResultadoEnvio {
  const base = { status_http: statusHttp };
  if (statusHttp === 429 || statusHttp === 401 || statusHttp === 403) {
    return { ...base, resultado: "nao_enviada", mensagem: statusHttp === 429 ? "Limite de chamadas da Nogle: tenta no próximo ciclo." : "Acesso recusado pela Nogle (credencial)." };
  }
  if (statusHttp >= 500 || statusHttp < 200) return { ...base, resultado: "desconhecida", mensagem: "Nogle sem resposta válida: consultar antes de qualquer nova tentativa." };
  const normal = normalizarResposta(statusHttp, corpo);
  const c = objeto(corpo) ?? {};
  if (Object.keys(normal.errosDeCampo).length > 0 || typeof c.erro === "string") {
    return { ...base, resultado: "recusada", mensagem: normal.mensagem || "Dados recusados pela Nogle." };
  }
  if (statusHttp >= 400) return { ...base, resultado: "recusada", mensagem: normal.mensagem || `Nogle recusou o pedido (HTTP ${statusHttp}).` };
  const retorno = c.retorno;

  if (tipo === "ativacao") {
    const info = objeto(c.info);
    const id = textoOuNada(info?.id);
    if (retorno === true && id) {
      const chips = Array.isArray(info?.chips) ? info.chips : [];
      const uuid = uuidDaResposta(c, info);
      return {
        ...base, resultado: "aceita", mensagem: textoOuNada(c.mensagem) ?? "", id_externo: id,
        data_cadastro: textoOuNada(info?.data_cadastro), link_pagamento: textoOuNada(c.link_pagamento), link_esim: textoOuNada(c.link_esim),
        iccid: textoOuNada(objeto(chips[0])?.iccid), ...(uuid ? { uuid } : {}),
        dados: limpar({ id, id_cliente: textoOuNada(info?.id_cliente), data_cadastro: textoOuNada(info?.data_cadastro) }),
      };
    }
  } else if (tipo === "recarga") {
    const recarga = objeto(c.recarga);
    const id = textoOuNada(recarga?.id);
    if (retorno === true && id) {
      const uuid = uuidDaResposta(c, recarga);
      return {
        ...base, resultado: "aceita", mensagem: textoOuNada(c.mensagem) ?? "", id_externo: id,
        data_cadastro: textoOuNada(recarga?.data_cadastro), link_pagamento: textoOuNada(recarga?.link_pagamento), ...(uuid ? { uuid } : {}),
        dados: limpar({ id, data_cadastro: textoOuNada(recarga?.data_cadastro) }),
      };
    }
  } else {
    const portabilidade = objeto(c.portabilidade);
    const id = textoOuNada(portabilidade?.id);
    if (id && retorno === true) {
      return {
        ...base, resultado: "aceita", mensagem: textoOuNada(c.mensagem) ?? "", id_externo: id,
        data_cadastro: textoOuNada(portabilidade?.data_cadastro),
        dados: limpar({ id, data_cadastro: textoOuNada(portabilidade?.data_cadastro), data_agendamento: textoOuNada(portabilidade?.data_agendamento) }),
      };
    }
    // O exemplo de sucesso da documentação vem com retorno=false e o id preenchido (pergunta 7):
    // sem confirmação da Nogle, é resultado desconhecido, com o id guardado como evidência.
    if (id && retorno === false) {
      return {
        ...base, resultado: "desconhecida", mensagem: "Resposta contraditória da Nogle (recusa com id): a gerência confere.", id_externo: id,
        dados: limpar({ id, data_agendamento: textoOuNada(portabilidade?.data_agendamento) }),
      };
    }
  }
  if (retorno === false) return { ...base, resultado: "recusada", mensagem: normal.mensagem || "A Nogle recusou o pedido." };
  return { ...base, resultado: "desconhecida", mensagem: normal.mensagem ? `Resposta sem confirmação: ${normal.mensagem}` : "Resposta sem identificador da Nogle." };
}

/** Operação como o worker recebe para consultar (connect_worker_operacoes_a_consultar). */
export type OperacaoParaConsultar = {
  operacao_id: string;
  tipo: TipoOperacao;
  situacao: "aguardando_operadora" | "resultado_desconhecido";
  iccid: string | null;
  linha: string | null;
  linha_doadora: string | null;
  id_externo: string | null;
  data_cadastro_externa: string | null;
  metodo_pagamento: MetodoPagamentoNogle | null;
  /** uuid devolvido no envio (ativação e recarga), quando houver. */
  uuid_externo?: string | null;
};

/** Consulta documentada que serve de evidência para cada tipo (null: não há como consultar ainda). */
export function montarConsulta(op: OperacaoParaConsultar, opcoes: { consultaPagamento?: boolean } = {}): PedidoNogle | null {
  // Com o uuid do envio e a rota liberada para a conta (NOGLE_CONSULTA_PAGAMENTO), a consulta é da
  // operação exata: não depende da data de cadastro no histórico (pergunta 10, #59).
  if (opcoes.consultaPagamento && op.uuid_externo && (op.tipo === "ativacao" || op.tipo === "recarga")) {
    return { metodo: "GET", caminho: "/consultaPagamento", corpo: { tipo: "ATIVREC", uuid: op.uuid_externo } };
  }
  if (op.tipo === "ativacao") return op.iccid ? { metodo: "POST", caminho: "/ativacao/validaIccid", corpo: { iccid: op.iccid } } : null;
  if (op.tipo === "recarga") return op.linha ? { metodo: "GET", caminho: "/linhas/historico", corpo: { numero: op.linha } } : null;
  return op.linha && op.linha_doadora ? { metodo: "GET", caminho: "/portabilidade/status", corpo: { linha: op.linha, linha_doadora: op.linha_doadora } } : null;
}

export type Evidencia = {
  // "ambigua": a resposta não diz qual recarga é desta operação (#59): a gerência confere.
  evidencia: "confirmada" | "negada" | "em_andamento" | "erro_operadora" | "sem_evidencia" | "consulta_bloqueada" | "falha_consulta" | "ambigua";
  mensagem: string;
  numero?: string;
  valor_debitado_centavos?: number;
  dados?: Record<string, unknown>;
};

/**
 * Lê a consulta como evidência:
 * - ativação (POST /ativacao/validaIccid): 11 ativo (com a linha) confirma; 33 em processamento;
 *   88 virgem não prova nada; 22 e 99 são erro na operadora;
 * - recarga (GET /linhas/historico): confirma só a recarga com a MESMA data de cadastro devolvida no
 *   envio e com data de realização (o histórico não traz o id: pergunta 10 à Nogle). Duas recargas
 *   com a mesma data no histórico são ambíguas (#59); o banco também recusa usar a mesma recarga do
 *   histórico em duas operações;
 * - portabilidade (GET /portabilidade/status): "Sucesso" confirma; "Portabilidade negada" nega.
 */
export function interpretarConsulta(op: OperacaoParaConsultar, statusHttp: number, corpo: unknown): Evidencia {
  const normal = normalizarResposta(statusHttp, corpo);
  if (!normal.ok) return { evidencia: "falha_consulta", mensagem: normal.mensagem || `Consulta sem sucesso (HTTP ${statusHttp}).` };
  const c = objeto(corpo) ?? {};
  if (op.tipo === "ativacao") {
    const situacao = situacaoDoIccid(c.codigo);
    const linha = textoOuNada(c.linha)?.replace(/\D/g, "");
    const dados = limpar({ codigo: situacao.codigo, info: textoOuNada(c.info) });
    if (situacao.codigo === 11) {
      return linha && linhaValida(linha)
        ? { evidencia: "confirmada", mensagem: "ICCID ativo na Nogle (11).", numero: linha, dados }
        : { evidencia: "sem_evidencia", mensagem: "ICCID ativo, mas sem a linha na resposta.", dados };
    }
    if (situacao.codigo === 33) return { evidencia: "em_andamento", mensagem: "Ativação em processamento na Nogle (33).", dados };
    if (situacao.codigo === 88) return { evidencia: "sem_evidencia", mensagem: "Chip ainda virgem na Nogle (88).", dados };
    if (situacao.codigo === 22 || situacao.codigo === 99) return { evidencia: "erro_operadora", mensagem: `${situacao.nome} (${situacao.codigo}).`, dados };
    return { evidencia: "falha_consulta", mensagem: "Situação do ICCID fora do documentado.", dados };
  }
  if (op.tipo === "recarga") {
    if (!op.data_cadastro_externa) return { evidencia: "sem_evidencia", mensagem: "Sem a data de cadastro do envio: não há como achar a recarga no histórico." };
    const historico = Array.isArray(c.historico) ? c.historico : [];
    const achadas = historico.map(objeto).filter((h) => textoOuNada(h?.data_cadastro) === op.data_cadastro_externa);
    const achada = achadas[0];
    if (!achada) return { evidencia: "sem_evidencia", mensagem: "Recarga ainda não aparece no histórico da linha." };
    if (achadas.length > 1) {
      return { evidencia: "ambigua", mensagem: "Mais de uma recarga com a mesma data de cadastro no histórico: a gerência confere.",
        dados: { data_cadastro: op.data_cadastro_externa, ocorrencias: achadas.length } };
    }
    const realizada = textoOuNada(achada.data_recarga);
    const debitado = op.metodo_pagamento === "SALDO" ? centavosDeValorNogle(achada.valor_pago) : null;
    const dados = limpar({ data_cadastro: textoOuNada(achada.data_cadastro), data_recarga: realizada, plano: textoOuNada(achada.plano), forma: textoOuNada(achada.formaPagto) });
    if (!realizada) return { evidencia: "em_andamento", mensagem: "Recarga no histórico, ainda sem data de realização.", dados };
    return { evidencia: "confirmada", mensagem: "Recarga realizada (histórico da linha).", ...(debitado !== null ? { valor_debitado_centavos: debitado } : {}), dados };
  }
  const status = objeto(c.status);
  const texto = textoOuNada(status?.status) ?? textoOuNada(c.status);
  const dados = limpar({ status: texto, data_aceite: textoOuNada(status?.data_aceite), data_sucesso: textoOuNada(status?.data_sucesso), data_agendamento: textoOuNada(status?.data_agendamento) });
  if (texto === "Sucesso") return { evidencia: "confirmada", mensagem: "Portabilidade concluída (Sucesso).", dados };
  if (texto === "Portabilidade negada") return { evidencia: "negada", mensagem: "Portabilidade negada.", dados };
  if (texto === "Aguardando confirmação" || texto === "Portabilidade em andamento") return { evidencia: "em_andamento", mensagem: `${texto}.`, dados };
  return { evidencia: "falha_consulta", mensagem: "Status de portabilidade fora do documentado.", dados };
}

/**
 * GET /consultaPagamento (resposta da Nogle de 10/11/2026): {status, data_pagamento e, no eSIM,
 * links e código de instalação}. data_pagamento só vem preenchida se a ativação ou a recarga
 * deu certo: aí confirma, com o uuid como chave da evidência (uma evidência, uma operação). Sem a
 * data, ainda não aconteceu. status false ou HTTP de erro não confirmam nada.
 */
export function interpretarConsultaPagamento(op: OperacaoParaConsultar, statusHttp: number, corpo: unknown): Evidencia {
  const c = objeto(corpo);
  if (statusHttp < 200 || statusHttp >= 300 || !c) return { evidencia: "falha_consulta", mensagem: `Consulta do pagamento sem sucesso (HTTP ${statusHttp}).` };
  if (c.status !== true) return { evidencia: "sem_evidencia", mensagem: textoOuNada(c.mensagem) ?? "A Nogle não encontrou o pagamento desta operação." };
  const pago = textoOuNada(c.data_pagamento);
  if (!pago) return { evidencia: "em_andamento", mensagem: "Ativação ou recarga ainda sem pagamento confirmado na Nogle.", dados: limpar({ uuid: op.uuid_externo }) };
  return {
    evidencia: "confirmada",
    mensagem: op.tipo === "ativacao" ? "Ativação paga e feita (consulta pelo uuid)." : "Recarga paga e feita (consulta pelo uuid).",
    // QR, código e PDF do eSIM instalam a linha: não entram na evidência (que vai para os eventos).
    dados: limpar({ uuid: op.uuid_externo, data_pagamento: pago }),
  };
}

export type ItemDeReferencia = { codigo: string; nome: string; uf?: string; valor_centavos?: number; dados?: Record<string, unknown> };
export type TipoDeReferencia = "plano" | "cidade" | "ddd" | "operadora";

/** Listas oficiais (GET /planos, /cidades/UF, /ddds, /portabilidade/operadorasDisponiveis); item fora do formato fica de fora. */
export function lerReferencias(tipo: TipoDeReferencia, corpo: unknown): ItemDeReferencia[] {
  const lista = Array.isArray(objeto(corpo)?.data) ? (objeto(corpo)?.data as unknown[]) : [];
  const itens: ItemDeReferencia[] = [];
  for (const bruto of lista) {
    const i = objeto(bruto);
    if (!i) continue;
    if (tipo === "plano") {
      const codigo = textoOuNada(i.id);
      const valor = centavosDeValorNogle(i.valor);
      const nome = textoOuNada(i.nome_plano) ?? textoOuNada(i.plano);
      if (!codigo || !/^\d{1,9}$/.test(codigo) || valor === null || !nome) continue;
      itens.push({ codigo, nome, valor_centavos: valor, dados: limpar({ ligacoes: textoOuNada(i.ligacoes), sms: textoOuNada(i.sms), internet: textoOuNada(i.internet_padrao), detalhamento: textoOuNada(i.detalhamento) }) });
    } else if (tipo === "cidade") {
      const codigo = textoOuNada(i.id);
      const uf = textoOuNada(i.uf);
      const nome = textoOuNada(i.cidade);
      if (!codigo || !/^\d{1,9}$/.test(codigo) || !uf || !/^[A-Z]{2}$/.test(uf) || !nome) continue;
      itens.push({ codigo, nome, uf });
    } else if (tipo === "ddd") {
      const codigo = textoOuNada(i.ddd);
      const uf = textoOuNada(i.uf);
      if (!codigo || !/^[1-9]{2}$/.test(codigo) || !uf || !/^[A-Z]{2}$/.test(uf)) continue;
      itens.push({ codigo, nome: codigo, uf });
    } else {
      const codigo = textoOuNada(i.id);
      const nome = textoOuNada(i.descricao);
      if (!codigo || !/^\d{1,9}$/.test(codigo) || !nome) continue;
      itens.push({ codigo, nome });
    }
  }
  return itens;
}

// -----------------------------------------------------------------------------------------------------------------------
// A conciliação da produção com os relatórios oficiais (lote CONNECT-c; ORA-CONNECT-009). Só os campos dos exemplos da
// coleção oficial de 07/11: GET /relatorios/ativacoes e GET /relatorios/recargas recebem no corpo { data_de, data_ate,
// page } e devolvem { data: [{ cliente_nome, cliente_apelido, iccid, linha, data_ativacao, plano_ativacao, plano_inicio,
// plano_fim, plano_valor, tipo_linha, forma_pagto }] }. O nome e o apelido do cliente NÃO são guardados (minimização,
// LGPD): a conciliação liga a linha da Nogle à operação local pela linha, pelo ICCID, pelo dia e pelo valor. O fuso de
// data_ativacao e o tamanho da página não são documentados: fica o dia como veio, e a leitura para na página vazia.
// O extrato do saldo (GET /saldo/extrato) fica de fora: o exemplo oficial não traz os campos da resposta.
// -----------------------------------------------------------------------------------------------------------------------

export const RELATORIOS_DA_CONCILIACAO = ["ativacoes", "recargas"] as const;
export type RelatorioDaConciliacao = (typeof RELATORIOS_DA_CONCILIACAO)[number];
export const ehRelatorioDaConciliacao = (v: unknown): v is RelatorioDaConciliacao =>
  typeof v === "string" && (RELATORIOS_DA_CONCILIACAO as readonly string[]).includes(v);

/** O dia "AAAA-MM-DD" que existe no calendário; outra forma é nula. */
export function diaValido(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const data = new Date(`${t}T12:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === t ? t : null;
}

/** O pedido de uma página do relatório, só com os campos do corpo do exemplo oficial (GET com corpo, como a coleção). */
export function montarPedidoDoRelatorio(relatorio: RelatorioDaConciliacao, de: string, ate: string, pagina: number): PedidoNogle | null {
  if (!ehRelatorioDaConciliacao(relatorio) || !diaValido(de) || !diaValido(ate) || de > ate || !Number.isSafeInteger(pagina) || pagina < 1) return null;
  return { metodo: "GET", caminho: `/relatorios/${relatorio}`, corpo: { data_de: de, data_ate: ate, page: pagina } };
}

export type LinhaDoRelatorio = {
  /** A posição na leitura (1, 2, ...), somando as páginas. */
  ordem: number;
  linha: string | null;
  iccid: string | null;
  /** O dia da operação como veio (AAAA-MM-DD); o fuso não é documentado. */
  dia: string | null;
  plano: string | null;
  valor_centavos: number | null;
  tipo_linha: string | null;
  forma_pagto: string | null;
};

/** "2023-05-30 15:20:50.000" → "2023-05-30"; outra forma é nula (nada é adivinhado). */
export function diaDoRelatorio(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)?$/.exec(t);
  return m ? diaValido(m[1]) : null;
}

/**
 * Uma página do relatório oficial → as linhas que a conciliação usa, a partir da ordem `primeira`. O corpo sem a lista
 * "data" é um problema: a conciliação não começa com o relatório que não se entende, e o conteúdo não é exposto.
 */
export function lerRelatorio(corpo: unknown, primeira = 1): { linhas: LinhaDoRelatorio[]; problema: string | null } {
  const dados = objeto(corpo)?.data;
  if (!Array.isArray(dados)) return { linhas: [], problema: "o relatório não trouxe a lista \"data\"" };
  const linhas = dados.map((bruto, i): LinhaDoRelatorio => {
    const o = objeto(bruto) ?? {};
    const linha = typeof o.linha === "string" || typeof o.linha === "number" ? String(o.linha).replace(/\D/g, "") : "";
    const iccid = typeof o.iccid === "string" || typeof o.iccid === "number" ? String(o.iccid).replace(/\D/g, "") : "";
    return {
      ordem: primeira + i,
      linha: linhaValida(linha) ? linha : null,
      iccid: iccidNoFormatoNogle(iccid) ? iccid : null,
      dia: diaDoRelatorio(o.data_ativacao),
      plano: textoOuNada(o.plano_ativacao)?.slice(0, 120) ?? null,
      valor_centavos: centavosDeValorNogle(o.plano_valor),
      tipo_linha: textoOuNada(o.tipo_linha)?.slice(0, 40) ?? null,
      forma_pagto: textoOuNada(o.forma_pagto)?.slice(0, 40) ?? null,
    };
  });
  return { linhas, problema: null };
}

// -----------------------------------------------------------------------------------------------------------------------
// O estoque de chips (lote CONNECT-d; ORA-INV-011), SÓ LEITURA. Conferido na API de verdade em 24/11/2026, com o "sim, só
// consultas" do proprietário (o login com a chave de acesso sozinha funcionou: a chave é do tipo "marca", a pergunta P9),
// igual aos exemplos da coleção oficial de 07/11:
//   GET /pdv/listar                      → { pdvs: [{ id, nome, cidade, uf, estoque_minimo_chips, ... }] }
//   GET /pdv/estoque com { id } no corpo → { total, data: [{ id, iccid, data_repasse, tipo: "físico" | "eSIM" }] }
//   GET /linhas/estoque                  → { retorno, mensagem, total, data: [{ id, iccid, tipo, ... }] }
// Só o necessário passa daqui (minimização, LGPD): do PDV, nunca o CPF, o CNPJ, o contato, o endereço ou os usuários; do
// chip, nunca o código de ativação, o QR ou o PDF do eSIM, que a lista da MVNO traz e que bastam para instalar o eSIM.
// O filtro ?tipo= da Nogle só filtra com "fisico" sem acento (com acento devolve tudo, ao contrário do que ela respondeu
// em 10/11): a leitura pede o estoque inteiro e separa pelo tipo de cada chip.
// -----------------------------------------------------------------------------------------------------------------------
export type PdvDaNogle = { id: number; nome: string; cidade: string | null; uf: string | null; estoque_minimo: number | null };
export type TipoDeChip = "fisico" | "esim";
export type ChipDaNogle = { iccid: string; tipo: TipoDeChip; repassado_em: string | null };
export type ChipsLidos = { chips: ChipDaNogle[]; ignorados: number };

export const PEDIDO_DOS_PDVS: PedidoNogle = { metodo: "GET", caminho: "/pdv/listar", corpo: {} };
export const PEDIDO_DO_ESTOQUE_DA_MVNO: PedidoNogle = { metodo: "GET", caminho: "/linhas/estoque", corpo: {} };
/** O estoque de um PDV: GET com o id no corpo (confirmado pela Nogle em 10/11; o worker só manda com NOGLE_GET_COM_CORPO). */
export const pedidoDoEstoqueDoPdv = (pdv: number): PedidoNogle => ({ metodo: "GET", caminho: "/pdv/estoque", corpo: { id: pdv } });

/** "físico", "fisico", "FÍSICO" → fisico; "eSIM", "esim" → esim; o resto, null. */
export function tipoDeChip(v: unknown): TipoDeChip | null {
  const t = typeof v === "string" ? v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() : "";
  return t === "fisico" ? "fisico" : t === "esim" ? "esim" : null;
}

/**
 * GET /pdv/listar: só o id, o nome, a cidade, a UF e o estoque mínimo de cada PDV. Null quando a resposta não traz a lista
 * (a leitura então não grava nada); o PDV sem id, sem nome ou repetido fica de fora.
 */
export function lerPdvs(corpo: unknown): PdvDaNogle[] | null {
  const lista = objeto(corpo)?.pdvs;
  if (!Array.isArray(lista)) return null;
  const pdvs: PdvDaNogle[] = [];
  const vistos = new Set<number>();
  for (const bruto of lista) {
    const p = objeto(bruto);
    const id = textoOuNada(p?.id);
    const nome = textoOuNada(p?.nome)?.replace(/\s+/g, " ").slice(0, 120);
    if (!p || !id || !/^[1-9]\d{0,8}$/.test(id) || !nome || vistos.has(Number(id))) continue;
    vistos.add(Number(id));
    const uf = textoOuNada(p.uf)?.toUpperCase();
    const minimo = textoOuNada(p.estoque_minimo_chips);
    pdvs.push({
      id: Number(id),
      nome,
      cidade: textoOuNada(p.cidade)?.slice(0, 80) ?? null,
      uf: uf && /^[A-Z]{2}$/.test(uf) ? uf : null,
      estoque_minimo: minimo && /^\d{1,5}$/.test(minimo) ? Number(minimo) : null,
    });
  }
  return pdvs;
}

/** A data do repasse como a Nogle manda ("2022-03-21 22:31:23.580"), conferida; o fuso não é documentado. */
function dataDoRepasse(v: unknown): string | null {
  const t = textoOuNada(v);
  const m = t ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?$/.exec(t) : null;
  if (!t || !m) return null;
  const [a, me, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number) as [number, number, number, number, number, number];
  const data = new Date(Date.UTC(a, me - 1, d, h, mi, s));
  const confere = data.getUTCFullYear() === a && data.getUTCMonth() === me - 1 && data.getUTCDate() === d
    && data.getUTCHours() === h && data.getUTCMinutes() === mi && data.getUTCSeconds() === s;
  return confere ? t.replace("T", " ") : null;
}

/**
 * GET /pdv/estoque e GET /linhas/estoque: os chips, só o ICCID, o tipo e a data do repasse. Null quando a resposta não traz
 * a lista, diz que falhou (retorno false) ou traz um total que não bate com a lista (pode faltar página): a leitura então
 * não substitui a anterior. O chip fora da forma (ICCID que não é texto de 19 ou 20 dígitos, tipo desconhecido, repetido)
 * fica de fora e é contado.
 */
export function lerChips(corpo: unknown): ChipsLidos | null {
  const o = objeto(corpo);
  if (!o || !Array.isArray(o.data) || o.retorno === false) return null;
  if (o.total !== undefined && o.total !== null && Number(o.total) !== o.data.length) return null;
  const chips: ChipDaNogle[] = [];
  const vistos = new Set<string>();
  let ignorados = 0;
  for (const bruto of o.data) {
    const c = objeto(bruto);
    // O ICCID só como texto: como número de 19 dígitos ele já chegaria arredondado.
    const iccid = typeof c?.iccid === "string" ? c.iccid.replace(/\D/g, "") : "";
    const tipo = tipoDeChip(c?.tipo);
    if (!c || !/^89\d{17,18}$/.test(iccid) || !tipo || vistos.has(iccid)) {
      ignorados++;
      continue;
    }
    vistos.add(iccid);
    chips.push({ iccid, tipo, repassado_em: dataDoRepasse(c.data_repasse) });
  }
  return { chips, ignorados };
}

// -----------------------------------------------------------------------------------------------------------------------
// A transferência de chips pela Nogle (lote CONNECT-e; ORA-INV-011). Só o dono pede (connect_transferir_chips); o worker
// envia UMA vez e confirma pelo estoque do PDV lido antes e depois, porque a resposta só diz "Sucesso." (a primeira de
// verdade, 25/11: 1 eSIM para a Santa Cândida, HTTP 200 {"message": "Sucesso."}). Os pedidos e os exemplos de resposta são
// os da coleção oficial de 07/11; no lote, o ICCID vai sem o último dígito (o verificador), como a Nogle respondeu em 10/11.
// -----------------------------------------------------------------------------------------------------------------------
export type TipoDeTransferencia = "esim" | "unidade" | "lote";
export type TransferenciaParaEnviar = {
  transferencia_id: string; tipo: TipoDeTransferencia; pdv_id: number; iccid: string | null; iccid_final: string | null; quantidade: number;
};
export type RespostaDaTransferencia = {
  envio: "aceita" | "recusada" | "desconhecida"; mensagem: string; transferidos: number | null; nao_transferidos: number | null;
};
export type ConferenciaDaTransferencia = { confirmacao: "confirmada" | "parcial" | "nao_confirmada"; novos: string[] };

/** O pedido da transferência; null quando o pedido do banco está fora da forma (nada é enviado). */
export function pedidoDaTransferencia(t: TransferenciaParaEnviar): PedidoNogle | null {
  if (!Number.isInteger(t.pdv_id) || t.pdv_id <= 0) return null;
  const valido = (i: string | null): i is string => typeof i === "string" && /^89\d{17,18}$/.test(i);
  if (t.tipo === "esim") {
    return Number.isInteger(t.quantidade) && t.quantidade >= 1 && t.quantidade <= 500
      ? { metodo: "POST", caminho: "/pdv/transferir-chip-esim", corpo: { id: t.pdv_id, quantidade: t.quantidade } } : null;
  }
  if (t.tipo === "unidade") {
    return valido(t.iccid) ? { metodo: "POST", caminho: "/pdv/transferir-chip-fisico-unidade", corpo: { id: t.pdv_id, iccid: t.iccid } } : null;
  }
  if (t.tipo === "lote" && valido(t.iccid) && valido(t.iccid_final) && t.iccid.length === t.iccid_final.length && t.iccid <= t.iccid_final) {
    return {
      metodo: "POST", caminho: "/pdv/transferir-chip-fisico-lote",
      corpo: { id: t.pdv_id, iccid_inicial: t.iccid.slice(0, -1), iccid_final: t.iccid_final.slice(0, -1) },
    };
  }
  return null;
}

const contagemOuNada = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/**
 * A resposta do envio. HTTP 200 com a mensagem de sucesso ("Sucesso!", "Sucesso." ou "Processamento Concluído.") é aceita (no
 * lote, com as contagens de transferidos e não transferidos); 4xx é recusa da Nogle (nada foi feito); 5xx, a falta de resposta
 * ou um 200 sem a mensagem esperada é resultado desconhecido: confere-se pelo estoque, nunca se reenvia.
 */
export function lerRespostaDaTransferencia(statusHttp: number, corpo: unknown): RespostaDaTransferencia {
  const o = objeto(corpo);
  // Só a mensagem que a Nogle mandou (message, mensagem, erro ou o primeiro erro de campo); sem ela, a explicação de cada caso.
  const mensagem = (textoOuNada(o?.message) ?? textoOuNada(o?.mensagem) ?? textoOuNada(o?.erro)
    ?? (o && ehObjeto(o.errors) ? normalizarResposta(statusHttp, corpo).mensagem : undefined) ?? "").slice(0, 200);
  const transferidos = contagemOuNada(o?.transferidos);
  const nao = contagemOuNada(o?.nao_transferidos);
  if (statusHttp >= 200 && statusHttp < 300) {
    return /sucesso|processamento conclu/i.test(mensagem)
      ? { envio: "aceita", mensagem, transferidos, nao_transferidos: nao }
      : { envio: "desconhecida", mensagem: mensagem || "A Nogle respondeu sem a mensagem de sucesso.", transferidos, nao_transferidos: nao };
  }
  if (statusHttp >= 400 && statusHttp < 500) {
    return { envio: "recusada", mensagem: mensagem || `A Nogle recusou (HTTP ${statusHttp}).`, transferidos: null, nao_transferidos: null };
  }
  return { envio: "desconhecida", mensagem: mensagem || `A Nogle não respondeu com clareza (HTTP ${statusHttp}).`, transferidos: null, nao_transferidos: null };
}

/**
 * A conferência pelo estoque do PDV de destino, lido antes e depois do envio: os chips que chegaram (os do pedido, no
 * físico; qualquer eSIM novo, no eSIM). Todos: confirmada; alguns: parcial; nenhum: nao_confirmada.
 */
export function conferirTransferencia(t: TransferenciaParaEnviar, antes: readonly ChipDaNogle[], depois: readonly ChipDaNogle[]): ConferenciaDaTransferencia {
  const ja = new Set(antes.map((c) => c.iccid));
  const chegaram = depois.filter((c) => !ja.has(c.iccid));
  let novos: string[];
  if (t.tipo === "esim") {
    novos = chegaram.filter((c) => c.tipo === "esim").map((c) => c.iccid);
  } else if (t.tipo === "unidade") {
    novos = chegaram.filter((c) => c.iccid === t.iccid).map((c) => c.iccid);
  } else {
    const inicio = (t.iccid ?? "").slice(0, -1);
    const fim = (t.iccid_final ?? "").slice(0, -1);
    novos = chegaram.filter((c) => c.tipo === "fisico" && c.iccid.length === (t.iccid ?? "").length
      && c.iccid.slice(0, -1) >= inicio && c.iccid.slice(0, -1) <= fim).map((c) => c.iccid);
  }
  novos = novos.slice(0, 500);
  const confirmacao = novos.length >= t.quantidade ? "confirmada" : novos.length > 0 ? "parcial" : "nao_confirmada";
  return { confirmacao, novos };
}

// -----------------------------------------------------------------------------
// CONNECT-g — as consultas que só leem (a D-056, "só consultas"): a tela pede, o worker consulta e grava a resposta limpa
// -----------------------------------------------------------------------------

export const TIPOS_DE_CONSULTA = [
  "linha_detalhes", "linha_saldo", "linha_historico", "linha_consumo", "iccid_numero", "iccid_ativacao", "carteira_saldo",
] as const;
export type TipoDeConsulta = (typeof TIPOS_DE_CONSULTA)[number];
export const ehTipoDeConsulta = (v: unknown): v is TipoDeConsulta => typeof v === "string" && (TIPOS_DE_CONSULTA as readonly string[]).includes(v);

/** O que cada consulta pede: o número da linha, o ICCID do chip ou nada (a carteira). */
export const PARAMETRO_DA_CONSULTA: Record<TipoDeConsulta, "linha" | "iccid" | null> = {
  linha_detalhes: "linha", linha_saldo: "linha", linha_historico: "linha", linha_consumo: "linha",
  iccid_numero: "iccid", iccid_ativacao: "iccid", carteira_saldo: null,
};

export const NOMES_DAS_CONSULTAS: Record<TipoDeConsulta, string> = {
  linha_detalhes: "Situação da linha",
  linha_saldo: "Saldo da linha",
  linha_historico: "Recargas da linha",
  linha_consumo: "Consumo de internet no mês",
  iccid_numero: "Número do chip",
  iccid_ativacao: "Ativação do chip",
  carteira_saldo: "Saldo da carteira da Ora",
};

/** O mês corrente em Brasília (MM e AAAA). */
function mesEmBrasilia(agora: Date): { mes: string; ano: string } {
  const [ano = "1970", mes = "01"] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(agora).split("-");
  return { mes, ano };
}

/**
 * O pedido de cada consulta, como a coleção oficial manda (GET com o corpo). Null quando o número ou o ICCID está fora da
 * forma (o banco já recusa antes). O consumo vai com o mês corrente em Brasília: o exemplo oficial manda "mes": "01" e
 * "ano": "2022" (a tabela da documentação fala em MM/YYYY; vale o exemplo, e a resposta da Nogle diz se não for).
 */
export function pedidoDaConsulta(tipo: TipoDeConsulta, parametro: string | null, agora: Date): PedidoNogle | null {
  const p = (parametro ?? "").replace(/\D/g, "");
  const linha = linhaValida(p);
  const iccid = iccidNoFormatoNogle(p);
  switch (tipo) {
    case "linha_detalhes": return linha ? { metodo: "GET", caminho: "/linhas/detalhes", corpo: { numero: p } } : null;
    case "linha_saldo": return linha ? { metodo: "GET", caminho: "/linhas/saldo", corpo: { linha: p } } : null;
    case "linha_historico": return linha ? { metodo: "GET", caminho: "/linhas/historico", corpo: { numero: p } } : null;
    case "linha_consumo": return linha ? { metodo: "GET", caminho: "/linhas/consumo/dados", corpo: { linha: p, ...mesEmBrasilia(agora) } } : null;
    case "iccid_numero": return iccid ? { metodo: "GET", caminho: "/linhas/numeroPeloIccid", corpo: { iccid: p } } : null;
    case "iccid_ativacao": return iccid ? { metodo: "GET", caminho: "/ativacao/detalhar", corpo: { iccid: p } } : null;
    case "carteira_saldo": return { metodo: "GET", caminho: "/saldo/saldo", corpo: {} };
  }
}

export type SituacaoDaConsulta = "respondida" | "nao_encontrada" | "falhou";
export type RespostaDaConsulta = { situacao: SituacaoDaConsulta; mensagem: string; resposta?: Record<string, unknown> };

/** O documento do titular só com o fim à mostra, como na operação registrada (•••.•••.123-45). */
export function documentoMascarado(v: unknown): string | null {
  const d = (typeof v === "string" ? v : "").replace(/\D/g, "");
  if (d.length === 11) return `•••.•••.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `••.•••.•••/${d.slice(8, 12)}-${d.slice(12)}`;
  return null;
}

const simOuNao = (v: unknown) => (v === "SIM" ? true : v === "NÃO" || v === "NAO" ? false : null);
const ativaOuNao = (v: unknown) => (v === "ATIVA" ? true : v === "INATIVA" ? false : null);
const curto = (v: unknown, maximo = 120) => textoOuNada(v)?.slice(0, maximo) ?? null;
const digitosOuNada = (v: unknown) => { const d = (textoOuNada(v) ?? "").replace(/\D/g, ""); return d || null; };
/** A data da Nogle ("2023-05-30", "2022-06-15 11:59:35.000" ou "13/09/2023") como AAAA-MM-DD; o resto, nada. */
function diaOuNada(v: unknown): string | null {
  const t = textoOuNada(v) ?? "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
/** Data e hora da Nogle ("2022-06-15 11:59:35.000") como AAAA-MM-DD HH:MM; só a data, se vier só ela. */
const momentoOuNada = (v: unknown) => { const t = textoOuNada(v) ?? ""; return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(t) ? t.slice(0, 16).replace("T", " ") : diaOuNada(t); };
const numeroOuNada = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null;
const inteiroOuNada = (v: unknown) => { const n = numeroOuNada(v); return n !== null && Number.isInteger(n) && n >= 0 ? n : null; };

/** Só os campos que a tela mostra, de cada resposta documentada. Fora da forma: null (a consulta falha com o aviso). */
function camposDaConsulta(tipo: TipoDeConsulta, corpo: Record<string, unknown>): Record<string, unknown> | null {
  switch (tipo) {
    case "linha_detalhes": {
      const d = objeto(corpo.detalhes);
      if (!d) return null;
      // Fora de propósito: o PDF de instalação do eSIM (esim_pdf), os ids internos, o apelido e a cor do aplicativo.
      return {
        linha: digitosOuNada(d.linha), iccid: digitosOuNada(d.iccid), status: curto(d.status, 40), tipo_linha: curto(d.tipo_linha, 40),
        plano: curto(d.plano, 80), titular: curto(d.titular), documento: documentoMascarado(d.documento_titular),
        data_ativacao: diaOuNada(d.data_ativacao), data_fim_plano: diaOuNada(d.data_fim_plano), data_renovacao: diaOuNada(d.data_renovacao),
        data_perda_numero: diaOuNada(d.data_perda_numero_falta_recarga), data_cancelamento: diaOuNada(d.data_cancelamento_linha),
        motivo_cancelamento: curto(d.motivo_cancelamento_linha, 40), bloqueada: simOuNao(d.bloqueada), esim: simOuNao(d.esim),
        portada: simOuNao(d.portin), recarga_automatica: ativaOuNao(d.recarga_automatica),
        recarga_automatica_plano: curto(d.recarga_automatica_plano, 80), portabilidade_status: curto(d.portabilidade_status, 80),
      };
    }
    case "linha_saldo": {
      const d = objeto(corpo.data);
      const dados = numeroOuNada(d?.restante_dados);
      const minutos = inteiroOuNada(d?.restante_minutos);
      const sms = inteiroOuNada(d?.restante_sms);
      if (dados === null && minutos === null && sms === null) return null;
      return { dados_mb: dados, minutos, minutos_ilimitados: minutos !== null && minutosIlimitados(minutos), sms };
    }
    case "linha_historico": {
      if (!Array.isArray(corpo.historico)) return null;
      // Fora de propósito: "solicitado_por" (o nome ou o login de quem pediu).
      const recargas = corpo.historico.filter(ehObjeto).slice(0, 12).map((r) => ({
        quando: momentoOuNada(r.data_recarga) ?? momentoOuNada(r.data_cadastro), plano: curto(r.plano, 80),
        valor_centavos: centavosDeValorNogle(r.valor_pago ?? r.valor), forma: curto(r.formaPagto, 20),
      }));
      return { recargas };
    }
    case "linha_consumo": {
      if (!Array.isArray(corpo.data)) return null;
      const dias = corpo.data.filter(ehObjeto).slice(0, 31)
        .map((d) => ({ dia: diaOuNada(d.dtConsumo), bytes: inteiroOuNada(d.totalConsumo) }))
        .filter((d): d is { dia: string; bytes: number } => d.dia !== null && d.bytes !== null);
      return { dias, total_bytes: dias.reduce((soma, d) => soma + d.bytes, 0) };
    }
    case "iccid_numero": {
      const numero = digitosOuNada(corpo.numero);
      return numero && linhaValida(numero) ? { numero } : null;
    }
    case "iccid_ativacao": {
      const i = objeto(corpo.info);
      if (!i) return null;
      return {
        cliente: curto(i.cliente), plano: curto(i.plano_nome ?? i.plano, 80), numero_ativado: digitosOuNada(i.numero_ativado),
        numero_portado: digitosOuNada(i.numero_portado), forma_pagamento: curto(i.forma_pagamento, 20),
        data_solicitacao: momentoOuNada(i.data_solicitacao), data_ativacao: momentoOuNada(i.data_ativacao),
      };
    }
    case "carteira_saldo": {
      const saldo = centavosDeValorNogle(corpo.saldo);
      return saldo === null ? null : { saldo_centavos: saldo };
    }
  }
}

/**
 * A resposta de uma consulta. 5xx ou sem corpo: falhou (tente de novo). 401/403: falhou (o acesso). Outro 4xx ou
 * retorno=false: não encontrada, com a mensagem da Nogle (ex.: "Linha não encontrada.", "ICCID informado não existe.").
 * 200 no formato documentado: respondida, só com os campos que a tela mostra; fora da forma: falhou.
 */
export function lerRespostaDaConsulta(tipo: TipoDeConsulta, statusHttp: number, corpo: unknown): RespostaDaConsulta {
  if (statusHttp >= 500 || statusHttp === 0) return { situacao: "falhou", mensagem: "A Nogle não respondeu agora: tente de novo em instantes." };
  if (statusHttp === 401 || statusHttp === 403) return { situacao: "falhou", mensagem: `A Nogle recusou o acesso (HTTP ${statusHttp}).` };
  const n = normalizarResposta(statusHttp, corpo);
  const mensagem = n.mensagem.slice(0, 200);
  if (!n.ok) return { situacao: "nao_encontrada", mensagem: mensagem || `A Nogle não achou (HTTP ${statusHttp}).` };
  const o = objeto(corpo);
  const resposta = o ? camposDaConsulta(tipo, o) : null;
  return resposta ? { situacao: "respondida", mensagem, resposta } : { situacao: "falhou", mensagem: "A resposta da Nogle veio fora da forma documentada." };
}
