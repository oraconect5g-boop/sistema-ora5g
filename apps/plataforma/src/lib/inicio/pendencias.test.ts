// VEL-c: as pendências da loja do turno numa ida só (public.pendencias_da_loja), com o Supabase SIMULADO: nenhuma
// credencial, números fictícios. As regras de cada pendência na tela estão em app/inicio/inicio.test.ts e na rota do sino.
import { describe, expect, it, vi } from "vitest";

vi.mock("../acesso/sessao", () => ({ FalhaDoServico: class FalhaDoServico extends Error {} }));

import { lerContagens, lerPendencias, montarPendencias } from "./pendencias";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const EU = "00000000-0000-4000-8000-0000000000aa";

function clienteSimulado(resposta: { data: unknown; error: { code: string } | null }) {
  const chamadas = { rpc: [] as string[], from: [] as string[] };
  const consulta = (nome: string) => {
    chamadas.from.push(nome);
    const q = {
      select: () => q, eq: () => q, neq: () => q, in: () => q, lt: () => q, lte: () => q, gte: () => q, or: () => q,
      then: (resolver: (r: { data: null; error: null; count: number }) => unknown) => Promise.resolve({ data: null, error: null, count: 1 }).then(resolver),
    };
    return q;
  };
  const supabase = {
    rpc: async (nome: string) => {
      chamadas.rpc.push(nome);
      return nome === "pendencias_da_loja" ? resposta : { data: null, error: { code: "PGRST202" } };
    },
    from: consulta,
  };
  return { supabase: supabase as never, chamadas };
}

describe("VEL-c — as pendências numa ida só", () => {
  it("a resposta do banco é conferida: cada chave conhecida é uma contagem; forma estranha é falha, nunca zero", () => {
    expect(lerContagens({ aprovacoes: 2, notas: 0, chave_nova: 9 })).toEqual({ aprovacoes: 2, notas: 0 });
    expect(lerContagens({})).toEqual({});
    for (const estranho of [null, [], "2", { aprovacoes: -1 }, { aprovacoes: 1.5 }, { aprovacoes: "2" }, { notas: null }]) {
      expect(() => lerContagens(estranho), JSON.stringify(estranho)).toThrow();
    }
  });

  it("as pendências na ordem de sempre: a fila com zero aparece; o alerta com zero, não; a chave ausente (sem permissão) some", () => {
    const lista = montarPendencias({ aprovacoes: 0, notas: 3, caixas_com_diferenca: 0, notas_paradas: 2, transferencias: 1 }, 4, LOJA);
    expect(lista.map((p) => [p.rotulo, p.quantidade, p.alerta])).toEqual([
      ["Descontos para aprovar", 0, false], ["Notas na fila", 3, false], ["Transferências", 1, false],
      ["Notas paradas", 2, true], ["Notas com divergência", 4, true],
    ]);
    expect(montarPendencias({}, null, LOJA)).toEqual([]);
  });

  it("FIN-007b: o repasse atrasado e a cobrança a retomar são alertas de quem concilia; zero ou sem a chave, não aparecem", () => {
    const lista = montarPendencias({ repasses_atrasados: 2, cobrancas_a_retomar: 1 }, null, LOJA);
    expect(lista).toEqual([
      { rotulo: "Repasses atrasados", detalhe: "financeiras que passaram do prazo", href: "/pagamentos/financeiras", icone: "repasse_atrasado", quantidade: 2, alerta: true },
      { rotulo: "Cobranças a retomar", detalhe: "chegou o dia de voltar à financeira", href: "/pagamentos/financeiras", icone: "cobranca_a_retomar", quantidade: 1, alerta: true },
    ]);
    expect(montarPendencias({ repasses_atrasados: 0, cobrancas_a_retomar: 0 }, null, LOJA)).toEqual([]);
    expect(montarPendencias({ repasses_atrasados: 3 }, null, LOJA).map((p) => p.rotulo)).toEqual(["Repasses atrasados"]);
    // A resposta do banco com as duas chaves é lida como as outras; fora da forma, é falha.
    expect(lerContagens({ repasses_atrasados: 1, cobrancas_a_retomar: 0 })).toEqual({ repasses_atrasados: 1, cobrancas_a_retomar: 0 });
    expect(() => lerContagens({ repasses_atrasados: -1 })).toThrow();
  });

  it("com a função no banco: uma ida para as contagens, nenhuma contagem separada", async () => {
    const { supabase, chamadas } = clienteSimulado({ data: { aprovacoes: 2, caixas: 1, saidas: 0 }, error: null });
    const lista = await lerPendencias(supabase, { usuario: EU, unidade: LOJA, permissoes: new Set(["desconto.aprovar", "caixa.conferir"]) });
    expect(lista.map((p) => [p.rotulo, p.quantidade])).toEqual([["Descontos para aprovar", 2], ["Saídas do caixa", 0], ["Caixas para conferir", 1]]);
    expect(chamadas.rpc).toEqual(["pendencias_da_loja"]);
    expect(chamadas.from).toEqual([]);
  });

  it("quem aprova notas: as contagens e as divergências saem juntas, em duas idas ao mesmo tempo", async () => {
    const { supabase, chamadas } = clienteSimulado({ data: { notas: 1, notas_paradas: 0 }, error: null });
    await lerPendencias(supabase, { usuario: EU, unidade: LOJA, permissoes: new Set(["nota.aprovar"]) });
    expect(chamadas.rpc[0]).toBe("pendencias_da_loja");
    expect(chamadas.rpc.length).toBe(2);
    expect(chamadas.from).toEqual([]);
  });

  it("banco ainda sem a função: as contagens uma a uma, como antes", async () => {
    const { supabase, chamadas } = clienteSimulado({ data: null, error: { code: "PGRST202" } });
    const lista = await lerPendencias(supabase, { usuario: EU, unidade: LOJA, permissoes: new Set(["desconto.aprovar"]) });
    expect(lista.map((p) => [p.rotulo, p.quantidade])).toEqual([["Descontos para aprovar", 1]]);
    expect(chamadas.from).toEqual(["aprovacoes_desconto"]);
  });

  it("outra falha da função, ou resposta estranha, derruba quem pediu: zero inventado não", async () => {
    for (const resposta of [{ data: null, error: { code: "57014" } }, { data: { aprovacoes: "dois" }, error: null }]) {
      const { supabase } = clienteSimulado(resposta);
      await expect(lerPendencias(supabase, { usuario: EU, unidade: LOJA, permissoes: new Set(["desconto.aprovar"]) })).rejects.toThrow();
    }
  });
});
