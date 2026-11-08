import { defineConfig } from "vitest/config";

export default defineConfig({
  // O tsconfig usa jsx "preserve" (o Next compila o JSX). Nos testes, o Vite precisa compilar
  // as páginas .tsx que um teste importa (ex.: /conta no REV-014).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
