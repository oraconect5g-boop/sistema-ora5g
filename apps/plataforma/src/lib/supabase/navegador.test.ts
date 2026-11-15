// O cliente do Supabase no navegador, carregado só na hora do uso (lote QUAL-010b: ORA-QUAL-010). A biblioteca não pode
// voltar ao topo de um componente do navegador: iria de novo na primeira visita da tela (o orçamento do CI também pega).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const criados = vi.hoisted(() => [] as unknown[][]);
vi.mock("@supabase/ssr", () => ({ createBrowserClient: (...argumentos: unknown[]) => { criados.push(argumentos); return { cliente: criados.length }; } }));

import { clienteDoNavegador } from "./navegador";

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? arquivos(join(pasta, e.name)) : /\.tsx?$/.test(e.name) ? [join(pasta, e.name)] : []));
}

describe("o cliente do Supabase no navegador, sob demanda (QUAL-010b)", () => {
  it("cria o mesmo cliente de antes (o endereço e a chave pública), só quando chamado", async () => {
    expect(criados).toEqual([]);
    expect(await clienteDoNavegador("https://banco.exemplo", "chave-publica-de-teste")).toEqual({ cliente: 1 });
    expect(criados).toEqual([["https://banco.exemplo", "chave-publica-de-teste"]]);
  });

  it("nenhum componente do navegador importa a biblioteca no topo", () => {
    const raiz = join(__dirname, "..", "..");
    const noTopo = arquivos(raiz).filter((f) => {
      const texto = readFileSync(f, "utf8");
      return /^["']use client["'];?/m.test(texto) && /^import (?!type )[^;]*from ["']@supabase\/(ssr|supabase-js)["'];?$/m.test(texto);
    });
    expect(noTopo).toEqual([]);
  });
});
