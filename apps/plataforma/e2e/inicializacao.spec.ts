import { expect, test } from "@playwright/test";

import { iniciarServidor } from "./servidor-auxiliar";

test.describe.configure({ mode: "serial" });

test("o sistema recusa iniciar sem as variáveis obrigatórias", async () => {
  test.skip(test.info().project.name !== "computador", "basta rodar uma vez");

  const servidor = iniciarServidor({ APP_ENV: "", NEXT_PUBLIC_APP_URL: "" });
  const codigo = await servidor.esperarEncerrar();

  expect(codigo, "o processo deveria encerrar com erro").toBe(1);
  expect(servidor.saida()).toContain("APP_ENV: obrigatória e não definida");
  expect(servidor.saida()).toContain("NEXT_PUBLIC_APP_URL: obrigatória e não definida");
});

test("em produção a demonstração não existe", async () => {
  test.skip(test.info().project.name !== "computador", "basta rodar uma vez");

  const servidor = iniciarServidor({ APP_ENV: "producao", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3199" });
  try {
    await servidor.esperarNoAr();
    expect((await fetch(`${servidor.url}/demo`)).status).toBe(404);
    expect((await fetch(`${servidor.url}/demo/vender`)).status).toBe(404);
    expect((await fetch(`${servidor.url}/demo/perfil/usar?p=dono`, { redirect: "manual" })).status).toBe(404);
    expect(await (await fetch(servidor.url)).text()).not.toContain("Ver demonstração");
  } finally {
    await servidor.parar();
  }
});
