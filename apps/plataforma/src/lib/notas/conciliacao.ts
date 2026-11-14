// Conciliação fiscal (lote L10b: ORA-FISC-008 em parte). Leitura estrita de public.notas_conciliacao, os períodos (os
// mesmos dos relatórios da assistência) e as mensagens da conferência de divergência. O banco decide quem vê
// (nota.aprovar) e conta tudo (packages/banco/src/conciliacao-fiscal.test.ts); aqui só se confere a resposta: forma
// inesperada ou conta que não fecha é falha de leitura, nunca zero.
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto, inteiro as n, inteiroOuNulo, lista, objeto, texto as t, textoOuNulo, type Leitura, type Linha } from "../leitura-do-banco";

import type { Periodo } from "../assistencia/relatorio";

export { ehPeriodo, intervaloDoPeriodo, PERIODOS, type Periodo } from "../assistencia/relatorio";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export const DIVERGENCIAS = {
  chave_fora_do_mes: "Chave de outro mês",
  numero_repetido: "Número de nota repetido",
  devolucao_sem_nota: "Devolução sem nota",
} as const;
export type TipoDeDivergencia = keyof typeof DIVERGENCIAS;
export const ehTipoDeDivergencia = (v: unknown): v is TipoDeDivergencia => typeof v === "string" && Object.hasOwn(DIVERGENCIAS, v);

/** O que explica cada divergência para quem confere (sem regra do contador: só o que não pode estar certo). */
export const EXPLICACAO_DAS_DIVERGENCIAS: Record<TipoDeDivergencia, string> = {
  chave_fora_do_mes: "O mês gravado na chave de acesso é de antes da venda ou de depois do registro: confira no portal se a chave é desta venda.",
  numero_repetido: "O mesmo número de nota (CNPJ, modelo, série e número) está registrado em outra venda: uma das duas chaves está errada.",
  devolucao_sem_nota: "A venda tinha nota emitida, foi devolvida e o pedido da nota de devolução foi cancelado.",
};

const PENDENTES = ["aguardando_aprovacao", "correcao_solicitada", "aprovada"] as const;
export type SituacaoPendente = (typeof PENDENTES)[number];
const ehPendente = (v: unknown): v is SituacaoPendente => typeof v === "string" && (PENDENTES as readonly string[]).includes(v);
const FALTAS = ["pdf", "xml", "protocolo"] as const;
export type Falta = (typeof FALTAS)[number];
export const NOME_DA_FALTA: Record<Falta, string> = { pdf: "PDF", xml: "XML", protocolo: "protocolo" };

const CAMPOS = {
  vendas: "vendas", valorVendas: "valor_vendas", comNota: "com_nota", valorComNota: "valor_com_nota", emAndamento: "em_andamento",
  valorEmAndamento: "valor_em_andamento", semPedido: "sem_pedido", valorSemPedido: "valor_sem_pedido", devolvidasSemNota: "devolvidas_sem_nota",
  valorDevolvidasSemNota: "valor_devolvidas_sem_nota", atrasadas: "atrasadas", foraDoPrazo: "fora_do_prazo", notasEmitidas: "notas_emitidas",
  semPdf: "sem_pdf", semXml: "sem_xml", semProtocolo: "sem_protocolo", devolucoes: "devolucoes", devolucoesEmitidas: "devolucoes_emitidas",
  devolucoesPendentes: "devolucoes_pendentes", devolucoesCanceladas: "devolucoes_canceladas", divergencias: "divergencias",
  divergenciasAbertas: "divergencias_abertas",
} as const;
export type ResumoDaConciliacao = Record<keyof typeof CAMPOS, number>;
export type LojaDaConciliacao = ResumoDaConciliacao & { unidade: string; nome: string; alertaMinutos: number | null };
export type VendaSemPedido = { venda: string; numero: number; loja: string; vendedor: string; quando: string; valor: number; minutos: number };
export type PedidoEmAndamento = {
  pedido: string; venda: string; numero: number; loja: string; situacao: SituacaoPendente; quando: string; valor: number; minutos: number; atrasada: boolean;
};
export type DevolucaoPendente = { pedido: string; venda: string; numero: number; loja: string; situacao: SituacaoPendente; quando: string; minutos: number };
export type NotaSemDocumento = {
  pedido: string; venda: string; numero: number; loja: string; tipo: "venda" | "devolucao"; quando: string; modelo: string | null; serie: number | null;
  numeroDocumento: number | null; falta: Falta[];
};
export type Divergencia = {
  tipo: TipoDeDivergencia; pedido: string; pedidoTipo: "venda" | "devolucao"; venda: string; numero: number; loja: string; quando: string | null;
  modelo: string | null; serie: number | null; numeroDocumento: number | null; mesDaChave: string | null; mesDaVenda: string | null;
  outraVenda: number | null; motivo: string | null; conferidaEm: string | null; conferidaPor: string | null; observacaoDaConferencia: string | null;
};
export type TempoAteANota = { emitidas: number; mediaMinutos: number | null; maiorMinutos: number | null };
export type ConciliacaoFiscal = {
  inicio: string; fim: string; unidade: string | null; lojas: { id: string; nome: string }[]; resumo: ResumoDaConciliacao; porLoja: LojaDaConciliacao[];
  tempo: TempoAteANota; semPedido: VendaSemPedido[]; emAndamento: PedidoEmAndamento[]; devolucoesPendentes: DevolucaoPendente[];
  semDocumento: NotaSemDocumento[]; divergencias: Divergencia[];
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const LIMITE_DAS_LISTAS = 50;
const LIMITE_DAS_DIVERGENCIAS = 100;
const falha = (campo: string): never => { throw new RespostaInesperada(campo); };
const uuid = (l: Linha, campo: string) => { const v = t(l, campo); return ehUuid(v) ? v : falha(campo); };
const momento = (l: Linha, campo: string) => { const v = t(l, campo); return Number.isNaN(Date.parse(v)) ? falha(campo) : v; };
const tipoDoPedido = (l: Linha, campo: string): "venda" | "devolucao" => { const v = l[campo]; return v === "venda" || v === "devolucao" ? v : falha(campo); };
const booleano = (l: Linha, campo: string) => { const v = l[campo]; return typeof v === "boolean" ? v : falha(campo); };

function resumo(l: Linha): ResumoDaConciliacao {
  const r = Object.fromEntries(Object.entries(CAMPOS).map(([nome, campo]) => [nome, n(l, campo)])) as ResumoDaConciliacao;
  const fecha = Object.values(r).every((x) => x >= 0)
    && r.vendas === r.comNota + r.emAndamento + r.semPedido + r.devolvidasSemNota
    && r.valorVendas === r.valorComNota + r.valorEmAndamento + r.valorSemPedido + r.valorDevolvidasSemNota
    && r.atrasadas <= r.emAndamento && r.foraDoPrazo <= r.comNota
    && Math.max(r.semPdf, r.semXml, r.semProtocolo, r.devolucoesEmitidas) <= r.notasEmitidas
    && r.devolucoes === r.devolucoesEmitidas + r.devolucoesPendentes + r.devolucoesCanceladas
    && r.divergenciasAbertas <= r.divergencias && r.devolucoesCanceladas <= r.divergencias;
  return fecha ? r : falha("resumo");
}

/** Converte a resposta de public.notas_conciliacao. O resumo tem de ser a soma das lojas, e as listas, do tamanho das contas. */
export function lerConciliacaoFiscal(dado: unknown): ConciliacaoFiscal {
  if (!ehObjeto(dado)) return falha("notas_conciliacao");
  const inicio = t(dado, "inicio");
  const fim = t(dado, "fim");
  if (!DIA.test(inicio) || !DIA.test(fim) || fim < inicio) falha("periodo");
  const unidade = textoOuNulo(dado, "unidade");
  if (unidade !== null && !ehUuid(unidade)) falha("unidade");
  const lojas = lista(dado, "lojas").map((l) => ({ id: uuid(l, "id"), nome: t(l, "nome") }));
  const total = resumo(objeto(dado, "resumo"));
  const porLoja = lista(dado, "por_loja").map((l): LojaDaConciliacao => {
    const id = uuid(l, "unidade");
    if (unidade !== null && id !== unidade) falha("por_loja");
    const alertaMinutos = inteiroOuNulo(l, "alerta_minutos");
    const r = { ...resumo(l), unidade: id, nome: t(l, "nome"), alertaMinutos };
    // Sem prazo registrado, nada passa do prazo.
    if (alertaMinutos === null ? r.atrasadas + r.foraDoPrazo > 0 : alertaMinutos <= 0) falha("por_loja");
    return r;
  });
  for (const campo of Object.keys(CAMPOS) as (keyof ResumoDaConciliacao)[]) {
    if (porLoja.reduce((s, l) => s + l[campo], 0) !== total[campo]) falha("resumo");
  }
  const tl = objeto(dado, "tempo");
  const tempo = { emitidas: n(tl, "emitidas"), mediaMinutos: inteiroOuNulo(tl, "media_minutos"), maiorMinutos: inteiroOuNulo(tl, "maior_minutos") };
  if (tempo.emitidas !== total.comNota || (tempo.emitidas === 0) !== (tempo.mediaMinutos === null) || (tempo.mediaMinutos === null) !== (tempo.maiorMinutos === null)
    || (tempo.mediaMinutos ?? 0) < 0 || (tempo.mediaMinutos ?? 0) > (tempo.maiorMinutos ?? 0)) {
    falha("tempo");
  }

  const semPedido = lista(dado, "sem_pedido").map((l): VendaSemPedido => ({
    venda: uuid(l, "venda"), numero: n(l, "numero"), loja: t(l, "loja"), vendedor: t(l, "vendedor"), quando: momento(l, "quando"), valor: n(l, "valor"),
    minutos: n(l, "minutos"),
  }));
  const emAndamento = lista(dado, "em_andamento").map((l): PedidoEmAndamento => {
    const situacao = l.situacao;
    if (!ehPendente(situacao)) return falha("em_andamento");
    return {
      pedido: uuid(l, "pedido"), venda: uuid(l, "venda"), numero: n(l, "numero"), loja: t(l, "loja"), situacao, quando: momento(l, "quando"),
      valor: n(l, "valor"), minutos: n(l, "minutos"), atrasada: booleano(l, "atrasada"),
    };
  });
  const devolucoesPendentes = lista(dado, "devolucoes_pendentes").map((l): DevolucaoPendente => {
    const situacao = l.situacao;
    if (!ehPendente(situacao)) return falha("devolucoes_pendentes");
    return { pedido: uuid(l, "pedido"), venda: uuid(l, "venda"), numero: n(l, "numero"), loja: t(l, "loja"), situacao, quando: momento(l, "quando"), minutos: n(l, "minutos") };
  });
  const semDocumento = lista(dado, "sem_documento").map((l): NotaSemDocumento => {
    const falta = l.falta;
    if (!Array.isArray(falta) || falta.length === 0 || new Set(falta).size !== falta.length || !falta.every((f) => (FALTAS as readonly unknown[]).includes(f))) {
      return falha("sem_documento");
    }
    return {
      pedido: uuid(l, "pedido"), venda: uuid(l, "venda"), numero: n(l, "numero"), loja: t(l, "loja"), tipo: tipoDoPedido(l, "tipo"), quando: momento(l, "quando"),
      modelo: textoOuNulo(l, "modelo"), serie: inteiroOuNulo(l, "serie"), numeroDocumento: inteiroOuNulo(l, "numero_documento"), falta: falta as Falta[],
    };
  });
  const divergencias = lista(dado, "divergencias").map((l): Divergencia => {
    const tipo = l.tipo;
    if (!ehTipoDeDivergencia(tipo)) return falha("divergencias");
    const d: Divergencia = {
      tipo, pedido: uuid(l, "pedido"), pedidoTipo: tipoDoPedido(l, "pedido_tipo"), venda: uuid(l, "venda"), numero: n(l, "numero"), loja: t(l, "loja"),
      quando: textoOuNulo(l, "quando"), modelo: textoOuNulo(l, "modelo"), serie: inteiroOuNulo(l, "serie"), numeroDocumento: inteiroOuNulo(l, "numero_documento"),
      mesDaChave: textoOuNulo(l, "mes_da_chave"), mesDaVenda: textoOuNulo(l, "mes_da_venda"), outraVenda: inteiroOuNulo(l, "outra_venda"),
      motivo: textoOuNulo(l, "motivo"), conferidaEm: textoOuNulo(l, "conferida_em"), conferidaPor: textoOuNulo(l, "conferida_por"),
      observacaoDaConferencia: textoOuNulo(l, "observacao_da_conferencia"),
    };
    const coerente = (tipo !== "chave_fora_do_mes" || (MES.test(d.mesDaChave ?? "") && MES.test(d.mesDaVenda ?? "") && d.mesDaChave !== d.mesDaVenda))
      && (tipo !== "numero_repetido" || (d.outraVenda !== null && d.numeroDocumento !== null))
      && (tipo !== "devolucao_sem_nota" || d.pedidoTipo === "devolucao")
      && (d.conferidaEm === null) === (d.conferidaPor === null) && (d.conferidaEm === null) === (d.observacaoDaConferencia === null);
    return coerente ? d : falha("divergencias");
  });

  // As listas trazem até 50 (100 divergências), as mais antigas primeiro: o tamanho tem de bater com a conta.
  const cheia = (quantos: number, limite = LIMITE_DAS_LISTAS) => Math.min(quantos, limite);
  if (semPedido.length !== cheia(total.semPedido) || emAndamento.length !== cheia(total.emAndamento)
    || devolucoesPendentes.length !== cheia(total.devolucoesPendentes) || divergencias.length !== cheia(total.divergencias, LIMITE_DAS_DIVERGENCIAS)
    || semDocumento.length > LIMITE_DAS_LISTAS || semDocumento.length < cheia(Math.max(total.semPdf, total.semXml, total.semProtocolo))
    || emAndamento.filter((p) => p.atrasada).length > total.atrasadas
    || (total.divergencias <= LIMITE_DAS_DIVERGENCIAS && divergencias.filter((d) => d.conferidaEm === null).length !== total.divergenciasAbertas)) {
    falha("listas");
  }
  return { inicio, fim, unidade, lojas, resumo: total, porLoja, tempo, semPedido, emAndamento, devolucoesPendentes, semDocumento, divergencias };
}

const SEM_FUNCAO = new Set(["PGRST202", "42883"]);

/** Lê a conciliação como a pessoa logada. Sem a função no banco: indisponível; sem permissão: o próprio estado. */
export async function lerConciliacao(supabase: Cliente, inicio: string, fim: string, unidade: string | null):
  Promise<Leitura<ConciliacaoFiscal> | { estado: "sem_permissao" }> {
  const r = await supabase.rpc("notas_conciliacao", { p_inicio: inicio, p_fim: fim, p_unidade: unidade as string });
  if (r.error) {
    if (r.error.code === "42501") return { estado: "sem_permissao" };
    if (SEM_FUNCAO.has(r.error.code)) return { estado: "indisponivel" };
    console.error("notas: falha ao ler a conciliação", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerConciliacaoFiscal(r.data) };
  } catch (e) {
    console.error("notas: resposta inesperada da conciliação", { campo: e instanceof RespostaInesperada ? e.message : null });
    return { estado: "falha" };
  }
}

/**
 * O alerta do Início: as divergências ainda não conferidas da loja do turno no período. Sem a função no banco (migration
 * ainda não aplicada) ou sem permissão: nulo, e o alerta some. Outro erro, ou número que não é número, é falha (a página
 * cai, como nas outras pendências: zero inventado não).
 */
export async function divergenciasAbertas(supabase: Cliente, unidade: string, inicio: string, fim: string): Promise<number | null> {
  const r = await supabase.rpc("notas_conciliacao", { p_inicio: inicio, p_fim: fim, p_unidade: unidade });
  if (r.error) {
    if (r.error.code === "42501" || SEM_FUNCAO.has(r.error.code)) return null;
    throw new RespostaInesperada(`notas_conciliacao:${r.error.code || "sem-codigo"}`);
  }
  if (!ehObjeto(r.data)) throw new RespostaInesperada("notas_conciliacao");
  return n(objeto(r.data, "resumo"), "divergencias_abertas");
}

/** O endereço da conciliação com o período e a loja escolhidos (a conferência volta para ele). */
export const enderecoDaConciliacao = (periodo: Periodo, unidade: string | null) =>
  `/notas/conciliacao?periodo=${periodo}${unidade ? `&loja=${unidade}` : ""}`;

// A conferência de uma divergência (ação da tela): as mensagens, pelo código e pelo texto do banco.
export const ERROS_DA_CONCILIACAO = {
  dados: "Não deu para entender o pedido: recarregue a conciliação.",
  observacao: "Escreva o que foi conferido e o que foi feito (de 10 a 500 letras): fica na auditoria.",
  mudou: "Esta divergência não existe mais neste pedido (ou já mudou): recarregue a conciliação.",
  nao_encontrado: "Pedido não encontrado ou sem permissão: só quem aprova nota na loja do pedido confere (o gerente, na loja do turno).",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDaConciliacao = keyof typeof ERROS_DA_CONCILIACAO;
export function erroDaConciliacao(erro: { code?: string; message?: string } | null | undefined): ErroDaConciliacao {
  if (erro?.code === "P0002" || erro?.code === "42501") return "nao_encontrado";
  if (erro?.code === "22023") {
    if (/não existe neste pedido/i.test(erro.message ?? "")) return "mudou";
    if (/escreva o que foi conferido/i.test(erro.message ?? "")) return "observacao";
    return "dados";
  }
  return "falha";
}
