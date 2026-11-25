// O Pix pela Asaas no caixa, no worker (lote PAY-015a), com o banco e a Asaas SIMULADOS: a conferência da chave Pix, a
// criação dos QR (cada resposta no seu caminho), a conferência dos pagamentos e a exclusão. O caminho de verdade (o banco
// com as migrations e o transporte HTTP) está em ponta-a-ponta.test.ts. QR e cobranças FICTÍCIOS.
import { describe, expect, it } from "vitest";

import type { ConsultaDoQr, ResultadoDoQr } from "./asaas.ts";
import { conferirChavePix, criarQrs, rodadaDoCaixa, type AsaasDoCaixa, type BancoDoCaixa, type QrAConferir, type QrACriar } from "./caixa.ts";

function simulados(p: { chave?: string | null | "falha"; aCriar?: QrACriar[]; criar?: ResultadoDoQr[]; aConferir?: QrAConferir[]; consultas?: (ConsultaDoQr | "falha")[];
  resultados?: string[]; aExcluir?: { id: string; qr_id: string }[]; excluir?: boolean[] }) {
  const chamadas: unknown[][] = [];
  const banco: BancoDoCaixa = {
    caixaSituacao: async (pronto, motivo) => { chamadas.push(["situacao", pronto, motivo]); return true; },
    caixaACriar: async () => p.aCriar ?? [],
    caixaQrRegistrar: async (...a) => { chamadas.push(["registrar", ...a]); return "registrado"; },
    caixaCriacaoFalhou: async (...a) => { chamadas.push(["falhou", ...a]); return "criando"; },
    caixaAConferir: async () => p.aConferir ?? [],
    caixaConsultaAplicar: async (pix, consulta) => { chamadas.push(["aplicar", pix, consulta]); return p.resultados?.shift() ?? "pendente"; },
    caixaAExcluir: async () => p.aExcluir ?? [],
    caixaQrExcluido: async (pix) => { chamadas.push(["excluido", pix]); return "cancelado"; },
  };
  const asaas: AsaasDoCaixa = {
    chavePixAtiva: async () => (p.chave === undefined ? "chave-ficticia" : p.chave),
    criarQrEstatico: async (q) => { chamadas.push(["criarQr", q]); return p.criar?.shift() ?? { tipo: "falha", motivo: "sem conexão" }; },
    cobrancasDoQr: async (qr) => { chamadas.push(["cobrancas", qr]); return p.consultas?.shift() ?? "falha"; },
    excluirQr: async (qr) => { chamadas.push(["excluirQr", qr]); return p.excluir?.shift() ?? true; },
  };
  return { banco, asaas, chamadas };
}
const QR = { id: "qr_ficticio_1", copiaECola: "00020126580014br.gov.bcb.pix-ficticio", imagem: "iVBORw0KGgo" };

describe("o Pix do caixa no worker (PAY-015a)", () => {
  it("a chave Pix: ativa liga o Pix no caixa; sem chave ou sem resposta, desliga com o motivo", async () => {
    let s = simulados({});
    expect(await conferirChavePix(s.banco, s.asaas)).toBe("chave-ficticia");
    expect(s.chamadas).toEqual([["situacao", true, null]]);
    s = simulados({ chave: null });
    expect(await conferirChavePix(s.banco, s.asaas)).toBeNull();
    expect(s.chamadas).toEqual([["situacao", false, "a conta da Asaas não tem chave Pix ativa"]]);
    s = simulados({ chave: "falha" });
    expect(await conferirChavePix(s.banco, s.asaas)).toBeNull();
    expect(s.chamadas).toEqual([["situacao", false, "a Asaas não respondeu a conferência da chave Pix"]]);
  });

  it("cria os QR: o criado é registrado com a validade do nosso relógio; a recusa para de vez; sem resposta, tenta de novo", async () => {
    const item = (id: string): QrACriar => ({ id, valor_centavos: 7_990, tentativa: 1, venda_numero: 12, validade_segundos: 1_800 });
    const s = simulados({
      aCriar: [item("p1"), item("p2"), item("p3")],
      criar: [{ tipo: "criado", qr: QR }, { tipo: "recusado", motivo: "a Asaas respondeu 400" }, { tipo: "desconhecido", motivo: "a Asaas respondeu 502" }],
    });
    const agora = Date.parse("2026-11-25T15:00:00Z");
    const resumo = { qr_criados: 0, qr_falhas: 0, qr_conferidos: 0, qr_pagos: 0, qr_excluidos: 0 };
    await criarQrs(s.banco, s.asaas, "chave-ficticia", resumo, () => agora);
    expect(s.chamadas).toEqual([
      ["criarQr", { referencia: "p1", chavePix: "chave-ficticia", valorCentavos: 7_990, descricao: "Venda nº 12 na Ora 5G", validadeSegundos: 1_800 }],
      ["registrar", "p1", QR.id, QR.copiaECola, QR.imagem, "2026-11-25T15:30:00.000Z"],
      ["criarQr", expect.objectContaining({ referencia: "p2" })],
      ["falhou", "p2", "a Asaas respondeu 400", true],
      ["criarQr", expect.objectContaining({ referencia: "p3" })],
      ["falhou", "p3", "a Asaas respondeu 502", false],
    ]);
    expect(resumo).toMatchObject({ qr_criados: 1, qr_falhas: 2 });
  });

  it("confere: sem resposta, o QR volta para a fila; o pago conta; o que a venda desistiu sai da Asaas; e exclui os cancelados e vencidos", async () => {
    const s = simulados({
      aConferir: [
        { id: "x1", qr_id: "qr1", valor_centavos: 7_990, situacao: "aguardando" },
        { id: "x2", qr_id: "qr2", valor_centavos: 7_990, situacao: "aguardando" },
        { id: "x3", qr_id: "qr3", valor_centavos: 1_000, situacao: "cancelando" },
      ],
      consultas: ["falha", { situacao: "pago", id_no_provedor: "pay_2", valor_centavos: 7_990 }, { situacao: "nenhum" }],
      resultados: ["confirmado", "pode_excluir"],
      aExcluir: [{ id: "x4", qr_id: "qr4" }, { id: "x5", qr_id: "qr5" }],
      excluir: [true, true, false],
    });
    const resumo = await rodadaDoCaixa(s.banco, s.asaas, "chave-ficticia");
    expect(s.chamadas).toEqual([
      ["cobrancas", "qr1"],
      ["cobrancas", "qr2"],
      ["aplicar", "x2", { qr_id: "qr2", situacao: "pago", id_no_provedor: "pay_2", valor_centavos: 7_990 }],
      ["cobrancas", "qr3"],
      ["aplicar", "x3", { qr_id: "qr3", situacao: "nenhum" }],
      ["excluirQr", "qr3"],
      ["excluido", "x3"],
      ["excluirQr", "qr4"],
      ["excluido", "x4"],
      ["excluirQr", "qr5"],
    ]);
    expect(resumo).toEqual({ qr_criados: 0, qr_falhas: 0, qr_conferidos: 2, qr_pagos: 1, qr_excluidos: 2 });
  });
});
