// O pagamento pelo site de ponta a ponta, SEM credencial real (lote PAY-014a): o banco com todas as migrations (PGlite), o
// worker de verdade (o cliente da Asaas e o transporte HTTP) e um servidor local no papel da Asaas, que responde como a
// documentação oficial descreve. O visitante pede para pagar; o worker registra o aviso, cria o link; o aviso chega com o
// token que a "Asaas" recebeu; o worker pergunta de novo e o banco confirma. Prova o fluxo; não prova a Asaas (isso é o
// ensaio no sandbox, com a chave de teste).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { PGlite } from "@electric-sql/pglite";
import { comoUsuario, criarBanco } from "@ora5g/banco/src/banco-de-teste.ts";
import { ids, montarCenario } from "@ora5g/banco/src/cenario.ts";
import { cat, montarCatalogo } from "@ora5g/banco/src/cenario-catalogo.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transporteHttp } from "../connect/transporte.ts";
import { ClienteAsaas, type ConsultaDaAsaas } from "./asaas.ts";
import { conferirChavePix, rodadaDoCaixa, type BancoDoCaixa } from "./caixa.ts";
import { rodadaDoCartao, situacaoDoCartao, type BancoDoCartao } from "./cartao.ts";
import { rodadaDasAssinaturas, type BancoDasAssinaturas } from "./assinaturas.ts";
import { ligarSeFaltar, rodada, type BancoDosPagamentos } from "./processar.ts";

let db: PGlite;
let servidor: Server;
let base = "";
// O que a "Asaas" guardou: o token do aviso, os links e os pagamentos; PAY-015a: os QR do caixa e as cobranças de cada um.
const asaas = { token: "", links: new Map<string, { externalReference: string; value: number; active: boolean; billingType?: string; limit?: number; chargeType?: string;
  subscriptionCycle?: string }>(), pagamentos: new Map<string, { status: string; value: number; paymentLink: string }>(),
  qrs: new Map<string, { externalReference: string; value: number; allowsMultiplePayments: boolean; expirationSeconds: number; excluido: boolean }>(),
  cobrancasDoQr: new Map<string, { id: string; status: string; value: number }[]>(),
  // PAY-015b: as cobranças de cartão (com o link que as gerou) e o dia pedido na última leitura.
  cobrancasDeCartao: [] as { id: string; status: string; value: number; paymentLink: string; creditCard: { creditCardNumber: string; creditCardBrand: string };
    subscription?: string }[],
  diaLido: "",
  // PAY-015c: as assinaturas e as cobranças de cada uma.
  assinaturas: new Map<string, { status: string; value: number; cycle: string; nextDueDate: string; paymentLink: string; deleted: boolean }>(),
  cobrancasDaAssinatura: new Map<string, { id: string; status: string; value: number; dueDate: string; clientPaymentDate?: string;
    creditCard?: { creditCardNumber: string; creditCardBrand: string } }[]>() };
const IMAGEM_DO_QR = "iVBORw0KGgo".padEnd(400, "A");

beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  await db.query("update public.produtos set publicar_online = true where id = any($1)", [[cat.produtoAparelho, cat.produtoCapa]]);
  servidor = createServer((req, res) => {
    let texto = "";
    req.on("data", (c: Buffer) => { texto += c.toString("utf8"); });
    req.on("end", () => {
      const corpo = texto ? JSON.parse(texto) as Record<string, unknown> : {};
      const json = (status: number, dados: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(dados)); };
      if (req.headers.access_token !== "$aact_hmlg_000000000000ChaveFicticiaDoTeste") return json(401, { errors: [{ code: "invalid_access_token" }] });
      const caminho = req.url ?? "";
      if (req.method === "POST" && caminho === "/v3/webhooks") {
        asaas.token = String(corpo.authToken);
        return json(200, { id: "bbf67496-1379-4b6d-a348-fd5fa229f1c", hasAuthToken: true });
      }
      if (req.method === "POST" && caminho === "/v3/paymentLinks") {
        const id = `lnk${asaas.links.size + 1}`;
        asaas.links.set(id, { externalReference: String(corpo.externalReference), value: Number(corpo.value), active: true, billingType: String(corpo.billingType),
          limit: Number(corpo.limit), chargeType: String(corpo.chargeType), subscriptionCycle: corpo.subscriptionCycle ? String(corpo.subscriptionCycle) : undefined });
        return json(200, { id, url: `https://sandbox.asaas.com/c/${id}`, active: true });
      }
      if (req.method === "GET" && caminho === "/v3/pix/addressKeys?status=ACTIVE&limit=10") {
        return json(200, { data: [{ id: "k1", key: "chave-ficticia-evp", type: "EVP", status: "ACTIVE" }] });
      }
      if (req.method === "POST" && caminho === "/v3/pix/qrCodes/static") {
        const id = `qrcaixa${asaas.qrs.size + 1}`;
        asaas.qrs.set(id, { externalReference: String(corpo.externalReference), value: Number(corpo.value), allowsMultiplePayments: corpo.allowsMultiplePayments === true,
          expirationSeconds: Number(corpo.expirationSeconds), excluido: false });
        return json(200, { id, encodedImage: IMAGEM_DO_QR, payload: `00020126580014br.gov.bcb.pix-ficticio-${id}`, allowsMultiplePayments: false });
      }
      const doQr = /^\/v3\/payments\?pixQrCodeId=([A-Za-z0-9_]+)&limit=10$/.exec(caminho);
      if (req.method === "GET" && doQr) {
        const qr = doQr[1] as string;
        return json(200, { object: "list", data: (asaas.cobrancasDoQr.get(qr) ?? []).map((x) => ({ object: "payment", ...x, pixQrCodeId: qr, deleted: false })) });
      }
      const excluir = /^\/v3\/pix\/qrCodes\/static\/([A-Za-z0-9_]+)$/.exec(caminho);
      if (req.method === "DELETE" && excluir) {
        const qr = asaas.qrs.get(excluir[1] as string);
        if (!qr) return json(404, {});
        qr.excluido = true;
        return json(200, { id: excluir[1], deleted: true });
      }
      const doCartao = /^\/v3\/payments\?billingType=CREDIT_CARD&dateCreated%5Bge%5D=(\d{4}-\d{2}-\d{2})&limit=100&offset=0$/.exec(caminho);
      if (req.method === "GET" && doCartao) {
        asaas.diaLido = doCartao[1] as string;
        return json(200, { object: "list", hasMore: false, totalCount: asaas.cobrancasDeCartao.length, limit: 100, offset: 0,
          data: asaas.cobrancasDeCartao.map((x) => ({ object: "payment", billingType: "CREDIT_CARD", deleted: false, ...x })) });
      }
      const daAssinatura = /^\/v3\/subscriptions\/([A-Za-z0-9_]+)(\/payments)?$/.exec(caminho);
      if (daAssinatura) {
        const sub = daAssinatura[1] as string;
        const a = asaas.assinaturas.get(sub);
        if (!a) return json(404, {});
        if (req.method === "DELETE") {
          a.deleted = true;
          return json(200, { deleted: true, id: sub });
        }
        if (req.method === "GET" && daAssinatura[2]) {
          return json(200, { object: "list", hasMore: false, data: (asaas.cobrancasDaAssinatura.get(sub) ?? []).map((x) => ({ object: "payment", subscription: sub, deleted: false, ...x })) });
        }
        if (req.method === "GET") return json(200, { object: "subscription", id: sub, billingType: "CREDIT_CARD", ...a });
      }
      const linkAlterado = /^\/v3\/paymentLinks\/([A-Za-z0-9_]+)$/.exec(caminho);
      if (req.method === "PUT" && linkAlterado) {
        const l = asaas.links.get(linkAlterado[1] as string);
        if (!l) return json(404, {});
        l.active = corpo.active !== false;
        return json(200, { id: linkAlterado[1], active: l.active });
      }
      const pagamento = /^\/v3\/payments\/([A-Za-z0-9_]+)$/.exec(caminho);
      if (req.method === "GET" && pagamento) {
        const p = asaas.pagamentos.get(pagamento[1] as string);
        return p ? json(200, { object: "payment", id: pagamento[1], ...p, deleted: false }) : json(404, {});
      }
      return json(404, {});
    });
  });
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/v3`;
});
afterAll(async () => {
  await new Promise((fim) => servidor.close(fim));
  await db.close();
});

// As funções do worker no banco de teste, com o papel da chave secreta do servidor.
async function servico<T>(sql: string, params: unknown[] = []): Promise<T> {
  await db.exec("set role service_role");
  try { return (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T; } finally { await db.exec("reset role"); }
}
const banco: BancoDosPagamentos = {
  configuracao: () => servico("select public.pagamento_configuracao() as v"),
  ligar: async (ambiente, webhook, impressao) => { await servico("select public.pagamento_ligar($1, $2, $3) as v", [ambiente, webhook, impressao]); },
  aCriar: (limite) => servico("select public.pagamentos_a_criar($1) as v", [limite]),
  linkRegistrado: (id, link, url) => servico("select public.pagamento_link_registrar($1, $2, $3) as v", [id, link, url]),
  criacaoFalhou: (id, motivo, definitiva) => servico("select public.pagamento_criacao_falhou($1, $2, $3) as v", [id, motivo, definitiva]),
  avisosAProcessar: (limite) => servico("select public.pagamento_avisos_a_processar($1) as v", [limite]),
  avisoConcluir: (aviso, resultado) => servico("select public.pagamento_aviso_concluir($1, $2) as v", [aviso, resultado]),
  consultaAplicar: (aviso, consulta: ConsultaDaAsaas) => servico("select public.pagamento_consulta_aplicar($1, $2::jsonb) as v", [aviso, JSON.stringify(consulta)]),
  aDesativar: (limite) => servico("select public.pagamentos_a_desativar($1) as v", [limite]),
  linkDesativado: (id) => servico("select public.pagamento_link_desativado($1) as v", [id]),
};
const visitante = <T>(sql: string, params: unknown[]) => comoUsuario(db, null, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
type Visao = { codigo: string; situacao: string; pagamento: { disponivel: boolean; situacao: string | null; link: string | null } };

describe("de ponta a ponta, com o banco de teste e uma Asaas de mentira (PAY-014a)", () => {
  it("o visitante pede, o worker cria o link, o aviso chega com o token, a reconsulta confirma e o pedido fica guardado; o token errado não passa", async () => {
    const cliente = new ClienteAsaas(transporteHttp(base, 2_000, "Asaas"), "$aact_hmlg_000000000000ChaveFicticiaDoTeste");
    expect(await ligarSeFaltar(banco, cliente, { ambiente: "sandbox", urlDoAviso: "https://ora5g.com.br/api/pagamentos/asaas", email: "pagamentos@exemplo.invalid" })).toBe("ligado");
    expect(asaas.token).toMatch(/^[A-Za-z0-9_-]{48}$/);
    expect(await ligarSeFaltar(banco, cliente, { ambiente: "sandbox", urlDoAviso: "https://ora5g.com.br/api/pagamentos/asaas", email: "pagamentos@exemplo.invalid" })).toBe("ja_ligado");

    const whatsapp = "41987659901";
    const pedido = await visitante<Visao>("select public.loja_pedir($1, $2, $3::jsonb, 'Cliente do Site', $4, 'ponta:pagamento:1') as v",
      [ids.organizacao, ids.lojaA, JSON.stringify([{ variante: cat.capa }]), whatsapp]);
    expect(pedido.pagamento).toMatchObject({ disponivel: true, situacao: null });
    expect((await visitante<Visao>("select public.loja_pagamento_pedir($1, $2, $3) as v", [ids.organizacao, pedido.codigo, whatsapp])).pagamento.situacao).toBe("criando");

    expect(await rodada(banco, cliente, "https://ora5g.com.br")).toMatchObject({ criados: 1, falhas: 0 });
    const criados = [...asaas.links.entries()];
    expect(criados).toHaveLength(1);
    const [linkId, link] = criados[0] as [string, { externalReference: string; value: number; active: boolean }];
    expect(link.value).toBe(79);
    const visto = await visitante<Visao>("select public.loja_pedido_consultar($1, $2, $3) as v", [ids.organizacao, pedido.codigo, whatsapp]);
    expect(visto.pagamento).toMatchObject({ situacao: "aguardando", link: `https://sandbox.asaas.com/c/${linkId}` });

    // A "Asaas" recebe o pagamento e avisa (o site repassa o aviso ao banco, com o cabeçalho que veio).
    asaas.pagamentos.set("pay_ponta1", { status: "RECEIVED", value: 79, paymentLink: linkId });
    const AVISO = JSON.stringify({ id: "evt_ponta1", evento: "PAYMENT_RECEIVED", pagamento: "pay_ponta1", link: linkId, valor: 79, situacao: "RECEIVED" });
    // Fora de transação, a recusa não deixa nada pela metade.
    const recusa = await comoUsuario(db, null, async () => {
      try { await db.query("select public.pagamento_aviso_receber('token-errado-com-tamanho-suficiente-0000000000', $1::jsonb)", [AVISO]); return null; }
      catch (e) { return (e as { code?: string }).code; }
    });
    expect(recusa).toBe("42501");
    expect(await visitante<string>("select public.pagamento_aviso_receber($1, $2::jsonb) as v", [asaas.token, AVISO])).toBe("guardado");

    expect(await rodada(banco, cliente, "https://ora5g.com.br")).toMatchObject({ avisos: 1, confirmados: 1 });
    const pago = await visitante<Visao & { expira_em: string }>("select public.loja_pedido_consultar($1, $2, $3) as v", [ids.organizacao, pedido.codigo, whatsapp]);
    expect(pago.pagamento).toMatchObject({ situacao: "pago", link: null });
    expect(Date.parse(pago.expira_em)).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect(await rodada(banco, cliente, "https://ora5g.com.br")).toMatchObject({ criados: 0, avisos: 0, desativados: 0 });
  });

  it("o Pix do caixa (PAY-015a): a vendedora pede o QR, o worker cria na Asaas, o cliente paga, o worker confere e a venda conclui; o desistido sai da Asaas", async () => {
    const cliente = new ClienteAsaas(transporteHttp(base, 2_000, "Asaas"), "$aact_hmlg_000000000000ChaveFicticiaDoTeste");
    const doCaixa: BancoDoCaixa = {
      caixaSituacao: (pronto, motivo) => servico("select public.caixa_pix_situacao($1, $2) as v", [pronto, motivo]),
      caixaACriar: (limite) => servico("select public.caixa_pix_a_criar($1) as v", [limite]),
      caixaQrRegistrar: (pix, qr, copia, imagem, expira) => servico("select public.caixa_pix_qr_registrar($1, $2, $3, $4, $5) as v", [pix, qr, copia, imagem, expira]),
      caixaCriacaoFalhou: (pix, motivo, definitiva) => servico("select public.caixa_pix_criacao_falhou($1, $2, $3) as v", [pix, motivo, definitiva]),
      caixaAConferir: (limite) => servico("select public.caixa_pix_a_conferir($1) as v", [limite]),
      caixaConsultaAplicar: (pix, consulta) => servico("select public.caixa_pix_consulta_aplicar($1, $2::jsonb) as v", [pix, JSON.stringify(consulta)]),
      caixaAExcluir: (limite) => servico("select public.caixa_pix_a_excluir($1) as v", [limite]),
      caixaQrExcluido: (pix) => servico("select public.caixa_pix_qr_excluido($1) as v", [pix]),
    };
    const ana = { usuario: ids.vendedorA, sessao: "4e600000-0000-4000-8000-000000000001" };
    await comoUsuario(db, ana, () => db.query("select public.selecionar_unidade($1)", [ids.lojaA]));
    const comoAna = <T>(sql: string, params: unknown[] = []) => comoUsuario(db, ana, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
    await comoAna("select public.abrir_caixa(10000, 'ponta:caixa:1') as v");
    const venda = await comoAna<string>("select public.criar_venda('ponta:venda:1') as v");
    await comoAna("select public.adicionar_item($1, $2, null, 1, 'ponta:item:1') as v", [venda, cat.capa]);

    expect(await conferirChavePix(doCaixa, cliente)).toBe("chave-ficticia-evp");
    const { id } = await comoAna<{ id: string }>("select public.caixa_pix_pedir($1, 7900, 'ponta:pix:1') as v", [venda]);
    expect(await rodadaDoCaixa(doCaixa, cliente, "chave-ficticia-evp")).toMatchObject({ qr_criados: 1, qr_conferidos: 1, qr_pagos: 0 });
    expect([...asaas.qrs.values()]).toEqual([{ externalReference: id, value: 79, allowsMultiplePayments: false, expirationSeconds: 1_800, excluido: false }]);
    const tela = await comoAna<{ pix: { situacao: string; copia_e_cola: string; imagem: string }[] }>("select public.caixa_pix_da_venda($1) as v", [venda]);
    expect(tela.pix).toMatchObject([{ situacao: "aguardando", copia_e_cola: "00020126580014br.gov.bcb.pix-ficticio-qrcaixa1", imagem: IMAGEM_DO_QR }]);

    // O cliente paga: a "Asaas" cria a cobrança do QR; na rodada seguinte (3 segundos depois), o worker confere e confirma.
    asaas.cobrancasDoQr.set("qrcaixa1", [{ id: "pay_caixa_1", status: "RECEIVED", value: 79 }]);
    await db.query("update public.caixa_pix set conferido_em = now() - interval '5 seconds' where id = $1", [id]);
    expect(await rodadaDoCaixa(doCaixa, cliente, "chave-ficticia-evp")).toMatchObject({ qr_pagos: 1 });
    expect(await comoAna<{ pago_no_pix: number; total: number }>("select public.concluir_venda($1, '[]'::jsonb, '{}'::jsonb, 'ponta:concluir:1') as v", [venda]))
      .toMatchObject({ total: 7_900, pago_no_pix: 7_900 });

    // A vendedora desiste de outro QR: o worker confere que ninguém pagou e exclui o QR na Asaas.
    const outra = await comoAna<string>("select public.criar_venda('ponta:venda:2') as v");
    await comoAna("select public.adicionar_item($1, $2, null, 1, 'ponta:item:2') as v", [outra, cat.capa]);
    const segundo = await comoAna<{ id: string }>("select public.caixa_pix_pedir($1, 7900, 'ponta:pix:2') as v", [outra]);
    await rodadaDoCaixa(doCaixa, cliente, "chave-ficticia-evp");
    expect(await comoAna("select public.caixa_pix_cancelar($1) as v", [segundo.id])).toBe("cancelando");
    await db.query("update public.caixa_pix set conferido_em = now() - interval '5 seconds' where id = $1", [segundo.id]);
    expect(await rodadaDoCaixa(doCaixa, cliente, "chave-ficticia-evp")).toMatchObject({ qr_excluidos: 1 });
    expect(asaas.qrs.get("qrcaixa2")?.excluido).toBe(true);
    expect((await db.query<{ situacao: string }>("select situacao from public.caixa_pix where id = $1", [segundo.id])).rows[0]?.situacao).toBe("cancelado");
  });

  it("o cartão do caixa (PAY-015b): a vendedora pede o link, o worker cria na Asaas, o cliente paga no cartão, o worker acha a cobrança pelo link e a venda conclui; o desistido é desativado", async () => {
    const cliente = new ClienteAsaas(transporteHttp(base, 2_000, "Asaas"), "$aact_hmlg_000000000000ChaveFicticiaDoTeste");
    const doCartao: BancoDoCartao = {
      cartaoSituacao: (pronto, motivo) => servico("select public.caixa_cartao_situacao($1, $2) as v", [pronto, motivo]),
      cartaoACriar: (limite) => servico("select public.caixa_cartao_a_criar($1) as v", [limite]),
      cartaoLinkRegistrar: (cartao, link, url, expira) => servico("select public.caixa_cartao_link_registrar($1, $2, $3, $4) as v", [cartao, link, url, expira]),
      cartaoCriacaoFalhou: (cartao, motivo, definitiva) => servico("select public.caixa_cartao_criacao_falhou($1, $2, $3) as v", [cartao, motivo, definitiva]),
      cartaoAConferir: (limite) => servico("select public.caixa_cartao_a_conferir($1) as v", [limite]),
      cartaoConsultaAplicar: (cartao, consulta) => servico("select public.caixa_cartao_consulta_aplicar($1, $2::jsonb) as v", [cartao, JSON.stringify(consulta)]),
      cartaoADesativar: (limite) => servico("select public.caixa_cartao_a_desativar($1) as v", [limite]),
      cartaoLinkDesativado: (cartao) => servico("select public.caixa_cartao_link_desativado($1) as v", [cartao]),
    };
    const ana = { usuario: ids.vendedorA, sessao: "4e600000-0000-4000-8000-000000000002" };
    await comoUsuario(db, ana, () => db.query("select public.selecionar_unidade($1)", [ids.lojaA]));
    const comoAna = <T>(sql: string, params: unknown[] = []) => comoUsuario(db, ana, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
    const venda = await comoAna<string>("select public.criar_venda('ponta:cartao:venda:1') as v");
    await comoAna("select public.adicionar_item($1, $2, null, 1, 'ponta:cartao:item:1') as v", [venda, cat.capa]);

    expect(await situacaoDoCartao(doCartao, true)).toBe(true);
    const { id } = await comoAna<{ id: string }>("select public.caixa_cartao_pedir($1, 7900, 'ponta:cartao:1') as v", [venda]);
    expect(await rodadaDoCartao(doCartao, cliente)).toMatchObject({ links_criados: 1, links_conferidos: 1, links_pagos: 0 });
    const [linkId, link] = [...asaas.links.entries()].find(([, l]) => l.externalReference === id) ?? [];
    expect(link).toMatchObject({ value: 79, active: true, billingType: "CREDIT_CARD", limit: 1 });
    expect(asaas.diaLido).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const tela = await comoAna<{ cartoes: { situacao: string; link_url: string }[] }>("select public.caixa_cartao_da_venda($1) as v", [venda]);
    expect(tela.cartoes).toMatchObject([{ situacao: "aguardando", link_url: `https://sandbox.asaas.com/c/${linkId}` }]);

    // O cliente paga no cartão: a "Asaas" cria a cobrança com o link; na rodada seguinte, o worker acha e confirma.
    asaas.cobrancasDeCartao.push({ id: "pay_cartao_1", status: "CONFIRMED", value: 79, paymentLink: linkId as string,
      creditCard: { creditCardNumber: "8829", creditCardBrand: "VISA" } });
    await db.query("update public.caixa_cartao set conferido_em = now() - interval '6 seconds' where id = $1", [id]);
    expect(await rodadaDoCartao(doCartao, cliente)).toMatchObject({ links_pagos: 1 });
    expect((await db.query<{ cartao_final: string; cartao_bandeira: string }>("select cartao_final, cartao_bandeira from public.caixa_cartao where id = $1", [id])).rows[0])
      .toEqual({ cartao_final: "8829", cartao_bandeira: "VISA" });
    expect(await comoAna<{ pago_no_cartao: number; total: number }>("select public.concluir_venda($1, '[]'::jsonb, '{}'::jsonb, 'ponta:cartao:concluir:1') as v", [venda]))
      .toMatchObject({ total: 7_900, pago_no_cartao: 7_900 });

    // A vendedora desiste de outro link: o worker confere que ninguém pagou e desativa o link na Asaas.
    const outra = await comoAna<string>("select public.criar_venda('ponta:cartao:venda:2') as v");
    await comoAna("select public.adicionar_item($1, $2, null, 1, 'ponta:cartao:item:2') as v", [outra, cat.capa]);
    const segundo = await comoAna<{ id: string }>("select public.caixa_cartao_pedir($1, 7900, 'ponta:cartao:2') as v", [outra]);
    await rodadaDoCartao(doCartao, cliente);
    expect(await comoAna("select public.caixa_cartao_cancelar($1) as v", [segundo.id])).toBe("cancelando");
    await db.query("update public.caixa_cartao set conferido_em = now() - interval '6 seconds' where id = $1", [segundo.id]);
    expect(await rodadaDoCartao(doCartao, cliente)).toMatchObject({ links_desativados: 1 });
    const [, segundoLink] = [...asaas.links.entries()].find(([, l]) => l.externalReference === segundo.id) ?? [];
    expect(segundoLink?.active).toBe(false);
    expect((await db.query<{ situacao: string }>("select situacao from public.caixa_cartao where id = $1", [segundo.id])).rows[0]?.situacao).toBe("cancelado");
  });

  it("a assinatura no cartão (PAY-015c): a loja pede, o worker cria o link recorrente, o cliente cadastra o cartão, o worker acha a assinatura pela primeira cobrança, guarda as cobranças e a remove na Asaas quando a loja cancela", async () => {
    const cliente = new ClienteAsaas(transporteHttp(base, 2_000, "Asaas"), "$aact_hmlg_000000000000ChaveFicticiaDoTeste");
    const dasAssinaturas: BancoDasAssinaturas = {
      assinaturasACriar: (limite) => servico("select public.assinaturas_a_criar($1) as v", [limite]),
      assinaturaLinkRegistrar: (a, link, url, expira) => servico("select public.assinatura_link_registrar($1, $2, $3, $4) as v", [a, link, url, expira]),
      assinaturaCriacaoFalhou: (a, motivo, definitiva) => servico("select public.assinatura_criacao_falhou($1, $2, $3) as v", [a, motivo, definitiva]),
      assinaturasAConferir: (limite) => servico("select public.assinaturas_a_conferir($1) as v", [limite]),
      assinaturaConsultaAplicar: (a, consulta) => servico("select public.assinatura_consulta_aplicar($1, $2::jsonb) as v", [a, JSON.stringify(consulta)]),
      assinaturasACancelar: (limite) => servico("select public.assinaturas_a_cancelar($1) as v", [limite]),
      assinaturaCanceladaNaAsaas: (a) => servico("select public.assinatura_cancelada_na_asaas($1) as v", [a]),
    };
    const ana = { usuario: ids.vendedorA, sessao: "4e600000-0000-4000-8000-000000000003" };
    await comoUsuario(db, ana, () => db.query("select public.selecionar_unidade($1)", [ids.lojaA]));
    const comoAna = <T>(sql: string, params: unknown[] = []) => comoUsuario(db, ana, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
    const clienteDaRede = (await comoAna<{ id: string }>("select public.cliente_salvar(null, $1::jsonb, null, 'ponta:assinatura:cliente') as v",
      [JSON.stringify({ tipo: "pessoa_fisica", nome: "Cliente Fictício da Ponta", telefone: "41987650188" })])).id;
    await servico("select public.caixa_cartao_situacao(true, null) as v");
    const { id } = await comoAna<{ id: string }>("select public.assinatura_pedir($1, 'Plano 10 GB', 5490, 'MONTHLY', '41987650188', 'ponta:assinatura:1') as v", [clienteDaRede]);
    expect(await rodadaDasAssinaturas(dasAssinaturas, cliente)).toMatchObject({ links_criados: 1, conferidas: 1, ativadas: 0 });
    const [linkId, link] = [...asaas.links.entries()].find(([, l]) => l.externalReference === id) ?? [];
    expect(link).toMatchObject({ value: 54.9, billingType: "CREDIT_CARD", chargeType: "RECURRENT", subscriptionCycle: "MONTHLY", limit: 1 });

    // O cliente cadastra o cartão na página da Asaas: a assinatura e a primeira cobrança aparecem lá.
    asaas.cobrancasDeCartao.push({ id: "pay_assinatura_1", status: "CONFIRMED", value: 54.9, paymentLink: linkId as string, subscription: "sub_ponta_1",
      creditCard: { creditCardNumber: "4242", creditCardBrand: "MASTERCARD" } });
    asaas.assinaturas.set("sub_ponta_1", { status: "ACTIVE", value: 54.9, cycle: "MONTHLY", nextDueDate: "2026-12-25", paymentLink: linkId as string, deleted: false });
    asaas.cobrancasDaAssinatura.set("sub_ponta_1", [{ id: "pay_assinatura_1", status: "CONFIRMED", value: 54.9, dueDate: "2026-11-25", clientPaymentDate: "2026-11-25",
      creditCard: { creditCardNumber: "4242", creditCardBrand: "MASTERCARD" } }]);
    await db.query("update public.assinaturas set conferido_em = now() - interval '11 seconds' where id = $1", [id]);
    expect(await rodadaDasAssinaturas(dasAssinaturas, cliente)).toMatchObject({ ativadas: 1 });
    const ficha = await comoAna<{ assinaturas: { situacao: string; cartao_final: string; cartao_bandeira: string; proxima_cobranca: string; cobrancas: { situacao: string }[] }[] }>(
      "select public.assinaturas_do_cliente($1) as v", [clienteDaRede]);
    expect(ficha.assinaturas[0]).toMatchObject({ situacao: "ativa", cartao_final: "4242", cartao_bandeira: "MASTERCARD", proxima_cobranca: "2026-12-25",
      cobrancas: [{ situacao: "pago" }] });

    // A loja cancela: o worker remove a assinatura na Asaas (as cobranças futuras param).
    expect(await comoAna("select public.assinatura_cancelar($1, 'Cliente pediu para parar') as v", [id])).toBe("cancelando");
    expect(await rodadaDasAssinaturas(dasAssinaturas, cliente)).toMatchObject({ canceladas: 1 });
    expect(asaas.assinaturas.get("sub_ponta_1")?.deleted).toBe(true);
    expect((await db.query<{ situacao: string }>("select situacao from public.assinaturas where id = $1", [id])).rows[0]?.situacao).toBe("cancelada");
  });
});

