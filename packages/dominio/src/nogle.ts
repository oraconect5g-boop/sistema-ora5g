// Regras e formatos da API NOGLE (Contel Telecom) tirados da documentação oficial (https://docs.nogle.tech/,
// cópia em docs/integracoes/nogle/). Funções puras, usadas pelo worker que fala com a Contel (ADR-005), pela
// tela da Ora Connect e pela demonstração. Nada aqui chama a rede nem guarda credencial.
// Arquivo sem importações: o worker roda com o Node direto (sem empacotador).

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
  registrada: { nome: "Registrada", explicacao: "Aguardando o envio à Contel pelo servidor.", final: false },
  enviando: { nome: "Enviando", explicacao: "O servidor está falando com a Contel.", final: false },
  aguardando_operadora: { nome: "Aceita pela Contel", explicacao: "Pedido aceito; aguardando a confirmação (pagamento do link ou processamento).", final: false },
  resultado_desconhecido: { nome: "Resultado desconhecido", explicacao: "Sem resposta clara da Contel. Não refaça o pedido: a gerência confere a evidência.", final: false },
  confirmada: { nome: "Confirmada", explicacao: "A Contel confirmou. Conta na produção do vendedor.", final: true },
  recusada: { nome: "Recusada", explicacao: "A Contel não aceitou o pedido. Corrija e registre de novo.", final: true },
  negada: { nome: "Negada", explicacao: "A operadora negou (ex.: portabilidade).", final: true },
  erro_operadora: { nome: "Erro na operadora", explicacao: "A Contel indicou erro neste chip. Fale com o suporte da Contel; a gerência registra o desfecho.", final: false },
  nao_recebida: { nome: "Não recebida", explicacao: "A gerência confirmou que a Contel não recebeu. Pode registrar de novo.", final: true },
  cancelada: { nome: "Cancelada", explicacao: "Cancelada antes do envio.", final: true },
} as const;
export type SituacaoOperacao = keyof typeof SITUACOES_OPERACAO;

/** Valor da Contel ("44.90" ou 44.9) em centavos; null se não for um valor de dinheiro válido. */
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
 *   que a validação da API cobra ("numeros.0.numero" no exemplo de erro) — pergunta 6 à Contel;
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
  /** Só identificadores e datas da Contel: nada de dado pessoal ou token. */
  dados?: Record<string, unknown>;
};

/**
 * Lê a resposta do envio. Regra da Ora (ADR-005): só "aceita" com o identificador da Contel; recusa
 * só com recusa explícita; qualquer coisa ambígua é "desconhecida" (não reenvia, consulta e a
 * gerência decide). 429 e 401/403 não processam o pedido: voltam para a fila.
 */
export function interpretarEnvio(tipo: TipoOperacao, statusHttp: number, corpo: unknown): ResultadoEnvio {
  const base = { status_http: statusHttp };
  if (statusHttp === 429 || statusHttp === 401 || statusHttp === 403) {
    return { ...base, resultado: "nao_enviada", mensagem: statusHttp === 429 ? "Limite de chamadas da Contel: tenta no próximo ciclo." : "Acesso recusado pela Contel (credencial)." };
  }
  if (statusHttp >= 500 || statusHttp < 200) return { ...base, resultado: "desconhecida", mensagem: "Contel sem resposta válida: consultar antes de qualquer nova tentativa." };
  const normal = normalizarResposta(statusHttp, corpo);
  const c = objeto(corpo) ?? {};
  if (Object.keys(normal.errosDeCampo).length > 0 || typeof c.erro === "string") {
    return { ...base, resultado: "recusada", mensagem: normal.mensagem || "Dados recusados pela Contel." };
  }
  if (statusHttp >= 400) return { ...base, resultado: "recusada", mensagem: normal.mensagem || `Contel recusou o pedido (HTTP ${statusHttp}).` };
  const retorno = c.retorno;

  if (tipo === "ativacao") {
    const info = objeto(c.info);
    const id = textoOuNada(info?.id);
    if (retorno === true && id) {
      const chips = Array.isArray(info?.chips) ? info.chips : [];
      return {
        ...base, resultado: "aceita", mensagem: textoOuNada(c.mensagem) ?? "", id_externo: id,
        data_cadastro: textoOuNada(info?.data_cadastro), link_pagamento: textoOuNada(c.link_pagamento), link_esim: textoOuNada(c.link_esim),
        iccid: textoOuNada(objeto(chips[0])?.iccid),
        dados: limpar({ id, id_cliente: textoOuNada(info?.id_cliente), data_cadastro: textoOuNada(info?.data_cadastro) }),
      };
    }
  } else if (tipo === "recarga") {
    const recarga = objeto(c.recarga);
    const id = textoOuNada(recarga?.id);
    if (retorno === true && id) {
      return {
        ...base, resultado: "aceita", mensagem: textoOuNada(c.mensagem) ?? "", id_externo: id,
        data_cadastro: textoOuNada(recarga?.data_cadastro), link_pagamento: textoOuNada(recarga?.link_pagamento),
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
    // sem confirmação da Contel, é resultado desconhecido, com o id guardado como evidência.
    if (id && retorno === false) {
      return {
        ...base, resultado: "desconhecida", mensagem: "Resposta contraditória da Contel (recusa com id): a gerência confere.", id_externo: id,
        dados: limpar({ id, data_agendamento: textoOuNada(portabilidade?.data_agendamento) }),
      };
    }
  }
  if (retorno === false) return { ...base, resultado: "recusada", mensagem: normal.mensagem || "A Contel recusou o pedido." };
  return { ...base, resultado: "desconhecida", mensagem: normal.mensagem ? `Resposta sem confirmação: ${normal.mensagem}` : "Resposta sem identificador da Contel." };
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
};

/** Consulta documentada que serve de evidência para cada tipo (null: não há como consultar ainda). */
export function montarConsulta(op: OperacaoParaConsultar): PedidoNogle | null {
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
 *   envio e com data de realização (o histórico não traz o id: pergunta 10 à Contel). Duas recargas
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
        ? { evidencia: "confirmada", mensagem: "ICCID ativo na Contel (11).", numero: linha, dados }
        : { evidencia: "sem_evidencia", mensagem: "ICCID ativo, mas sem a linha na resposta.", dados };
    }
    if (situacao.codigo === 33) return { evidencia: "em_andamento", mensagem: "Ativação em processamento na Contel (33).", dados };
    if (situacao.codigo === 88) return { evidencia: "sem_evidencia", mensagem: "Chip ainda virgem na Contel (88).", dados };
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
