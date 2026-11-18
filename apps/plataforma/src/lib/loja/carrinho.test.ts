// O carrinho do site (lote ONLINE-d; ADR-023): o cookie lido com rigor, uma loja só, até 3 unidades. Identificadores FICTÍCIOS.
import { describe, expect, it } from "vitest";

import { CARRINHO_VAZIO, codigoDoPedido, comOItem, erroDoPedido, ERROS_DO_PEDIDO, escreverCarrinho, lerCarrinho, lerPedidoDoSite, nomeDoItem, semOItem } from "./carrinho";

const LOJA_A = "00000000-0000-4000-8000-0000000000a1";
const LOJA_B = "00000000-0000-4000-8000-0000000000a2";
const P = "00000000-0000-4000-8000-0000000000b1";
const CAPA = "00000000-0000-4000-8000-0000000000c1";
const GALAXY = "00000000-0000-4000-8000-0000000000c2";

describe("o carrinho", () => {
  it("vai e volta pelo cookie; forma estranha vira carrinho vazio", () => {
    const c = { loja: LOJA_A, itens: [{ produto: P, variante: CAPA }, { produto: P, variante: GALAXY }] };
    expect(lerCarrinho(escreverCarrinho(c))).toEqual(c);
    for (const ruim of [undefined, "", "{", "[]", JSON.stringify({ l: "x", i: [[P, CAPA]] }), JSON.stringify({ l: LOJA_A, i: [] }),
      JSON.stringify({ l: LOJA_A, i: [[P, CAPA], [P, CAPA], [P, CAPA], [P, CAPA]] }), JSON.stringify({ l: LOJA_A, i: [[P, "1 or 1=1"]] }), "x".repeat(601)]) {
      expect(lerCarrinho(ruim), String(ruim).slice(0, 40)).toEqual(CARRINHO_VAZIO);
    }
  });

  it("uma loja só e até 3 unidades: o item de outra loja pede a troca; cheio, nada muda", () => {
    let c = comOItem(CARRINHO_VAZIO, LOJA_A, { produto: P, variante: CAPA }).carrinho;
    c = comOItem(c, LOJA_A, { produto: P, variante: CAPA }).carrinho;
    expect(comOItem(c, LOJA_B, { produto: P, variante: GALAXY })).toEqual({ carrinho: c, problema: "outra_loja" });
    expect(comOItem(c, LOJA_B, { produto: P, variante: GALAXY }, true)).toEqual({ carrinho: { loja: LOJA_B, itens: [{ produto: P, variante: GALAXY }] }, problema: null });
    c = comOItem(c, LOJA_A, { produto: P, variante: GALAXY }).carrinho;
    expect(c.itens).toHaveLength(3);
    expect(comOItem(c, LOJA_A, { produto: P, variante: CAPA })).toEqual({ carrinho: c, problema: "cheio" });
    expect(semOItem(c, 1).itens.map((i) => i.variante)).toEqual([CAPA, GALAXY]);
    expect(semOItem(semOItem(semOItem(c, 0), 0), 0)).toEqual(CARRINHO_VAZIO);
    expect(semOItem(c, 9)).toBe(c);
  });
});

describe("o pedido do site", () => {
  const pedido = {
    codigo: "ABC234", situacao: "reservado", expira_em: "2026-11-19T03:00:00Z", total_centavos: 165_700, unidades: 2,
    itens: [{ produto: "Capa", variacao: "Azul", preco_centavos: 7_900 }, { produto: "Galaxy A15", variacao: "128 GB", preco_centavos: 157_800 }],
    loja: { nome: "Santa Cândida", endereco: null, cidade: "Curitiba" },
  };
  it("lê a resposta do banco com rigor; o código digitado em maiúsculas", () => {
    expect(lerPedidoDoSite(pedido)).toMatchObject({ codigo: "ABC234", unidades: 2, loja: { nome: "Santa Cândida", endereco: null } });
    for (const ruim of [null, [], { ...pedido, codigo: "abc" }, { ...pedido, situacao: "pago" }, { ...pedido, itens: [{ produto: 1 }] }, { ...pedido, loja: null }]) {
      expect(lerPedidoDoSite(ruim), JSON.stringify(ruim)?.slice(0, 60)).toBeNull();
    }
    expect([codigoDoPedido(" abc234 "), codigoDoPedido("ABC10I"), codigoDoPedido(7)]).toEqual(["ABC234", null, null]);
    // O item no pedido: o produto e a variação, sem repetir o nome quando a variação só repete o produto.
    expect([nomeDoItem("Capa de silicone", "Azul"), nomeDoItem("Capa de proteção", "Capa de proteção"), nomeDoItem("Cabo", "")]).toEqual(["Capa de silicone · Azul", "Capa de proteção", "Cabo"]);
  });

  it("cada recusa do banco ao pedido vira uma mensagem que existe", () => {
    const casos = [["22023", "dados"], ["OR034", "limite_whatsapp"], ["OR035", "limite_loja"], ["OR001", "sem_estoque"], ["OR036", "indisponivel"],
      ["OR038", "loja_fechada"], ["OR004", "repetido"], ["PGRST202", "sem_pedido"], ["42883", "sem_pedido"], ["57014", "falha"]] as const;
    for (const [code, erro] of casos) {
      expect(erroDoPedido({ code }), code).toBe(erro);
      expect(Object.hasOwn(ERROS_DO_PEDIDO, erro)).toBe(true);
    }
    expect(erroDoPedido(null)).toBe("falha");
  });
});
