// Colunas e linhas da planilha do financeiro real (#65; ORA-FIN-009), por visão. Valores em reais com
// vírgula decimal, datas no horário de São Paulo. Os nomes chegam resolvidos pelo servidor (RLS).
// FIN-009c: cada célula leva o tipo (dinheiro, dia, instante; lib/csv: Celula), para o Excel guardar número e data
// de verdade; o CSV sai com o mesmo texto de antes.
import type { Celula } from "../csv";
import { nomeDoMeio, type Registros } from "./registros";

export const quandoNoCsv = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "") : "";

/** "2026-11-10" (data sem hora, como liquidado_em) → "10/11/2026". */
export const diaNoCsv = (dia: string | null) => (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : "");

/** Situação da conciliação de um pagamento: conciliado, a conciliar (cartão e Pix confirmados) ou vazio. */
export const conciliacaoNoCsv = (l: { conciliavel: boolean; situacao: string; conciliacao: unknown }) =>
  l.conciliacao ? "conciliado" : l.conciliavel && l.situacao === "confirmado" ? "a conciliar" : "";

const reais = (centavos: number): Celula => ({ centavos });
const instante = (iso: string | null): Celula => (iso ? { instante: iso } : null);
const dia = (valor: string | null): Celula => (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? { dia: valor } : null);

export function tabelaDoCsv(r: Registros, pessoa: (id: string) => string, loja: (id: string) => string): { colunas: string[]; linhas: Celula[][] } {
  if (r.visao === "vendas") {
    return {
      colunas: ["Venda", "Quando", "Loja", "Vendedor", "Total (R$)", "Devolvido (R$)", "Situação"],
      linhas: r.linhas.map((l) => [l.numero, instante(l.quando), loja(l.unidadeId), pessoa(l.pessoaId), reais(l.total), reais(l.devolvido), l.situacao]),
    };
  }
  if (r.visao === "pagamentos") {
    return {
      colunas: ["Venda", "Quando", "Loja", "Meio", "Valor (R$)", "Entrada (R$)", "Meio da entrada", "Situação", "Conciliação", "Dinheiro caiu em", "Valor líquido (R$)", "Referência do extrato"],
      linhas: r.linhas.map((l) => [
        l.vendaNumero, instante(l.quando), loja(l.unidadeId), nomeDoMeio(l.meio), reais(l.valor), reais(l.entrada), nomeDoMeio(l.meioEntrada), l.situacao,
        conciliacaoNoCsv(l), dia(l.conciliacao?.liquidadoEm ?? null), l.conciliacao ? reais(l.conciliacao.liquido) : null, l.conciliacao?.referencia ?? "",
      ]),
    };
  }
  if (r.visao === "devolucoes") {
    return {
      colunas: ["Devolução", "Venda", "Quando", "Loja", "Valor (R$)", "Motivo"],
      linhas: r.linhas.map((l) => [l.numero, l.vendaNumero, instante(l.quando), loja(l.unidadeId), reais(l.valor), l.motivo]),
    };
  }
  const opcional = (v: number | null): Celula => (v === null ? null : reais(v));
  return {
    colunas: ["Operador", "Loja", "Aberto", "Fechado", "Fundo (R$)", "Esperado (R$)", "Contado (R$)", "Diferença (R$)", "Situação"],
    linhas: r.linhas.map((l) => [pessoa(l.pessoaId), loja(l.unidadeId), instante(l.abertoEm), instante(l.fechadoEm), reais(l.fundo), opcional(l.esperado), opcional(l.contado), opcional(l.diferenca), l.situacao]),
  };
}
