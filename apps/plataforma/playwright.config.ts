import { defineConfig, devices } from "@playwright/test";

// Sempre 127.0.0.1, nunca localhost: o servidor nao tem IPv6 (ADR-001, secao 2.4).
const enderecoBase = "http://127.0.0.1:3100";

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
    command: "npm run start",
    url: `${enderecoBase}/saude`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
