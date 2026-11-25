// A assinatura no cartão pela Asaas na ficha do cliente (lote PAY-015c), a regra pura da tela: ler o que o banco devolve e o
// formulário. FICTÍCIOS.
import { describe, expect, it } from "vitest";

import { diaDe, lerAssinaturasDoCliente, lerPedidoDeAssinatura } from "./assinaturas";

const UUID = (fim: string) => `00000000-0000-4000-8000-${fim.padStart(12, "0")}`;
const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });

describe("a assinatura no cartão na ficha (PAY-015c)", () => {
  it("lê o que o banco devolveu campo a campo: o fora da forma fica de fora; o link só https; do cartão, só o final e a bandeira; até 6 cobranças", () => {
    const lido = lerAssinaturasDoCliente({ ligado: true, pode_criar: true, assinaturas: [
      { id: UUID("1"), numero: 5, descricao: "Plano 10 GB", valor_centavos: 5_490, ciclo: "MONTHLY", linha: "41987650001", situacao: "ativa", link_url: "javascript:x",
        cartao_final: "8829", cartao_bandeira: "VISA", proxima_cobranca: "2026-12-25", pode_cancelar: true,
        cobrancas: Array.from({ length: 8 }, (_, i) => ({ valor_centavos: 5_490, situacao: i === 7 ? "inventada" : "pago", vencimento: `2026-0${(i % 9) + 1}-25` })) },
      { id: UUID("2"), numero: 4, descricao: "Plano", valor_centavos: 100, ciclo: "DAILY", situacao: "ativa" },
      { id: "x", numero: 3, descricao: "Plano", valor_centavos: 100, ciclo: "MONTHLY", situacao: "ativa" },
      { id: UUID("3"), numero: 2, descricao: "Plano 4 GB", valor_centavos: 2_990, ciclo: "YEARLY", situacao: "aguardando_cartao", link_url: "https://sandbox.asaas.invalid/c/l1",
        cartao_final: "12345", cartao_bandeira: "visa" },
    ] });
    expect(lido).toMatchObject({ ligado: true, podeCriar: true });
    expect(lido.assinaturas.map((a) => [a.id, a.ciclo, a.link_url, a.cartao_final, a.cartao_bandeira, a.cobrancas.length])).toEqual([
      [UUID("1"), "MONTHLY", null, "8829", "VISA", 6], [UUID("3"), "YEARLY", "https://sandbox.asaas.invalid/c/l1", null, null, 0]]);
    expect(lerAssinaturasDoCliente(null)).toEqual({ ligado: false, podeCriar: false, assinaturas: [] });
  });

  it("o formulário: a descrição de 3 a 60 sem < e >, o valor de R$ 1,00 a R$ 100.000,00, o ciclo da lista e a linha com DDD (opcional)", () => {
    expect(lerPedidoDeAssinatura(formulario({ descricao: " Plano 10 GB ", valor: "54,90", ciclo: "MONTHLY", linha: "(41) 98765-0001" })))
      .toEqual({ descricao: "Plano 10 GB", valor_centavos: 5_490, ciclo: "MONTHLY", linha: "41987650001" });
    expect(lerPedidoDeAssinatura(formulario({ descricao: "Plano 10 GB", valor: "54,90", ciclo: "YEARLY" })))
      .toEqual({ descricao: "Plano 10 GB", valor_centavos: 5_490, ciclo: "YEARLY", linha: null });
    const ruins: Record<string, string>[] = [{ descricao: "ab" }, { descricao: "<b>Plano</b>" }, { valor: "0,50" }, { valor: "100.000,01" }, { valor: "abc" }, { ciclo: "DAILY" },
      { linha: "4198765" }];
    for (const ruim of ruins) {
      expect(lerPedidoDeAssinatura(formulario({ descricao: "Plano 10 GB", valor: "54,90", ciclo: "MONTHLY", ...ruim })), JSON.stringify(ruim)).toBeNull();
    }
    expect(diaDe("2026-12-25")).toBe("25/12/2026");
    expect(diaDe("25/12/2026")).toBeNull();
  });
});
