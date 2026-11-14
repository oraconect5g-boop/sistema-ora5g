// Planilha do resultado do mês (lote L8d: ORA-FIN-009). O mesmo número da tela, em CSV para o Excel em
// português: o demonstrativo (na rede, uma coluna por loja), as contas por categoria, o que ficou fora do
// resultado e as observações que a tela mostra como aviso. Valores em reais com vírgula, sem milhar.
import { centavosCsv as v, diaCsv, type SecaoCsv } from "../csv";
import { nomeDoMes } from "../metas/painel";
import type { LojaDoResultado, ResultadoDoMes } from "./consulta";

const maiuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

export function planilhaDoResultado(r: ResultadoDoMes, onde: string, gerado: string): SecaoCsv[] {
  const l = r.linhas;
  const naRede = r.unidade === null;
  const lojas = [...r.porLoja].sort((a, b) => (a.nome ?? "~").localeCompare(b.nome ?? "~", "pt-BR"));
  const daLoja = (f: (x: LojaDoResultado) => number) => (naRede ? lojas.map((x) => v(f(x))) : []);
  const vazio = naRede ? lojas.map(() => "") : [];
  const mes = `${maiuscula(nomeDoMes(r.mes))}${r.emAndamento ? ` (até ${diaCsv(r.hoje)})` : ""}`;

  const demonstrativo: SecaoCsv = {
    colunas: naRede ? ["Linha", "Rede inteira", ...lojas.map((x) => x.nome ?? "Loja desativada")] : ["Linha", "Valor"],
    linhas: [
      ["Vendas concluídas (desconto já abatido)", v(l.vendido), ...vazio],
      ["Descontos dados", v(l.descontos), ...vazio],
      ["Devoluções e cancelamentos", v(l.devolvido + l.cancelado), ...vazio],
      ["Receita líquida", v(l.receitaLiquida), ...daLoja((x) => x.receitaLiquida)],
      ["Custo das mercadorias", v(l.cmv), ...daLoja((x) => x.cmv)],
      ["Margem bruta", v(l.margemBruta), ...daLoja((x) => x.margemBruta)],
      ["Taxas de cartão e Pix", v(l.taxas), ...daLoja((x) => x.taxas)],
      [naRede ? "Contas das lojas" : "Contas da loja", v(l.despesas), ...daLoja((x) => x.despesas)],
      ["Dinheiro do caixa (saídas autorizadas)", v(l.saidasCaixa), ...daLoja((x) => x.saidasCaixa)],
      [naRede ? "Contas da rede (nas lojas, a parte de cada uma)" : "Parte das contas da rede", v(l.rede), ...daLoja((x) => x.rede)],
      ["Resultado do mês", v(l.resultado), ...daLoja((x) => x.resultado)],
      ...(naRede && l.naoDividido > 0 ? [["Contas da rede sem divisão (mês sem venda)", v(l.naoDividido), ...vazio]] : []),
    ],
  };
  const observacoes: (string | number)[][] = [
    ...(l.vendidoSemCusto > 0 ? [["Vendido sem custo cadastrado: o custo não entra e o resultado aparece maior", v(l.vendidoSemCusto), `${l.itensSemCusto} ${l.itensSemCusto === 1 ? "item" : "itens"}`]] : []),
    ...(l.aConciliar > 0 ? [["Cartão e Pix ainda sem conciliação: a taxa deles não entra", v(l.aConciliarValor), `${l.aConciliar} ${l.aConciliar === 1 ? "pagamento" : "pagamentos"}`]] : []),
    ...(!naRede && l.pesoDaRede > 0 ? [["Parte da loja na receita líquida da rede (divide as contas da rede)", `${((l.peso / l.pesoDaRede) * 100).toFixed(1).replace(".", ",")}%`]] : []),
    ["Taxa da PayJoy e da Aiva", "não entra", "falta o contrato (prazo e taxa)"],
    ["Imposto sobre a venda e comissão", "só os lançados nas contas a pagar"],
    ["Contas a pagar", "pelo mês do vencimento", "a paga pelo valor pago; a cancelada não entra"],
  ];
  return [
    { linhas: [["Resultado do mês", mes, onde], ["Gerado em", gerado, "Resultado gerencial com o que está lançado no sistema; não é a contabilidade"]] },
    demonstrativo,
    { colunas: ["Contas por categoria (pelo vencimento)", "Valor", "Em aberto"], linhas: r.porCategoria.map((c) => [c.nome, v(c.valor), v(c.emAberto)]) },
    ...(r.foraDoResultado.length > 0 ? [{ colunas: ["Fora do resultado (compra de mercadoria e outras)", "Valor"], linhas: r.foraDoResultado.map((c) => [c.nome, v(c.valor)]) }] : []),
    { colunas: ["Observações"], linhas: observacoes },
  ];
}
