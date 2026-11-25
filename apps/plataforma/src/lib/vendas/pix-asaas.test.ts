// O Pix pela Asaas no caixa (lote PAY-015a), a regra pura da tela: ler o que o banco devolve, os rótulos e as somas.
// FICTÍCIOS.
import { describe, expect, it } from "vitest";

import { erroDaVenda, erroDoPagamento, lerPagamentos } from "./regras";
import { horaDe, lerPixDaVenda, pixEspera, somasDoPix } from "./pix-asaas";

const UUID = (fim: string) => `00000000-0000-4000-8000-${fim.padStart(12, "0")}`;
const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });

describe("o Pix pela Asaas na tela do caixa (PAY-015a)", () => {
  it("lê o que o banco devolveu campo a campo: o fora da forma fica de fora; a imagem só em base64", () => {
    const lido = lerPixDaVenda({ ligado: true, venda: UUID("d1"), pix: [
      { id: UUID("1"), numero: 3, valor_centavos: 2_000, situacao: "aguardando", copia_e_cola: "000201-ficticio", imagem: "iVBORw0KGgo=", expira_em: "2026-11-25T18:30:00Z" },
      { id: UUID("2"), numero: 2, valor_centavos: "5000", situacao: "pago", imagem: "<script>", pago_em: "2026-11-25T17:05:00Z" },
      { id: "x", numero: 1, valor_centavos: 100, situacao: "pago" },
      { id: UUID("3"), numero: 1, valor_centavos: 100, situacao: "inventada" },
      { id: UUID("4"), numero: 1, valor_centavos: 0, situacao: "cancelado" },
    ] });
    expect(lido.ligado).toBe(true);
    expect(lido.venda).toBe(UUID("d1"));
    expect(lido.pix.map((p) => [p.id, p.situacao, p.valor_centavos, p.imagem])).toEqual([
      [UUID("1"), "aguardando", 2_000, "iVBORw0KGgo="], [UUID("2"), "pago", 5_000, null]]);
    expect(lerPixDaVenda(null)).toEqual({ ligado: false, venda: null, pix: [] });
    expect(lerPixDaVenda({ ligado: "sim", venda: "x", pix: "nada" })).toEqual({ ligado: false, venda: null, pix: [] });
  });

  it("o que segura a conclusão e as somas: o pago entra; o que espera (gerando ou esperando) conta à parte", () => {
    const pix = [
      { situacao: "pago", valor_centavos: 5_000 }, { situacao: "aguardando", valor_centavos: 2_000 }, { situacao: "criando", valor_centavos: 1_000 },
      { situacao: "cancelando", valor_centavos: 700 }, { situacao: "vencido", valor_centavos: 300 }, { situacao: "estornado", valor_centavos: 900 },
    ] as const;
    expect(somasDoPix(pix)).toEqual({ pago: 5_000, esperando: 3_000 });
    expect(pix.filter(pixEspera).map((p) => p.situacao)).toEqual(["aguardando", "criando", "cancelando"]);
    expect(horaDe("2026-11-25T17:05:00Z")).toBe("14:05");
    expect(horaDe(null)).toBeNull();
    expect(horaDe("ontem")).toBeNull();
  });

  it("o formulário não declara o Pix pela Asaas (só o banco grava); os erros do banco viram as mensagens do Pix", () => {
    expect(lerPagamentos(formulario({ pagamento_1_meio: "pix_asaas", pagamento_1_valor: "50,00" }))).toEqual({ ok: false, erro: "pagamento" });
    expect(erroDaVenda({ code: "OR058" })).toBe("pix_desligado");
    expect(erroDaVenda({ code: "OR059" })).toBe("pix_esperando");
    expect(erroDoPagamento("O Pix pela Asaas pago passa do total da venda: devolva a diferença pela Asaas ou ponha o item de volta")).toBe("pix_passa_do_total");
    expect(erroDoPagamento("O Pix passa do que falta pagar nesta venda")).toBe("pix_passa");
    expect(erroDoPagamento("Esta venda tem Pix pela Asaas pago: conclua a venda")).toBe("pix_pago");
  });
});
