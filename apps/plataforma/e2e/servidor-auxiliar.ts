import { spawn } from "node:child_process";

// Sobe um servidor separado (porta 3199, só para testes) com variáveis diferentes.
// Variáveis vazias de propósito: o Next não sobrescreve variável já definida com o .env.local.
// O processo roda num grupo próprio (detached): ao parar, encerramos o grupo inteiro, senão o
// "next start" filho do npx ficava vivo segurando a porta 3199 (achado do Codex, EADDRINUSE).
export function iniciarServidor(env: Record<string, string>) {
  const processo = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", "3199"], { env: { ...process.env, ...env }, detached: true });
  let saida = "";
  processo.stdout.on("data", (parte: Buffer) => (saida += parte.toString()));
  processo.stderr.on("data", (parte: Buffer) => (saida += parte.toString()));

  const encerrou = new Promise<number | null>((resolve) => processo.on("exit", (codigo) => resolve(codigo)));
  const encerrarGrupo = () => {
    try {
      if (processo.pid) process.kill(-processo.pid, "SIGTERM");
    } catch {
      // o grupo já tinha terminado
    }
  };

  return {
    url: "http://127.0.0.1:3199",
    saida: () => saida,
    async esperarEncerrar(limiteMs = 30_000) {
      const tempo = new Promise<null>((resolve) => setTimeout(() => resolve(null), limiteMs));
      const codigo = await Promise.race([encerrou, tempo]);
      if (codigo === null) encerrarGrupo();
      return codigo;
    },
    async esperarNoAr(limiteMs = 30_000) {
      const fim = Date.now() + limiteMs;
      while (Date.now() < fim) {
        try {
          const r = await fetch("http://127.0.0.1:3199/saude");
          if (r.ok) return;
        } catch {
          // ainda subindo
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      throw new Error(`Servidor de teste não subiu:\n${saida}`);
    },
    async parar() {
      encerrarGrupo();
      await encerrou;
      // Espera a porta ser liberada de verdade antes do próximo teste.
      for (let i = 0; i < 50; i++) {
        try {
          await fetch("http://127.0.0.1:3199/saude");
        } catch {
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    },
  };
}
