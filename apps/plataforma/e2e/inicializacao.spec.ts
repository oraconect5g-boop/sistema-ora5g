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

test("REV-004: o sistema recusa iniciar com chave privilegiada no campo público", async () => {
  test.skip(test.info().project.name !== "computador", "basta rodar uma vez");

  // JWT FICTÍCIO com papel service_role (assinatura inválida): não é credencial real.
  const conteudo = Buffer.from(JSON.stringify({ iss: "teste", role: "service_role" })).toString("base64url");
  const servidor = iniciarServidor({
    APP_ENV: "development",
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3199",
    NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ["eyJhbGciOiJIUzI1NiJ9", conteudo, "assinaturaFalsa"].join("."),
  });
  const codigo = await servidor.esperarEncerrar();

  expect(codigo, "o processo deveria encerrar com erro").toBe(1);
  expect(servidor.saida()).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  expect(servidor.saida()).not.toContain(conteudo);
});

test("CONFIG-001: com só o par público, o sistema sobe e oferece o login, sem chave secreta nem banco", async () => {
  test.skip(test.info().project.name !== "computador", "basta rodar uma vez");

  // Endereço .invalid e chave FICTÍCIA: nada é autenticado; só a configuração exigida na subida importa.
  // As duas do grupo servidor ficam vazias de propósito (vazia = não definida, nem lida do .env.local).
  const servidor = iniciarServidor({
    APP_ENV: "development",
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3199",
    NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.invalid",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ["sb", "publishable", "valorFicticioDeTeste123"].join("_"),
    SUPABASE_SECRET_KEY: "",
    DATABASE_URL: "",
  });
  try {
    await servidor.esperarNoAr();
    const entrada = await (await fetch(`${servidor.url}/entrar`)).text();
    expect(entrada).toContain("Entrar na plataforma");
    expect(entrada).not.toContain("O login ainda não está configurado");
    expect(servidor.saida()).not.toMatch(/SUPABASE_SECRET_KEY|DATABASE_URL/);
  } finally {
    await servidor.parar();
  }
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
