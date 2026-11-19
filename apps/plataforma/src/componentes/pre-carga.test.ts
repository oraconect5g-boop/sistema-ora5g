// A pré-carga do menu (lote VEL-h): nas telas reais, só os 4 atalhos pré-carregam a tela ao aparecer (a barra de baixo no
// celular e os mesmos no menu lateral do computador); a lista do "Mais" e o resto do menu lateral carregam no toque. Sem a
// configuração das telas reais (a demonstração), tudo segue pré-carregando como antes. O next/link é trocado por um que
// guarda as propriedades de cada link.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const links = vi.hoisted(() => [] as { href: string; prefetch?: boolean | null }[]);
vi.mock("next/link", () => ({
  default: (props: { href: string; prefetch?: boolean | null; children?: unknown }) => {
    links.push({ href: props.href, prefetch: props.prefetch });
    return createElement("a", { href: props.href }, props.children as never);
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/vendas" }));

import { NavegacaoCelular, type ItemNavegacao } from "./NavegacaoCelular";
import { Trilho } from "./Trilho";
import { FiltroSegmentado } from "./ui";

const item = (href: string): ItemNavegacao => ({ href, titulo: href.slice(1), curto: href.slice(1), icone: "inicio" });
const ATALHOS = ["/inicio", "/vender", "/aprovacoes", "/vendas"].map(item);
const DO_MAIS = [{ grupo: "Gestão", itens: ["/financeiro", "/relatorios", "/auditoria"].map(item) }];
const preCargaDe = (href: string) => links.filter((l) => l.href === href).map((l) => l.prefetch);

beforeEach(() => {
  links.length = 0;
});

describe("a barra do celular", () => {
  const barra = (preCarregarMais?: boolean) =>
    renderToStaticMarkup(createElement(NavegacaoCelular, { atalhos: ATALHOS, grupos: DO_MAIS, preCarregarMais, pessoa: "Ana", papel: "Gerente", loja: "Loja" }));

  it("nas telas reais, os atalhos pré-carregam e o \"Mais\" carrega no toque", () => {
    barra(false);
    for (const a of ATALHOS) expect(preCargaDe(a.href), a.href).toEqual([undefined]);
    for (const i of DO_MAIS[0]!.itens) expect(preCargaDe(i.href), i.href).toEqual([false]);
  });

  it("sem a configuração (a demonstração), o \"Mais\" segue pré-carregando", () => {
    barra();
    for (const i of DO_MAIS[0]!.itens) expect(preCargaDe(i.href), i.href).toEqual([undefined]);
  });
});

describe("o menu lateral do computador", () => {
  const GRUPOS = [{ grupo: "Operação", itens: ATALHOS }, ...DO_MAIS];
  const trilho = (preCarregar?: readonly string[]) =>
    renderToStaticMarkup(createElement(Trilho, { inicio: "/inicio", grupos: GRUPOS, pessoa: "Ana", papel: "Gerente", versao: "v0", preCarregar }));

  it("nas telas reais, só os atalhos pré-carregam; a logo e o resto carregam no clique", () => {
    trilho(ATALHOS.map((a) => a.href));
    // /inicio aparece duas vezes: a logo (sem pré-carga) e o item do menu (com).
    expect(preCargaDe("/inicio").sort()).toEqual([false, undefined].sort());
    for (const a of ATALHOS.slice(1)) expect(preCargaDe(a.href), a.href).toEqual([undefined]);
    for (const i of DO_MAIS[0]!.itens) expect(preCargaDe(i.href), i.href).toEqual([false]);
  });

  it("sem a lista (a demonstração), tudo pré-carrega", () => {
    trilho();
    expect(links.every((l) => l.prefetch === undefined)).toBe(true);
  });
});

describe("os filtros das telas", () => {
  it("abrem a mesma tela com outro recorte no toque, sem pré-carga", () => {
    renderToStaticMarkup(createElement(FiltroSegmentado, {
      rotulo: "Loja",
      opcoes: ["/inicio?loja=a", "/inicio?loja=b", "/inicio?loja=rede"].map((href, i) => ({ href, rotulo: `Loja ${i}`, ativo: i === 0 })),
    }));
    expect(links.map((l) => l.prefetch)).toEqual([false, false, false]);
  });
});
