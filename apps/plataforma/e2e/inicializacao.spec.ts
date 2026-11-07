import { spawn } from "node:child_process";

import { expect, test } from "@playwright/test";

// Porta 3199 so para este teste: se a validacao falhar, o servidor nao deve chegar a escutar.
test("o sistema recusa iniciar sem as variáveis obrigatórias", async () => {
  test.skip(test.info().project.name !== "computador", "basta rodar uma vez");

  // Vazias de proposito: o Next nao sobrescreve variavel ja definida com o .env.local.
  const env = { ...process.env, APP_ENV: "", NEXT_PUBLIC_APP_URL: "" };
  const processo = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", "3199"], { env });

  let saida = "";
  processo.stdout.on("data", (parte: Buffer) => (saida += parte.toString()));
  processo.stderr.on("data", (parte: Buffer) => (saida += parte.toString()));

  const codigo = await new Promise<number | null>((resolve) => {
    const limite = setTimeout(() => {
      processo.kill();
      resolve(null);
    }, 30_000);
    processo.on("exit", (c) => {
      clearTimeout(limite);
      resolve(c);
    });
  });

  expect(codigo, "o processo deveria encerrar com erro").toBe(1);
  expect(saida).toContain("APP_ENV: obrigatória e não definida");
  expect(saida).toContain("NEXT_PUBLIC_APP_URL: obrigatória e não definida");
});
