import { describe, expect, it } from "vitest";

import { AmbienteInvalido, carregarAmbiente, verificarAmbiente } from "./ambiente";

const aplicacaoValida = { APP_ENV: "development", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100" };
const segredoFalso = ["sb", "secret", "valorFalsoParaTeste123456"].join("_");
const supabaseValido = {
  NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_exemplo",
  SUPABASE_SECRET_KEY: segredoFalso,
  DATABASE_URL: "postgresql://postgres.exemplo:" + "senha-falsa" + "@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
};

describe("verificarAmbiente", () => {
  it("aceita a configuração mínima e aplica os padrões", () => {
    expect(carregarAmbiente(aplicacaoValida, ["aplicacao"])).toEqual({
      ...aplicacaoValida,
      APP_TIMEZONE: "America/Sao_Paulo",
      APP_DEFAULT_CURRENCY: "BRL",
    });
  });

  it("recusa subir quando falta variável obrigatória e cita só o nome", () => {
    const resultado = verificarAmbiente({ APP_ENV: "development" }, ["aplicacao"]);

    expect(resultado).toEqual({
      ok: false,
      problemas: [{ variavel: "NEXT_PUBLIC_APP_URL", motivo: "obrigatória e não definida" }],
    });
  });

  it("trata variável vazia como não definida", () => {
    const resultado = verificarAmbiente({ ...aplicacaoValida, APP_ENV: "  " }, ["aplicacao"]);

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.problemas[0]?.variavel).toBe("APP_ENV");
  });

  it("recusa localhost, porque o servidor é só IPv4", () => {
    const resultado = verificarAmbiente(
      { ...aplicacaoValida, NEXT_PUBLIC_APP_URL: "http://localhost:3100" },
      ["aplicacao"],
    );

    expect(!resultado.ok && resultado.problemas[0]?.motivo).toMatch(/127\.0\.0\.1/);
  });

  it("recusa ambiente desconhecido", () => {
    expect(verificarAmbiente({ ...aplicacaoValida, APP_ENV: "prod" }, ["aplicacao"]).ok).toBe(false);
  });

  it("aceita o Supabase pelo pooler em modo sessão", () => {
    expect(verificarAmbiente({ ...aplicacaoValida, ...supabaseValido }, ["aplicacao", "supabase"]).ok).toBe(true);
  });

  it("recusa a conexão direta do Supabase (só IPv6) e o pooler em modo transação", () => {
    for (const DATABASE_URL of [
      "postgresql://postgres:x@db.exemplo.supabase.co:5432/postgres",
      "postgresql://postgres.exemplo:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
    ]) {
      const resultado = verificarAmbiente({ ...supabaseValido, DATABASE_URL }, ["supabase"]);
      expect(!resultado.ok && resultado.problemas.map((p) => p.variavel)).toEqual(["DATABASE_URL"]);
    }
  });

  it("recusa chave secreta no lugar da chave pública", () => {
    const resultado = verificarAmbiente(
      { ...supabaseValido, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: segredoFalso },
      ["supabase"],
    );

    expect(!resultado.ok && resultado.problemas[0]?.variavel).toBe("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("nunca coloca o valor das variáveis na mensagem de erro", () => {
    const erro = (() => {
      try {
        carregarAmbiente({ ...supabaseValido, DATABASE_URL: "postgresql://u:" + "SENHA_QUE_NAO_PODE_VAZAR" + "@db.x.supabase.co/postgres", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: segredoFalso }, ["aplicacao", "supabase"]);
      } catch (e) {
        return e;
      }
    })();

    expect(erro).toBeInstanceOf(AmbienteInvalido);
    const mensagem = (erro as Error).message;
    expect(mensagem).not.toContain("SENHA_QUE_NAO_PODE_VAZAR");
    expect(mensagem).not.toContain(segredoFalso);
    expect(mensagem).toContain("APP_ENV");
  });
});
