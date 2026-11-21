// A página de erro das telas (ROB-a, 21/11): além de "Tentar de novo" e da página inicial, os atalhos para as telas
// principais, porque a página de erro não tem o menu e a página inicial pode ser a própria tela que falhou (o Início, num
// momento de banco lento). Nenhum link pré-carrega: o banco pode estar lento. O next/link é trocado por um que guarda as
// propriedades de cada link.
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

import ErroDaTela from "./error";

beforeEach(() => {
  links.length = 0;
});

describe("a página de erro das telas", () => {
  const pagina = () => renderToStaticMarkup(createElement(ErroDaTela, { error: Object.assign(new Error("x"), { digest: "123" }), reset: () => undefined }));

  it("diz o que houve, com o código, e oferece tentar de novo", () => {
    const html = pagina();
    expect(html).toContain("Algo deu errado nesta tela");
    expect(html).toContain("com o código 123");
    expect(html).toContain("Tentar de novo");
  });

  it("tem atalhos para as telas principais, para ninguém ficar preso nela", () => {
    pagina();
    expect(links.map((l) => l.href)).toEqual(["/", "/vender", "/vendas", "/estoque", "/caixa"]);
  });

  it("nenhum link pré-carrega", () => {
    pagina();
    expect(links.every((l) => l.prefetch === false)).toBe(true);
  });
});
