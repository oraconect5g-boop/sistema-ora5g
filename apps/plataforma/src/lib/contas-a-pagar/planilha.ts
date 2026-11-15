// Planilha das contas a pagar (lote L8d: ORA-FIN-009): a mesma lista e o mesmo filtro da tela (em aberto;
// pagas ou canceladas dos últimos 60 dias), com todas as colunas da conta, em CSV para o Excel em português.
// FIN-009c: dinheiro e datas vão com o tipo (lib/csv, Celula), para o Excel guardar número e data; o CSV sai igual,
// e o aviso do corte fica numa parte à parte, depois da tabela (no Excel, fora do filtro).
import type { Celula, SecaoCsv } from "../csv";
import type { ContaAPagar } from "./consulta";
import { FORMAS, SITUACOES_DA_CONTA, VISOES_DAS_CONTAS, type VisaoDasContas } from "./regras";

export type NomesDaPlanilha = {
  loja: (id: string | null) => string;
  categoria: (id: string) => string;
  fornecedor: (id: string | null) => string | null;
};

/** O dia de São Paulo de um instante ("2026-11-13T02:00:00Z" → "2026-11-12"). */
const diaDoInstante = (instante: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(instante));
const v = (centavos: number): Celula => ({ centavos });

export function planilhaDasContas(contas: readonly ContaAPagar[], visao: VisaoDasContas, onde: string, gerado: string, nomes: NomesDaPlanilha, cortada: number | null): SecaoCsv[] {
  return [
    { linhas: [["Contas a pagar", VISOES_DAS_CONTAS[visao], onde], ["Gerado em", gerado, `${contas.length} ${contas.length === 1 ? "conta" : "contas"}`]] },
    {
      colunas: [
        "Descrição", "Categoria", "Onde", "Fornecedor", "Documento", "Valor", "Vencimento", "Forma", "Parcela", "Situação",
        "Pago em", "Valor pago", "Referência do pagamento", "Cancelada em", "Motivo do cancelamento",
      ],
      linhas: contas.map((c): Celula[] => [
        c.descricao, nomes.categoria(c.categoriaId), nomes.loja(c.unidadeId), nomes.fornecedor(c.fornecedorId) ?? "", c.documento ?? "",
        v(c.valor), { dia: c.vencimento }, FORMAS[c.forma].nome, c.forma === "unica" ? "" : `${c.parcela} de ${c.parcelas}`, SITUACOES_DA_CONTA[c.situacao],
        c.pagaEm ? { dia: c.pagaEm } : null, c.valorPago === null ? null : v(c.valorPago), c.referencia ?? "",
        c.canceladaEm ? { dia: diaDoInstante(c.canceladaEm) } : null, c.motivoCancelamento ?? "",
      ]),
    },
    ...(cortada === null ? [] : [{ linhas: [[`Atenção: a exportação vai até ${cortada.toLocaleString("pt-BR")} contas; escolha uma loja para ver o resto.`]] }]),
  ];
}
