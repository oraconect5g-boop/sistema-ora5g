// O cliente da Asaas (lote PAY-014a) contra um servidor HTTP local (127.0.0.1) no papel da Asaas, com o transporte de
// verdade: os caminhos, os cabeçalhos, o corpo e cada tipo de resposta, como a documentação oficial descreve. Chave, links e
// pagamentos FICTÍCIOS; nada sai da máquina.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { transporteHttp } from "../connect/transporte.ts";
import { centavosDe, chaveDoAmbiente, ClienteAsaas, EVENTOS_DO_AVISO, situacaoDaAsaas } from "./asaas.ts";

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
    expect(await cliente().consultarPagamento("pay_1")).toEqual({ id_no_provedor: "pay_1", link: "lnk_291089675759", valor_centavos: 7_990, situacao: "pago" });
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
