// A página "Segurança da conta" (lote ORG-007a: ORA-ORG-007), com a sessão e o Supabase SIMULADOS: o estado da
// verificação, os celulares que vão para a lista (só os do aplicativo, já confirmados) e o cadastro (o primeiro liga a
// verificação). O cadastro e a retirada rodam no navegador, pela API do Supabase Auth (Celulares.tsx).
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  fatores: [] as { id: string; friendly_name: string; factor_type: string; status: string; created_at: string }[],
  comErro: false,
  configurado: true,
  bancoComSegundoFator: true,
}));

vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error {},
  obterSessao: async () => ({
    usuario: { id: "00000000-0000-4000-8000-000000000001", email: "dono@teste.invalid" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: null, unidade_nome: null, turno_termina_em: null, ...(cenario.bancoComSegundoFator ? { segundo_fator_pendente: false } : {}) },
    supabase: { auth: { mfa: { listFactors: async () => (cenario.comErro ? { data: null, error: { code: "unexpected_failure" } } : { data: { all: cenario.fatores }, error: null }) } } },
  }),
}));
vi.mock("../../../lib/supabase/configuracao", () => ({
  configuracaoSupabase: () => (cenario.configurado ? { url: "https://exemplo.supabase.invalid", chavePublica: "chave-publica-de-teste" } : null),
}));

import Seguranca from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
function elementos(v: unknown, criterio: (tipo: unknown, props: Record<string, unknown>) => boolean, achados: { tipo: string; props: Record<string, unknown> }[] = []) {
  if (Array.isArray(v)) for (const item of v) elementos(item, criterio, achados);
  else if (isValidElement<Record<string, unknown>>(v)) {
    if (criterio(v.type, v.props)) achados.push({ tipo: typeof v.type === "function" ? v.type.name : String(v.type), props: v.props });
    for (const filho of Object.values(v.props)) elementos(filho, criterio, achados);
  } else if (v && typeof v === "object") for (const item of Object.values(v)) elementos(item, criterio, achados);
  return achados;
}
const componentes = (arvore: unknown) =>
  elementos(arvore, (tipo) => typeof tipo === "function" && ["CadastrarCelular", "ListaDeCelulares"].includes(tipo.name)).map((e) => e.tipo);

beforeEach(() => {
  cenario.fatores = [];
  cenario.comErro = false;
  cenario.configurado = true;
  cenario.bancoComSegundoFator = true;
});

describe("Segurança da conta (ORG-007a)", () => {
  it("sem celular: a verificação desligada e o cadastro que liga (o primeiro)", async () => {
    const arvore = (await Seguranca()) as ReactElement;
    expect(texto(arvore)).toContain("verificação desligada");
    expect(componentes(arvore)).toEqual(["CadastrarCelular"]);
    expect(elementos(arvore, (tipo) => typeof tipo === "function" && tipo.name === "CadastrarCelular")[0]?.props).toMatchObject({ primeiro: true, supabaseUrl: "https://exemplo.supabase.invalid" });
  });

  it("com celulares: a verificação ligada, a lista só com os confirmados do aplicativo e o cadastro de outro (de reserva)", async () => {
    cenario.fatores = [
      { id: "f2", friendly_name: "Reserva", factor_type: "totp", status: "verified", created_at: "2026-11-15T10:00:00Z" },
      { id: "f1", friendly_name: "Meu celular", factor_type: "totp", status: "verified", created_at: "2026-11-14T10:00:00Z" },
      { id: "f3", friendly_name: "Tentativa", factor_type: "totp", status: "unverified", created_at: "2026-11-15T11:00:00Z" },
    ];
    const arvore = (await Seguranca()) as ReactElement;
    expect(texto(arvore)).toContain("verificação ligada");
    expect(componentes(arvore)).toEqual(["ListaDeCelulares", "CadastrarCelular"]);
    const lista = elementos(arvore, (tipo) => typeof tipo === "function" && tipo.name === "ListaDeCelulares")[0]?.props.celulares as { id: string; nome: string }[];
    expect(lista.map((c) => [c.id, c.nome])).toEqual([["f1", "Meu celular"], ["f2", "Reserva"]]);
    expect(elementos(arvore, (tipo) => typeof tipo === "function" && tipo.name === "CadastrarCelular")[0]?.props).toMatchObject({ primeiro: false });
  });

  it("sem a configuração do Supabase, ou num banco que ainda não exige o código: o aviso, sem cadastro; falha do serviço vira a página de erro", async () => {
    cenario.configurado = false;
    let arvore = (await Seguranca()) as ReactElement;
    expect(texto(arvore)).toContain("ainda não está disponível neste ambiente");
    expect(componentes(arvore)).toEqual([]);
    // Banco sem a migration do segundo fator: ligar não protegeria nada, então não se oferece; quem já tem celular o vê e pode tirar.
    cenario.configurado = true;
    cenario.bancoComSegundoFator = false;
    arvore = (await Seguranca()) as ReactElement;
    expect(componentes(arvore)).toEqual([]);
    cenario.fatores = [{ id: "f1", friendly_name: "Meu celular", factor_type: "totp", status: "verified", created_at: "2026-11-14T10:00:00Z" }];
    arvore = (await Seguranca()) as ReactElement;
    expect(componentes(arvore)).toEqual(["ListaDeCelulares"]);
    cenario.comErro = true;
    await expect(Seguranca()).rejects.toThrow();
  });
});
