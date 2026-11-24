// O aviso da Asaas (webhook do pagamento pelo site, lote PAY-014a) com o banco SIMULADO: o que a rota repassa e o que
// responde. O evento segue o formato do exemplo da documentação oficial (docs.asaas.com, lida em 24/11), com valores
// FICTÍCIOS; o token também é fictício. Quem confere o token e guarda o aviso é o banco
// (packages/banco/src/pagamento-pelo-site.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

import { avisoDaAsaas, respostaDoAviso, TAMANHO_MAXIMO_DO_AVISO, tokenDoAviso } from "../../../../lib/pagamentos/aviso-da-asaas";

const cenario = vi.hoisted(() => ({
  endereco: "203.0.113.10",
  semBanco: false,
  resposta: { data: "guardado" as unknown, error: null as { code: string } | null },
  chamadas: [] as [string, unknown][],
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": cenario.endereco }) }));
vi.mock("../../../../lib/supabase/servidor", () => ({
  clienteSupabaseServidor: async () => cenario.semBanco ? null : {
    rpc: async (nome: string, argumentos: unknown) => { cenario.chamadas.push([nome, argumentos]); return cenario.resposta; },
  },
}));

const { POST } = await import("./route");

const TOKEN = "token-ficticio-do-aviso-da-asaas-0123456789abcdef";
// O exemplo da documentação (o id do evento traz "&"), com um campo a mais que a Asaas pode acrescentar um dia.
const EVENTO = {
  id: "evt_05b708f961d739ea7eba7e4db318f621&368604920", event: "PAYMENT_RECEIVED", dateCreated: "2026-11-24 16:45:03",
  account: { id: "00000000-0000-4000-8000-000000000999", ownerId: null },
  payment: {
    object: "payment", id: "pay_080225913252", customer: "cus_000000000001", paymentLink: "123517639363", value: 79.9, netValue: 78.91,
    billingType: "PIX", status: "RECEIVED", externalReference: null, campoNovo: { qualquer: true },
  },
};
const ESPERADO = { id: EVENTO.id, evento: "PAYMENT_RECEIVED", pagamento: "pay_080225913252", link: "123517639363", valor: 79.9, situacao: "RECEIVED" };

function pedido(corpo: string, cabecalhos: Record<string, string> = { "asaas-access-token": TOKEN }) {
  return new Request("https://ora5g.com.br/api/pagamentos/asaas", { method: "POST", headers: { "content-type": "application/json", ...cabecalhos }, body: corpo });
}

beforeEach(() => {
  cenario.endereco = "203.0.113.10";
  cenario.semBanco = false;
  cenario.resposta = { data: "guardado", error: null };
  cenario.chamadas = [];
});

describe("a leitura do aviso (PAY-014a)", () => {
  it("o token: de 32 a 255 caracteres visíveis, sem espaço (a regra da documentação)", () => {
    expect(tokenDoAviso(null)).toBeNull();
    expect(tokenDoAviso("a".repeat(31))).toBeNull();
    expect(tokenDoAviso("a".repeat(32))).toBe("a".repeat(32));
    expect(tokenDoAviso("a".repeat(255))).toBe("a".repeat(255));
    expect(tokenDoAviso("a".repeat(256))).toBeNull();
    expect(tokenDoAviso(`${"a".repeat(20)} ${"a".repeat(20)}`)).toBeNull();
  });

  it("o evento no formato do banco: só os campos que o worker usa; o que falta vai nulo; o que não é evento é nulo", () => {
    expect(avisoDaAsaas(EVENTO)).toEqual(ESPERADO);
    expect(avisoDaAsaas({ id: "evt_1", event: "PAYMENT_DELETED" })).toEqual({ id: "evt_1", evento: "PAYMENT_DELETED", pagamento: null, link: null, valor: null, situacao: null });
    expect(avisoDaAsaas({ ...EVENTO, payment: { ...EVENTO.payment, paymentLink: 123517639363 } })?.link).toBe("123517639363");
    expect(avisoDaAsaas({ ...EVENTO, payment: { ...EVENTO.payment, paymentLink: null, value: "79.90" } })).toMatchObject({ link: null, valor: null });
    for (const ruim of [null, [], "evento", { event: "PAYMENT_RECEIVED" }, { id: "evt_1" }, { id: 1, event: "PAYMENT_RECEIVED" }]) {
      expect(avisoDaAsaas(ruim), JSON.stringify(ruim)).toBeNull();
    }
  });

  it("a resposta pelo que o banco disse: 200 só com o aviso guardado; o token, 401; o aviso, 400; o resto, 503", () => {
    expect(respostaDoAviso("guardado", null)).toEqual({ status: 200, corpo: { ok: true, aviso: "guardado" } });
    expect(respostaDoAviso("repetido", null)).toEqual({ status: 200, corpo: { ok: true, aviso: "repetido" } });
    expect(respostaDoAviso(null, { code: "42501" }).status).toBe(401);
    expect(respostaDoAviso(null, { code: "22023" }).status).toBe(400);
    for (const [data, erro] of [[null, { code: "PGRST202" }], [null, { code: "57014" }], ["outra coisa", null], [null, null]] as const) {
      expect(respostaDoAviso(data, erro).status).toBe(503);
    }
  });
});

describe("POST /api/pagamentos/asaas (PAY-014a)", () => {
  it("repassa ao banco o token e só os campos do aviso; guardado ou repetido, responde 200", async () => {
    const r = await POST(pedido(JSON.stringify(EVENTO)));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, aviso: "guardado" });
    expect(cenario.chamadas).toEqual([["pagamento_aviso_receber", { p_token: TOKEN, p_aviso: ESPERADO }]]);
    cenario.resposta = { data: "repetido", error: null };
    expect((await POST(pedido(JSON.stringify(EVENTO)))).status).toBe(200);
  });

  it("sem o token (ou fora da forma), 401 sem ir ao banco; corpo que não é evento, 400 sem ir ao banco; grande demais, 413", async () => {
    const semToken: Record<string, string>[] = [{}, { "asaas-access-token": "curto" }, { authorization: `Bearer ${TOKEN}` }];
    for (const cabecalhos of semToken) {
      expect((await POST(pedido(JSON.stringify(EVENTO), cabecalhos))).status).toBe(401);
    }
    for (const corpo of ["não é json", "[]", JSON.stringify({ event: "PAYMENT_RECEIVED" }), ""]) {
      expect((await POST(pedido(corpo))).status, corpo).toBe(400);
    }
    expect((await POST(pedido("{}", { "asaas-access-token": TOKEN, "content-length": String(TAMANHO_MAXIMO_DO_AVISO + 1) }))).status).toBe(413);
    expect((await POST(pedido(" ".repeat(TAMANHO_MAXIMO_DO_AVISO + 1)))).status).toBe(413);
    expect(cenario.chamadas).toEqual([]);
  });

  it("o que o banco recusa: o token que não confere, 401; o aviso fora do formato, 400; banco fora do ar ou sem a função, 503", async () => {
    const silencio = [vi.spyOn(console, "warn").mockImplementation(() => undefined), vi.spyOn(console, "error").mockImplementation(() => undefined)];
    for (const [codigo, status] of [["42501", 401], ["22023", 400], ["PGRST202", 503], ["08006", 503]] as const) {
      cenario.resposta = { data: null, error: { code: codigo } };
      expect((await POST(pedido(JSON.stringify(EVENTO)))).status, codigo).toBe(status);
    }
    cenario.semBanco = true;
    expect((await POST(pedido(JSON.stringify(EVENTO)))).status).toBe(503);
    for (const s of silencio) s.mockRestore();
  });

  it("muitos pedidos seguidos do mesmo endereço: 429 (a Asaas manda de novo depois); outro endereço segue", async () => {
    cenario.endereco = "203.0.113.99";
    for (let i = 0; i < 300; i++) await POST(pedido("não é json"));
    expect((await POST(pedido(JSON.stringify(EVENTO)))).status).toBe(429);
    cenario.endereco = "203.0.113.100";
    expect((await POST(pedido(JSON.stringify(EVENTO)))).status).toBe(200);
  });
});
