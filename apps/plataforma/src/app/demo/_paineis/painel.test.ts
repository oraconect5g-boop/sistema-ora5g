// Gráfico principal do início da gestão (visual de 10/11/2026): janelas de período e comparação.
import { describe, expect, it } from "vitest";

import { caminhoSuave } from "../../../componentes/graficos";
import { periodoDoPainel, serieDoPainel } from "./PainelGestao";

const hoje = new Date("2026-11-10T15:00:00-03:00");
// 30 dias de histórico (índice 0 = há 30 dias; 29 = ontem), faturamento = 1000 + índice.
const historico = Array.from({ length: 30 }, (_, i) => ({ faturamento: 1000 + i, vendas: 1, telecom: 0, custo: 0, descontos: 0 }));
const porHora = Array.from({ length: 11 }, (_, i) => ({ hora: `${String(9 + i).padStart(2, "0")}h`, valor: 100 * (i + 1) }));
const dados = { porHora, historico, faturamentoHoje: 5000, hoje };

describe("período do gráfico", () => {
  it("só aceita hoje, 7 e 14; o resto (inclusive repetido na URL) vira hoje", () => {
    expect(periodoDoPainel("7")).toBe("7");
    expect(periodoDoPainel("14")).toBe("14");
    expect(periodoDoPainel("30")).toBe("hoje");
    expect(periodoDoPainel(["7", "14"])).toBe("hoje");
    expect(periodoDoPainel(undefined)).toBe("hoje");
  });
});

describe("serieDoPainel", () => {
  it("hoje: as horas do dia contra ontem repartido por hora, somando o total de ontem", () => {
    const s = serieDoPainel("hoje", dados);
    expect(s.rotulos).toEqual(porHora.map((h) => h.hora));
    expect(s.atual).toEqual(porHora.map((h) => h.valor));
    expect(s.nomes).toEqual(["Hoje", "Ontem"]);
    const somaOntem = s.anterior.reduce((a, b) => a + b, 0);
    expect(Math.abs(somaOntem - 1029)).toBeLessThanOrEqual(s.anterior.length); // só o arredondamento
  });

  it("7 dias: os 6 últimos dias do histórico e hoje, contra os 7 dias antes deles", () => {
    const s = serieDoPainel("7", dados);
    expect(s.rotulos).toHaveLength(7);
    expect(s.rotulos.at(-1)).toBe("Hoje");
    expect(s.rotulos[0]).toBe("04/11");
    expect(s.atual).toEqual([1024, 1025, 1026, 1027, 1028, 1029, 5000]);
    expect(s.anterior).toEqual([1017, 1018, 1019, 1020, 1021, 1022, 1023]); // de 13 a 7 dias atrás
  });

  it("14 dias: cabe no histórico de 30 dias sem repetir dia entre os dois períodos", () => {
    const s = serieDoPainel("14", dados);
    expect(s.atual).toHaveLength(14);
    expect(s.anterior).toHaveLength(14);
    expect(s.anterior[0]).toBe(1003);
    expect(s.anterior.at(-1)).toBe(1016);
    expect(s.atual[0]).toBe(1017);
  });
});

describe("curva suave", () => {
  it("passa por todos os pontos e não sai da área do gráfico", () => {
    const d = caminhoSuave([[0, 90], [25, 5], [50, 95], [75, 0], [100, 50]]);
    expect(d.startsWith("M0,90")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(4);
    expect(d.endsWith(" 100,50")).toBe(true);
    const numeros = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));
    expect(Math.min(...numeros)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numeros)).toBeLessThanOrEqual(100);
  });

  it("sem pontos não desenha nada", () => {
    expect(caminhoSuave([])).toBe("");
  });
});
