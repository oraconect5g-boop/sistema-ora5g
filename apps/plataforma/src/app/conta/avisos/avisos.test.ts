// A tela "Avisos no celular" e as ações dela (lote PWA-b; ADR-014), com a sessão e o Supabase SIMULADOS. Quem decide é o
// banco (packages/banco/src/avisos-no-celular.test.ts); a inscrição de verdade, no navegador, é do roteiro de aceite.
// Endereços e chaves fictícios.
import { readFileSync } from "node:fs";

import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  respostas: {} as Record<string, { data: unknown; error: null | { code: string } }>,
  chamadas: [] as { nome: string; argumentos?: Record<string, unknown> }[],
}));
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: "00000000-0000-4000-8000-000000000001", email: "dono@teste.invalid" },
    supabase: {
      rpc: async (nome: string, argumentos?: Record<string, unknown>) => {
        cenario.chamadas.push({ nome, argumentos });
        return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
      },
    },
  }),
}));

import { inscreverEsteCelular, pararEsteCelular, pedirAvisoDeTeste } from "./acoes";
import AvisosNoCelularDaConta from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
function componentes(v: unknown, achados: { nome: string; props: Record<string, unknown> }[] = []) {
  if (Array.isArray(v)) for (const item of v) componentes(item, achados);
  else if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function") achados.push({ nome: v.type.name, props: v.props });
    for (const filho of Object.values(v.props)) componentes(filho, achados);
  }
  return achados;
}
const tela = async () => (await AvisosNoCelularDaConta()) as ReactElement;
const CHAVE_PUBLICA = Buffer.alloc(65, 4).toString("base64url");
const MINHAS = {
  celulares: [{ dispositivo: "Android · Chrome", criada_em: "2026-11-17T18:00:00Z", ultimo_aviso_em: null }],
  recebe: { desconto: true, nota: true, saida_caixa: true },
};
const INSCRICAO = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", expirationTime: null, keys: { p256dh: `B${"A".repeat(86)}`, auth: "x".repeat(22) } };

beforeEach(() => {
  cenario.respostas = { aviso_minhas_inscricoes: { data: MINHAS, error: null } };
  cenario.chamadas = [];
  vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY", CHAVE_PUBLICA);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("a tela Avisos no celular (PWA-b)", () => {
  it("diz que avisos a pessoa recebe, lista os celulares e entrega a chave pública ao componente do navegador", async () => {
    const arvore = await tela();
    const t = texto(arvore);
    for (const trecho of ["Avisos no celular", "avisos ligados", "um desconto para aprovar, uma nota para aprovar ou uma saída de caixa para autorizar",
      "Quem pediu não recebe o aviso do próprio pedido", "Android · Chrome", "nenhum aviso ainda", "Voltar para Minha conta"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(componentes(arvore).find((c) => c.nome === "AvisosNoCelular")?.props).toEqual({ chavePublica: CHAVE_PUBLICA });
  });

  it("sem permissão de aprovar, avisa que só o teste chega; sem a chave no ambiente, não oferece ligar", async () => {
    cenario.respostas.aviso_minhas_inscricoes = { data: { celulares: [], recebe: { desconto: false, nota: false, saida_caixa: false } }, error: null };
    vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY", "");
    const arvore = await tela();
    const t = texto(arvore);
    for (const trecho of ["avisos desligados", "nenhum pedido de aprovação chega para você", "Os avisos ainda não estão ligados neste ambiente", "Nenhum ainda."]) expect(t, trecho).toContain(trecho);
    expect(componentes(arvore).some((c) => c.nome === "AvisosNoCelular")).toBe(false);
  });

  it("banco sem a migration: avisa com calma; falha ou resposta fora da forma: página de falha, nunca lista vazia", async () => {
    cenario.respostas.aviso_minhas_inscricoes = { data: null, error: { code: "PGRST202" } };
    expect(texto(await tela())).toContain("ainda não estão disponíveis neste ambiente");
    cenario.respostas.aviso_minhas_inscricoes = { data: null, error: { code: "57014" } };
    await expect(tela()).rejects.toThrow();
    cenario.respostas.aviso_minhas_inscricoes = { data: { celulares: "x" }, error: null };
    await expect(tela()).rejects.toThrow();
  });
});

describe("o caminho até os avisos (PWA-b)", () => {
  it("o menu de todas as telas leva aos avisos: a lista Mais do celular e o menu do nome, no computador", () => {
    const molde = readFileSync(new URL("../../../componentes/MoldeReal.tsx", import.meta.url), "utf8");
    expect(molde.match(/href="\/conta\/avisos"/g)).toHaveLength(2);
    expect(readFileSync(new URL("../page.tsx", import.meta.url), "utf8")).toContain('href="/conta/avisos"');
  });
});

describe("as ações dos avisos (PWA-b)", () => {
  it("ligar: só a inscrição no formato vai ao banco, com o nome curto do aparelho", async () => {
    expect(await inscreverEsteCelular({ ...INSCRICAO, endpoint: "https://golpe.invalid/x" }, "Android · Chrome")).toEqual({ ok: false, erro: "formato" });
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.aviso_inscrever = { data: { inscricoes: 1 }, error: null };
    expect(await inscreverEsteCelular(INSCRICAO, "Android · Chrome")).toEqual({ ok: true });
    expect(cenario.chamadas).toEqual([{ nome: "aviso_inscrever", argumentos: {
      p_endpoint: INSCRICAO.endpoint, p_p256dh: INSCRICAO.keys.p256dh, p_auth: INSCRICAO.keys.auth, p_dispositivo: "Android · Chrome",
    } }]);
  });

  it("cada recusa do banco vira a mensagem; o erro inesperado vai para o log só com o código", async () => {
    for (const [codigo, erro] of [["42501", "sessao"], ["22023", "formato"], ["PGRST202", "indisponivel"], ["57014", "falha"]] as const) {
      cenario.respostas.aviso_inscrever = { data: null, error: { code: codigo } };
      expect(await inscreverEsteCelular(INSCRICAO, null), codigo).toEqual({ ok: false, erro });
    }
    expect(vi.mocked(console.error).mock.calls).toEqual([["avisos: falha ao ligar", { codigo: "57014" }]]);
    for (const [codigo, erro] of [["OR039", "sem_celular"], ["OR040", "espere"]] as const) {
      cenario.respostas.aviso_teste = { data: null, error: { code: codigo } };
      expect(await pedirAvisoDeTeste(), codigo).toEqual({ ok: false, erro });
    }
    cenario.respostas.aviso_teste = { data: { na_fila: true }, error: null };
    expect(await pedirAvisoDeTeste()).toEqual({ ok: true });
  });

  it("desligar: o celular que já não estava na lista conta como desligado; endereço fora do formato não vai ao banco", async () => {
    cenario.respostas.aviso_cancelar = { data: null, error: { code: "42501" } };
    expect(await pararEsteCelular(INSCRICAO.endpoint)).toEqual({ ok: true });
    cenario.respostas.aviso_cancelar = { data: null, error: { code: "57014" } };
    expect(await pararEsteCelular(INSCRICAO.endpoint)).toEqual({ ok: false, erro: "falha" });
    const antes = cenario.chamadas.length;
    expect(await pararEsteCelular(42)).toEqual({ ok: false, erro: "formato" });
    expect(cenario.chamadas.length).toBe(antes);
  });
});
