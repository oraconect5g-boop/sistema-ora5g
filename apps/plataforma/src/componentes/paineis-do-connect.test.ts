// Painéis da produção do Ora Connect (G4a): o que cada estado mostra, sem número inventado. Dados fictícios.
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";

import { lerProducao } from "../lib/connect/producao";
import { janelasDoPeriodo } from "../lib/financeiro/painel";
import { IndicadoresDoConnect, indicadorDoConnect, OperacoesPorTipo, PainelDaProducaoPorDia } from "./paineis-do-connect";

type Linha = Record<string, unknown>;
// Lê a árvore: os textos e as propriedades de cada elemento (os componentes ficam como elementos).
function ler(v: unknown) {
  const textos: string[] = [];
  const elementos: { tipo: string; props: Linha }[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") textos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      elementos.push({ tipo: typeof x.type === "string" ? x.type : typeof x.type === "function" ? x.type.name : "", props: x.props });
      Object.values(x.props).forEach(andar);
    } else if (x && typeof x === "object" && !("$$typeof" in x)) Object.values(x).forEach(andar);
  };
  andar(v);
  return { texto: textos.join(" ").replace(/\s+/g, " "), doTipo: (tipo: string) => elementos.filter((e) => e.tipo === tipo).map((e) => e.props) };
}

const TOTAIS = { chips: 1, ativacoes: 2, portabilidades: 0, recargas: 1, por_evidencia: 2, por_revisao: 1, valor_face_recargas: 2_000, em_andamento: 1, sem_resultado: 1, debito: 3_300, lojas_sem_custo: 0 };
const ok = (totais = TOTAIS, periodos: unknown[] = [{ periodo: "2026-11-10", chips: 1, ativacoes: 2, portabilidades: 0, recargas: 1 }]) =>
  ({ estado: "ok" as const, dados: lerProducao({ totais, periodos }) });
const SEM_PRODUCAO = { ...TOTAIS, chips: 0, ativacoes: 0, recargas: 0, por_evidencia: 0, por_revisao: 0 };
const janela = janelasDoPeriodo("7", new Date("2026-11-10T18:30:00.000Z")).atual;

describe("indicador do Início", () => {
  it("as confirmadas, com o detalhe por tipo, os chips e o que ainda não foi confirmado", () => {
    expect(indicadorDoConnect(ok())).toMatchObject({ rotulo: "Ora Connect confirmado", valor: "3", detalhe: "2 ativações · 1 recarga · 1 chip vendido · 2 ainda sem confirmação" });
    expect(indicadorDoConnect(ok({ ...TOTAIS, portabilidades: 1, por_evidencia: 3, em_andamento: 0, sem_resultado: 0 })).detalhe).toBe("2 ativações · 1 portabilidade · 1 recarga · 1 chip vendido");
  });

  it("sem leitura, nenhum número", () => {
    expect(indicadorDoConnect({ estado: "indisponivel" })).toMatchObject({ valor: "—", detalhe: "Indisponível neste ambiente", tom: "atencao" });
    expect(indicadorDoConnect({ estado: "falha" })).toMatchObject({ valor: "—", detalhe: "Não foi possível ler agora", tom: "atencao" });
  });
});

describe("cartão por dia (Relatórios)", () => {
  it("uma linha por série, com todos os dias da janela, e a tabela", () => {
    const l = ler(PainelDaProducaoPorDia({ producao: ok(), janela, aqui: "/relatorios" }));
    expect(l.texto).toContain("3 operações confirmadas · 1 chip vendido · 2 ainda sem confirmação (fora da conta)");
    expect(l.doTipo("Linhas")[0]).toMatchObject({ rotulosX: ["04/11", "05/11", "06/11", "07/11", "08/11", "09/11", "10/11"], series: [{ nome: "Chips vendidos", valores: [0, 0, 0, 0, 0, 0, 1] }, { nome: "Ativações" }, { nome: "Portabilidades" }, { nome: "Recargas" }] });
  });

  it("sem produção: o vazio é explicado, com o que ainda espera confirmação", () => {
    const l = ler(PainelDaProducaoPorDia({ producao: ok(SEM_PRODUCAO, []), janela, aqui: "/relatorios" }));
    expect(l.texto).toContain("Nenhum chip vendido nem operação confirmada no período");
    expect(l.texto).toMatch(/2 operações ainda sem confirmação\s?: não entram até serem confirmadas\./);
    expect(l.doTipo("Linhas")).toEqual([]);
  });
});

describe("aba Operações do dia (Ora Connect, CONNECT-m)", () => {
  it("os 4 cartões: chips, ativações (com o que falta confirmar), portabilidades e recargas (com o valor de face)", () => {
    const l = ler(IndicadoresDoConnect({ producao: ok(), aqui: "/connect" }));
    expect(l.doTipo("Indicador").map((i) => [i.rotulo, i.valor, i.detalhe, i.tom])).toEqual([
      ["Chips vendidos", "1", "no caixa (ativar é outra operação)", undefined],
      ["Ativações confirmadas", "2", "2 operações ainda sem confirmação", "atencao"],
      ["Portabilidades", "0", "confirmadas", undefined],
      ["Recargas", "1", expect.stringMatching(/^R\$\s20,00 em valor de face \(não é receita\)$/), undefined],
    ]);
    const tudoConfirmado = ler(IndicadoresDoConnect({ producao: ok({ ...TOTAIS, em_andamento: 0, sem_resultado: 0 }), aqui: "/connect" }));
    expect(tudoConfirmado.doTipo("Indicador")[1]).toMatchObject({ detalhe: "nenhuma esperando a operadora", tom: "neutro" });
  });

  it("sem leitura, nenhum número: o motivo e o tentar de novo", () => {
    const falha = ler(IndicadoresDoConnect({ producao: { estado: "falha" }, aqui: "/connect?periodo=7" }));
    expect(falha.doTipo("EstadoDoPainel")[0]).toMatchObject({ estado: "falha", fonte: "connect", tentarDeNovo: "/connect?periodo=7" });
    expect(falha.doTipo("Indicador")).toEqual([]);
    expect(OperacoesPorTipo({ producao: { estado: "indisponivel" }, veCusto: true, rotuloDoPeriodo: "hoje" })).toBeNull();
  });

  it("por tipo (cada série com a sua cor) e por origem; o débito na carteira só para quem vê o custo, e com as lojas que ficaram fora", () => {
    let l = ler(OperacoesPorTipo({ producao: ok(), veCusto: true, rotuloDoPeriodo: "7 dias" }));
    expect(l.texto).toContain("Chips vendidos e operações confirmadas (7 dias)");
    expect(l.doTipo("BarraSegmentada")[0]).toMatchObject({ partes: [
      { nome: "Chips vendidos", valor: 1, serie: 1 }, { nome: "Ativações", valor: 2, serie: 2 }, { nome: "Portabilidades", valor: 0, serie: 3 }, { nome: "Recargas", valor: 1, serie: 4 },
    ] });
    expect(l.doTipo("ListaDados")[0]?.itens).toEqual([
      ["Confirmadas pela operadora", "2"], ["Confirmadas pela revisão da gerência", "1"],
      ["Em andamento (registradas, enviando ou aguardando)", "1"], ["Sem resultado (precisam de decisão)", "1"],
      ["Débito registrado na carteira", expect.stringMatching(/^R\$\s33,00$/)],
    ]);
    l = ler(OperacoesPorTipo({ producao: ok({ ...TOTAIS, lojas_sem_custo: 2 }), veCusto: true, rotuloDoPeriodo: "hoje" }));
    expect(l.doTipo("ListaDados")[0]?.itens).toContainEqual(["Débito registrado na carteira", expect.stringMatching(/^R\$\s33,00 \(sem 2 lojas\)$/)]);
    l = ler(OperacoesPorTipo({ producao: ok(), veCusto: false, rotuloDoPeriodo: "hoje" }));
    expect(l.texto).not.toContain("Débito");
  });

  it("nem chip nem confirmada: o vazio é explicado, sem a barra", () => {
    const l = ler(OperacoesPorTipo({ producao: ok(SEM_PRODUCAO, []), veCusto: false, rotuloDoPeriodo: "hoje" }));
    expect(l.texto).toContain("Nenhum chip vendido nem operação confirmada no período");
    expect(l.doTipo("BarraSegmentada")).toEqual([]);
  });
});
