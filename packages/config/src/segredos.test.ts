import { describe, expect, it } from "vitest";

import { arquivoProibido, procurarNoHistorico, procurarNoTexto } from "./segredos";

// Os segredos falsos sao montados em partes para o proprio arquivo de teste nao ser barrado.
const j = (...partes: string[]) => partes.join("");
const falsos: Record<string, string> = {
  "chave-privada": j("-----BEGIN ", "RSA PRIVATE KEY-----"),
  "supabase-secreta": j("sb_", "secret_", "AbCdEfGhIjKlMnOpQrSt"),
  jwt: j("eyJ", "hbGciOiJIUzI1NiJ9", ".eyJ", "yb2xlIjoic2VydmljZV9yb2xlIn0", ".", "abcdefghijklmnop"),
  "url-banco-com-senha": j("postgresql://postgres.abc:", "Senha123", "@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"),
  "github-token": j("ghp_", "a".repeat(36)),
  "aws-chave": j("AKIA", "ABCDEFGHIJKLMNOP"),
  "chave-live": j("sk_", "live_", "a1b2c3d4e5f6g7h8i9"),
  "variavel-sensivel-preenchida": j("CRON_", "SECRET=", "umValorDeVerdade123"),
};

describe("procurarNoTexto", () => {
  it.each(Object.entries(falsos))("acha %s", (regra, segredo) => {
    expect(procurarNoTexto("arquivo.ts", `linha 1\n${segredo}\n`).map((a) => [a.regra, a.linha])).toContainEqual([regra, 2]);
  });

  it("não acusa o modelo .env.example com valores vazios ou exemplos", () => {
    const modelo = [
      "CRON_SECRET=",
      "SUPABASE_SECRET_KEY=                    # SÓ no servidor",
      "# postgresql://postgres.<projeto>:<senha>@aws-<n>-<regiao>.pooler.supabase.com:5432/postgres",
      "const chave = process.env.SUPABASE_SECRET_KEY;",
      'PICPAY_CLIENT_SECRET=${PICPAY_CLIENT_SECRET}',
    ].join("\n");

    expect(procurarNoTexto(".env.example", modelo)).toEqual([]);
  });

  it("ignora arquivo binário", () => {
    expect(procurarNoTexto("imagem.png", `\u0000${falsos["aws-chave"]}`)).toEqual([]);
  });
});

describe("arquivoProibido", () => {
  it.each([".env", "apps/plataforma/.env.local", ".env.producao", "certificado.pfx", "chave.pem", "a/b/servidor.key"])(
    "proíbe %s",
    (caminho) => expect(arquivoProibido(caminho)).toBe(true),
  );

  it.each([".env.example", "docs/env.md", "src/ambiente.ts", "keys.ts"])("permite %s", (caminho) =>
    expect(arquivoProibido(caminho)).toBe(false),
  );
});

describe("procurarNoHistorico", () => {
  const diff = (linhaAdicionada: string, arquivo = "src/config.ts") =>
    ["commit:abcdef1234567", `diff --git a/${arquivo} b/${arquivo}`, `--- a/${arquivo}`, `+++ b/${arquivo}`, "@@ -1,2 +10,3 @@", " contexto", `+${linhaAdicionada}`, "-linha removida"].join("\n");

  it("barra segredo adicionado em um commit, mesmo que removido depois", () => {
    expect(procurarNoHistorico(diff(falsos["aws-chave"] as string))).toEqual([
      { arquivo: "src/config.ts (commit abcdef1)", linha: 11, regra: "aws-chave", descricao: "chave de acesso AWS" },
    ]);
  });

  it("não acusa segredo em linha removida", () => {
    const saida = ["commit:abc1234", "+++ b/a.ts", "@@ -1 +1 @@", `-${falsos["aws-chave"]}`, "+limpo"].join("\n");
    expect(procurarNoHistorico(saida)).toEqual([]);
  });

  it("barra arquivo .env adicionado", () => {
    expect(procurarNoHistorico(diff("APP_ENV=development", ".env")).map((a) => a.regra)).toEqual(["arquivo-proibido"]);
  });
});
