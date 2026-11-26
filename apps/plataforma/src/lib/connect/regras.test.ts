import { describe, expect, it } from "vitest";

import {
  erroDoConnect, inicioDaJanela, lerPedido, linkDePagamento, materialDoEsimNaTela, pagamentoNaNogle, planoDoServico, podeVerMaterialDoEsim, quemPagaOPix,
} from "./regras";

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

// AUD-f (auditoria de e7f55b2): o serviço pago no caixa só serve à operação do mesmo plano (a regra do banco, OR055).
describe("o plano do serviço pago no caixa (AUD-f)", () => {
  it("a ativação é ATV-<plano> e a recarga, REC-<plano>; o resto não tem plano", () => {
    expect(planoDoServico("ativacao", "ATV-1718")).toBe("1718");
    expect(planoDoServico("recarga", "REC-1719")).toBe("1719");
    expect(planoDoServico("ativacao", "REC-1718")).toBeNull();
    expect(planoDoServico("recarga", "ATV-1718")).toBeNull();
    expect(planoDoServico("portabilidade", "ATV-1718")).toBeNull();
    for (const sku of ["ATV-", "ATV-17a8", "ATV-1234567890", "atv-1718", null, undefined]) expect(planoDoServico("ativacao", sku)).toBeNull();
  });
});

describe("o pagamento da Nogle na tela (AUD-f)", () => {
  // Código EMV FICTÍCIO, no formato do Pix.
  const EMV = "00020126580014BR.GOV.BCB.PIX0136a629532e-7693-4846-852d-1bbff817b5a85204000053039865802BR5913ORA TESTE6008CURITIBA62070503***6304ABCD";
  const base = { metodo_pagamento: "LINK", situacao: "aguardando_operadora", venda_item_id: null, link_pagamento: "https://pagar.exemplo/x", pix_copia_cola: null,
    pagamento_confirmado_em: null, id_externo: "99" };

  it("só o LINK tem pagamento na Nogle; o crédito da carteira e a portabilidade, não", () => {
    expect(pagamentoNaNogle({ ...base, metodo_pagamento: "SALDO" })).toBeNull();
    expect(pagamentoNaNogle({ ...base, metodo_pagamento: null })).toBeNull();
  });

  it("a pagar: quem paga (a loja, com o plano pago no caixa; senão o cliente), o link https e o Pix copia e cola, cada um no seu campo", () => {
    expect(pagamentoNaNogle(base)).toEqual({ estado: "a_pagar", quemPaga: "cliente", link: "https://pagar.exemplo/x", pix: null });
    expect(pagamentoNaNogle({ ...base, venda_item_id: "vi1", pix_copia_cola: EMV })).toEqual({ estado: "a_pagar", quemPaga: "loja", link: "https://pagar.exemplo/x", pix: EMV });
    // O link no lugar do Pix (ou o Pix com quebra de linha no meio) não é Pix copia e cola; o link que não é https não é link.
    expect(pagamentoNaNogle({ ...base, pix_copia_cola: "https://pagar.exemplo/x" })).toMatchObject({ pix: null });
    expect(pagamentoNaNogle({ ...base, pix_copia_cola: EMV + "\n" })).toMatchObject({ pix: EMV });
    expect(pagamentoNaNogle({ ...base, pix_copia_cola: EMV.slice(0, 40) + "\n" + EMV.slice(40) })).toMatchObject({ pix: null });
    expect(pagamentoNaNogle({ ...base, link_pagamento: "http://pagar.exemplo/x", pix_copia_cola: EMV })).toMatchObject({ link: null, pix: EMV });
  });

  it("sem link nem Pix: o aviso com o número da Nogle (sem prazo inventado); depois do envio, só enquanto espera a Nogle", () => {
    expect(pagamentoNaNogle({ ...base, link_pagamento: null })).toEqual({ estado: "sem_meio", quemPaga: "cliente", idNaNogle: "99" });
    expect(pagamentoNaNogle({ ...base, link_pagamento: "javascript:alert(1)", id_externo: null })).toEqual({ estado: "sem_meio", quemPaga: "cliente", idNaNogle: null });
    for (const situacao of ["registrada", "enviando", "resultado_desconhecido", "confirmada", "recusada", "cancelada"]) expect(pagamentoNaNogle({ ...base, situacao })).toBeNull();
  });

  it("o pago na Nogle não é a linha ativa: \"confirmado\" enquanto espera a prova da linha ou a gerência; depois, nada", () => {
    const pago = { ...base, pagamento_confirmado_em: "2026-11-26T13:00:00Z" };
    expect(pagamentoNaNogle(pago)).toEqual({ estado: "confirmado", em: "2026-11-26T13:00:00Z" });
    expect(pagamentoNaNogle({ ...pago, situacao: "resultado_desconhecido" })).toEqual({ estado: "confirmado", em: "2026-11-26T13:00:00Z" });
    expect(pagamentoNaNogle({ ...pago, situacao: "confirmada" })).toBeNull();
  });
});

describe("o material de instalação do eSIM na tela (AUD-f)", () => {
  const op = { tipo: "ativacao", esim: true, situacao: "aguardando_operadora", vendedor_id: "eu" };
  it("só para quem registrou e quem gere, só no eSIM e só da ativação viva ou feita", () => {
    expect(podeVerMaterialDoEsim(op, "eu", false)).toBe(true);
    expect(podeVerMaterialDoEsim(op, "outra", false)).toBe(false);
    expect(podeVerMaterialDoEsim(op, "outra", true)).toBe(true);
    expect(podeVerMaterialDoEsim({ ...op, esim: false }, "eu", true)).toBe(false);
    expect(podeVerMaterialDoEsim({ ...op, tipo: "recarga" }, "eu", true)).toBe(false);
    expect(["resultado_desconhecido", "confirmada"].every((situacao) => podeVerMaterialDoEsim({ ...op, situacao }, "eu", false))).toBe(true);
    expect(["registrada", "cancelada", "recusada", "nao_recebida", "negada"].some((situacao) => podeVerMaterialDoEsim({ ...op, situacao }, "eu", true))).toBe(false);
  });
  it("só o link https e o código LPA no formato", () => {
    const codigo = "LPA:1$smdp.exemplo$AB-12";
    expect(materialDoEsimNaTela({ link_esim: "https://esim.exemplo/qr", esim_codigo: codigo })).toEqual({ link: "https://esim.exemplo/qr", codigo });
    expect(materialDoEsimNaTela({ link_esim: "javascript:alert(1)", esim_codigo: codigo })).toEqual({ link: null, codigo });
    expect(materialDoEsimNaTela({ link_esim: null, esim_codigo: "LPA:1$sem-o-codigo" })).toBeNull();
    expect(materialDoEsimNaTela({ link_esim: null, esim_codigo: codigo + "A".repeat(300) })).toBeNull();
  });
});
