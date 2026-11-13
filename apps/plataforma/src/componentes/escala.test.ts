import { describe, expect, it } from "vitest";

import { FOLGA_DOS_ROTULOS, formaDosRotulos, larguraDoRotulo, larguraMinimaDosRotulos, mostrarRotulo, rotulosVisiveis, type EncaixeDosRotulos } from "./escala";

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
