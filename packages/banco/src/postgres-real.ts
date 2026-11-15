// PostgreSQL 17 de verdade (binário oficial empacotado em embedded-postgres), só para testes:
// ouve em 127.0.0.1 numa porta livre, guarda os dados numa pasta temporária e some ao parar.
// Serve para o que o PGlite não prova: duas conexões simultâneas disputando as mesmas linhas — e, desde o QUAL-012a,
// a queda de repente do servidor e a volta pela recuperação do próprio PostgreSQL (a pasta fica até o fim do teste).
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

import { type ExecutorSql, migrations, supabaseSimulado } from "./banco-de-teste";

// Só para o banco descartável do teste: não é credencial de nenhum ambiente.
const ACESSO_LOCAL = { user: "postgres", password: "somente-teste-local" };

async function portaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const servidor = createServer();
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", () => {
      const endereco = servidor.address();
      const porta = typeof endereco === "object" && endereco ? endereco.port : 0;
      servidor.close(() => resolve(porta));
    });
  });
}

export type PostgresReal = {
  conectar: () => Promise<pg.Client>;
  parar: () => Promise<void>;
  /** Parada imediata (sem checkpoint), como uma queda de energia; só com `persistente`. */
  cairDeRepente: () => Promise<void>;
  /** Sobe de novo com a mesma pasta e a mesma porta: o PostgreSQL refaz pelo WAL o que estava confirmado. */
  religar: () => Promise<void>;
};

// Sobe o servidor e aplica o "Supabase simulado" e todas as migrations, como no PGlite.
export async function iniciarPostgresReal(opcoes: { persistente?: boolean } = {}): Promise<PostgresReal> {
  const pasta = mkdtempSync(join(tmpdir(), "ora5g-pg-"));
  const porta = await portaLivre();
  const servidor = new EmbeddedPostgres({
    databaseDir: pasta,
    port: porta,
    ...ACESSO_LOCAL,
    // Persistente: a pasta fica quando o servidor para (para a queda e a volta); o parar() daqui apaga sempre.
    persistent: opcoes.persistente === true,
    // A tabela de travas tem o tamanho da do ora5g-dev (64 x 75 processos = 4.800 objetos, medido em 12/11/2026):
    // o que cabe aqui em travas consultivas cabe lá.
    postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "unix_socket_directories=",
      "-c", "max_connections=60", "-c", "max_worker_processes=6", "-c", "max_wal_senders=5"],
    onLog: () => {},
    onError: () => {},
  });
  await servidor.initialise();
  await servidor.start();

  const conectar = async () => {
    const cliente = new pg.Client({ host: "127.0.0.1", port: porta, database: "postgres", ...ACESSO_LOCAL });
    await cliente.connect();
    // Nenhum teste pode ficar preso: uma espera acima de 15 s é falha, não lentidão.
    await cliente.query("set lock_timeout = '15s'");
    return cliente;
  };

  const admin = await conectar();
  try {
    await admin.query(supabaseSimulado());
    for (const { sql } of migrations()) await admin.query(sql);
  } finally {
    await admin.end();
  }

  return {
    conectar,
    parar: async () => {
      await servidor.stop();
      rmSync(pasta, { recursive: true, force: true });
    },
    cairDeRepente: async () => {
      if (opcoes.persistente !== true) throw new Error("a queda de repente pede o servidor persistente (sem a pasta, não há o que recuperar)");
      // SIGQUIT no processo principal é a parada imediata do PostgreSQL: sem checkpoint, como uma queda de energia.
      const interno = servidor as unknown as { process?: import("node:child_process").ChildProcess };
      const processo = interno.process;
      if (!processo) throw new Error("o servidor não está no ar");
      await new Promise<void>((pronto) => {
        processo.once("exit", () => pronto());
        processo.kill("SIGQUIT");
      });
      interno.process = undefined;
    },
    religar: async () => {
      await servidor.start();
    },
  };
}

// Adapta uma conexão real à interface dos cenários (montarCenario, montarCatalogo).
export function executor(cliente: pg.Client): ExecutorSql {
  return {
    exec: async (sql) => cliente.query(sql),
    query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await cliente.query(sql, params)).rows as T[] }),
  };
}
