// A leitura das fotos enviadas sem registro (lote CAT-011b): sem a função, nada; resposta estranha ou falha, falha (nunca
// zero). A regra é do banco (packages/banco/src/limpeza-das-fotos.test.ts).
import { describe, expect, it, vi } from "vitest";

import { lerFotosSemRegistro, tamanhoDosArquivos } from "./fotos-sem-registro";

const cliente = (resposta: { data: unknown; error: { code: string } | null }) => ({ rpc: vi.fn(async () => resposta) }) as never;

describe("fotos enviadas sem registro (CAT-011b)", () => {
  it("lê quantos, o tamanho e os caminhos; sem a função, nulo; falha e forma estranha, falha", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await lerFotosSemRegistro(cliente({ data: { quantos: 2, bytes: 3_000, arquivos: [{ caminho: "a/b/c/d.webp" }, { caminho: "a/b/c/e.webp" }] }, error: null })))
      .toEqual({ estado: "ok", dados: { quantos: 2, bytes: 3_000, caminhos: ["a/b/c/d.webp", "a/b/c/e.webp"] } });
    for (const code of ["PGRST202", "42883"]) expect(await lerFotosSemRegistro(cliente({ data: null, error: { code } }))).toBeNull();
    expect(await lerFotosSemRegistro(cliente({ data: null, error: { code: "57014" } }))).toEqual({ estado: "falha" });
    for (const data of [null, { quantos: -1, bytes: 0, arquivos: [] }, { quantos: 1, bytes: 0, arquivos: [{ caminho: 3 }] }, { quantos: 1, bytes: 0 }]) {
      expect(await lerFotosSemRegistro(cliente({ data, error: null })), JSON.stringify(data)).toEqual({ estado: "falha" });
    }
    expect([tamanhoDosArquivos(100), tamanhoDosArquivos(900_000), tamanhoDosArquivos(13_000_000)]).toEqual(["1 KB", "879 KB", "12,4 MB"]);
  });
});
