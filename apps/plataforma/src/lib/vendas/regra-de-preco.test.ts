// A regra de preço de cada item (lote L6b): a frase que a tela mostra e a leitura das linhas de preço.
// A gravação no banco está provada em packages/banco/src/venda-regra-de-preco.test.ts. Dados fictícios.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lerLinhasDePreco, regraDoItem, regraNaTela, regrasDosItens, type LinhaDePreco } from "./regra-de-preco";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const linha = (extra: Partial<LinhaDePreco>): LinhaDePreco => ({ id: "p1", origem: "importacao", unidade_id: null, motivo: null, fim: null, ...extra });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); });

describe("regra de preço do item (L6b)", () => {
  it("campanha da loja ou da rede, com o nome e até quando; preço da loja ou da rede; item antigo e linha não lida", () => {
    const linhas = new Map([
      ["c1", linha({ id: "c1", origem: "campanha", unidade_id: LOJA, motivo: "Semana da capa", fim: "2026-11-15T02:59:00Z" })],
      ["c2", linha({ id: "c2", origem: "campanha", motivo: "  ", fim: null })],
      ["m1", linha({ id: "m1", origem: "manual", unidade_id: LOJA })],
      ["i1", linha({ id: "i1" })],
    ]);
    expect(regraDoItem("c1", linhas)).toEqual({ texto: "Campanha da loja: Semana da capa (até 14/11, 23:59)", campanha: true });
    expect(regraDoItem("c2", linhas)).toEqual({ texto: "Campanha da rede: sem nome", campanha: true });
    expect(regraDoItem("m1", linhas)).toEqual({ texto: "Preço da loja", campanha: false });
    expect(regraDoItem("i1", linhas)).toEqual({ texto: "Preço da rede", campanha: false });
    expect(regraDoItem(null, linhas)).toEqual({ texto: "Regra de preço não registrada (item de antes de 13/11/2026)", campanha: false });
    expect(regraDoItem("x9", linhas).texto).toBe("Regra de preço não lida agora");
    expect(regraDoItem("c1", null).texto).toBe("Regra de preço não lida agora");
  });

  it("lê as linhas numa pergunta só, sem repetir; sem item com regra, não pergunta; falha volta null com o código", async () => {
    const pedidos: unknown[][] = [];
    const cliente = (resposta: { data: unknown; error: null | { code: string } }) => ({
      from: () => ({ select: () => ({ in: (_c: string, ids: unknown[]) => { pedidos.push(ids); return Promise.resolve(resposta); } }) }),
    }) as unknown as Parameters<typeof lerLinhasDePreco>[0];
    const ok = await lerLinhasDePreco(cliente({ data: [linha({ id: "c1" })], error: null }), ["c1", null, "c1"]);
    expect([...(ok ?? new Map()).keys()]).toEqual(["c1"]);
    expect(pedidos).toEqual([["c1"]]);
    expect(await lerLinhasDePreco(cliente({ data: [], error: null }), [null, null])).toEqual(new Map());
    expect(pedidos).toHaveLength(1);
    expect(await lerLinhasDePreco(cliente({ data: null, error: { code: "57014" } }), ["c1"])).toBeNull();
    expect(vi.mocked(console.error).mock.calls).toEqual([["vendas: falha ao ler as regras de preço dos itens", { codigo: "57014" }]]);
  });

  it("as regras de uma venda, lidas à parte: banco sem a coluna é indisponível (sem nada na tela); falha diz \"não lida\"", async () => {
    const cliente = (itens: { data: unknown; error: null | { code: string } }, precos: { data: unknown; error: null | { code: string } }) => ({
      from: (tabela: string) => ({
        select: () => (tabela === "venda_itens"
          ? { eq: () => Promise.resolve(itens) }
          : { in: () => Promise.resolve(precos) }),
      }),
    }) as unknown as Parameters<typeof regrasDosItens>[0];
    const ok = await regrasDosItens(cliente({ data: [{ id: "i1", preco_id: "c1" }, { id: "i2", preco_id: null }], error: null }, { data: [linha({ id: "c1", origem: "campanha", motivo: "Natal" })], error: null }), "v1");
    expect([regraNaTela(ok, "i1"), regraNaTela(ok, "i2")?.texto, regraNaTela(ok, "i3")?.texto]).toEqual([
      { texto: "Campanha da rede: Natal", campanha: true }, "Regra de preço não registrada (item de antes de 13/11/2026)", "Regra de preço não lida agora",
    ]);
    const semColuna = await regrasDosItens(cliente({ data: null, error: { code: "42703" } }, { data: [], error: null }), "v1");
    expect([semColuna, regraNaTela(semColuna, "i1")]).toEqual([{ estado: "indisponivel" }, null]);
    expect(await regrasDosItens(cliente({ data: null, error: { code: "PGRST204" } }, { data: [], error: null }), "v1")).toEqual({ estado: "indisponivel" });
    expect(vi.mocked(console.error).mock.calls).toEqual([]);
    const falha = await regrasDosItens(cliente({ data: null, error: { code: "57014" } }, { data: [], error: null }), "v1");
    expect([falha, regraNaTela(falha, "i1")?.texto]).toEqual([{ estado: "falha" }, "Regra de preço não lida agora"]);
    expect(await regrasDosItens(cliente({ data: [{ id: "i1", preco_id: "c1" }], error: null }, { data: null, error: { code: "57014" } }), "v1")).toEqual({ estado: "falha" });
    expect(vi.mocked(console.error).mock.calls.map((c) => c[0])).toEqual(["vendas: falha ao ler a regra de preço dos itens", "vendas: falha ao ler as regras de preço dos itens"]);
  });
});
