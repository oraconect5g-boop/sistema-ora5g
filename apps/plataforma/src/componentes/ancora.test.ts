// Âncora do endereço quando o esqueleto de carregamento aparece no meio da navegação (lote VEL-a). O Next dá a
// rolagem por resolvida quando o elemento ainda não existe; estas peças devolvem a rolagem só nesse caso. Aqui se
// confere a decisão e a ordem dos acontecimentos, sem navegador: os dois componentes só chamam estas funções com o
// endereço da janela. A rolagem de verdade entra na jornada com login (depende das contas de teste).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ancoraDepoisDoEsqueleto, IrParaAncora, MarcaDeEsqueleto } from "./ancora";

describe("a decisão: até onde rolar depois do esqueleto", () => {
  it("sem esqueleto antes, ou com o esqueleto de outro endereço, não rola", () => {
    expect(ancoraDepoisDoEsqueleto(null, "/caixa#saidas")).toBeNull();
    expect(ancoraDepoisDoEsqueleto("/caixa", "/caixa#saidas")).toBeNull();
    expect(ancoraDepoisDoEsqueleto("/caixa#saidas", "/caixa#fechar")).toBeNull();
    expect(ancoraDepoisDoEsqueleto("/estoque/entrada?pedido=1#nova", "/estoque/entrada?pedido=2#nova")).toBeNull();
  });

  it("no mesmo endereço sem âncora, ou só com o #, não rola", () => {
    expect(ancoraDepoisDoEsqueleto("/caixa", "/caixa")).toBeNull();
    expect(ancoraDepoisDoEsqueleto("/vendas?de=2026-11-01", "/vendas?de=2026-11-01")).toBeNull();
    expect(ancoraDepoisDoEsqueleto("/caixa#", "/caixa#")).toBeNull();
  });

  it("no mesmo endereço com âncora, rola até ela (com a busca no meio e com acento escrito em %)", () => {
    expect(ancoraDepoisDoEsqueleto("/caixa#saidas", "/caixa#saidas")).toBe("saidas");
    expect(ancoraDepoisDoEsqueleto("/contas-a-pagar?ver=abertas&loja=#lancar", "/contas-a-pagar?ver=abertas&loja=#lancar")).toBe("lancar");
    expect(ancoraDepoisDoEsqueleto("/x#lan%C3%A7ar", "/x#lan%C3%A7ar")).toBe("lançar");
  });

  it("% solto na âncora não quebra a tela: não rola", () => {
    expect(ancoraDepoisDoEsqueleto("/x#100%", "/x#100%")).toBeNull();
  });
});

describe("a ordem dos acontecimentos", () => {
  // O estado fica no módulo (um por documento do navegador): cada teste começa com um módulo novo.
  let ancora: typeof import("./ancora");
  beforeEach(async () => {
    vi.resetModules();
    ancora = await import("./ancora");
  });

  it("no primeiro carregamento do documento a âncora é do navegador: esqueleto e tela não rolam", () => {
    ancora.aoMostrarEsqueleto("/caixa#saidas");
    expect(ancora.aoMontarTela("/caixa#saidas")).toBeNull();
  });

  it("navegação sem recarregar em que o esqueleto apareceu: rola até a âncora quando a tela chega, uma vez só", () => {
    expect(ancora.aoMontarTela("/inicio")).toBeNull();
    ancora.aoMostrarEsqueleto("/caixa#saidas");
    expect(ancora.aoMontarTela("/caixa#saidas")).toBe("saidas");
    // a mesma tela montando de novo (o React monta duas vezes no desenvolvimento) não rola outra vez
    expect(ancora.aoMontarTela("/caixa#saidas")).toBeNull();
  });

  it("navegação em que o esqueleto não apareceu (o Next já rolou): não rola de novo", () => {
    expect(ancora.aoMontarTela("/inicio")).toBeNull();
    expect(ancora.aoMontarTela("/caixa#saidas")).toBeNull();
  });

  it("esqueleto de um endereço e tela de outro (a pessoa tocou em outro link no meio): não rola, e o esqueleto é esquecido", () => {
    expect(ancora.aoMontarTela("/inicio")).toBeNull();
    ancora.aoMostrarEsqueleto("/caixa#saidas");
    expect(ancora.aoMontarTela("/estoque")).toBeNull();
    expect(ancora.aoMontarTela("/caixa#saidas")).toBeNull();
  });

  it("esqueleto sem âncora no endereço: não rola", () => {
    expect(ancora.aoMontarTela("/inicio")).toBeNull();
    ancora.aoMostrarEsqueleto("/vendas?de=2026-11-01");
    expect(ancora.aoMontarTela("/vendas?de=2026-11-01")).toBeNull();
  });
});

describe("as duas peças", () => {
  it("não desenham nada", () => {
    expect(renderToStaticMarkup(createElement(MarcaDeEsqueleto))).toBe("");
    expect(renderToStaticMarkup(createElement(IrParaAncora))).toBe("");
  });
});
