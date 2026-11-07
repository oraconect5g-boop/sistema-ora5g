// REV-003: o detector precisa achar segredo adicionado e removido no histórico (push e PR),
// sem imprimir o valor. Roda o script de verdade num repositório Git temporário.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, expect, it } from "vitest";

const script = new URL("../scripts/procurar-segredos.ts", import.meta.url).pathname;
const repo = mkdtempSync(join(tmpdir(), "ora5g-segredos-"));
const segredo = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
const git = (...args: string[]) =>
  execFileSync("git", ["-c", "user.name=Teste", "-c", "user.email=teste@exemplo.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });

afterAll(() => rmSync(repo, { recursive: true, force: true }));

it("acha o segredo que foi adicionado e depois removido, e não imprime o valor", () => {
  git("init", "-q");
  writeFileSync(join(repo, "limpo.txt"), "nada aqui\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(repo, "config.ts"), `const chave = "${segredo}";\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "adiciona");
  writeFileSync(join(repo, "config.ts"), "const chave = process.env.CHAVE;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "remove");

  const estadoFinal = spawnSync(process.execPath, [script], { cwd: repo, encoding: "utf8" });
  expect(estadoFinal.status).toBe(0);

  for (const intervalo of [`${base}..HEAD`, "HEAD"]) {
    const historico = spawnSync(process.execPath, [script, "--historico", intervalo], { cwd: repo, encoding: "utf8" });
    expect(historico.status, intervalo).toBe(1);
    expect(historico.stderr).toContain("config.ts");
    expect(historico.stderr).toContain("aws-chave");
    expect(historico.stdout + historico.stderr).not.toContain(segredo);
  }
});
