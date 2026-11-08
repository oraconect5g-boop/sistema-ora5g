import { defineConfig, devices } from "@playwright/test";

// No servidor de desenvolvimento, carrega o .env.local para os testes saberem se o Supabase
// está configurado (o teste de login real só roda nesse caso). No CI o arquivo não existe.
try {
  process.loadEnvFile(".env.local");
} catch {
  // sem .env.local: segue com as variáveis do ambiente
}

// Sempre 127.0.0.1, nunca localhost: o servidor nao tem IPv6 (ADR-001, secao 2.4).
// Porta 3180: testes do programador. A 3100 fica livre para a homologacao (ADR-001).
// ORA_PORTA_E2E permite rodar duas suítes ao mesmo tempo no servidor (ex.: duas sessões), sem disputar a porta.
const porta = process.env.ORA_PORTA_E2E ?? "3180";
const enderecoBase = `http://127.0.0.1:${porta}`;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: true,
  use: { baseURL: enderecoBase },
  projects: [
    {
      name: "celular-360",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 640 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "computador",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npx next start -H 127.0.0.1 -p ${porta}`,
    url: `${enderecoBase}/saude`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
