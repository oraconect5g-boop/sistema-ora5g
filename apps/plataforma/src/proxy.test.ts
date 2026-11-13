// O proxy renova a sessão e põe os cabeçalhos anti-cache antes de cada tela com login (REV-009). Cada
// lote novo acrescentava o caminho à mão, e /clientes, /crm e /pagamentos ficaram de fora até 13/11:
// este teste confere que toda tela real do menu passa por ele.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PAGINAS_REAIS } from "./lib/acesso/menu";
import { config } from "./proxy";

const cobre = (caminho: string) => config.matcher.some((padrao) => {
  if (!padrao.endsWith("/:path*")) return padrao === caminho;
  const raiz = padrao.slice(0, -"/:path*".length);
  return caminho === raiz || caminho.startsWith(`${raiz}/`);
});

describe("proxy de sessão", () => {
  it("cobre todas as telas reais do menu, e as exportações dentro delas", () => {
    expect(Object.values(PAGINAS_REAIS).map((p) => p.caminho).filter((c) => !cobre(c))).toEqual([]);
    for (const exportacao of ["/financeiro/exportar", "/relatorios/exportar"]) expect(cobre(exportacao), exportacao).toBe(true);
  });

  // O 307 sem login sai da página, quando ela confere a sessão antes de mandar qualquer coisa. Tela com
  // esqueleto de carregamento (loading.tsx) começa a mandar o esqueleto (200) antes da página: a sessão
  // tem de ser conferida no layout da rota, acima dele (correção do /financeiro, 10/11). O /metas nasceu
  // sem esse layout no G4b e só o E2E pegou; este teste pega antes.
  it("toda tela real com esqueleto de carregamento confere a sessão no layout, antes do esqueleto", () => {
    const app = join(new URL(".", import.meta.url).pathname, "app");
    const comEsqueleto = (pasta: string): string[] => readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
      if (!e.isDirectory()) return e.name === "loading.tsx" ? [pasta] : [];
      return e.name === "demo" ? [] : comEsqueleto(join(pasta, e.name));
    });
    const pastas = comEsqueleto(app);
    expect(pastas.length).toBeGreaterThanOrEqual(4);
    const semSessao = pastas.filter((p) => !existsSync(join(p, "layout.tsx")) || !readFileSync(join(p, "layout.tsx"), "utf8").includes("await obterSessao("));
    expect(semSessao.map((p) => p.slice(app.length))).toEqual([]);
  });

  it("não pega as páginas públicas nem a demonstração", () => {
    for (const caminho of ["/", "/entrar", "/entrar/recuperar", "/demo", "/demo/relatorios", "/saude", "/sair"]) expect(cobre(caminho), caminho).toBe(false);
  });
});
