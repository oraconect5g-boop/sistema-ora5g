// As ações do Pix pela Asaas no caixa (lote PAY-015a), com a sessão e o Supabase SIMULADOS: pedir o QR e cancelar vão ao
// banco por UMA função cada; o erro do banco vira a mensagem; a venda com Pix pago não se cancela por aqui. FICTÍCIOS.
import { beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({ rpc: [] as { nome: string; argumentos: unknown }[], erro: null as null | { code: string; message?: string } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (d: string) => { throw new Error(`redirecionou para ${d}`); } }));
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error {},
  obterSessao: async () => ({ supabase: { rpc: async (nome: string, argumentos: unknown) => { cenario.rpc.push({ nome, argumentos }); return { data: null, error: cenario.erro }; } } }),
}));

import { cancelarPixAsaas, cancelarVenda, pedirPixAsaas } from "./acoes";

const VENDA = "00000000-0000-4000-8000-0000000000d1";
const PIX = "00000000-0000-4000-8000-0000000000e1";
const CHAVE = "00000000-0000-4000-8000-0000000000c1";
const enviar = (acao: (d: FormData) => Promise<unknown>, campos: Record<string, string>) => {
  const dados = new FormData();
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return acao(dados);
};
beforeEach(() => { cenario.rpc = []; cenario.erro = null; });

describe("as ações do Pix pela Asaas no caixa (PAY-015a)", () => {
  it("pedir o QR: o valor em centavos e a chave do formulário; o valor fora da forma nem chama o banco", async () => {
    await expect(enviar(pedirPixAsaas, { venda: VENDA, valor: "49,90", chave: CHAVE })).rejects.toThrow("redirecionou para /vender");
    expect(cenario.rpc).toEqual([{ nome: "caixa_pix_pedir", argumentos: { p_venda: VENDA, p_valor_centavos: 4_990, p_chave: CHAVE } }]);
    cenario.rpc = [];
    await expect(enviar(pedirPixAsaas, { venda: VENDA, valor: "", chave: CHAVE })).rejects.toThrow("erro=valor");
    await expect(enviar(pedirPixAsaas, { venda: "x", valor: "1,00", chave: CHAVE })).rejects.toThrow("erro=dados");
    expect(cenario.rpc).toEqual([]);
  });

  it("os erros do banco: desligado, passa do que falta e o QR pago que não se cancela", async () => {
    cenario.erro = { code: "OR058" };
    await expect(enviar(pedirPixAsaas, { venda: VENDA, valor: "10,00", chave: CHAVE })).rejects.toThrow("erro=pix_desligado");
    cenario.erro = { code: "OR009" };
    await expect(enviar(pedirPixAsaas, { venda: VENDA, valor: "10,00", chave: CHAVE })).rejects.toThrow("erro=pix_passa");
    cenario.erro = { code: "OR048" };
    await expect(enviar(cancelarPixAsaas, { pix: PIX })).rejects.toThrow("erro=pix_pago");
    cenario.erro = null;
    await expect(enviar(cancelarPixAsaas, { pix: PIX })).rejects.toThrow("redirecionou para /vender");
    expect(cenario.rpc.at(-1)).toEqual({ nome: "caixa_pix_cancelar", argumentos: { p_pix: PIX } });
  });

  it("cancelar a venda com Pix pago: a mensagem do Pix (o OR048 do pedido do site segue com a dele)", async () => {
    cenario.erro = { code: "OR048", message: "Esta venda tem Pix pela Asaas pago: conclua a venda; para desistir, o estorno é pelo painel da Asaas" };
    await expect(enviar(cancelarVenda, { venda: VENDA, motivo: "Cliente desistiu" })).rejects.toThrow("erro=pix_pago");
    cenario.erro = { code: "OR048", message: "O pedido desta venda foi pago pelo site" };
    await expect(enviar(cancelarVenda, { venda: VENDA, motivo: "Cliente desistiu" })).rejects.toThrow("erro=pago_pelo_site");
  });
});
