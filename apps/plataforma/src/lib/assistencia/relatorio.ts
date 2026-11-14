// Relatórios da assistência (lote L12e: ORA-OS-006). Leitura estrita de public.os_relatorio e o período escolhido. O
// banco decide quem vê (os.gerir) e soma tudo (packages/banco/src/ordem-de-servico.test.ts); aqui só se confere a
// resposta: forma inesperada ou conta que não fecha é falha de leitura, nunca zero.
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto, inteiro as n, inteiroOuNulo, lista, objeto, texto as t, textoOuNulo, type Leitura, type Linha } from "../leitura-do-banco";
import { somarDias } from "./regras";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export const PERIODOS = { mes: "Este mês", mes_passado: "Mês passado", noventa_dias: "Últimos 90 dias" } as const;
export type Periodo = keyof typeof PERIODOS;
export const ehPeriodo = (v: unknown): v is Periodo => typeof v === "string" && Object.hasOwn(PERIODOS, v);

/** Os dias (AAAA-MM-DD, em São Paulo) de cada período. */
export function intervaloDoPeriodo(periodo: Periodo, hoje: string): { inicio: string; fim: string } {
  if (periodo === "mes") return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje };
  if (periodo === "mes_passado") {
    const ano = Number(hoje.slice(0, 4));
    const mes = Number(hoje.slice(5, 7));
    const fim = new Date(Date.UTC(ano, mes - 1, 0)).toISOString().slice(0, 10);
    return { inicio: `${fim.slice(0, 7)}-01`, fim };
  }
  return { inicio: somarDias(hoje, -89), fim: hoje };
}

export const TIPOS_SEM_VENDA = {
  devolvida_sem_cobrar: "Devolvida sem cobrar", venda_cancelada: "Venda cancelada depois da entrega", pronta_parada: "Pronta, sem cobrança",
} as const;
export type TipoSemVenda = keyof typeof TIPOS_SEM_VENDA;
const ehTipoSemVenda = (v: unknown): v is TipoSemVenda => typeof v === "string" && Object.hasOwn(TIPOS_SEM_VENDA, v);

export type ResumoDaAssistencia = {
  abertas: number; entregues: number; devolvidasSemConserto: number; devolvidasSemCobrar: number; canceladas: number; prontasParadas: number;
  consertosCobrados: number; valorCobrado: number; pecasUsadas: number;
};
export type LojaDoRelatorio = ResumoDaAssistencia & { unidade: string; nome: string; osComPeca: number; osComPecaSemCobranca: number };
export type OsSemVenda = {
  id: string; numero: number; loja: string; aparelho: string; clienteNome: string; tipo: TipoSemVenda; quando: string | null;
  motivo: string | null; venda: number | null; dias: number | null;
};
export type PessoaDoRelatorio = { pessoa: string; nome: string; abertas: number; cobrados: number; valor: number };
export type TempoDeConserto = { consertos: number; mediaDiasConserto: number | null; maiorDiasConserto: number | null; entregas: number; mediaDiasAteEntrega: number | null };
export type RelatorioDaAssistencia = {
  inicio: string; fim: string; unidade: string | null; lojas: { id: string; nome: string }[]; resumo: ResumoDaAssistencia;
  porLoja: LojaDoRelatorio[]; semVenda: OsSemVenda[]; porPessoa: PessoaDoRelatorio[]; tempo: TempoDeConserto;
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** Dias com uma casa (média e maior): número não negativo ou nulo (sem conserto no período). */
const dias = (l: Linha, campo: string): number | null => {
  const v = l[campo];
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new RespostaInesperada(campo);
  return v;
};
function resumo(l: Linha): ResumoDaAssistencia {
  const r = {
    abertas: n(l, "abertas"), entregues: n(l, "entregues"), devolvidasSemConserto: n(l, "devolvidas_sem_conserto"), devolvidasSemCobrar: n(l, "devolvidas_sem_cobrar"),
    canceladas: n(l, "canceladas"), prontasParadas: n(l, "prontas_paradas"), consertosCobrados: n(l, "consertos_cobrados"), valorCobrado: n(l, "valor_cobrado"),
    pecasUsadas: n(l, "pecas_usadas"),
  };
  // (Conserto cobrado com desconto total vale zero: a contagem e o valor não precisam andar juntos.)
  if (Object.values(r).some((x) => x < 0) || (r.consertosCobrados === 0 && r.valorCobrado !== 0)) throw new RespostaInesperada("resumo");
  return r;
}

/** Converte a resposta de public.os_relatorio. O resumo tem de ser a soma das lojas. */
export function lerRelatorioDaAssistencia(dado: unknown): RelatorioDaAssistencia {
  if (!ehObjeto(dado)) throw new RespostaInesperada("os_relatorio");
  const inicio = t(dado, "inicio");
  const fim = t(dado, "fim");
  if (!DIA.test(inicio) || !DIA.test(fim) || fim < inicio) throw new RespostaInesperada("periodo");
  const unidade = textoOuNulo(dado, "unidade");
  if (unidade !== null && !ehUuid(unidade)) throw new RespostaInesperada("unidade");
  const lojas = lista(dado, "lojas").map((l) => {
    const id = t(l, "id");
    if (!ehUuid(id)) throw new RespostaInesperada("lojas");
    return { id, nome: t(l, "nome") };
  });
  const total = resumo(objeto(dado, "resumo"));
  const porLoja = lista(dado, "por_loja").map((l): LojaDoRelatorio => {
    const id = t(l, "unidade");
    if (!ehUuid(id) || (unidade !== null && id !== unidade)) throw new RespostaInesperada("por_loja");
    const r = { ...resumo(l), unidade: id, nome: t(l, "nome"), osComPeca: n(l, "os_com_peca"), osComPecaSemCobranca: n(l, "os_com_peca_sem_cobranca") };
    if (r.osComPecaSemCobranca > r.osComPeca || r.osComPeca < 0) throw new RespostaInesperada("por_loja");
    return r;
  });
  for (const campo of Object.keys(total) as (keyof ResumoDaAssistencia)[]) {
    if (porLoja.reduce((s, l) => s + l[campo], 0) !== total[campo]) throw new RespostaInesperada("resumo");
  }
  const semVenda = lista(dado, "sem_venda").map((l): OsSemVenda => {
    const id = t(l, "id");
    const tipo = l.tipo;
    if (!ehUuid(id) || !ehTipoSemVenda(tipo)) throw new RespostaInesperada("sem_venda");
    const r = {
      id, numero: n(l, "numero"), loja: t(l, "loja"), aparelho: t(l, "aparelho"), clienteNome: t(l, "cliente_nome"), tipo, quando: textoOuNulo(l, "quando"),
      motivo: textoOuNulo(l, "motivo"), venda: inteiroOuNulo(l, "venda"), dias: inteiroOuNulo(l, "dias"),
    };
    if ((tipo === "pronta_parada") !== (r.dias !== null) || (tipo === "venda_cancelada") !== (r.venda !== null) || (r.dias !== null && r.dias < 0)) {
      throw new RespostaInesperada("sem_venda");
    }
    return r;
  });
  if (semVenda.length > 100) throw new RespostaInesperada("sem_venda");
  const porPessoa = lista(dado, "por_pessoa").map((l): PessoaDoRelatorio => {
    const pessoa = t(l, "pessoa");
    if (!ehUuid(pessoa)) throw new RespostaInesperada("por_pessoa");
    const r = { pessoa, nome: t(l, "nome"), abertas: n(l, "abertas"), cobrados: n(l, "cobrados"), valor: n(l, "valor") };
    if (r.abertas < 0 || r.cobrados < 0 || r.valor < 0 || (r.cobrados === 0 && r.valor !== 0)) throw new RespostaInesperada("por_pessoa");
    return r;
  });
  if (porPessoa.reduce((s, p) => s + p.valor, 0) !== total.valorCobrado || porPessoa.reduce((s, p) => s + p.abertas, 0) !== total.abertas) {
    throw new RespostaInesperada("por_pessoa");
  }
  const tl = objeto(dado, "tempo");
  const tempo = {
    consertos: n(tl, "consertos"), mediaDiasConserto: dias(tl, "media_dias_conserto"), maiorDiasConserto: dias(tl, "maior_dias_conserto"),
    entregas: n(tl, "entregas"), mediaDiasAteEntrega: dias(tl, "media_dias_ate_entrega"),
  };
  if ((tempo.consertos === 0) !== (tempo.mediaDiasConserto === null) || (tempo.entregas === 0) !== (tempo.mediaDiasAteEntrega === null)
    || tempo.entregas !== total.entregues) {
    throw new RespostaInesperada("tempo");
  }
  return { inicio, fim, unidade, lojas, resumo: total, porLoja, semVenda, porPessoa, tempo };
}

const SEM_FUNCAO = new Set(["PGRST202", "42883"]);

/** Lê o relatório como a pessoa logada. Sem a função no banco: indisponível; sem permissão: o próprio estado. */
export async function lerRelatorio(supabase: Cliente, inicio: string, fim: string, unidade: string | null): Promise<Leitura<RelatorioDaAssistencia> | { estado: "sem_permissao" }> {
  const r = await supabase.rpc("os_relatorio", { p_inicio: inicio, p_fim: fim, p_unidade: unidade as string });
  if (r.error) {
    if (r.error.code === "42501") return { estado: "sem_permissao" };
    if (SEM_FUNCAO.has(r.error.code)) return { estado: "indisponivel" };
    console.error("assistência: falha ao ler o relatório", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerRelatorioDaAssistencia(r.data) };
  } catch (e) {
    console.error("assistência: resposta inesperada do relatório", { campo: e instanceof RespostaInesperada ? e.message : null });
    return { estado: "falha" };
  }
}
