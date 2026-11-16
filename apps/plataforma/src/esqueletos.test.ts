// O esqueleto de carregamento das telas reais (lote VEL-a: ORA-QUAL-010). Quem toca num item do menu vê a tela
// mudar na hora, em vez de segundos parado na tela anterior. Este teste confere, nos arquivos, que nenhuma tela do
// menu ficou de fora, que o esqueleto não leva dado nem texto além do rótulo e que a âncora do endereço continua
// funcionando quando ele aparece (ancora.tsx). A sessão conferida ANTES do esqueleto está em proxy.test.ts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EsqueletoDeTela } from "./componentes/EsqueletoDeTela";
import { PAGINAS_REAIS } from "./lib/acesso/menu";

const src = new URL(".", import.meta.url).pathname;
const app = join(src, "app");
const ler = (...partes: string[]) => readFileSync(join(...partes), "utf8");
/** Todos os loading.tsx das telas reais (a demonstração não tem login nem leitura do banco). */
const esqueletos = (pasta: string): string[] => readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
  if (!e.isDirectory()) return e.name === "loading.tsx" ? [join(pasta, e.name)] : [];
  return e.name === "demo" ? [] : esqueletos(join(pasta, e.name));
});
/** A largura que um arquivo passa (largura="max-w-…"); sem a propriedade, vale a do molde. */
const largura = (texto: string) => /\blargura="([^"]+)"/.exec(texto)?.[1] ?? "max-w-3xl";

describe("esqueleto de carregamento das telas reais", () => {
  it("toda tela do menu tem esqueleto na pasta dela (a de cima, que vale para as telas de dentro)", () => {
    const pastas = [...new Set(Object.values(PAGINAS_REAIS).map((p) => p.caminho.split("/")[1] ?? ""))];
    expect(pastas.length).toBeGreaterThanOrEqual(26);
    expect(pastas.filter((pasta) => !existsSync(join(app, pasta, "loading.tsx")))).toEqual([]);
  });

  it("todo esqueleto anota o endereço que está carregando, e o molde rola até a âncora quando a tela chega", () => {
    const todos = esqueletos(app);
    expect(todos.length).toBeGreaterThanOrEqual(29);
    // O esqueleto compartilhado já leva a marca; o desenhado à mão (início, financeiro, metas…) leva a marca direto.
    expect(todos.filter((arquivo) => !/<EsqueletoDeTela\b|<MarcaDeEsqueleto \/>/.test(ler(arquivo))).map((a) => a.slice(app.length))).toEqual([]);
    expect(ler(src, "componentes", "EsqueletoDeTela.tsx")).toContain("<MarcaDeEsqueleto />");
    expect(ler(src, "componentes", "MoldeReal.tsx")).toContain("<IrParaAncora />");
  });

  it("o esqueleto compartilhado tem a largura da tela que vem, para o conteúdo não pular quando chega", () => {
    const diferentes = esqueletos(app).filter((arquivo) => {
      const pagina = join(arquivo, "..", "page.tsx");
      const texto = ler(arquivo);
      return texto.includes("<EsqueletoDeTela") && existsSync(pagina) && largura(texto) !== largura(ler(pagina));
    });
    expect(diferentes.map((a) => a.slice(app.length))).toEqual([]);
  });

  it("não leva dado algum: só o rótulo, dito uma vez a quem usa leitor de tela, e o desenho escondido dele", () => {
    const html = renderToStaticMarkup(createElement(EsqueletoDeTela, { rotulo: "Carregando o caixa", largura: "max-w-5xl" }));
    expect(html.startsWith('<p role="status" class="sr-only">Carregando o caixa</p><div aria-hidden="true"')).toBe(true);
    // fora do rótulo, nenhum texto: só blocos vazios
    expect(html.replace('<p role="status" class="sr-only">Carregando o caixa</p>', "").replace(/<[^>]*>/g, "")).toBe("");
    expect(html).toContain("max-w-5xl");
    expect(renderToStaticMarkup(createElement(EsqueletoDeTela, { rotulo: "Carregando" }))).toContain("max-w-3xl");
  });

  it("cada pasta diz o que está carregando, com um nome de componente só dela", () => {
    const compartilhados = esqueletos(app).map((arquivo) => ler(arquivo)).filter((texto) => texto.includes("<EsqueletoDeTela"));
    const rotulos = compartilhados.map((texto) => /rotulo="([^"]+)"/.exec(texto)?.[1]);
    expect(rotulos.every((r) => r?.startsWith("Carregando "))).toBe(true);
    expect(new Set(rotulos).size).toBe(rotulos.length);
    const nomes = compartilhados.map((texto) => /export default function (\w+)/.exec(texto)?.[1]);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});
