import { defineConfig } from "vitest/config";

// Cada arquivo cria seu próprio banco em memória; os testes de banco levam alguns segundos.
export default defineConfig({ test: { include: ["src/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 60_000 } });
