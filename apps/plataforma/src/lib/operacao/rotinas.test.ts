// A leitura das rotinas agendadas para a Saúde da operação (lote ROT-a; ADR-011), com o Supabase SIMULADO: nenhuma
// credencial, dados fictícios. O banco decide a situação; aqui se confere a leitura, a falha e a ordem dos problemas.
import { afterEach, describe, expect, it, vi } from "vitest";

import { lerRotinas, minutosDesde, rotinasComProblema, type Rotina } from "./rotinas";

type Resposta = { data: unknown; error: { code: string } | null };
const cliente = (resposta: Resposta) => ({ rpc: vi.fn(async () => resposta) }) as unknown as Parameters<typeof lerRotinas>[0];
const linha = (nome: string, situacao: string, extra: Record<string, unknown> = {}) => ({
  nome, descricao: `Rotina ${nome}`, frequencia: "a cada 5 minutos", situacao, ultima_ok: "2026-11-17T12:30:00Z", ultima_falha: null, erro: null, ...extra,
});

afterEach(() => { vi.restoreAllMocks(); });

describe("lerRotinas", () => {
  it("traz cada rotina como o banco diz, sem mudar a situação", async () => {
    const leitura = await lerRotinas(cliente({ data: [linha("a", "em_dia"), linha("b", "com_falha", { ultima_falha: "2026-11-17T12:35:00Z", erro: "57014" })], error: null }));
    expect(leitura).toEqual({ estado: "ok", rotinas: [
      { nome: "a", descricao: "Rotina a", frequencia: "a cada 5 minutos", situacao: "em_dia", ultimaCerta: "2026-11-17T12:30:00Z", ultimaFalha: null, erro: null },
      { nome: "b", descricao: "Rotina b", frequencia: "a cada 5 minutos", situacao: "com_falha", ultimaCerta: "2026-11-17T12:30:00Z", ultimaFalha: "2026-11-17T12:35:00Z", erro: "57014" },
    ] });
  });

  it("função ainda ausente no banco: o cartão some, sem registrar erro", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await lerRotinas(cliente({ data: null, error: { code: "PGRST202" } }))).toEqual({ estado: "ausente" });
    expect(await lerRotinas(cliente({ data: null, error: { code: "42883" } }))).toEqual({ estado: "ausente" });
    expect(erro).not.toHaveBeenCalled();
  });

  it("outra falha, ou uma linha que não se entende, vira falha da leitura, com só o código no registro", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await lerRotinas(cliente({ data: null, error: { code: "42501" } }))).toEqual({ estado: "falha" });
    expect(erro).toHaveBeenCalledWith("operação: falha ao ler as rotinas", { codigo: "42501" });
    expect(await lerRotinas(cliente({ data: [linha("a", "inventada")], error: null }))).toEqual({ estado: "falha" });
    expect(await lerRotinas(cliente({ data: { nao: "lista" }, error: null }))).toEqual({ estado: "falha" });
  });
});

describe("rotinasComProblema e minutosDesde", () => {
  const r = (nome: string, situacao: Rotina["situacao"]): Rotina => ({ nome, descricao: nome, frequencia: "f", situacao, ultimaCerta: null, ultimaFalha: null, erro: null });

  it("só as com falha e as atrasadas, as com falha primeiro", () => {
    expect(rotinasComProblema([r("a", "atrasada"), r("b", "em_dia"), r("c", "com_falha"), r("d", "aguardando")]).map((x) => x.nome)).toEqual(["c", "a"]);
  });

  it("minutos inteiros desde o instante, nunca negativos", () => {
    const agora = Date.parse("2026-11-17T12:40:30Z");
    expect(minutosDesde("2026-11-17T12:30:00Z", agora)).toBe(10);
    expect(minutosDesde("2026-11-17T12:45:00Z", agora)).toBe(0);
  });
});
