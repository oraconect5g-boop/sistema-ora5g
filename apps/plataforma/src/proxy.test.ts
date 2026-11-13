// O proxy renova a sessão e põe os cabeçalhos anti-cache antes de cada tela com login (REV-009). Cada
// lote novo acrescentava o caminho à mão, e /clientes, /crm e /pagamentos ficaram de fora até 13/11:
// este teste confere que toda tela real do menu passa por ele.
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

  it("não pega as páginas públicas nem a demonstração", () => {
    for (const caminho of ["/", "/entrar", "/entrar/recuperar", "/demo", "/demo/relatorios", "/saude", "/sair"]) expect(cobre(caminho), caminho).toBe(false);
  });
});
