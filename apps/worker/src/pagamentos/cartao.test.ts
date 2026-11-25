// O cartão pela Asaas no caixa, no worker (lote PAY-015b), com o banco e a Asaas SIMULADOS: a situação, a criação dos links
// (a procura antes de criar de novo), a conferência pelas cobranças de cartão (uma leitura por rodada) e a desativação. O
// caminho de verdade (o banco com as migrations e o transporte HTTP) está em ponta-a-ponta.test.ts. Links FICTÍCIOS.
import { describe, expect, it } from "vitest";

import type { CobrancaDeCartao, LinkDaAsaas, ResultadoDoLink } from "./asaas.ts";
import { consultaDoLink, diaSeguinte, rodadaDoCartao, situacaoDoCartao, type AsaasDoCartao, type BancoDoCartao, type LinkDoCartaoAConferir,
  type LinkDoCartaoACriar } from "./cartao.ts";

function simulados(p: { aCriar?: LinkDoCartaoACriar[]; achado?: (LinkDaAsaas | null | "falha")[]; criar?: ResultadoDoLink[]; aConferir?: LinkDoCartaoAConferir[];
  cobrancas?: (CobrancaDeCartao[] | "falha")[]; resultados?: string[]; aDesativar?: { id: string; link_id: string }[]; desativar?: boolean[] }) {
  const chamadas: unknown[][] = [];
  const banco: BancoDoCartao = {
    cartaoSituacao: async (pronto, motivo) => { chamadas.push(["situacao", pronto, motivo]); return true; },
    cartaoACriar: async () => p.aCriar ?? [],
    cartaoLinkRegistrar: async (...a) => { chamadas.push(["registrar", ...a]); return "registrado"; },
    cartaoCriacaoFalhou: async (...a) => { chamadas.push(["falhou", ...a]); return "criando"; },
    cartaoAConferir: async () => p.aConferir ?? [],
    cartaoConsultaAplicar: async (cartao, consulta) => { chamadas.push(["aplicar", cartao, consulta]); return p.resultados?.shift() ?? "pendente"; },
    cartaoADesativar: async () => p.aDesativar ?? [],
    cartaoLinkDesativado: async (cartao) => { chamadas.push(["desativado", cartao]); return "cancelado"; },
  };
  const asaas: AsaasDoCartao = {
    criarLinkDoCartao: async (q) => { chamadas.push(["criarLink", q]); return p.criar?.shift() ?? { tipo: "falha", motivo: "sem conexão" }; },
    procurarLink: async (r) => { chamadas.push(["procurar", r]); return p.achado?.shift() ?? null; },
    cobrancasDeCartaoDesde: async (dia) => { chamadas.push(["cobrancas", dia]); return p.cobrancas?.shift() ?? "falha"; },
    desativarLink: async (id) => { chamadas.push(["desativarLink", id]); return p.desativar?.shift() ?? true; },
  };
  return { banco, asaas, chamadas };
}
const PAGA: CobrancaDeCartao = { id: "pay_1", link: "lnk_1", situacao: "pago", valor_centavos: 7_900, final: "8829", bandeira: "VISA", assinatura: null };

describe("o cartão do caixa no worker (PAY-015b)", () => {
  it("as cobranças do link: nenhuma (ou só pendente); uma paga ou estornada; duas, ou outra situação, ou sem valor: desconhecida", () => {
    expect(consultaDoLink([], "lnk_1")).toEqual({ situacao: "nenhum" });
    expect(consultaDoLink([{ ...PAGA, situacao: "pendente" }, { ...PAGA, link: "lnk_2" }], "lnk_1")).toEqual({ situacao: "nenhum" });
    expect(consultaDoLink([PAGA], "lnk_1")).toEqual({ situacao: "pago", id_no_provedor: "pay_1", valor_centavos: 7_900, cartao_final: "8829", cartao_bandeira: "VISA" });
    expect(consultaDoLink([{ ...PAGA, situacao: "estornado", final: null, bandeira: null }], "lnk_1"))
      .toEqual({ situacao: "estornado", id_no_provedor: "pay_1", valor_centavos: 7_900, cartao_final: null, cartao_bandeira: null });
    expect(consultaDoLink([PAGA, { ...PAGA, id: "pay_2" }], "lnk_1")).toEqual({ situacao: "desconhecida" });
    expect(consultaDoLink([{ ...PAGA, situacao: "desconhecida" }], "lnk_1")).toEqual({ situacao: "desconhecida" });
    expect(consultaDoLink([{ ...PAGA, valor_centavos: null }], "lnk_1")).toEqual({ situacao: "desconhecida" });
  });

  it("a situação: sem resposta da Asaas, desligado com o motivo; o fim do link é o dia seguinte em Brasília", async () => {
    const s = simulados({});
    expect(await situacaoDoCartao(s.banco, false)).toBe(false);
    expect(await situacaoDoCartao(s.banco, true)).toBe(true);
    expect(s.chamadas).toEqual([["situacao", false, "a Asaas não respondeu"], ["situacao", true, null]]);
    // 24/11 às 23h30 em Brasília (02h30 de 25/11 em UTC): o dia seguinte é 25/11 em Brasília (em UTC seria 26/11).
    expect(diaSeguinte(Date.parse("2026-11-25T02:30:00Z"))).toBe("2026-11-25");
    expect(diaSeguinte(Date.parse("2026-11-26T02:30:00Z"))).toBe("2026-11-26");
  });

  it("criar: o link novo; depois de uma tentativa sem resposta clara, procura antes (o achado vale; a procura sem resposta volta para a fila); a recusa para de vez", async () => {
    const item = (id: string, tentativa: number): LinkDoCartaoACriar => ({ id, valor_centavos: 7_900, tentativa, venda_numero: 12, validade_segundos: 1_800 });
    const s = simulados({
      aCriar: [item("c1", 1), item("c2", 2), item("c3", 2), item("c4", 1)],
      achado: [{ id: "lnk_achado", url: "https://sandbox.asaas.invalid/c/lnk_achado" }, "falha"],
      criar: [{ tipo: "criado", link: { id: "lnk_novo", url: "https://sandbox.asaas.invalid/c/lnk_novo" } }, { tipo: "recusado", motivo: "a Asaas respondeu 400" }],
    });
    const r = await rodadaDoCartao(s.banco, s.asaas);
    expect(r).toMatchObject({ links_criados: 2, links_falhas: 2 });
    const passos = s.chamadas.map((c) => [c[0], c[1]]);
    expect(passos).toEqual([
      ["criarLink", { referencia: "c1", nome: "Venda nº 12 na Ora 5G", valorCentavos: 7_900, venceEm: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }],
      ["registrar", "c1"],
      ["procurar", "c2"], ["registrar", "c2"],
      ["procurar", "c3"], ["falhou", "c3"],
      ["criarLink", { referencia: "c4", nome: "Venda nº 12 na Ora 5G", valorCentavos: 7_900, venceEm: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }],
      ["falhou", "c4"],
    ]);
    expect(s.chamadas.find((c) => c[0] === "falhou" && c[1] === "c4")).toEqual(["falhou", "c4", "a Asaas respondeu 400", true]);
    expect(s.chamadas.find((c) => c[0] === "falhou" && c[1] === "c3")).toEqual(["falhou", "c3", "a Asaas não respondeu a procura do link", false]);
  });

  it("conferir: uma leitura das cobranças por rodada, desde o dia mais antigo do lote; sem resposta, nada é aplicado; a desistência sem pagamento desativa o link", async () => {
    const lote: LinkDoCartaoAConferir[] = [
      { id: "c1", link_id: "lnk_1", valor_centavos: 7_900, situacao: "aguardando", desde: "2026-11-25" },
      { id: "c2", link_id: "lnk_2", valor_centavos: 1_000, situacao: "cancelando", desde: "2026-11-24" },
    ];
    const semResposta = simulados({ aConferir: lote, cobrancas: ["falha"] });
    expect(await rodadaDoCartao(semResposta.banco, semResposta.asaas)).toMatchObject({ links_conferidos: 0 });
    expect(semResposta.chamadas).toEqual([["cobrancas", "2026-11-24"]]);

    const s = simulados({ aConferir: lote, cobrancas: [[PAGA]], resultados: ["confirmado", "pode_desativar"] });
    expect(await rodadaDoCartao(s.banco, s.asaas)).toMatchObject({ links_conferidos: 2, links_pagos: 1, links_desativados: 1 });
    expect(s.chamadas).toEqual([
      ["cobrancas", "2026-11-24"],
      ["aplicar", "c1", { link_id: "lnk_1", situacao: "pago", id_no_provedor: "pay_1", valor_centavos: 7_900, cartao_final: "8829", cartao_bandeira: "VISA" }],
      ["aplicar", "c2", { link_id: "lnk_2", situacao: "nenhum" }],
      ["desativarLink", "lnk_2"], ["desativado", "c2"],
    ]);
  });

  it("desativar: o cancelado e o vencido; o que a Asaas não desativou fica para a próxima rodada", async () => {
    const s = simulados({ aDesativar: [{ id: "c1", link_id: "lnk_1" }, { id: "c2", link_id: "lnk_2" }], desativar: [true, false] });
    expect(await rodadaDoCartao(s.banco, s.asaas)).toMatchObject({ links_desativados: 1 });
    expect(s.chamadas).toEqual([["desativarLink", "lnk_1"], ["desativado", "c1"], ["desativarLink", "lnk_2"]]);
  });
});
