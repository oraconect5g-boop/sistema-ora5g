// PDV-c (pedido do proprietário de 18/11): as regras puras das formas de pagamento por botão (o componente do navegador
// usa; o servidor e o banco conferem tudo de novo).
import { describe, expect, it } from "vitest";

import { centavosDoTexto, resumoDosPagamentos, textoDosCentavos, valorSugerido, type LinhaNaTela, type OpcaoDeMeio } from "./formas-de-pagamento";

const opcao = (meio: string, extra: Partial<OpcaoDeMeio> = {}): OpcaoDeMeio => ({
  meio, nome: meio, financeira: false, comprovante: false, maximoDeParcelas: null, provedor: null, aceitaTroco: meio === "dinheiro", podeSerEntrada: true, ...extra,
});
const OPCOES = [opcao("dinheiro"), opcao("pix_direto", { comprovante: true }), opcao("payjoy", { financeira: true, maximoDeParcelas: 48, podeSerEntrada: false })];
const linha = (meio: string, valor: string, chave = 1): LinhaNaTela => ({ chave, meio, valor, parcelas: "", comprovante: "", terminal: "", entrada: false });

describe("as formas de pagamento por botão", () => {
  it("lê o valor como o servidor: milhar com ponto, centavos com vírgula; o resto não vale", () => {
    expect(centavosDoTexto("1.299,90")).toBe(129_990);
    expect(centavosDoTexto("1299,9")).toBe(129_990);
    expect(centavosDoTexto("1299")).toBe(129_900);
    expect(centavosDoTexto(" 10,5 ")).toBe(1_050);
    for (const ruim of ["", "1,999", "12.34", "abc", "-5", "1.29,90"]) expect(centavosDoTexto(ruim), ruim).toBeNull();
    expect(textoDosCentavos(129_990)).toBe("1299,90");
  });

  it("o resumo: o lançado, o que falta, o troco só do dinheiro e o que passa sem troco", () => {
    expect(resumoDosPagamentos(10_000, [linha("dinheiro", "50,00")], OPCOES)).toMatchObject({ lancado: 5_000, falta: 5_000, troco: 0, sobraSemTroco: 0 });
    expect(resumoDosPagamentos(10_000, [linha("dinheiro", "120,00")], OPCOES)).toMatchObject({ falta: 0, troco: 2_000, sobraSemTroco: 0 });
    expect(resumoDosPagamentos(10_000, [linha("pix_direto", "120,00")], OPCOES)).toMatchObject({ troco: 0, sobraSemTroco: 2_000 });
    expect(resumoDosPagamentos(10_000, [linha("payjoy", "80,00"), linha("dinheiro", "x", 2)], OPCOES)).toMatchObject({ financiado: 8_000, invalidas: 1 });
  });

  it("o valor sugerido: o que falta; na PayJoy e na Aiva, no máximo o valor dos celulares ainda não financiado", () => {
    // Venda de 1.509,00: o celular de 1.499,00 e o chip de 10,00.
    expect(valorSugerido(OPCOES[0] as OpcaoDeMeio, 150_900, 149_900, [], OPCOES)).toBe(150_900);
    expect(valorSugerido(OPCOES[2] as OpcaoDeMeio, 150_900, 149_900, [], OPCOES)).toBe(149_900);
    expect(valorSugerido(OPCOES[2] as OpcaoDeMeio, 150_900, 149_900, [linha("dinheiro", "300,00")], OPCOES)).toBe(120_900);
    expect(valorSugerido(OPCOES[2] as OpcaoDeMeio, 150_900, 149_900, [linha("payjoy", "1.499,00")], OPCOES)).toBe(0);
    expect(valorSugerido(OPCOES[0] as OpcaoDeMeio, 150_900, 149_900, [linha("payjoy", "1.199,00"), linha("dinheiro", "300,00", 2)], OPCOES)).toBe(1_000);
  });
});
