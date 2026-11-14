// Resultado do mês (lote L8b: ORA-FIN-002 e ORA-FIN-008): leitura estrita de public.resultado_do_mes,
// somado no banco. Cada parte é conferida contra as outras (as linhas fecham com o resultado, as lojas com a
// rede, as categorias com as despesas, o último mês da série com o mês pedido): conta que não fecha é falha,
// nunca número. Banco sem a função é "indisponível"; quem não pode ver é "recusado".
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto, inteiro as n, lista, objeto, texto as t, textoOuNulo, type Leitura, type Linha } from "../leitura-do-banco";
import { somarMeses } from "../metas/painel";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

export type LinhasDoResultado = {
  vendas: number; bruto: number; descontos: number; vendido: number; devolvido: number; cancelado: number; receitaLiquida: number;
  custoVendido: number; custoDevolvido: number; custoCancelado: number; cmv: number; margemBruta: number;
  vendidoComCusto: number; vendidoSemCusto: number; itensSemCusto: number;
  taxas: number; pagamentosConciliados: number; aConciliar: number; aConciliarValor: number;
  despesas: number; despesasEmAberto: number; saidasQuantidade: number; saidasCaixa: number;
  /** Na rede, as contas da rede; na loja, a parte dela. */
  rede: number; redeEmAberto: number; naoDividido: number;
  /** A receita (positiva) que pesa na divisão: da loja (ou de todas, na rede) e da rede inteira. */
  peso: number; pesoDaRede: number;
  resultado: number;
};
export type MesDoResultado = { mes: string; receitaLiquida: number; cmv: number; taxas: number; despesas: number; saidasCaixa: number; rede: number; resultado: number };
export type LojaDoResultado = {
  unidade: string; nome: string | null; receitaLiquida: number; cmv: number; margemBruta: number; taxas: number; despesas: number; saidasCaixa: number; rede: number; resultado: number;
};
export type ResultadoDoMes = {
  mes: string; hoje: string; emAndamento: boolean; unidade: string | null;
  linhas: LinhasDoResultado;
  meses: MesDoResultado[];
  porCategoria: { categoria: string; nome: string; valor: number; emAberto: number }[];
  foraDoResultado: { categoria: string; nome: string; valor: number }[];
  /** Só na rede: cada loja com fato no mês, do maior resultado para o menor. */
  porLoja: LojaDoResultado[];
  /** As lojas ativas da rede, para o filtro. */
  lojas: { id: string; nome: string }[];
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const dia = (l: Linha, campo: string) => {
  const v = t(l, campo);
  if (!DIA.test(v)) throw new RespostaInesperada(campo);
  return v;
};
const uuid = (l: Linha, campo: string) => {
  const v = t(l, campo);
  if (!ehUuid(v)) throw new RespostaInesperada(campo);
  return v;
};
const somar = <T>(itens: readonly T[], valor: (i: T) => number) => itens.reduce((s, i) => s + valor(i), 0);

function lerLinhas(l: Linha): LinhasDoResultado {
  return {
    vendas: n(l, "vendas"), bruto: n(l, "bruto"), descontos: n(l, "descontos"), vendido: n(l, "vendido"), devolvido: n(l, "devolvido"),
    cancelado: n(l, "cancelado"), receitaLiquida: n(l, "receita_liquida"), custoVendido: n(l, "custo_vendido"), custoDevolvido: n(l, "custo_devolvido"),
    custoCancelado: n(l, "custo_cancelado"), cmv: n(l, "cmv"), margemBruta: n(l, "margem_bruta"), vendidoComCusto: n(l, "vendido_com_custo"),
    vendidoSemCusto: n(l, "vendido_sem_custo"), itensSemCusto: n(l, "itens_sem_custo"), taxas: n(l, "taxas"),
    pagamentosConciliados: n(l, "pagamentos_conciliados"), aConciliar: n(l, "a_conciliar"), aConciliarValor: n(l, "a_conciliar_valor"),
    despesas: n(l, "despesas"), despesasEmAberto: n(l, "despesas_em_aberto"), saidasQuantidade: n(l, "saidas_quantidade"), saidasCaixa: n(l, "saidas_caixa"),
    rede: n(l, "rede"), redeEmAberto: n(l, "rede_em_aberto"), naoDividido: n(l, "nao_dividido"), peso: n(l, "peso"), pesoDaRede: n(l, "peso_da_rede"),
    resultado: n(l, "resultado"),
  };
}

/** As contas de uma linha fecham: do bruto ao resultado, sem parte negativa onde não pode haver. */
function linhasFecham(l: LinhasDoResultado): boolean {
  const naoNegativos = [
    l.vendas, l.bruto, l.descontos, l.vendido, l.devolvido, l.cancelado, l.custoVendido, l.custoDevolvido, l.custoCancelado,
    l.vendidoComCusto, l.vendidoSemCusto, l.itensSemCusto, l.taxas, l.pagamentosConciliados, l.aConciliar, l.aConciliarValor,
    l.despesas, l.despesasEmAberto, l.saidasQuantidade, l.saidasCaixa, l.rede, l.redeEmAberto, l.naoDividido, l.peso, l.pesoDaRede,
  ];
  return naoNegativos.every((v) => v >= 0)
    && l.vendido === l.bruto - l.descontos
    && l.receitaLiquida === l.vendido - l.devolvido - l.cancelado
    && l.cmv === l.custoVendido - l.custoDevolvido - l.custoCancelado
    && l.margemBruta === l.receitaLiquida - l.cmv
    && l.vendidoComCusto + l.vendidoSemCusto === l.vendido
    && l.despesasEmAberto <= l.despesas && l.redeEmAberto <= l.rede && l.naoDividido <= l.rede && l.peso <= l.pesoDaRede
    && (l.saidasQuantidade === 0) === (l.saidasCaixa === 0)
    && (l.aConciliar === 0) === (l.aConciliarValor === 0)
    && l.resultado === l.margemBruta - l.taxas - l.despesas - l.saidasCaixa - l.rede;
}

/** Converte a resposta. Qualquer parte que não bate com as outras é falha (RespostaInesperada). */
export function lerResultadoDoMes(dado: unknown, pedido: { mes: string; unidade: string | null; meses: number }): ResultadoDoMes {
  if (!ehObjeto(dado)) throw new RespostaInesperada("resultado_do_mes");
  if (typeof dado.em_andamento !== "boolean") throw new RespostaInesperada("em_andamento");
  if (dado.unidade !== null && !ehUuid(dado.unidade)) throw new RespostaInesperada("unidade");
  const r: ResultadoDoMes = {
    mes: dia(dado, "mes"),
    hoje: dia(dado, "hoje"),
    emAndamento: dado.em_andamento,
    unidade: dado.unidade as string | null,
    linhas: lerLinhas(objeto(dado, "linhas")),
    meses: lista(dado, "meses").map((m) => ({
      mes: dia(m, "mes"), receitaLiquida: n(m, "receita_liquida"), cmv: n(m, "cmv"), taxas: n(m, "taxas"), despesas: n(m, "despesas"),
      saidasCaixa: n(m, "saidas_caixa"), rede: n(m, "rede"), resultado: n(m, "resultado"),
    })),
    porCategoria: lista(dado, "por_categoria").map((c) => ({ categoria: uuid(c, "categoria"), nome: t(c, "nome"), valor: n(c, "valor"), emAberto: n(c, "em_aberto") })),
    foraDoResultado: lista(dado, "fora_do_resultado").map((c) => ({ categoria: uuid(c, "categoria"), nome: t(c, "nome"), valor: n(c, "valor") })),
    porLoja: lista(dado, "por_loja").map((l) => ({
      unidade: uuid(l, "unidade"), nome: textoOuNulo(l, "nome"), receitaLiquida: n(l, "receita_liquida"), cmv: n(l, "cmv"), margemBruta: n(l, "margem_bruta"),
      taxas: n(l, "taxas"), despesas: n(l, "despesas"), saidasCaixa: n(l, "saidas_caixa"), rede: n(l, "rede"), resultado: n(l, "resultado"),
    })),
    lojas: lista(dado, "lojas").map((l) => ({ id: uuid(l, "id"), nome: t(l, "nome") })),
  };
  const { linhas: l, meses } = r;
  const naRede = r.unidade === null;
  const ultimo = meses.at(-1);
  const serieFecha = meses.length === pedido.meses
    && meses.every((m, i) => m.mes === somarMeses(r.mes, i - meses.length + 1)
      && m.taxas >= 0 && m.despesas >= 0 && m.saidasCaixa >= 0 && m.rede >= 0
      && m.resultado === m.receitaLiquida - m.cmv - m.taxas - m.despesas - m.saidasCaixa - m.rede)
    && ultimo !== undefined && ultimo.receitaLiquida === l.receitaLiquida && ultimo.cmv === l.cmv && ultimo.taxas === l.taxas
    && ultimo.despesas === l.despesas && ultimo.saidasCaixa === l.saidasCaixa && ultimo.rede === l.rede && ultimo.resultado === l.resultado;
  const lojasFecham = naRede
    ? somar(r.porLoja, (x) => x.resultado) === l.resultado + l.naoDividido
      && somar(r.porLoja, (x) => x.receitaLiquida) === l.receitaLiquida
      && somar(r.porLoja, (x) => x.rede) === l.rede - l.naoDividido
      && somar(r.porLoja, (x) => x.despesas) === l.despesas
      && r.porLoja.every((x) => x.margemBruta === x.receitaLiquida - x.cmv && x.rede >= 0 && x.taxas >= 0 && x.despesas >= 0 && x.saidasCaixa >= 0
        && x.resultado === x.margemBruta - x.taxas - x.despesas - x.saidasCaixa - x.rede)
      && l.peso === l.pesoDaRede
    : r.porLoja.length === 0 && l.naoDividido === 0 && l.redeEmAberto === 0;
  const categoriasFecham = somar(r.porCategoria, (c) => c.valor) === l.despesas + (naRede ? l.rede : 0)
    && somar(r.porCategoria, (c) => c.emAberto) === l.despesasEmAberto + l.redeEmAberto
    && r.porCategoria.every((c) => c.valor > 0 && c.emAberto >= 0 && c.emAberto <= c.valor)
    && r.foraDoResultado.every((c) => c.valor > 0);
  const fecha = r.mes === pedido.mes && r.unidade === pedido.unidade && r.mes.endsWith("-01") && r.mes <= r.hoje
    && r.emAndamento === (r.hoje.slice(0, 7) === r.mes.slice(0, 7))
    && linhasFecham(l) && serieFecha && lojasFecham && categoriasFecham;
  if (!fecha) throw new RespostaInesperada("resultado_do_mes");
  return r;
}

/**
 * O resultado do mês da rede (unidade nula) ou de uma loja, com a série dos últimos meses. "recusado": o
 * banco não deixou (não é o dono, ou a loja não é da rede de quem pede).
 */
export async function consultarResultado(
  supabase: Cliente, mes: string, unidade: string | null, meses: number,
): Promise<Leitura<ResultadoDoMes> | { estado: "recusado" }> {
  const r = await supabase.rpc("resultado_do_mes", { p_mes: mes, p_unidade: unidade as string, p_meses: meses });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    if (r.error.code === "42501") return { estado: "recusado" };
    console.error("resultado do mês: falha ao consultar resultado_do_mes", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerResultadoDoMes(r.data, { mes, unidade, meses }) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("resultado do mês: resposta inesperada de resultado_do_mes");
    return { estado: "falha" };
  }
}
