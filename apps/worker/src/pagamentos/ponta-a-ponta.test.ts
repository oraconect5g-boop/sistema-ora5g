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
import { ligarSeFaltar, rodada, type BancoDosPagamentos } from "./processar.ts";

let db: PGlite;
let servidor: Server;
let base = "";
// O que a "Asaas" guardou: o token do aviso, os links e os pagamentos.
const asaas = { token: "", links: new Map<string, { externalReference: string; value: number; active: boolean }>(), pagamentos: new Map<string, { status: string; value: number; paymentLink: string }>() };

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
});
