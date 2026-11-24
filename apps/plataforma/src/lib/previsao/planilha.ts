// Planilha da previsão de caixa (lote L8d: ORA-FIN-009). Feita no NAVEGADOR, a partir do que está na tela:
// assim ela leva a simulação e o saldo de partida digitado, que nunca vão ao servidor (D-038). Semana a
// semana, os fatos que ficam fora da conta e as premissas. Valores em reais com vírgula, sem milhar.
// FIN-009c: três partes (as semanas, os fatos e as premissas), com o tipo de cada célula (lib/csv, Celula), para
// a mesma planilha sair no Excel com número e data; o CSV é o de antes (a linha em branco separa as partes).
import { diaCsv, type Celula, type SecaoCsv } from "../csv";
import type { Estimativa, LinhaProjetada } from "./regras";

export type FatosDaPlanilha = {
  /** Nulo: banco sem a correção #82 (a linha não sai). */
  estornosAConfirmar: { valor: number; quantidade: number } | null;
  financeiras: { valor: number; quantidade: number };
  /** FIN-007b: as financeiras pelo vencimento. Nulo ou ausente: banco sem a migration (o total segue "sem data"). */
  financeirasPorVencimento?: {
    atrasadas: { valor: number; quantidade: number }; noPeriodo: { valor: number; quantidade: number };
    depois: { valor: number; quantidade: number }; semPrazo: { valor: number; quantidade: number };
  } | null;
  aConciliar: { valor: number; quantidade: number };
  gavetas: { valor: number; caixas: number };
};

const v = (centavos: number): Celula => ({ centavos });

// Em palavras: célula que começa com "+" ou "-" ganharia o apóstrofo da proteção contra fórmula.
const percentual = (a: number) => (a === 0 ? "média, sem ajuste" : `${a > 0 ? "mais" : "menos"} ${Math.round(Math.abs(a) * 100)}% sobre a média`);
const vendas = (q: number) => `${q} ${q === 1 ? "venda" : "vendas"}`;

/**
 * FIN-007b: as linhas das financeiras nos fatos. Com o vencimento, cada parte numa linha (a que vence no período já
 * está na conta, semana a semana); sem ele, ou sem prazo de repasse gravado, o total "sem data", como antes.
 */
function linhasDasFinanceiras(f: FatosDaPlanilha): Celula[][] {
  const pv = f.financeirasPorVencimento ?? null;
  if (!pv || pv.semPrazo.quantidade === f.financeiras.quantidade) return [["A receber das financeiras (sem data)", v(f.financeiras.valor), vendas(f.financeiras.quantidade)]];
  return [
    ...(pv.noPeriodo.quantidade > 0 ? [["A receber das financeiras no período (já na conta, pelo prazo de repasse)", v(pv.noPeriodo.valor), vendas(pv.noPeriodo.quantidade)]] : []),
    ...(pv.atrasadas.quantidade > 0 ? [["A receber das financeiras: já passou do prazo (fora da conta)", v(pv.atrasadas.valor), vendas(pv.atrasadas.quantidade)]] : []),
    ...(pv.depois.quantidade > 0 ? [["A receber das financeiras: vence depois do período (fora da conta)", v(pv.depois.valor), vendas(pv.depois.quantidade)]] : []),
    ...(pv.semPrazo.quantidade > 0 ? [["A receber das financeiras (sem data: sem prazo de repasse gravado)", v(pv.semPrazo.valor), vendas(pv.semPrazo.quantidade)]] : []),
  ];
}

export function planilhaDaPrevisao(p: {
  onde: string; linhas: readonly LinhaProjetada[]; estimativa: Estimativa | null; ajuste: number; comSaldo: boolean; fatos: FatosDaPlanilha; gerado: string;
}): SecaoCsv[] {
  const { fatos: f } = p;
  // FIN-007b: a coluna das financeiras só existe quando alguma semana tem repasse com data (com o prazo gravado).
  const comFinanceiras = p.linhas.some((l) => l.financeiras > 0);
  return [{
    colunas: ["Semana", "De", "Até", "Entrada estimada", ...(comFinanceiras ? ["Financeiras (pelo prazo de repasse)"] : []), "Contas (fato)", "Vencidas incluídas", "Diferença", "Saldo previsto"],
    linhas: p.linhas.map((l, i): Celula[] => [i + 1, { dia: l.inicio }, { dia: l.fim }, v(l.entra), ...(comFinanceiras ? [v(l.financeiras)] : []), v(l.sai), v(l.vencidas), v(l.diferenca),
      p.comSaldo && l.saldo !== null ? v(l.saldo) : null]),
  }, {
    colunas: ["Fatos fora da conta", "Valor", "Detalhe"],
    linhas: [
      ...(f.estornosAConfirmar ? [["Estornos de Pix e cartão a confirmar (ainda não saíram)", v(f.estornosAConfirmar.valor), `${f.estornosAConfirmar.quantidade} ${f.estornosAConfirmar.quantidade === 1 ? "pedido" : "pedidos"}`]] : []),
      ...linhasDasFinanceiras(f),
      ["Cartão e Pix a conciliar (últimos 60 dias)", v(f.aConciliar.valor), `${f.aConciliar.quantidade} ${f.aConciliar.quantidade === 1 ? "pagamento" : "pagamentos"}`],
      ["Dinheiro nas gavetas agora", v(f.gavetas.valor), `${f.gavetas.caixas} ${f.gavetas.caixas === 1 ? "caixa aberto" : "caixas abertos"}`],
    ],
  }, {
    colunas: ["Premissas"],
    linhas: [
      ["Entrada estimada", p.estimativa === null
        ? "sem estimativa: sem recebimento nas 8 semanas anteriores"
        : `média de ${p.estimativa.semanas} ${p.estimativa.semanas === 1 ? "semana" : "semanas"} (${diaCsv(p.estimativa.de)} a ${diaCsv(p.estimativa.ate)}): recebido nas lojas menos devoluções pagas e saídas do caixa`],
      ["Devoluções pagas", "o dinheiro devolvido no dia em que saiu do caixa; Pix e cartão só quando o estorno é confirmado, no dia da confirmação"],
      ["Simulação", percentual(p.ajuste)],
      ["Saldo de partida", p.comSaldo ? "digitado na tela (não fica gravado no sistema)" : "não informado"],
      ["Contas", "as em aberto, pelo vencimento; as vencidas na primeira semana"],
      ...(comFinanceiras ? [["Financeiras", "o que cada financeira deve entra na semana do vencimento (o dia da venda mais o prazo de repasse gravado), pelo valor a receber, sem a taxa; o que já passou do prazo e o que não tem prazo ficam fora"]] : []),
      ["Previsão de caixa", p.onde, `gerada em ${p.gerado}`],
    ],
  }];
}
