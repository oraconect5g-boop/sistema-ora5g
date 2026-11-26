// O cliente da Asaas (lote PAY-014a; ADR-025). Só o que a documentação oficial (docs.asaas.com, lida em 24/11) diz: os
// endereços do sandbox e da produção, o cabeçalho access_token e o User-Agent, o link de pagamento (criar, procurar pelo
// externalReference e desativar), o pagamento (consultar pelo id) e o webhook (registrar). PAY-015a (lida em 25/11): a
// chave Pix ativa da conta (GET /pix/addressKeys), o QR Code estático com valor (POST /pix/qrCodes/static), as cobranças
// que a Asaas cria ao receber pelo QR (GET /payments?pixQrCodeId=) e a exclusão do QR (DELETE /pix/qrCodes/static/{id}).
// Valores em reais com centavos na Asaas; em centavos inteiros aqui. A chave nunca vai para o log nem para mensagem de erro.
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
export function situacaoDaAsaas(status: string, removido: boolean, cobranca: Record<string, unknown> = {}): SituacaoDaConsulta {
  return lerPagamentoDaAsaas({ ...cobranca, status, deleted: removido }).situacao;
}

/**
 * AUD-f (auditoria de e7f55b2): o motivo de cada situação que não é pago, pendente, cancelado nem estornado (a documentação da
 * Asaas, lida em 26/11: os status do pagamento, os estornos em "refunds" e a contestação em "chargeback"). Nenhum confirma.
 */
export type MotivoDaAsaas = "estorno_parcial" | "estorno_em_andamento" | "contestacao" | "recebido_em_dinheiro" | "negativacao";
export type LeituraDaAsaas = { situacao: SituacaoDaConsulta; motivo?: MotivoDaAsaas; status?: string; liquido_centavos?: number; estornado_centavos: number };
const ESTORNO_PENDENTE = new Set(["PENDING", "AWAITING_CRITICAL_ACTION_AUTHORIZATION", "AWAITING_CUSTOMER_EXTERNAL_AUTHORIZATION"]);
const CONTESTACAO = new Set(["CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"]);
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * O pagamento da Asaas lido inteiro: a situação, o motivo, a situação na Asaas, o líquido (netValue: o bruto menos a taxa) e a
 * soma dos estornos concluídos. Pago (RECEIVED ou CONFIRMED) com estorno concluído é o estorno PARCIAL (o REFUNDED é o total):
 * não passa como pago. O estorno pedido ou em andamento e a contestação aberta (a que não foi revertida) também não; o pagamento
 * removido conta como cancelado. Tudo o que não for conhecido é desconhecida, sem motivo.
 */
export function lerPagamentoDaAsaas(c: Record<string, unknown>): LeituraDaAsaas {
  const status = typeof c.status === "string" && /^[A-Z_]{1,40}$/.test(c.status) ? c.status : undefined;
  const estornos = Array.isArray(c.refunds) ? c.refunds.filter(ehObjeto) : [];
  const estornado = estornos.filter((e) => e.status === "DONE").reduce((soma, e) => soma + (centavosDe(e.value) ?? 0), 0);
  const estornoPendente = estornos.some((e) => typeof e.status === "string" && ESTORNO_PENDENTE.has(e.status));
  const contestacaoAberta = ehObjeto(c.chargeback) && c.chargeback.status !== "REVERSED";
  const liquido = centavosDe(c.netValue);
  const base = { estornado_centavos: estornado, ...(status ? { status } : {}), ...(liquido !== null ? { liquido_centavos: liquido } : {}) };
  const motivo = (m: MotivoDaAsaas): LeituraDaAsaas => ({ ...base, situacao: "desconhecida", motivo: m });
  if (c.deleted === true) return { ...base, situacao: "cancelado" };
  if ((status && CONTESTACAO.has(status)) || contestacaoAberta) return motivo("contestacao");
  if (status === "REFUNDED") return { ...base, situacao: "estornado" };
  if (status === "REFUND_REQUESTED" || status === "REFUND_IN_PROGRESS" || estornoPendente) return motivo("estorno_em_andamento");
  if (status === "RECEIVED" || status === "CONFIRMED") return estornado > 0 ? motivo("estorno_parcial") : { ...base, situacao: "pago" };
  if (status === "RECEIVED_IN_CASH") return motivo("recebido_em_dinheiro");
  if (status === "DUNNING_REQUESTED" || status === "DUNNING_RECEIVED") return motivo("negativacao");
  if (status === "PENDING" || status === "OVERDUE" || status === "AWAITING_RISK_ANALYSIS") return { ...base, situacao: "pendente" };
  return { ...base, situacao: "desconhecida" };
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
export type ConsultaDaAsaas = { id_no_provedor: string; link: string; valor_centavos: number } & LeituraDaAsaas;

/** PAY-015a: o QR Code estático criado (o id, o copia e cola e a imagem em base64). */
export type QrDaAsaas = { id: string; copiaECola: string; imagem: string };
export type ResultadoDoQr =
  | { tipo: "criado"; qr: QrDaAsaas }
  | { tipo: "recusado"; motivo: string }
  | { tipo: "falha"; motivo: string }
  | { tipo: "desconhecido"; motivo: string };
/**
 * PAY-015a: as cobranças que a Asaas criou ao receber pelo QR, no formato que o banco confere. Pago: RECEIVED ou CONFIRMED;
 * estornado: REFUNDED; nenhum: sem cobrança (ou só pendente). Mais de uma cobrança paga ou estornada, ou outra situação
 * (estorno em andamento, chargeback...): desconhecida, para alguém olhar (o QR é de um pagamento só).
 */
export type ConsultaDoQr =
  | { situacao: "pago" | "estornado"; id_no_provedor: string; valor_centavos: number }
  | { situacao: "nenhum" | "desconhecida" };
/**
 * PAY-015b: uma cobrança de cartão com o link que a gerou. Do cartão, só os 4 últimos dígitos e a bandeira
 * (creditCard.creditCardNumber e creditCardBrand): o número inteiro nunca passa pelo sistema.
 */
export type CobrancaDeCartao = {
  id: string; link: string; situacao: SituacaoDaConsulta; valor_centavos: number | null; final: string | null; bandeira: string | null;
  /** PAY-015c: a assinatura que a cobrança é (o subscription), quando o link era recorrente. */
  assinatura: string | null;
};
/** PAY-015c: os ciclos da assinatura (subscriptionCycle). */
export const CICLOS_DA_ASSINATURA = ["WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "SEMIANNUALLY", "YEARLY"] as const;
export type CicloDaAssinatura = (typeof CICLOS_DA_ASSINATURA)[number];
/** PAY-015c: a assinatura na Asaas, no formato que o banco confere. */
export type AssinaturaDaAsaas = {
  id: string; status: "ACTIVE" | "INACTIVE" | "EXPIRED"; removida: boolean; valor_centavos: number | null; ciclo: string | null;
  proxima_cobranca: string | null; link: string | null;
};
/** PAY-015c: uma cobrança da assinatura (pago, pendente, vencido, estornado ou desconhecida), com o cartão dela. */
export type CobrancaDaAssinatura = {
  id: string; situacao: "pago" | "pendente" | "vencido" | "estornado" | "desconhecida"; valor_centavos: number; vencimento: string | null;
  pago_em: string | null; final: string | null; bandeira: string | null;
};
const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** PAY-015c: a situação de uma cobrança da assinatura (o vencido conta à parte, para a loja ver). */
export function situacaoDaCobranca(status: string): CobrancaDaAssinatura["situacao"] {
  if (status === "RECEIVED" || status === "CONFIRMED") return "pago";
  if (status === "PENDING" || status === "AWAITING_RISK_ANALYSIS") return "pendente";
  if (status === "OVERDUE") return "vencido";
  if (status === "REFUNDED") return "estornado";
  return "desconhecida";
}
const cartaoDe = (x: Record<string, unknown>) => {
  const c = x.creditCard && typeof x.creditCard === "object" ? (x.creditCard as Record<string, unknown>) : {};
  return {
    final: typeof c.creditCardNumber === "string" && /^\d{4}$/.test(c.creditCardNumber) ? c.creditCardNumber : null,
    bandeira: typeof c.creditCardBrand === "string" && /^[A-Z]{2,20}$/.test(c.creditCardBrand) ? c.creditCardBrand : null,
  };
};
/** PAY-015b: o que as cobranças de um link dizem, no formato que o banco confere (como ConsultaDoQr). */
export type ConsultaDoCartao =
  | { situacao: "pago" | "estornado"; id_no_provedor: string; valor_centavos: number; cartao_final: string | null; cartao_bandeira: string | null }
  | { situacao: "nenhum" | "desconhecida" };
/** PAY-015b: até 5 páginas de 100 cobranças de cartão por leitura; passou disso, a leitura falha (pela metade esconderia o pago). */
export const PAGINAS_DE_COBRANCAS = 5;
const COPIA_E_COLA = /^[ -~]{20,600}$/;
const BASE64 = /^[A-Za-z0-9+/=]+$/;

const motivoHttp = (status: number) => `a Asaas respondeu ${status}`;
const corpoDe = (r: RespostaHttp) => (r.tipo === "resposta" && r.corpo && typeof r.corpo === "object" ? (r.corpo as Record<string, unknown>) : null);

export class ClienteAsaas {
  private readonly transporte: Transporte;
  private readonly chave: string;

  constructor(transporte: Transporte, chave: string) {
    this.transporte = transporte;
    this.chave = chave;
  }

  private pedir(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown) {
    return this.transporte({ metodo, caminho, corpo, cabecalhos: { access_token: this.chave, "User-Agent": AGENTE } });
  }

  /** O link de pagamento de um pedido: Pix, uma venda só, até o dia do vencimento, com o NOSSO identificador. */
  async criarLink(p: { referencia: string; nome: string; valorCentavos: number; venceEm: string; retorno: string }): Promise<ResultadoDoLink> {
    return this.criarLinkCom({
      name: p.nome, billingType: "PIX", chargeType: "DETACHED", value: p.valorCentavos / 100, endDate: p.venceEm,
      externalReference: p.referencia, limit: 1, notificationEnabled: false, callback: { successUrl: p.retorno, autoRedirect: false },
    });
  }

  /**
   * PAY-015b: o link de pagamento no cartão do caixa: avulso (DETACHED), uma venda só (limit 1), sem aviso ao cliente e com o
   * NOSSO identificador. O endDate é um dia: a validade de verdade é a do caixa (o worker desativa o link vencido).
   */
  async criarLinkDoCartao(p: { referencia: string; nome: string; valorCentavos: number; venceEm: string }): Promise<ResultadoDoLink> {
    return this.criarLinkCom({
      name: p.nome, billingType: "CREDIT_CARD", chargeType: "DETACHED", value: p.valorCentavos / 100, endDate: p.venceEm,
      externalReference: p.referencia, limit: 1, notificationEnabled: false,
    });
  }

  private async criarLinkCom(corpo: Record<string, unknown>): Promise<ResultadoDoLink> {
    const r = await this.pedir("POST", "/paymentLinks", corpo);
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
    // AUD-f: a leitura inteira (o motivo, o líquido e o estornado, para a conciliação). O estorno maior que o pagamento é
    // desconhecido (sem o número, que o banco recusaria).
    const leitura = lerPagamentoDaAsaas(c);
    if (leitura.estornado_centavos > valor) return { id_no_provedor: id, link: c.paymentLink, valor_centavos: valor, situacao: "desconhecida", estornado_centavos: 0 };
    return { id_no_provedor: id, link: c.paymentLink, valor_centavos: valor, ...leitura };
  }

  /** PAY-015a: a chave Pix ativa da conta (a primeira), que recebe os pagamentos do QR. Nulo: a conta não tem chave ativa. */
  async chavePixAtiva(): Promise<string | null | "falha"> {
    const r = await this.pedir("GET", "/pix/addressKeys?status=ACTIVE&limit=10");
    const c = corpoDe(r);
    if (r.tipo !== "resposta" || r.status !== 200 || !c || !Array.isArray(c.data)) return "falha";
    for (const item of c.data as Record<string, unknown>[]) {
      if (item && item.status === "ACTIVE" && typeof item.key === "string" && /^[^\s]{1,120}$/.test(item.key)) return item.key;
    }
    return null;
  }

  /**
   * PAY-015a: o QR Code estático do caixa: com o valor, um pagamento só, a validade em segundos e o NOSSO identificador. Sem
   * resposta clara (tempo esgotado, 5xx): desconhecido; o worker pede outro (o QR sem resposta ninguém viu, e ele vence).
   */
  async criarQrEstatico(p: { referencia: string; chavePix: string; valorCentavos: number; descricao: string; validadeSegundos: number }): Promise<ResultadoDoQr> {
    const r = await this.pedir("POST", "/pix/qrCodes/static", {
      addressKey: p.chavePix, description: p.descricao, value: p.valorCentavos / 100, format: "ALL",
      expirationSeconds: p.validadeSegundos, allowsMultiplePayments: false, externalReference: p.referencia,
    });
    if (r.tipo === "falha") return r.enviada ? { tipo: "desconhecido", motivo: r.motivo } : { tipo: "falha", motivo: r.motivo };
    if (r.status === 429) return { tipo: "falha", motivo: motivoHttp(429) };
    if (r.status >= 400 && r.status < 500) return { tipo: "recusado", motivo: motivoHttp(r.status) };
    const c = corpoDe(r);
    if (r.status !== 200 || !c || typeof c.id !== "string" || !ID.test(c.id) || typeof c.payload !== "string" || !COPIA_E_COLA.test(c.payload)
      || typeof c.encodedImage !== "string" || c.encodedImage.length < 100 || c.encodedImage.length > 60_000 || !BASE64.test(c.encodedImage)) {
      return { tipo: "desconhecido", motivo: r.status === 200 ? "resposta da Asaas fora da forma" : motivoHttp(r.status) };
    }
    return { tipo: "criado", qr: { id: c.id, copiaECola: c.payload, imagem: c.encodedImage } };
  }

  /** PAY-015a: as cobranças criadas pelo pagamento do QR (o filtro pixQrCodeId), no formato que o banco confere. */
  async cobrancasDoQr(qrId: string): Promise<ConsultaDoQr | "falha"> {
    if (!ID.test(qrId)) return "falha";
    const r = await this.pedir("GET", `/payments?pixQrCodeId=${encodeURIComponent(qrId)}&limit=10`);
    const c = corpoDe(r);
    if (r.tipo !== "resposta" || r.status !== 200 || !c || !Array.isArray(c.data)) return "falha";
    const cobrancas = (c.data as Record<string, unknown>[]).filter((x) => x && x.pixQrCodeId === qrId && x.deleted !== true);
    const contam = cobrancas.map((x) => ({ x, situacao: typeof x.status === "string" ? situacaoDaAsaas(x.status, false, x) : "desconhecida" as const }))
      .filter((y) => y.situacao !== "pendente");
    if (contam.length === 0) return { situacao: "nenhum" };
    const [unica] = contam;
    if (contam.length > 1 || !unica || (unica.situacao !== "pago" && unica.situacao !== "estornado")) return { situacao: "desconhecida" };
    const valor = centavosDe(unica.x.value);
    if (typeof unica.x.id !== "string" || !ID.test(unica.x.id) || valor === null) return { situacao: "desconhecida" };
    return { situacao: unica.situacao, id_no_provedor: unica.x.id, valor_centavos: valor };
  }

  /**
   * PAY-015b: as cobranças de cartão criadas desde o dia (GET /payments com billingType=CREDIT_CARD e dateCreated[ge]), página
   * por página, só as que vieram de um link (a Asaas não tem a consulta das cobranças de um link: o caixa acha a do link pelo
   * paymentLink). A cobrança removida não conta. O dia no formato das datas da Asaas (AAAA-MM-DD; a confirmar no sandbox).
   */
  async cobrancasDeCartaoDesde(dia: string): Promise<CobrancaDeCartao[] | "falha"> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return "falha";
    const todas: CobrancaDeCartao[] = [];
    for (let pagina = 0; pagina < PAGINAS_DE_COBRANCAS; pagina++) {
      const r = await this.pedir("GET", `/payments?billingType=CREDIT_CARD&dateCreated%5Bge%5D=${dia}&limit=100&offset=${pagina * 100}`);
      const c = corpoDe(r);
      if (r.tipo !== "resposta" || r.status !== 200 || !c || !Array.isArray(c.data)) return "falha";
      for (const x of c.data as Record<string, unknown>[]) {
        if (!x || x.deleted === true || typeof x.id !== "string" || !ID.test(x.id) || typeof x.paymentLink !== "string" || !ID.test(x.paymentLink)) continue;
        todas.push({
          id: x.id, link: x.paymentLink, situacao: typeof x.status === "string" ? situacaoDaAsaas(x.status, false, x) : "desconhecida",
          valor_centavos: centavosDe(x.value), ...cartaoDe(x),
          assinatura: typeof x.subscription === "string" && ID.test(x.subscription) ? x.subscription : null,
        });
      }
      if (c.hasMore !== true) return todas;
    }
    return "falha";
  }

  /**
   * PAY-015c: o link recorrente da assinatura no cartão: preenchido, ele cria a assinatura (chargeType RECURRENT, com o ciclo);
   * uma assinatura só (limit 1), sem aviso ao cliente e com o NOSSO identificador.
   */
  async criarLinkRecorrente(p: { referencia: string; nome: string; valorCentavos: number; ciclo: CicloDaAssinatura; venceEm: string }): Promise<ResultadoDoLink> {
    return this.criarLinkCom({
      name: p.nome, billingType: "CREDIT_CARD", chargeType: "RECURRENT", subscriptionCycle: p.ciclo, value: p.valorCentavos / 100,
      endDate: p.venceEm, externalReference: p.referencia, limit: 1, notificationEnabled: false,
    });
  }

  /** PAY-015c: a assinatura (GET /subscriptions/{id}). Nulo: a Asaas não conhece (404). "falha": tente de novo depois. */
  async assinatura(id: string): Promise<AssinaturaDaAsaas | null | "falha"> {
    if (!ID.test(id)) return null;
    const r = await this.pedir("GET", `/subscriptions/${id}`);
    if (r.tipo === "resposta" && r.status === 404) return null;
    const c = corpoDe(r);
    if (r.tipo !== "resposta" || r.status !== 200 || !c || c.id !== id) return "falha";
    if (c.status !== "ACTIVE" && c.status !== "INACTIVE" && c.status !== "EXPIRED") return "falha";
    return {
      id, status: c.status, removida: c.deleted === true, valor_centavos: centavosDe(c.value), ciclo: typeof c.cycle === "string" ? c.cycle : null,
      proxima_cobranca: typeof c.nextDueDate === "string" && DIA.test(c.nextDueDate) ? c.nextDueDate : null,
      link: typeof c.paymentLink === "string" && ID.test(c.paymentLink) ? c.paymentLink : null,
    };
  }

  /** PAY-015c: as cobranças que a assinatura já gerou (GET /subscriptions/{id}/payments), página por página (até 5). */
  async cobrancasDaAssinatura(id: string): Promise<CobrancaDaAssinatura[] | "falha"> {
    if (!ID.test(id)) return "falha";
    const todas: CobrancaDaAssinatura[] = [];
    for (let pagina = 0; pagina < PAGINAS_DE_COBRANCAS; pagina++) {
      const r = await this.pedir("GET", `/subscriptions/${id}/payments${pagina ? `?offset=${pagina * 10}` : ""}`);
      const c = corpoDe(r);
      if (r.tipo !== "resposta" || r.status !== 200 || !c || !Array.isArray(c.data)) return "falha";
      for (const x of c.data as Record<string, unknown>[]) {
        const valor = x ? centavosDe(x.value) : null;
        if (!x || x.deleted === true || typeof x.id !== "string" || !ID.test(x.id) || valor === null) continue;
        const pago = typeof x.clientPaymentDate === "string" && DIA.test(x.clientPaymentDate) ? x.clientPaymentDate
          : typeof x.paymentDate === "string" && DIA.test(x.paymentDate) ? x.paymentDate : null;
        todas.push({
          id: x.id, situacao: typeof x.status === "string" ? situacaoDaCobranca(x.status) : "desconhecida", valor_centavos: valor,
          vencimento: typeof x.dueDate === "string" && DIA.test(x.dueDate) ? x.dueDate : null, pago_em: pago, ...cartaoDe(x),
        });
      }
      if (c.hasMore !== true) return todas;
    }
    return todas;
  }

  /** PAY-015c: remove a assinatura (as cobranças futuras param). A que a Asaas não acha conta como removida. */
  async removerAssinatura(id: string): Promise<boolean> {
    if (!ID.test(id)) return false;
    const r = await this.pedir("DELETE", `/subscriptions/${id}`);
    return r.tipo === "resposta" && (r.status === 200 || r.status === 404);
  }

  /** PAY-015a: exclui o QR (o cancelado e o vencido). O QR que a Asaas não acha conta como excluído. */
  async excluirQr(qrId: string): Promise<boolean> {
    if (!ID.test(qrId)) return false;
    const r = await this.pedir("DELETE", `/pix/qrCodes/static/${qrId}`);
    return r.tipo === "resposta" && (r.status === 200 || r.status === 404);
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
