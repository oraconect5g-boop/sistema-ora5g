import { describe, expect, it } from "vitest";
import { politicaDoCartao } from "./cartao-manual";
import { lerPagamentos } from "./regras";

const terminal = "00000000-0000-4000-8000-000000000101";
function ler(dados: Record<string, string | null>) {
  const form = new Map(Object.entries({ meio: "cartao_mercado_pago", maquininha_manual: "sim", valor: "50,00", terminal,
    modalidade_cartao: "credito", bandeira_cartao: "visa", comprovante: "NSU-TESTE", ...dados }).map(([k, v]) => [`pagamento_1_${k}`, v]));
  return lerPagamentos({ get: (chave) => form.get(chave) });
}

describe("cartão manual no formulário do PDV", () => {
  it("utiliza a mesma política para limitar as opções da tela", () => {
    expect(politicaDoCartao("picpay", "credito", "visa")).toEqual({ maximo: 18, jurosApartirDe: 13 });
    expect(politicaDoCartao("mercado_pago", "credito", "simp")).toEqual({ maximo: 6, jurosApartirDe: null });
    expect(politicaDoCartao("picpay", "credito", "simp").maximo).toBe(0);
    expect(politicaDoCartao("picpay", "debito", "visa").maximo).toBe(1);
  });
  it("separa da venda o acréscimo informado no terminal", () => {
    expect(ler({ parcelas: "13", total_maquininha: "52,50" })).toEqual({
      ok: true, pagamentos: [{ meio: "cartao_mercado_pago", valor: 5000, comprovante: "NSU-TESTE", terminal,
        parcelas: 13, modalidade_cartao: "credito", bandeira_cartao: "visa", acrescimo_cliente_centavos: 250 }],
    });
    expect(ler({ parcelas: "18", total_maquininha: "51" })).toMatchObject({ ok: true });
    expect(ler({ parcelas: "12" })).toMatchObject({ ok: true });
    expect(ler({ parcelas: "12", total_maquininha: "52,50" })).toEqual({ ok: false, erro: "acrescimo" });
    expect(ler({ parcelas: "13" })).toEqual({ ok: false, erro: "acrescimo" });
    expect(ler({ parcelas: "13", total_maquininha: "49,99" })).toEqual({ ok: false, erro: "acrescimo" });
    expect(ler({ parcelas: "19" })).toEqual({ ok: false, erro: "parcelas" });
  });
  it("Simp tem limite de 6x sem inferir juros; terminais e bandeiras são exigidos", () => {
    expect(ler({ bandeira_cartao: "simp", parcelas: "6" })).toMatchObject({ ok: true });
    expect(ler({ bandeira_cartao: "simp", parcelas: "6", total_maquininha: "50,13" })).toMatchObject({ ok: true });
    expect(ler({ bandeira_cartao: "simp", parcelas: "7" })).toEqual({ ok: false, erro: "parcelas" });
    expect(ler({ bandeira_cartao: "simp", parcelas: "6", meio: "cartao_picpay" })).toEqual({ ok: false, erro: "bandeira" });
    expect(ler({ terminal: "" })).toEqual({ ok: false, erro: "maquininha" });
    expect(ler({ bandeira_cartao: null })).toEqual({ ok: false, erro: "bandeira" });
  });
});
