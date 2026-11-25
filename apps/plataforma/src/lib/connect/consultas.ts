// As consultas da Nogle que só leem (lote CONNECT-g; ORA-CONNECT-007): ler o formulário, escolher a mensagem e escrever cada
// resposta em português simples. Regras puras: o banco confere tudo de novo, e a tela nunca fala com a Nogle (o worker do
// servidor consulta e grava a resposta já limpa).
import { cnpjValido, cpfValido } from "@ora5g/dominio";
import {
  iccidNoFormatoNogle, linhaValida, MOTIVOS_CANCELAMENTO, NOMES_DAS_CONSULTAS, PARAMETRO_DA_CONSULTA, ehTipoDeConsulta,
  type TipoDeConsulta,
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
] as const satisfies readonly TipoDeConsulta[];
/** Do que cada consulta precisa, para o formulário dizer. */
export const PEDE_O_QUE: Record<"linha" | "iccid" | "documento", string> = { linha: "pelo número", iccid: "pelo ICCID", documento: "pelo CPF ou CNPJ" };

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
  if (!ehTipoDeConsulta(tipo)) return { ok: false, erro: "tipo" };
  if (!chave) return { ok: false, erro: "falha" };
  const digitos = texto(dados, "parametro", 40).replace(/\D/g, "");
  const pede = PARAMETRO_DA_CONSULTA[tipo];
  if (pede === "linha" && !linhaValida(digitos)) return { ok: false, erro: "linha" };
  if (pede === "iccid" && !iccidNoFormatoNogle(digitos)) return { ok: false, erro: "iccid" };
  if (pede === "documento" && !(digitos.length === 11 ? cpfValido(digitos) : digitos.length === 14 && cnpjValido(digitos))) return { ok: false, erro: "documento" };
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
/** Megabytes como a Nogle informa o saldo; de 1.024 MB para cima, em GB. */
export const megabytes = (mb: number) => (mb >= 1024 ? `${decimal.format(mb / 1024)} GB` : `${decimal.format(mb)} MB`);
/** Bytes como a Nogle informa o consumo, em MB ou GB. */
export const bytes = (b: number) => megabytes(b / (1024 * 1024));
const textoOuNada = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const numeroOuNada = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** As linhas de texto de uma resposta (cada tipo do seu jeito). Sem resposta guardada: o aviso de que foi apagada. */
export function linhasDaResposta(c: Pick<ConsultaDaTela, "tipo" | "resposta" | "resposta_apagada_em" | "situacao">,
  nomeDoPlano?: (codigo: string) => string | undefined): string[] {
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
    linhas: linhasDaResposta({ tipo: c.tipo, resposta: c.resposta, situacao: "respondida", resposta_apagada_em: null }, nomeDoPlano) }];
}

/** O que foi consultado, para a lista: "Saldo da linha · (41) 99999-9999"; o CPF ou o CNPJ, sempre mascarado. */
export function tituloDaConsulta(c: Pick<ConsultaDaTela, "tipo" | "parametro" | "parametro_mascarado">): string {
  const nome = ehTipoDeConsulta(c.tipo) ? NOMES_DAS_CONSULTAS[c.tipo] : c.tipo;
  if (c.tipo === "cliente_completo") return c.parametro_mascarado ? `${nome} · ${c.parametro_mascarado}` : nome;
  if (!c.parametro) return nome;
  return `${nome} · ${c.parametro.length === 11 ? linhaFormatada(c.parametro) : c.parametro}`;
}
