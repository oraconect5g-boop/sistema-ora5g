// Margem bruta (lote G2): leitura de public.margem_painel e public.margem_itens e as regras puras
// dos números. Contrato: docs/alinhamento/MATRIZ_DEMO_REAL.md, seção 3.5; a soma no banco está
// provada em packages/banco/src/margem-painel.test.ts. Aqui não há acesso a dados (fica em ./consulta).
//
// Contrato (centavos inteiros; cada fato no seu dia de São Paulo; a loja é a da venda):
//   M1 margem bruta  soma, por item com custo gravado, de preço × quantidade − desconto − custo ×
//                    quantidade, na data da conclusão da venda. A devolução tira o valor devolvido
//                    menos o custo das unidades devolvidas, na data dela; o cancelamento tira a
//                    margem inteira da venda, na data dele. O custo é o histórico: o gravado quando
//                    o item entrou na venda. A margem de um dia pode ficar abaixo de zero.
//   M2 cobertura     vendido dos itens com custo gravado ÷ vendido. Item sem custo fica fora da
//                    margem e é contado (unidades e valor); nunca é tratado como custo zero.
//   M3 percentual    M1 ÷ base líquida (vendido − devolvido − cancelado, só dos itens com custo).
//                    Sem base positiva não há percentual.
//   Lojas            só entram as lojas em que quem pede tem custo.ver. As demais ficam fora da
//                    conta inteira (numerador e denominador) e são só contadas (lojasFora).
//   Não é lucro: taxa de meio de pagamento, comissão, frete e imposto ficam fora.
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto, inteiro as n, inteiroOuNulo, lista, objeto, texto as t, textoOuNulo as tOuNulo, type Linha } from "../leitura-do-banco";

// ---------------------------------------------------------------------------------------------
// Leitura de margem_painel
// ---------------------------------------------------------------------------------------------
function parcelas(l: Linha) {
  const p = {
    itens: n(l, "itens"), vendido: n(l, "vendido"),
    itensComCusto: n(l, "itens_com_custo"), vendidoComCusto: n(l, "vendido_com_custo"), custo: n(l, "custo"),
    itensSemCusto: n(l, "itens_sem_custo"), vendidoSemCusto: n(l, "vendido_sem_custo"),
    itensDevolvidosComCusto: n(l, "itens_devolvidos_com_custo"), devolvidoComCusto: n(l, "devolvido_com_custo"), custoDevolvido: n(l, "custo_devolvido"),
    itensCanceladosComCusto: n(l, "itens_cancelados_com_custo"), canceladoComCusto: n(l, "cancelado_com_custo"), custoCancelado: n(l, "custo_cancelado"),
    margem: n(l, "margem"),
  };
  // A tela mostra as parcelas ao lado do resultado. Se a conta não fecha com o número do banco, é
  // falha de leitura: melhor nenhum número do que uma conta que não bate.
  const fecha = p.margem === (p.vendidoComCusto - p.custo) - (p.devolvidoComCusto - p.custoDevolvido) - (p.canceladoComCusto - p.custoCancelado)
    && p.itens === p.itensComCusto + p.itensSemCusto
    && p.vendido === p.vendidoComCusto + p.vendidoSemCusto;
  if (!fecha) throw new RespostaInesperada("margem");
  return p;
}
export type ParcelasDaMargem = ReturnType<typeof parcelas>;

export type MargemDoBanco = {
  totais: ParcelasDaMargem;
  /** Só os dias com fato, no formato "2026-11-10". O total não é a soma dos dias refeita aqui: vem do banco. */
  periodos: ({ periodo: string } & ParcelasDaMargem)[];
  /** Lojas com fato no período em que quem pede vê custo, e as que ficaram fora por não ver. */
  lojasComCusto: number;
  lojasFora: number;
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const dia = (l: Linha, campo: string) => {
  const v = t(l, campo);
  if (!DIA.test(v)) throw new RespostaInesperada(campo);
  return v;
};

/** Converte a resposta de public.margem_painel. Forma inesperada é erro (a tela mostra falha, não zero). */
export function lerMargem(dado: unknown): MargemDoBanco {
  if (!ehObjeto(dado)) throw new RespostaInesperada("margem_painel");
  return {
    totais: parcelas(objeto(dado, "totais")),
    periodos: lista(dado, "periodos").map((l) => ({ periodo: dia(l, "periodo"), ...parcelas(l) })),
    lojasComCusto: n(dado, "lojas_com_custo"),
    lojasFora: n(dado, "lojas_fora"),
  };
}

// ---------------------------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------------------------
/** Há pelo menos uma unidade com custo gravado entre os fatos (vendida, devolvida ou cancelada). */
export const temCustoGravado = (p: ParcelasDaMargem) => p.itensComCusto + p.itensDevolvidosComCusto + p.itensCanceladosComCusto > 0;

export function numerosDaMargem(p: ParcelasDaMargem) {
  const base = p.vendidoComCusto - p.devolvidoComCusto - p.canceladoComCusto;
  return {
    /** M1. */
    margem: p.margem,
    /** Base líquida do percentual: o vendido com custo que continuou vendido. */
    base,
    /** Custo do que continuou vendido. base − custoLiquido = margem. */
    custoLiquido: p.custo - p.custoDevolvido - p.custoCancelado,
    /** M3: sem base positiva não há percentual. */
    fracao: base > 0 ? p.margem / base : null,
    /** M2: sem venda não há cobertura. */
    cobertura: p.vendido > 0 ? p.vendidoComCusto / p.vendido : null,
    temCusto: temCustoGravado(p),
  };
}
export type NumerosDaMargem = ReturnType<typeof numerosDaMargem>;

/**
 * O que há para mostrar no período:
 *   ok          há item com custo gravado: a margem existe;
 *   sem_vendas  nenhuma venda, devolução ou cancelamento, em loja nenhuma;
 *   lojas_fora  houve movimento, mas só em loja em que quem pede não vê o custo;
 *   sem_custo   houve movimento nas lojas visíveis, e nenhum item dele tem custo gravado. A margem
 *               não é zero: é desconhecida.
 */
export type SituacaoDaMargem = "ok" | "sem_vendas" | "lojas_fora" | "sem_custo";
export function situacaoDaMargem(m: MargemDoBanco): SituacaoDaMargem {
  if (m.lojasComCusto === 0) return m.lojasFora === 0 ? "sem_vendas" : "lojas_fora";
  return temCustoGravado(m.totais) ? "ok" : "sem_custo";
}

// ---------------------------------------------------------------------------------------------
// Leitura de margem_itens: o detalhe, uma linha por item das vendas concluídas no período
// ---------------------------------------------------------------------------------------------
const instante = (l: Linha, campo: string) => {
  const v = t(l, campo);
  if (Number.isNaN(Date.parse(v))) throw new RespostaInesperada(campo);
  return v;
};

function item(l: Linha) {
  const i = {
    vendaId: t(l, "venda_id"), numero: n(l, "numero"), concluidaEm: instante(l, "concluida_em"),
    unidadeId: t(l, "unidade_id"), unidade: tOuNulo(l, "unidade"), situacao: t(l, "situacao"),
    itemId: t(l, "item_id"), tipo: t(l, "tipo"), variante: tOuNulo(l, "variante"), sku: tOuNulo(l, "sku"),
    quantidade: n(l, "quantidade"), precoUnitario: n(l, "preco_unitario"), desconto: n(l, "desconto"),
    /** preço × quantidade − desconto. */
    valor: n(l, "valor"),
    /** Nulos, os dois juntos, quando o item não tem custo gravado. */
    custoUnitario: inteiroOuNulo(l, "custo_unitario"), margem: inteiroOuNulo(l, "margem"),
    /** Unidades do item já devolvidas (a devolução sai do resumo na data dela; a linha não muda). */
    devolvidos: n(l, "devolvidos"),
  };
  if ((i.custoUnitario === null) !== (i.margem === null)) throw new RespostaInesperada("margem");
  return i;
}
export type ItemDaMargem = ReturnType<typeof item>;
export type ItensDaMargem = { total: number; itens: ItemDaMargem[] };

/** Converte a resposta de public.margem_itens (uma página). */
export function lerItensDaMargem(dado: unknown): ItensDaMargem {
  if (!ehObjeto(dado)) throw new RespostaInesperada("margem_itens");
  return { total: n(dado, "total"), itens: lista(dado, "itens").map(item) };
}
