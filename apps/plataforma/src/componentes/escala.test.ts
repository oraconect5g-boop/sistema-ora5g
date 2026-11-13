import { describe, expect, it } from "vitest";

import { escala, escalaComPiso, FOLGA_DOS_ROTULOS, formaDosRotulos, larguraDoRotulo, larguraMinimaDosRotulos, mostrarRotulo, rotulosVisiveis, trechosComValor, type EncaixeDosRotulos } from "./escala";

const dias = (dia: number, mes: number, quantos: number) =>
  Array.from({ length: quantos }, (_, i) => {
    const data = new Date(Date.UTC(2026, mes - 1, dia + i));
    return `${String(data.getUTCDate()).padStart(2, "0")}/${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
  });
const horas = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => `${String(de + i).padStart(2, "0")}h`);
/** A mesma regra das telas: quanto mais pontos, menos rótulos. */
const cada = (pontos: number) => (pontos > 16 ? 3 : pontos > 8 ? 2 : 1);

// Larguras do gráfico (sem a régua de valores) medidas no navegador: celulares de 320, 360, 390 e
// 414 px de tela, e o computador.
const CELULARES = [198, 238, 268, 292];
const COMPUTADOR = [614, 778];

const EIXOS: Record<string, string[]> = {
  "7 dias": dias(4, 11, 7),
  "14 dias, com Hoje": [...dias(28, 10, 13), "Hoje"],
  "30 dias": dias(12, 10, 30),
  "24 horas": horas(0, 23),
  "15 horas": horas(7, 21),
  "9 horas": horas(7, 15),
  "um ponto": ["Hoje"],
  "dois pontos": ["09/11", "10/11"],
};
const ENCAIXES: EncaixeDosRotulos[] = ["pontos", "colunas"];

const visiveis = (rotulos: string[], largura: number, encaixe: EncaixeDosRotulos = "pontos") =>
  rotulosVisiveis(larguraMinimaDosRotulos(rotulos, cada(rotulos.length), encaixe), largura).map((i) => rotulos[i]);

describe("largura estimada dos rótulos de eixo", () => {
  it("bate com o que o navegador mediu (os algarismos não têm a mesma largura)", () => {
    expect(["04/11", "10/11", "28/10", "08/08", "00h", "07h", "11h", "12:00", "nov/26"].map(larguraDoRotulo)).toEqual([28, 26, 33, 39, 25, 22, 15, 32, 40]);
  });

  it("caractere fora da lista conta pelo padrão, sem zerar", () => {
    expect(larguraDoRotulo("%")).toBe(8);
    expect(larguraDoRotulo("")).toBe(0);
  });
});

describe("rótulos do eixo X conforme a largura do gráfico", () => {
  it("no celular, 7 dias mostram dia sim, dia não; a partir de 300 px, todos", () => {
    for (const largura of [198, 238, 268]) expect(visiveis(EIXOS["7 dias"] ?? [], largura)).toEqual(["04/11", "06/11", "08/11", "10/11"]);
    expect(visiveis(EIXOS["7 dias"] ?? [], 300)).toEqual(EIXOS["7 dias"]);
  });

  it("30 dias: três datas no celular estreito, cinco no largo, e as dez de hoje no computador", () => {
    const mes = EIXOS["30 dias"] ?? [];
    expect(visiveis(mes, 238)).toEqual(["12/10", "24/10", "10/11"]);
    expect(visiveis(mes, 268)).toEqual(["12/10", "18/10", "24/10", "30/10", "10/11"]);
    expect(visiveis(mes, 614)).toEqual(["12/10", "15/10", "18/10", "21/10", "24/10", "27/10", "30/10", "02/11", "05/11", "10/11"]);
  });

  it("um dia inteiro por hora cabe no celular de 6 em 6 horas", () => {
    expect(visiveis(EIXOS["24 horas"] ?? [], 198)).toEqual(["00h", "06h", "12h", "18h", "23h"]);
    expect(visiveis(EIXOS["24 horas"] ?? [], 614)).toEqual(["00h", "03h", "06h", "09h", "12h", "15h", "18h", "23h"]);
  });

  it("colunas: o rótulo fica no meio da coluna e pede menos largura que o da linha", () => {
    expect(visiveis(EIXOS["30 dias"] ?? [], 198, "colunas")).toEqual(["12/10", "18/10", "24/10", "30/10", "10/11"]);
    expect(visiveis(EIXOS["14 dias, com Hoje"] ?? [], 238, "colunas")).toEqual(["28/10", "01/11", "05/11", "Hoje"]);
  });

  describe.each(Object.entries(EIXOS))("%s", (_nome, rotulos) => {
    it.each(ENCAIXES)("%s: em nenhuma largura dois rótulos à vista ficam a menos da folga", (encaixe) => {
      const minimos = larguraMinimaDosRotulos(rotulos, cada(rotulos.length), encaixe);
      const formas = formaDosRotulos(rotulos, encaixe);
      for (let largura = 100; largura <= 1400; largura += 2) {
        const caixas = rotulosVisiveis(minimos, largura).map((i) => {
          const forma = formas[i] ?? { ancora: 0, antes: 0, depois: 0 };
          return { inicio: forma.ancora * largura - forma.antes, fim: forma.ancora * largura + forma.depois };
        });
        const folgas = caixas.slice(1).map((caixa, k) => caixa.inicio - (caixas[k]?.fim ?? 0));
        expect(Math.min(FOLGA_DOS_ROTULOS, ...folgas), `largura ${largura}`).toBeGreaterThanOrEqual(FOLGA_DOS_ROTULOS - 1e-9);
      }
    });

    it.each(ENCAIXES)("%s: o último aparece sempre, quem aparece continua nas larguras maiores e a tela grande não muda", (encaixe) => {
      const minimos = larguraMinimaDosRotulos(rotulos, cada(rotulos.length), encaixe);
      expect(minimos).toHaveLength(rotulos.length);
      expect(minimos.at(-1)).toBe(0);
      const deHoje = rotulos.flatMap((_, i) => (mostrarRotulo(i, rotulos.length, cada(rotulos.length)) ? [i] : []));
      expect(minimos.flatMap((minimo, i) => (minimo === null ? [] : [i]))).toEqual(deHoje);
      for (const largura of COMPUTADOR) expect(rotulosVisiveis(minimos, largura)).toEqual(deHoje);
      // No celular sobra o primeiro, o último e pelo menos um no meio quando o eixo tem pontos para isso.
      for (const largura of CELULARES) expect(rotulosVisiveis(minimos, largura).length).toBeGreaterThanOrEqual(Math.min(3, deHoje.length));
    });
  });

  it("eixo vazio não quebra e passo inválido vale 1", () => {
    expect(larguraMinimaDosRotulos([], 3)).toEqual([]);
    expect(larguraMinimaDosRotulos(["a", "b", "c"], 0).every((minimo) => minimo !== null)).toBe(true);
  });
});

describe("escala com valores abaixo de zero", () => {
  it("sem valor negativo é a escala de sempre, com o piso em zero", () => {
    for (const maximo of [0, 1, 7, 29_000, 450_000, 12_345_678]) expect(escalaComPiso(0, maximo)).toEqual({ piso: 0, ...escala(maximo) });
    expect(escalaComPiso(120, 29_000)).toEqual({ piso: 0, topo: 30_000, marcas: [0, 10_000, 20_000, 30_000] });
    expect(escalaComPiso(Number.NaN, 29_000)).toEqual({ piso: 0, ...escala(29_000) });
  });

  it("com valor negativo o zero é uma das marcas e o piso cobre o menor valor", () => {
    expect(escalaComPiso(-6_050, 42_000)).toEqual({ piso: -20_000, topo: 60_000, marcas: [-20_000, 0, 20_000, 40_000, 60_000] });
    expect(escalaComPiso(-30_000, -5_000)).toEqual({ piso: -30_000, topo: 0, marcas: [-30_000, -20_000, -10_000, 0] });
    expect(escalaComPiso(-100, 1_000_000)).toEqual({ piso: -500_000, topo: 1_000_000, marcas: [-500_000, 0, 500_000, 1_000_000] });
    expect(escalaComPiso(-1, 0)).toEqual({ piso: -1, topo: 0, marcas: [-1, -0.75, -0.5, -0.25, 0] });
  });

  it("em qualquer par de valores: cobre os dois extremos, passo igual e poucas marcas", () => {
    for (const minimo of [-1, -37, -999, -6_050, -250_000, -9_999_999]) {
      for (const maximo of [-1, 0, 3, 480, 42_000, 1_234_567, 88_000_000]) {
        const { piso, topo, marcas } = escalaComPiso(minimo, maximo);
        expect(piso, `${minimo}..${maximo}`).toBeLessThanOrEqual(minimo);
        expect(topo, `${minimo}..${maximo}`).toBeGreaterThanOrEqual(Math.max(0, maximo));
        expect(marcas[0]).toBe(piso);
        expect(marcas.at(-1)).toBeCloseTo(topo, 6);
        expect(marcas.filter((marca) => Object.is(marca, 0))).toHaveLength(1);
        expect(marcas.length).toBeGreaterThanOrEqual(2);
        expect(marcas.length).toBeLessThanOrEqual(7);
        const passos = marcas.slice(1).map((marca, i) => marca - (marcas[i] ?? 0));
        for (const passo of passos) expect(passo).toBeCloseTo(passos[0] ?? 0, 6);
      }
    }
  });
});

describe("trechos de uma linha com pontos sem valor", () => {
  it("a linha se interrompe onde falta valor e cada ponto guarda o lugar dele no eixo", () => {
    expect(trechosComValor([10, 20, null, 30, null, null, 40, 50])).toEqual([
      [{ indice: 0, valor: 10 }, { indice: 1, valor: 20 }],
      [{ indice: 3, valor: 30 }],
      [{ indice: 6, valor: 40 }, { indice: 7, valor: 50 }],
    ]);
  });

  it("zero é valor (não interrompe); série inteira, vazia ou só com faltas", () => {
    expect(trechosComValor([0, -5, 0])).toEqual([[{ indice: 0, valor: 0 }, { indice: 1, valor: -5 }, { indice: 2, valor: 0 }]]);
    expect(trechosComValor([])).toEqual([]);
    expect(trechosComValor([null, undefined, null])).toEqual([]);
    expect(trechosComValor([null, 7])).toEqual([[{ indice: 1, valor: 7 }]]);
  });
});
