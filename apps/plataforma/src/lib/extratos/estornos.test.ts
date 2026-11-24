// O débito do extrato e o estorno da venda (lote PAY-011a: ORA-PAY-011): a leitura das sugestões do banco, o que a pessoa
// pode fazer com cada uma e o débito que comprova o estorno na tela da venda. Supabase SIMULADO; dados fictícios.
import { describe, expect, it, vi } from "vitest";

import { acaoDaSugestao, fraseDoDebito, lerDebitosDosEstornos, lerSugestoesDeEstorno, type SugestaoDeEstorno } from "./estornos";

const LINHA = "00000000-0000-4000-9000-0000000000a1";
const ESTORNO = "00000000-0000-4000-9000-0000000000a2";
const VENDA = "00000000-0000-4000-9000-0000000000a3";
const EXTRATO = "00000000-0000-4000-9000-0000000000a4";
const sugestao: SugestaoDeEstorno = {
  linha_id: LINHA, estorno_id: ESTORNO, estorno_numero: 3, venda_id: VENDA, venda_numero: 21, meio: "cartao_picpay", valor_centavos: 7_900, situacao: "pendente",
  solicitado_em: "2026-11-20T15:00:00Z", confirmado_em: null, comprovante: null, loja: "Santa Cândida (teste)", de_devolucao: false, pela_referencia: false,
  pode_confirmar: true, na_loja_do_turno: true,
};

describe("as sugestões de estorno, lidas com rigor", () => {
  it("lê o que o banco manda e ignora o que sobra; sem resposta, não há sugestão", () => {
    expect(lerSugestoesDeEstorno([{ ...sugestao, extra: "x" }])).toEqual([sugestao]);
    expect(lerSugestoesDeEstorno([])).toEqual([]);
    expect(lerSugestoesDeEstorno(null)).toEqual([]);
    const confirmado = { ...sugestao, situacao: "confirmado", confirmado_em: "2026-11-20T16:00:00Z", comprovante: "EST-1", pela_referencia: true };
    expect(lerSugestoesDeEstorno([sugestao, confirmado])).toEqual([sugestao, confirmado]);
  });

  it("uma linha fora da forma derruba a leitura inteira (nada de meia sugestão)", () => {
    const ruins: Record<string, unknown>[] = [
      { ...sugestao, linha_id: "x" }, { ...sugestao, estorno_id: null }, { ...sugestao, venda_id: "1 or 1=1" }, { ...sugestao, estorno_numero: "3" },
      { ...sugestao, valor_centavos: 0 }, { ...sugestao, valor_centavos: 79.5 }, { ...sugestao, situacao: "cancelado" }, { ...sugestao, pode_confirmar: "true" },
      { ...sugestao, na_loja_do_turno: null }, { ...sugestao, loja: "" }, { ...sugestao, comprovante: 12 }, { ...sugestao, de_devolucao: undefined },
    ];
    for (const ruim of ruins) expect(lerSugestoesDeEstorno([sugestao, ruim]), JSON.stringify(ruim)).toBeNull();
    expect(lerSugestoesDeEstorno({ 0: sugestao })).toBeNull();
    expect(lerSugestoesDeEstorno([null])).toBeNull();
  });
});

describe("o que a pessoa pode fazer com a sugestão", () => {
  it("o estorno já confirmado só ganha a prova; o que espera é confirmado pela gerência, na loja da venda", () => {
    expect(acaoDaSugestao({ situacao: "confirmado", pode_confirmar: false, na_loja_do_turno: false })).toBe("guardar");
    expect(acaoDaSugestao({ situacao: "pendente", pode_confirmar: true, na_loja_do_turno: true })).toBe("confirmar");
    expect(acaoDaSugestao({ situacao: "pendente", pode_confirmar: true, na_loja_do_turno: false })).toBe("outra_loja");
    expect(acaoDaSugestao({ situacao: "pendente", pode_confirmar: false, na_loja_do_turno: true })).toBe("gerencia");
    expect(acaoDaSugestao({ situacao: "pendente", pode_confirmar: false, na_loja_do_turno: false })).toBe("gerencia");
  });
});

describe("o débito que comprova o estorno, para a tela da venda", () => {
  type Resposta = { data: Record<string, unknown>[] | null; error: { code?: string } | null };
  const cliente = (resposta: Resposta) => {
    const pedidos: { tabela: string; coluna: string; valores: unknown[] }[] = [];
    const supabase = {
      from: (tabela: string) => ({
        select: () => ({ in: (coluna: string, valores: unknown[]) => { pedidos.push({ tabela, coluna, valores }); return { order: () => Promise.resolve(resposta) }; } }),
      }),
    };
    return { supabase: supabase as never, pedidos };
  };
  const linha = { estorno_id: ESTORNO, numero: 12, data: "2026-11-20", chargeback: true, confirmou_o_estorno: true, extrato: { id: EXTRATO, numero: 7, fonte: "PicPay da loja" } };

  it("sem estorno nenhum, nada é lido", async () => {
    const { supabase, pedidos } = cliente({ data: [], error: null });
    expect(await lerDebitosDosEstornos(supabase, [])).toEqual({ estado: "ok", itens: [] });
    expect(pedidos).toEqual([]);
  });

  it("lê o débito de cada estorno, com o extrato, a linha, o dia e se foi chargeback", async () => {
    const { supabase, pedidos } = cliente({ data: [linha, { ...linha, estorno_id: VENDA, numero: 13, chargeback: null, confirmou_o_estorno: false }], error: null });
    const lido = await lerDebitosDosEstornos(supabase, [ESTORNO, VENDA]);
    expect(lido).toEqual({ estado: "ok", itens: [
      { estornoId: ESTORNO, extratoId: EXTRATO, extratoNumero: 7, fonte: "PicPay da loja", linha: 12, data: "2026-11-20", chargeback: true, confirmou: true },
      { estornoId: VENDA, extratoId: EXTRATO, extratoNumero: 7, fonte: "PicPay da loja", linha: 13, data: "2026-11-20", chargeback: false, confirmou: false },
    ] });
    expect(pedidos).toEqual([{ tabela: "extrato_linhas", coluna: "estorno_id", valores: [ESTORNO, VENDA] }]);
    expect(lido.estado === "ok" && lido.itens[0] ? fraseDoDebito(lido.itens[0]) : "").toBe("débito do extrato nº 7 (PicPay da loja), linha 12, de 20/11/2026");
  });

  it("quem não vê o extrato recebe vazio; a linha sem o extrato legível não vira anotação pela metade", async () => {
    expect(await lerDebitosDosEstornos(cliente({ data: [], error: null }).supabase, [ESTORNO])).toEqual({ estado: "ok", itens: [] });
    expect(await lerDebitosDosEstornos(cliente({ data: [{ ...linha, extrato: null }], error: null }).supabase, [ESTORNO])).toEqual({ estado: "ok", itens: [] });
  });

  it("o banco de antes da migration é \"indisponível\"; outra falha aparece como falha, com o código no registro", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const code of ["42703", "PGRST204", "PGRST205", "42P01"]) {
      expect(await lerDebitosDosEstornos(cliente({ data: null, error: { code } }).supabase, [ESTORNO]), code).toEqual({ estado: "indisponivel" });
    }
    expect(registro).not.toHaveBeenCalled();
    expect(await lerDebitosDosEstornos(cliente({ data: null, error: { code: "57014" } }).supabase, [ESTORNO])).toEqual({ estado: "falha" });
    expect(registro).toHaveBeenCalledWith("extratos: falha ao ler o débito que comprova o estorno", { codigo: "57014" });
    registro.mockRestore();
  });
});
