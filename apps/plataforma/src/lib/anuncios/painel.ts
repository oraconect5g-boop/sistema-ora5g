// O painel dos anúncios (lote META-a: ORA-META-003, ORA-META-004 e ORA-META-006; ADR-017): a leitura estrita da resposta de
// public.anuncios_painel e as fórmulas. Forma inesperada é falha (a tela mostra falha de leitura), nunca zero. A métrica
// com divisor zero não existe (nulo, "—" na tela): nada de dividir por zero nem de inventar um número.
import { RespostaInesperada } from "../financeiro/painel";
import { contagem, ehObjeto, inteiro, lista, textoOuNulo, type Linha } from "../leitura-do-banco";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type CampanhaDoPainel = {
  chave: string; campanha: string; gasto: number; impressoes: number | null; cliques: number | null; resultados: number | null; dias: number;
  reservas: number; oportunidades: number; vendas: number;
  /** As vendas da campanha devolvidas por inteiro (todas as unidades de volta; lote AUD-a). */
  vendasDevolvidas: number;
  /** O valor das vendas (bruto); a receita líquida é receita − devolvido. */
  receita: number;
  /** O valor devolvido dessas vendas, em qualquer data até agora (lote AUD-a, aceite A14). */
  devolvido: number;
  /** A margem dos itens com custo, já sem a das unidades devolvidas. */
  margem: number; vendasSemCusto: number; recebido: number;
  /** O que voltou ao cliente em dinheiro, Pix ou cartão (o vale-troca fica com a loja). */
  reembolsado: number;
  /** Os clientes cuja primeira compra foi a da campanha (a devolvida por inteiro não conta). */
  clientesNovos: number;
};
export type LojaDoPainel = { chave: string; unidade: string; loja: string; contatos: number; vendas: number; receita: number; devolvido: number };
export type VendedorDoPainel = { chave: string; vendedor: string; vendas: number; receita: number; devolvido: number };
export type PainelDosAnuncios = {
  campanhas: CampanhaDoPainel[]; porLoja: LojaDoPainel[]; porVendedor: VendedorDoPainel[]; contatosSemCampanha: number; importadoAte: string | null;
};

const contagemOuNula = (l: Linha, chave: string) => (l[chave] === null || l[chave] === undefined ? null : contagem(l, chave));
const uuid = (l: Linha, chave: string) => {
  const v = l[chave];
  if (typeof v !== "string" || !UUID.test(v)) throw new RespostaInesperada(chave);
  return v;
};
const texto = (l: Linha, chave: string) => {
  const v = textoOuNulo(l, chave);
  if (v === null || v === "") throw new RespostaInesperada(chave);
  return v;
};

/** Converte a resposta de public.anuncios_painel. */
export function lerPainelDosAnuncios(dado: unknown): PainelDosAnuncios {
  if (!ehObjeto(dado)) throw new RespostaInesperada("anuncios_painel");
  const campanhas = lista(dado, "campanhas").map((l): CampanhaDoPainel => {
    const c: CampanhaDoPainel = {
      chave: texto(l, "chave"), campanha: texto(l, "campanha"), gasto: contagem(l, "gasto"),
      impressoes: contagemOuNula(l, "impressoes"), cliques: contagemOuNula(l, "cliques"), resultados: contagemOuNula(l, "resultados"),
      dias: contagem(l, "dias"), reservas: contagem(l, "reservas"), oportunidades: contagem(l, "oportunidades"), vendas: contagem(l, "vendas"),
      vendasDevolvidas: contagem(l, "vendas_devolvidas"), receita: inteiro(l, "receita"), devolvido: contagem(l, "devolvido"), margem: inteiro(l, "margem"),
      vendasSemCusto: contagem(l, "vendas_sem_custo"), recebido: inteiro(l, "recebido"), reembolsado: contagem(l, "reembolsado"),
      clientesNovos: contagem(l, "clientes_novos"),
    };
    // As partes nunca passam do todo: o que passar é resposta errada, não número para mostrar.
    if (c.vendasSemCusto > c.vendas || c.vendasDevolvidas > c.vendas || c.clientesNovos > c.vendas - c.vendasDevolvidas
      || c.vendas > c.reservas + c.oportunidades || c.devolvido > Math.max(c.receita, 0)) throw new RespostaInesperada("contagens");
    return c;
  });
  const porLoja = lista(dado, "por_loja").map((l) => ({
    chave: texto(l, "chave"), unidade: uuid(l, "unidade_id"), loja: texto(l, "loja"), contatos: contagem(l, "contatos"), vendas: contagem(l, "vendas"),
    receita: inteiro(l, "receita"), devolvido: contagem(l, "devolvido"),
  }));
  const porVendedor = lista(dado, "por_vendedor").map((l) => ({
    chave: texto(l, "chave"), vendedor: uuid(l, "vendedor_id"), vendas: contagem(l, "vendas"), receita: inteiro(l, "receita"), devolvido: contagem(l, "devolvido"),
  }));
  const importadoAte = textoOuNulo(dado, "importado_ate");
  if (importadoAte !== null && !/^\d{4}-\d{2}-\d{2}$/.test(importadoAte)) throw new RespostaInesperada("importado_ate");
  return { campanhas, porLoja, porVendedor, contatosSemCampanha: contagem(dado, "contatos_sem_campanha"), importadoAte };
}

/**
 * As fórmulas do ADR-017, com o divisor zero dando nulo. Desde o lote AUD-a (aceite A14), as devoluções saem de tudo: o
 * CPA divide pelas vendas que ficaram (sem as devolvidas por inteiro), o ROAS usa a receita líquida (receita − devolvido)
 * e a margem já vem sem as unidades devolvidas; o "recebido de fato" desconta o reembolso.
 */
const razao = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);
export function metricasDaCampanha(c: CampanhaDoPainel) {
  const contatos = c.reservas + c.oportunidades;
  const vendasQueFicaram = c.vendas - c.vendasDevolvidas;
  const receitaLiquida = c.receita - c.devolvido;
  return {
    contatos,
    vendasQueFicaram,
    receitaLiquida,
    recebidoLiquido: c.recebido - c.reembolsado,
    ctr: razao(c.cliques, c.impressoes),
    cpc: razao(c.gasto, c.cliques),
    custoPorResultado: razao(c.gasto, c.resultados),
    cpl: razao(c.gasto, contatos),
    cpa: razao(c.gasto, vendasQueFicaram),
    roas: razao(receitaLiquida, c.gasto),
    roasDaMargem: razao(c.margem, c.gasto),
    cac: razao(c.gasto, c.clientesNovos),
  };
}

/** O total do período, somado das campanhas (as métricas do total saem das somas, não da média das campanhas). */
export function totalDasCampanhas(campanhas: readonly CampanhaDoPainel[]): CampanhaDoPainel {
  const soma = (f: (c: CampanhaDoPainel) => number) => campanhas.reduce((s, c) => s + f(c), 0);
  const somaOuNula = (f: (c: CampanhaDoPainel) => number | null) => (campanhas.some((c) => f(c) !== null) ? soma((c) => f(c) ?? 0) : null);
  return {
    chave: "total", campanha: "Total", gasto: soma((c) => c.gasto), impressoes: somaOuNula((c) => c.impressoes), cliques: somaOuNula((c) => c.cliques),
    resultados: somaOuNula((c) => c.resultados), dias: soma((c) => c.dias), reservas: soma((c) => c.reservas), oportunidades: soma((c) => c.oportunidades),
    vendas: soma((c) => c.vendas), vendasDevolvidas: soma((c) => c.vendasDevolvidas), receita: soma((c) => c.receita), devolvido: soma((c) => c.devolvido),
    margem: soma((c) => c.margem), vendasSemCusto: soma((c) => c.vendasSemCusto), recebido: soma((c) => c.recebido), reembolsado: soma((c) => c.reembolsado),
    clientesNovos: soma((c) => c.clientesNovos),
  };
}
