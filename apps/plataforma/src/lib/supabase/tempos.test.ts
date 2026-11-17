// O log de tempos das idas ao Supabase (lote VEL-a: ORA-QUAL-010; ADR-010). O que se confere aqui: desligado, não
// existe; ligado, mede sem mudar o pedido nem a resposta; e a linha nunca leva filtro, token, chave, corpo, endereço
// do projeto nem texto de erro. O serviço é SIMULADO (o fetch global é trocado) e o relógio é o do teste.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { medidorDeTempos, recursoDoEndereco, rotuloDoPedido } from "./tempos";

const SERVICO = "https://projetoficticio.supabase.invalid";
const CHAVE_FICTICIA = ["sb", "publishable", "chaveFicticiaDeTeste123"].join("_");
const TOKEN_FICTICIO = "tokenFicticioDaSessao.parte.assinatura";
const CPF_FICTICIO = "52998224725";
const ID = "0b9f6c1e-3c58-4f0e-9d53-1b7a50f2a9c4";
const LIGADO = { ORA_MEDIR_TEMPOS: "1" };

let relogio = 0;
let linhas: string[] = [];
const meios = () => ({ ambiente: LIGADO, escrever: (linha: string) => void linhas.push(linha), agora: () => relogio });
/** Um serviço que demora `ms` (no relógio do teste) e responde com `resposta`. */
const servicoQueDemora = (ms: number, resposta: () => Response = () => Response.json({ ok: true })) => {
  const chamadas: unknown[][] = [];
  vi.stubGlobal("fetch", async (...argumentos: unknown[]) => {
    chamadas.push(argumentos);
    relogio += ms;
    return resposta();
  });
  return chamadas;
};

beforeEach(() => {
  relogio = 0;
  linhas = [];
  delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("ora5g.tempos.contador")];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("medidorDeTempos", () => {
  it("desligado é o padrão: sem ORA_MEDIR_TEMPOS=1 não existe medidor, e nada é escrito", () => {
    for (const valor of [undefined, "", "0", "true", "sim", " 1", "1 "]) {
      expect(medidorDeTempos("c", () => "GET /", { ...meios(), ambiente: { ORA_MEDIR_TEMPOS: valor } }), String(valor)).toBeNull();
    }
    vi.stubEnv("ORA_MEDIR_TEMPOS", "");
    expect(medidorDeTempos()).toBeNull();
    expect(linhas).toEqual([]);
  });

  it("ligado pelo ambiente do servidor, escreve na saída do servidor", async () => {
    vi.stubEnv("ORA_MEDIR_TEMPOS", "1");
    const escrito = vi.spyOn(console, "info").mockImplementation(() => undefined);
    servicoQueDemora(0);
    await medidorDeTempos("c")?.fetch(`${SERVICO}/rest/v1/rpc/pdv_tela`, { method: "POST" });
    expect(escrito.mock.calls).toEqual([[expect.stringMatching(/^\[tempos\] c1 #1 \+\d+ms \d+ms 200 POST \/rest\/v1\/rpc\/pdv_tela$/)]]);
  });

  it("cada ida vira uma linha: a ordem, quando saiu, quanto demorou, o código, o método e o recurso", async () => {
    servicoQueDemora(171);
    const tempos = medidorDeTempos("c", undefined, meios());
    relogio = 2;
    await tempos?.fetch(`${SERVICO}/rest/v1/rpc/molde_da_sessao`, { method: "POST" });
    await tempos?.fetch(new URL(`${SERVICO}/rest/v1/produtos?select=id`));
    await tempos?.fetch(new Request(`${SERVICO}/auth/v1/user`, { method: "get" }));
    expect(linhas).toEqual([
      "[tempos] c1 #1 +2ms 171ms 200 POST /rest/v1/rpc/molde_da_sessao",
      "[tempos] c1 #2 +173ms 171ms 200 GET /rest/v1/produtos",
      "[tempos] c1 #3 +344ms 171ms 200 GET /auth/v1/user",
    ]);
  });

  it("o rótulo do pedido sai antes das idas, e cada medidor tem o seu número", async () => {
    servicoQueDemora(5, () => new Response(null, { status: 401 }));
    const doProxy = medidorDeTempos("p", () => "GET /vender (página inteira)", meios());
    const daTela = medidorDeTempos("c", undefined, meios());
    await daTela?.fetch(`${SERVICO}/rest/v1/rpc/pdv_tela`, { method: "POST" });
    await doProxy?.fetch(`${SERVICO}/auth/v1/user`);
    expect(linhas).toEqual([
      "[tempos] p1 pedido GET /vender (página inteira)",
      "[tempos] c2 #1 +0ms 5ms 401 POST /rest/v1/rpc/pdv_tela",
      "[tempos] p1 #1 +5ms 5ms 401 GET /auth/v1/user",
    ]);
  });

  it("idas em paralelo: a ordem é a da saída, e as duas saem no mesmo instante", async () => {
    const soltar: (() => void)[] = [];
    vi.stubGlobal("fetch", () => new Promise<Response>((feito) => soltar.push(() => feito(Response.json({})))));
    const tempos = medidorDeTempos("c", undefined, meios());
    const primeira = tempos?.fetch(`${SERVICO}/rest/v1/rpc/vendas_painel`, { method: "POST" });
    const segunda = tempos?.fetch(`${SERVICO}/rest/v1/rpc/caixa_painel`, { method: "POST" });
    relogio = 90;
    soltar[1]?.();
    await segunda;
    relogio = 140;
    soltar[0]?.();
    await primeira;
    expect(linhas).toEqual([
      "[tempos] c1 #2 +0ms 90ms 200 POST /rest/v1/rpc/caixa_painel",
      "[tempos] c1 #1 +0ms 140ms 200 POST /rest/v1/rpc/vendas_painel",
    ]);
  });

  it("não muda o pedido nem a resposta: os mesmos argumentos vão ao fetch e a mesma resposta volta", async () => {
    const resposta = Response.json({ ok: true });
    const chamadas = servicoQueDemora(1, () => resposta);
    const opcoes = { method: "POST", headers: { apikey: CHAVE_FICTICIA, Authorization: `Bearer ${TOKEN_FICTICIO}` }, body: JSON.stringify({ p_cpf: CPF_FICTICIO }) };
    const endereco = `${SERVICO}/rest/v1/rpc/clientes_buscar`;
    expect(await medidorDeTempos("c", undefined, meios())?.fetch(endereco, opcoes)).toBe(resposta);
    expect(chamadas).toEqual([[endereco, opcoes]]);
    expect(chamadas[0]?.[1]).toBe(opcoes);
  });

  it("a linha nunca leva filtro, CPF, token, chave, corpo nem o endereço do projeto", async () => {
    servicoQueDemora(3);
    const tempos = medidorDeTempos("c", undefined, meios());
    const cabecalhos = { apikey: CHAVE_FICTICIA, Authorization: `Bearer ${TOKEN_FICTICIO}` };
    await tempos?.fetch(`${SERVICO}/rest/v1/clientes?select=nome&documento_resumo=eq.${CPF_FICTICIO}&nome=ilike.*Maria*`, { headers: cabecalhos });
    await tempos?.fetch(`${SERVICO}/rest/v1/rpc/clientes_buscar`, { method: "POST", headers: cabecalhos, body: JSON.stringify({ p_texto: `Maria ${CPF_FICTICIO}` }) });
    await tempos?.fetch(`${SERVICO}/storage/v1/object/sign/documentos/${ID}/rg-maria-${CPF_FICTICIO}.pdf`, { method: "POST", headers: cabecalhos });
    await tempos?.fetch(`${SERVICO}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: cabecalhos, body: JSON.stringify({ refresh_token: TOKEN_FICTICIO }) });
    await tempos?.fetch(`${SERVICO}/rest/v1/${CPF_FICTICIO}/${ID}`, { headers: cabecalhos });
    expect(linhas).toEqual([
      "[tempos] c1 #1 +0ms 3ms 200 GET /rest/v1/clientes",
      "[tempos] c1 #2 +3ms 3ms 200 POST /rest/v1/rpc/clientes_buscar",
      "[tempos] c1 #3 +6ms 3ms 200 POST /storage/v1/object/…",
      "[tempos] c1 #4 +9ms 3ms 200 POST /auth/v1/token",
      "[tempos] c1 #5 +12ms 3ms 200 GET /rest/v1/:n/…",
    ]);
    const tudo = linhas.join("\n");
    for (const sensivel of [CPF_FICTICIO, "Maria", TOKEN_FICTICIO, CHAVE_FICTICIA, "projetoficticio", "supabase", ID, "?", "="]) expect(tudo, sensivel).not.toContain(sensivel);
  });

  it("falha de rede: a linha diz o que houve com palavras daqui, o erro sobe igual e nada dele é copiado", async () => {
    const DETALHE_INTERNO = "10.0.0.7:6543 DETALHE_INTERNO_DO_SERVICO";
    const falhas = [
      new TypeError("fetch failed", { cause: Object.assign(new Error(`other side closed ${DETALHE_INTERNO}`), { code: "UND_ERR_SOCKET" }) }),
      new TypeError("fetch failed", { cause: Object.assign(new Error(`connect ECONNREFUSED ${DETALHE_INTERNO}`), { code: "ECONNREFUSED" }) }),
      Object.assign(new Error(`read ECONNRESET ${DETALHE_INTERNO}`), { code: "ECONNRESET" }),
      new TypeError("fetch failed", { cause: Object.assign(new Error(DETALHE_INTERNO), { code: "UND_ERR_HEADERS_TIMEOUT" }) }),
      new TypeError("fetch failed", { cause: Object.assign(new Error(DETALHE_INTERNO), { code: "ENOTFOUND" }) }),
      new TypeError("fetch failed", { cause: Object.assign(new Error(DETALHE_INTERNO), { code: `CODIGO_NOVO ${DETALHE_INTERNO}` }) }),
      Object.assign(new Error(DETALHE_INTERNO), { code: "constructor" }),
      new Error(DETALHE_INTERNO),
      "texto solto",
    ];
    const tempos = medidorDeTempos("c", undefined, meios());
    for (const falha of falhas) {
      vi.stubGlobal("fetch", async () => {
        relogio += 12;
        throw falha;
      });
      await expect(tempos?.fetch(`${SERVICO}/rest/v1/rpc/pdv_tela`, { method: "POST" })).rejects.toBe(falha);
    }
    expect(linhas.map((linha) => linha.replace(/^\[tempos\] c1 #\d+ \+\d+ms 12ms /, ""))).toEqual([
      "falhou (conexão fechada) POST /rest/v1/rpc/pdv_tela",
      "falhou (conexão recusada) POST /rest/v1/rpc/pdv_tela",
      "falhou (conexão fechada) POST /rest/v1/rpc/pdv_tela",
      "falhou (sem resposta a tempo) POST /rest/v1/rpc/pdv_tela",
      "falhou (endereço não encontrado) POST /rest/v1/rpc/pdv_tela",
      "falhou POST /rest/v1/rpc/pdv_tela",
      "falhou POST /rest/v1/rpc/pdv_tela",
      "falhou POST /rest/v1/rpc/pdv_tela",
      "falhou POST /rest/v1/rpc/pdv_tela",
    ]);
    // A regra da REV-014 vale também com o log ligado: nem o detalhe do serviço nem o código cru do sistema.
    for (const sensivel of ["DETALHE_INTERNO", "10.0.0.7", "ECONN", "UND_ERR", "ENOTFOUND", "CODIGO_NOVO", "fetch failed"]) expect(linhas.join("\n"), sensivel).not.toContain(sensivel);
  });

  it("medir nunca derruba o pedido: chamada estranha ou saída que falha, e a resposta chega do mesmo jeito", async () => {
    const resposta = Response.json({});
    servicoQueDemora(1, () => resposta);
    const tempos = medidorDeTempos("c", undefined, meios());
    expect(await tempos?.fetch("/caminho/sem/servico", { method: "apagar tudo" })).toBe(resposta);
    expect(await tempos?.fetch(undefined as never)).toBe(resposta);
    expect(await tempos?.fetch({ url: 7, method: {} } as never)).toBe(resposta);
    expect(linhas.map((linha) => linha.replace(/^.*ms 200 /, ""))).toEqual(["? ?", "GET ?", "? ?"]);

    const quebrado = medidorDeTempos("p", () => { throw new Error("rótulo que não monta"); }, { ...meios(), escrever: () => { throw new Error("saída fechada"); } });
    expect(await quebrado?.fetch(`${SERVICO}/auth/v1/user`)).toBe(resposta);
  });
});

describe("recursoDoEndereco", () => {
  it("guarda só o caminho, até a tabela ou a operação (e o nome, nas funções)", () => {
    expect(Object.fromEntries([
      "/rest/v1/rpc/pdv_tela",
      "/rest/v1/rpc/pdv_tela/a-mais",
      "/rest/v1/vendas?id=eq.1",
      "/rest/v1/vendas#parte",
      "/auth/v1/user",
      "/auth/v1/.well-known/jwks.json",
      `/auth/v1/factors/${ID}/verify`,
      "/storage/v1/object/public/fotos/produto.webp",
      "/rest/v1/tabela%20com%20espaco",
      `/rest/v1/${"x".repeat(65)}`,
      "/rest/v1/rpc",
      "/",
      "",
    ].map((caminho) => [caminho, recursoDoEndereco(`${SERVICO}${caminho}`)]))).toEqual({
      "/rest/v1/rpc/pdv_tela": "/rest/v1/rpc/pdv_tela",
      "/rest/v1/rpc/pdv_tela/a-mais": "/rest/v1/rpc/pdv_tela/…",
      "/rest/v1/vendas?id=eq.1": "/rest/v1/vendas",
      "/rest/v1/vendas#parte": "/rest/v1/vendas",
      "/auth/v1/user": "/auth/v1/user",
      "/auth/v1/.well-known/jwks.json": "/auth/v1/.well-known/…",
      [`/auth/v1/factors/${ID}/verify`]: "/auth/v1/factors/…",
      "/storage/v1/object/public/fotos/produto.webp": "/storage/v1/object/…",
      "/rest/v1/tabela%20com%20espaco": "/rest/v1/…",
      [`/rest/v1/${"x".repeat(65)}`]: "/rest/v1/…",
      "/rest/v1/rpc": "/rest/v1/rpc",
      "/": "/",
      "": "/",
    });
  });

  it("o que não é endereço completo vira \"?\"", () => {
    for (const estranho of ["", "/rest/v1/vendas", "rest/v1/vendas", "não é endereço", "http://"]) expect(recursoDoEndereco(estranho), estranho).toBe("?");
  });
});

describe("rotuloDoPedido", () => {
  const cabecalhos = (lista: Record<string, string> = {}) => new Headers(lista);

  it("mostra o método, a tela e de onde o pedido veio", () => {
    expect(rotuloDoPedido("GET", "/vender", cabecalhos({ "sec-fetch-dest": "document" }))).toBe("GET /vender (página inteira)");
    expect(rotuloDoPedido("GET", "/vendas", cabecalhos({ "sec-fetch-dest": "empty" }))).toBe("GET /vendas (dados da tela)");
    expect(rotuloDoPedido("POST", "/vender", cabecalhos({ "sec-fetch-dest": "empty", "next-action": "60c1f2" }))).toBe("POST /vender (ação)");
    expect(rotuloDoPedido("post", "/vender", cabecalhos({ "sec-fetch-dest": "document" }))).toBe("POST /vender (página inteira)");
    expect(rotuloDoPedido("GET", "/api/pendencias", cabecalhos())).toBe("GET /api/pendencias");
    expect(rotuloDoPedido("GET", "/", cabecalhos())).toBe("GET /");
  });

  it("identificador vira \":id\", número vira \":n\" e o resto do que não é nome de tela some", () => {
    expect(rotuloDoPedido("GET", `/vendas/${ID}`, cabecalhos())).toBe("GET /vendas/:id");
    expect(rotuloDoPedido("GET", `/contas-a-pagar/${ID.toUpperCase()}/documentos/${ID}`, cabecalhos())).toBe("GET /contas-a-pagar/:id/documentos/:id");
    expect(rotuloDoPedido("GET", `/clientes/${CPF_FICTICIO}`, cabecalhos())).toBe("GET /clientes/:n");
    expect(rotuloDoPedido("GET", "/clientes/Maria%20da%20Silva/maria@exemplo.invalid/cpf52998224725", cabecalhos())).toBe("GET /clientes/…/…/…");
    expect(rotuloDoPedido("GET", "/a/b/c/d/e/f/g/h", cabecalhos())).toBe("GET /a/b/c/d/e/f/…");
    expect(rotuloDoPedido("GET\r\n[tempos] falso", "/vender\n[tempos] falso", cabecalhos())).toBe("? /…");
  });
});
