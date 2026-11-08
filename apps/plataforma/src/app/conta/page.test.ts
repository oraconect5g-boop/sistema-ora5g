// REV-014: /conta com o serviço do Supabase falhando. O serviço é SIMULADO (o fetch global é
// trocado); endereço .invalid, chave e token fictícios: nenhuma credencial real e nenhuma chamada
// de rede. Passa pelas bibliotecas reais (@supabase/ssr, supabase-js e PostgREST), pelo cookie de
// sessão e pela página; só next/headers e next/navigation são substituídos.
import { createServerClient } from "@supabase/ssr";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Conta from "./page";

const cookiesDaRequisicao = vi.hoisted(() => [] as { name: string; value: string }[]);

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => cookiesDaRequisicao, set: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirecionou para ${destino}`);
  },
}));

const SERVICO = "https://exemplo.supabase.invalid";
const CHAVE_FICTICIA = ["sb", "publishable", "chaveFicticiaDeTeste123"].join("_");
const USUARIO = { id: "00000000-0000-4000-8000-000000000001", email: "vendedora@teste.invalid", aud: "authenticated", role: "authenticated" };
// Texto que o serviço devolve no erro; nunca pode ir para o log nem para a tela.
const DETALHE_INTERNO = "DETALHE_INTERNO_DO_SERVICO";

type Resposta = { status: number; corpo: unknown; cabecalhos?: Record<string, string> } | "sem_rede";
type Cenario = { perfis_usuario: Resposta; unidades: Resposta };

const erroDoPostgrest = (code: string) => ({
  code,
  message: `falha simulada: ${DETALHE_INTERNO}`,
  details: `consulta de ${USUARIO.email}: ${DETALHE_INTERNO}`,
  hint: DETALHE_INTERNO,
});

function servicoSimulado(cenario: Cenario) {
  const chamadas: string[] = [];
  const fetchSimulado = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    if (url.origin !== SERVICO) throw new Error(`chamada fora do serviço simulado: ${url.origin}`);
    chamadas.push(url.pathname);
    if (url.pathname === "/auth/v1/user") return Response.json(USUARIO);
    const resposta = cenario[url.pathname.replace("/rest/v1/", "") as keyof Cenario];
    if (!resposta) return Response.json({ message: `rota não simulada: ${init?.method ?? "GET"} ${url.pathname}` }, { status: 404 });
    if (resposta === "sem_rede") {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error(`connect ECONNREFUSED ${DETALHE_INTERNO}`), { code: "ECONNREFUSED" }) });
    }
    return Response.json(resposta.corpo, { status: resposta.status, headers: resposta.cabecalhos });
  };
  return { fetchSimulado, chamadas };
}

// Cookie de sessão gravado pela própria biblioteca (setSession), com token fictício que expira em 1 h.
async function cookiesDeSessaoFicticia() {
  const gravados = new Map<string, string>();
  const cliente = createServerClient(SERVICO, CHAVE_FICTICIA, {
    cookies: {
      getAll: () => [...gravados].map(([name, value]) => ({ name, value })),
      setAll: (lista) => {
        for (const { name, value } of lista) {
          if (value) gravados.set(name, value);
          else gravados.delete(name);
        }
      },
    },
  });
  const agora = Math.floor(Date.now() / 1000);
  const parte = (objeto: object) => Buffer.from(JSON.stringify(objeto)).toString("base64url");
  const token = [parte({ alg: "HS256", typ: "JWT" }), parte({ sub: USUARIO.id, role: "authenticated", iat: agora, exp: agora + 3600 }), "assinaturaFicticia"].join(".");
  const { error } = await cliente.auth.setSession({ access_token: token, refresh_token: "renovacao-ficticia" });
  if (error) throw error;
  return { cookies: [...gravados].map(([name, value]) => ({ name, value })), token };
}

async function abrirConta(cenario: Cenario) {
  const servico = servicoSimulado(cenario);
  vi.stubGlobal("fetch", servico.fetchSimulado);
  const sessao = await cookiesDeSessaoFicticia();
  cookiesDaRequisicao.splice(0, cookiesDaRequisicao.length, ...sessao.cookies);

  const registros: unknown[][] = [];
  for (const nivel of ["error", "warn", "info", "log", "debug"] as const) {
    vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => void registros.push([nivel, ...args]));
  }
  const pagina = Conta();
  // As novas tentativas automáticas do PostgREST esperam alguns segundos; o relógio é adiantado.
  if (vi.isFakeTimers()) await vi.runAllTimersAsync();
  const html = renderToStaticMarkup(await pagina);
  return { html, registros, chamadas: servico.chamadas, token: sessao.token };
}

const MENSAGEM_SEGURA = "Não foi possível carregar seus dados agora";

function conferirSemVazamento(resultado: Awaited<ReturnType<typeof abrirConta>>) {
  const tudo = resultado.html + JSON.stringify(resultado.registros);
  for (const sensivel of [DETALHE_INTERNO, USUARIO.id, resultado.token, "ECONNREFUSED"]) expect(tudo).not.toContain(sensivel);
  expect(JSON.stringify(resultado.registros)).not.toContain(USUARIO.email);
  expect(resultado.html).not.toContain("Usuário sem perfil");
  expect(resultado.html).not.toContain("Nenhuma loja vinculada");
}

describe("REV-014 — /conta com falha na consulta (serviço simulado)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SERVICO);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", CHAVE_FICTICIA);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("serviço indisponível no perfil (503, mesmo após as novas tentativas): mensagem segura e log só com o código", async () => {
    const r = await abrirConta({
      perfis_usuario: { status: 503, corpo: erroDoPostgrest("PGRST002"), cabecalhos: { "Retry-After": "0" } },
      unidades: { status: 200, corpo: [] },
    });
    expect(r.html).toContain(MENSAGEM_SEGURA);
    expect(r.registros).toEqual([["error", "conta: falha ao consultar o banco", { perfil: "PGRST002", unidades: null }]]);
    expect(r.chamadas.filter((c) => c === "/rest/v1/perfis_usuario")).toHaveLength(4);
    conferirSemVazamento(r);
  });

  it("acesso negado às lojas (403/42501): mensagem segura e log só com o código", async () => {
    const r = await abrirConta({
      perfis_usuario: { status: 200, corpo: [{ nome: "Vendedora Teste", email: USUARIO.email, status: "ativo" }] },
      unidades: { status: 403, corpo: erroDoPostgrest("42501") },
    });
    expect(r.html).toContain(MENSAGEM_SEGURA);
    expect(r.html).not.toContain("Vendedora Teste");
    expect(r.registros).toEqual([["error", "conta: falha ao consultar o banco", { perfil: null, unidades: "42501" }]]);
    conferirSemVazamento(r);
  });

  it("serviço fora do ar (sem resposta de rede): mensagem segura e nada do erro de rede no log", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const r = await abrirConta({ perfis_usuario: "sem_rede", unidades: "sem_rede" });
    expect(r.html).toContain(MENSAGEM_SEGURA);
    // Sem código HTTP nem do PostgREST, a biblioteca entrega código vazio: o log continua sem detalhes.
    expect(r.registros).toEqual([["error", "conta: falha ao consultar o banco", { perfil: "", unidades: "" }]]);
    conferirSemVazamento(r);
  });

  it("controle: sem perfil e sem loja (consulta sem erro) não vira mensagem de falha", async () => {
    const r = await abrirConta({ perfis_usuario: { status: 200, corpo: [] }, unidades: { status: 200, corpo: [] } });
    expect(r.html).not.toContain(MENSAGEM_SEGURA);
    expect(r.html).toContain("Usuário sem perfil cadastrado");
    expect(r.html).toContain("Nenhuma loja vinculada");
    expect(r.registros).toEqual([]);
  });

  it("controle: com perfil e loja, a conta aparece normalmente", async () => {
    const r = await abrirConta({
      perfis_usuario: { status: 200, corpo: [{ nome: "Vendedora Teste", email: USUARIO.email, status: "ativo" }] },
      unidades: { status: 200, corpo: [{ id: "u1", nome: "Loja Santa Cândida", tipo: "loja" }] },
    });
    expect(r.html).not.toContain(MENSAGEM_SEGURA);
    expect(r.html).toContain("Vendedora Teste");
    expect(r.html).toContain("Loja Santa Cândida");
    expect(r.registros).toEqual([]);
  });
});
