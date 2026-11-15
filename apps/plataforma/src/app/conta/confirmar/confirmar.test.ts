// A tela da confirmação de senha recente e as ações dela (lote ORG-006b: ORA-ORG-006), com o Supabase SIMULADO: nenhuma
// credencial e nenhuma rede. E as ações sensíveis (equipe, caixa, aprovação de desconto e nota) levando à confirmação
// quando o banco pede (OR033). Quem exige é o banco (packages/banco/src/confirmacao-recente.test.ts).
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const cenario = vi.hoisted(() => ({
  usuario: null as { id: string; email?: string } | null,
  pendente: false,
  unidade: null as string | null,
  situacaoComErro: false,
  fatores: [] as { id: string; friendly_name: string; factor_type: string; status: string; created_at: string }[],
  recusaDaSenha: null as null | { code?: string; status?: number },
  recusaDoCodigo: null as null | { code?: string; status?: number },
  chamadas: [] as { nome: string; argumentos: unknown }[],
  respostaDoBanco: { data: null, error: { code: "OR033", message: "Confirme a senha para continuar" } } as { data: unknown; error: null | { code: string; message?: string } },
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
const supabaseSimulado = {
  auth: {
    getUser: async () => ({ data: { user: cenario.usuario }, error: null }),
    signInWithPassword: async (p: unknown) => { cenario.chamadas.push({ nome: "signInWithPassword", argumentos: p }); return { data: null, error: cenario.recusaDaSenha }; },
    mfa: {
      listFactors: async () => ({ data: { all: cenario.fatores }, error: null }),
      challengeAndVerify: async (p: unknown) => { cenario.chamadas.push({ nome: "challengeAndVerify", argumentos: p }); return { data: null, error: cenario.recusaDoCodigo }; },
    },
  },
  rpc: (nome: string, argumentos?: unknown) => {
    if (nome === "situacao_da_sessao") {
      return { maybeSingle: async () => (cenario.situacaoComErro ? { data: null, error: { code: "57014" } } : { data: { usuario_ativo: true, sessao_no_turno: true, unidade_id: cenario.unidade, segundo_fator_pendente: cenario.pendente }, error: null }) };
    }
    cenario.chamadas.push({ nome, argumentos });
    return Object.assign(Promise.resolve(nome === "selecionar_unidade" ? { data: true, error: null } : cenario.respostaDoBanco), { maybeSingle: async () => cenario.respostaDoBanco });
  },
};
vi.mock("../../../lib/supabase/servidor", () => ({ clienteSupabaseServidor: async () => supabaseSimulado }));
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error {},
  obterSessao: async () => ({ supabase: supabaseSimulado, usuario: cenario.usuario, situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA } }),
}));

import { conferirCaixa, decidirAprovacao, decidirSaida } from "../../caixa/acoes";
import { alterarSituacao, cancelarConvite, encerrarVinculo, repetirConvite } from "../../equipe/acoes";
import { decidirNota } from "../../notas/acoes";
import { confirmarComCodigo, confirmarComSenha } from "./acoes";
import Confirmar from "./page";

const UM = "00000000-0000-4000-9000-0000000000e1";
const CELULAR = { id: "00000000-0000-4000-8000-0000000000f1", friendly_name: "Meu celular", factor_type: "totp", status: "verified", created_at: "2026-11-14T10:00:00Z" };
async function destino(acao: Promise<unknown>) {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("não redirecionou");
}
function elementos(v: unknown, criterio: (p: Record<string, unknown>) => boolean, achados: Record<string, unknown>[] = []) {
  if (Array.isArray(v)) for (const x of v) elementos(x, criterio, achados);
  else if (isValidElement<Record<string, unknown>>(v)) {
    if (criterio(v.props)) achados.push(v.props);
    for (const filho of Object.values(v.props)) elementos(filho, criterio, achados);
  } else if (v && typeof v === "object") for (const x of Object.values(v)) elementos(x, criterio, achados);
  return achados;
}
function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async (parametros: Record<string, string>) => (await Confirmar({ searchParams: Promise.resolve(parametros) })) as ReactElement;
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

beforeEach(() => {
  cenario.usuario = { id: "00000000-0000-4000-8000-000000000001", email: "gerente@teste.invalid" };
  cenario.pendente = false;
  cenario.unidade = LOJA;
  cenario.situacaoComErro = false;
  cenario.fatores = [];
  cenario.recusaDaSenha = null;
  cenario.recusaDoCodigo = null;
  cenario.chamadas = [];
  cenario.respostaDoBanco = { data: null, error: { code: "OR033", message: "Confirme a senha para continuar" } };
});

describe("a tela de confirmação (ORG-006b)", () => {
  it("sem o segundo fator, pede a senha; com ele, o código do celular; a volta vai junto, só se for de uma tela conhecida", async () => {
    let arvore = await tela({ volta: "/equipe" });
    expect(elementos(arvore, (p) => p.name === "volta").map((p) => p.value)).toEqual(["/equipe"]);
    expect(elementos(arvore, (p) => p.classe !== undefined).length).toBe(1); // o campo da senha
    expect(elementos(arvore, (p) => p.name === "codigo")).toEqual([]);
    cenario.fatores = [CELULAR];
    arvore = await tela({ volta: "https://outro.exemplo" });
    expect(elementos(arvore, (p) => p.name === "volta").map((p) => p.value)).toEqual(["/inicio"]);
    expect(elementos(arvore, (p) => p.name === "codigo")[0]).toMatchObject({ autoComplete: "one-time-code", inputMode: "numeric" });
    expect(elementos(arvore, (p) => p.name === "celular").map((p) => [p.type, p.value])).toEqual([["hidden", CELULAR.id]]);
    expect(texto(await tela({ volta: "/caixa", erro: "credenciais" }))).toContain("Senha incorreta.");
  });

  it("sem login vai ao /entrar; com o código do segundo fator pendente, primeiro o código; falha do serviço não vira tela", async () => {
    cenario.pendente = true;
    expect(await destino(tela({ volta: "/caixa" }))).toBe("/entrar/codigo");
    cenario.usuario = null;
    expect(await destino(tela({ volta: "/caixa" }))).toBe("/entrar");
    cenario.usuario = { id: "u1", email: "x@teste.invalid" };
    cenario.situacaoComErro = true;
    await expect(tela({ volta: "/caixa" })).rejects.toThrow();
  });

  it("a senha: confirmada, entra de novo com o e-mail da pessoa, volta para a mesma loja e para a tela; recusada, a mensagem neutra", async () => {
    expect(await destino(confirmarComSenha(formulario({ volta: "/caixa", senha: "senha-certa-123" })))).toBe("/caixa");
    expect(cenario.chamadas).toEqual([
      { nome: "signInWithPassword", argumentos: { email: "gerente@teste.invalid", password: "senha-certa-123" } },
      { nome: "selecionar_unidade", argumentos: { p_unidade: LOJA } },
    ]);
    cenario.chamadas = [];
    expect(await destino(confirmarComSenha(formulario({ volta: "/caixa", senha: "" })))).toBe("/conta/confirmar?volta=%2Fcaixa&erro=senha");
    expect(cenario.chamadas).toEqual([]);
    for (const [recusa, erro] of [[{ code: "invalid_credentials", status: 400 }, "credenciais"], [{ code: "over_request_rate_limit", status: 429 }, "muitas"], [{ code: "user_banned", status: 403 }, "bloqueado"]] as const) {
      cenario.recusaDaSenha = recusa;
      expect(await destino(confirmarComSenha(formulario({ volta: "/equipe", senha: "errada" }))), erro).toBe(`/conta/confirmar?volta=%2Fequipe&erro=${erro}`);
    }
    expect(cenario.chamadas.some((c) => c.nome === "selecionar_unidade")).toBe(false);
    // Volta de fora não sai do sistema; sem loja escolhida, não escolhe nenhuma.
    cenario.recusaDaSenha = null;
    cenario.unidade = null;
    cenario.chamadas = [];
    expect(await destino(confirmarComSenha(formulario({ volta: "https://outro.exemplo", senha: "senha-certa-123" })))).toBe("/inicio");
    expect(cenario.chamadas.map((c) => c.nome)).toEqual(["signInWithPassword"]);
  });

  it("o código: confirmado na mesma sessão, volta; o formato e as recusas voltam com a mensagem", async () => {
    cenario.fatores = [CELULAR];
    expect(await destino(confirmarComCodigo(formulario({ volta: "/notas", codigo: "123 456" })))).toBe("/notas");
    expect(cenario.chamadas).toEqual([{ nome: "challengeAndVerify", argumentos: { factorId: CELULAR.id, code: "123456" } }]);
    expect(await destino(confirmarComCodigo(formulario({ volta: "/notas", codigo: "12" })))).toBe("/conta/confirmar?volta=%2Fnotas&erro=codigo");
    for (const [recusa, erro] of [[{ code: "mfa_verification_failed", status: 422 }, "codigo"], [{ code: "over_request_rate_limit", status: 429 }, "muitas"], [{ status: 500 }, "falha"]] as const) {
      cenario.recusaDoCodigo = recusa;
      expect(await destino(confirmarComCodigo(formulario({ volta: "/notas", codigo: "123456" }))), erro).toBe(`/conta/confirmar?volta=%2Fnotas&erro=${erro}`);
    }
  });
});

describe("as ações sensíveis levam à confirmação quando o banco pede (ORG-006b)", () => {
  it("equipe, caixa, saída do caixa, aprovação de desconto e nota: OR033 vira a confirmação, com a volta para a tela da ação", async () => {
    const casos: [Promise<unknown>, string][] = [
      [encerrarVinculo(formulario({ vinculo: UM, motivo: "Saiu da empresa" })), "/equipe"],
      [alterarSituacao(formulario({ usuario: UM, situacao: "bloqueado", motivo: "Celular perdido" })), "/equipe"],
      [cancelarConvite(formulario({ convite: UM, motivo: "E-mail errado" })), "/equipe"],
      [repetirConvite(formulario({ convite: UM })), "/equipe"],
      [conferirCaixa(formulario({ caixa: UM })), "/caixa"],
      [decidirSaida(formulario({ saida: UM, decisao: "autorizar" })), "/caixa"],
      [decidirAprovacao(formulario({ pedido: UM, decisao: "aprovar" })), "/aprovacoes"],
      [decidirNota(formulario({ pedido: UM, decisao: "aprovar" })), "/notas"],
    ];
    for (const [acao, volta] of casos) expect(await destino(acao), volta).toBe(`/conta/confirmar?volta=${encodeURIComponent(volta)}`);
  });

  it("outra recusa continua com a mensagem de sempre (a confirmação é só para a OR033)", async () => {
    cenario.respostaDoBanco = { data: null, error: { code: "42501", message: "Sem permissão" } };
    expect(await destino(conferirCaixa(formulario({ caixa: UM })))).toBe("/caixa?erro=sem_permissao");
    expect(await destino(encerrarVinculo(formulario({ vinculo: UM, motivo: "Saiu da empresa" })))).toMatch(/^\/equipe\?erro=/);
  });
});
