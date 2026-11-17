// A ligação do log de tempos no cliente do Supabase das telas (lote VEL-a: ORA-QUAL-010; ADR-010). Passa pelas
// bibliotecas reais (@supabase/ssr, supabase-js e PostgREST); o serviço é SIMULADO (o fetch global é trocado), com
// endereço .invalid e chave fictícia: nenhuma credencial real e nenhuma chamada de rede. Só next/headers é substituído.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clienteSupabaseServidor } from "./servidor";

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));

const SERVICO = "https://exemplo.supabase.invalid";
const CHAVE_FICTICIA = ["sb", "publishable", "chaveFicticiaDeTeste123"].join("_");
const CPF_FICTICIO = "52998224725";
const DETALHE_INTERNO = "10.0.0.7:6543 DETALHE_INTERNO_DO_SERVICO";
const NIVEIS = ["error", "warn", "info", "log", "debug"] as const;

type Chamada = { metodo: string; endereco: string; chave: string | null; corpo: unknown };

/** Troca o fetch global pelo serviço simulado e devolve o que chegou a ele. */
function servicoSimulado(responder: () => Response = () => Response.json([])) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal("fetch", async (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
    const endereco = entrada instanceof Request ? entrada.url : String(entrada);
    if (new URL(endereco).origin !== SERVICO) throw new Error("chamada fora do serviço simulado");
    chamadas.push({ metodo: opcoes?.method ?? "GET", endereco, chave: new Headers(opcoes?.headers).get("apikey"), corpo: opcoes?.body ?? null });
    return responder();
  });
  return chamadas;
}

/** Tudo o que o servidor escrever, em qualquer nível. */
function saidaDoServidor() {
  const escrito: unknown[][] = [];
  for (const nivel of NIVEIS) vi.spyOn(console, nivel).mockImplementation((...partes: unknown[]) => void escrito.push([nivel, ...partes]));
  return escrito;
}

async function cliente() {
  const supabase = await clienteSupabaseServidor();
  if (!supabase) throw new Error("o cliente devia existir: o endereço e a chave fictícios estão no ambiente do teste");
  return supabase;
}

describe("cliente do Supabase no servidor — log de tempos", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SERVICO);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", CHAVE_FICTICIA);
    delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("ora5g.tempos.contador")];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("desligado (o padrão), o pedido vai direto ao fetch de sempre e nada é escrito", async () => {
    const chamadas = servicoSimulado();
    const escrito = saidaDoServidor();
    const { error } = await (await cliente()).rpc("pdv_tela");
    expect(error).toBeNull();
    expect(chamadas).toEqual([{ metodo: "POST", endereco: `${SERVICO}/rest/v1/rpc/pdv_tela`, chave: CHAVE_FICTICIA, corpo: "{}" }]);
    expect(escrito).toEqual([]);
  });

  it("com ORA_MEDIR_TEMPOS=1, cada ida vira uma linha; o pedido chega ao serviço igual, e o filtro não vai para o log", async () => {
    vi.stubEnv("ORA_MEDIR_TEMPOS", "1");
    const chamadas = servicoSimulado();
    const escrito = saidaDoServidor();
    const supabase = await cliente();
    expect((await supabase.rpc("pdv_tela")).error).toBeNull();
    expect((await supabase.from("clientes").select("id").eq("documento_resumo", CPF_FICTICIO)).error).toBeNull();
    expect((await (await cliente()).rpc("pdv_tela")).error).toBeNull();

    expect(chamadas).toEqual([
      { metodo: "POST", endereco: `${SERVICO}/rest/v1/rpc/pdv_tela`, chave: CHAVE_FICTICIA, corpo: "{}" },
      { metodo: "GET", endereco: `${SERVICO}/rest/v1/clientes?select=id&documento_resumo=eq.${CPF_FICTICIO}`, chave: CHAVE_FICTICIA, corpo: null },
      { metodo: "POST", endereco: `${SERVICO}/rest/v1/rpc/pdv_tela`, chave: CHAVE_FICTICIA, corpo: "{}" },
    ]);
    expect(escrito).toEqual([
      ["info", expect.stringMatching(/^\[tempos\] c1 #1 \+\d+ms \d+ms 200 POST \/rest\/v1\/rpc\/pdv_tela$/)],
      ["info", expect.stringMatching(/^\[tempos\] c1 #2 \+\d+ms \d+ms 200 GET \/rest\/v1\/clientes$/)],
      // Fora da montagem de uma tela (como aqui e nas ações), cada cliente novo é um medidor novo.
      ["info", expect.stringMatching(/^\[tempos\] c2 #1 \+\d+ms \d+ms 200 POST \/rest\/v1\/rpc\/pdv_tela$/)],
    ]);
    for (const sensivel of [CPF_FICTICIO, CHAVE_FICTICIA, "exemplo.supabase", "documento_resumo"]) expect(JSON.stringify(escrito), sensivel).not.toContain(sensivel);
  });

  it("com o log ligado e a rede fora, a linha diz \"falhou\" sem copiar o erro, e quem chamou recebe o erro como antes", async () => {
    vi.stubEnv("ORA_MEDIR_TEMPOS", "1");
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error(`connect ECONNREFUSED ${DETALHE_INTERNO}`), { code: "ECONNREFUSED" }) });
    });
    const escrito = saidaDoServidor();
    const { data, error } = await (await cliente()).rpc("pdv_tela");
    expect(data).toBeNull();
    expect(error?.message).toContain("fetch failed");
    expect(escrito).toEqual([["info", expect.stringMatching(/^\[tempos\] c1 #1 \+\d+ms \d+ms falhou \(conexão recusada\) POST \/rest\/v1\/rpc\/pdv_tela$/)]]);
    for (const sensivel of ["DETALHE_INTERNO", "10.0.0.7", "ECONNREFUSED", "fetch failed"]) expect(JSON.stringify(escrito), sensivel).not.toContain(sensivel);
  });
});
