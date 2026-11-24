// Regiões da rede (lote ORG-009): a leitura estrita e a soma por região. Dados FICTÍCIOS; as regras do banco
// (quem cria, quem muda, que a região não dá acesso) estão em packages/banco/src/regioes.test.ts.
import { describe, expect, it, vi } from "vitest";

vi.mock("../acesso/sessao", () => ({ FalhaDoServico: class extends Error {} }));

import { agruparPorRegiao, desempenhoPorRegiao, lerRegioes, lerRegioesDoPainel, resultadoPorRegiao, type MapaDeRegioes } from "./regioes";

const NORTE = "00000000-0000-4000-8000-0000000000e1";
const SUL = "00000000-0000-4000-8000-0000000000e2";
const A = "00000000-0000-4000-8000-0000000000aa";
const B = "00000000-0000-4000-8000-0000000000bb";
const C = "00000000-0000-4000-8000-0000000000cc";

function cliente(tabelas: Record<string, unknown[]>, erros: Record<string, { code: string }> = {}) {
  class Consulta {
    linhas: unknown[];
    constructor(readonly nome: string) { this.linhas = [...(tabelas[nome] ?? [])]; }
    select() { return this; }
    order() { return this; }
    range(de: number, ate: number) { this.linhas = this.linhas.slice(de, ate + 1); return this; }
    then(resolver: (r: { data: unknown[] | null; error: { code: string } | null }) => unknown) {
      const erro = erros[this.nome];
      return Promise.resolve(erro ? { data: null, error: erro } : { data: this.linhas, error: null }).then(resolver);
    }
  }
  return { from: (nome: string) => new Consulta(nome) } as unknown as Parameters<typeof lerRegioes>[0];
}

const MAPA: MapaDeRegioes = {
  regioes: [{ id: NORTE, nome: "Norte", ativa: true }, { id: SUL, nome: "Sul", ativa: true }],
  daLoja: new Map([[A, NORTE], [B, NORTE], [C, SUL]]),
};

describe("leitura das regiões", () => {
  it("lê as regiões e a região de cada loja; banco sem a tabela ou sem a coluna é nulo", async () => {
    const lido = await lerRegioes(cliente({
      regioes: [{ id: NORTE, nome: "Norte", ativa: true }],
      unidades: [{ id: A, regiao_id: NORTE }, { id: B, regiao_id: null }],
    }));
    expect(lido?.regioes).toEqual([{ id: NORTE, nome: "Norte", ativa: true }]);
    expect([...(lido?.daLoja ?? [])]).toEqual([[A, NORTE]]);
    expect(await lerRegioes(cliente({}, { regioes: { code: "PGRST205" } }))).toBeNull();
    expect(await lerRegioes(cliente({ regioes: [] }, { unidades: { code: "42703" } }))).toBeNull();
  });

  it("linha fora do formato, loja numa região que não veio ou outra falha: lança; o painel recebe \"falha\"", async () => {
    await expect(lerRegioes(cliente({ regioes: [{ id: NORTE, nome: "N", ativa: true }], unidades: [] }))).rejects.toThrow();
    await expect(lerRegioes(cliente({ regioes: [], unidades: [{ id: A, regiao_id: NORTE }] }))).rejects.toThrow();
    await expect(lerRegioes(cliente({ regioes: [], unidades: [{ id: A }] }))).rejects.toThrow();
    await expect(lerRegioes(cliente({}, { regioes: { code: "57014" } }))).rejects.toThrow();
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await lerRegioesDoPainel(cliente({}, { regioes: { code: "57014" } }))).toBe("falha");
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});

describe("soma por região", () => {
  const loja = (id: string, vendas: number, vendido: number, desfeito = 0) => ({ id, vendas, vendido, desfeito, liquido: vendido - desfeito });

  it("a região soma as lojas dela; o ticket é o da soma; a loja sem região fica em \"Sem região\", no fim", () => {
    const D = "00000000-0000-4000-8000-0000000000dd";
    const lojas = [loja(A, 3, 300_000, 10_000), loja(B, 1, 50_000), loja(C, 2, 120_000), loja(D, 1, 9_000)];
    const regioes = desempenhoPorRegiao(lojas, MAPA);
    expect(regioes).toEqual([
      { id: NORTE, nome: "Norte", lojas: 2, vendas: 4, vendido: 350_000, desfeito: 10_000, liquido: 340_000, ticket: 87_500 },
      { id: SUL, nome: "Sul", lojas: 1, vendas: 2, vendido: 120_000, desfeito: 0, liquido: 120_000, ticket: 60_000 },
      { id: null, nome: "Sem região", lojas: 1, vendas: 1, vendido: 9_000, desfeito: 0, liquido: 9_000, ticket: 9_000 },
    ]);
    // A soma das regiões é a soma das lojas.
    const soma = (lista: { vendido: number }[]) => lista.reduce((s, x) => s + x.vendido, 0);
    expect(soma(regioes ?? [])).toBe(soma(lojas));
  });

  it("sem nenhuma loja em região (ou sem o mapa), nada a somar: nulo", () => {
    expect(desempenhoPorRegiao([loja(A, 1, 100)], { regioes: MAPA.regioes, daLoja: new Map() })).toBeNull();
    expect(desempenhoPorRegiao([loja(A, 1, 100)], null)).toBeNull();
    expect(agruparPorRegiao([{ u: A }], (x) => x.u, MAPA)).toEqual([{ id: NORTE, nome: "Norte", itens: [{ u: A }] }]);
  });
});

describe("resultado do mês por região (ORG-009b)", () => {
  const conta = (unidade: string, receita: number, resultado: number) =>
    ({ unidade, nome: null, receitaLiquida: receita, cmv: receita / 2, margemBruta: receita / 2, taxas: 100, despesas: 1_000, saidasCaixa: 50, rede: 200, resultado,
      taxasCartaoPix: 60, taxasFinanceiras: 40 });

  it("cada conta da região é a soma das lojas dela (inclusive a parte da rede); a soma das regiões é a da rede", () => {
    const lojas = [conta(A, 10_000, 3_650), conta(B, 4_000, 650), conta(C, 8_000, -1_000)];
    const regioes = resultadoPorRegiao(lojas, MAPA);
    expect(regioes?.map((r) => [r.nome, r.lojas, r.receitaLiquida, r.rede, r.resultado])).toEqual([["Norte", 2, 14_000, 400, 4_300], ["Sul", 1, 8_000, 200, -1_000]]);
    const total = (lista: { resultado: number }[]) => lista.reduce((s, x) => s + x.resultado, 0);
    expect(total(regioes ?? [])).toBe(total(lojas));
    expect(resultadoPorRegiao(lojas, null)).toBeNull();
  });
});
