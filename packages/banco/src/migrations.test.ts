import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { migrations } from "./banco-de-teste";

// REV-018 / #17: o histórico do Git e o do Supabase precisam contar a mesma história.
// - o nome do arquivo usa a versão gravada pelo Supabase ao aplicar;
// - migration já aplicada não muda (o md5 do arquivo é o registrado em aplicadas-dev.json);
// - toda migration tem a reversão com o mesmo nome (só para banco sem dados reais).

const PASTA = join(new URL("..", import.meta.url).pathname, "supabase");
type Aplicada = { versao: string; nome: string; md5: string; aplicada_em: string };
const registro = JSON.parse(readFileSync(join(PASTA, "aplicadas-dev.json"), "utf8")) as { migrations: Aplicada[] };
const md5 = (texto: string) => createHash("md5").update(texto, "utf8").digest("hex");

describe("controle das migrations (REV-018)", () => {
  const arquivos = migrations();

  it("nomes no formato versão_nome, versões sem repetição e em ordem", () => {
    const versoes = arquivos.map((m) => m.nome.slice(0, 14));
    expect(new Set(versoes).size).toBe(versoes.length);
    expect([...versoes].sort()).toEqual(versoes);
    expect(readdirSync(join(PASTA, "migrations")).every((nome) => /^\d{14}_[a-z0-9_]+\.sql$/.test(nome))).toBe(true);
  });

  it("toda migration aplicada no ora5g-dev existe com o mesmo nome e o mesmo conteúdo", () => {
    for (const aplicada of registro.migrations) {
      const arquivo = arquivos.find((m) => m.nome === `${aplicada.versao}_${aplicada.nome}.sql`);
      expect(arquivo, `${aplicada.versao}_${aplicada.nome}`).toBeDefined();
      expect(md5(arquivo?.sql ?? ""), `${aplicada.versao} foi alterada depois de aplicada: crie uma migration nova`).toBe(aplicada.md5);
    }
  });

  it("o registro segue a ordem dos arquivos (nada aplicado fora de ordem)", () => {
    const aplicadas = registro.migrations.map((m) => `${m.versao}_${m.nome}.sql`);
    expect(arquivos.map((m) => m.nome).slice(0, aplicadas.length)).toEqual(aplicadas);
  });

  it("toda migration tem a reversão com o mesmo nome", () => {
    for (const { nome } of arquivos) expect(existsSync(join(PASTA, "reversao", nome)), nome).toBe(true);
  });
});
