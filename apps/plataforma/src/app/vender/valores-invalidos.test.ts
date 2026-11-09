// REV-050 / #52 (prova do Codex na PR #33, 2026-11-08-vendas/acoes.repro.ts), agora regressão
// permanente: valor vazio ou ilegível não chega à RPC como zero. As ações reais são importadas; só
// a sessão, a RPC e o redirect são substituídos.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../lib/acesso/sessao", () => ({ obterSessao: async () => ({ supabase: { rpc: mocks.rpc } }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));

import { abrirCaixa, aplicarDesconto } from "./acoes";

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: "dentro_do_limite", error: null });
});
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
};

describe("fundo de troco", () => {
  it("controle: valor válido chega à RPC em centavos; 0,00 é zero de propósito", async () => {
    await expect(abrirCaixa(formulario({ fundo: "12,34" }))).rejects.toThrow("redirect:/vender");
    expect(mocks.rpc).toHaveBeenCalledWith("abrir_caixa", expect.objectContaining({ p_fundo: 1234 }));
    await expect(abrirCaixa(formulario({ fundo: "0,00", voltar: "/caixa" }))).rejects.toThrow("redirect:/caixa");
    expect(mocks.rpc).toHaveBeenLastCalledWith("abrir_caixa", expect.objectContaining({ p_fundo: 0 }));
  });

  it.each(["abc", "-1", "", "1,001"])("%j não abre caixa com zero: volta com erro de valor, sem chamar o banco", async (texto) => {
    await expect(abrirCaixa(formulario({ fundo: texto }))).rejects.toThrow("redirect:/vender?erro=valor");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("desconto", () => {
  const item = "82000000-0000-4000-8000-000000000001";
  it("controle: 0,00 tira o desconto de propósito; valor válido chega em centavos", async () => {
    await expect(aplicarDesconto(formulario({ item, desconto: "0,00" }))).rejects.toThrow("redirect:/vender?desconto=ok");
    expect(mocks.rpc).toHaveBeenCalledWith("aplicar_desconto", { p_item: item, p_desconto: 0 });
    await expect(aplicarDesconto(formulario({ item, desconto: "5,00" }))).rejects.toThrow("redirect:/vender?desconto=ok");
    expect(mocks.rpc).toHaveBeenLastCalledWith("aplicar_desconto", { p_item: item, p_desconto: 500 });
  });

  it.each(["abc", "", "-2"])("%j não apaga o desconto atual: volta com erro, sem chamar o banco", async (texto) => {
    await expect(aplicarDesconto(formulario({ item, desconto: texto }))).rejects.toThrow("redirect:/vender?erro=valor");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
