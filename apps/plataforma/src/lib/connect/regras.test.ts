import { describe, expect, it } from "vitest";

import { erroDoConnect, inicioDaJanela, lerPedido, linkDePagamento, quemPagaOPix } from "./regras";

const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });
const ATIVACAO = {
  metodo: "SALDO", venda_item: "0b1c2d3e-0000-4000-8000-000000000002", plano: "99999", ddd: "51", iccid: "8955 1000 0000 0000 013", documento: "123.456.789-09", nome: "Cliente Fictício",
  data_nascimento: "1990-05-20", telefone: "(51) 99999-0000", rua: "Rua Exemplo", numero_endereco: "123", bairro: "Centro", cep: "90000-000", id_cidade: "7703",
};

describe("pedido da Ora Connect lido do formulário", () => {
  it("ativação: só dígitos no ICCID, CPF e CEP; eSIM sem ICCID; CPF inválido ou documento ausente param na tela", () => {
    const lido = lerPedido("ativacao", formulario(ATIVACAO));
    expect(lido).toEqual({ ok: true, pedido: {
      metodo: "SALDO", venda_item: "0b1c2d3e-0000-4000-8000-000000000002", plano: 99999, ddd: 51, iccid: "8955100000000000013",
      cliente: { nome: "Cliente Fictício", cpf: "12345678909", data_nascimento: "1990-05-20", email: undefined, telefone: "51999990000",
        endereco: { rua: "Rua Exemplo", numero: "123", complemento: undefined, bairro: "Centro", cep: "90000000", id_cidade: 7703 } },
    } });
    const esim = lerPedido("ativacao", formulario({ ...ATIVACAO, esim: "on", iccid: "" }));
    expect(esim.ok && esim.pedido).toMatchObject({ esim: true });
    expect(esim.ok && "iccid" in esim.pedido).toBe(false);
    expect(lerPedido("ativacao", formulario({ ...ATIVACAO, documento: "123.456.789-00" }))).toEqual({ ok: false, erro: "documento" });
    expect(lerPedido("ativacao", formulario({ ...ATIVACAO, iccid: "" }))).toEqual({ ok: false, erro: "dados" });
    const empresa = lerPedido("ativacao", formulario({ ...ATIVACAO, documento: "11.222.333/0001-81" }));
    expect(empresa.ok && empresa.pedido.cliente).toMatchObject({ cnpj: "11222333000181" });
  });

  it("recarga e portabilidade: linha com 11 dígitos; o Pix da Nogle (LINK) com ou sem o serviço pago, o SALDO só com ele; serviço pago é um id", () => {
    expect(lerPedido("recarga", formulario({ metodo: "SALDO", plano: "99999", linha: "(51) 98888-7777", venda_item: "0b1c2d3e-0000-4000-8000-000000000001" })))
      .toEqual({ ok: true, pedido: { metodo: "SALDO", plano: 99999, linha: "51988887777", venda_item: "0b1c2d3e-0000-4000-8000-000000000001" } });
    expect(lerPedido("recarga", formulario({ metodo: "PIX", plano: "99999", linha: "51988887777" }))).toEqual({ ok: false, erro: "dados" });
    expect(lerPedido("recarga", formulario({ metodo: "SALDO", plano: "99999", linha: "5198888777", venda_item: "0b1c2d3e-0000-4000-8000-000000000001" }))).toEqual({ ok: false, erro: "linha" });
    expect(lerPedido("recarga", formulario({ metodo: "SALDO", plano: "99999", linha: "51988887777", venda_item: "x" }))).toEqual({ ok: false, erro: "dados" });
    // D-062 (o proprietário, 25/11: "não com o crédito da Nogle"; CONNECT-l): o Pix da Nogle sem o serviço pago (o
    // cliente paga direto à Nogle) e com ele (a loja paga o link); o SALDO (a carteira) segue pedindo o serviço pago.
    expect(lerPedido("recarga", formulario({ metodo: "LINK", plano: "99999", linha: "51988887777" })))
      .toEqual({ ok: true, pedido: { metodo: "LINK", plano: 99999, linha: "51988887777" } });
    expect(lerPedido("recarga", formulario({ metodo: "LINK", plano: "99999", linha: "51988887777", venda_item: "0b1c2d3e-0000-4000-8000-000000000001" })))
      .toEqual({ ok: true, pedido: { metodo: "LINK", plano: 99999, linha: "51988887777", venda_item: "0b1c2d3e-0000-4000-8000-000000000001" } });
    const ativacaoPeloPix = lerPedido("ativacao", formulario({ ...ATIVACAO, metodo: "LINK", venda_item: "" }));
    expect(ativacaoPeloPix.ok && ativacaoPeloPix.pedido).toMatchObject({ metodo: "LINK", iccid: "8955100000000000013" });
    expect(ativacaoPeloPix.ok && "venda_item" in ativacaoPeloPix.pedido).toBe(false);
    expect(lerPedido("recarga", formulario({ metodo: "SALDO", plano: "99999", linha: "51988887777" }))).toEqual({ ok: false, erro: "sem_servico_pago" });
    expect(lerPedido("ativacao", formulario({ ...ATIVACAO, venda_item: "" }))).toEqual({ ok: false, erro: "sem_servico_pago" });
    expect(lerPedido("portabilidade", formulario({ linha: "51900000001", linha_doadora: "51911112222", operadora: "41" })))
      .toEqual({ ok: true, pedido: { linha: "51900000001", linha_doadora: "51911112222", operadora: 41 } });
  });

  it("janela de dias para os serviços pagos recentes", () => {
    expect(inicioDaJanela(7, new Date("2026-11-08T12:00:00Z"))).toBe("2026-11-01T12:00:00.000Z");
  });

  it("códigos do banco viram mensagens do catálogo", () => {
    expect(erroDoConnect({ code: "OR011" })).toBe("chip_no_estoque");
    expect(erroDoConnect({ code: "OR012" })).toBe("nao_habilitada");
    expect(erroDoConnect({ code: "OR013" })).toBe("em_andamento");
    // CONNECT-f: o serviço pago no caixa é de outro plano.
    expect(erroDoConnect({ code: "OR055" })).toBe("outro_plano");
    expect(erroDoConnect({ code: "XX000" })).toBe("falha");
    expect(erroDoConnect(null)).toBe("falha");
  });

  it("o link do Pix da Nogle que a tela mostra: só https, sem espaço nem aspas, até 500 caracteres; quem paga", () => {
    expect(linkDePagamento("https://pagamento.invalid/ora/123?x=1")).toBe("https://pagamento.invalid/ora/123?x=1");
    for (const ruim of ["http://pagamento.invalid/x", "javascript:alert(1)", "https://pag amento.invalid", 'https://x.invalid/"><b>', "", null, undefined,
      `https://pagamento.invalid/${"a".repeat(480)}`]) expect(linkDePagamento(ruim)).toBeNull();
    expect(quemPagaOPix("0b1c2d3e-0000-4000-8000-000000000001")).toBe("loja");
    expect(quemPagaOPix(null)).toBe("cliente");
  });
});
