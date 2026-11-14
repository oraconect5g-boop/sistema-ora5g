// Rota de envio do documento da venda (lote L5d) com a sessão, o Storage e o banco SIMULADOS: o que ela confere antes
// de gravar e para onde volta em cada caso. As regras do banco estão em packages/banco/src/anexos-da-venda.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const VENDA = "00000000-0000-4000-9000-0000000000a1";
const cenario = vi.hoisted(() => ({
  venda: null as Record<string, unknown> | null,
  envio: { error: null as null | { statusCode?: string } },
  rpc: { data: { id: "a", repetido: false } as unknown, error: null as null | { code: string; message?: string } },
  enviados: [] as { caminho: string; tipo: string }[],
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (d: string) => { throw new Error(`redirecionou para ${d}`); } }));
vi.mock("../../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: "loja", unidade_nome: "Loja", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase: {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cenario.venda, error: null }) }) }) }),
      storage: { from: () => ({ upload: async (caminho: string, _b: unknown, o: { contentType: string }) => { cenario.enviados.push({ caminho, tipo: o.contentType }); return cenario.envio; } }) },
      rpc: async (nome: string, argumentos: Record<string, unknown>) => { cenario.chamadas.push({ nome, argumentos }); return cenario.rpc; },
    },
  }),
}));

import { POST } from "./route";

const pedir = (arquivo: Blob | null, campos: Record<string, string> = { tipo: "contrato_financiamento" }, origem = "https://ora5g.com.br") => {
  const dados = new FormData();
  if (arquivo) dados.set("arquivo", new File([arquivo], "contrato.pdf"));
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return new Request(`https://ora5g.com.br/vendas/${VENDA}/anexos`, { method: "POST", body: dados, headers: { origin: origem, host: "ora5g.com.br" } });
};
const destino = async (r: Promise<Response>) => {
  try { const resposta = await r; return `status ${resposta.status}`; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
};
const contexto = { params: Promise.resolve({ id: VENDA }) };
const JPEG = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])]);

beforeEach(() => {
  cenario.venda = { id: VENDA, organizacao_id: "org", unidade_id: "loja", situacao: "concluida" };
  cenario.envio = { error: null };
  cenario.rpc = { data: { id: "a", repetido: false }, error: null };
  cenario.enviados = [];
  cenario.chamadas = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("/vendas/[id]/anexos (L5d)", () => {
  it("PDF e foto conferidos vão para o Storage no caminho da venda e o banco registra com o tipo, a descrição e o SHA-256", async () => {
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7 fictício"])), contexto))).toBe(`/vendas/${VENDA}?anexo=guardado`);
    expect(cenario.enviados[0]).toEqual({ caminho: expect.stringMatching(new RegExp(`^org/loja/${VENDA}/[0-9a-f-]{36}\\.pdf$`)), tipo: "application/pdf" });
    expect(cenario.chamadas[0]).toMatchObject({ nome: "venda_anexar_documento", argumentos: { p_venda: VENDA, p_tipo: "contrato_financiamento", p_descricao: null } });
    expect(String(cenario.chamadas[0]?.argumentos.p_sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(await destino(POST(pedir(JPEG, { tipo: "outro", descricao: " Foto do  RG " }), contexto))).toBe(`/vendas/${VENDA}?anexo=guardado`);
    expect(cenario.enviados[1]?.caminho).toMatch(/\.jpg$/);
    expect(cenario.chamadas[1]?.argumentos).toMatchObject({ p_tipo: "outro", p_descricao: "Foto do RG" });
  });

  it("outra origem, venda aberta, tipo e descrição, arquivo errado, Storage recusando e o erro do banco voltam com a mensagem, sem gravar nada fora de hora", async () => {
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"]), undefined, "https://outro-site.com"), contexto))).toBe("status 403");
    cenario.venda = { ...cenario.venda, situacao: "rascunho" };
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"])), contexto))).toBe(`/vendas/${VENDA}?erro_anexo=anexo_venda_aberta`);
    cenario.venda = { ...cenario.venda, situacao: "cancelada" };
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"]), { tipo: "nota_fiscal" }), contexto))).toBe(`/vendas/${VENDA}?erro_anexo=anexo_dados`);
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"]), { tipo: "outro" }), contexto))).toBe(`/vendas/${VENDA}?erro_anexo=anexo_dados`);
    expect(await destino(POST(pedir(new Blob(["<html></html>"])), contexto))).toBe(`/vendas/${VENDA}?erro_anexo=anexo_tipo`);
    expect(await destino(POST(pedir(null), contexto))).toBe(`/vendas/${VENDA}?erro_anexo=anexo_tipo`);
    expect(cenario.enviados).toEqual([]);
    cenario.envio = { error: { statusCode: "403" } };
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"])), contexto))).toBe(`/vendas/${VENDA}?erro_anexo=anexo_permissao`);
    cenario.envio = { error: { statusCode: "500" } };
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"])), contexto))).toBe(`/vendas/${VENDA}?erro_anexo=anexo_falha`);
    cenario.envio = { error: null };
    cenario.rpc = { data: null, error: { code: "22023", message: "Esta venda já tem 20 documentos: retire um errado antes" } };
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"])), contexto))).toBe(`/vendas/${VENDA}?erro_anexo=anexo_limite`);
    cenario.venda = null;
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"])), contexto))).toBe("status 404");
  });
});
