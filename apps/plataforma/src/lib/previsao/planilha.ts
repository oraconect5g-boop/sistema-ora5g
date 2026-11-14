// Planilha da previsão de caixa (lote L8d: ORA-FIN-009). Feita no NAVEGADOR, a partir do que está na tela:
// assim ela leva a simulação e o saldo de partida digitado, que nunca vão ao servidor (D-038). Semana a
// semana, os fatos que ficam fora da conta e as premissas. Valores em reais com vírgula, sem milhar.
import { centavosCsv as v, diaCsv } from "../csv";
import type { Estimativa, LinhaProjetada } from "./regras";

export type FatosDaPlanilha = {
  /** Nulo: banco sem a correção #82 (a linha não sai). */
  estornosAConfirmar: { valor: number; quantidade: number } | null;
  financeiras: { valor: number; quantidade: number };
  aConciliar: { valor: number; quantidade: number };
  gavetas: { valor: number; caixas: number };
};

// Em palavras: célula que começa com "+" ou "-" ganharia o apóstrofo da proteção contra fórmula.
const percentual = (a: number) => (a === 0 ? "média, sem ajuste" : `${a > 0 ? "mais" : "menos"} ${Math.round(Math.abs(a) * 100)}% sobre a média`);

export function planilhaDaPrevisao(p: {
  onde: string; linhas: readonly LinhaProjetada[]; estimativa: Estimativa | null; ajuste: number; comSaldo: boolean; fatos: FatosDaPlanilha; gerado: string;
}): { colunas: string[]; linhas: (string | number)[][] } {
  const { fatos: f } = p;
  return {
    colunas: ["Semana", "De", "Até", "Entrada estimada", "Contas (fato)", "Vencidas incluídas", "Diferença", "Saldo previsto"],
    linhas: [
      ...p.linhas.map((l, i) => [i + 1, diaCsv(l.inicio), diaCsv(l.fim), v(l.entra), v(l.sai), v(l.vencidas), v(l.diferenca), p.comSaldo && l.saldo !== null ? v(l.saldo) : ""]),
      [],
      ["Fatos fora da conta", "Valor", "Detalhe"],
      ...(f.estornosAConfirmar ? [["Estornos de Pix e cartão a confirmar (ainda não saíram)", v(f.estornosAConfirmar.valor), `${f.estornosAConfirmar.quantidade} ${f.estornosAConfirmar.quantidade === 1 ? "pedido" : "pedidos"}`]] : []),
      ["A receber das financeiras (sem data)", v(f.financeiras.valor), `${f.financeiras.quantidade} ${f.financeiras.quantidade === 1 ? "venda" : "vendas"}`],
      ["Cartão e Pix a conciliar (últimos 60 dias)", v(f.aConciliar.valor), `${f.aConciliar.quantidade} ${f.aConciliar.quantidade === 1 ? "pagamento" : "pagamentos"}`],
      ["Dinheiro nas gavetas agora", v(f.gavetas.valor), `${f.gavetas.caixas} ${f.gavetas.caixas === 1 ? "caixa aberto" : "caixas abertos"}`],
      [],
      ["Premissas"],
      ["Entrada estimada", p.estimativa === null
        ? "sem estimativa: sem recebimento nas 8 semanas anteriores"
        : `média de ${p.estimativa.semanas} ${p.estimativa.semanas === 1 ? "semana" : "semanas"} (${diaCsv(p.estimativa.de)} a ${diaCsv(p.estimativa.ate)}): recebido nas lojas menos devoluções pagas e saídas do caixa`],
      ["Devoluções pagas", "o dinheiro devolvido no dia em que saiu do caixa; Pix e cartão só quando o estorno é confirmado, no dia da confirmação"],
      ["Simulação", percentual(p.ajuste)],
      ["Saldo de partida", p.comSaldo ? "digitado na tela (não fica gravado no sistema)" : "não informado"],
      ["Contas", "as em aberto, pelo vencimento; as vencidas na primeira semana"],
      ["Previsão de caixa", p.onde, `gerada em ${p.gerado}`],
    ],
  };
}
