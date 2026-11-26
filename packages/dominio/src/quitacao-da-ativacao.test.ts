// AUD-f (auditoria de e7f55b2), item 5: a ativação paga pela Asaas, só os estados e as regras, com a saída SIMULADA (nenhuma
// chamada de verdade, nenhum dinheiro). Ids, chaves Pix, nomes e valores FICTÍCIOS; os códigos Pix montados no formato do BR
// Code (com o CRC calculado aqui).
import { describe, expect, it } from "vitest";

import {
  aplicarEvento, cancelarQuitacao, conferirCodigoDaNogle, crcDoBrCode, enviarSaida, lerBrCode, novaQuitacao, reconciliarSaida, reservaQueVolta, reservarSaida,
  SAIDA_DESLIGADA, type ConsultaDaSaida, type Quitacao, type ResultadoDaSaida, type SaidaPorPix,
} from "./quitacao-da-ativacao";

const tlv = (id: string, v: string) => `${id}${String(v.length).padStart(2, "0")}${v}`;
function brCode(o: { chave: string; nome: string; valor?: string }) {
  const corpo = tlv("00", "01") + tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", o.chave)) + tlv("52", "0000") + tlv("53", "986") + (o.valor ? tlv("54", o.valor) : "")
    + tlv("58", "BR") + tlv("59", o.nome) + tlv("60", "CURITIBA") + tlv("62", tlv("05", "***")) + "6304";
  return corpo + crcDoBrCode(corpo);
}
const NOGLE = { chave: "nogle-ficticia@exemplo.invalid", nome: "NOGLE FICTICIA" };
const REGRAS = { favorecido: NOGLE, limite_por_saida_centavos: 10_000, tarifa_maxima_centavos: 100 };
const CODIGO = brCode({ ...NOGLE, valor: "44.90" });
const nova = (ativacao = "atv-1", loja = "loja-a") => novaQuitacao({ ativacao, loja, plano: "1718", valor_centavos: 4_490 });
const asaas = (id: string, status: string, valor_centavos = 4_490) => ({ tipo: "asaas" as const, id, status, valor_centavos });
/** A quitação com o saldo do cliente disponível (o Pix vai direto para RECEIVED). */
const comSaldo = (q: Quitacao = nova()) => aplicarEvento(q, asaas(`${q.ativacao}:r`, "RECEIVED"));

/** A saída simulada: responde o roteiro, guarda os pedidos e nunca debita duas vezes a mesma chave. */
function simulador(respostas: ResultadoDaSaida[], consulta: ConsultaDaSaida = { resultado: "nao_encontrada" }) {
  const pedidos: string[] = [];
  const saida: SaidaPorPix = {
    pagar: async (p) => { pedidos.push(p.chave); return respostas.shift() ?? { resultado: "sem_resposta" }; },
    consultar: async () => consulta,
  };
  return { saida, pedidos };
}

describe("os quatro estados que não se confundem (AUD-f)", () => {
  it("cliente pagou (CONFIRMED) não é saldo disponível; só o RECEIVED deixa reservar; a saída confirmada não é a linha ativa", async () => {
    let q = aplicarEvento(nova(), asaas("e1", "CONFIRMED"));
    expect(q.etapa).toBe("cliente_pagou");
    const saldo = { disponivel_centavos: 50_000, reservado_centavos: 0 };
    expect(reservarSaida(q, saldo, "k1")).toEqual({ ok: false, recusa: "etapa" });
    q = aplicarEvento(q, asaas("e2", "RECEIVED"));
    expect(q.etapa).toBe("saldo_disponivel");
    const reservada = reservarSaida(q, saldo, "k1");
    if (!reservada.ok) throw new Error("devia reservar");
    expect(reservada.saldo).toEqual({ disponivel_centavos: 50_000, reservado_centavos: 4_490 });
    const { saida, pedidos } = simulador([{ resultado: "confirmada", transacao: "tx-1" }]);
    const enviada = await enviarSaida(reservada.quitacao, reservada.saldo, CODIGO, saida);
    expect(enviada.quitacao).toMatchObject({ etapa: "saida_confirmada", saida: { chave: "k1", transacao: "tx-1" }, chip: "reservado" });
    expect(enviada.saldo).toEqual({ disponivel_centavos: 45_510, reservado_centavos: 0 });
    expect(pedidos).toEqual(["k1"]);
    q = aplicarEvento(enviada.quitacao, { tipo: "linha", id: "l1", ativa: false });
    expect(q.etapa).toBe("saida_confirmada");
    q = aplicarEvento(q, { tipo: "linha", id: "l2", ativa: true });
    expect(q).toMatchObject({ etapa: "linha_ativa", chip: "ativado" });
  });

  it("o evento repetido não muda nada; o fora de ordem (o CONFIRMED depois do RECEIVED) não volta a etapa", () => {
    const q = comSaldo();
    expect(aplicarEvento(q, asaas(`${q.ativacao}:r`, "RECEIVED"))).toBe(q);
    const depois = aplicarEvento(q, asaas("e-atrasado", "CONFIRMED"));
    expect(depois.etapa).toBe("saldo_disponivel");
    expect(aplicarEvento(depois, asaas("e-pendente", "PENDING")).etapa).toBe("saldo_disponivel");
  });

  it("o valor pago diferente vai para a gerência; a linha ativa sem a saída confirmada também; a saída confirmada sem linha em 24 horas, também", async () => {
    expect(aplicarEvento(nova(), asaas("e1", "RECEIVED", 4_000))).toMatchObject({ etapa: "conferencia", motivo: "o valor pago na Asaas é outro" });
    expect(aplicarEvento(comSaldo(), { tipo: "linha", id: "l1", ativa: true })).toMatchObject({ etapa: "conferencia" });
    const r = reservarSaida(comSaldo(), { disponivel_centavos: 10_000, reservado_centavos: 0 }, "k1");
    if (!r.ok) throw new Error("devia reservar");
    const { quitacao } = await enviarSaida(r.quitacao, r.saldo, CODIGO, simulador([{ resultado: "confirmada", transacao: "tx-1" }]).saida);
    expect(aplicarEvento(quitacao, { tipo: "prazo", id: "p1", horas_sem_linha: 23 }).etapa).toBe("saida_confirmada");
    expect(aplicarEvento(quitacao, { tipo: "prazo", id: "p2", horas_sem_linha: 24 })).toMatchObject({ etapa: "conferencia", motivo: "Nogle paga há 24 horas e a linha ainda não está ativa" });
  });
});

describe("o saldo, a concorrência e a saída uma vez só (AUD-f)", () => {
  it("o saldo insuficiente não reserva; duas lojas não gastam o mesmo saldo", () => {
    expect(reservarSaida(comSaldo(), { disponivel_centavos: 4_000, reservado_centavos: 0 }, "k1")).toEqual({ ok: false, recusa: "saldo_insuficiente" });
    const saldo = { disponivel_centavos: 6_000, reservado_centavos: 0 };
    const daLojaA = reservarSaida(comSaldo(nova("atv-a", "loja-a")), saldo, "ka");
    if (!daLojaA.ok) throw new Error("a primeira devia reservar");
    expect(reservarSaida(comSaldo(nova("atv-b", "loja-b")), daLojaA.saldo, "kb")).toEqual({ ok: false, recusa: "saldo_insuficiente" });
    // A mesma ativação não reserva duas vezes.
    expect(reservarSaida(daLojaA.quitacao, daLojaA.saldo, "ka2")).toEqual({ ok: false, recusa: "etapa" });
  });

  it("a saída sem resposta nunca se reenvia: só se reconcilia pela chave; confirmada, segue; não encontrada, vai para a gerência", async () => {
    const r = reservarSaida(comSaldo(), { disponivel_centavos: 10_000, reservado_centavos: 0 }, "k1");
    if (!r.ok) throw new Error("devia reservar");
    const sem = simulador([{ resultado: "sem_resposta" }], { resultado: "confirmada", transacao: "tx-9" });
    const enviada = await enviarSaida(r.quitacao, r.saldo, CODIGO, sem.saida);
    expect(enviada.quitacao.etapa).toBe("saida_sem_resposta");
    expect(enviada.saldo.reservado_centavos).toBe(4_490);
    expect((await enviarSaida(enviada.quitacao, enviada.saldo, CODIGO, sem.saida)).quitacao.etapa).toBe("saida_sem_resposta");
    expect(sem.pedidos).toEqual(["k1"]);
    const conciliada = await reconciliarSaida(enviada.quitacao, enviada.saldo, sem.saida);
    expect(conciliada.quitacao).toMatchObject({ etapa: "saida_confirmada", saida: { transacao: "tx-9" } });
    expect(conciliada.saldo).toEqual({ disponivel_centavos: 5_510, reservado_centavos: 0 });
    const perdida = await reconciliarSaida(enviada.quitacao, enviada.saldo, simulador([], { resultado: "nao_encontrada" }).saida);
    expect(perdida.quitacao).toMatchObject({ etapa: "conferencia" });
    expect(perdida.saldo.reservado_centavos).toBe(4_490); // a gerência decide: nada volta sozinho
  });

  it("desligada (o padrão): a saída é recusada, nada sai e a reserva volta", async () => {
    const r = reservarSaida(comSaldo(), { disponivel_centavos: 10_000, reservado_centavos: 0 }, "k1");
    if (!r.ok) throw new Error("devia reservar");
    const { quitacao, saldo } = await enviarSaida(r.quitacao, r.saldo, CODIGO, SAIDA_DESLIGADA);
    expect(quitacao).toMatchObject({ etapa: "saldo_disponivel", saida: null });
    expect(quitacao.motivo).toMatch(/desligada/);
    expect(saldo).toEqual({ disponivel_centavos: 10_000, reservado_centavos: 0 });
  });
});

describe("o cancelamento, o estorno, a contestação e o chip (AUD-f)", () => {
  it("cancelar só antes de o cliente pagar (o chip volta); depois, o caminho é o estorno", () => {
    expect(cancelarQuitacao(nova())).toMatchObject({ ok: true, quitacao: { etapa: "cancelada", chip: "liberado" } });
    expect(cancelarQuitacao(comSaldo())).toEqual({ ok: false, motivo: "o cliente já pagou: o caminho é o estorno na Asaas" });
  });

  it("o estorno antes da saída: estornada, o chip volta e a reserva também; depois da saída, a gerência confere", async () => {
    const r = reservarSaida(comSaldo(), { disponivel_centavos: 10_000, reservado_centavos: 0 }, "k1");
    if (!r.ok) throw new Error("devia reservar");
    const estornada = aplicarEvento(r.quitacao, asaas("e9", "REFUNDED"));
    expect(estornada).toMatchObject({ etapa: "estornada", chip: "liberado", saida: null });
    expect(reservaQueVolta(r.quitacao, estornada)).toBe(4_490);
    const { quitacao } = await enviarSaida(r.quitacao, r.saldo, CODIGO, simulador([{ resultado: "confirmada", transacao: "tx-1" }]).saida);
    expect(aplicarEvento(quitacao, asaas("e10", "REFUNDED"))).toMatchObject({ etapa: "conferencia", motivo: "estorno ao cliente depois da saída à Nogle: confira com a Nogle" });
  });

  it("o estorno em andamento e a contestação bloqueiam a reserva e a saída já reservada", async () => {
    const bloqueada = aplicarEvento(comSaldo(), asaas("e1", "REFUND_IN_PROGRESS"));
    expect(bloqueada).toMatchObject({ etapa: "saldo_disponivel", bloqueio: "estorno pedido ou em andamento: não pague a Nogle" });
    expect(reservarSaida(bloqueada, { disponivel_centavos: 10_000, reservado_centavos: 0 }, "k1")).toEqual({ ok: false, recusa: "bloqueada" });
    const r = reservarSaida(comSaldo(nova("atv-2")), { disponivel_centavos: 10_000, reservado_centavos: 0 }, "k2");
    if (!r.ok) throw new Error("devia reservar");
    const contestada = aplicarEvento(r.quitacao, asaas("e2", "CHARGEBACK_REQUESTED"));
    expect(contestada.bloqueio).toBe("contestação (chargeback) aberta: não pague a Nogle");
    const sim = simulador([{ resultado: "confirmada", transacao: "tx" }]);
    expect((await enviarSaida(contestada, r.saldo, CODIGO, sim.saida)).quitacao.etapa).toBe("saida_reservada");
    expect(sim.pedidos).toEqual([]);
  });
});

describe("o código da Nogle conferido antes de pagar (AUD-f)", () => {
  it("o BR Code lido: a chave, o nome e o valor; o CRC errado ou a forma errada, nada", () => {
    expect(lerBrCode(CODIGO)).toEqual({ chave: NOGLE.chave, nome: NOGLE.nome, valor_centavos: 4_490 });
    expect(lerBrCode(`${CODIGO.slice(0, -1)}${CODIGO.endsWith("0") ? "1" : "0"}`)).toBeNull();
    expect(lerBrCode("https://pagamento.exemplo.invalido/abc")).toBeNull();
  });

  it("só paga o Pix do favorecido da Nogle, do valor da ativação, dentro do limite e da tarifa; o link do sistema não é Pix", () => {
    const q = comSaldo();
    expect(conferirCodigoDaNogle(q, CODIGO, REGRAS, 0)).toEqual({ ok: true });
    expect(conferirCodigoDaNogle(q, "https://pagamento.exemplo.invalido/abc", REGRAS, 0)).toEqual({ ok: false, recusa: "link_nao_e_pix" });
    expect(conferirCodigoDaNogle(q, "000201qualquer", REGRAS, 0)).toEqual({ ok: false, recusa: "codigo_invalido" });
    expect(conferirCodigoDaNogle(q, brCode({ chave: "outra@exemplo.invalid", nome: NOGLE.nome, valor: "44.90" }), REGRAS, 0)).toEqual({ ok: false, recusa: "outro_favorecido" });
    expect(conferirCodigoDaNogle(q, brCode({ ...NOGLE, valor: "40.00" }), REGRAS, 0)).toEqual({ ok: false, recusa: "outro_valor" });
    expect(conferirCodigoDaNogle(q, brCode(NOGLE), REGRAS, 0)).toEqual({ ok: false, recusa: "outro_valor" }); // sem valor no código
    expect(conferirCodigoDaNogle(q, CODIGO, { ...REGRAS, limite_por_saida_centavos: 4_000 }, 0)).toEqual({ ok: false, recusa: "acima_do_limite" });
    expect(conferirCodigoDaNogle(q, CODIGO, REGRAS, 101)).toEqual({ ok: false, recusa: "tarifa_alta" });
  });
});
