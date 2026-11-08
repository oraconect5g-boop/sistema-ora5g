import { describe, expect, it } from "vitest";

import { AmbienteInvalido, carregarAmbiente, lerGrupos, verificarAmbiente } from "./ambiente";

const aplicacaoValida = { APP_ENV: "development", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100" };
const segredoFalso = ["sb", "secret", "valorFalsoParaTeste123456"].join("_");
const publicaFalsa = ["sb", "publishable", "valorFalsoParaTeste123456"].join("_");
// JWT FICTÍCIO montado no teste (assinatura inválida): só o campo "role" importa para a regra.
const jwt = (role: string) =>
  ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify({ iss: "teste", role })).toString("base64url"), "assinaturaFalsa"].join(".");
const publicoValido = {
  NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicaFalsa,
};
const servidorValido = {
  SUPABASE_SECRET_KEY: segredoFalso,
  DATABASE_URL: "postgresql://postgres.exemplo:" + "senha-falsa" + "@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
};

describe("grupo aplicacao", () => {
  it("aceita a configuração mínima e aplica os padrões", () => {
    expect(carregarAmbiente(aplicacaoValida, ["aplicacao"])).toEqual({
      ...aplicacaoValida,
      APP_TIMEZONE: "America/Sao_Paulo",
      APP_DEFAULT_CURRENCY: "BRL",
    });
  });

  it("recusa subir quando falta variável obrigatória e cita só o nome", () => {
    expect(verificarAmbiente({ APP_ENV: "development" }, ["aplicacao"])).toEqual({
      ok: false,
      problemas: [{ variavel: "NEXT_PUBLIC_APP_URL", motivo: "obrigatória e não definida" }],
    });
  });

  it("trata variável vazia como não definida", () => {
    const r = verificarAmbiente({ ...aplicacaoValida, APP_ENV: "  " }, ["aplicacao"]);
    expect(!r.ok && r.problemas[0]?.variavel).toBe("APP_ENV");
  });

  it.each(["http://localhost:3100", "http://[::1]:3100", "http://[2001:db8::1]/"])("recusa %s (servidor só IPv4)", (url) => {
    const r = verificarAmbiente({ ...aplicacaoValida, NEXT_PUBLIC_APP_URL: url }, ["aplicacao"]);
    expect(!r.ok && r.problemas[0]?.motivo).toMatch(/IPv4/);
  });

  it("recusa ambiente desconhecido", () => {
    expect(verificarAmbiente({ ...aplicacaoValida, APP_ENV: "prod" }, ["aplicacao"]).ok).toBe(false);
  });
});

describe("grupo supabase_publico (login) — REV-004", () => {
  it("aceita a chave publishable nova e a anon antiga", () => {
    expect(verificarAmbiente(publicoValido, ["supabase_publico"]).ok).toBe(true);
    expect(verificarAmbiente({ ...publicoValido, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("anon") }, ["supabase_publico"]).ok).toBe(true);
  });

  it.each([
    ["chave secreta nova", segredoFalso],
    ["JWT service_role antigo", jwt("service_role")],
    ["JWT sem papel", jwt("")],
    ["texto qualquer", "abc.def"],
    ["JWT com conteúdo inválido", "aaa.@@@.bbb"],
  ])("recusa %s no campo público", (_, chave) => {
    const r = verificarAmbiente({ ...publicoValido, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: chave }, ["supabase_publico"]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problemas[0]?.variavel).toBe("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("exige https e recusa localhost ou IPv6 no endereço do Supabase", () => {
    for (const url of ["http://exemplo.supabase.co", "https://localhost", "https://[::1]"]) {
      expect(verificarAmbiente({ ...publicoValido, NEXT_PUBLIC_SUPABASE_URL: url }, ["supabase_publico"]).ok).toBe(false);
    }
  });

  it("o login não exige a chave secreta nem a conexão do banco", () => {
    expect(verificarAmbiente({ ...aplicacaoValida, ...publicoValido }, ["aplicacao", "supabase_publico"]).ok).toBe(true);
  });
});

describe("grupo supabase_servidor (worker e migrations)", () => {
  it("aceita o pooler em modo sessão", () => {
    expect(verificarAmbiente(servidorValido, ["supabase_servidor"]).ok).toBe(true);
  });

  it("recusa a conexão direta (só IPv6) e o pooler em modo transação", () => {
    for (const DATABASE_URL of [
      "postgresql://postgres:x@db.exemplo.supabase.co:5432/postgres",
      "postgresql://postgres.exemplo:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
    ]) {
      const r = verificarAmbiente({ ...servidorValido, DATABASE_URL }, ["supabase_servidor"]);
      expect(!r.ok && r.problemas.map((p) => p.variavel)).toEqual(["DATABASE_URL"]);
    }
  });
});

describe("CONFIG-001 — nomes de grupo do verificar-env", () => {
  it("aceita os grupos atuais, com espaços e repetição", () => {
    expect(lerGrupos("aplicacao,supabase_publico")).toEqual({ ok: true, grupos: ["aplicacao", "supabase_publico"] });
    expect(lerGrupos(" aplicacao , aplicacao ")).toEqual({ ok: true, grupos: ["aplicacao"] });
  });

  it("o grupo antigo supabase é recusado com a orientação, sem virar outro grupo por conta própria", () => {
    const r = lerGrupos("aplicacao,supabase");
    expect(r.ok).toBe(false);
    const mensagem = !r.ok ? r.erros.join(" ") : "";
    expect(mensagem).toContain("supabase_publico");
    expect(mensagem).toContain("o login nunca precisa dele");
  });

  it.each(["", " , ", "supabase_admin", "constructor", "toString", "__proto__"])("recusa %j", (texto) => {
    expect(lerGrupos(texto).ok).toBe(false);
  });
});

it("nunca coloca o valor das variáveis na mensagem de erro", () => {
  const erro = (() => {
    try {
      carregarAmbiente(
        { ...servidorValido, DATABASE_URL: "postgresql://u:" + "SENHA_QUE_NAO_PODE_VAZAR" + "@db.x.supabase.co/postgres", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("service_role") },
        ["aplicacao", "supabase_publico", "supabase_servidor"],
      );
    } catch (e) {
      return e;
    }
  })();
  expect(erro).toBeInstanceOf(AmbienteInvalido);
  const mensagem = (erro as Error).message;
  expect(mensagem).not.toContain("SENHA_QUE_NAO_PODE_VAZAR");
  expect(mensagem).not.toContain(jwt("service_role"));
  expect(mensagem).toContain("APP_ENV");
});
