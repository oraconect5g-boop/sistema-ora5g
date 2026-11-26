// A aba Carteira e relatórios da Ora Connect (lote CONNECT-o, 25/11/2026; o pedido do proprietário: "as telas do ora connect
// da demo, que estavam muito boas"). A tela lê as consultas da carteira que a própria pessoa pediu (o banco só mostra as dela,
// e a resposta é apagada em 24 horas, porque pode ter o nome do cliente) e as escreve no formato da demonstração: o saldo, as
// saídas, as entradas e as recargas programadas em cartões, o extrato numa lista só e as portabilidades da operadora. Regras
// puras: a tela nunca fala com a Nogle (o worker do servidor consulta e grava a resposta já limpa, no formato de
// apps/worker/src/connect).
import type { ConsultaDaTela } from "./consultas";

/** As consultas que a aba mostra (a última de cada tipo). */
export const CONSULTAS_DA_CARTEIRA = [
  "carteira_saldo", "carteira_extrato_saidas", "carteira_extrato_entradas", "carteira_programadas", "relatorio_portabilidades", "lista_de_linhas",
  "lista_de_clientes",
] as const;
export type ConsultaDaCarteira = (typeof CONSULTAS_DA_CARTEIRA)[number];

/** O estado da última consulta de um tipo: nenhuma, esperando a Nogle, sem resposta, apagada (24 horas) ou respondida. */
export type EstadoDaConsulta<T> =
  | { estado: "sem_consulta" }
  | { estado: "esperando"; pedidaEm: string }
  | { estado: "falhou"; pedidaEm: string; mensagem: string | null }
  | { estado: "apagada"; pedidaEm: string }
  | { estado: "ok"; id: string; pedidaEm: string; dias: number | null; dados: T };

type Resposta = Record<string, unknown>;
const lista = (v: unknown) => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Resposta[]) : []);
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const inteiro = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);
/** O que a Nogle manda como data ("AAAA-MM-DD" ou "AAAA-MM-DD HH:MM[:SS]"), para ordenar; o resto vira null. */
const quando = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v : null);
const digitos = (v: unknown) => (typeof v === "string" && /^\d{8,13}$/.test(v) ? v : null);

/** A última consulta de cada tipo (as consultas chegam da mais nova para a mais velha, mas a ordem é conferida aqui). */
export function ultimaDe(consultas: readonly ConsultaDaTela[], tipo: ConsultaDaCarteira): ConsultaDaTela | undefined {
  return consultas.filter((c) => c.tipo === tipo).sort((a, b) => b.pedida_em.localeCompare(a.pedida_em))[0];
}

/** O estado da consulta, com a resposta lida por `ler` (resposta em formato inesperado conta como sem resposta). */
export function estadoDa<T>(c: ConsultaDaTela | undefined, ler: (r: Resposta) => T | null): EstadoDaConsulta<T> {
  if (!c) return { estado: "sem_consulta" };
  if (c.situacao === "na_fila" || c.situacao === "consultando") return { estado: "esperando", pedidaEm: c.pedida_em };
  if (c.situacao === "respondida") {
    if (!c.resposta) return c.resposta_apagada_em ? { estado: "apagada", pedidaEm: c.pedida_em } : { estado: "falhou", pedidaEm: c.pedida_em, mensagem: null };
    const dados = ler(c.resposta);
    const dias = c.parametro && /^\d{1,3}$/.test(c.parametro) ? Number(c.parametro) : null;
    return dados === null ? { estado: "falhou", pedidaEm: c.pedida_em, mensagem: null } : { estado: "ok", id: c.id, pedidaEm: c.pedida_em, dias, dados };
  }
  return { estado: "falhou", pedidaEm: c.pedida_em, mensagem: c.mensagem };
}

export type Saldo = { centavos: number };
export const lerSaldo = (r: Resposta): Saldo | null => (inteiro(r.saldo_centavos) === null ? null : { centavos: r.saldo_centavos as number });

export type Movimento = { quando: string | null; entrada: boolean; tipo: string | null; plano: string | null; linha: string | null; valorCentavos: number | null };
export type Extrato = { total: number; somaCentavos: number | null; movimentos: Movimento[]; fora: number };
/** O extrato de saídas ou de entradas (`entrada` diz qual), sem o nome do cliente: a aba é um resumo (o relatório tem tudo). */
export const lerExtrato = (entrada: boolean) => (r: Resposta): Extrato | null => {
  if (!Array.isArray(r.movimentos)) return null;
  const movimentos = lista(r.movimentos).map((m): Movimento => ({
    quando: quando(m.quando), entrada, tipo: texto(m.tipo), plano: texto(m.plano), linha: digitos(m.linha), valorCentavos: inteiro(m.valor_centavos),
  }));
  return { total: inteiro(r.total) ?? movimentos.length, somaCentavos: inteiro(r.soma_centavos), movimentos, fora: inteiro(r.fora) ?? 0 };
};

export type Programada = { renovacao: string | null; linha: string | null; plano: string | null; valorCentavos: number | null };
export type Programadas = { total: number; somaCentavos: number | null; recargas: Programada[]; fora: number };
/** As recargas programadas pela carteira, sem o cliente (o relatório da consulta tem tudo). */
export const lerProgramadas = (r: Resposta): Programadas | null => {
  if (!Array.isArray(r.recargas)) return null;
  const recargas = lista(r.recargas).map((x): Programada => ({ renovacao: quando(x.renovacao), linha: digitos(x.linha), plano: texto(x.plano), valorCentavos: inteiro(x.valor_centavos) }))
    .sort((a, b) => (a.renovacao ?? "9").localeCompare(b.renovacao ?? "9"));
  return { total: inteiro(r.total) ?? recargas.length, somaCentavos: inteiro(r.soma_centavos), recargas, fora: inteiro(r.fora) ?? 0 };
};

export type Portabilidade = { quando: string | null; linha: string | null; doadora: string | null; operadora: string | null; status: string | null };
export type Portabilidades = { total: number; porStatus: [string, number][]; itens: Portabilidade[]; fora: number };
/** O relatório das portabilidades da operadora, sem o cliente. */
export const lerPortabilidades = (r: Resposta): Portabilidades | null => {
  if (!Array.isArray(r.portabilidades)) return null;
  const porStatus = r.por_status && typeof r.por_status === "object" && !Array.isArray(r.por_status)
    ? Object.entries(r.por_status as Record<string, unknown>).flatMap(([s, n]) => (inteiro(n) === null ? [] : [[s, n as number] as [string, number]])) : [];
  const itens = lista(r.portabilidades).map((x): Portabilidade => ({
    quando: quando(x.quando), linha: digitos(x.linha), doadora: digitos(x.linha_doadora), operadora: texto(x.operadora), status: texto(x.status),
  }));
  return { total: inteiro(r.total) ?? itens.length, porStatus, itens, fora: inteiro(r.fora) ?? 0 };
};

/** As listas da rede (linhas e clientes): só o tamanho, para o cartão; a página do relatório mostra cada item. */
export const lerTamanhoDaLista = (campo: "linhas" | "clientes") => (r: Resposta): { quantos: number } | null =>
  (Array.isArray(r[campo]) ? { quantos: inteiro(r.total) ?? (r[campo] as unknown[]).length } : null);

/** O extrato numa lista só, como na demonstração: as saídas e as entradas da última consulta de cada, do mais novo ao mais velho. */
export function extratoUnico(...extratos: EstadoDaConsulta<Extrato>[]): Movimento[] {
  return extratos.flatMap((e) => (e.estado === "ok" ? e.dados.movimentos : [])).sort((a, b) => (b.quando ?? "").localeCompare(a.quando ?? ""));
}

/** As consultas da aba que ainda esperam a Nogle (a tela se atualiza sozinha enquanto houver). */
export const algumaEsperando = (...estados: EstadoDaConsulta<unknown>[]) => estados.some((e) => e.estado === "esperando");
