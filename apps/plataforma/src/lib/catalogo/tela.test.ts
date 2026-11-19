// A tela do Catálogo numa ida (lote VEL-d): a leitura estrita da resposta de public.catalogo_tela e o que a tela faz com
// cada resposta do banco. Dados FICTÍCIOS. A função de verdade está em packages/banco/src/catalogo-estoque-numa-ida.test.ts.
import { describe, expect, it, vi } from "vitest";

vi.mock("../acesso/sessao", () => ({ FalhaDoServico: class FalhaDoServico extends Error {} }));

import { consultarTelaDoCatalogo, lerTelaDoCatalogo } from "./tela";

const RESPOSTA = {
  pendencias: [{ produto_id: "p2", variante_id: null, sku: "SKU-2", nome: "Capa", motivo: "produto sem foto" }],
  produtos: [{ id: "p2", nome: "Capa", tipo: "acessorio", organizacao_id: "o" }, { id: "p1", nome: "Água", tipo: "acessorio", organizacao_id: "o" }],
  mais: false,
  variantes: [{ id: "v2", produto_id: "p2", sku: "SKU-2", nome: "Capa azul", cor: "azul" }, { id: "v1", produto_id: "p1", sku: "SKU-1", nome: "Água", cor: null }],
  fotos: [{ id: "f1", produto_id: "p1", variante_id: null, caminho: "o/p1/produto/1.webp", ilustracao: false }],
  saldos: [{ variante_id: "v1", quantidade: 4, reservado: 1 }],
};

describe("a leitura da resposta", () => {
  it("lê cada parte, com os produtos na ordem do nome (pt-BR) e as variações na do SKU", () => {
    const t = lerTelaDoCatalogo(RESPOSTA);
    expect(t.produtos.map((p) => p.nome)).toEqual(["Água", "Capa"]);
    expect(t.variantes.map((v) => v.sku)).toEqual(["SKU-1", "SKU-2"]);
    expect(t.saldos).toEqual([{ variante_id: "v1", quantidade: 4, reservado: 1 }]);
    expect(t.pendencias[0]?.variante_id).toBeNull();
    expect(t.mais).toBe(false);
  });

  it("forma inesperada é erro, nunca vazio", () => {
    for (const ruim of [null, [], { ...RESPOSTA, mais: "não" }, { ...RESPOSTA, saldos: [{ variante_id: "v1", quantidade: 1.5, reservado: 0 }] },
      { ...RESPOSTA, produtos: [{ id: "p1" }] }, { ...RESPOSTA, fotos: undefined }]) {
      expect(() => lerTelaDoCatalogo(ruim)).toThrow();
    }
  });
});

describe("o que a tela faz com a resposta do banco", () => {
  const banco = (resposta: { data: unknown; error: { code: string } | null }) => {
    const chamadas: string[] = [];
    const tabela = { select: () => tabela, eq: () => tabela, in: () => tabela, is: () => tabela, order: () => tabela, range: () => tabela,
      then: (r: (x: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r) };
    const supabase = {
      rpc: async (nome: string) => { chamadas.push(nome); return nome === "catalogo_tela" ? resposta : { data: [], error: null }; },
      from: (nome: string) => { chamadas.push(nome); return tabela; },
    };
    return { supabase: supabase as never, chamadas };
  };
  const pedido = { ids: null, soPendentes: false, unidade: "loja", limite: 200 };

  it("com a função: uma ida só", async () => {
    const { supabase, chamadas } = banco({ data: RESPOSTA, error: null });
    expect((await consultarTelaDoCatalogo(supabase, pedido)).produtos).toHaveLength(2);
    expect(chamadas).toEqual(["catalogo_tela"]);
  });

  it("o banco sem a função (PGRST202 ou 42883): as leituras de antes", async () => {
    for (const code of ["PGRST202", "42883"]) {
      const { supabase, chamadas } = banco({ data: null, error: { code } });
      expect(await consultarTelaDoCatalogo(supabase, pedido)).toMatchObject({ produtos: [], variantes: [], saldos: [] });
      expect(chamadas[0]).toBe("catalogo_tela");
      expect(chamadas).toContain("pendencias_de_foto");
      expect(chamadas).toContain("produtos");
    }
  });

  it("outra falha ou a resposta fora da forma vira a página de erro, nunca o catálogo vazio", async () => {
    await expect(consultarTelaDoCatalogo(banco({ data: null, error: { code: "57014" } }).supabase, pedido)).rejects.toThrow();
    await expect(consultarTelaDoCatalogo(banco({ data: { produtos: "x" }, error: null }).supabase, pedido)).rejects.toThrow();
  });
});
