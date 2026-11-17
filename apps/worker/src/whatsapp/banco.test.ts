// A ligação do worker do WhatsApp com o banco (lote WHATS-a), com o cliente do Supabase SIMULADO: as funções
// whatsapp_worker_* com os argumentos certos, a fila traduzida para o núcleo e o link do PDF no bucket privado "notas".
// E o executável: sem credencial, diz o que falta e termina sem erro.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { bancoWhatsApp } from "../supabase.ts";

function simulado(respostas: Record<string, { data: unknown; error: unknown }>, link: { data: unknown; error: unknown }) {
  const chamadas: { nome: string; argumentos: unknown }[] = [];
  const buckets: { bucket: string; caminho: string; segundos: number }[] = [];
  const cliente = {
    rpc: async (nome: string, argumentos: unknown) => { chamadas.push({ nome, argumentos }); return respostas[nome] ?? { data: null, error: { code: "PGRST202" } }; },
    storage: { from: (bucket: string) => ({ createSignedUrl: async (caminho: string, segundos: number) => { buckets.push({ bucket, caminho, segundos }); return link; } }) },
  } as unknown as SupabaseClient;
  return { cliente, chamadas, buckets };
}

describe("a ligação do worker do WhatsApp com o banco", () => {
  it("reivindica a fila e traduz cada linha para o núcleo; registra o resultado; gera o link do PDF", async () => {
    const s = simulado({
      whatsapp_worker_reivindicar: { data: [{ envio_id: "e1", organizacao_id: "o1", telefone: "41987650001", documento_caminho: "o1/l1/p1/a.pdf", nota_numero: 801, nota_serie: 1, chave_acesso: "4".repeat(44), cliente_nome: "Carla Cliente" }], error: null },
      whatsapp_worker_resultado: { data: "aceito", error: null },
    }, { data: { signedUrl: "https://assinado.invalid/a.pdf" }, error: null });
    const banco = bancoWhatsApp(s.cliente);
    expect(await banco.reivindicar(5)).toEqual([{ envioId: "e1", telefone: "41987650001", documentoCaminho: "o1/l1/p1/a.pdf", notaNumero: 801, notaSerie: 1, chaveAcesso: "4".repeat(44), clienteNome: "Carla Cliente" }]);
    expect(s.chamadas[0]).toEqual({ nome: "whatsapp_worker_reivindicar", argumentos: { p_limite: 5 } });
    expect(await banco.registrarResultado("e1", { situacao: "aceito", provedor_id: "wamid.x" })).toBe("aceito");
    expect(s.chamadas[1]).toEqual({ nome: "whatsapp_worker_resultado", argumentos: { p_envio: "e1", p_resultado: { situacao: "aceito", provedor_id: "wamid.x" } } });
    expect(await banco.linkTemporario("o1/l1/p1/a.pdf", 600)).toBe("https://assinado.invalid/a.pdf");
    expect(s.buckets).toEqual([{ bucket: "notas", caminho: "o1/l1/p1/a.pdf", segundos: 600 }]);
  });

  it("erro do banco sobe (o executável registra só a mensagem segura); link que não sai vira nulo (o envio volta à fila)", async () => {
    const s = simulado({ whatsapp_worker_reivindicar: { data: null, error: { code: "42501", message: "sem permissão" } } }, { data: null, error: { message: "não achou" } });
    const banco = bancoWhatsApp(s.cliente);
    await expect(banco.reivindicar(5)).rejects.toMatchObject({ code: "42501" });
    expect(await banco.linkTemporario("o1/x.pdf", 600)).toBeNull();
  });
});

describe("o executável do worker do WhatsApp", () => {
  it("sem credencial, diz o que falta, termina sem erro e não chama nada", () => {
    const pastaVazia = mkdtempSync(join(tmpdir(), "ora5g-whatsapp-"));
    try {
      const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
      const r = spawnSync(process.execPath, ["src/executar-whatsapp.ts"], {
        cwd: raiz, encoding: "utf8", timeout: 60_000,
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ORA_PASTA_AMBIENTE: pastaVazia },
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/worker do WhatsApp desligado: falta NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, WHATSAPP_GRAPH_API_VERSION/);
      expect(r.stdout).toMatch(/o adaptador oficial da Meta/);
    } finally {
      rmSync(pastaVazia, { recursive: true, force: true });
    }
  });
});
