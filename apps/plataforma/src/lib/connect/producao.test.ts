// Produção do Ora Connect (G4a): leitura estrita de public.connect_painel e as regras da tela. A soma no
// banco está provada em packages/banco/src/connect-painel.test.ts. Dados fictícios.
import { describe, expect, it } from "vitest";

import { janelasDoPeriodo, RespostaInesperada } from "../financeiro/painel";
import { confirmadas, diasDaProducao, lerProducao, SERIES_DA_PRODUCAO } from "./producao";

const RESPOSTA = {
  totais: { chips: 1, ativacoes: 2, portabilidades: 1, recargas: 1, por_evidencia: 3, por_revisao: 1, valor_face_recargas: 2_000, em_andamento: 1, sem_resultado: 2, debito: 3_300, lojas_sem_custo: 1 },
  periodos: [{ periodo: "2026-11-08", chips: 1, ativacoes: 2, portabilidades: 0, recargas: 0 }, { periodo: "2026-11-10", chips: 0, ativacoes: 0, portabilidades: 1, recargas: 1 }],
};

describe("leitura de connect_painel", () => {
  it("converte os totais e os dias", () => {
    const p = lerProducao(RESPOSTA);
    expect(p.totais).toEqual({ chips: 1, ativacoes: 2, portabilidades: 1, recargas: 1, porEvidencia: 3, porRevisao: 1, valorFaceRecargas: 2_000, emAndamento: 1, semResultado: 2, debito: 3_300, lojasSemCusto: 1 });
    expect(confirmadas(p.totais)).toBe(4);
    expect(p.periodos[1]).toEqual({ periodo: "2026-11-10", chips: 0, ativacoes: 0, portabilidades: 1, recargas: 1 });
  });

  it("forma inesperada, dia fora do formato ou origens que não somam as confirmadas é falha, não zero", () => {
    expect(() => lerProducao(null)).toThrow(RespostaInesperada);
    expect(() => lerProducao({ ...RESPOSTA, periodos: "x" })).toThrow(RespostaInesperada);
    expect(() => lerProducao({ ...RESPOSTA, periodos: [{ ...RESPOSTA.periodos[0], periodo: "10/11" }] })).toThrow(RespostaInesperada);
    expect(() => lerProducao({ ...RESPOSTA, totais: { ...RESPOSTA.totais, por_revisao: 0 } })).toThrow(RespostaInesperada);
    expect(() => lerProducao({ ...RESPOSTA, totais: { ...RESPOSTA.totais, debito: undefined } })).toThrow();
  });
});

describe("série por dia", () => {
  it("todos os dias da janela, com zero onde não houve fato, e a cor fixa de cada série", () => {
    const janela = janelasDoPeriodo("7", new Date("2026-11-10T18:30:00.000Z")).atual;
    const dias = diasDaProducao(lerProducao(RESPOSTA), janela);
    expect(dias.map((d) => d.rotulo)).toEqual(["04/11", "05/11", "06/11", "07/11", "08/11", "09/11", "10/11"]);
    expect(dias[4]).toEqual({ chave: "2026-11-08", rotulo: "08/11", chips: 1, ativacoes: 2, portabilidades: 0, recargas: 0 });
    expect(dias[0]).toMatchObject({ chips: 0, ativacoes: 0, portabilidades: 0, recargas: 0 });
    expect(SERIES_DA_PRODUCAO.map((s) => [s.nome, s.serie])).toEqual([["Chips vendidos", 1], ["Ativações", 2], ["Portabilidades", 3], ["Recargas", 4]]);
  });
});
