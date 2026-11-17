// O proxy renova a sessão e põe os cabeçalhos anti-cache antes de cada tela com login (REV-009). Cada
// lote novo acrescentava o caminho à mão, e /clientes, /crm e /pagamentos ficaram de fora até 13/11:
// este teste confere que toda tela real do menu passa por ele.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PAGINAS_REAIS } from "./lib/acesso/menu";
import { lerOrigem } from "./lib/loja/origem";
import { config, proxy } from "./proxy";

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
  // sem esse layout no G4b e só o E2E pegou; este teste pega antes. Vale o layout da própria pasta ou o
  // de uma pasta acima dentro de app/ (L9a: /metas/bonus e /metas/extrato ficam sob o layout de /metas,
  // que confere a sessão antes de qualquer esqueleto das telas de dentro).
  it("toda tela real com esqueleto de carregamento confere a sessão no layout, antes do esqueleto", () => {
    const app = join(new URL(".", import.meta.url).pathname, "app");
    const comEsqueleto = (pasta: string): string[] => readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
      if (!e.isDirectory()) return e.name === "loading.tsx" ? [pasta] : [];
      return e.name === "demo" ? [] : comEsqueleto(join(pasta, e.name));
    });
    const confereNoLayout = (pasta: string) => existsSync(join(pasta, "layout.tsx")) && readFileSync(join(pasta, "layout.tsx"), "utf8").includes("await obterSessao(");
    const confereAcima = (pasta: string): boolean => confereNoLayout(pasta) || (pasta.length > app.length && confereAcima(dirname(pasta)));
    const pastas = comEsqueleto(app);
    expect(pastas.length).toBeGreaterThanOrEqual(4);
    expect(pastas.filter((p) => !confereAcima(p)).map((p) => p.slice(app.length))).toEqual([]);
    // O layout da raiz de app/ não conta: ele também serve às páginas públicas.
    expect(confereNoLayout(app)).toBe(false);
  });

  it("não pega as páginas públicas nem a demonstração", () => {
    for (const caminho of ["/", "/entrar", "/entrar/recuperar", "/demo", "/demo/relatorios", "/saude", "/sair"]) expect(cobre(caminho), caminho).toBe(false);
    // ORG-007a: a tela do código já tem sessão (a senha passou) e a renova; a Segurança da conta fica em /conta.
    for (const caminho of ["/entrar/codigo", "/conta/seguranca"]) expect(cobre(caminho), caminho).toBe(true);
  });
});

// Lote VEL-a (ORA-QUAL-010; ADR-010): o proxy confere o token com getClaims(). Com token de chave ASSIMÉTRICA a
// conferência é feita aqui mesmo, sem ir ao Auth a cada pedido (só busca as chaves públicas, que valem 10 min no
// processo); com token de segredo compartilhado (HS256) a biblioteca volta a perguntar ao Auth em todo pedido. O log
// de tempos mostra qual dos dois está acontecendo. Passa pelas bibliotecas reais; o serviço é SIMULADO (o fetch
// global é trocado), com endereço .invalid, chave e tokens fictícios feitos aqui.
describe("proxy de sessão — conferência do token e log de tempos", () => {
  const CHAVE_FICTICIA = ["sb", "publishable", "chaveFicticiaDeTeste123"].join("_");
  const USUARIO = { id: "00000000-0000-4000-8000-000000000001", email: "vendedora@teste.invalid", aud: "authenticated", role: "authenticated" };
  const ID = "0b9f6c1e-3c58-4f0e-9d53-1b7a50f2a9c4";
  const SITE = "https://homologacao.invalid";

  const parte = (objeto: object) => Buffer.from(JSON.stringify(objeto)).toString("base64url");
  const corpoDoToken = () => {
    const agora = Math.floor(Date.now() / 1000);
    return { sub: USUARIO.id, role: "authenticated", iat: agora, exp: agora + 3600 };
  };
  const tokenDeSegredoCompartilhado = () => [parte({ alg: "HS256", typ: "JWT" }), parte(corpoDoToken()), "assinaturaFicticia"].join(".");
  /** Um token assinado de verdade com uma chave ES256 criada na hora, e as chaves públicas que o serviço divulga. */
  async function tokenDeChaveAssimetrica() {
    const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const publica = { ...(await crypto.subtle.exportKey("jwk", par.publicKey)), kid: "chave-de-teste", alg: "ES256", use: "sig" };
    const assinado = `${parte({ alg: "ES256", typ: "JWT", kid: "chave-de-teste" })}.${parte(corpoDoToken())}`;
    const assinatura = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, par.privateKey, new TextEncoder().encode(assinado));
    return { token: `${assinado}.${Buffer.from(assinatura).toString("base64url")}`, chavesPublicas: { keys: [publica] } };
  }

  /** Troca o fetch global pelo serviço simulado e devolve os caminhos pedidos a ele. */
  function servicoSimulado(servico: string, chavesPublicas: object = { keys: [] }) {
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", async (entrada: RequestInfo | URL) => {
      const endereco = new URL(entrada instanceof Request ? entrada.url : String(entrada));
      if (endereco.origin !== servico) throw new Error("chamada fora do serviço simulado");
      chamadas.push(endereco.pathname);
      if (endereco.pathname === "/auth/v1/user") return Response.json(USUARIO);
      if (endereco.pathname === "/auth/v1/.well-known/jwks.json") return Response.json(chavesPublicas);
      return Response.json({ message: "rota não simulada" }, { status: 404 });
    });
    return chamadas;
  }

  /** O cabeçalho Cookie de uma sessão gravada pela própria biblioteca (setSession) com o token dado. */
  async function cookieDeSessao(servico: string, token: string) {
    const gravados = new Map<string, string>();
    const cliente = createServerClient(servico, CHAVE_FICTICIA, {
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
    const { error } = await cliente.auth.setSession({ access_token: token, refresh_token: "renovacao-ficticia" });
    if (error) throw error;
    return [...gravados].map(([nome, valor]) => `${nome}=${valor}`).join("; ");
  }

  /** Tudo o que o servidor escrever, em qualquer nível. */
  function saidaDoServidor() {
    const escrito: unknown[][] = [];
    for (const nivel of ["error", "warn", "info", "log", "debug"] as const) vi.spyOn(console, nivel).mockImplementation((...partes: unknown[]) => void escrito.push([nivel, ...partes]));
    return escrito;
  }

  const usar = (servico: string) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", servico);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", CHAVE_FICTICIA);
  };
  const pedido = (caminho: string, cabecalhos: Record<string, string> = {}, metodo = "GET") => new NextRequest(`${SITE}${caminho}`, { method: metodo, headers: cabecalhos });
  const seguiuParaATela = (resposta: Response) => resposta.headers.get("x-middleware-next") === "1" && resposta.headers.get("cache-control") === "private, no-store";

  beforeEach(() => {
    delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("ora5g.tempos.contador")];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("token de chave assimétrica: busca as chaves públicas uma vez e não vai mais ao Auth nos pedidos seguintes", async () => {
    const servico = "https://assimetrica.supabase.invalid";
    usar(servico);
    const { token, chavesPublicas } = await tokenDeChaveAssimetrica();
    const chamadas = servicoSimulado(servico, chavesPublicas);
    const cookie = await cookieDeSessao(servico, token);
    chamadas.length = 0;

    for (const caminho of ["/vender", "/vendas", "/caixa"]) expect(seguiuParaATela(await proxy(pedido(caminho, { cookie }))), caminho).toBe(true);
    expect(chamadas).toEqual(["/auth/v1/.well-known/jwks.json"]);
  });

  it("token com a assinatura trocada não passa pela conferência local, mesmo com as chaves públicas já guardadas", async () => {
    const servico = "https://assinatura-trocada.supabase.invalid";
    usar(servico);
    const { token, chavesPublicas } = await tokenDeChaveAssimetrica();
    const outro = await tokenDeChaveAssimetrica();
    const chamadas = servicoSimulado(servico, chavesPublicas);
    const cookie = await cookieDeSessao(servico, token);
    const trocado = await cookieDeSessao(servico, [...token.split(".").slice(0, 2), outro.token.split(".")[2]].join("."));
    chamadas.length = 0;

    const supabase = (cabecalho: string) => createServerClient(servico, CHAVE_FICTICIA, { cookies: { getAll: () => pedido("/vender", { cookie: cabecalho }).cookies.getAll(), setAll: () => undefined } });
    expect((await supabase(cookie).auth.getClaims()).data?.claims.sub).toBe(USUARIO.id);
    const conferido = await supabase(trocado).auth.getClaims();
    expect(conferido.data).toBeNull();
    expect(conferido.error?.message).toContain("Invalid JWT signature");
    expect(chamadas).toEqual(["/auth/v1/.well-known/jwks.json"]);
  });

  it("token de segredo compartilhado (HS256): a biblioteca pergunta ao Auth em todo pedido", async () => {
    const servico = "https://compartilhado.supabase.invalid";
    usar(servico);
    const chamadas = servicoSimulado(servico);
    const cookie = await cookieDeSessao(servico, tokenDeSegredoCompartilhado());
    chamadas.length = 0;

    for (const caminho of ["/vender", "/vendas"]) expect(seguiuParaATela(await proxy(pedido(caminho, { cookie }))), caminho).toBe(true);
    expect(chamadas).toEqual(["/auth/v1/user", "/auth/v1/user"]);
  });

  it("log de tempos desligado (o padrão): o proxy não escreve nada", async () => {
    const servico = "https://desligado.supabase.invalid";
    usar(servico);
    servicoSimulado(servico);
    const cookie = await cookieDeSessao(servico, tokenDeSegredoCompartilhado());
    const escrito = saidaDoServidor();
    expect(seguiuParaATela(await proxy(pedido("/vender", { cookie, "sec-fetch-dest": "document" })))).toBe(true);
    expect(escrito).toEqual([]);
  });

  it("log de tempos ligado: uma linha diz qual pedido chegou, e a ida ao Auth aparece embaixo dela quando acontece", async () => {
    const servico = "https://ligado.supabase.invalid";
    usar(servico);
    vi.stubEnv("ORA_MEDIR_TEMPOS", "1");
    const { token, chavesPublicas } = await tokenDeChaveAssimetrica();
    servicoSimulado(servico, chavesPublicas);
    const assimetrica = await cookieDeSessao(servico, token);
    const compartilhado = await cookieDeSessao(servico, tokenDeSegredoCompartilhado());
    const escrito = saidaDoServidor();

    expect(seguiuParaATela(await proxy(pedido("/vender", { cookie: assimetrica, "sec-fetch-dest": "document" })))).toBe(true);
    expect(seguiuParaATela(await proxy(pedido(`/vendas/${ID}?q=52998224725`, { cookie: assimetrica, "sec-fetch-dest": "empty" })))).toBe(true);
    expect(seguiuParaATela(await proxy(pedido("/vender", { cookie: compartilhado, "sec-fetch-dest": "empty", "next-action": "60c1f2a9" }, "POST")))).toBe(true);
    expect(seguiuParaATela(await proxy(pedido("/caixa")))).toBe(true);

    expect(escrito).toEqual([
      ["info", "[tempos] p1 pedido GET /vender (página inteira)"],
      ["info", expect.stringMatching(/^\[tempos\] p1 #1 \+\d+ms \d+ms 200 GET \/auth\/v1\/\.well-known\/…$/)],
      ["info", "[tempos] p2 pedido GET /vendas/:id (dados da tela)"],
      ["info", "[tempos] p3 pedido POST /vender (ação)"],
      ["info", expect.stringMatching(/^\[tempos\] p3 #1 \+\d+ms \d+ms 200 GET \/auth\/v1\/user$/)],
      // sem sessão não há o que conferir: nenhuma ida
      ["info", "[tempos] p4 pedido GET /caixa"],
    ]);
    const tudo = JSON.stringify(escrito);
    for (const sensivel of [token, USUARIO.id, USUARIO.email, CHAVE_FICTICIA, ID, "52998224725", "supabase", "60c1f2a9"]) expect(tudo, sensivel).not.toContain(sensivel);
  });
});

// Lote MKT-a (ORA-ONLINE-003 e ORA-META-002): na loja online, que é pública, o proxy não renova sessão nenhuma; só guarda
// de onde o visitante chegou, num cookie da sessão do navegador, só da loja online. Endereços e campanhas fictícios.
describe("proxy da loja online — de onde o visitante chegou", () => {
  const SITE = "https://loja.homologacao.invalid";
  const pedido = (caminho: string, cabecalhos: Record<string, string> = {}) => new NextRequest(`${SITE}${caminho}`, { headers: cabecalhos });
  const cookieGravado = (resposta: Response) => resposta.headers.get("set-cookie") ?? "";

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("passa pelo proxy em todas as telas da loja online", () => {
    for (const caminho of ["/loja", "/loja/produto-x", "/loja/produto-x/reservar"]) expect(cobre(caminho), caminho).toBe(true);
  });

  it("com o link da campanha, grava o cookie só da loja, fora do JavaScript da página, e sem cache compartilhado; sem ir ao Supabase", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://nao-chamar.supabase.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ["sb", "publishable", "chaveFicticiaDeTeste123"].join("_"));
    vi.stubGlobal("fetch", async () => { throw new Error("a loja online não chama o Supabase no proxy"); });
    const resposta = await proxy(pedido("/loja?utm_source=Instagram&utm_campaign=Natal", { "x-forwarded-proto": "https" }));
    expect(resposta.headers.get("x-middleware-next")).toBe("1");
    expect(resposta.headers.get("cache-control")).toBe("private, no-store");
    const cookie = cookieGravado(resposta);
    expect(cookie).toMatch(/^ora_origem=[A-Za-z0-9_-]+; Path=\/loja; Secure; HttpOnly; SameSite=lax$/i);
    const valor = /^ora_origem=([^;]+)/.exec(cookie)?.[1];
    expect(lerOrigem(valor)).toEqual({ origem: "instagram", utm_source: "instagram", utm_campaign: "natal" });
  });

  it("vindo de outro site, guarda o site; navegando dentro da loja, não muda nada", async () => {
    const deFora = await proxy(pedido("/loja/produto-x", { referer: "https://www.google.com.br/" }));
    expect(lerOrigem(/^ora_origem=([^;]+)/.exec(cookieGravado(deFora))?.[1])).toEqual({ origem: "google", referencia: "www.google.com.br" });
    const dentro = await proxy(pedido("/loja/produto-x/reservar?variante=1", { referer: `${SITE}/loja/produto-x`, cookie: "ora_origem=abc" }));
    expect(cookieGravado(dentro)).toBe("");
    expect(dentro.headers.get("cache-control")).toBeNull();
    // Atrás do Apache: o host do pedido é o do servidor local, e o próprio site chega pelo x-forwarded-host.
    const atras = await proxy(new NextRequest("http://127.0.0.1:3100/loja", { headers: { referer: "https://ora5g.com.br/loja", "x-forwarded-host": "ora5g.com.br" } }));
    expect(cookieGravado(atras)).toBe("");
  });
});
