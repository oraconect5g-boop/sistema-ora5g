// O link de pagamento e o Pix online (lote ADAPT-a; ORA-PAY-014 e ORA-PAY-008): desligado sem o provedor escolhido e o
// contrato, e as regras do aviso e da reconsulta. Lote PAY-b (achado F18-06 da reanálise do Codex de 18/11): o aviso nunca
// confirma; só a reconsulta, conferindo a cobrança, o valor, a moeda e a ordem. Avisos e respostas FICTÍCIOS (fixtures):
// provam a regra, não o formato de provedor nenhum.
import { describe, expect, it } from "vitest";

import {
  ADAPTADOR_PRONTO, PROVEDORES_DE_COBRANCA, aposConsultar, decidirAviso, decidirConsulta, oQueFaltaParaACobranca, proximoPassoDaCriacao,
  type AvisoDePagamento, type CobrancaRegistrada, type ConsultaDaCobranca, type PedidoDeCobranca,
} from "./cobranca.ts";

const ambiente = (valores: Record<string, string>) => (nome: string) => valores[nome] ?? "";
const aviso = (mudar: Partial<AvisoDePagamento> = {}): AvisoDePagamento =>
  ({ idDoAviso: "AVISO-1", identificador: "COB-1", situacao: "pago", valor: 7_900, moeda: "BRL", assinaturaConferida: true, ...mudar });
const cobranca = (mudar: Partial<CobrancaRegistrada> = {}): CobrancaRegistrada => ({ identificador: "COB-1", valor: 7_900, moeda: "BRL", situacao: "aguardando", ...mudar });
const consulta = (mudar: Partial<ConsultaDaCobranca> = {}): ConsultaDaCobranca => ({ identificador: "COB-1", situacao: "pago", valor: 7_900, moeda: "BRL", ...mudar });
const pedido: PedidoDeCobranca = { identificador: "COB-1", valor: 7_900, moeda: "BRL", descricao: "Capa (teste)", vencimento: "2026-11-20" };

describe("o link de pagamento", () => {
  it("nenhum provedor pronto: mesmo com as variáveis, falta o adaptador oficial", () => {
    for (const p of PROVEDORES_DE_COBRANCA) expect(ADAPTADOR_PRONTO[p], p).toBe(false);
    expect(oQueFaltaParaACobranca("picpay", ambiente({}))).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "PICPAY_CLIENT_ID", "PICPAY_CLIENT_SECRET", "PICPAY_WEBHOOK_SECRET",
      "o adaptador oficial do provedor (espera a escolha do provedor, o contrato e o formato do aviso confirmado)",
    ]);
    const tudo = ambiente(Object.fromEntries(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "PAGBANK_ENVIRONMENT", "PAGBANK_API_TOKEN"].map((n) => [n, "x"])));
    expect(oQueFaltaParaACobranca("pagbank", tudo)).toEqual(["o adaptador oficial do provedor (espera a escolha do provedor, o contrato e o formato do aviso confirmado)"]);
  });
});

describe("o aviso do provedor (F18-06): nunca confirma, só leva à reconsulta", () => {
  it("o aviso assinado, de cobrança nossa, do mesmo valor e nunca visto pede a reconsulta, e não confirma", () => {
    expect(decidirAviso(aviso(), cobranca(), new Set())).toEqual({ acao: "reconsultar", motivo: "pagamento_informado" });
  });

  it("repetido, sem assinatura ou de situação que não se entende: ignorado, sem nada mudar", () => {
    expect(decidirAviso(aviso(), cobranca(), new Set(["AVISO-1"]))).toEqual({ acao: "ignorar", motivo: "repetido" });
    expect(decidirAviso(aviso({ assinaturaConferida: false }), cobranca(), new Set())).toEqual({ acao: "ignorar", motivo: "sem_assinatura" });
    expect(decidirAviso(aviso({ situacao: "outro" }), cobranca(), new Set())).toEqual({ acao: "ignorar", motivo: "outra_situacao" });
  });

  it("cobrança que não é nossa, outro valor, outra moeda, cancelamento e estorno: reconsulta, com o motivo", () => {
    expect(decidirAviso(aviso(), null, new Set())).toEqual({ acao: "reconsultar", motivo: "cobranca_desconhecida" });
    expect(decidirAviso(aviso({ valor: 7_000 }), cobranca(), new Set())).toEqual({ acao: "reconsultar", motivo: "valor_diferente" });
    expect(decidirAviso(aviso({ moeda: "USD" }), cobranca(), new Set())).toEqual({ acao: "reconsultar", motivo: "moeda_diferente" });
    expect(decidirAviso(aviso({ situacao: "cancelado" }), cobranca(), new Set())).toEqual({ acao: "reconsultar", motivo: "cancelamento_informado" });
    expect(decidirAviso(aviso({ situacao: "estornado" }), cobranca({ situacao: "paga" }), new Set())).toEqual({ acao: "reconsultar", motivo: "estorno_informado" });
  });

  it("nenhuma combinação de aviso confirma", () => {
    const situacoes = ["pago", "cancelado", "estornado", "outro"] as const;
    const registradas = ["aguardando", "paga", "cancelada", "estornada"] as const;
    for (const situacao of situacoes) for (const r of registradas) for (const assinaturaConferida of [true, false]) {
      expect(decidirAviso(aviso({ situacao, assinaturaConferida }), cobranca({ situacao: r }), new Set()).acao, `${situacao}/${r}`).not.toBe("confirmar");
    }
  });
});

describe("a reconsulta (F18-06): a única que confirma, conferindo a cobrança, o valor, a moeda e a ordem", () => {
  it("paga no provedor, aguardando aqui, mesma cobrança, valor e moeda: confirma; de novo, nada (a mesma confirmação não conta duas vezes)", () => {
    expect(decidirConsulta(consulta(), cobranca())).toEqual({ acao: "confirmar" });
    expect(decidirConsulta(consulta(), cobranca({ situacao: "paga" }))).toEqual({ acao: "nada", motivo: "ja_registrado" });
  });

  it("outra cobrança, cobrança que o provedor não conhece, outro valor ou outra moeda: divergência, nada muda sozinho", () => {
    expect(decidirConsulta(consulta({ identificador: "COB-2" }), cobranca())).toEqual({ acao: "divergencia", motivo: "outra_cobranca" });
    expect(decidirConsulta(null, cobranca())).toEqual({ acao: "divergencia", motivo: "desconhecida_no_provedor" });
    expect(decidirConsulta(consulta({ valor: 7_000 }), cobranca())).toEqual({ acao: "divergencia", motivo: "valor_diferente" });
    expect(decidirConsulta(consulta({ moeda: "USD" }), cobranca())).toEqual({ acao: "divergencia", motivo: "moeda_diferente" });
  });

  it("a resposta que não veio (tempo esgotado) e a pendente esperam e perguntam de novo depois, sem confirmar", () => {
    expect(decidirConsulta(consulta({ situacao: "desconhecida" }), cobranca())).toEqual({ acao: "aguardar", motivo: "resposta_desconhecida" });
    expect(decidirConsulta(consulta({ situacao: "pendente" }), cobranca())).toEqual({ acao: "aguardar", motivo: "pendente" });
  });

  it("os avisos fora de ordem não valem: a situação do provedor contra a registrada decide, e o que não fecha vai para a conciliação", () => {
    // O cancelamento chega depois do pagamento já confirmado: não desfaz o pagamento sozinho.
    expect(decidirConsulta(consulta({ situacao: "cancelado" }), cobranca({ situacao: "paga" }))).toEqual({ acao: "divergencia", motivo: "cancelada_depois_de_paga" });
    // O pagamento chega depois de a cobrança ser cancelada aqui: precisa de devolução, decidida por gente.
    expect(decidirConsulta(consulta(), cobranca({ situacao: "cancelada" }))).toEqual({ acao: "divergencia", motivo: "paga_depois_de_cancelada" });
    expect(decidirConsulta(consulta({ situacao: "cancelado" }), cobranca())).toEqual({ acao: "cancelar" });
    expect(decidirConsulta(consulta({ situacao: "cancelado" }), cobranca({ situacao: "cancelada" }))).toEqual({ acao: "nada", motivo: "ja_registrado" });
    expect(decidirConsulta(consulta({ situacao: "pendente" }), cobranca({ situacao: "paga" }))).toEqual({ acao: "nada", motivo: "ja_registrado" });
  });

  it("o estorno do que foi pago é registrado uma vez; o estorno sem pagamento é divergência", () => {
    expect(decidirConsulta(consulta({ situacao: "estornado" }), cobranca({ situacao: "paga" }))).toEqual({ acao: "registrar_estorno" });
    expect(decidirConsulta(consulta({ situacao: "estornado" }), cobranca({ situacao: "estornada" }))).toEqual({ acao: "nada", motivo: "ja_registrado" });
    expect(decidirConsulta(consulta({ situacao: "estornado" }), cobranca())).toEqual({ acao: "divergencia", motivo: "estorno_sem_pagamento" });
  });
});

describe("criar a cobrança sem cobrar duas vezes (F18-06: o tempo esgotado)", () => {
  it("sem tentativa, cria; criada, pronta; recusada, para; resultado desconhecido, consulta antes de criar de novo", () => {
    expect(proximoPassoDaCriacao([])).toEqual({ passo: "criar" });
    expect(proximoPassoDaCriacao([{ tipo: "criada", link: "https://exemplo.invalid/pagar", idNoProvedor: "P-1" }]))
      .toEqual({ passo: "pronta", link: "https://exemplo.invalid/pagar", idNoProvedor: "P-1" });
    expect(proximoPassoDaCriacao([{ tipo: "recusada", motivo: "dados inválidos" }])).toEqual({ passo: "parar", motivo: "dados inválidos" });
    expect(proximoPassoDaCriacao([{ tipo: "desconhecido" }])).toEqual({ passo: "consultar_antes", motivo: "resultado_desconhecido" });
    expect(proximoPassoDaCriacao([{ tipo: "desconhecido" }, { tipo: "desconhecido" }])).toEqual({ passo: "consultar_antes", motivo: "resultado_desconhecido" });
  });

  it("depois do desconhecido: o provedor já tem a cobrança, usa-se a dela; não tem, cria-se com o mesmo identificador; o resto para", () => {
    expect(aposConsultar(consulta({ situacao: "pendente" }), pedido)).toEqual({ passo: "usar_a_existente" });
    expect(aposConsultar(null, pedido)).toEqual({ passo: "criar" });
    expect(aposConsultar(consulta({ situacao: "desconhecida" }), pedido)).toMatchObject({ passo: "parar" });
    expect(aposConsultar(consulta({ identificador: "COB-9" }), pedido)).toMatchObject({ passo: "parar" });
    expect(aposConsultar(consulta({ valor: 8_000 }), pedido)).toMatchObject({ passo: "parar" });
  });
});
