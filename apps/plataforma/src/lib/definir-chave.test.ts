// definir-chave.sh grava o valor de modo que o Next o leia igual (auditoria do Codex de 08/11,
// §7.6): o teste usa o próprio script, num terminal simulado (script -q), e o leitor real do
// Next (@next/env). Os valores são fictícios.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const exigir = createRequire(import.meta.url);
type CarregarEnv = (pasta: string, dev: boolean, log: { info: () => void; error: () => void }, forcar: boolean) => { combinedEnv: Record<string, string | undefined> };
const { loadEnvConfig } = exigir(exigir.resolve("@next/env", { paths: [exigir.resolve("next/package.json")] })) as { loadEnvConfig: CarregarEnv };

const SCRIPT = join(new URL("../../../..", import.meta.url).pathname, "deploy", "homologacao", "definir-chave.sh");
const NOME = "PICPAY_CLIENT_SECRET";
const pastas: string[] = [];
afterAll(() => { for (const p of pastas) rmSync(p, { recursive: true, force: true }); });

function gravar(valor: string) {
  const pasta = mkdtempSync(join(tmpdir(), "ora5g-chave-"));
  pastas.push(pasta);
  const arquivo = join(pasta, ".env.local");
  writeFileSync(arquivo, "OUTRA=fica\n");
  const r = spawnSync("script", ["-qec", `bash '${SCRIPT}' ${NOME} '${arquivo}'`, "/dev/null"], { input: `${valor}\n`, encoding: "utf8", timeout: 20_000 });
  return { codigo: r.status, pasta, conteudo: readFileSync(arquivo, "utf8") };
}

// Lê como o "next start" da homologação: em produção (com NODE_ENV=test o Next ignora .env.local).
function ler(pasta: string) {
  const ambiente = process.env.NODE_ENV;
  delete process.env[NOME];
  delete process.env.OUTRA;
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    return loadEnvConfig(pasta, false, { info: () => {}, error: () => {} }, true).combinedEnv[NOME];
  } finally {
    Object.assign(process.env, { NODE_ENV: ambiente });
    delete process.env[NOME];
    delete process.env.OUTRA;
  }
}

describe("definir-chave.sh e o leitor do Next", () => {
  it.each([
    ["simples", "sb_secret_ABC-123.xyz"],
    ["cifrão com nome", "abc$HOME"],
    ["cifrão com chaves", "x${PATH}y"],
    ["só cifrões", "$$"],
    ["cifrão no fim", "fim$"],
    ["barra invertida antes do cifrão", "a\\$b"],
    ["barras invertidas", "a\\b\\nc"],
    ["aspas duplas", 'a"b"c'],
    ["aspas simples e espaço", "a'b c"],
    ["cerquilha e espaço", "com # e espaço"],
  ])("%s: o Next lê exatamente o valor gravado", (_caso, valor) => {
    const { codigo, pasta } = gravar(valor);
    expect(codigo).toBe(0);
    expect(ler(pasta)).toBe(valor);
  });

  it.each([
    ["aspas simples e duplas", "a'b\"c"],
    ["aspas simples e barra invertida", "a'b\\c"],
    ["barra invertida no fim", "termina\\"],
  ])("%s: recusa sem mexer no arquivo", (_caso, valor) => {
    const { codigo, conteudo } = gravar(valor);
    expect(codigo).toBe(1);
    expect(conteudo).toBe("OUTRA=fica\n");
  });
});
