// Rotas dos documentos da conta a pagar (lote FIN-004b) com a sessão, o Storage e o banco SIMULADOS: o que a rota de
// envio confere antes de gravar e para onde volta (sempre 303, sem reenviar o arquivo), e a de abrir, que assina o
// link na hora. As regras do banco estão em packages/banco/src/documentos-da-conta.test.ts.
import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const CONTA = "00000000-0000-4000-9000-0000000000e1";
const DOC = "00000000-0000-4000-9000-0000000000b1";
const LOJA = "00000000-0000-4000-8000-0000000000aa";
const cenario = vi.hoisted(() => ({
  linhas: {} as Record<string, Record<string, unknown> | null>,
  errosDasTabelas: {} as Record<string, { code: string }>,
  filtros: [] as string[],
  envio: { error: null as null | { statusCode?: string } },
  assinatura: { data: { signedUrl: "https://banco.exemplo/storage/v1/object/sign/contas/x?token=t" } as unknown, error: null as null | { statusCode?: string } },
  rpc: { data: { id: "a", repetido: false } as unknown, error: null as null | { code: string; message?: string } },
  enviados: [] as { caminho: string; tipo: string; bytes: Uint8Array }[],
  assinados: [] as { caminho: string; validade: number }[],
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (d: string) => { throw new Error(`redirecionou para ${d}`); } }));
vi.mock("../../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Loja", turno_termina_em: "2026-11-15T23:00:00Z" },
    supabase: {
      from: (tabela: string) => {
        const consulta = {
          select: () => consulta,
          eq: (coluna: string, valor: unknown) => { cenario.filtros.push(`${tabela} ${coluna}=${String(valor)}`); return consulta; },
          maybeSingle: async () => (cenario.errosDasTabelas[tabela] ? { data: null, error: cenario.errosDasTabelas[tabela] } : { data: cenario.linhas[tabela] ?? null, error: null }),
        };
        return consulta;
      },
      storage: {
        from: (balde: string) => ({
          upload: async (caminho: string, bytes: Uint8Array, o: { contentType: string; upsert: boolean }) => {
            expect([balde, o.upsert]).toEqual(["contas", false]);
            cenario.enviados.push({ caminho, tipo: o.contentType, bytes });
            return cenario.envio;
          },
          createSignedUrl: async (caminho: string, validade: number) => { expect(balde).toBe("contas"); cenario.assinados.push({ caminho, validade }); return cenario.assinatura; },
        }),
      },
      rpc: async (nome: string, argumentos: Record<string, unknown>) => { cenario.chamadas.push({ nome, argumentos }); return cenario.rpc; },
    },
  }),
}));

import { GET as abrir } from "./[documento]/route";
import { POST as guardar } from "./route";

const pedir = (arquivo: Blob | null, campos: Record<string, string> = { tipo: "boleto" }, origem = "https://ora5g.com.br") => {
  const dados = new FormData();
  if (arquivo) dados.set("arquivo", new File([arquivo], "boleto.pdf"));
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return new Request(`https://ora5g.com.br/contas-a-pagar/${CONTA}/documentos`, { method: "POST", body: dados, headers: { origin: origem, host: "ora5g.com.br" } });
};
/** Para onde a resposta manda (303 e o Location) ou o status. */
const destino = async (r: Promise<Response>) => {
  const resposta = await r;
  return resposta.status === 303 ? resposta.headers.get("location") : `status ${resposta.status}`;
};
const contexto = { params: Promise.resolve({ id: CONTA }) };
const PDF = () => new Blob(["%PDF-1.7 fictício"]);
const JPEG = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])]);

beforeEach(() => {
  cenario.linhas = {
    contas_a_pagar: { id: CONTA, organizacao_id: "org" },
    conta_pagar_anexos: { caminho: `org/${CONTA}/00000000-0000-4000-a000-000000000001.pdf`, retirado_em: null },
  };
  cenario.errosDasTabelas = {};
  cenario.filtros = [];
  cenario.envio = { error: null };
  cenario.assinatura = { data: { signedUrl: "https://banco.exemplo/storage/v1/object/sign/contas/x?token=t" }, error: null };
  cenario.rpc = { data: { id: "a", repetido: false }, error: null };
  cenario.enviados = [];
  cenario.assinados = [];
  cenario.chamadas = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("/contas-a-pagar/[id]/documentos: guardar (FIN-004b)", () => {
  it("PDF e foto conferidos vão para o Storage no caminho da conta, o banco registra com o tipo, a descrição e o SHA-256, e a volta é 303 para a mesma lista", async () => {
    const resposta = await guardar(pedir(PDF(), { tipo: "boleto", ver: "pagas", loja: LOJA }), contexto);
    expect([resposta.status, resposta.headers.get("location"), resposta.headers.get("cache-control")]).toEqual([303, `/contas-a-pagar?ver=pagas&loja=${LOJA}&ok=documento_guardado`, "no-store"]);
    expect(cenario.enviados[0]).toMatchObject({ caminho: expect.stringMatching(new RegExp(`^org/${CONTA}/[0-9a-f-]{36}\\.pdf$`)), tipo: "application/pdf" });
    const enviado = cenario.enviados[0]?.bytes ?? new Uint8Array();
    expect(cenario.chamadas[0]).toEqual({
      nome: "conta_pagar_anexar",
      argumentos: { p_conta: CONTA, p_tipo: "boleto", p_descricao: null, p_caminho: cenario.enviados[0]?.caminho, p_sha256: createHash("sha256").update(enviado).digest("hex") },
    });
    expect(cenario.filtros).toEqual([`contas_a_pagar id=${CONTA}`]);
    expect(await destino(guardar(pedir(JPEG, { tipo: "outro", descricao: " Recibo do  aluguel " }), contexto))).toBe("/contas-a-pagar?ok=documento_guardado");
    expect(cenario.enviados[1]?.caminho).toMatch(/\.jpg$/);
    expect(cenario.chamadas[1]?.argumentos).toMatchObject({ p_tipo: "outro", p_descricao: "Recibo do aluguel" });
  });

  it("outra origem, conta que não é sua, tipo e descrição, arquivo errado ou grande demais: volta com a mensagem, sem gravar nada", async () => {
    expect(await destino(guardar(pedir(PDF(), undefined, "https://outro-site.com"), contexto))).toBe("status 403");
    expect(await destino(guardar(pedir(PDF()), { params: Promise.resolve({ id: "x" }) }))).toBe("status 403");
    cenario.linhas.contas_a_pagar = null;
    expect(await destino(guardar(pedir(PDF()), contexto))).toBe("/contas-a-pagar?erro=nao_encontrada");
    cenario.linhas.contas_a_pagar = { id: CONTA, organizacao_id: "org" };
    cenario.errosDasTabelas.contas_a_pagar = { code: "57014" };
    expect(await destino(guardar(pedir(PDF()), contexto))).toBe("/contas-a-pagar?erro=documento_falha");
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["contas a pagar: falha ao ler a conta do documento", { codigo: "57014" }]);
    delete cenario.errosDasTabelas.contas_a_pagar;
    expect(await destino(guardar(pedir(PDF(), { tipo: "contrato" }), contexto))).toBe("/contas-a-pagar?erro=documento_dados");
    expect(await destino(guardar(pedir(PDF(), { tipo: "outro" }), contexto))).toBe("/contas-a-pagar?erro=documento_dados");
    expect(await destino(guardar(pedir(PDF(), { tipo: "boleto", descricao: "ab" }), contexto))).toBe("/contas-a-pagar?erro=documento_dados");
    expect(await destino(guardar(pedir(new Blob(["<html></html>"])), contexto))).toBe("/contas-a-pagar?erro=documento_arquivo");
    expect(await destino(guardar(pedir(null), contexto))).toBe("/contas-a-pagar?erro=documento_arquivo");
    const grande = new Uint8Array(5 * 1024 * 1024 + 1);
    grande.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(await destino(guardar(pedir(new Blob([grande])), contexto))).toBe("/contas-a-pagar?erro=documento_grande");
    expect(cenario.enviados).toEqual([]);
    expect(cenario.chamadas).toEqual([]);
  });

  it("o Storage ou o banco recusando: a mensagem certa, e o registro leva só o código", async () => {
    cenario.envio = { error: { statusCode: "403" } };
    expect(await destino(guardar(pedir(PDF()), contexto))).toBe("/contas-a-pagar?erro=documento_permissao");
    cenario.envio = { error: { statusCode: "500" } };
    expect(await destino(guardar(pedir(PDF()), contexto))).toBe("/contas-a-pagar?erro=documento_falha");
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["contas a pagar: falha ao enviar o documento ao Storage", { codigo: "500" }]);
    expect(cenario.chamadas).toEqual([]);
    cenario.envio = { error: null };
    for (const [erro, mensagem] of [
      [{ code: "22023", message: "Esta conta já tem 20 documentos: retire um errado antes" }, "documento_limite"],
      [{ code: "22023", message: "O arquivo no Storage não é do formato informado" }, "documento_arquivo"],
      [{ code: "P0002", message: "O arquivo não chegou ao Storage" }, "documento_falha"],
      [{ code: "P0002", message: "Conta a pagar não encontrada para você" }, "nao_encontrada"],
      [{ code: "42501", message: "permission denied" }, "documento_permissao"],
    ] as const) {
      cenario.rpc = { data: null, error: { ...erro } };
      expect(await destino(guardar(pedir(PDF()), contexto)), erro.message).toBe(`/contas-a-pagar?erro=${mensagem}`);
    }
  });
});

describe("/contas-a-pagar/[id]/documentos/[documento]: abrir (FIN-004b)", () => {
  const ctx = (id = CONTA, documento = DOC) => ({ params: Promise.resolve({ id, documento }) });
  const pedido = () => new Request(`https://ora5g.com.br/contas-a-pagar/${CONTA}/documentos/${DOC}`);

  it("o documento vigente abre por um link assinado agora, por um minuto, e a resposta não fica guardada", async () => {
    const resposta = await abrir(pedido(), ctx());
    expect([resposta.status, resposta.headers.get("location"), resposta.headers.get("cache-control"), resposta.headers.get("referrer-policy")])
      .toEqual([303, "https://banco.exemplo/storage/v1/object/sign/contas/x?token=t", "no-store", "no-referrer"]);
    expect(cenario.assinados).toEqual([{ caminho: `org/${CONTA}/00000000-0000-4000-a000-000000000001.pdf`, validade: 60 }]);
    expect(cenario.filtros).toEqual([`conta_pagar_anexos id=${DOC}`, `conta_pagar_anexos conta_id=${CONTA}`]);
  });

  it("endereço estranho, documento de outra conta, que não é seu ou retirado: não encontrado; falha ao ler ou assinar: tente de novo", async () => {
    expect(await destino(abrir(pedido(), ctx("x")))).toBe("status 404");
    expect(await destino(abrir(pedido(), ctx(CONTA, "y")))).toBe("status 404");
    expect(cenario.filtros).toEqual([]);
    cenario.linhas.conta_pagar_anexos = null;
    expect(await destino(abrir(pedido(), ctx()))).toBe("status 404");
    cenario.linhas.conta_pagar_anexos = { caminho: "org/x/y.pdf", retirado_em: "2026-11-15T10:00:00Z" };
    expect(await destino(abrir(pedido(), ctx()))).toBe("status 404");
    expect(cenario.assinados).toEqual([]);
    cenario.errosDasTabelas.conta_pagar_anexos = { code: "57014" };
    const falha = await abrir(pedido(), ctx());
    expect([falha.status, await falha.text()]).toEqual([503, "Não deu para abrir o documento agora. Tente de novo em instantes."]);
    delete cenario.errosDasTabelas.conta_pagar_anexos;
    cenario.linhas.conta_pagar_anexos = { caminho: "org/x/y.pdf", retirado_em: null };
    cenario.assinatura = { data: null, error: { statusCode: "400" } };
    expect(await destino(abrir(pedido(), ctx()))).toBe("status 503");
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["contas a pagar: falha ao assinar o link do documento", { codigo: "400" }]);
  });
});
