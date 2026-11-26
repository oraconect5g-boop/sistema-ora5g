// Histórico e detalhe das entradas de mercadoria (lote R1: REV-NOV-001, REV-NOV-009). A tela não lê mais
// as tabelas: lê pelas funções estoque_entradas e estoque_entrada, que conferem a loja do turno e só
// devolvem custo a quem tem custo.ver. O JSON é conferido aqui antes de ir para a tela: formato
// inesperado é FALHA (nulo), nunca lista vazia nem zero.
import { inteiroDoBanco } from "../dinheiro";

/** Posição de HOJE de um IMEI/ICCID que entrou pela entrada ("outra_loja" não diz qual loja). */
export const POSICOES_DO_ITEM = {
  disponivel: "no estoque",
  reservado: "reservado",
  vendido: "vendido",
  em_transito: "em transferência",
  em_assistencia: "na assistência",
  baixado: "fora do estoque (baixado)",
  outra_loja: "em outra loja",
} as const;

export const posicaoDoItem = (situacao: string) =>
  Object.hasOwn(POSICOES_DO_ITEM, situacao) ? POSICOES_DO_ITEM[situacao as keyof typeof POSICOES_DO_ITEM] : situacao;

export type IdentificadorDaEntrada = { identificador: string; imei2?: string; situacao: string; livre: boolean; reentrada: boolean };

export type LinhaDaEntrada = {
  linha: number;
  sku: string;
  nome: string;
  quantidade: number;
  condicao: string;
  /** Centavos. Nulo quando o custo não foi informado OU quando quem lê não tem custo.ver. */
  custoUnitario: number | null;
  /** Quantas unidades da linha voltaram ao estoque pela mesma identidade (reentrada depois de estorno). */
  reentradas: number;
  /** Só no detalhe e só em linha por quantidade: saldo livre de hoje da variação nesta loja. */
  saldoLivre: number | null;
  /** Só no detalhe: IMEI/ICCID da linha, na ordem em que entraram, com a posição de hoje. */
  identificadores: IdentificadorDaEntrada[] | null;
};

export type EntradaLida = {
  id: string;
  numero: number;
  tipo: string;
  documento: string | null;
  situacao: string;
  totalUnidades: number;
  /** Centavos. Nulo quando nenhuma linha teve custo OU quando quem lê não tem custo.ver. */
  totalCusto: number | null;
  criadoEm: string;
  criadoPor: string | null;
  estornadoEm: string | null;
  estornadoPor: string | null;
  motivoEstorno: string | null;
  fornecedor: string | null;
  itens: LinhaDaEntrada[];
};

export type HistoricoDeEntradas = {
  veCusto: boolean;
  /** Todas as entradas da loja, não só as desta página. */
  total: number;
  entradas: EntradaLida[];
  /** Número a partir do qual a página seguinte continua; nulo quando acabou. */
  proxima: number | null;
};

export type EntradaAberta = EntradaLida & { veCusto: boolean };

class FormatoInesperado extends Error {}

const objeto = (v: unknown): Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new FormatoInesperado();
  return v as Record<string, unknown>;
};
const lista = (v: unknown): unknown[] => {
  if (!Array.isArray(v)) throw new FormatoInesperado();
  return v;
};
const texto = (v: unknown): string => {
  if (typeof v !== "string") throw new FormatoInesperado();
  return v;
};
const logico = (v: unknown): boolean => {
  if (typeof v !== "boolean") throw new FormatoInesperado();
  return v;
};
const textoOuNulo = (v: unknown) => (v === null || v === undefined ? null : texto(v));
/** Data e hora do banco (ISO): a tela formata, então texto que não é data também é formato inesperado. */
const instante = (v: unknown): string => {
  const t = texto(v);
  if (Number.isNaN(Date.parse(t))) throw new FormatoInesperado();
  return t;
};
const instanteOuNulo = (v: unknown) => (v === null || v === undefined ? null : instante(v));
const inteiroOuNulo = (v: unknown) => (v === null || v === undefined ? null : inteiroDoBanco(v));

function linhaDaEntrada(v: unknown): LinhaDaEntrada {
  const l = objeto(v);
  return {
    linha: inteiroDoBanco(l.linha),
    sku: texto(l.sku),
    nome: texto(l.nome),
    quantidade: inteiroDoBanco(l.quantidade),
    condicao: texto(l.condicao),
    custoUnitario: inteiroOuNulo(l.custo_unitario),
    reentradas: inteiroDoBanco(l.reentradas),
    saldoLivre: inteiroOuNulo(l.saldo_livre),
    identificadores: l.identificadores === null || l.identificadores === undefined ? null : lista(l.identificadores).map((x) => {
      const i = objeto(x);
      return { identificador: texto(i.identificador), ...(i.imei2 == null ? {} : { imei2: texto(i.imei2) }), situacao: texto(i.situacao), livre: logico(i.livre), reentrada: logico(i.reentrada) };
    }),
  };
}

function entradaLida(v: unknown): EntradaLida {
  const e = objeto(v);
  return {
    id: texto(e.id),
    numero: inteiroDoBanco(e.numero),
    tipo: texto(e.tipo),
    documento: textoOuNulo(e.documento),
    situacao: texto(e.situacao),
    totalUnidades: inteiroDoBanco(e.total_unidades),
    totalCusto: inteiroOuNulo(e.total_custo),
    criadoEm: instante(e.criado_em),
    criadoPor: textoOuNulo(e.criado_por),
    estornadoEm: instanteOuNulo(e.estornado_em),
    estornadoPor: textoOuNulo(e.estornado_por),
    motivoEstorno: textoOuNulo(e.motivo_estorno),
    fornecedor: textoOuNulo(e.fornecedor),
    itens: lista(e.itens).map(linhaDaEntrada),
  };
}

/** Resposta de estoque_entradas. Nulo = formato inesperado: a tela trata como falha, não como "sem entradas". */
export function lerHistoricoDeEntradas(json: unknown): HistoricoDeEntradas | null {
  try {
    const h = objeto(json);
    return { veCusto: logico(h.ve_custo), total: inteiroDoBanco(h.total), entradas: lista(h.entradas).map(entradaLida), proxima: inteiroOuNulo(h.proxima) };
  } catch {
    return null;
  }
}

/** Resposta de estoque_entrada (uma entrada com os IMEI/ICCID e a posição de hoje). Nulo = formato inesperado. */
export function lerEntradaAberta(json: unknown): EntradaAberta | null {
  try {
    const e = objeto(json);
    return { ...entradaLida(e), veCusto: logico(e.ve_custo) };
  } catch {
    return null;
  }
}

/** Quantos IMEI/ICCID em cada posição, na ordem do catálogo de posições ("118 no estoque, 2 vendido"). */
export function resumoDasPosicoes(identificadores: readonly IdentificadorDaEntrada[]): string {
  const contagem = new Map<string, number>();
  for (const i of identificadores) contagem.set(i.situacao, (contagem.get(i.situacao) ?? 0) + 1);
  const ordem = Object.keys(POSICOES_DO_ITEM);
  return [...contagem.entries()]
    .sort(([a], [b]) => (ordem.indexOf(a) + 1 || 99) - (ordem.indexOf(b) + 1 || 99))
    .map(([situacao, n]) => `${n} ${posicaoDoItem(situacao)}`)
    .join(", ");
}

export type ImpedimentosDoEstorno = {
  /** IMEI/ICCID que não estão livres nesta loja hoje. */
  identificadores: IdentificadorDaEntrada[];
  /** Itens por quantidade cujo saldo livre de hoje não cobre o que a entrada trouxe. */
  quantidades: { sku: string; entrou: number; livre: number }[];
};

/**
 * O que impediria o estorno HOJE, pelo que o detalhe mostra. É um aviso para a tela: quem decide é o banco,
 * que confere de novo com os itens travados. Linhas da mesma variação disputam o mesmo saldo livre.
 */
export function impedimentosDoEstorno(entrada: EntradaLida): ImpedimentosDoEstorno {
  const identificadores = entrada.itens.flatMap((l) => (l.identificadores ?? []).filter((i) => !i.livre));
  const porSku = new Map<string, { entrou: number; livre: number }>();
  for (const l of entrada.itens) {
    if (l.saldoLivre === null) continue;
    const atual = porSku.get(l.sku);
    porSku.set(l.sku, { entrou: (atual?.entrou ?? 0) + l.quantidade, livre: l.saldoLivre });
  }
  const quantidades = [...porSku.entries()].filter(([, q]) => q.livre < q.entrou).map(([sku, q]) => ({ sku, ...q }));
  return { identificadores, quantidades };
}
