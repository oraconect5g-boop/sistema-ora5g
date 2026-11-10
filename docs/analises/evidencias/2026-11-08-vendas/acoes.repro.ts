// Copiar para apps/plataforma/src/app/vender/revisao-acoes-extra.test.ts.
// As ações reais são importadas; somente sessão, RPC e redirect são substituídos.
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../lib/acesso/sessao", () => ({ obterSessao: async () => ({ supabase: { rpc: mocks.rpc } }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import { abrirCaixa, aplicarDesconto } from "./acoes";
beforeEach(() => { mocks.rpc.mockReset(); mocks.rpc.mockResolvedValue({ data: "dentro_do_limite", error: null }); });
it("controle: fundo monetário válido chega à RPC em centavos", async () => {
  const f = new FormData(); f.set("fundo", "12,34");
  await expect(abrirCaixa(f)).rejects.toThrow("redirect:/vender");
  expect(mocks.rpc).toHaveBeenCalledWith("abrir_caixa", expect.objectContaining({ p_fundo: 1234 }));
});
it.each(["abc", "-1"])("fundo inválido %s não abre caixa com zero silenciosamente", async (texto) => {
  const f = new FormData(); f.set("fundo", texto);
  await abrirCaixa(f).catch(() => undefined);
  process.stdout.write(`EVIDENCIA fundo_invalido texto=${texto} rpc=${mocks.rpc.mock.calls.length} valor=${mocks.rpc.mock.calls[0]?.[1]?.p_fundo}\n`);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("desconto ilegível não apaga desconto existente com zero silenciosamente", async () => {
  const f = new FormData(); f.set("item", "82000000-0000-4000-8000-000000000001"); f.set("desconto", "abc");
  await aplicarDesconto(f).catch(() => undefined);
  process.stdout.write(`EVIDENCIA desconto_invalido rpc=${mocks.rpc.mock.calls.length} valor=${mocks.rpc.mock.calls[0]?.[1]?.p_desconto}\n`);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
