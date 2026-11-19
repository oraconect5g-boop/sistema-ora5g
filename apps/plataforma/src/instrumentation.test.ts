// O que o servidor faz ao subir (ORA-003 e, no lote VEL-a, ORA-QUAL-010; ADR-010): confere o ambiente e SÓ ENTÃO
// liga a conexão mantida com o banco; a conexão mantida avisa numa linha o que valeu e nunca impede o servidor de subir.
import { afterEach, describe, expect, it, vi } from "vitest";

const passos = vi.hoisted(() => ({ feitos: [] as string[], conexao: (): Promise<boolean> => Promise.resolve(true), aquecidas: [] as unknown[][] }));

vi.mock("@ora5g/config/ambiente", () => ({ carregarAmbiente: () => void passos.feitos.push("ambiente conferido") }));
vi.mock("./lib/supabase/conexao-mantida", async (original) => ({
  ...(await original<typeof import("./lib/supabase/conexao-mantida")>()),
  manterConexoesAbertas: () => {
    passos.feitos.push("conexão mantida");
    return passos.conexao();
  },
  // VEL-f: o aquecimento de verdade é testado em lib/supabase/conexao-mantida.test.ts; aqui, só quando ele liga.
  manterConexoesAquecidas: (...argumentos: unknown[]) => {
    passos.feitos.push("conexões aquecidas");
    passos.aquecidas.push(argumentos);
    return { primeira: Promise.resolve(20), parar: () => undefined, relogio: undefined };
  },
}));

import { onRequestError, register } from "./instrumentation";
import { manterConexaoComOBanco } from "./instrumentacao-node";
import { FalhaDoServico } from "./lib/acesso/sessao";
import { recomecarErrosDoServidor, resumoDosErros } from "./lib/saude/erros-do-servidor";

const NIVEIS = ["error", "warn", "info", "log", "debug"] as const;
function saidaDoServidor() {
  const escrito: unknown[][] = [];
  for (const nivel of NIVEIS) vi.spyOn(console, nivel).mockImplementation((...partes: unknown[]) => void escrito.push([nivel, ...partes]));
  return escrito;
}

afterEach(() => {
  passos.feitos.length = 0;
  passos.aquecidas.length = 0;
  passos.conexao = () => Promise.resolve(true);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("início do servidor", () => {
  it("no runtime do Node: confere o ambiente e depois liga a conexão mantida", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const escrito = saidaDoServidor();
    await register();
    expect(passos.feitos).toEqual(["ambiente conferido", "conexão mantida"]);
    expect(escrito).toEqual([["info", "conexão com o banco: fica aberta por até 180 s parada"]]);
  });

  it("com o endereço e a chave pública do Supabase, aquece as conexões depois da conexão mantida e diz quantas abriram (VEL-f)", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto-de-teste.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "chave-publica-de-teste");
    const escrito = saidaDoServidor();
    await register();
    await Promise.resolve();
    expect(passos.feitos).toEqual(["ambiente conferido", "conexão mantida", "conexões aquecidas"]);
    expect(passos.aquecidas).toEqual([["https://projeto-de-teste.supabase.co", "chave-publica-de-teste"]]);
    expect(escrito).toEqual([
      ["info", "conexão com o banco: fica aberta por até 180 s parada"],
      ["info", "conexão com o banco: 20 de 20 conexões aquecidas, usadas de novo a cada 120 s"],
    ]);
  });

  it("no build, sem a chave pública ou sem a conexão mantida, não aquece", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto-de-teste.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "chave-publica-de-teste");
    saidaDoServidor();
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    await manterConexaoComOBanco();
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", " ");
    await manterConexaoComOBanco();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "chave-publica-de-teste");
    passos.conexao = () => Promise.resolve(false);
    await manterConexaoComOBanco();
    expect(passos.feitos).toEqual(["conexão mantida", "conexão mantida", "conexão mantida"]);
  });

  it("fora do runtime do Node, não faz nenhum dos dois", async () => {
    for (const runtime of ["edge", ""]) {
      vi.stubEnv("NEXT_RUNTIME", runtime);
      await register();
    }
    expect(passos.feitos).toEqual([]);
  });
});

describe("manterConexaoComOBanco", () => {
  const AVISO = "conexão com o banco: não foi possível manter aberta; cada pedido volta a abrir a sua";

  it("quando o Node não deixa trocar o despachante, avisa numa linha e o servidor sobe do mesmo jeito", async () => {
    passos.conexao = () => Promise.resolve(false);
    const escrito = saidaDoServidor();
    await expect(manterConexaoComOBanco()).resolves.toBeUndefined();
    expect(escrito).toEqual([["warn", AVISO]]);
  });

  it("se ligar a conexão mantida der erro, avisa sem copiar o erro e o servidor sobe do mesmo jeito", async () => {
    passos.conexao = () => Promise.reject(new Error("DETALHE_INTERNO do Node"));
    const escrito = saidaDoServidor();
    await expect(manterConexaoComOBanco()).resolves.toBeUndefined();
    expect(escrito).toEqual([["warn", AVISO]]);
  });
});

// OBS-a: cada erro do servidor vira uma linha no log e entra na lista da Saúde da operação, sem o texto do erro.
describe("erro do servidor", () => {
  it("a falha do banco numa tela vira a linha do log (com a etapa e o código) e entra no resumo", async () => {
    recomecarErrosDoServidor(Date.now() - 1_000);
    const escrito = saidaDoServidor();
    const falha = Object.assign(new FalhaDoServico("vendas_painel"), { digest: "778899" });
    await onRequestError(falha, { path: "/vendas?cpf=12345678900", method: "GET", headers: { cookie: "sessao=segredo" } },
      { routerKind: "App Router", routePath: "/vendas", routeType: "render", revalidateReason: undefined });
    expect(escrito).toEqual([["error", "[erro] tela GET /vendas código 778899 etapa vendas_painel"]]);
    expect(JSON.stringify(escrito)).not.toMatch(/12345678900|segredo|Falha ao consultar/);
    expect(resumoDosErros(Date.now())).toMatchObject({ total: 1, ultimaHora: 1, porRota: [{ tipo: "tela", rota: "/vendas", quantidade: 1 }] });
  });
});
