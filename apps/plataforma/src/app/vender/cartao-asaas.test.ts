// As ações do cartão pela Asaas no caixa (lote PAY-015b), com a sessão e o Supabase SIMULADOS: pedir o link e cancelar vão
// ao banco por UMA função cada; o erro do banco vira a mensagem; a venda com cartão pago não se cancela por aqui; o link
// esperando segura a conclusão. FICTÍCIOS.
import { beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({ rpc: [] as { nome: string; argumentos: unknown }[], erro: null as null | { code: string; message?: string } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (d: string) => { throw new Error(`redirecionou para ${d}`); } }));
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error {},
  obterSessao: async () => ({ supabase: { rpc: async (nome: string, argumentos: unknown) => { cenario.rpc.push({ nome, argumentos }); return { data: null, error: cenario.erro }; } } }),
}));

import { cancelarCartaoAsaas, cancelarVenda, concluirVenda, pedirCartaoAsaas } from "./acoes";

const VENDA = "00000000-0000-4000-8000-0000000000d1";
const CARTAO = "00000000-0000-4000-8000-0000000000e2";
const CHAVE = "00000000-0000-4000-8000-0000000000c1";
const enviar = (acao: (d: FormData) => Promise<unknown>, campos: Record<string, string>) => {
  const dados = new FormData();
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return acao(dados);
};
beforeEach(() => { cenario.rpc = []; cenario.erro = null; });

describe("as ações do cartão pela Asaas no caixa (PAY-015b)", () => {
  it("pedir o link: o valor em centavos e a chave do formulário; o valor fora da forma nem chama o banco", async () => {
    await expect(enviar(pedirCartaoAsaas, { venda: VENDA, valor: "49,90", chave: CHAVE })).rejects.toThrow("redirecionou para /vender");
    expect(cenario.rpc).toEqual([{ nome: "caixa_cartao_pedir", argumentos: { p_venda: VENDA, p_valor_centavos: 4_990, p_chave: CHAVE } }]);
    cenario.rpc = [];
    await expect(enviar(pedirCartaoAsaas, { venda: VENDA, valor: "", chave: CHAVE })).rejects.toThrow("erro=valor");
    await expect(enviar(pedirCartaoAsaas, { venda: "x", valor: "1,00", chave: CHAVE })).rejects.toThrow("erro=dados");
    await expect(enviar(cancelarCartaoAsaas, { cartao: "x" })).rejects.toThrow("erro=dados");
    expect(cenario.rpc).toEqual([]);
  });

  it("os erros do banco: desligado, passa do que falta e o link pago que não se cancela", async () => {
    cenario.erro = { code: "OR058" };
    await expect(enviar(pedirCartaoAsaas, { venda: VENDA, valor: "10,00", chave: CHAVE })).rejects.toThrow("erro=cartao_desligado");
    cenario.erro = { code: "OR009" };
    await expect(enviar(pedirCartaoAsaas, { venda: VENDA, valor: "10,00", chave: CHAVE })).rejects.toThrow("erro=cartao_passa");
    cenario.erro = { code: "OR048" };
    await expect(enviar(cancelarCartaoAsaas, { cartao: CARTAO })).rejects.toThrow("erro=cartao_pago");
    cenario.erro = null;
    await expect(enviar(cancelarCartaoAsaas, { cartao: CARTAO })).rejects.toThrow("redirecionou para /vender");
    expect(cenario.rpc.at(-1)).toEqual({ nome: "caixa_cartao_cancelar", argumentos: { p_cartao: CARTAO } });
  });

  it("concluir com o link esperando e cancelar a venda com cartão pago: a mensagem do cartão (a do Pix segue com a dele)", async () => {
    cenario.erro = { code: "OR059", message: "Há um cartão pela Asaas esperando: espere o pagamento ou cancele o link" };
    await expect(enviar(concluirVenda, { venda: VENDA, chave: CHAVE, pagamento_1_meio: "dinheiro", pagamento_1_valor: "10,00" })).rejects.toThrow("erro=cartao_esperando");
    cenario.erro = { code: "OR059", message: "Há um Pix pela Asaas esperando: espere o pagamento ou cancele o QR Code" };
    await expect(enviar(concluirVenda, { venda: VENDA, chave: CHAVE, pagamento_1_meio: "dinheiro", pagamento_1_valor: "10,00" })).rejects.toThrow("erro=pix_esperando");
    cenario.erro = { code: "OR048", message: "Esta venda tem cartão pela Asaas pago: conclua a venda; para desistir, o estorno é pelo painel da Asaas" };
    await expect(enviar(cancelarVenda, { venda: VENDA, motivo: "Cliente desistiu" })).rejects.toThrow("erro=cartao_pago");
    cenario.erro = { code: "OR009", message: "O cartão pela Asaas pago passa do total da venda: devolva a diferença pela Asaas ou ponha o item de volta" };
    await expect(enviar(concluirVenda, { venda: VENDA, chave: CHAVE, pagamento_1_meio: "dinheiro", pagamento_1_valor: "10,00" })).rejects.toThrow("erro=cartao_passa_do_total");
  });
});
