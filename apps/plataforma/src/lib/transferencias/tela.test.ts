// A tela de Transferências numa ida (lote VEL-g): a leitura estrita da resposta de public.transferencias_tela e o que a tela
// faz com cada resposta do banco. Dados FICTÍCIOS. A função de verdade está em packages/banco/src/transferencias-tela.test.ts.
import { describe, expect, it, vi } from "vitest";

vi.mock("../acesso/sessao", () => ({ FalhaDoServico: class FalhaDoServico extends Error {} }));

import { consultarTelaDasTransferencias, LIMITE_DA_LISTA, lerTelaDasTransferencias } from "./tela";

const T = "00000000-0000-4000-9000-000000000001";
const RESPOSTA = {
  transferencias: [{ id: T, numero: 7, origem_id: "a", destino_id: "b", variante_id: "v", quantidade: 1, motivo: "Reposição", situacao: "enviada",
    solicitado_por: "p", quantidade_recebida: null, observacao: null, solicitado_em: "2026-11-19T17:03:38.123+00:00", remessa_id: null }],
  variantes: [{ id: "v", nome: "Moto G24", sku: "APA-0002", tipo: "aparelho" }],
  unidades: [{ id: "a", nome: "Loja A", tipo: "loja_fisica" }],
  itens: [{ transferencia_id: T, item_serializado_id: "i", recebido: null }],
  remessas: [],
  saldos: [{ unidade_id: "a", variante_id: "v", quantidade: 3, reservado: 1 }],
  disponiveis: [{ id: "i2", variante_id: "v", imei: "350000000000031", iccid: null }],
};

describe("a leitura da resposta", () => {
  it("lê cada parte, com os nulos onde o banco manda nulo", () => {
    const t = lerTelaDasTransferencias(RESPOSTA);
    expect(t.transferencias[0]).toMatchObject({ numero: 7, quantidade_recebida: null, remessa_id: null, situacao: "enviada" });
    expect(t.variantes[0]?.tipo).toBe("aparelho");
    expect(t.itens[0]?.recebido).toBeNull();
    expect(t.saldos[0]).toEqual({ unidade_id: "a", variante_id: "v", quantidade: 3, reservado: 1 });
    expect(t.disponiveis[0]?.iccid).toBeNull();
  });

  it("forma inesperada é erro, nunca a tela vazia", () => {
    for (const ruim of [null, [], { ...RESPOSTA, transferencias: undefined }, { ...RESPOSTA, saldos: [{ unidade_id: "a", variante_id: "v", quantidade: 1.5, reservado: 0 }] },
      { ...RESPOSTA, itens: [{ transferencia_id: T, item_serializado_id: "i", recebido: "sim" }] }, { ...RESPOSTA, variantes: [{ id: "v" }] }]) {
      expect(() => lerTelaDasTransferencias(ruim)).toThrow();
    }
  });
});

describe("o que a tela faz com a resposta do banco", () => {
  const banco = (resposta: { data: unknown; error: { code: string } | null }) => {
    const chamadas: string[] = [];
    const argumentos: unknown[] = [];
    const tabela = { select: () => tabela, or: () => tabela, order: () => tabela, limit: () => tabela, in: () => tabela, eq: () => tabela,
      then: (r: (x: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r) };
    const supabase = {
      rpc: async (nome: string, args: unknown) => { chamadas.push(nome); argumentos.push(args); return resposta; },
      from: (nome: string) => { chamadas.push(nome); return tabela; },
    };
    return { supabase: supabase as never, chamadas, argumentos };
  };

  it("com a função: uma ida só, com o limite da lista", async () => {
    const { supabase, chamadas, argumentos } = banco({ data: RESPOSTA, error: null });
    expect((await consultarTelaDasTransferencias(supabase, "a")).transferencias).toHaveLength(1);
    expect(chamadas).toEqual(["transferencias_tela"]);
    expect(argumentos).toEqual([{ p_limite: LIMITE_DA_LISTA }]);
  });

  it("o banco sem a função (PGRST202 ou 42883): as leituras de antes", async () => {
    for (const code of ["PGRST202", "42883"]) {
      const { supabase, chamadas } = banco({ data: null, error: { code } });
      expect(await consultarTelaDasTransferencias(supabase, "a")).toEqual({ transferencias: [], variantes: [], unidades: [], itens: [], remessas: [], saldos: [], disponiveis: [] });
      expect(chamadas).toEqual(["transferencias_tela", "transferencias"]);
    }
  });

  it("outra falha ou a resposta fora da forma vira a página de erro, nunca a lista vazia", async () => {
    await expect(consultarTelaDasTransferencias(banco({ data: null, error: { code: "57014" } }).supabase, "a")).rejects.toThrow();
    await expect(consultarTelaDasTransferencias(banco({ data: { transferencias: "x" }, error: null }).supabase, "a")).rejects.toThrow();
  });
});
