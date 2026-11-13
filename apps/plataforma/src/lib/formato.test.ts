import { describe, expect, it } from "vitest";

import { escala, mostrarRotulo } from "../componentes/escala";
import { brl, brlCompacto, brlCompactoComSinal, brlComSinal, brlEixo, brlEixoComSinal, dataCurta, iniciais, minutosEmSaoPaulo, percentual, percentualComSinal, percentualDePontosBase, saudacao, variacao } from "./formato";

describe("formatos brasileiros na tela", () => {
  it("percentual usa vírgula decimal (antes aparecia 18.5%)", () => {
    expect(percentual(0.185)).toBe("18,5%");
    expect(percentualDePontosBase(1_850)).toBe("18,5%");
    expect(percentualDePontosBase(-10)).toBe("-0,1%");
  });

  it("percentual que pode ficar abaixo de zero leva o \"−\" tipográfico; o positivo não muda", () => {
    expect(percentualComSinal(-0.042)).toBe("−4,2%");
    expect(percentualComSinal(0.324)).toBe(percentual(0.324));
    expect(percentualComSinal(0)).toBe("0%");
    expect(percentualComSinal(-0.0001)).toBe("0%");
  });

  it("dinheiro cheio, compacto e de eixo", () => {
    expect(brl(219_900)).toBe("R$ 2.199,00");
    expect(brlCompacto(999_99)).toBe("R$ 999,99");
    expect(brlCompacto(12_840_000)).toBe("R$ 128,4 mil");
    expect(brlCompacto(27_000_000)).toBe("R$ 270 mil");
    expect(brlEixo(0)).toBe("R$ 0");
    expect(brlEixo(2_000_000)).toBe("R$ 20 mil");
  });

  it("dinheiro abaixo de zero leva o sinal antes do \"R$\"; o positivo não muda", () => {
    expect(brlComSinal(-6_050)).toBe("−R$ 60,50");
    expect(brlComSinal(6_050)).toBe(brl(6_050));
    expect(brlComSinal(0)).toBe("R$ 0,00");
    expect(brlCompactoComSinal(-12_840_000)).toBe("−R$ 128,4 mil");
    expect(brlCompactoComSinal(-99_999)).toBe("−R$ 999,99");
    expect(brlEixoComSinal(-500_000)).toBe("−R$ 5 mil");
    expect(brlEixoComSinal(0)).toBe("R$ 0");
    expect(brlEixoComSinal(2_000_000)).toBe("R$ 20 mil");
  });

  it("variação com sinal e sem ruído perto de zero", () => {
    expect(variacao(0.128)).toBe("+12,8%");
    expect(variacao(-0.031)).toBe("−3,1%");
    expect(variacao(0.0001)).toBe("0%");
    expect(variacao(Number.NaN)).toBe("—");
  });

  it("data, hora e saudação no fuso de São Paulo (UTC−3)", () => {
    const meioDiaUtc = new Date("2026-11-07T12:00:00Z");
    expect(dataCurta(meioDiaUtc)).toBe("07/11/2026");
    expect(minutosEmSaoPaulo(meioDiaUtc)).toBe(9 * 60);
    expect(saudacao(meioDiaUtc)).toBe("Bom dia");
    expect(saudacao(new Date("2026-11-07T18:30:00Z"))).toBe("Boa tarde");
    expect(saudacao(new Date("2026-11-07T23:30:00Z"))).toBe("Boa noite");
    expect(dataCurta(new Date("2026-11-08T02:00:00Z"))).toBe("07/11/2026");
  });

  it("iniciais ignoram o aviso entre parênteses", () => {
    expect(iniciais("Ana Souza (fictícia)")).toBe("AS");
    expect(iniciais("Téo")).toBe("T");
  });
});

describe("eixos dos gráficos", () => {
  it("escala arredonda o topo e reparte em marcas redondas", () => {
    expect(escala(29_000)).toEqual({ topo: 30_000, marcas: [0, 10_000, 20_000, 30_000] });
    expect(escala(0)).toEqual({ topo: 1, marcas: [0, 1] });
  });

  it("rótulos do eixo X não encostam no último (\"06/11\" colado em \"Hoje\")", () => {
    const visiveis = Array.from({ length: 14 }, (_, i) => i).filter((i) => mostrarRotulo(i, 14, 2));
    expect(visiveis).toEqual([0, 2, 4, 6, 8, 10, 13]);
    expect(Array.from({ length: 11 }, (_, i) => mostrarRotulo(i, 11, 1)).every(Boolean)).toBe(true);
  });
});
