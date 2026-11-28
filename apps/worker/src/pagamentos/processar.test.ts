// O worker dos pagamentos pelo site (lote PAY-014a), com o banco e a Asaas SIMULADOS: cada passo e cada caminho. Quem
// decide a situação é o banco: packages/banco/src/pagamento-pelo-site.test.ts. Dados fictícios.
import { describe, expect, it } from "vitest";

import type { ConsultaDaAsaas, ResultadoDoLink } from "./asaas.ts";
import {
  criarLinks, desativarLinks, impressaoDo, ligarSeFaltar, processarAvisos, RESUMO_VAZIO,
  type Asaas, type AvisoAProcessar, type BancoDosPagamentos, type PagamentoACriar,
} from "./processar.ts";

type Chamada = [string, ...unknown[]];
function simulados(estado: {
  config?: { ligado: boolean; ambiente: string | null; webhook_id: string | null };
  aCriar?: PagamentoACriar[]; avisos?: AvisoAProcessar[]; aDesativar?: { id: string; link: string }[];
  criar?: ResultadoDoLink; procurar?: { id: string; url: string } | null | "falha"; consultar?: ConsultaDaAsaas | null | "falha";
  registrar?: { id: string } | { falha: string }; desativar?: boolean;
}) {
  const chamadas: Chamada[] = [];
  const banco: BancoDosPagamentos = {
    configuracao: async () => estado.config ?? { ligado: false, ambiente: null, webhook_id: null },
    ligar: async (...a) => { chamadas.push(["ligar", ...a]); },
    aCriar: async () => estado.aCriar ?? [],
    linkRegistrado: async (...a) => { chamadas.push(["linkRegistrado", ...a]); return "registrado"; },
    criacaoFalhou: async (...a) => { chamadas.push(["criacaoFalhou", ...a]); return "criando"; },
    avisosAProcessar: async () => estado.avisos ?? [],
    avisoConcluir: async (...a) => { chamadas.push(["avisoConcluir", ...a]); return true; },
    consultaAplicar: async (...a) => { chamadas.push(["consultaAplicar", ...a]); return "confirmado"; },
    aDesativar: async () => estado.aDesativar ?? [],
    linkDesativado: async (...a) => { chamadas.push(["linkDesativado", ...a]); return true; },
  };
  const asaas: Asaas = {
    criarLink: async (p) => { chamadas.push(["criarLink", p]); return estado.criar ?? { tipo: "criado", link: { id: "lnk_novo", url: "https://sandbox.asaas.com/c/1" } }; },
    procurarLink: async (r) => { chamadas.push(["procurarLink", r]); return estado.procurar ?? null; },
    desativarLink: async (id) => { chamadas.push(["desativarLink", id]); return estado.desativar ?? true; },
    consultarPagamento: async (id) => { chamadas.push(["consultarPagamento", id]); return estado.consultar === undefined ? null : estado.consultar; },
    registrarAviso: async (p) => { chamadas.push(["registrarAviso", p]); return estado.registrar ?? { id: "wh_1" }; },
  };
  return { banco, asaas, chamadas };
}
const ITEM: PagamentoACriar = { id: "00000000-0000-4000-8000-0000000000p1", valor_centavos: 7_990, tentativa: 1, codigo: "ABC234", vence_em: "2026-11-25" };
const SITE = "https://ora5g.com.br";

describe("ligar (PAY-014a)", () => {
  it("já ligado no mesmo ambiente: nada; desligado ou noutro ambiente: registra o aviso com um token novo e grava só a impressão dele", async () => {
    let s = simulados({ config: { ligado: true, ambiente: "sandbox", webhook_id: "wh_0" } });
    expect(await ligarSeFaltar(s.banco, s.asaas, { ambiente: "sandbox", urlDoAviso: `${SITE}/api/pagamentos/asaas`, email: "x@exemplo.invalid" })).toBe("ja_ligado");
    expect(s.chamadas).toEqual([]);
    for (const config of [{ ligado: false, ambiente: null, webhook_id: null }, { ligado: true, ambiente: "sandbox", webhook_id: "wh_0" }]) {
      s = simulados({ config });
      const token = "token-ficticio-do-aviso-da-asaas-0123456789abcdef";
      expect(await ligarSeFaltar(s.banco, s.asaas, { ambiente: "producao", urlDoAviso: `${SITE}/api/pagamentos/asaas`, email: "x@exemplo.invalid", token: () => token })).toBe("ligado");
      expect(s.chamadas).toEqual([
        ["registrarAviso", { url: `${SITE}/api/pagamentos/asaas`, token, email: "x@exemplo.invalid" }],
        ["ligar", "producao", "wh_1", impressaoDo(token)],
      ]);
      expect(impressaoDo(token)).toMatch(/^[0-9a-f]{64}$/);
    }
    s = simulados({ registrar: { falha: "a Asaas respondeu 401" } });
    expect(await ligarSeFaltar(s.banco, s.asaas, { ambiente: "sandbox", urlDoAviso: `${SITE}/x`, email: "x@exemplo.invalid" })).toEqual({ falha: "a Asaas respondeu 401" });
    expect(s.chamadas.map((c) => c[0])).toEqual(["registrarAviso"]);
  });
});

describe("criar os links (PAY-014a)", () => {
  it("na primeira tentativa, cria com o código no nome e o retorno à página do pedido; criado, registra", async () => {
    const s = simulados({ aCriar: [ITEM] });
    const resumo = { ...RESUMO_VAZIO };
    await criarLinks(s.banco, s.asaas, SITE, resumo);
    expect(s.chamadas).toEqual([
      ["criarLink", { referencia: ITEM.id, nome: "Pedido ABC234 na Ora 5G", valorCentavos: 7_990, venceEm: "2026-11-25", retorno: `${SITE}/loja/pedido?codigo=ABC234` }],
      ["linkRegistrado", ITEM.id, "lnk_novo", "https://sandbox.asaas.com/c/1"],
    ]);
    expect(resumo.criados).toBe(1);
  });

  it("da segunda tentativa em diante, procura antes: achado, registra sem criar; sem resposta, volta para a fila sem criar; não achado, cria", async () => {
    let s = simulados({ aCriar: [{ ...ITEM, tentativa: 2 }], procurar: { id: "lnk_achado", url: "https://sandbox.asaas.com/c/9" } });
    await criarLinks(s.banco, s.asaas, SITE, { ...RESUMO_VAZIO });
    expect(s.chamadas).toEqual([["procurarLink", ITEM.id], ["linkRegistrado", ITEM.id, "lnk_achado", "https://sandbox.asaas.com/c/9"]]);
    s = simulados({ aCriar: [{ ...ITEM, tentativa: 3 }], procurar: "falha" });
    await criarLinks(s.banco, s.asaas, SITE, { ...RESUMO_VAZIO });
    expect(s.chamadas).toEqual([["procurarLink", ITEM.id], ["criacaoFalhou", ITEM.id, "a Asaas não respondeu a procura do link", false]]);
    s = simulados({ aCriar: [{ ...ITEM, tentativa: 2 }], procurar: null });
    await criarLinks(s.banco, s.asaas, SITE, { ...RESUMO_VAZIO });
    expect(s.chamadas.map((c) => c[0])).toEqual(["procurarLink", "criarLink", "linkRegistrado"]);
  });

  it("a recusa para de vez; a falha e o resultado desconhecido voltam para a fila", async () => {
    for (const [criar, definitiva] of [
      [{ tipo: "recusado", motivo: "a Asaas respondeu 400" }, true], [{ tipo: "falha", motivo: "a Asaas respondeu 429" }, false],
      [{ tipo: "desconhecido", motivo: "sem resposta da Asaas depois do envio" }, false],
    ] as const) {
      const s = simulados({ aCriar: [ITEM], criar });
      await criarLinks(s.banco, s.asaas, SITE, { ...RESUMO_VAZIO });
      expect(s.chamadas.at(-1), criar.tipo).toEqual(["criacaoFalhou", ITEM.id, criar.motivo, definitiva]);
    }
  });
});

describe("os avisos e os links a desativar (PAY-014a)", () => {
  const AVISO: AvisoAProcessar = { aviso: "evt_1", evento: "PAYMENT_RECEIVED", id_no_provedor: "pay_1", link: "lnk_1", valor_centavos: 7_990,
    pagamento: { id: ITEM.id, valor_centavos: 7_990, situacao: "aguardando", link: "lnk_1" } };
  const CONSULTA: ConsultaDaAsaas = { id_no_provedor: "pay_1", link: "lnk_1", valor_centavos: 7_990, situacao: "pago", estornado_centavos: 0 };

  it("o aviso só faz perguntar: com a resposta, o banco aplica; sem resposta, o aviso fica para depois; sem pagamento nosso, sem link ou sem id, é concluído", async () => {
    let s = simulados({ avisos: [AVISO], consultar: CONSULTA });
    const resumo = { ...RESUMO_VAZIO };
    await processarAvisos(s.banco, s.asaas, resumo);
    expect(s.chamadas).toEqual([["consultarPagamento", "pay_1"], ["consultaAplicar", "evt_1", CONSULTA]]);
    expect(resumo).toMatchObject({ avisos: 1, confirmados: 1 });
    s = simulados({ avisos: [AVISO], consultar: "falha" });
    await processarAvisos(s.banco, s.asaas, { ...RESUMO_VAZIO });
    expect(s.chamadas).toEqual([["consultarPagamento", "pay_1"]]);
    s = simulados({ avisos: [AVISO], consultar: null });
    await processarAvisos(s.banco, s.asaas, { ...RESUMO_VAZIO });
    expect(s.chamadas.at(-1)).toEqual(["avisoConcluir", "evt_1", "pagamento_desconhecido"]);
    s = simulados({ avisos: [{ ...AVISO, pagamento: null }, { ...AVISO, aviso: "evt_2", link: null, pagamento: null }, { ...AVISO, aviso: "evt_3", id_no_provedor: null }] });
    await processarAvisos(s.banco, s.asaas, { ...RESUMO_VAZIO });
    expect(s.chamadas).toEqual([["avisoConcluir", "evt_1", "link_desconhecido"], ["avisoConcluir", "evt_2", "sem_link"], ["avisoConcluir", "evt_3", "sem_pagamento"]]);
  });

  it("o link desativado na Asaas é marcado no banco; o que não desativou fica para a próxima rodada", async () => {
    let s = simulados({ aDesativar: [{ id: ITEM.id, link: "lnk_1" }] });
    const resumo = { ...RESUMO_VAZIO };
    await desativarLinks(s.banco, s.asaas, resumo);
    expect(s.chamadas).toEqual([["desativarLink", "lnk_1"], ["linkDesativado", ITEM.id]]);
    expect(resumo.desativados).toBe(1);
    s = simulados({ aDesativar: [{ id: ITEM.id, link: "lnk_1" }], desativar: false });
    await desativarLinks(s.banco, s.asaas, { ...RESUMO_VAZIO });
    expect(s.chamadas).toEqual([["desativarLink", "lnk_1"]]);
  });
});
