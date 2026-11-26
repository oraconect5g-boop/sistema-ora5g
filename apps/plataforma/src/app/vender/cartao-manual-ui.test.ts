import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LinhaNaTela, OpcaoDeMeio } from "../../lib/vendas/formas-de-pagamento";
import { FormasDePagamento } from "./FormasDePagamento";

const cenario = vi.hoisted(() => ({ estados: [] as unknown[] }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (inicial: unknown) => [cenario.estados.shift() ?? inicial, vi.fn()],
}));

const credito: OpcaoDeMeio = { meio: "credito_manual", nome: "Crédito na maquininha", financeira: false,
  comprovante: true, maximoDeParcelas: 18, provedor: null, aceitaTroco: false, podeSerEntrada: true };
const linha: LinhaNaTela = { chave: 1, meio: "credito_manual", valor: "80,00", parcelas: "1", comprovante: "", terminal: "test-mp", entrada: false };

function tela(mudanca: Partial<LinhaNaTela> = {}, comTerminais = true) {
  cenario.estados = [[{ ...linha, ...mudanca }], false, 2];
  return renderToStaticMarkup(FormasDePagamento({ total: 8000, valorDosCelulares: 0, opcoes: [credito], terminais: comTerminais ? [
    { id: "test-mp", provedor: "mercado_pago", rotulo: "Mercado Pago" },
    { id: "test-pp", provedor: "picpay", rotulo: "PicPay" },
  ] : [] }));
}

beforeEach(() => { cenario.estados = []; });
describe("campo de cartão no PDV", () => {
  it("separa maquininha e bandeira, limita Simp a 6x e não mostra Simp no PicPay", () => {
    const simp = tela({ bandeira: "simp", parcelas: "6" });
    expect(simp).toContain('name="pagamento_1_terminal"');
    expect(simp).toContain('name="pagamento_1_bandeira_cartao"');
    expect(simp).toContain('value="cartao_mercado_pago"');
    expect(simp).toContain('value="6" selected=""');
    expect(simp).not.toContain('value="7"');
    expect(simp).toContain("(se diferente)");
    const picpay = tela({ terminal: "test-pp", bandeira: "visa" });
    expect(picpay).not.toContain('value="simp"');
    expect(picpay).toContain('value="18"');
    expect(picpay).not.toContain('value="19"');
  });
  it("exige o total do terminal a partir de 13x e informa o acréscimo fora da venda", () => {
    expect(tela({ bandeira: "visa", parcelas: "12" })).not.toContain("total_maquininha");
    const html = tela({ bandeira: "visa", parcelas: "13", totalNaMaquininha: "84,00" });
    expect(html).toContain("com juros do cliente");
    expect(html).toMatch(/<input[^>]+required=""[^>]+name="pagamento_1_total_maquininha"/);
    expect(html).toContain("4,00 (não altera a venda)");
    expect(html).toContain("NSU ou código do comprovante");
    expect(tela({}, false)).toContain("Não há maquininha ativa para esta forma na loja.");
  });
});
