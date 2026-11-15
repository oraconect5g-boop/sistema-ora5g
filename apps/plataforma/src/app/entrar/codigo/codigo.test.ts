// A tela do código do segundo fator e a ação que confere (lote ORG-007a: ORA-ORG-007), com o Supabase SIMULADO: nenhuma
// credencial e nenhuma rede. Quem exige o código é o banco (packages/banco/src/segundo-fator.test.ts); aqui, quando a
// tela aparece, qual celular vai ao Supabase e a mensagem de cada recusa.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  usuario: null as { id: string } | null,
  pendente: true as boolean | undefined,
  situacaoComErro: false,
  fatores: [] as { id: string; friendly_name: string; factor_type: string; status: string; created_at: string }[],
  fatoresComErro: false,
  recusa: null as null | { code?: string; status?: number },
  conferidos: [] as { factorId: string; code: string }[],
}));

vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
vi.mock("../../../lib/supabase/servidor", () => ({
  clienteSupabaseServidor: async () => ({
    auth: {
      getUser: async () => ({ data: { user: cenario.usuario }, error: null }),
      signOut: async () => ({ error: null }),
      mfa: {
        listFactors: async () => (cenario.fatoresComErro ? { data: null, error: { code: "unexpected_failure" } } : { data: { all: cenario.fatores }, error: null }),
        challengeAndVerify: async (p: { factorId: string; code: string }) => {
          cenario.conferidos.push(p);
          return { data: null, error: cenario.recusa };
        },
      },
    },
    rpc: () => ({
      maybeSingle: async () => (cenario.situacaoComErro
        ? { data: null, error: { code: "57014" } }
        : { data: { usuario_ativo: true, sessao_no_turno: true, ...(cenario.pendente === undefined ? {} : { segundo_fator_pendente: cenario.pendente }) }, error: null }),
    }),
  }),
}));

import { confirmarCodigo } from "./acoes";
import Codigo from "./page";

const PRINCIPAL = { id: "00000000-0000-4000-8000-0000000000f1", friendly_name: "Meu celular", factor_type: "totp", status: "verified", created_at: "2026-11-14T10:00:00Z" };
const RESERVA = { id: "00000000-0000-4000-8000-0000000000f2", friendly_name: "Reserva", factor_type: "totp", status: "verified", created_at: "2026-11-15T10:00:00Z" };
const PELA_METADE = { id: "00000000-0000-4000-8000-0000000000f3", friendly_name: "Tentativa", factor_type: "totp", status: "unverified", created_at: "2026-11-15T11:00:00Z" };

async function destino(acao: Promise<unknown>) {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("não redirecionou");
}
function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
function elementos(v: unknown, criterio: (props: Record<string, unknown>) => boolean, achados: Record<string, unknown>[] = []) {
  if (Array.isArray(v)) for (const item of v) elementos(item, criterio, achados);
  else if (isValidElement<Record<string, unknown>>(v)) {
    if (criterio(v.props)) achados.push(v.props);
    for (const filho of Object.values(v.props)) elementos(filho, criterio, achados);
  } else if (v && typeof v === "object") for (const item of Object.values(v)) elementos(item, criterio, achados);
  return achados;
}
const tela = async (parametros: Record<string, string> = {}) => (await Codigo({ searchParams: Promise.resolve(parametros) })) as ReactElement;
const destinoDaTela = (parametros: Record<string, string>) => destino(Codigo({ searchParams: Promise.resolve(parametros) }));
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

beforeEach(() => {
  cenario.usuario = { id: "00000000-0000-4000-8000-000000000001" };
  cenario.pendente = true;
  cenario.situacaoComErro = false;
  cenario.fatores = [PRINCIPAL, PELA_METADE];
  cenario.fatoresComErro = false;
  cenario.recusa = null;
  cenario.conferidos = [];
});

describe("a tela do código (ORG-007a)", () => {
  it("só aparece com o código pendente: sem login vai ao /entrar; sem pendência, ou num banco sem a migration, segue para a loja", async () => {
    cenario.usuario = null;
    expect(await destino(tela())).toBe("/entrar");
    cenario.usuario = { id: "u1" };
    for (const pendente of [false, undefined]) {
      cenario.pendente = pendente;
      expect(await destino(tela()), String(pendente)).toBe("/escolher-loja");
    }
  });

  it("falha do serviço não vira tela (nem 'sem código'): a página de erro", async () => {
    cenario.situacaoComErro = true;
    await expect(tela()).rejects.toThrow(/situacao_da_sessao/);
    cenario.situacaoComErro = false;
    cenario.fatoresComErro = true;
    await expect(tela()).rejects.toThrow(/mfa/);
  });

  it("um celular: ele vai escondido no formulário; dois: a escolha, com o primeiro marcado; o cadastro pela metade não aparece", async () => {
    let arvore = await tela();
    expect(elementos(arvore, (p) => p.name === "celular").map((p) => [p.type, p.value])).toEqual([["hidden", PRINCIPAL.id]]);
    expect(elementos(arvore, (p) => p.name === "codigo")[0]).toMatchObject({ inputMode: "numeric", autoComplete: "one-time-code", required: true });
    cenario.fatores = [RESERVA, PELA_METADE, PRINCIPAL];
    arvore = await tela();
    expect(elementos(arvore, (p) => p.name === "celular").map((p) => [p.type, p.value, p.defaultChecked])).toEqual([["radio", PRINCIPAL.id, true], ["radio", RESERVA.id, false]]);
    expect(texto(arvore)).toContain("Qual celular está com você?");
    expect(texto(arvore)).not.toContain("Tentativa");
  });

  it("sem nenhum celular do aplicativo: o aviso para pedir ao dono, e só o sair", async () => {
    cenario.fatores = [PELA_METADE];
    const arvore = await tela();
    expect(texto(arvore)).toContain("nenhum celular com aplicativo autenticador está cadastrado");
    expect(elementos(arvore, (p) => p.name === "codigo")).toEqual([]);
  });

  it("vindo da troca de senha (a recuperação pelo e-mail): o código e, depois, a senha; sem pendência, direto para a senha", async () => {
    expect(elementos(await tela({ depois: "senha" }), (p) => p.name === "depois").map((p) => p.value)).toEqual(["senha"]);
    expect(elementos(await tela({ depois: "https://outro.exemplo" }), (p) => p.name === "depois")).toEqual([]);
    cenario.pendente = false;
    expect(await destinoDaTela({ depois: "senha" })).toBe("/conta/senha");
  });

  it("a mensagem vem do catálogo; chave estranha não vira aviso", async () => {
    expect(texto(await tela({ erro: "codigo" }))).toContain("Código errado ou vencido");
    const limpa = texto(await tela());
    for (const estranha of ["__proto__", "constructor", "qualquer"]) expect(texto(await tela({ erro: estranha }))).toBe(limpa);
  });
});

describe("a conferência do código (ORG-007a)", () => {
  it("código fora do formato nem vai ao Supabase", async () => {
    for (const codigo of ["12345", "abcdef", ""]) expect(await destino(confirmarCodigo(formulario({ codigo })))).toBe("/entrar/codigo?erro=formato");
    expect(cenario.conferidos).toEqual([]);
  });

  it("com um celular, vai ele; com dois, o escolhido; um id que não é dos cadastrados (ou o pela metade) não vale", async () => {
    expect(await destino(confirmarCodigo(formulario({ codigo: "123 456" })))).toBe("/escolher-loja");
    expect(cenario.conferidos).toEqual([{ factorId: PRINCIPAL.id, code: "123456" }]);
    cenario.fatores = [PRINCIPAL, RESERVA, PELA_METADE];
    cenario.conferidos = [];
    expect(await destino(confirmarCodigo(formulario({ codigo: "654321", celular: RESERVA.id })))).toBe("/escolher-loja");
    expect(cenario.conferidos).toEqual([{ factorId: RESERVA.id, code: "654321" }]);
    for (const celular of [PELA_METADE.id, "00000000-0000-4000-8000-0000000000ff", ""]) {
      expect(await destino(confirmarCodigo(formulario({ codigo: "654321", celular }))), celular).toBe("/entrar/codigo?erro=celular");
    }
    expect(cenario.conferidos).toHaveLength(1);
  });

  it("vindo da troca de senha: conferido, volta para a senha; recusado, a mensagem e o mesmo destino", async () => {
    expect(await destino(confirmarCodigo(formulario({ codigo: "123456", depois: "senha" })))).toBe("/conta/senha");
    cenario.recusa = { code: "mfa_verification_failed", status: 422 };
    expect(await destino(confirmarCodigo(formulario({ codigo: "123456", depois: "senha" })))).toBe("/entrar/codigo?erro=codigo&depois=senha");
    expect(await destino(confirmarCodigo(formulario({ codigo: "12", depois: "senha" })))).toBe("/entrar/codigo?erro=formato&depois=senha");
    expect(await destino(confirmarCodigo(formulario({ codigo: "123456", depois: "/inicio" })))).toBe("/entrar/codigo?erro=codigo");
  });

  it("cada recusa do Supabase volta com a sua mensagem, e nenhuma vira entrada; sem login, volta ao /entrar", async () => {
    for (const [recusa, erro] of [[{ code: "mfa_verification_failed", status: 422 }, "codigo"], [{ code: "mfa_challenge_expired" }, "vencido"], [{ code: "over_request_rate_limit", status: 429 }, "muitas"], [{ status: 500 }, "falha"]] as const) {
      cenario.recusa = recusa;
      expect(await destino(confirmarCodigo(formulario({ codigo: "123456" }))), erro).toBe(`/entrar/codigo?erro=${erro}`);
    }
    cenario.recusa = null;
    cenario.fatoresComErro = true;
    expect(await destino(confirmarCodigo(formulario({ codigo: "123456" })))).toBe("/entrar/codigo?erro=falha");
    cenario.usuario = null;
    expect(await destino(confirmarCodigo(formulario({ codigo: "123456" })))).toBe("/entrar");
  });
});
