// A leitura leve do banco na página /saude (lote SAUDE-a; ADR-012): o pedido certo, com a chave pública e sem sessão; a
// resposta do banco vira "respondeu", com a migration em dia, atrasada ou sem conferir; erro, resposta estranha ou demora
// viram "sem resposta". Banco SIMULADO pelo fetch; nada sai para a rede.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import configuracaoDoNext from "../../next.config";
import { conferirBanco, migracaoEsperada } from "./banco";

const URL_DO_TESTE = "https://projeto-de-teste.supabase.co";
const CHAVE_DO_TESTE = "sb_publishable_chave-ficticia-do-teste-0000";
afterEach(() => vi.unstubAllEnvs());
function configurar() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_DO_TESTE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", CHAVE_DO_TESTE);
}
function bancoSimulado(resposta: () => Response | Promise<Response>) {
  const pedidos: { url: string; corpo: unknown; cabecalhos: Headers }[] = [];
  const buscar = (async (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
    pedidos.push({ url: String(entrada), corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : null, cabecalhos: new Headers(opcoes?.headers) });
    return resposta();
  }) as typeof fetch;
  return { buscar, pedidos };
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

describe("a leitura leve do banco na /saude", () => {
  it("sem a configuração pública, não pergunta nada", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const { buscar, pedidos } = bancoSimulado(() => json({}));
    expect(await conferirBanco("20261117145723", { buscar })).toEqual({ estado: "nao_configurado" });
    expect(pedidos).toEqual([]);
  });

  it("chama a função pública com a migration desta versão, só com a chave pública, e lê a resposta", async () => {
    configurar();
    const { buscar, pedidos } = bancoSimulado(() => json({ hora: "2026-11-17T15:00:00+00:00", migracao: true }));
    const r = await conferirBanco("20261117145723", { buscar });
    expect(r).toEqual({ estado: "respondeu", ms: expect.any(Number), migracao: "em_dia" });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.url).toBe(`${URL_DO_TESTE}/rest/v1/rpc/saude_do_banco`);
    expect(pedidos[0]?.corpo).toEqual({ p_migracao: "20261117145723" });
    expect(pedidos[0]?.cabecalhos.get("apikey")).toBe(CHAVE_DO_TESTE);
  });

  it("a migration que falta no banco, a que não se sabe e a versão sem migration conhecida", async () => {
    configurar();
    expect(await conferirBanco("20261117145723", { buscar: bancoSimulado(() => json({ hora: "x", migracao: false })).buscar }))
      .toMatchObject({ estado: "respondeu", migracao: "atras" });
    expect(await conferirBanco("20261117145723", { buscar: bancoSimulado(() => json({ hora: "x", migracao: null })).buscar }))
      .toMatchObject({ estado: "respondeu", migracao: "sem_conferir" });
    const semVersao = bancoSimulado(() => json({ hora: "x", migracao: null }));
    expect(await conferirBanco(null, { buscar: semVersao.buscar })).toMatchObject({ estado: "respondeu", migracao: "sem_conferir" });
    expect(semVersao.pedidos[0]?.corpo).toEqual({});
  });

  it("erro do banco, resposta estranha, falha de rede e demora viram 'sem resposta'", async () => {
    configurar();
    for (const resposta of [
      () => json({ code: "PGRST202", message: "função não encontrada" }, 404),
      () => json({ code: "57014", message: "cancelado" }, 500),
      () => json([1, 2]),
      () => json({ migracao: true }),
      () => { throw new TypeError("fetch failed"); },
    ]) {
      expect(await conferirBanco("20261117145723", { buscar: bancoSimulado(resposta).buscar })).toEqual({ estado: "sem_resposta" });
    }
    const lento = bancoSimulado(() => new Promise<Response>(() => undefined));
    const buscarComSinal = (async (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
      void lento.buscar(entrada, opcoes);
      return new Promise<Response>((_, rejeitar) => opcoes?.signal?.addEventListener("abort", () => rejeitar(opcoes.signal?.reason)));
    }) as typeof fetch;
    expect(await conferirBanco("20261117145723", { buscar: buscarComSinal, limiteMs: 20 })).toEqual({ estado: "sem_resposta" });
  });

  it("a migration esperada só vale com 14 dígitos", () => {
    expect(migracaoEsperada("20261117145723")).toBe("20261117145723");
    expect(migracaoEsperada("")).toBeNull();
    expect(migracaoEsperada(undefined)).toBeNull();
    expect(migracaoEsperada("2026-11-17")).toBeNull();
  });

  it("a build grava a última migration da pasta do banco", () => {
    const versoes = readdirSync(join(process.cwd(), "..", "..", "packages", "banco", "supabase", "migrations"))
      .flatMap((n) => /^(\d{14})_.+\.sql$/.exec(n)?.[1] ?? []).sort();
    expect(configuracaoDoNext.env?.ORA_MIGRACAO_ESPERADA).toBe(versoes.at(-1));
  });
});
