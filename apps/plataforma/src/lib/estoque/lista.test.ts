// A lista do estoque numa ida (lote VEL-d): a leitura estrita da resposta de public.estoque_lista e o que a tela faz com
// cada resposta do banco. Dados FICTÍCIOS. A função de verdade está em packages/banco/src/catalogo-estoque-numa-ida.test.ts.
import { describe, expect, it, vi } from "vitest";

vi.mock("../acesso/sessao", () => ({ FalhaDoServico: class FalhaDoServico extends Error {} }));

import { consultarListaDoEstoque, lerListaDoEstoque } from "./lista";

const RESPOSTA = {
  total: 3, pagina: 2,
  linhas: [{ id: "v3", nome: "Capa 3", sku: "CAP-3", estoque_minimo: 1, produto_id: "p3", quantidade: 2, reservado: 0 }],
  fotos: [{ id: "f3", produto_id: "p3", variante_id: "v3", caminho: "o/p3/v3/1.webp", ilustracao: false }],
};

describe("a leitura da resposta", () => {
  it("lê o total, a página, as linhas e as fotos", () => {
    expect(lerListaDoEstoque(RESPOSTA)).toEqual(RESPOSTA);
  });

  it("forma inesperada é erro, nunca vazio", () => {
    for (const ruim of [null, { ...RESPOSTA, pagina: 0 }, { ...RESPOSTA, total: -1 }, { ...RESPOSTA, total: "3" },
      { ...RESPOSTA, linhas: [{ id: "v3" }] }, { ...RESPOSTA, fotos: null }]) {
      expect(() => lerListaDoEstoque(ruim)).toThrow();
    }
  });
});

describe("o que a tela faz com a resposta do banco", () => {
  const banco = (resposta: { data: unknown; error: { code: string } | null }, contagem = 0) => {
    const chamadas: string[] = [];
    const tabela = { select: () => tabela, eq: () => tabela, order: () => tabela, range: () => tabela,
      then: (r: (x: unknown) => unknown) => Promise.resolve({ data: [], count: contagem, error: null }).then(r) };
    const supabase = {
      rpc: async (nome: string) => { chamadas.push(nome); return resposta; },
      from: (nome: string) => { chamadas.push(nome); return tabela; },
    };
    return { supabase: supabase as never, chamadas };
  };

  it("com a função: uma ida só, com as fotos da página", async () => {
    const { supabase, chamadas } = banco({ data: RESPOSTA, error: null });
    expect(await consultarListaDoEstoque(supabase, "loja", 2, 100)).toEqual(RESPOSTA);
    expect(chamadas).toEqual(["estoque_lista"]);
  });

  it("o banco sem a função: as leituras de antes, e as fotos ficam para a tela ler", async () => {
    const { supabase, chamadas } = banco({ data: null, error: { code: "PGRST202" } });
    expect(await consultarListaDoEstoque(supabase, "loja", 1, 100)).toEqual({ total: 0, pagina: 1, linhas: [], fotos: null });
    expect(chamadas).toEqual(["estoque_lista", "variantes"]);
  });

  it("outra falha ou a resposta fora da forma vira a página de erro, nunca a lista vazia", async () => {
    await expect(consultarListaDoEstoque(banco({ data: null, error: { code: "57014" } }).supabase, "loja", 1, 100)).rejects.toThrow();
    await expect(consultarListaDoEstoque(banco({ data: { total: 1 }, error: null }).supabase, "loja", 1, 100)).rejects.toThrow();
  });
});
