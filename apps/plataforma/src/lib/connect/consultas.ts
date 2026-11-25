// As consultas da Nogle que só leem (lote CONNECT-g; ORA-CONNECT-007): ler o formulário, escolher a mensagem e escrever cada
// resposta em português simples. Regras puras: o banco confere tudo de novo, e a tela nunca fala com a Nogle (o worker do
// servidor consulta e grava a resposta já limpa).
import {
  iccidNoFormatoNogle, linhaValida, MOTIVOS_CANCELAMENTO, NOMES_DAS_CONSULTAS, PARAMETRO_DA_CONSULTA, ehTipoDeConsulta,
  type TipoDeConsulta,
} from "@ora5g/dominio/nogle";

import { brl, numero } from "../formato";

export { NOMES_DAS_CONSULTAS };

/** As consultas da loja (quem opera a Ora Connect), na ordem do formulário. A carteira é do dono, num cartão à parte. */
export const CONSULTAS_DA_LOJA = ["linha_detalhes", "linha_saldo", "linha_historico", "linha_consumo", "iccid_numero", "iccid_ativacao"] as const satisfies readonly TipoDeConsulta[];

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
export function linhasDaResposta(c: Pick<ConsultaDaTela, "tipo" | "resposta" | "resposta_apagada_em" | "situacao">): string[] {
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
    default:
      return [];
  }
}

/** O que foi consultado, para a lista: "Saldo da linha · (41) 99999-9999". */
export function tituloDaConsulta(c: Pick<ConsultaDaTela, "tipo" | "parametro">): string {
  const nome = ehTipoDeConsulta(c.tipo) ? NOMES_DAS_CONSULTAS[c.tipo] : c.tipo;
  if (!c.parametro) return nome;
  return `${nome} · ${c.parametro.length === 11 ? linhaFormatada(c.parametro) : c.parametro}`;
}
