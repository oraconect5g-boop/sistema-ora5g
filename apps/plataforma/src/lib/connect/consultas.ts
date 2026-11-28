// As consultas da Nogle que só leem (lote CONNECT-g; ORA-CONNECT-007): ler o formulário, escolher a mensagem e escrever cada
// resposta em português simples. Regras puras: o banco confere tudo de novo, e a tela nunca fala com a Nogle (o worker do
// servidor consulta e grava a resposta já limpa).
import { cnpjValido, cpfValido } from "@ora5g/dominio";
import {
  iccidNoFormatoNogle, linhaValida, MOTIVOS_CANCELAMENTO, NOMES_DAS_CONSULTAS, PARAMETRO_DA_CONSULTA, TIPOS_DE_SOLICITACAO, ehConsultaComposta,
  ehTipoDeConsulta, type ParametroDaConsulta, type TipoDeConsulta,
} from "@ora5g/dominio/nogle";

import { brl, numero } from "../formato";

export { NOMES_DAS_CONSULTAS };

/**
 * As consultas da loja (quem opera a Ora Connect), na ordem do formulário: primeiro o relatório completo do número (CONNECT-h),
 * depois cada consulta do número, as do chip e o relatório do cliente. A carteira é do dono, num cartão à parte.
 */
export const CONSULTAS_DA_LOJA = [
  "linha_completa", "linha_detalhes", "linha_saldo", "linha_historico", "linha_cobrancas", "linha_consumo", "linha_consumo_voz", "linha_consumo_sms",
  "linha_existe", "iccid_situacao", "iccid_numero", "iccid_ativacao", "iccid_plano_pago", "cliente_completo",
  // CONNECT-i: as da loja que levam um número só (o CNPJ, o CEP e o pedido de compra).
  "validar_cnpj", "validar_cep", "compra_rastreio",
] as const satisfies readonly TipoDeConsulta[];
/** CONNECT-i: as informações da Nogle que não levam número (quem opera a loja), cada uma num botão. */
export const INFORMACOES_DA_NOGLE = ["faq_categorias", "planos_campanhas", "estados"] as const satisfies readonly TipoDeConsulta[];
/** As que abrem numa página própria (dá para imprimir): os relatórios, as respostas das dúvidas e as listas da rede. */
export const COM_PAGINA_PROPRIA: readonly TipoDeConsulta[] = ["faq_perguntas", "carteira_programadas", "relatorio_portabilidades", "lista_de_linhas", "lista_de_clientes",
  "carteira_extrato_saidas", "carteira_extrato_entradas"];
export { TIPOS_DE_SOLICITACAO };
export const abreEmPaginaPropria = (tipo: string) => ehTipoDeConsulta(tipo) && (ehConsultaComposta(tipo) || COM_PAGINA_PROPRIA.includes(tipo));
/** Os dias que a carteira (os próximos) e as portabilidades (os últimos) oferecem. */
export const DIAS_DAS_PROGRAMADAS = [7, 30, 60, 90] as const;
export const DIAS_DAS_PORTABILIDADES = [7, 30, 90, 366] as const;
/** Do que cada consulta precisa, para o formulário dizer. */
export const PEDE_O_QUE: Record<ParametroDaConsulta, string> = {
  linha: "pelo número", iccid: "pelo ICCID", documento: "pelo CPF ou CNPJ", cpf: "pelo CPF", cnpj: "pelo CNPJ", cep: "pelo CEP", categoria: "pela categoria",
  pedido: "pelo nº do pedido", linha_e_documento: "pelo número e o CPF/CNPJ", dias_a_frente: "pelos próximos dias", dias_para_tras: "pelos últimos dias",
  pagina: "pela página", solicitacao: "pelo tipo e o nº da solicitação",
};

export type ConsultaDaTela = {
  id: string;
  tipo: string;
  parametro: string | null;
  situacao: string;
  resposta: Record<string, unknown> | null;
  mensagem: string | null;
  pedida_em: string;
  respondida_em: string | null;
  resposta_apagada_em: string | null;
  /** O CPF ou o CNPJ do relatório do cliente, mascarado (o inteiro sai em 24 horas). */
  parametro_mascarado?: string | null;
};

export const SITUACOES_DA_CONSULTA: Record<string, { rotulo: string; tom: "info" | "sucesso" | "aviso" | "perigo" | "neutro" }> = {
  na_fila: { rotulo: "Na fila", tom: "info" },
  consultando: { rotulo: "Consultando", tom: "info" },
  respondida: { rotulo: "Respondida", tom: "sucesso" },
  nao_encontrada: { rotulo: "Não encontrada", tom: "aviso" },
  falhou: { rotulo: "Falhou", tom: "perigo" },
};
export const esperandoResposta = (c: Pick<ConsultaDaTela, "situacao">) => c.situacao === "na_fila" || c.situacao === "consultando";

export const ERROS_DA_CONSULTA = {
  tipo: "Escolha o que consultar.",
  linha: "Para essa consulta, digite o número da linha com DDD: 11 dígitos (ex.: 41 99999-9999).",
  iccid: "Para essa consulta, digite o ICCID impresso no chip: 19 dígitos, começando com 8955.",
  documento: "Para o relatório do cliente, digite o CPF (11 dígitos) ou o CNPJ (14 dígitos) dele.",
  cpf: "Digite um CPF válido (11 dígitos).",
  cnpj: "Para conferir o CNPJ, digite um CNPJ válido (14 dígitos).",
  cep: "Para conferir o CEP, digite os 8 dígitos dele.",
  pedido: "Para o rastreio, digite o número do pedido de compra (só dígitos).",
  categoria: "Escolha a categoria das dúvidas frequentes.",
  titular: "Digite a linha com DDD (11 dígitos) e o CPF ou o CNPJ válido de quem diz ser o titular.",
  dias: "Escolha quantos dias.",
  pagina: "A página: de 1 a 9999.",
  solicitacao: "Escolha o tipo (ativação, recarga ou compra) e digite o número da solicitação na Nogle (só dígitos).",
  dados: "Confira o número digitado.",
  limite: "Muitas consultas na última hora: espere um pouco antes de consultar de novo.",
  sem_permissao: "Você não tem permissão para essa consulta.",
  falha: "Não foi possível pedir a consulta agora. Tente de novo em instantes.",
} as const;
export type ErroDaConsulta = keyof typeof ERROS_DA_CONSULTA;
export const ehErroDaConsulta = (v: unknown): v is ErroDaConsulta => typeof v === "string" && Object.hasOwn(ERROS_DA_CONSULTA, v);

/** O erro do banco (connect_consultar): OR056 = o limite por hora; 42501 = sem permissão; 22023 = os dados. */
export function erroDaConsulta(erro: { code?: string } | null | undefined): ErroDaConsulta {
  const codigo = erro?.code;
  if (codigo === "OR056") return "limite";
  if (codigo === "42501") return "sem_permissao";
  if (codigo === "22023") return "dados";
  return "falha";
}

type Formulario = { get: (nome: string) => unknown };
const texto = (dados: Formulario, nome: string, maximo: number) => {
  const v = dados.get(nome);
  return typeof v === "string" ? v.trim().slice(0, maximo) : "";
};

export type PedidoDeConsulta = { tipo: TipoDeConsulta; parametro: string | null; chave: string };

/** O formulário: o tipo da lista, o número ou o ICCID na forma que a consulta pede e a chave do clique. */
export function lerPedidoDeConsulta(dados: Formulario): { ok: true; pedido: PedidoDeConsulta } | { ok: false; erro: ErroDaConsulta } {
  const tipo = texto(dados, "tipo", 40);
  const chave = texto(dados, "chave", 120);
  // AUD-f: o cadastro do cliente para preencher não é pedido por este formulário (só pela busca da tela, que lê a resposta).
  if (!ehTipoDeConsulta(tipo) || tipo === "cliente_cadastro") return { ok: false, erro: "tipo" };
  if (!chave) return { ok: false, erro: "falha" };
  const digitos = texto(dados, "parametro", 40).replace(/\D/g, "");
  const pede = PARAMETRO_DA_CONSULTA[tipo];
  const documentoValido = (d: string) => (d.length === 11 ? cpfValido(d) : d.length === 14 && cnpjValido(d));
  const entre = (minimo: number, maximo: number) => /^\d{1,4}$/.test(digitos) && Number(digitos) >= minimo && Number(digitos) <= maximo;
  if (pede === "linha" && !linhaValida(digitos)) return { ok: false, erro: "linha" };
  if (pede === "iccid" && !iccidNoFormatoNogle(digitos)) return { ok: false, erro: "iccid" };
  if (pede === "documento" && !documentoValido(digitos)) return { ok: false, erro: "documento" };
  // CONNECT-i: os parâmetros novos.
  if (pede === "cpf" && !(digitos.length === 11 && cpfValido(digitos))) return { ok: false, erro: "cpf" };
  if (pede === "cnpj" && !(digitos.length === 14 && cnpjValido(digitos))) return { ok: false, erro: "cnpj" };
  if (pede === "cep" && !/^\d{8}$/.test(digitos)) return { ok: false, erro: "cep" };
  if (pede === "pedido" && !/^\d{1,12}$/.test(digitos)) return { ok: false, erro: "pedido" };
  if (pede === "categoria" && !/^\d{1,9}$/.test(digitos)) return { ok: false, erro: "categoria" };
  if (pede === "dias_a_frente" && !entre(1, 90)) return { ok: false, erro: "dias" };
  if (pede === "dias_para_tras" && !entre(1, 366)) return { ok: false, erro: "dias" };
  if (pede === "pagina" && !entre(1, 9999)) return { ok: false, erro: "pagina" };
  if (pede === "solicitacao") {
    // O pagamento: o tipo da solicitação (1 = ativação, 2 = recarga, 3 = compra) na frente do número dela.
    const solicitacao = texto(dados, "solicitacao", 1);
    if (!/^[123]$/.test(solicitacao) || !/^\d{1,12}$/.test(digitos)) return { ok: false, erro: "solicitacao" };
    return { ok: true, pedido: { tipo, parametro: `${solicitacao}${digitos}`, chave } };
  }
  if (pede === "linha_e_documento") {
    // A titularidade: a linha no campo do número e o CPF/CNPJ no campo do documento, gravados juntos.
    const documento = texto(dados, "documento", 40).replace(/\D/g, "");
    if (!linhaValida(digitos) || !documentoValido(documento)) return { ok: false, erro: "titular" };
    return { ok: true, pedido: { tipo, parametro: `${digitos}${documento}`, chave } };
  }
  return { ok: true, pedido: { tipo, parametro: pede ? digitos : null, chave } };
}

// -----------------------------------------------------------------------------
// A resposta, em português simples
// -----------------------------------------------------------------------------
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
/** O número da linha como se escreve: (41) 99999-9999. */
export const linhaFormatada = (v: unknown) => {
  const d = typeof v === "string" ? v.replace(/\D/g, "") : "";
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d;
};
const dia = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split("-").reverse().join("/") : null);
const momento = (v: unknown) => {
  if (typeof v !== "string") return null;
  const d = dia(v);
  return d && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v) ? `${d} às ${v.slice(11, 16)}` : d;
};
/** CONNECT-o: o dia e o momento como a Nogle manda ("AAAA-MM-DD" e "AAAA-MM-DD HH:MM"), em dd/mm/aaaa, para a aba Carteira. */
export { dia as diaDaNogle, momento as momentoDaNogle };
/** Megabytes como a Nogle informa o saldo; de 1.024 MB para cima, em GB. */
export const megabytes = (mb: number) => (mb >= 1024 ? `${decimal.format(mb / 1024)} GB` : `${decimal.format(mb)} MB`);
/** Bytes como a Nogle informa o consumo, em MB ou GB. */
export const bytes = (b: number) => megabytes(b / (1024 * 1024));
const textoOuNada = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const numeroOuNada = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const cep = (v: unknown) => { const d = typeof v === "string" ? v.replace(/\D/g, "") : ""; return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
const quantos = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;
/** O aviso de que a lista da Nogle não coube inteira na resposta guardada. */
const naoCouberam = (r: Record<string, unknown>) => (typeof r.fora === "number" && r.fora > 0 ? [`E mais ${numero(r.fora)} que não couberam aqui (a Nogle tem a lista inteira).`] : []);
const ABRA = "Abra a página para ver tudo.";

/**
 * As linhas de texto de uma resposta (cada tipo do seu jeito). Sem resposta guardada: o aviso de que foi apagada. As listas
 * (CONNECT-i) mostram na lista só o resumo; `completo` traz cada item (a página do relatório).
 */
export function linhasDaResposta(c: Pick<ConsultaDaTela, "tipo" | "resposta" | "resposta_apagada_em" | "situacao">,
  nomeDoPlano?: (codigo: string) => string | undefined, opcoes: { completo?: boolean } = {}): string[] {
  if (c.situacao !== "respondida") return [];
  const r = c.resposta;
  if (!r) return c.resposta_apagada_em ? ["A resposta foi apagada depois de 24 horas (ela pode ter o nome do titular)."] : [];
  switch (c.tipo) {
    case "linha_detalhes": {
      const linhas = [
        [`Linha ${linhaFormatada(r.linha)}`, textoOuNada(r.status), r.bloqueada === true ? "BLOQUEADA" : null].filter(Boolean).join(" · "),
        [textoOuNada(r.plano) ? `Plano ${textoOuNada(r.plano)}` : null, textoOuNada(r.tipo_linha), r.esim === true ? "eSIM" : null, r.portada === true ? "portada" : null]
          .filter(Boolean).join(" · "),
      ];
      if (textoOuNada(r.titular)) linhas.push(`Titular: ${textoOuNada(r.titular)}${textoOuNada(r.documento) ? ` (${textoOuNada(r.documento)})` : ""}`);
      const ativada = dia(r.data_ativacao);
      const fimDoPlano = dia(r.data_fim_plano);
      if (ativada && fimDoPlano) linhas.push(`Ativada em ${ativada}, o plano vai até ${fimDoPlano}.`);
      else if (ativada) linhas.push(`Ativada em ${ativada}.`);
      else if (fimDoPlano) linhas.push(`O plano vai até ${fimDoPlano}.`);
      if (dia(r.data_perda_numero)) linhas.push(`Sem recarga, o cliente perde o número em ${dia(r.data_perda_numero)}.`);
      if (r.recarga_automatica === true) linhas.push(`Recarga automática ativa${textoOuNada(r.recarga_automatica_plano) ? ` (${textoOuNada(r.recarga_automatica_plano)})` : ""}.`);
      if (textoOuNada(r.portabilidade_status)) linhas.push(`Portabilidade: ${textoOuNada(r.portabilidade_status)}.`);
      if (dia(r.data_cancelamento) || textoOuNada(r.motivo_cancelamento)) {
        const motivo = textoOuNada(r.motivo_cancelamento);
        const explicacao = motivo && Object.hasOwn(MOTIVOS_CANCELAMENTO, motivo) ? MOTIVOS_CANCELAMENTO[motivo as keyof typeof MOTIVOS_CANCELAMENTO] : motivo;
        linhas.push(`Cancelada${dia(r.data_cancelamento) ? ` em ${dia(r.data_cancelamento)}` : ""}${explicacao ? `: ${explicacao}` : ""}.`);
      }
      return linhas.filter((l) => l.length > 0);
    }
    case "linha_saldo": {
      const dados = numeroOuNada(r.dados_mb);
      const minutos = numeroOuNada(r.minutos);
      const sms = numeroOuNada(r.sms);
      return [
        dados !== null ? `Internet: ${megabytes(dados)}` : null,
        minutos !== null ? `Minutos: ${r.minutos_ilimitados === true ? "ilimitados" : numero(minutos)}` : null,
        sms !== null ? `SMS: ${numero(sms)}` : null,
        "A Nogle atualiza o saldo a cada 30 minutos, mais ou menos.",
      ].filter((l): l is string => l !== null);
    }
    case "linha_historico": {
      const recargas = Array.isArray(r.recargas) ? (r.recargas as Record<string, unknown>[]) : [];
      if (recargas.length === 0) return ["Nenhuma recarga nesta linha."];
      return recargas.map((x) => [momento(x.quando), textoOuNada(x.plano), typeof x.valor_centavos === "number" ? brl(x.valor_centavos) : null, textoOuNada(x.forma)]
        .filter(Boolean).join(" · "));
    }
    case "linha_consumo": {
      const dias = Array.isArray(r.dias) ? (r.dias as { dia?: string; bytes?: number }[]) : [];
      const total = numeroOuNada(r.total_bytes) ?? 0;
      if (dias.length === 0) return ["Nenhum consumo de internet neste mês."];
      return [`No mês: ${bytes(total)}`, ...dias.filter((d) => (d.bytes ?? 0) > 0).slice(-7).map((d) => `${dia(d.dia) ?? ""}: ${bytes(d.bytes ?? 0)}`)];
    }
    case "iccid_numero":
      return [`Número da linha: ${linhaFormatada(r.numero)}`];
    case "iccid_ativacao":
      return [
        [dia(r.data_ativacao) ? `Ativado em ${momento(r.data_ativacao)}` : "Ainda sem data de ativação", r.numero_ativado ? `número ${linhaFormatada(r.numero_ativado)}` : null]
          .filter(Boolean).join(" · "),
        [textoOuNada(r.plano) ? `Plano ${textoOuNada(r.plano)}` : null, textoOuNada(r.forma_pagamento) ? `pago por ${textoOuNada(r.forma_pagamento)}` : null].filter(Boolean).join(" · "),
        textoOuNada(r.cliente) ? `Cliente: ${textoOuNada(r.cliente)}` : "",
        r.numero_portado ? `Número portado: ${linhaFormatada(r.numero_portado)}` : "",
      ].filter((l) => l.length > 0);
    case "carteira_saldo":
      return typeof r.saldo_centavos === "number" ? [`Saldo: ${brl(r.saldo_centavos)}`] : [];
    case "linha_cobrancas": {
      const cobrancas = Array.isArray(r.cobrancas) ? (r.cobrancas as Record<string, unknown>[]) : [];
      if (cobrancas.length === 0) return ["Nenhuma cobrança de recarga em aberto."];
      return [...cobrancas.map((x) => [momento(x.quando), typeof x.valor_centavos === "number" ? brl(x.valor_centavos) : null, textoOuNada(x.forma)]
        .filter(Boolean).join(" · ")), "Cobrança em aberto não obriga o cliente a pagar: é o link que ele pediu e não pagou."];
    }
    case "linha_consumo_voz": case "linha_consumo_sms": {
      const voz = c.tipo === "linha_consumo_voz";
      const dias = Array.isArray(r.dias) ? (r.dias as { dia?: string; quantidade?: number }[]) : [];
      const total = numeroOuNada(r.total) ?? 0;
      const medida = (n: number) => (voz ? `${numero(Math.round(n / 60))} min` : `${numero(n)} SMS`);
      if (dias.length === 0) return [voz ? "Nenhuma ligação neste mês." : "Nenhum SMS neste mês."];
      return [`No mês: ${medida(total)}`, ...dias.filter((d) => (d.quantidade ?? 0) > 0).slice(-7).map((d) => `${dia(d.dia) ?? ""}: ${medida(d.quantidade ?? 0)}`)];
    }
    case "linha_existe":
      return [r.existe === true ? "Sim: o número existe na Nogle." : `Não${textoOuNada(r.explicacao) ? `: ${textoOuNada(r.explicacao)}` : "."}`];
    case "iccid_plano_pago": {
      const codigo = textoOuNada(r.plano_pago);
      return [codigo ? `O chip já tem plano pago: ${nomeDoPlano?.(codigo) ?? `o plano ${codigo}`}.` : "O chip não tem plano pago."];
    }
    case "iccid_situacao":
      return [[textoOuNada(r.situacao), r.linha ? `linha ${linhaFormatada(r.linha)}` : null].filter(Boolean).join(" · "), textoOuNada(r.orientacao) ?? ""]
        .filter((l) => l.length > 0);
    case "linha_completa": {
      const d = parte(r, "detalhes");
      if (!d) return ["Abra o relatório completo."];
      return [[`Linha ${linhaFormatada(d.linha)}`, textoOuNada(d.status), d.bloqueada === true ? "BLOQUEADA" : null, textoOuNada(d.plano) ? `Plano ${textoOuNada(d.plano)}` : null]
        .filter(Boolean).join(" · "), "Abra o relatório completo para ver tudo."];
    }
    case "cliente_completo": {
      const cli = parte(r, "cliente");
      const linhas = parte(r, "linhas");
      const quantas = Array.isArray(linhas?.linhas) ? (linhas.linhas as unknown[]).length : 0;
      return [[cli && textoOuNada(cli.nome) ? `Cliente: ${textoOuNada(cli.nome)}` : "Cliente", `${numero(quantas)} ${quantas === 1 ? "linha" : "linhas"}`].join(" · "),
        "Abra o relatório completo para ver tudo."];
    }
    // CONNECT-i: as que faltavam.
    case "faq_categorias": {
      const categorias = lista(r.categorias);
      return categorias.length === 0 ? ["Nenhuma categoria de dúvidas."] : [`${quantos(categorias.length, "categoria", "categorias")}: escolha uma abaixo para ver as perguntas.`];
    }
    case "faq_perguntas": {
      const perguntas = lista(r.perguntas);
      if (perguntas.length === 0) return ["Nenhuma pergunta nesta categoria."];
      if (!opcoes.completo) return [`${quantos(perguntas.length, "pergunta", "perguntas")} com a resposta.`, ABRA];
      return [...perguntas.flatMap((p) => [`P: ${textoOuNada(p.pergunta) ?? "—"}`, `R: ${textoOuNada(p.resposta) ?? "—"}`]), ...naoCouberam(r)];
    }
    case "planos_campanhas": {
      const planos = lista(r.planos);
      if (planos.length === 0) return ["Nenhum plano de campanha agora."];
      return planos.map((p) => [textoOuNada(p.nome), typeof p.valor_centavos === "number" ? brl(p.valor_centavos) : null, textoOuNada(p.internet),
        textoOuNada(p.ligacoes), textoOuNada(p.sms), textoOuNada(p.codigo) ? `código ${textoOuNada(p.codigo)}` : null].filter(Boolean).join(" · "));
    }
    case "estados": {
      const estados = lista(r.estados);
      return [`${quantos(estados.length, "estado", "estados")}: ${estados.map((e) => textoOuNada(e.uf)).filter(Boolean).join(", ")}`];
    }
    case "logistica":
      return [[typeof r.chip_centavos === "number" ? `Chip: ${brl(r.chip_centavos)}` : null, typeof r.frete_centavos === "number" ? `Frete: ${brl(r.frete_centavos)}` : null]
        .filter(Boolean).join(" · "), "O custo da Nogle para a Ora (não é o preço de venda)."];
    case "validar_cep":
      if (r.valido !== true) return ["CEP não encontrado."];
      return [`CEP válido: ${[textoOuNada(r.rua) ? `${textoOuNada(r.rua)}${textoOuNada(r.numero) ? `, ${textoOuNada(r.numero)}` : ""}` : null, textoOuNada(r.bairro),
        textoOuNada(r.cidade) ? `${textoOuNada(r.cidade)}${textoOuNada(r.uf) ? `-${textoOuNada(r.uf)}` : ""}` : null].filter(Boolean).join(" · ")}`];
    case "validar_cpf":
      if (r.valido !== true) return ["CPF inválido ou não encontrado."];
      return [`CPF válido${textoOuNada(r.titular) ? `: ${textoOuNada(r.titular)}` : "."}`,
        dia(r.nascimento) ? `Nascimento: ${dia(r.nascimento)}${typeof r.idade === "number" ? ` (${numero(r.idade)} anos)` : ""}` : ""].filter((l) => l.length > 0);
    case "validar_cnpj":
      if (r.valido !== true) return ["CNPJ inválido ou não encontrado."];
      return [`CNPJ válido${textoOuNada(r.razao_social) ? `: ${textoOuNada(r.razao_social)}` : "."}`, textoOuNada(r.nome_fantasia) ? `Nome fantasia: ${textoOuNada(r.nome_fantasia)}` : ""]
        .filter((l) => l.length > 0);
    case "compra_rastreio": {
      const eventos = lista(r.eventos);
      return [[r.pedido !== null && r.pedido !== undefined ? `Pedido nº ${String(r.pedido)}` : "Pedido", momento(r.data_pedido) ? `feito em ${momento(r.data_pedido)}` : null,
        textoOuNada(r.cliente)].filter(Boolean).join(" · "),
        ...(eventos.length === 0 ? ["Ainda sem rastreio."] : eventos.map((e) => [momento(e.quando), textoOuNada(e.status)].filter(Boolean).join(" · ")))];
    }
    case "titularidade_da_linha":
      return [r.titular === true ? "Sim: o CPF/CNPJ é o do titular da linha." : "Não: o CPF/CNPJ não é o do titular da linha.",
        textoOuNada(r.operadora) ? `Operadora da linha: ${textoOuNada(r.operadora)}` : ""].filter((l) => l.length > 0);
    case "carteira_programadas": {
      const recargas = lista(r.recargas);
      const total = numeroOuNada(r.total) ?? recargas.length;
      const resumo = `${quantos(total, "recarga programada", "recargas programadas")}${typeof r.soma_centavos === "number" ? ` · ${brl(r.soma_centavos)}` : ""}`;
      if (!opcoes.completo || recargas.length === 0) return total === 0 ? ["Nenhuma recarga programada no período."] : [resumo, ABRA];
      return [resumo, ...recargas.map((x) => [dia(x.renovacao), `${linhaFormatada(x.linha)}${textoOuNada(x.apelido) ? ` (${textoOuNada(x.apelido)})` : ""}`,
        [textoOuNada(x.cliente), textoOuNada(x.documento)].filter(Boolean).join(" "), textoOuNada(x.plano),
        typeof x.valor_centavos === "number" ? brl(x.valor_centavos) : null, textoOuNada(x.cadastrada_por) ? `por ${textoOuNada(x.cadastrada_por)}` : null]
        .filter(Boolean).join(" · ")), ...naoCouberam(r)];
    }
    case "relatorio_portabilidades": {
      const itens = lista(r.portabilidades);
      const total = numeroOuNada(r.total) ?? itens.length;
      if (total === 0) return ["Nenhuma portabilidade no período."];
      const porStatus = r.por_status && typeof r.por_status === "object" ? Object.entries(r.por_status as Record<string, number>) : [];
      const resumo = `${quantos(total, "portabilidade", "portabilidades")}${porStatus.length > 0 ? `: ${porStatus.map(([s, n]) => `${numero(n)} ${s}`).join(", ")}` : ""}`;
      if (!opcoes.completo) return [resumo, ABRA];
      return [resumo, ...itens.map((x) => [momento(x.quando), `${linhaFormatada(x.linha)} ← ${linhaFormatada(x.linha_doadora)}${textoOuNada(x.operadora) ? ` (${textoOuNada(x.operadora)})` : ""}`,
        textoOuNada(x.status), [textoOuNada(x.cliente), textoOuNada(x.documento)].filter(Boolean).join(" "),
        dia(x.sucesso) ? `feita em ${dia(x.sucesso)}` : momento(x.agendada) ? `agendada para ${momento(x.agendada)}` : null].filter(Boolean).join(" · ")), ...naoCouberam(r)];
    }
    case "lista_de_linhas": {
      const linhas = lista(r.linhas);
      if (linhas.length === 0) return ["Nenhuma linha nesta página."];
      if (!opcoes.completo) return [`${quantos(numeroOuNada(r.total) ?? linhas.length, "linha", "linhas")} nesta página.`, ABRA];
      return [...linhas.map((x) => [`${linhaFormatada(x.linha)}${textoOuNada(x.apelido) ? ` (${textoOuNada(x.apelido)})` : ""}`, textoOuNada(x.status),
        x.bloqueada === true ? "BLOQUEADA" : null, textoOuNada(x.plano), [textoOuNada(x.titular), textoOuNada(x.documento)].filter(Boolean).join(" "),
        dia(x.fim_do_plano) ? `plano até ${dia(x.fim_do_plano)}` : null, x.esim === true ? "eSIM" : null, x.portada === true ? "portada" : null]
        .filter(Boolean).join(" · ")), ...naoCouberam(r)];
    }
    case "lista_de_clientes": {
      const clientes = lista(r.clientes);
      if (clientes.length === 0) return ["Nenhum cliente nesta página."];
      if (!opcoes.completo) return [`${quantos(numeroOuNada(r.total) ?? clientes.length, "cliente", "clientes")} nesta página.`, ABRA];
      return [...clientes.map((x) => [`${textoOuNada(x.nome) ?? "—"}${textoOuNada(x.apelido) ? ` (${textoOuNada(x.apelido)})` : ""}`,
        [textoOuNada(x.tipo), textoOuNada(x.documento)].filter(Boolean).join(" "),
        textoOuNada(x.cidade) ? `${textoOuNada(x.cidade)}${textoOuNada(x.uf) ? `-${textoOuNada(x.uf)}` : ""}` : null].filter(Boolean).join(" · ")), ...naoCouberam(r)];
    }
    case "pagamento_da_solicitacao":
      return [
        [typeof r.valor_centavos === "number" ? brl(r.valor_centavos) : null, momento(r.quando) ? `pedido em ${momento(r.quando)}` : null, textoOuNada(r.operadora)]
          .filter(Boolean).join(" · "),
        [textoOuNada(r.cliente) ? `Cliente: ${textoOuNada(r.cliente)}` : null, r.linha ? `linha ${linhaFormatada(r.linha)}` : null, textoOuNada(r.iccid) ? `ICCID ${textoOuNada(r.iccid)}` : null]
          .filter(Boolean).join(" · "),
        textoOuNada(r.link_pagamento) ? `Link para o cliente pagar: ${textoOuNada(r.link_pagamento)}` : "",
        textoOuNada(r.boleto_link) ? `Boleto: ${textoOuNada(r.boleto_link)}` : "",
        textoOuNada(r.boleto_codigo_barras) ? `Código de barras: ${textoOuNada(r.boleto_codigo_barras)}` : "",
        textoOuNada(r.pix_copia_cola) ? `Pix copia e cola: ${textoOuNada(r.pix_copia_cola)}` : "",
      ].filter((l) => l.length > 0);
    case "carteira_extrato_saidas": case "carteira_extrato_entradas": {
      const movimentos = lista(r.movimentos);
      const total = numeroOuNada(r.total) ?? movimentos.length;
      if (total === 0) return ["Nenhum movimento no período."];
      const resumo = `${quantos(total, "movimento", "movimentos")}${typeof r.soma_centavos === "number" ? ` · ${brl(r.soma_centavos)}` : ""}`;
      if (!opcoes.completo) return [resumo, ABRA];
      return [resumo, ...movimentos.map((x) => [momento(x.quando), textoOuNada(x.tipo), typeof x.valor_centavos === "number" ? brl(x.valor_centavos) : null,
        textoOuNada(x.plano) ? `${textoOuNada(x.plano)}${typeof x.plano_valor_centavos === "number" ? ` (${brl(x.plano_valor_centavos)})` : ""}` : null,
        x.linha ? linhaFormatada(x.linha) : textoOuNada(x.iccid) ? `ICCID ${textoOuNada(x.iccid)}` : null, textoOuNada(x.cliente)].filter(Boolean).join(" · ")),
      ...naoCouberam(r)];
    }
    default:
      return [];
  }
}

/** A resposta de uma parte do relatório (quando a Nogle respondeu aquela parte). */
function parte(r: Record<string, unknown>, nome: string): Record<string, unknown> | null {
  const partes = r.partes && typeof r.partes === "object" ? (r.partes as Record<string, { situacao?: string; resposta?: Record<string, unknown> }>) : {};
  const p = partes[nome];
  return p?.situacao === "respondida" && p.resposta ? p.resposta : null;
}

export type SecaoDoRelatorio = { titulo: string; situacao: string; mensagem: string | null; linhas: string[] };
type ParteGravada = { situacao?: string; mensagem?: string; resposta?: Record<string, unknown> };
const secao = (titulo: string, p: ParteGravada | undefined, linhas: (r: Record<string, unknown>) => string[]): SecaoDoRelatorio | null => {
  if (!p) return null;
  const ok = p.situacao === "respondida" && p.resposta;
  return { titulo, situacao: p.situacao ?? "falhou", mensagem: ok ? null : (p.mensagem || "A Nogle não respondeu esta parte."), linhas: ok ? linhas(p.resposta as Record<string, unknown>) : [] };
};
const daConsulta = (tipo: TipoDeConsulta) => (r: Record<string, unknown>) => linhasDaResposta({ tipo, resposta: r, situacao: "respondida", resposta_apagada_em: null });

/**
 * As seções do relatório (CONNECT-h): do número, a situação, o saldo, as recargas, as cobranças, o consumo (internet, ligações e
 * SMS), a portabilidade, a ativação do chip e as transações; do cliente, o cadastro, as linhas e a situação de cada uma. A
 * parte que a Nogle não respondeu aparece com o aviso.
 */
export function secoesDoRelatorio(c: Pick<ConsultaDaTela, "tipo" | "resposta">, nomeDoPlano?: (codigo: string) => string | undefined): SecaoDoRelatorio[] {
  const partes = (c.resposta?.partes ?? {}) as Record<string, ParteGravada>;
  if (c.tipo === "linha_completa") {
    return [
      secao("Situação da linha", partes.detalhes, daConsulta("linha_detalhes")),
      secao("Saldo", partes.linha_saldo, daConsulta("linha_saldo")),
      secao("Recargas", partes.linha_historico, daConsulta("linha_historico")),
      secao("Cobranças em aberto", partes.linha_cobrancas, daConsulta("linha_cobrancas")),
      secao("Internet no mês", partes.linha_consumo, daConsulta("linha_consumo")),
      secao("Ligações no mês", partes.linha_consumo_voz, daConsulta("linha_consumo_voz")),
      secao("SMS no mês", partes.linha_consumo_sms, daConsulta("linha_consumo_sms")),
      secao("Portabilidade", partes.portabilidade, (r) => [
        `Status: ${textoOuNada(r.status) ?? "—"}`, momento(r.data_aceite) ? `Aceite em ${momento(r.data_aceite)}` : "",
        momento(r.data_agendamento) ? `Agendada para ${momento(r.data_agendamento)}` : "", dia(r.data_sucesso) ? `Feita em ${dia(r.data_sucesso)}` : "",
      ].filter((l) => l.length > 0)),
      secao("Ativação do chip", partes.ativacao, daConsulta("iccid_ativacao")),
      secao("Transações dos últimos 12 meses", partes.transacoes, (r) => {
        const lista = Array.isArray(r.transacoes) ? (r.transacoes as Record<string, unknown>[]) : [];
        return lista.length === 0 ? ["Nenhuma transação nos últimos 12 meses."] : lista.map((x) => [momento(x.quando), textoOuNada(x.tipo), textoOuNada(x.plano),
          typeof x.valor_centavos === "number" ? brl(x.valor_centavos) : null, textoOuNada(x.forma)].filter(Boolean).join(" · "));
      }),
    ].filter((s): s is SecaoDoRelatorio => s !== null);
  }
  if (c.tipo === "cliente_completo") {
    const situacoes = (c.resposta?.partes as { situacoes?: Record<string, ParteGravada> } | undefined)?.situacoes ?? {};
    return [
      secao("Cadastro na Nogle", partes.cliente, (r) => [
        `Nome: ${textoOuNada(r.nome) ?? "—"}${textoOuNada(r.apelido) ? ` (${textoOuNada(r.apelido)})` : ""}`,
        textoOuNada(r.documento) ? `Documento: ${textoOuNada(r.documento)}` : "", dia(r.nascimento) ? `Nascimento: ${dia(r.nascimento)}` : "",
        [textoOuNada(r.telefone) ? linhaFormatada(r.telefone) : null, textoOuNada(r.email)].filter(Boolean).join(" · "),
        textoOuNada(r.cidade) ? `Cidade: ${textoOuNada(r.cidade)}${textoOuNada(r.uf) ? `-${textoOuNada(r.uf)}` : ""}` : "",
        dia(r.cliente_desde) ? `Cliente desde ${dia(r.cliente_desde)}` : "",
      ].filter((l) => l.length > 0)),
      secao("Linhas do cliente", partes.linhas, (r) => {
        const lista = Array.isArray(r.linhas) ? (r.linhas as Record<string, unknown>[]) : [];
        return lista.length === 0 ? ["Nenhuma linha no nome deste cliente."] : lista.map((l) => `${linhaFormatada(l.linha)} · ${textoOuNada(l.status) ?? "—"}`);
      }),
      ...Object.entries(situacoes).map(([linha, p]) => secao(`Situação de ${linhaFormatada(linha)}`, p, daConsulta("linha_detalhes"))),
    ].filter((s): s is SecaoDoRelatorio => s !== null);
  }
  return [{ titulo: tituloDaConsulta({ tipo: c.tipo, parametro: null }), situacao: "respondida", mensagem: null,
    linhas: linhasDaResposta({ tipo: c.tipo, resposta: c.resposta, situacao: "respondida", resposta_apagada_em: null }, nomeDoPlano, { completo: true }) }];
}

/** O que foi consultado, para a lista: "Saldo da linha · (41) 99999-9999"; o CPF ou o CNPJ, sempre mascarado. */
export function tituloDaConsulta(c: Pick<ConsultaDaTela, "tipo" | "parametro" | "parametro_mascarado">): string {
  const nome = ehTipoDeConsulta(c.tipo) ? NOMES_DAS_CONSULTAS[c.tipo] : c.tipo;
  // O documento (do relatório do cliente, das validações e da titularidade) só aparece mascarado.
  if (["cliente_completo", "validar_cpf", "validar_cnpj", "titularidade_da_linha"].includes(c.tipo)) return c.parametro_mascarado ? `${nome} · ${c.parametro_mascarado}` : nome;
  if (!c.parametro) return nome;
  switch (c.tipo) {
    case "validar_cep": return `${nome} · ${cep(c.parametro)}`;
    case "compra_rastreio": return `${nome} · pedido nº ${c.parametro}`;
    case "faq_perguntas": return `${nome} · categoria ${c.parametro}`;
    case "carteira_programadas": return `${nome} · próximos ${Number(c.parametro)} dias`;
    case "relatorio_portabilidades": case "carteira_extrato_saidas": case "carteira_extrato_entradas": return `${nome} · últimos ${Number(c.parametro)} dias`;
    case "pagamento_da_solicitacao": {
      const solicitacao = TIPOS_DE_SOLICITACAO[Number(c.parametro.slice(0, 1)) as 1 | 2 | 3];
      return solicitacao ? `${nome} · ${solicitacao.nome} nº ${c.parametro.slice(1)}` : nome;
    }
    case "lista_de_linhas": case "lista_de_clientes": return `${nome} · página ${Number(c.parametro)}`;
    default: return `${nome} · ${c.parametro.length === 11 ? linhaFormatada(c.parametro) : c.parametro}`;
  }
}
