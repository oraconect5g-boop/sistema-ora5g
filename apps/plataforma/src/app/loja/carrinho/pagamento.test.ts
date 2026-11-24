// O Pix do pedido na tela do visitante (lote PAY-014a; ADR-025), renderizado no servidor (o useEffect da espera não roda
// aqui): cada situação do pagamento mostra o que deve. Dados fictícios; o link é do sandbox, de mentira.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { lerPedidoDoSite, type PagamentoDoPedido as Pagamento, type PedidoDoSite } from "../../../lib/loja/carrinho";
import type { ErroDoPagamento } from "./acoes";
import { PagamentoDoPedido } from "./PagamentoDoPedido";

const BASE = {
  codigo: "PED234", situacao: "reservado", expira_em: "2099-11-19T03:00:00Z", total_centavos: 15_800, unidades: 2,
  itens: [{ produto: "Capa", variacao: "Azul", preco_centavos: 7_900 }, { produto: "Capa", variacao: "Azul", preco_centavos: 7_900 }],
  loja: { nome: "Santa Cândida", endereco: null, cidade: "Curitiba" },
};
const pedidoCom = (pagamento: Partial<Pagamento>, mais: Record<string, unknown> = {}) =>
  lerPedidoDoSite({ ...BASE, ...mais, pagamento: { disponivel: true, situacao: null, link: null, valor_centavos: null, pago_em: null, ...pagamento } }) as PedidoDoSite;
const tela = (pedido: PedidoDoSite, whatsapp: string | null = "41987650001", erro: ErroDoPagamento | null = null) =>
  renderToStaticMarkup(createElement(PagamentoDoPedido, { pedido, whatsapp, erro, enviar: () => undefined, enviando: false })).replace(/<!-- -->/g, "");

describe("o Pix do pedido na tela (PAY-014a)", () => {
  it("ligado e sem pagamento começado: o botão de pagar com o total, os campos escondidos e a loja como alternativa", () => {
    const html = tela(pedidoCom({}));
    expect(html).toContain("Pagar agora com Pix (R$ 158,00)");
    for (const campo of ['name="codigo" value="PED234"', 'name="whatsapp" value="41987650001"', 'name="acao" value="pagar"']) expect(html, campo).toContain(campo);
    expect(html).toContain("Ou pague na loja, na retirada.");
    // Antes da hidratação (a renderização no servidor), o botão vem desligado: o envio sem o React perderia o pedido aberto.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Pagar agora com Pix/);
  });

  it("desligado, sem o WhatsApp ou o pedido vencido: só o texto da loja, sem botão", () => {
    for (const html of [tela(pedidoCom({ disponivel: false })), tela(pedidoCom({}), null), tela(pedidoCom({}, { expira_em: "2020-01-01T00:00:00Z" }))]) {
      expect(html).toContain("O pagamento é feito na loja, na retirada.");
      expect(html).not.toContain("Pagar agora");
    }
    expect(tela(pedidoCom({}, { situacao: "atendido" }))).not.toContain("O pagamento é feito na loja");
  });

  it("preparando, aguardando com o link (abre em outra aba, sem passar o endereço de volta), pago, estornado e o que não deu certo", () => {
    expect(tela(pedidoCom({ situacao: "criando", valor_centavos: 15_800 }))).toContain("Preparando o Pix...");
    const aguardando = tela(pedidoCom({ situacao: "aguardando", link: "https://sandbox.asaas.com/c/1", valor_centavos: 15_800 }));
    expect(aguardando).toContain('href="https://sandbox.asaas.com/c/1" target="_blank" rel="noopener noreferrer"');
    for (const trecho of ["Pagar R$ 158,00 com Pix", "Já paguei: conferir", 'name="acao" value="ver"']) expect(aguardando, trecho).toContain(trecho);
    const pago = tela(pedidoCom({ situacao: "pago", valor_centavos: 15_800, pago_em: "2026-11-24T15:00:00Z" }));
    for (const trecho of ["Pago pelo site", "R$ 158,00 pagos com Pix em 24/11, 12:00", "Na loja, mostre o código e retire."]) expect(pago.replace(/ /g, " "), trecho).toContain(trecho.replace(/ /g, " "));
    expect(pago).not.toContain("<form");
    expect(tela(pedidoCom({ situacao: "estornado" }))).toContain("O pagamento pelo site foi devolvido (estornado).");
    expect(tela(pedidoCom({ situacao: "falhou" }))).toContain("Não deu para preparar o Pix deste pedido. Pague na loja, na retirada.");
    expect(tela(pedidoCom({ situacao: "cancelado" }))).toContain("O Pix deste pedido não vale mais. Pague na loja, na retirada.");
  });

  it("a recusa volta como aviso: a do pagamento desligado e a do pedido que não se paga mais, sem tom de erro", () => {
    expect(tela(pedidoCom({}), "41987650001", "indisponivel")).toContain("O pagamento pelo site não está disponível agora.");
    expect(tela(pedidoCom({}), "41987650001", "nao_pagavel")).toContain("Este pedido não pode mais ser pago pelo site");
    expect(tela(pedidoCom({}), "41987650001", "falha")).toContain("Não deu para falar com o pagamento agora.");
  });
});
