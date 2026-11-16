import { execSync } from "node:child_process";

import type { NextConfig } from "next";

// Versão visível nas telas (lib/versao.ts): o commit e a hora da build ficam gravados na build.
// Na pasta de cada versão publicada (worktree do Git) e no CI, o commit sai do próprio Git.
function commitCurto(): string {
  if (process.env.ORA_COMMIT) return process.env.ORA_COMMIT.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "sem-git";
  }
}

// O commit inteiro (40 caracteres) para /saude/versao: o conferidor da publicação compara a identidade exata (#99).
function commitCompleto(): string {
  if (process.env.ORA_COMMIT && /^[0-9a-f]{40}$/.test(process.env.ORA_COMMIT)) return process.env.ORA_COMMIT;
  try {
    const sha = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : "";
  } catch {
    return "";
  }
}

const configuracao: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_ORA_COMMIT: commitCurto(), NEXT_PUBLIC_ORA_BUILD: new Date().toISOString(), ORA_COMMIT_COMPLETO: commitCompleto() },
  transpilePackages: ["@ora5g/config", "@ora5g/dominio"],
  // Atrás do Apache do cPanel, o pedido da raiz chega como o arquivo de índice que o Apache
  // procura (index.php, index.html, default.htm...). A reescrita só olha o caminho, então
  // funciona com os cabeçalhos X-Forwarded-* do proxy (reescrever no proxy.ts não funcionava).
  async rewrites() {
    return {
      beforeFiles: [{ source: "/:indice((?:index|default|home|Default|Home|INDEX)\\.[a-zA-Z0-9]{1,6})", destination: "/" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default configuracao;
