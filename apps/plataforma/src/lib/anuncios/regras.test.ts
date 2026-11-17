// As regras e o painel dos anúncios (lote META-a: ORA-META-003, ORA-META-004 e ORA-META-006; ADR-017).
import { describe, expect, it } from "vitest";

import { RespostaInesperada } from "../financeiro/painel";
import { lerPainelDosAnuncios, metricasDaCampanha, totalDasCampanhas, type CampanhaDoPainel } from "./painel";
import { erroDosAnuncios, periodoDosAnuncios, textoDoProblemaDosAnuncios } from "./regras";

const VENDEDOR = "00000000-0000-4000-8000-0000000000aa";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const campanha = (mudar: Record<string, unknown> = {}) => ({
  chave: "natal 2026", campanha: "Natal 2026", gasto: 15_000, impressoes: 10_000, cliques: 200, resultados: 10, dias: 2, reservas: 1, oportunidades: 1,
  vendas: 2, receita: 15_800, margem: 7_000, vendas_sem_custo: 0, recebido: 15_700, clientes_novos: 1, ...mudar,
});
const resposta = (mudar: Record<string, unknown> = {}) => ({
  campanhas: [campanha()], por_loja: [{ chave: "natal 2026", unidade_id: LOJA, loja: "Santa Cândida", contatos: 2, vendas: 2, receita: 15_800 }],
  por_vendedor: [{ chave: "natal 2026", vendedor_id: VENDEDOR, vendas: 2, receita: 15_800 }], contatos_sem_campanha: 3, importado_ate: "2026-11-17", ...mudar,
});

describe("as mensagens e o período", () => {
  it("o erro do banco vira a chave do catálogo", () => {
    expect(erroDosAnuncios({ code: "42501", message: "Sem permissão para o custo dos anúncios" })).toBe("permissao");
    expect(erroDosAnuncios({ code: "22023", message: "O arquivo leva de 1 a 20.000 linhas" })).toBe("linhas");
    expect(erroDosAnuncios({ code: "22023", message: "Período inválido: o fim vem depois do início" })).toBe("periodo");
    expect(erroDosAnuncios({ code: "22023", message: "Linha do arquivo fora do formato" })).toBe("dados");
    expect(erroDosAnuncios({ code: "40P01", message: "deadlock" })).toBe("instante");
    expect(erroDosAnuncios({ code: "57014" })).toBe("falha");
  });

  it("a linha que não deu para ler, e o arquivo que não vem por dia, apontados; parâmetro adulterado não vira texto", () => {
    expect(textoDoProblemaDosAnuncios("4", "gasto", "dez reais")).toBe('Linha 4 do arquivo: não deu para ler o valor usado (em reais) "dez reais". Confira a coluna escolhida e o arquivo.');
    expect(textoDoProblemaDosAnuncios("2", "por_dia", "2026-11-01 a 2026-11-30")).toContain("exporte com o detalhamento por dia");
    expect(textoDoProblemaDosAnuncios("2", "constructor", "x")).toBeNull();
    expect(textoDoProblemaDosAnuncios("x", "dia", "x")).toBeNull();
  });

  it("o período: datas do calendário até 400 dias; senão, os últimos 30 dias", () => {
    expect(periodoDosAnuncios("2026-11-01", "2026-11-17", "2026-11-17")).toEqual({ inicio: "2026-11-01", fim: "2026-11-17" });
    expect(periodoDosAnuncios("2026-11-17", "2026-11-01", "2026-11-17")).toEqual({ inicio: "2026-10-19", fim: "2026-11-17" });
    expect(periodoDosAnuncios("2026-02-30", "2026-03-01", "2026-11-17")).toEqual({ inicio: "2026-10-19", fim: "2026-11-17" });
    expect(periodoDosAnuncios("2024-01-01", "2026-11-17", "2026-11-17")).toEqual({ inicio: "2026-10-19", fim: "2026-11-17" });
  });
});

describe("o painel dos anúncios", () => {
  it("lê a resposta do banco com rigor", () => {
    const p = lerPainelDosAnuncios(resposta());
    expect(p.campanhas[0]).toMatchObject({ chave: "natal 2026", vendasSemCusto: 0, clientesNovos: 1, recebido: 15_700 });
    expect(p.porLoja).toEqual([{ chave: "natal 2026", unidade: LOJA, loja: "Santa Cândida", contatos: 2, vendas: 2, receita: 15_800 }]);
    expect(p.porVendedor).toEqual([{ chave: "natal 2026", vendedor: VENDEDOR, vendas: 2, receita: 15_800 }]);
    expect(p).toMatchObject({ contatosSemCampanha: 3, importadoAte: "2026-11-17" });
    expect(lerPainelDosAnuncios(resposta({ campanhas: [campanha({ impressoes: null, cliques: null, resultados: null })] })).campanhas[0])
      .toMatchObject({ impressoes: null, cliques: null, resultados: null });
    for (const ruim of [null, [], resposta({ campanhas: [campanha({ vendas: 3 })] }), resposta({ campanhas: [campanha({ clientes_novos: 3 })] }),
      resposta({ campanhas: [campanha({ gasto: -1 })] }), resposta({ por_vendedor: [{ chave: "x", vendedor_id: "1 or 1=1", vendas: 1, receita: 1 }] }),
      resposta({ importado_ate: "ontem" })]) {
      expect(() => lerPainelDosAnuncios(ruim), JSON.stringify(ruim)?.slice(0, 80)).toThrow(RespostaInesperada);
    }
  });

  it("as fórmulas do ADR-017; divisor zero não vira número", () => {
    const c = lerPainelDosAnuncios(resposta()).campanhas[0] as CampanhaDoPainel;
    expect(metricasDaCampanha(c)).toEqual({
      contatos: 2, ctr: 0.02, cpc: 75, custoPorResultado: 1_500, cpl: 7_500, cpa: 7_500, roas: 15_800 / 15_000, roasDaMargem: 7_000 / 15_000, cac: 15_000,
    });
    const semNada = { ...c, impressoes: null, cliques: 0, resultados: null, reservas: 0, oportunidades: 0, vendas: 0, receita: 0, margem: 0, clientesNovos: 0, gasto: 0 };
    expect(metricasDaCampanha(semNada)).toEqual({ contatos: 0, ctr: null, cpc: null, custoPorResultado: null, cpl: null, cpa: null, roas: null, roasDaMargem: null, cac: null });
  });

  it("o total sai das somas das campanhas", () => {
    const [a] = lerPainelDosAnuncios(resposta()).campanhas as [CampanhaDoPainel];
    const b: CampanhaDoPainel = { ...a, chave: "capas", campanha: "Capas", gasto: 5_000, impressoes: null, cliques: null, resultados: null, vendas: 0, receita: 0, margem: 0, clientesNovos: 0, reservas: 0, oportunidades: 2 };
    const total = totalDasCampanhas([a, b]);
    expect(total).toMatchObject({ gasto: 20_000, impressoes: 10_000, cliques: 200, vendas: 2, receita: 15_800, oportunidades: 3 });
    expect(metricasDaCampanha(total)).toMatchObject({ contatos: 4, cpl: 5_000, cpa: 10_000, cac: 20_000 });
  });
});
