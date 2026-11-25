// O cartão pela Asaas no caixa (lote PAY-015b), a regra pura da tela: ler o que o banco devolve, os rótulos e as somas.
// FICTÍCIOS.
import { describe, expect, it } from "vitest";

import { cartaoEspera, lerCartaoDaVenda, SITUACOES_DO_CARTAO, somasDoCartao } from "./cartao-asaas";
import { lerPagamentos } from "./regras";

const UUID = (fim: string) => `00000000-0000-4000-8000-${fim.padStart(12, "0")}`;
const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });

describe("o cartão pela Asaas na tela do caixa (PAY-015b)", () => {
  it("lê o que o banco devolveu campo a campo: o fora da forma fica de fora; o link só https; do cartão, só o final e a bandeira", () => {
    const lido = lerCartaoDaVenda({ ligado: true, venda: UUID("d1"), cartoes: [
      { id: UUID("1"), numero: 3, valor_centavos: 2_000, situacao: "aguardando", link_url: "https://sandbox.asaas.invalid/c/lnk1", expira_em: "2026-11-25T18:30:00Z" },
      { id: UUID("2"), numero: 2, valor_centavos: "5000", situacao: "pago", link_url: "javascript:alert(1)", cartao_final: "8829", cartao_bandeira: "VISA" },
      { id: UUID("5"), numero: 2, valor_centavos: 100, situacao: "pago", cartao_final: "12345", cartao_bandeira: "visa<b>" },
      { id: "x", numero: 1, valor_centavos: 100, situacao: "pago" },
      { id: UUID("3"), numero: 1, valor_centavos: 100, situacao: "inventada" },
      { id: UUID("4"), numero: 1, valor_centavos: 0, situacao: "cancelado" },
    ] });
    expect(lido.ligado).toBe(true);
    expect(lido.venda).toBe(UUID("d1"));
    expect(lido.cartoes.map((c) => [c.id, c.situacao, c.valor_centavos, c.link_url, c.cartao_final, c.cartao_bandeira])).toEqual([
      [UUID("1"), "aguardando", 2_000, "https://sandbox.asaas.invalid/c/lnk1", null, null],
      [UUID("2"), "pago", 5_000, null, "8829", "VISA"],
      [UUID("5"), "pago", 100, null, null, null]]);
    expect(lerCartaoDaVenda(null)).toEqual({ ligado: false, venda: null, cartoes: [] });
    expect(lerCartaoDaVenda({ ligado: "sim", venda: "x", cartoes: "nada" })).toEqual({ ligado: false, venda: null, cartoes: [] });
  });

  it("o que segura a conclusão e as somas: o pago entra; o que espera (gerando ou esperando) conta à parte; cada situação tem rótulo", () => {
    const cartoes = [
      { situacao: "pago", valor_centavos: 5_000 }, { situacao: "aguardando", valor_centavos: 2_000 }, { situacao: "criando", valor_centavos: 1_000 },
      { situacao: "cancelando", valor_centavos: 700 }, { situacao: "estornado", valor_centavos: 900 }, { situacao: "vencido", valor_centavos: 300 },
    ] as const;
    expect(somasDoCartao(cartoes)).toEqual({ pago: 5_000, esperando: 3_000 });
    expect(cartoes.filter(cartaoEspera).map((c) => c.situacao)).toEqual(["aguardando", "criando", "cancelando"]);
    expect(Object.keys(SITUACOES_DO_CARTAO).sort()).toEqual(["aguardando", "cancelado", "cancelando", "criando", "estornado", "falhou", "pago", "vencido"]);
  });

  it("a tela não declara o cartão pela Asaas: digitado no formulário, é recusado (só o banco grava a linha)", () => {
    expect(lerPagamentos(formulario({ pagamento_1_meio: "cartao_asaas", pagamento_1_valor: "79,00" }))).toEqual({ ok: false, erro: "pagamento" });
  });
});
