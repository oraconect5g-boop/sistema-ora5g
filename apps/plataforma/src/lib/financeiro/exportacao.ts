// Colunas e linhas do CSV do financeiro real (#65; ORA-FIN-009), por visão. Valores em reais com
// vírgula decimal, datas no horário de São Paulo. Os nomes chegam resolvidos pelo servidor (RLS).
import { centavosCsv } from "../csv";
import { nomeDoMeio, type Registros } from "./registros";

export const quandoNoCsv = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "") : "";

export function tabelaDoCsv(r: Registros, pessoa: (id: string) => string, loja: (id: string) => string): { colunas: string[]; linhas: (string | number)[][] } {
  if (r.visao === "vendas") {
    return {
      colunas: ["Venda", "Quando", "Loja", "Vendedor", "Total (R$)", "Devolvido (R$)", "Situação"],
      linhas: r.linhas.map((l) => [l.numero, quandoNoCsv(l.quando), loja(l.unidadeId), pessoa(l.pessoaId), centavosCsv(l.total), centavosCsv(l.devolvido), l.situacao]),
    };
  }
  if (r.visao === "pagamentos") {
    return {
      colunas: ["Venda", "Quando", "Loja", "Meio", "Valor (R$)", "Entrada (R$)", "Meio da entrada", "Situação"],
      linhas: r.linhas.map((l) => [l.vendaNumero, quandoNoCsv(l.quando), loja(l.unidadeId), nomeDoMeio(l.meio), centavosCsv(l.valor), centavosCsv(l.entrada), nomeDoMeio(l.meioEntrada), l.situacao]),
    };
  }
  if (r.visao === "devolucoes") {
    return {
      colunas: ["Devolução", "Venda", "Quando", "Loja", "Valor (R$)", "Motivo"],
      linhas: r.linhas.map((l) => [l.numero, l.vendaNumero, quandoNoCsv(l.quando), loja(l.unidadeId), centavosCsv(l.valor), l.motivo]),
    };
  }
  const opcional = (v: number | null) => (v === null ? "" : centavosCsv(v));
  return {
    colunas: ["Operador", "Loja", "Aberto", "Fechado", "Fundo (R$)", "Esperado (R$)", "Contado (R$)", "Diferença (R$)", "Situação"],
    linhas: r.linhas.map((l) => [pessoa(l.pessoaId), loja(l.unidadeId), quandoNoCsv(l.abertoEm), quandoNoCsv(l.fechadoEm), centavosCsv(l.fundo), opcional(l.esperado), opcional(l.contado), opcional(l.diferenca), l.situacao]),
  };
}
