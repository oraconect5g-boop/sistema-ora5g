// O topo da loja online (lote ONLINE-e): o Carrinho diz quantos itens tem, lido do cookie do carrinho (só os
// identificadores; sem ir ao banco). Cookie fictício, sem rede.
import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (nome: string) => (nome === "ora_carrinho" && cenario.cookie !== undefined ? { name: nome, value: cenario.cookie } : undefined) }),
}));

import { escreverCarrinho } from "../../lib/loja/carrinho";
import LayoutDaLoja from "./layout";

const LOJA = "00000000-0000-4000-8000-0000000000b1";
const ITEM = { produto: "00000000-0000-4000-8000-0000000000a1", variante: "00000000-0000-4000-8000-0000000000d1" };

function achar(v: unknown, criterio: (p: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  if (Array.isArray(v)) {
    for (const x of v) { const a = achar(x, criterio); if (a) return a; }
  } else if (isValidElement<Record<string, unknown>>(v)) {
    if (criterio(v.props)) return v.props;
    for (const filho of Object.values(v.props)) { const a = achar(filho, criterio); if (a) return a; }
  }
  return null;
}
function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join("");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return texto(v.props.children);
  return "";
}
const carrinhoNoTopo = async () => achar(await LayoutDaLoja({ children: null }), (p) => p.href === "/loja/carrinho");

describe("o Carrinho no topo da loja (ONLINE-e)", () => {
  it("vazio, só a palavra; com itens, o número e o nome que o leitor de tela diz; cookie estranho conta como vazio", async () => {
    cenario.cookie = undefined;
    let link = await carrinhoNoTopo();
    expect(link?.["aria-label"]).toBeUndefined();
    expect(texto(link?.children).trim()).toBe("Carrinho");
    cenario.cookie = escreverCarrinho({ loja: LOJA, itens: [ITEM, ITEM] });
    link = await carrinhoNoTopo();
    expect(link?.["aria-label"]).toBe("Carrinho, 2 itens");
    expect(texto(link?.children).replace(/\s+/g, "")).toBe("Carrinho2");
    cenario.cookie = escreverCarrinho({ loja: LOJA, itens: [ITEM] });
    expect((await carrinhoNoTopo())?.["aria-label"]).toBe("Carrinho, 1 item");
    for (const estranho of ["{quebrado", JSON.stringify({ l: LOJA, i: [[ITEM.produto, ITEM.variante], [ITEM.produto, ITEM.variante], [ITEM.produto, ITEM.variante], [ITEM.produto, ITEM.variante]] }), JSON.stringify({ l: "x", i: [] })]) {
      cenario.cookie = estranho;
      expect((await carrinhoNoTopo())?.["aria-label"], estranho).toBeUndefined();
    }
  });
});
