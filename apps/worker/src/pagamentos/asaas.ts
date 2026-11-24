// O cliente da Asaas (lote PAY-014a; ADR-025). Só o que a documentação oficial (docs.asaas.com, lida em 24/11) diz: os
// endereços do sandbox e da produção, o cabeçalho access_token e o User-Agent, o link de pagamento (criar, procurar pelo
// externalReference e desativar), o pagamento (consultar pelo id) e o webhook (registrar). Valores em reais com centavos
// na Asaas; em centavos inteiros aqui. A chave nunca vai para o log nem para mensagem de erro.
import type { RespostaHttp, Transporte } from "../connect/transporte.ts";

export const ENDERECOS_DA_ASAAS = { sandbox: "https://api-sandbox.asaas.com/v3", producao: "https://api.asaas.com/v3" } as const;
export type AmbienteDaAsaas = keyof typeof ENDERECOS_DA_ASAAS;
export const ehAmbienteDaAsaas = (v: string): v is AmbienteDaAsaas => v === "sandbox" || v === "producao";
/** A documentação: a chave de produção começa com $aact_prod_ e a do sandbox com $aact_hmlg_. */
export const chaveDoAmbiente = (chave: string, ambiente: AmbienteDaAsaas) =>
  chave.startsWith(ambiente === "producao" ? "$aact_prod_" : "$aact_hmlg_") && chave.length >= 30 && !/\s/.test(chave);

const AGENTE = "Ora5G-Plataforma/1.0";
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const URL_SEGURA = /^https:\/\/[^\s]{1,490}$/;

/** Os eventos de pagamento que o aviso manda (cada um só faz o worker perguntar de novo à Asaas). */
export const EVENTOS_DO_AVISO = [
  "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_DELETED", "PAYMENT_RESTORED",
  "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE",
] as const;

export type SituacaoDaConsulta = "pago" | "pendente" | "cancelado" | "estornado" | "desconhecida";
/**
 * A situação da Asaas no formato comum. Pago: RECEIVED e CONFIRMED (a documentação: confirmado é o pagamento feito, com o
 * saldo ainda não disponível). Pendente: PENDING, OVERDUE e AWAITING_RISK_ANALYSIS. Estornado: REFUNDED. O pagamento
 * removido conta como cancelado. Todo o resto (estorno em andamento, chargeback, recebido em dinheiro, cobrança) é
 * desconhecida: vira divergência para alguém olhar, nunca confirma.
 */
export function situacaoDaAsaas(status: string, removido: boolean): SituacaoDaConsulta {
  if (removido) return "cancelado";
  if (status === "RECEIVED" || status === "CONFIRMED") return "pago";
  if (status === "PENDING" || status === "OVERDUE" || status === "AWAITING_RISK_ANALYSIS") return "pendente";
  if (status === "REFUNDED") return "estornado";
  return "desconhecida";
}

/** Reais com centavos (o número da Asaas) em centavos inteiros; fora disso, nulo. */
export function centavosDe(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return null;
  const centavos = Math.round(valor * 100);
  return Math.abs(centavos - valor * 100) < 1e-6 && Number.isSafeInteger(centavos) ? centavos : null;
}

export type LinkDaAsaas = { id: string; url: string };
export type ResultadoDoLink =
  | { tipo: "criado"; link: LinkDaAsaas }
  /** A Asaas recusou (4xx): não adianta repetir igual. */
  | { tipo: "recusado"; motivo: string }
  /** Nada saiu (sem conexão) ou a Asaas mandou esperar (429): repetir é seguro. */
  | { tipo: "falha"; motivo: string }
  /** Pode ter sido criado (tempo esgotado, 5xx, resposta fora da forma): antes de criar de novo, procurar. */
  | { tipo: "desconhecido"; motivo: string };
export type ConsultaDaAsaas = { id_no_provedor: string; link: string; valor_centavos: number; situacao: SituacaoDaConsulta };

const motivoHttp = (status: number) => `a Asaas respondeu ${status}`;
const corpoDe = (r: RespostaHttp) => (r.tipo === "resposta" && r.corpo && typeof r.corpo === "object" ? (r.corpo as Record<string, unknown>) : null);

export class ClienteAsaas {
  private readonly transporte: Transporte;
  private readonly chave: string;

  constructor(transporte: Transporte, chave: string) {
    this.transporte = transporte;
    this.chave = chave;
  }

  private pedir(metodo: "GET" | "POST" | "PUT", caminho: string, corpo?: unknown) {
    return this.transporte({ metodo, caminho, corpo, cabecalhos: { access_token: this.chave, "User-Agent": AGENTE } });
  }

  /** O link de pagamento de um pedido: Pix, uma venda só, até o dia do vencimento, com o NOSSO identificador. */
  async criarLink(p: { referencia: string; nome: string; valorCentavos: number; venceEm: string; retorno: string }): Promise<ResultadoDoLink> {
    const r = await this.pedir("POST", "/paymentLinks", {
      name: p.nome, billingType: "PIX", chargeType: "DETACHED", value: p.valorCentavos / 100, endDate: p.venceEm,
      externalReference: p.referencia, limit: 1, notificationEnabled: false, callback: { successUrl: p.retorno, autoRedirect: false },
    });
    if (r.tipo === "falha") return r.enviada ? { tipo: "desconhecido", motivo: r.motivo } : { tipo: "falha", motivo: r.motivo };
    if (r.status === 429) return { tipo: "falha", motivo: motivoHttp(429) };
    if (r.status >= 400 && r.status < 500) return { tipo: "recusado", motivo: motivoHttp(r.status) };
    const c = corpoDe(r);
    if (r.status !== 200 || !c || typeof c.id !== "string" || !ID.test(c.id) || typeof c.url !== "string" || !URL_SEGURA.test(c.url)) {
      return { tipo: "desconhecido", motivo: r.status === 200 ? "resposta da Asaas fora da forma" : motivoHttp(r.status) };
    }
    return { tipo: "criado", link: { id: c.id, url: c.url } };
  }

  /** O link de um pagamento nosso, pelo externalReference (depois de um resultado desconhecido). Nulo: a Asaas não tem. */
  async procurarLink(referencia: string): Promise<LinkDaAsaas | null | "falha"> {
    const r = await this.pedir("GET", `/paymentLinks?externalReference=${encodeURIComponent(referencia)}&limit=10`);
    const c = corpoDe(r);
    if (r.tipo !== "resposta" || r.status !== 200 || !c || !Array.isArray(c.data)) return "falha";
    for (const item of c.data as Record<string, unknown>[]) {
      if (item && item.externalReference === referencia && item.deleted !== true && typeof item.id === "string" && ID.test(item.id)
        && typeof item.url === "string" && URL_SEGURA.test(item.url)) return { id: item.id, url: item.url };
    }
    return null;
  }

  /** Desativa o link (o pedido cancelado ou vencido sem pagamento). O link que a Asaas não acha conta como desativado. */
  async desativarLink(id: string): Promise<boolean> {
    if (!ID.test(id)) return false;
    const r = await this.pedir("PUT", `/paymentLinks/${id}`, { active: false });
    return r.tipo === "resposta" && (r.status === 200 || r.status === 404);
  }

  /** O pagamento pelo id do aviso, no formato comum. Nulo: a Asaas não conhece (404). "falha": tente de novo depois. */
  async consultarPagamento(id: string): Promise<ConsultaDaAsaas | null | "falha"> {
    if (!ID.test(id)) return null;
    const r = await this.pedir("GET", `/payments/${id}`);
    if (r.tipo === "resposta" && r.status === 404) return null;
    const c = corpoDe(r);
    if (r.tipo !== "resposta" || r.status !== 200 || !c) return "falha";
    const valor = centavosDe(c.value);
    if (c.id !== id || typeof c.status !== "string" || valor === null || typeof c.paymentLink !== "string" || !ID.test(c.paymentLink)) return "falha";
    return { id_no_provedor: id, link: c.paymentLink, valor_centavos: valor, situacao: situacaoDaAsaas(c.status, c.deleted === true) };
  }

  /** Registra o aviso (webhook) com o token que o worker gerou; a Asaas o manda no cabeçalho asaas-access-token. */
  async registrarAviso(p: { url: string; token: string; email: string }): Promise<{ id: string } | { falha: string }> {
    const r = await this.pedir("POST", "/webhooks", {
      name: "Ora 5G: pagamentos do site", url: p.url, email: p.email, enabled: true, interrupted: false, apiVersion: 3,
      authToken: p.token, sendType: "SEQUENTIALLY", events: EVENTOS_DO_AVISO,
    });
    if (r.tipo === "falha") return { falha: r.motivo };
    const c = corpoDe(r);
    if (r.status !== 200 || !c || typeof c.id !== "string" || !ID.test(c.id)) return { falha: r.status === 200 ? "resposta da Asaas fora da forma" : motivoHttp(r.status) };
    return { id: c.id };
  }
}
