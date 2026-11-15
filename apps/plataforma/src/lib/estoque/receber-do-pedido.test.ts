// Receber a mercadoria a partir do pedido de compra (lote INV-009b: ORA-INV-009): as linhas do que falta, o custo
// combinado só para quem vê custo, o item que não entra mais no estoque fora e a leitura do tipo de cada item.
import { describe, expect, it, vi } from "vitest";

import type { PedidoDeCompra } from "./pedidos-de-compra";
import { AVISOS_DO_PEDIDO, montarPedidoParaReceber, reaisDoCampo, tiposQueEntram } from "./receber-do-pedido";

const PEDIDO = "00000000-0000-4000-9000-0000000000a7";
const FORN = "00000000-0000-4000-9000-000000000060";
const CAPA = "00000000-0000-4000-9000-000000000031";
const APARELHO = "00000000-0000-4000-9000-000000000030";
const FONE = "00000000-0000-4000-9000-000000000039";
const item = (varianteId: string, quantidade: number, recebida: number, custoCombinado: number | null, linha = 1) => ({
  linha, varianteId, sku: `SKU-${linha}`, nome: `Item ${linha}`, produto: "Produto", quantidade, recebida, custoCombinado, custoDaNota: null,
});
const pedido = (itens: PedidoDeCompra["itens"], veCusto = true): PedidoDeCompra => ({
  id: PEDIDO, numero: 7, unidadeId: "00000000-0000-4000-8000-0000000000cc", fornecedorId: FORN, fornecedor: "Distribuidora", documento: null, previstoPara: null,
  situacao: "aberto", criadoEm: "2026-11-15T12:00:00Z", encerradoEm: null, motivo: null, observacao: null, veCusto, itens, foraDoPedido: [], entradasLigadas: [],
});
const TIPOS = new Map([[CAPA, "acessorio" as const], [APARELHO, "aparelho" as const]]);

describe("receber a partir do pedido (INV-009b)", () => {
  it("as linhas são o que falta, na ordem do pedido, com o custo combinado em reais; o completo e o recebido a mais ficam de fora", () => {
    const r = montarPedidoParaReceber(pedido([item(CAPA, 10, 4, 1_800, 1), item(APARELHO, 2, 0, 105_000, 2), item(CAPA, 3, 3, 900, 3), item(APARELHO, 1, 2, null, 4)]), TIPOS);
    expect(r).toEqual({
      id: PEDIDO, numero: 7, fornecedorId: FORN, fornecedor: "Distribuidora", deFora: 0,
      linhas: [
        { item: { id: CAPA, sku: "SKU-1", nome: "Item 1", tipo: "acessorio" }, falta: 6, custo: "18,00" },
        { item: { id: APARELHO, sku: "SKU-2", nome: "Item 2", tipo: "aparelho" }, falta: 2, custo: "1050,00" },
      ],
    });
  });

  it("sem custo.ver, o custo fica em branco; o item que não entra mais no estoque fica de fora e é contado", () => {
    const r = montarPedidoParaReceber(pedido([item(CAPA, 5, 0, 1_800), item(FONE, 2, 0, 500, 2)], false), TIPOS);
    expect(r).toMatchObject({ deFora: 1, linhas: [{ item: { id: CAPA }, falta: 5, custo: "" }] });
  });

  it("nada falta: completo; só falta item inativo: inativos; e cada aviso tem a sua mensagem", () => {
    expect(montarPedidoParaReceber(pedido([item(CAPA, 2, 2, null)]), TIPOS)).toBe("completo");
    expect(montarPedidoParaReceber(pedido([]), TIPOS)).toBe("completo");
    expect(montarPedidoParaReceber(pedido([item(FONE, 2, 0, null)]), TIPOS)).toBe("inativos");
    for (const chave of ["completo", "inativos", "nao_encontrado", "outra_loja", "encerrado", "indisponivel", "falha"]) expect(Object.hasOwn(AVISOS_DO_PEDIDO, chave)).toBe(true);
  });

  it("os reais do campo, como a pessoa digitaria", () => {
    expect([reaisDoCampo(1_800), reaisDoCampo(5), reaisDoCampo(129_990), reaisDoCampo(0)]).toEqual(["18,00", "0,05", "1299,90", "0,00"]);
  });

  it("o tipo de cada item: só os ativos de produto ativo que entram no estoque; falha da leitura: nulo; nenhum id: nem consulta", async () => {
    const consulta = { select: vi.fn(), in: vi.fn(), eq: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>;
    const resposta = { data: [{ id: CAPA, produtos: { tipo: "acessorio" } }, { id: APARELHO, produtos: { tipo: "aparelho" } }, { id: FONE, produtos: { tipo: "servico" } }], error: null };
    for (const m of ["select", "in", "eq"]) consulta[m]?.mockImplementation(() => Object.assign(Promise.resolve(resposta), consulta));
    const cliente = { from: vi.fn(() => consulta) } as never;
    expect(await tiposQueEntram(cliente, [CAPA, APARELHO, FONE])).toEqual(new Map([[CAPA, "acessorio"], [APARELHO, "aparelho"]]));
    expect(consulta.eq).toHaveBeenCalledWith("ativa", true);
    expect(consulta.eq).toHaveBeenCalledWith("produtos.ativo", true);
    const comErro = { data: null, error: { code: "57014" } };
    for (const m of ["select", "in", "eq"]) consulta[m]?.mockImplementation(() => Object.assign(Promise.resolve(comErro), consulta));
    expect(await tiposQueEntram(cliente, [CAPA])).toBeNull();
    const semConsulta = { from: vi.fn() };
    expect(await tiposQueEntram(semConsulta as never, [])).toEqual(new Map());
    expect(semConsulta.from).not.toHaveBeenCalled();
  });
});
