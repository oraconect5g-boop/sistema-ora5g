// A demonstração fica no ar em todo ambiente (DEMO-a, 18/11; ADR-022) porque é isolada da aplicação real. Este teste
// prova o isolamento nos dois sentidos, lendo o código: a demonstração não lê o banco nem a sessão de verdade, e nenhuma
// tela real usa dado da demonstração (o "impedir mocks em produção" do docs/08 continua valendo para a aplicação real).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}
const todos = arquivos(SRC).map((caminho) => ({ nome: relative(SRC, caminho).replace(/\\/g, "/"), texto: readFileSync(caminho, "utf8") }));
const daDemo = (nome: string) => nome.startsWith("demo/") || nome.startsWith("app/demo/");
const importaDemo = (texto: string) => /from\s+"[^"]*\/demo(\/[^"]*)?"/.test(texto);

describe("a demonstração é isolada da aplicação real", () => {
  it("a demonstração não lê o banco nem a sessão de verdade", () => {
    const usam = todos.filter((a) => daDemo(a.nome) && /(lib\/supabase|lib\/acesso\/sessao|@supabase\/|\.rpc\(|obterSessao)/.test(a.texto));
    expect(usam.map((a) => a.nome)).toEqual([]);
  });

  it("fora dela, só a moldura e o aviso de permissão da demonstração importam os dados dela, e só a demonstração os usa", () => {
    const fora = todos.filter((a) => !daDemo(a.nome) && importaDemo(a.texto)).map((a) => a.nome).sort();
    expect(fora).toEqual(["componentes/AppShell.tsx", "componentes/SemPermissao.tsx"]);
    const usamAsMolduras = todos.filter((a) => /componentes\/(AppShell|SemPermissao)"/.test(a.texto)).map((a) => a.nome);
    expect(usamAsMolduras.filter((n) => !daDemo(n))).toEqual([]);
  });
});
