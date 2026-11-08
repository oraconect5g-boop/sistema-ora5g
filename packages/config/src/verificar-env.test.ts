// CONFIG-001: o comando que os guias mandam rodar (npm run verificar-env). Roda o script de
// verdade com um arquivo .env FICTÍCIO e confere saída, código de saída e ausência de valores.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const script = new URL("../scripts/verificar-env.ts", import.meta.url).pathname;
const pasta = mkdtempSync(join(tmpdir(), "ora5g-verificar-env-"));
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

const chavePublica = ["sb", "publishable", "valorFicticioDeTeste123"].join("_");
const enderecoSupabase = "https://exemplo.supabase.invalid";
// Só o necessário para o login: aplicação e o par público. Nada do grupo servidor.
const arquivoDoLogin = join(pasta, "login.env");
writeFileSync(
  arquivoDoLogin,
  ["APP_ENV=development", "NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100", `NEXT_PUBLIC_SUPABASE_URL=${enderecoSupabase}`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${chavePublica}`].join("\n"),
  { mode: 0o600 },
);

const rodar = (grupos: string) => spawnSync(process.execPath, [script, arquivoDoLogin, grupos], { encoding: "utf8" });
const semValores = (saida: string) => {
  expect(saida).not.toContain(chavePublica);
  expect(saida).not.toContain(enderecoSupabase);
};

describe("verificar-env com os grupos atuais", () => {
  it("o login passa só com aplicacao e supabase_publico, sem chave secreta nem banco", () => {
    const r = rodar("aplicacao,supabase_publico");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("[supabase_publico]");
    expect(r.stdout).toMatch(/ok\s+NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    expect(r.stdout).not.toContain("SUPABASE_SECRET_KEY");
    semValores(r.stdout + r.stderr);
  });

  it("o nome antigo supabase explica qual grupo usar e não confere nada", () => {
    const r = rodar("aplicacao,supabase");
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("grupo supabase: foi dividido");
    expect(r.stderr).toContain("Grupos válidos: aplicacao, supabase_publico, supabase_servidor");
    semValores(r.stdout + r.stderr);
  });

  it("supabase_servidor só é exigido quando pedido de propósito (worker e migrations)", () => {
    const r = rodar("aplicacao,supabase_publico,supabase_servidor");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("ERRO  SUPABASE_SECRET_KEY — obrigatória e não definida");
    semValores(r.stdout + r.stderr);
  });
});
