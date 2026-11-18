// As regras da reserva do site (lote ONLINE-b: ORA-ONLINE-006): o formulário, as mensagens, o limite por endereço e o
// aviso no PDV. Quem decide é o banco: packages/banco/src/loja-online-reserva.test.ts.
import { describe, expect, it } from "vitest";

import {
  avisoDaReservaAtendida, avisoDaReservaNoPdv, criarLimitador, enderecoDeQuemPede, erroDaLoja, erroDaReserva, ERROS_DA_LOJA, ERROS_DA_RESERVA, nomeDoFormulario,
  reservasAusentes, tempoAteVencer, whatsappDoFormulario, whatsappLegivel,
} from "./reserva";

describe("a reserva do site: o formulário e as mensagens (ONLINE-b)", () => {
  it("o WhatsApp: só celular com DDD, com ou sem o 55 e a pontuação; o nome: de 2 a 80 letras", () => {
    expect(["(41) 98765-0001", "+55 41 98765-0001", "41987650001", "5541987650001"].map(whatsappDoFormulario)).toEqual(Array(4).fill("41987650001"));
    for (const ruim of ["4133334444", "4198765000", "01987650001", "", 41987650001, null]) expect(whatsappDoFormulario(ruim), String(ruim)).toBeNull();
    expect([nomeDoFormulario("  Maria   da  Silva "), nomeDoFormulario("A"), nomeDoFormulario("x".repeat(81)), nomeDoFormulario(3)]).toEqual(["Maria da Silva", null, null, null]);
  });

  it("cada recusa do banco vira uma mensagem que existe; o PDV só aceita números", () => {
    const casos = [["22023", "dados"], ["OR034", "limite_whatsapp"], ["OR035", "limite_loja"], ["OR001", "sem_estoque"], ["OR036", "indisponivel"], ["P0002", "indisponivel"], ["OR038", "loja_fechada"], ["OR043", "loja_fechada"], ["OR004", "repetida"],
      ["PGRST202", "sem_reserva"], ["42883", "sem_reserva"], ["57014", "falha"]] as const;
    for (const [code, erro] of casos) {
      expect(erroDaReserva({ code })).toBe(erro);
      expect(Object.hasOwn(ERROS_DA_RESERVA, erro)).toBe(true);
    }
    const daLoja = [[{ code: "22023", message: "Esta reserva venceu: venda pelo PDV" }, "vencida"], [{ code: "22023", message: "Esta reserva foi cancelada" }, "cancelada"],
      [{ code: "22023", message: "Esta reserva já foi atendida: a venda segue no PDV" }, "atendida"], [{ code: "22023", message: "Informe o motivo" }, "motivo"],
      [{ code: "P0002" }, "nao_encontrada"], [{ code: "42501" }, "sem_permissao"], [null, "falha"]] as const;
    for (const [erro, esperado] of daLoja) {
      expect(erroDaLoja(erro), JSON.stringify(erro)).toBe(esperado);
      expect(Object.hasOwn(ERROS_DA_LOJA, esperado)).toBe(true);
    }
    expect([avisoDaReservaNoPdv("149900", "159900"), avisoDaReservaNoPdv("x", "1"), avisoDaReservaNoPdv(undefined, "1")]).toEqual([{ anunciado: 149_900, atual: 159_900 }, null, null]);
    expect([whatsappLegivel("41987650001"), whatsappLegivel("123")]).toEqual(["(41) 98765-0001", "123"]);
    // Sem a migration do ONLINE-b, a tela da loja avisa em vez de falhar; outro erro continua sendo falha.
    expect([{ code: "PGRST205" }, { code: "42P01" }, { code: "57014" }, null].map(reservasAusentes)).toEqual([true, true, false, false]);
  });

  it("o aviso do PDV: se o preço subiu depois da reserva, a oferta anunciada vale e o vendedor dá a diferença de desconto", () => {
    const subiu = avisoDaReservaAtendida("139900", "149900");
    expect(subiu.tom).toBe("aviso");
    expect(subiu.texto.replace(/\s/g, " ")).toContain("O preço anunciado foi R$ 1.399,00 e o de hoje é R$ 1.499,00: a oferta vale, dê R$ 100,00 de desconto no item.");
    for (const [anunciado, atual] of [["139900", "139900"], ["149900", "139900"], ["x", "139900"], [undefined, undefined]]) {
      expect(avisoDaReservaAtendida(anunciado, atual), `${anunciado} → ${atual}`).toEqual({ tom: "sucesso", texto: "Venda da reserva do site aberta com a unidade reservada. Confira o cliente, o pagamento e conclua." });
    }
    // ONLINE-d: o pedido do site traz o total; a diferença vira desconto na venda.
    expect(avisoDaReservaAtendida("15800", "17800", true).texto.replace(/\s/g, " ")).toBe(
      "Venda do pedido do site aberta com as unidades reservadas. O total anunciado foi R$ 158,00 e o de hoje é R$ 178,00: a oferta vale, dê R$ 20,00 de desconto na venda.");
    expect(avisoDaReservaAtendida("15800", "15800", true)).toEqual({ tom: "sucesso", texto: "Venda do pedido do site aberta com as unidades reservadas. Confira o cliente, o pagamento e conclua." });
  });

  it("o limite por endereço: 5 por hora, cada endereço o seu; depois da hora, libera; o endereço é o que o servidor de entrada acrescenta", () => {
    let instante = 0;
    const limitar = criarLimitador(5, 3_600_000, () => instante);
    expect([1, 2, 3, 4, 5, 6].map(() => limitar("200.1.1.1"))).toEqual([true, true, true, true, true, false]);
    expect(limitar("200.1.1.2")).toBe(true);
    instante = 3_600_001;
    expect(limitar("200.1.1.1")).toBe(true);
    const cabecalhos = (valores: Record<string, string>) => ({ get: (n: string) => valores[n] ?? null });
    // Quem pede pode mandar um x-forwarded-for inventado; o Apache acrescenta o endereço real no fim, e é ele que conta.
    expect([enderecoDeQuemPede(cabecalhos({ "x-forwarded-for": "1.2.3.4, 200.1.1.1 " })), enderecoDeQuemPede(cabecalhos({ "x-forwarded-for": "200.2.2.2" })),
      enderecoDeQuemPede(cabecalhos({ "x-real-ip": "9.9.9.9" })), enderecoDeQuemPede(cabecalhos({ "x-forwarded-for": " , " }))])
      .toEqual(["200.1.1.1", "200.2.2.2", "desconhecido", "desconhecido"]);
    const agora = Date.parse("2026-11-15T12:00:00Z");
    expect([tempoAteVencer("2026-11-16T12:00:00Z", agora), tempoAteVencer("2026-11-15T12:40:00Z", agora), tempoAteVencer("2026-11-15T11:00:00Z", agora)]).toEqual(["24 h", "40 min", "venceu"]);
  });
});
