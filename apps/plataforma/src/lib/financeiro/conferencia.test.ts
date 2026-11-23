// A conferência do período (lote FIN-001a): a leitura estrita da resposta de public.financeiro_conferencia, quando um lado
// fecha e o que a tela faz com cada resposta do banco. Dados FICTÍCIOS. A função de verdade está em
// packages/banco/src/financeiro-conferencia.test.ts.
import { describe, expect, it, vi } from "vitest";

vi.mock("../acesso/sessao", () => ({ FalhaDoServico: class FalhaDoServico extends Error {} }));

import { conferenciaFecha, consultarConferencia, lerConferencia, parteFecha, vendasQueNaoFecham } from "./conferencia";

const SEM_DIFERENCA = { diferenca: 0, vendas_com_diferenca: 0, exemplos: [] };
const RESPOSTA = {
  vendas: 5, vendido: 186_490,
  pagamentos: { recebido_na_loja: 48_690, financiado: 129_900, vale_troca: 0, desfeitos: 7_900, ...SEM_DIFERENCA },
  caixa: { esperado: 56_590, no_livro: 56_590, ...SEM_DIFERENCA },
  estoque: { unidades: 5, no_livro: 5, ...SEM_DIFERENCA },
};
const JANELA = { inicio: new Date("2026-11-23T03:00:00Z"), fim: new Date("2026-11-24T03:00:00Z") };

describe("a leitura da resposta", () => {
  it("lê os três lados, com os números como o banco manda", () => {
    const c = lerConferencia(RESPOSTA);
    expect(c).toMatchObject({ vendas: 5, vendido: 186_490 });
    expect(c.pagamentos).toEqual({ recebidoNaLoja: 48_690, financiado: 129_900, valeTroca: 0, desfeitos: 7_900, diferenca: 0, vendasComDiferenca: 0, exemplos: [] });
    expect(c.caixa).toEqual({ esperado: 56_590, noLivro: 56_590, diferenca: 0, vendasComDiferenca: 0, exemplos: [] });
    expect(c.estoque).toEqual({ unidades: 5, noLivro: 5, diferenca: 0, vendasComDiferenca: 0, exemplos: [] });
    expect(conferenciaFecha(c)).toBe(true);
    expect(vendasQueNaoFecham(c)).toBe(0);
  });

  it("a diferença pode ser negativa; as vendas com diferença vêm com o número e o identificador", () => {
    const c = lerConferencia({ ...RESPOSTA, caixa: { esperado: 56_590, no_livro: 56_390, diferenca: -200, vendas_com_diferenca: 1, exemplos: [{ id: "v-7", numero: 7 }] } });
    expect(c.caixa).toMatchObject({ diferenca: -200, vendasComDiferenca: 1, exemplos: [{ id: "v-7", numero: 7 }] });
    expect(parteFecha(c.caixa)).toBe(false);
    expect(parteFecha(c.pagamentos)).toBe(true);
    expect(conferenciaFecha(c)).toBe(false);
    expect(vendasQueNaoFecham(c)).toBe(1);
  });

  it("duas diferenças opostas somam zero, mas o lado não fecha: vale a contagem das vendas", () => {
    const c = lerConferencia({ ...RESPOSTA, pagamentos: { ...RESPOSTA.pagamentos, diferenca: 0, vendas_com_diferenca: 2, exemplos: [{ id: "a", numero: 1 }, { id: "b", numero: 2 }] } });
    expect(parteFecha(c.pagamentos)).toBe(false);
    expect(conferenciaFecha(c)).toBe(false);
    expect(vendasQueNaoFecham(c)).toBe(2);
  });

  it("forma inesperada é erro, nunca \"fecha\"", () => {
    for (const ruim of [
      null, [], "fecha", {}, { ...RESPOSTA, pagamentos: undefined }, { ...RESPOSTA, vendas: "5" }, { ...RESPOSTA, vendido: 1.5 },
      { ...RESPOSTA, estoque: { ...RESPOSTA.estoque, unidades: -1 } }, { ...RESPOSTA, caixa: { ...RESPOSTA.caixa, exemplos: [{ id: "", numero: 1 }] } },
      { ...RESPOSTA, caixa: { ...RESPOSTA.caixa, exemplos: "nenhuma" } }, { ...RESPOSTA, estoque: { ...RESPOSTA.estoque, vendas_com_diferenca: null } },
    ]) {
      expect(() => lerConferencia(ruim), JSON.stringify(ruim)).toThrow();
    }
  });
});

describe("o que a tela faz com a resposta do banco", () => {
  const banco = (resposta: { data: unknown; error: { code: string } | null }) => {
    const chamadas: [string, unknown][] = [];
    const supabase = { rpc: async (nome: string, args: unknown) => { chamadas.push([nome, args]); return resposta; } };
    return { supabase: supabase as never, chamadas };
  };

  it("pede o período e a loja; para a rede, não manda a loja", async () => {
    const daLoja = banco({ data: RESPOSTA, error: null });
    expect(await consultarConferencia(daLoja.supabase, JANELA, "loja-1")).toMatchObject({ estado: "ok", dados: { vendas: 5 } });
    expect(daLoja.chamadas).toEqual([["financeiro_conferencia", { p_inicio: "2026-11-23T03:00:00.000Z", p_fim: "2026-11-24T03:00:00.000Z", p_unidade: "loja-1" }]]);
    const daRede = banco({ data: RESPOSTA, error: null });
    await consultarConferencia(daRede.supabase, JANELA, null);
    expect(daRede.chamadas).toEqual([["financeiro_conferencia", { p_inicio: "2026-11-23T03:00:00.000Z", p_fim: "2026-11-24T03:00:00.000Z" }]]);
  });

  it("o banco sem a função: nulo (o cartão não aparece); outra falha ou resposta fora da forma: falha, nunca \"fecha\"", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const code of ["PGRST202", "42883"]) expect(await consultarConferencia(banco({ data: null, error: { code } }).supabase, JANELA, null)).toBeNull();
    for (const code of ["42501", "57014", "22023"]) expect(await consultarConferencia(banco({ data: null, error: { code } }).supabase, JANELA, null)).toEqual({ estado: "falha" });
    expect(await consultarConferencia(banco({ data: { vendas: 1 }, error: null }).supabase, JANELA, null)).toEqual({ estado: "falha" });
    expect(await consultarConferencia(banco({ data: null, error: null }).supabase, JANELA, null)).toEqual({ estado: "falha" });
  });
});
