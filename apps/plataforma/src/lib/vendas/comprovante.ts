// A leitura normalizada da venda que o comprovante mostra, e que a tela "Dados para emitir" reaproveita (revisão do
// NFE55-a, 27/11/2026: a tela copiava os valores crus dos pagamentos). Cada pagamento numa linha, como foi gravado:
//   * o dinheiro é o valor entregue pelo cliente (o troco está na venda, nos totais);
//   * a entrada embutida no financiamento aparece entre parênteses na linha da financeira, e a entrada lançada à parte
//     tem o nome dela ("Entrada do financiamento (Dinheiro)");
//   * o pagamento estornado, ou com o estorno a confirmar, vem marcado.
// E os totais da venda: subtotal, descontos, total, troco, a receber da financeira e devolvido. Nada se soma nem se
// converte aqui: é o que está gravado, na mesma forma nas duas telas.
import { nomeDoPagamento, textoDasParcelas } from "@ora5g/dominio";

import { centavosDoBanco } from "../dinheiro";
import { brl } from "../formato";
import { BANDEIRAS, ehBandeira } from "./cartao-manual";

export type PagamentoDoComprovante = {
  meio: string; valor_centavos: unknown; entrada_centavos: unknown; comprovante: string | null; situacao: string; parcelas: number | null;
  entrada_do_financiamento: boolean | null; bandeira_cartao: string | null; modalidade_cartao: string | null; acrescimo_cliente_centavos: unknown;
};

/** A linha do pagamento no comprovante, por extenso. */
export function textoDoPagamento(p: PagamentoDoComprovante): string {
  const acrescimo = centavosDoBanco(p.acrescimo_cliente_centavos ?? 0);
  const entrada = centavosDoBanco(p.entrada_centavos ?? 0);
  return `${nomeDoPagamento({ meio: p.meio, entradaDoFinanciamento: p.entrada_do_financiamento })}: ${brl(centavosDoBanco(p.valor_centavos))}`
    + textoDasParcelas(p.meio, p.parcelas)
    + (p.modalidade_cartao === "debito" ? " · débito" : p.modalidade_cartao === "credito" ? " · crédito" : "")
    + (ehBandeira(p.bandeira_cartao) ? ` · ${BANDEIRAS[p.bandeira_cartao]}` : "")
    + (acrescimo > 0 ? ` · acréscimo na maquininha: ${brl(acrescimo)}` : "")
    + (entrada > 0 ? ` (entrada ${brl(entrada)})` : "")
    + (p.comprovante ? ` · comprovante ${p.comprovante}` : "")
    + (p.situacao === "estornado" ? " · estornado" : p.situacao === "estorno_pendente" ? " · estorno a confirmar" : "");
}

export type TotaisDaVenda = { subtotal: number; desconto: number; total: number; troco: number; aReceber: number; devolvido: number };

/** Os totais da venda como o comprovante mostra. */
export function totaisDaVenda(v: {
  subtotal_centavos: unknown; desconto_centavos: unknown; total_centavos: unknown; troco_centavos: unknown; a_receber_centavos: unknown; devolvido_centavos: unknown;
}): TotaisDaVenda {
  return {
    subtotal: centavosDoBanco(v.subtotal_centavos ?? 0), desconto: centavosDoBanco(v.desconto_centavos ?? 0), total: centavosDoBanco(v.total_centavos ?? 0),
    troco: centavosDoBanco(v.troco_centavos ?? 0), aReceber: centavosDoBanco(v.a_receber_centavos ?? 0), devolvido: centavosDoBanco(v.devolvido_centavos ?? 0),
  };
}
