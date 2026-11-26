// O cliente da Asaas (lote PAY-014a) contra um servidor HTTP local (127.0.0.1) no papel da Asaas, com o transporte de
// verdade: os caminhos, os cabeçalhos, o corpo e cada tipo de resposta, como a documentação oficial descreve. Chave, links e
// pagamentos FICTÍCIOS; nada sai da máquina.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { transporteHttp } from "../connect/transporte.ts";
import { centavosDe, chaveDoAmbiente, ClienteAsaas, EVENTOS_DO_AVISO, lerPagamentoDaAsaas, situacaoDaAsaas } from "./asaas.ts";

const CHAVE = "$aact_hmlg_000000000000ChaveFicticiaDoTeste";
type Pedido = { metodo: string; caminho: string; cabecalhos: IncomingMessage["headers"]; corpo: unknown };
const recebidos: Pedido[] = [];
let responder: (req: IncomingMessage, res: ServerResponse) => void = () => undefined;
let servidor: Server;
let base = "";
const json = (status: number, dados: unknown) => (_: IncomingMessage, res: ServerResponse) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(dados));
};

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let corpo = "";
    req.on("data", (c: Buffer) => { corpo += c.toString("utf8"); });
    req.on("end", () => {
      recebidos.push({ metodo: req.method ?? "", caminho: req.url ?? "", cabecalhos: req.headers, corpo: corpo ? JSON.parse(corpo) : undefined });
      responder(req, res);
    });
  });
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/v3`;
});
afterAll(async () => { await new Promise((fim) => servidor.close(fim)); });
beforeEach(() => { recebidos.length = 0; });
const cliente = (tempo = 2_000) => new ClienteAsaas(transporteHttp(base, tempo, "Asaas"), CHAVE);
const LINK = { referencia: "00000000-0000-4000-8000-0000000000p1", nome: "Pedido ABC234 na Ora 5G", valorCentavos: 7_990, venceEm: "2026-11-25", retorno: "https://ora5g.com.br/loja/pedido?codigo=ABC234" };

describe("o formato da Asaas (PAY-014a)", () => {
  it("a situação no formato comum: só RECEIVED e CONFIRMED pagam; o removido conta como cancelado; o resto é desconhecido", () => {
    expect(["RECEIVED", "CONFIRMED"].map((s) => situacaoDaAsaas(s, false))).toEqual(["pago", "pago"]);
    expect(["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"].map((s) => situacaoDaAsaas(s, false))).toEqual(["pendente", "pendente", "pendente"]);
    expect(situacaoDaAsaas("REFUNDED", false)).toBe("estornado");
    expect(situacaoDaAsaas("RECEIVED", true)).toBe("cancelado");
    for (const s of ["REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED", "RECEIVED_IN_CASH", "DUNNING_REQUESTED", "QUALQUER"]) expect(situacaoDaAsaas(s, false), s).toBe("desconhecida");
  });

  // AUD-f (auditoria de e7f55b2): cada situação com o seu motivo; o estorno parcial não passa como pago. Pagamentos FICTÍCIOS
  // na forma da documentação da Asaas (lida em 26/11): status, value, netValue, refunds e chargeback.
  it("AUD-f: o pagamento lido inteiro: o estorno parcial, o estorno em andamento, a contestação, o recebido em dinheiro e a negativação não pagam", () => {
    const pago = { status: "RECEIVED", value: 79.9, netValue: 78.91 };
    expect(lerPagamentoDaAsaas(pago)).toEqual({ situacao: "pago", status: "RECEIVED", liquido_centavos: 7_891, estornado_centavos: 0 });
    expect(lerPagamentoDaAsaas({ ...pago, refunds: [{ status: "DONE", value: 20 }, { status: "CANCELLED", value: 5 }] }))
      .toEqual({ situacao: "desconhecida", motivo: "estorno_parcial", status: "RECEIVED", liquido_centavos: 7_891, estornado_centavos: 2_000 });
    expect(lerPagamentoDaAsaas({ ...pago, status: "CONFIRMED", refunds: [{ status: "AWAITING_CUSTOMER_EXTERNAL_AUTHORIZATION", value: 79.9 }] }))
      .toMatchObject({ situacao: "desconhecida", motivo: "estorno_em_andamento" });
    for (const status of ["REFUND_REQUESTED", "REFUND_IN_PROGRESS"]) expect(lerPagamentoDaAsaas({ ...pago, status }), status).toMatchObject({ motivo: "estorno_em_andamento" });
    for (const status of ["CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"]) expect(lerPagamentoDaAsaas({ ...pago, status }), status).toMatchObject({ motivo: "contestacao" });
    expect(lerPagamentoDaAsaas({ ...pago, chargeback: { status: "IN_DISPUTE", value: 79.9 } })).toMatchObject({ situacao: "desconhecida", motivo: "contestacao" });
    expect(lerPagamentoDaAsaas({ ...pago, chargeback: { status: "REVERSED", value: 79.9 } })).toMatchObject({ situacao: "pago" });
    expect(lerPagamentoDaAsaas({ ...pago, status: "RECEIVED_IN_CASH" })).toMatchObject({ motivo: "recebido_em_dinheiro" });
    for (const status of ["DUNNING_REQUESTED", "DUNNING_RECEIVED"]) expect(lerPagamentoDaAsaas({ ...pago, status })).toMatchObject({ motivo: "negativacao" });
    expect(lerPagamentoDaAsaas({ ...pago, status: "REFUNDED", refunds: [{ status: "DONE", value: 79.9 }] })).toEqual({ situacao: "estornado", status: "REFUNDED", liquido_centavos: 7_891, estornado_centavos: 7_990 });
    expect(lerPagamentoDaAsaas({ status: "status fora do padrão" })).toEqual({ situacao: "desconhecida", estornado_centavos: 0 });
    // O caixa (o Pix e o cartão pela Asaas) usa a mesma leitura: o pago com estorno parcial não paga lá também.
    expect(situacaoDaAsaas("RECEIVED", false, { refunds: [{ status: "DONE", value: 1 }] })).toBe("desconhecida");
  });

  it("os centavos: reais com até dois decimais; o resto é nulo", () => {
    expect([79.9, 100.9, 0.01, 1234.56, 0].map(centavosDe)).toEqual([7_990, 10_090, 1, 123_456, 0]);
    expect([1.234, -1, "79.90", Number.NaN, null].map(centavosDe)).toEqual([null, null, null, null, null]);
  });

  it("a chave confere com o ambiente (a de teste começa com $aact_hmlg_, a de produção com $aact_prod_)", () => {
    expect(chaveDoAmbiente(CHAVE, "sandbox")).toBe(true);
    expect(chaveDoAmbiente(CHAVE, "producao")).toBe(false);
    expect(chaveDoAmbiente("$aact_prod_000000000000ChaveFicticiaDoTeste", "producao")).toBe(true);
    expect(chaveDoAmbiente("$aact_hmlg_curta", "sandbox")).toBe(false);
  });
});

describe("o link de pagamento (PAY-014a)", () => {
  it("cria com Pix, uma venda só, até o dia do vencimento, com o nosso identificador; manda a chave e o User-Agent", async () => {
    responder = json(200, { id: "lnk_291089675759", url: "https://sandbox.asaas.com/c/291089675759", active: true });
    expect(await cliente().criarLink(LINK)).toEqual({ tipo: "criado", link: { id: "lnk_291089675759", url: "https://sandbox.asaas.com/c/291089675759" } });
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]).toMatchObject({ metodo: "POST", caminho: "/v3/paymentLinks" });
    expect(recebidos[0]?.cabecalhos.access_token).toBe(CHAVE);
    expect(recebidos[0]?.cabecalhos["user-agent"]).toBe("Ora5G-Plataforma/1.0");
    expect(recebidos[0]?.corpo).toEqual({
      name: "Pedido ABC234 na Ora 5G", billingType: "PIX", chargeType: "DETACHED", value: 79.9, endDate: "2026-11-25",
      externalReference: LINK.referencia, limit: 1, notificationEnabled: false,
      callback: { successUrl: "https://ora5g.com.br/loja/pedido?codigo=ABC234", autoRedirect: false },
    });
  });

  it("a recusa (4xx) para de vez; o 429 e a falta de conexão podem repetir; o 5xx, o tempo esgotado e a resposta fora da forma pedem procurar antes", async () => {
    responder = json(400, { errors: [{ code: "invalid_value", description: "Valor inválido" }] });
    expect(await cliente().criarLink(LINK)).toEqual({ tipo: "recusado", motivo: "a Asaas respondeu 400" });
    responder = json(429, { errors: [] });
    expect(await cliente().criarLink(LINK)).toEqual({ tipo: "falha", motivo: "a Asaas respondeu 429" });
    responder = json(500, {});
    expect(await cliente().criarLink(LINK)).toEqual({ tipo: "desconhecido", motivo: "a Asaas respondeu 500" });
    responder = json(200, { id: "lnk_1", url: "http://inseguro.invalid/c/1" });
    expect(await cliente().criarLink(LINK)).toEqual({ tipo: "desconhecido", motivo: "resposta da Asaas fora da forma" });
    responder = () => undefined;
    expect((await cliente(300).criarLink(LINK)).tipo).toBe("desconhecido");
    const fechado = createServer();
    await new Promise<void>((pronto) => fechado.listen(0, "127.0.0.1", pronto));
    const porta = (fechado.address() as AddressInfo).port;
    await new Promise((fim) => fechado.close(fim));
    const semConexao = new ClienteAsaas(transporteHttp(`http://127.0.0.1:${porta}/v3`, 2_000, "Asaas"), CHAVE);
    expect(await semConexao.criarLink(LINK)).toMatchObject({ tipo: "falha", motivo: expect.stringContaining("sem conexão com a Asaas") });
  });

  it("procura pelo identificador (o link removido não conta); desativa com active falso (o que a Asaas não acha conta como desativado)", async () => {
    responder = json(200, { object: "list", hasMore: false, data: [
      { id: "lnk_velho", url: "https://sandbox.asaas.com/c/1", externalReference: LINK.referencia, deleted: true },
      { id: "lnk_certo", url: "https://sandbox.asaas.com/c/2", externalReference: LINK.referencia, deleted: false },
    ] });
    expect(await cliente().procurarLink(LINK.referencia)).toEqual({ id: "lnk_certo", url: "https://sandbox.asaas.com/c/2" });
    expect(recebidos[0]).toMatchObject({ metodo: "GET", caminho: `/v3/paymentLinks?externalReference=${LINK.referencia}&limit=10` });
    responder = json(200, { object: "list", data: [] });
    expect(await cliente().procurarLink(LINK.referencia)).toBeNull();
    responder = json(503, {});
    expect(await cliente().procurarLink(LINK.referencia)).toBe("falha");
    responder = json(200, { id: "lnk_certo", active: false });
    expect(await cliente().desativarLink("lnk_certo")).toBe(true);
    expect(recebidos.at(-1)).toMatchObject({ metodo: "PUT", caminho: "/v3/paymentLinks/lnk_certo", corpo: { active: false } });
    responder = json(404, {});
    expect(await cliente().desativarLink("lnk_sumido")).toBe(true);
    responder = json(500, {});
    expect(await cliente().desativarLink("lnk_certo")).toBe(false);
    expect(await cliente().desativarLink("../x")).toBe(false);
  });
});

describe("o pagamento e o aviso (PAY-014a)", () => {
  it("consulta o pagamento pelo id do aviso, no formato comum; 404 é nulo; outra resposta é falha", async () => {
    responder = json(200, { object: "payment", id: "pay_1", status: "RECEIVED", value: 79.9, paymentLink: "lnk_291089675759", deleted: false });
    expect(await cliente().consultarPagamento("pay_1")).toEqual({ id_no_provedor: "pay_1", link: "lnk_291089675759", valor_centavos: 7_990, situacao: "pago",
      status: "RECEIVED", estornado_centavos: 0 });
    // AUD-f: o líquido e o estorno parcial vão para a conciliação; o estorno maior que o pagamento é desconhecido.
    responder = json(200, { object: "payment", id: "pay_1", status: "RECEIVED", value: 79.9, netValue: 78.91, paymentLink: "lnk_291089675759", deleted: false,
      refunds: [{ status: "DONE", value: 10 }] });
    expect(await cliente().consultarPagamento("pay_1")).toEqual({ id_no_provedor: "pay_1", link: "lnk_291089675759", valor_centavos: 7_990, situacao: "desconhecida",
      motivo: "estorno_parcial", status: "RECEIVED", liquido_centavos: 7_891, estornado_centavos: 1_000 });
    responder = json(200, { object: "payment", id: "pay_1", status: "RECEIVED", value: 79.9, paymentLink: "lnk_291089675759", refunds: [{ status: "DONE", value: 90 }] });
    expect(await cliente().consultarPagamento("pay_1")).toMatchObject({ situacao: "desconhecida", estornado_centavos: 0 });
    expect(recebidos[0]).toMatchObject({ metodo: "GET", caminho: "/v3/payments/pay_1" });
    responder = json(200, { object: "payment", id: "pay_1", status: "PENDING", value: 79.9, paymentLink: "lnk_291089675759", deleted: true });
    expect((await cliente().consultarPagamento("pay_1"))).toMatchObject({ situacao: "cancelado" });
    responder = json(404, {});
    expect(await cliente().consultarPagamento("pay_1")).toBeNull();
    for (const ruim of [{ id: "pay_2", status: "RECEIVED", value: 79.9, paymentLink: "lnk_1" }, { id: "pay_1", status: "RECEIVED", value: "79.9", paymentLink: "lnk_1" },
      { id: "pay_1", status: "RECEIVED", value: 79.9 }]) {
      responder = json(200, ruim);
      expect(await cliente().consultarPagamento("pay_1"), JSON.stringify(ruim)).toBe("falha");
    }
    expect(await cliente().consultarPagamento("../x")).toBeNull();
  });

  it("registra o aviso com o token, o e-mail, os eventos dos pagamentos e a entrega em ordem", async () => {
    responder = json(200, { id: "bbf67496-1379-4b6d-a348-fd5fa229f1c", name: "Ora 5G: pagamentos do site", hasAuthToken: true });
    const token = "token-ficticio-do-aviso-da-asaas-0123456789abcdef";
    expect(await cliente().registrarAviso({ url: "https://ora5g.com.br/api/pagamentos/asaas", token, email: "pagamentos@exemplo.invalid" }))
      .toEqual({ id: "bbf67496-1379-4b6d-a348-fd5fa229f1c" });
    expect(recebidos[0]).toMatchObject({ metodo: "POST", caminho: "/v3/webhooks" });
    expect(recebidos[0]?.corpo).toEqual({
      name: "Ora 5G: pagamentos do site", url: "https://ora5g.com.br/api/pagamentos/asaas", email: "pagamentos@exemplo.invalid", enabled: true,
      interrupted: false, apiVersion: 3, authToken: token, sendType: "SEQUENTIALLY", events: [...EVENTOS_DO_AVISO],
    });
    responder = json(400, {});
    expect(await cliente().registrarAviso({ url: "https://ora5g.com.br/api/pagamentos/asaas", token, email: "x@exemplo.invalid" })).toEqual({ falha: "a Asaas respondeu 400" });
  });
});

// PAY-015a (25/11/2026): o Pix pela Asaas no caixa: a chave Pix ativa, o QR estático com valor, as cobranças do QR e a
// exclusão, como a documentação oficial descreve (lida em 25/11). QR e cobranças FICTÍCIOS.
describe("o Pix do caixa na Asaas (PAY-015a)", () => {
  const IMAGEM = "iVBORw0KGgo".padEnd(400, "A");
  const COPIA = "00020126580014br.gov.bcb.pix0136ficticio-0000-4000-8000-0000000000005204000053039865802BR5925ORA5G6009CURITIBA6304ABCD";
  const QR = { referencia: "00000000-0000-4000-8000-0000000000q1", chavePix: "b6295ee1-f054-47d1-9e90-ee57b74f60d9", valorCentavos: 7_990,
    descricao: "Venda nº 12 na Ora 5G", validadeSegundos: 1_800 };

  it("a chave Pix ativa da conta: a primeira ACTIVE; sem nenhuma, nulo; sem resposta, falha", async () => {
    responder = json(200, { data: [{ id: "k1", key: "b6295ee1-f054-47d1-9e90-ee57b74f60d9", type: "EVP", status: "ACTIVE", canBeDeleted: true }] });
    expect(await cliente().chavePixAtiva()).toBe("b6295ee1-f054-47d1-9e90-ee57b74f60d9");
    expect(recebidos[0]).toMatchObject({ metodo: "GET", caminho: "/v3/pix/addressKeys?status=ACTIVE&limit=10" });
    expect(recebidos[0]?.cabecalhos.access_token).toBe(CHAVE);
    responder = json(200, { data: [{ id: "k2", key: "x", type: "EVP", status: "AWAITING_ACTIVATION" }] });
    expect(await cliente().chavePixAtiva()).toBeNull();
    responder = json(500, {});
    expect(await cliente().chavePixAtiva()).toBe("falha");
  });

  it("o QR estático: o valor em reais, um pagamento só, a validade e o nosso identificador; cada resposta no seu tipo", async () => {
    responder = json(200, { id: "9bea9bcd126b45c7939960f577be84d6", encodedImage: IMAGEM, payload: COPIA, allowsMultiplePayments: false,
      expirationDate: "2026-11-25 14:20:50", externalReference: QR.referencia, description: QR.descricao });
    expect(await cliente().criarQrEstatico(QR)).toEqual({ tipo: "criado", qr: { id: "9bea9bcd126b45c7939960f577be84d6", copiaECola: COPIA, imagem: IMAGEM } });
    expect(recebidos[0]).toMatchObject({ metodo: "POST", caminho: "/v3/pix/qrCodes/static", corpo: {
      addressKey: QR.chavePix, description: QR.descricao, value: 79.9, format: "ALL", expirationSeconds: 1_800, allowsMultiplePayments: false,
      externalReference: QR.referencia } });
    responder = json(400, { errors: [{ code: "invalid_value", description: "Valor inválido" }] });
    expect(await cliente().criarQrEstatico(QR)).toEqual({ tipo: "recusado", motivo: "a Asaas respondeu 400" });
    responder = json(429, {});
    expect(await cliente().criarQrEstatico(QR)).toEqual({ tipo: "falha", motivo: "a Asaas respondeu 429" });
    responder = json(502, {});
    expect(await cliente().criarQrEstatico(QR)).toEqual({ tipo: "desconhecido", motivo: "a Asaas respondeu 502" });
    responder = json(200, { id: "qr com espaço", encodedImage: IMAGEM, payload: COPIA });
    expect(await cliente().criarQrEstatico(QR)).toEqual({ tipo: "desconhecido", motivo: "resposta da Asaas fora da forma" });
  });

  it("as cobranças do QR (o filtro pixQrCodeId): paga, estornada, nenhuma (ou só pendente), e o fora do normal como desconhecida", async () => {
    const cobranca = (id: string, status: string, value = 79.9) => ({ object: "payment", id, status, value, billingType: "PIX", pixQrCodeId: "qr1", deleted: false });
    responder = json(200, { object: "list", hasMore: false, totalCount: 1, data: [cobranca("pay_1", "RECEIVED")] });
    expect(await cliente().cobrancasDoQr("qr1")).toEqual({ situacao: "pago", id_no_provedor: "pay_1", valor_centavos: 7_990 });
    expect(recebidos[0]).toMatchObject({ metodo: "GET", caminho: "/v3/payments?pixQrCodeId=qr1&limit=10" });
    responder = json(200, { data: [cobranca("pay_1", "REFUNDED")] });
    expect(await cliente().cobrancasDoQr("qr1")).toEqual({ situacao: "estornado", id_no_provedor: "pay_1", valor_centavos: 7_990 });
    responder = json(200, { data: [] });
    expect(await cliente().cobrancasDoQr("qr1")).toEqual({ situacao: "nenhum" });
    responder = json(200, { data: [cobranca("pay_1", "PENDING"), { ...cobranca("pay_9", "RECEIVED"), pixQrCodeId: "outro" }] });
    expect(await cliente().cobrancasDoQr("qr1")).toEqual({ situacao: "nenhum" });
    responder = json(200, { data: [cobranca("pay_1", "RECEIVED"), cobranca("pay_2", "RECEIVED")] });
    expect(await cliente().cobrancasDoQr("qr1")).toEqual({ situacao: "desconhecida" });
    responder = json(200, { data: [cobranca("pay_1", "CHARGEBACK_REQUESTED")] });
    expect(await cliente().cobrancasDoQr("qr1")).toEqual({ situacao: "desconhecida" });
    responder = json(503, {});
    expect(await cliente().cobrancasDoQr("qr1")).toBe("falha");
  });

  it("excluir o QR: o DELETE; o que a Asaas não acha conta como excluído", async () => {
    responder = json(200, { id: "9bea9bcd126b45c7939960f577be84d6", deleted: true });
    expect(await cliente().excluirQr("9bea9bcd126b45c7939960f577be84d6")).toBe(true);
    expect(recebidos[0]).toMatchObject({ metodo: "DELETE", caminho: "/v3/pix/qrCodes/static/9bea9bcd126b45c7939960f577be84d6" });
    responder = json(404, {});
    expect(await cliente().excluirQr("qr2")).toBe(true);
    responder = json(500, {});
    expect(await cliente().excluirQr("qr3")).toBe(false);
    expect(await cliente().excluirQr("qr com espaço")).toBe(false);
  });
});

describe("o cartão do caixa na Asaas (PAY-015b)", () => {
  it("o link no cartão: avulso, uma venda só, sem aviso ao cliente e com o nosso identificador; a resposta fora da forma é desconhecida", async () => {
    responder = json(200, { id: "lnk_cartao_1", url: "https://sandbox.asaas.com/c/lnk_cartao_1", active: true });
    expect(await cliente().criarLinkDoCartao({ referencia: "00000000-0000-4000-8000-0000000000c1", nome: "Venda nº 12 na Ora 5G", valorCentavos: 7_990, venceEm: "2026-11-26" }))
      .toEqual({ tipo: "criado", link: { id: "lnk_cartao_1", url: "https://sandbox.asaas.com/c/lnk_cartao_1" } });
    expect(recebidos[0]).toMatchObject({ metodo: "POST", caminho: "/v3/paymentLinks", corpo: {
      name: "Venda nº 12 na Ora 5G", billingType: "CREDIT_CARD", chargeType: "DETACHED", value: 79.9, endDate: "2026-11-26",
      externalReference: "00000000-0000-4000-8000-0000000000c1", limit: 1, notificationEnabled: false } });
    expect((recebidos[0]?.corpo as Record<string, unknown>).callback).toBeUndefined();
    responder = json(200, { id: "lnk_cartao_2", url: "http://sem-https.invalid/x" });
    expect((await cliente().criarLinkDoCartao({ referencia: "r", nome: "n", valorCentavos: 100, venceEm: "2026-11-26" })).tipo).toBe("desconhecido");
    responder = json(400, { errors: [{ code: "invalid_value" }] });
    expect((await cliente().criarLinkDoCartao({ referencia: "r", nome: "n", valorCentavos: 100, venceEm: "2026-11-26" })).tipo).toBe("recusado");
  });

  it("as cobranças de cartão desde o dia: página por página, só as de link, sem as removidas; do cartão, só o final e a bandeira", async () => {
    let paginas = 0;
    responder = (req, res) => {
      paginas += 1;
      const primeira = /offset=0$/.test(req.url ?? "");
      json(200, { object: "list", hasMore: primeira, data: primeira
        ? [{ id: "pay_1", status: "CONFIRMED", value: 79.9, paymentLink: "lnk_1", creditCard: { creditCardNumber: "8829", creditCardBrand: "VISA", creditCardToken: "tok" } },
          { id: "pay_2", status: "PENDING", value: 10, paymentLink: null },
          { id: "pay_3", status: "RECEIVED", value: 10, paymentLink: "lnk_3", deleted: true }]
        : [{ id: "pay_4", status: "REFUNDED", value: 5, paymentLink: "lnk_4", creditCard: { creditCardNumber: "12345", creditCardBrand: "visa" } }] })(req, res);
    };
    expect(await cliente().cobrancasDeCartaoDesde("2026-11-25")).toEqual([
      { id: "pay_1", link: "lnk_1", situacao: "pago", valor_centavos: 7_990, final: "8829", bandeira: "VISA", assinatura: null },
      { id: "pay_4", link: "lnk_4", situacao: "estornado", valor_centavos: 500, final: null, bandeira: null, assinatura: null },
    ]);
    expect(paginas).toBe(2);
    expect(recebidos.map((r) => r.caminho)).toEqual([
      "/v3/payments?billingType=CREDIT_CARD&dateCreated%5Bge%5D=2026-11-25&limit=100&offset=0",
      "/v3/payments?billingType=CREDIT_CARD&dateCreated%5Bge%5D=2026-11-25&limit=100&offset=100",
    ]);
    // Mais de 5 páginas: falha (pela metade esconderia o pago); o dia fora da forma nem pergunta.
    responder = json(200, { object: "list", hasMore: true, data: [] });
    expect(await cliente().cobrancasDeCartaoDesde("2026-11-25")).toBe("falha");
    recebidos.length = 0;
    expect(await cliente().cobrancasDeCartaoDesde("25/11/2026")).toBe("falha");
    expect(recebidos).toEqual([]);
    responder = json(500, {});
    expect(await cliente().cobrancasDeCartaoDesde("2026-11-25")).toBe("falha");
  });
});

describe("a assinatura no cartão na Asaas (PAY-015c)", () => {
  it("o link recorrente: só no cartão, com o ciclo, uma assinatura só, sem aviso ao cliente e com o nosso identificador", async () => {
    responder = json(200, { id: "lnk_rec_1", url: "https://sandbox.asaas.com/c/lnk_rec_1", active: true });
    expect(await cliente().criarLinkRecorrente({ referencia: "00000000-0000-4000-8000-0000000000a1", nome: "Plano 10 GB (assinatura nº 3 na Ora 5G)",
      valorCentavos: 5_490, ciclo: "MONTHLY", venceEm: "2026-11-29" })).toEqual({ tipo: "criado", link: { id: "lnk_rec_1", url: "https://sandbox.asaas.com/c/lnk_rec_1" } });
    expect(recebidos[0]).toMatchObject({ metodo: "POST", caminho: "/v3/paymentLinks", corpo: {
      billingType: "CREDIT_CARD", chargeType: "RECURRENT", subscriptionCycle: "MONTHLY", value: 54.9, endDate: "2026-11-29",
      externalReference: "00000000-0000-4000-8000-0000000000a1", limit: 1, notificationEnabled: false } });
  });

  it("a assinatura: a situação, o valor, o ciclo, a próxima cobrança e o link; 404 é nulo; fora da forma é falha", async () => {
    responder = json(200, { object: "subscription", id: "sub_1", status: "ACTIVE", value: 54.9, cycle: "MONTHLY", nextDueDate: "2026-12-25",
      paymentLink: "lnk_rec_1", deleted: false });
    expect(await cliente().assinatura("sub_1")).toEqual({ id: "sub_1", status: "ACTIVE", removida: false, valor_centavos: 5_490, ciclo: "MONTHLY",
      proxima_cobranca: "2026-12-25", link: "lnk_rec_1" });
    expect(recebidos.at(-1)).toMatchObject({ metodo: "GET", caminho: "/v3/subscriptions/sub_1" });
    responder = json(404, {});
    expect(await cliente().assinatura("sub_1")).toBeNull();
    responder = json(200, { id: "sub_1", status: "PAUSED" });
    expect(await cliente().assinatura("sub_1")).toBe("falha");
    expect(await cliente().assinatura("sub com espaço")).toBeNull();
  });

  it("as cobranças da assinatura, página por página: a situação (o vencido à parte), o vencimento, o dia pago e o cartão; remover a assinatura", async () => {
    responder = (req, res) => json(200, { object: "list", hasMore: !(req.url ?? "").includes("offset"), data: (req.url ?? "").includes("offset")
      ? [{ id: "pay_2", status: "OVERDUE", value: 54.9, dueDate: "2026-12-25" }]
      : [{ id: "pay_1", status: "CONFIRMED", value: 54.9, dueDate: "2026-11-25", clientPaymentDate: "2026-11-25",
        creditCard: { creditCardNumber: "8829", creditCardBrand: "VISA" } }, { id: "pay_x", status: "PENDING", value: 54.9, deleted: true }] })(req, res);
    expect(await cliente().cobrancasDaAssinatura("sub_1")).toEqual([
      { id: "pay_1", situacao: "pago", valor_centavos: 5_490, vencimento: "2026-11-25", pago_em: "2026-11-25", final: "8829", bandeira: "VISA" },
      { id: "pay_2", situacao: "vencido", valor_centavos: 5_490, vencimento: "2026-12-25", pago_em: null, final: null, bandeira: null },
    ]);
    expect(recebidos.map((r) => r.caminho)).toEqual(["/v3/subscriptions/sub_1/payments", "/v3/subscriptions/sub_1/payments?offset=10"]);
    responder = json(200, {});
    expect(await cliente().removerAssinatura("sub_1")).toBe(true);
    expect(recebidos.at(-1)).toMatchObject({ metodo: "DELETE", caminho: "/v3/subscriptions/sub_1" });
    responder = json(500, {});
    expect(await cliente().removerAssinatura("sub_1")).toBe(false);
  });
});

