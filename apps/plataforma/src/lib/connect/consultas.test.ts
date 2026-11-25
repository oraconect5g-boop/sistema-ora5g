// As consultas da Nogle que só leem, na tela (lote CONNECT-g): o formulário, as mensagens e cada resposta em português. As
// respostas são as que o domínio guarda a partir dos exemplos oficiais (packages/dominio/src/nogle.test.ts). FICTÍCIAS.
import { describe, expect, it } from "vitest";

import { bytes, erroDaConsulta, lerPedidoDeConsulta, linhasDaResposta, megabytes, tituloDaConsulta } from "./consultas";

const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });
const respondida = (tipo: string, resposta: Record<string, unknown>) => ({ tipo, resposta, situacao: "respondida", resposta_apagada_em: null });

describe("o formulário das consultas (CONNECT-g)", () => {
  it("cada consulta pede o seu: o número com DDD, o ICCID ou nada (a carteira)", () => {
    expect(lerPedidoDeConsulta(formulario({ tipo: "linha_saldo", parametro: "(41) 99999-8888", chave: "k" })))
      .toEqual({ ok: true, pedido: { tipo: "linha_saldo", parametro: "41999998888", chave: "k" } });
    expect(lerPedidoDeConsulta(formulario({ tipo: "iccid_numero", parametro: "8955 1701 1000 0000 016", chave: "k" })))
      .toEqual({ ok: true, pedido: { tipo: "iccid_numero", parametro: "8955170110000000016", chave: "k" } });
    expect(lerPedidoDeConsulta(formulario({ tipo: "carteira_saldo", parametro: "qualquer", chave: "k" })))
      .toEqual({ ok: true, pedido: { tipo: "carteira_saldo", parametro: null, chave: "k" } });
    expect(lerPedidoDeConsulta(formulario({ tipo: "linha_detalhes", parametro: "8955170110000000016", chave: "k" }))).toEqual({ ok: false, erro: "linha" });
    expect(lerPedidoDeConsulta(formulario({ tipo: "iccid_ativacao", parametro: "41999998888", chave: "k" }))).toEqual({ ok: false, erro: "iccid" });
    expect(lerPedidoDeConsulta(formulario({ tipo: "bloquear_linha", parametro: "41999998888", chave: "k" }))).toEqual({ ok: false, erro: "tipo" });
    expect(lerPedidoDeConsulta(formulario({ tipo: "linha_saldo", parametro: "41999998888" }))).toEqual({ ok: false, erro: "falha" });
  });

  it("o erro do banco vira a mensagem", () => {
    expect(erroDaConsulta({ code: "OR056" })).toBe("limite");
    expect(erroDaConsulta({ code: "42501" })).toBe("sem_permissao");
    expect(erroDaConsulta({ code: "22023" })).toBe("dados");
    expect(erroDaConsulta({ code: "XX000" })).toBe("falha");
    expect(erroDaConsulta(null)).toBe("falha");
  });
});

describe("cada resposta em português (CONNECT-g)", () => {
  it("a situação da linha, com o titular mascarado, as datas e os avisos", () => {
    expect(linhasDaResposta(respondida("linha_detalhes", {
      linha: "51900000000", status: "ATIVO", bloqueada: true, plano: "7 GB", tipo_linha: "PRÉ PAGO", esim: false, portada: true,
      titular: "Cliente Fictício", documento: "•••.•••.000-00", data_ativacao: "2023-05-30", data_fim_plano: "2023-06-30",
      data_perda_numero: "2023-09-13", recarga_automatica: true, recarga_automatica_plano: "7 GB", data_cancelamento: null, motivo_cancelamento: null,
    }))).toEqual([
      "Linha (51) 90000-0000 · ATIVO · BLOQUEADA",
      "Plano 7 GB · PRÉ PAGO · portada",
      "Titular: Cliente Fictício (•••.•••.000-00)",
      "Ativada em 30/05/2023, o plano vai até 30/06/2023.",
      "Sem recarga, o cliente perde o número em 13/09/2023.",
      "Recarga automática ativa (7 GB).",
    ]);
    expect(linhasDaResposta(respondida("linha_detalhes", { linha: "51900000000", status: "CANCELADO", data_cancelamento: "2024-01-10", motivo_cancelamento: "EX" })))
      .toContain("Cancelada em 10/01/2024: Expirou: 75 dias sem recarga depois do fim do plano.");
  });

  it("o saldo, as recargas, o consumo, o número e a ativação do chip e a carteira", () => {
    expect(linhasDaResposta(respondida("linha_saldo", { dados_mb: 2395.226721, minutos: 1000, minutos_ilimitados: true, sms: 60 }))).toEqual([
      "Internet: 2,34 GB", "Minutos: ilimitados", "SMS: 60", "A Nogle atualiza o saldo a cada 30 minutos, mais ou menos.",
    ]);
    expect(linhasDaResposta(respondida("linha_historico", { recargas: [{ quando: "2022-06-15 11:59", plano: "7 GB", valor_centavos: 4490, forma: "LINK" }] })))
      .toEqual(["15/06/2022 às 11:59 · 7 GB · R$ 44,90 · LINK"]);
    expect(linhasDaResposta(respondida("linha_historico", { recargas: [] }))).toEqual(["Nenhuma recarga nesta linha."]);
    expect(linhasDaResposta(respondida("linha_consumo", { total_bytes: 3 * 1024 ** 3, dias: [{ dia: "2026-11-01", bytes: 1024 ** 3 }, { dia: "2026-11-02", bytes: 0 }, { dia: "2026-11-03", bytes: 2 * 1024 ** 3 }] })))
      .toEqual(["No mês: 3 GB", "01/11/2026: 1 GB", "03/11/2026: 2 GB"]);
    expect(linhasDaResposta(respondida("iccid_numero", { numero: "41999998888" }))).toEqual(["Número da linha: (41) 99999-8888"]);
    expect(linhasDaResposta(respondida("iccid_ativacao", {
      cliente: "Cliente Fictício", plano: "4 GB", numero_ativado: "11000000000", numero_portado: null, forma_pagamento: "SALDO",
      data_solicitacao: "2021-12-03 14:36", data_ativacao: "2021-12-03 14:36",
    }))).toEqual(["Ativado em 03/12/2021 às 14:36 · número (11) 00000-0000", "Plano 4 GB · pago por SALDO", "Cliente: Cliente Fictício"]);
    expect(linhasDaResposta(respondida("carteira_saldo", { saldo_centavos: 50000 }))).toEqual(["Saldo: R$ 500,00"]);
  });

  it("sem resposta guardada (apagada em 24 h ou não respondida), nada inventado", () => {
    expect(linhasDaResposta({ tipo: "linha_saldo", resposta: null, situacao: "respondida", resposta_apagada_em: "2026-11-24T10:00:00Z" }))
      .toEqual(["A resposta foi apagada depois de 24 horas (ela pode ter o nome do titular)."]);
    expect(linhasDaResposta({ tipo: "linha_saldo", resposta: null, situacao: "falhou", resposta_apagada_em: null })).toEqual([]);
    expect(tituloDaConsulta({ tipo: "linha_saldo", parametro: "41999998888" })).toBe("Saldo da linha · (41) 99999-8888");
    expect(tituloDaConsulta({ tipo: "carteira_saldo", parametro: null })).toBe("Saldo da carteira da Ora");
    expect(megabytes(512)).toBe("512 MB");
    expect(bytes(1536 * 1024 * 1024)).toBe("1,5 GB");
  });
});
