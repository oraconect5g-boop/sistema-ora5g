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
import { ligarSeFaltar, rodada, type BancoDosPagamentos } from "./processar.ts";

let db: PGlite;
let servidor: Server;
let base = "";
// O que a "Asaas" guardou: o token do aviso, os links e os pagamentos; PAY-015a: os QR do caixa e as cobranças de cada um.
const asaas = { token: "", links: new Map<string, { externalReference: string; value: number; active: boolean }>(), pagamentos: new Map<string, { status: string; value: number; paymentLink: string }>(),
  qrs: new Map<string, { externalReference: string; value: number; allowsMultiplePayments: boolean; expirationSeconds: number; excluido: boolean }>(),
  cobrancasDoQr: new Map<string, { id: string; status: string; value: number }[]>() };
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
        asaas.links.set(id, { externalReference: String(corpo.externalReference), value: Number(corpo.value), active: true });
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
});
