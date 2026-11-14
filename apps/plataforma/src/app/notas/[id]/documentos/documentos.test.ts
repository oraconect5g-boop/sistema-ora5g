// Rota de envio do documento da nota (lote L10a) com a sessão, o Storage e o banco SIMULADOS: o que ela confere
// antes de gravar e para onde volta em cada caso. As regras do banco estão em packages/banco/src/notas.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const PEDIDO = "00000000-0000-4000-9000-0000000000f1";
const VENDA = "00000000-0000-4000-9000-0000000000f2";
const CHAVE = "41261111222333000181650010000007011123456781";
const cenario = vi.hoisted(() => ({
  nota: null as Record<string, unknown> | null,
  envio: { error: null as null | { statusCode?: string } },
  rpc: { data: "doc" as unknown, error: null as null | { code: string; message?: string } },
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
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cenario.nota, error: null }) }) }) }),
      storage: { from: () => ({ upload: async (caminho: string, _b: unknown, o: { contentType: string }) => { cenario.enviados.push({ caminho, tipo: o.contentType }); return cenario.envio; } }) },
      rpc: async (nome: string, argumentos: Record<string, unknown>) => { cenario.chamadas.push({ nome, argumentos }); return cenario.rpc; },
    },
  }),
}));

import { POST } from "./route";

const pedir = (arquivo: Blob | null, extras: Record<string, string> = {}, origem = "https://ora5g.com.br") => {
  const dados = new FormData();
  if (arquivo) dados.set("arquivo", new File([arquivo], "nota.pdf"));
  for (const [k, v] of Object.entries(extras)) dados.set(k, v);
  return new Request(`https://ora5g.com.br/notas/${PEDIDO}/documentos`, { method: "POST", body: dados, headers: { origin: origem, host: "ora5g.com.br" } });
};
const destino = async (r: Promise<Response>) => {
  try { const resposta = await r; return `status ${resposta.status}`; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
};
const contexto = { params: Promise.resolve({ id: PEDIDO }) };

beforeEach(() => {
  cenario.nota = { id: PEDIDO, organizacao_id: "org", unidade_id: "loja", venda_id: VENDA, situacao: "emitida", chave_acesso: CHAVE };
  cenario.envio = { error: null };
  cenario.rpc = { data: "doc", error: null };
  cenario.enviados = [];
  cenario.chamadas = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("/notas/[id]/documentos (L10a)", () => {
  it("PDF conferido vai para o Storage no caminho da nota e o banco registra com o SHA-256", async () => {
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7 fictício"])), contexto))).toBe(`/vendas/${VENDA}?nota=documento_pdf`);
    expect(cenario.enviados).toHaveLength(1);
    expect(cenario.enviados[0]?.caminho).toMatch(new RegExp(`^org/loja/${PEDIDO}/[0-9a-f-]{36}\\.pdf$`));
    expect(cenario.chamadas[0]).toMatchObject({ nome: "notas_anexar_documento", argumentos: { p_pedido: PEDIDO, p_tipo: "pdf", p_protocolo: null } });
    expect(String(cenario.chamadas[0]?.argumentos.p_sha256)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("outra origem é recusada; nota não emitida, arquivo errado, falha do Storage e erro do banco voltam com a mensagem", async () => {
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"]), {}, "https://outro-site.com"), contexto))).toBe("status 403");
    cenario.nota = { ...cenario.nota, situacao: "aprovada" };
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"])), contexto))).toBe(`/vendas/${VENDA}?erro_nota=dados`);
    cenario.nota = { ...cenario.nota, situacao: "emitida" };
    expect(await destino(POST(pedir(new Blob(["<html></html>"])), contexto))).toBe(`/vendas/${VENDA}?erro_nota=documento_tipo`);
    expect(await destino(POST(pedir(new Blob([`<nfeProc><NFe><infNFe Id="NFe${CHAVE.replace(/1$/, "2")}"></infNFe></NFe></nfeProc>`])), contexto))).toBe(`/vendas/${VENDA}?erro_nota=documento_outra_nota`);
    cenario.envio = { error: { statusCode: "403" } };
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"])), contexto))).toBe(`/vendas/${VENDA}?erro_nota=falha`);
    cenario.envio = { error: null };
    cenario.rpc = { data: null, error: { code: "22023", message: "Esta nota já tem outro protocolo registrado" } };
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"]), { protocolo: "141260000123456" }), contexto))).toBe(`/vendas/${VENDA}?erro_nota=protocolo_outro`);
    cenario.nota = null;
    expect(await destino(POST(pedir(new Blob(["%PDF-1.7"])), contexto))).toBe("status 404");
  });
});
