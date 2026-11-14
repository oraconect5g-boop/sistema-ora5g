// Fechamento do bônus por meta (lote L9b; decisão do proprietário de 13/11/2026, D-014): no mês que
// terminou, a gerência confere e contesta com motivo; o dono decide cada contestação, paga outro valor com
// motivo (o vendedor vê) e aprova o pagamento; o valor de cada vendedor fica gravado e não muda mais.
// Leitura estrita de public.bonus_fechamento_do_mes (a apuração gravada no envio passa pela mesma leitura
// do bônus do mês, que refaz cada conta) e a validação dos dois formulários. O banco confere tudo de novo
// (provado em packages/banco/src/bonus-fechamento.test.ts).
import { lerReais } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";
import { centavosCsv } from "../csv";
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto, inteiro as n, inteiroOuNulo as nOuNulo, lista, texto as t, type Linha } from "../leitura-do-banco";
import { somarMeses } from "../metas/painel";
import { lerBonusDoMes, type BonusDoMes } from "./regras";

/** "14/11/2026, 10:00", em São Paulo. */
export const dataEHora = (instante: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(instante));

/** A linha de um vendedor no fechamento (a gestão lê todas; o vendedor, a própria), se já foi enviada. */
export function linhaDoVendedor(f: FechamentoDoMes | null, vendedor: string): LinhaDoFechamento | null {
  return f?.linhas.find((l) => l.vendedorId === vendedor) ?? null;
}

/** Os meses que se fecham pela tela: os seis que já terminaram, do mais antigo ao mais recente. */
export const mesesParaFechar = (hoje: string) => [6, 5, 4, 3, 2, 1].map((i) => somarMeses(hoje, -i));

/** R$ 400.000,00 por vendedor: as quatro medidas na faixa mais alta permitida. */
export const VALOR_APROVADO_MAXIMO = 40_000_000;
const MOTIVO_MINIMO = 3;
const MOTIVO_MAXIMO = 300;

export type DecisaoDaContestacao = "mantido" | "ajustado";
export type Contestacao = { motivo: string; contestadaEm: string; decisao: DecisaoDaContestacao | null; resposta: string | null; decididaEm: string | null };
export type LinhaDoFechamento = {
  vendedorId: string;
  totalCalculado: number;
  /** O valor que o dono aprovou; nulo até a aprovação. */
  totalAprovado: number | null;
  /** O motivo de pagar outro valor que não o calculado (o vendedor vê). */
  ajusteMotivo: string | null;
  aprovadoEm: string | null;
  /** A contestação da gerência e a decisão do dono: só a gestão lê. */
  contestacao: Contestacao | null;
};
export type SituacaoDoFechamento = "enviado" | "aprovado";
export type Fechamento = {
  id: string;
  situacao: SituacaoDoFechamento;
  /** A apuração gravada no envio (a mesma forma do bônus do mês), conferida conta a conta. */
  apuracao: BonusDoMes;
  totalCalculado: number;
  totalAprovado: number | null;
  enviadoPor: string;
  enviadoEm: string;
  aprovadoPor: string | null;
  aprovadoEm: string | null;
};
export type FechamentoDoMes = {
  mes: string;
  unidadeId: string;
  /** Só a gestão lê; nulo enquanto a gerência não envia (ou para o vendedor). */
  fechamento: Fechamento | null;
  /** A gestão recebe todas; o vendedor, só a própria (sem a contestação). */
  linhas: LinhaDoFechamento[];
};

const instante = (l: Linha, campo: string): string => {
  const v = t(l, campo);
  if (Number.isNaN(Date.parse(v))) throw new RespostaInesperada(campo);
  return v;
};
const instanteOuNulo = (l: Linha, campo: string): string | null => (l[campo] === null ? null : instante(l, campo));
const textoOuNulo = (l: Linha, campo: string): string | null => {
  const v = l[campo];
  if (v !== null && typeof v !== "string") throw new RespostaInesperada(campo);
  return v;
};
const uuid = (l: Linha, campo: string) => {
  const v = t(l, campo);
  if (!ehUuid(v)) throw new RespostaInesperada(campo);
  return v;
};
const uuidOuNulo = (l: Linha, campo: string) => (l[campo] === null ? null : uuid(l, campo));

function lerContestacao(dado: unknown): Contestacao | null {
  if (dado === null) return null;
  if (!ehObjeto(dado)) throw new RespostaInesperada("contestacao");
  const decisao = dado.decisao;
  if (decisao !== null && decisao !== "mantido" && decisao !== "ajustado") throw new RespostaInesperada("decisao");
  const c: Contestacao = { motivo: t(dado, "motivo"), contestadaEm: instante(dado, "contestada_em"), decisao, resposta: textoOuNulo(dado, "resposta"), decididaEm: instanteOuNulo(dado, "decidida_em") };
  if ((c.decisao === null) !== (c.decididaEm === null) || (c.decisao === null && c.resposta !== null)) throw new RespostaInesperada("decisao");
  return c;
}

function lerLinha(l: Linha): LinhaDoFechamento {
  const linha: LinhaDoFechamento = {
    vendedorId: uuid(l, "vendedor_id"),
    totalCalculado: n(l, "total_calculado"),
    totalAprovado: nOuNulo(l, "total_aprovado"),
    ajusteMotivo: textoOuNulo(l, "ajuste_motivo"),
    aprovadoEm: instanteOuNulo(l, "aprovado_em"),
    contestacao: lerContestacao(l.contestacao ?? null),
  };
  const { totalCalculado: calculado, totalAprovado: aprovado } = linha;
  if (calculado < 0 || (aprovado !== null && (aprovado < 0 || aprovado > VALOR_APROVADO_MAXIMO))) throw new RespostaInesperada("total");
  if ((aprovado === null) !== (linha.aprovadoEm === null)) throw new RespostaInesperada("aprovado_em");
  // Pagar outro valor sempre tem motivo; pagar o calculado, nunca.
  if ((linha.ajusteMotivo !== null) !== (aprovado !== null && aprovado !== calculado)) throw new RespostaInesperada("ajuste");
  const c = linha.contestacao;
  if (c && c.decisao !== null && (aprovado === null || (c.decisao === "ajustado") !== (aprovado !== calculado))) throw new RespostaInesperada("decisao");
  return linha;
}

function lerCabeca(dado: unknown, mes: string): Fechamento | null {
  if (dado === null) return null;
  if (!ehObjeto(dado)) throw new RespostaInesperada("fechamento");
  const situacao = dado.situacao;
  if (situacao !== "enviado" && situacao !== "aprovado") throw new RespostaInesperada("situacao");
  const f: Fechamento = {
    id: uuid(dado, "id"),
    situacao,
    apuracao: lerBonusDoMes(dado.apuracao, { mes }),
    totalCalculado: n(dado, "total_calculado"),
    totalAprovado: nOuNulo(dado, "total_aprovado"),
    enviadoPor: uuid(dado, "enviado_por"),
    enviadoEm: instante(dado, "enviado_em"),
    aprovadoPor: uuidOuNulo(dado, "aprovado_por"),
    aprovadoEm: instanteOuNulo(dado, "aprovado_em"),
  };
  const aprovado = situacao === "aprovado";
  if ([f.totalAprovado, f.aprovadoPor, f.aprovadoEm].some((v) => (v !== null) !== aprovado)) throw new RespostaInesperada("aprovacao");
  if (f.totalCalculado !== f.apuracao.vendedores.reduce((s, v) => s + v.total, 0)) throw new RespostaInesperada("total_calculado");
  return f;
}

/**
 * Converte a resposta de public.bonus_fechamento_do_mes. Para a gestão (`eu` ausente): sem fechamento, sem
 * linhas; com ele, uma linha por vendedor da apuração, com o mesmo total, todas aprovadas ou nenhuma, e a
 * soma aprovada igual à do fechamento. Para o vendedor (`eu`): nunca o fechamento, no máximo a própria
 * linha e sem a contestação.
 */
export function lerFechamentoDoMes(dado: unknown, pedido: { mes: string; unidade: string; eu?: string }): FechamentoDoMes {
  if (!ehObjeto(dado)) throw new RespostaInesperada("bonus_fechamento_do_mes");
  if (t(dado, "mes") !== pedido.mes || t(dado, "unidade_id") !== pedido.unidade) throw new RespostaInesperada("pedido");
  const fechamento = lerCabeca(dado.fechamento ?? null, pedido.mes);
  const linhas = lista(dado, "linhas").map(lerLinha);
  if (new Set(linhas.map((l) => l.vendedorId)).size !== linhas.length) throw new RespostaInesperada("vendedor repetido");
  if (pedido.eu !== undefined) {
    if (fechamento !== null || linhas.length > 1 || linhas.some((l) => l.vendedorId !== pedido.eu || l.contestacao !== null)) throw new RespostaInesperada("linha do vendedor");
    return { mes: pedido.mes, unidadeId: pedido.unidade, fechamento: null, linhas };
  }
  if (fechamento === null) {
    if (linhas.length > 0) throw new RespostaInesperada("linhas sem fechamento");
    return { mes: pedido.mes, unidadeId: pedido.unidade, fechamento, linhas };
  }
  const apurado = new Map(fechamento.apuracao.vendedores.map((v) => [v.vendedorId, v.total]));
  if (linhas.length !== apurado.size || linhas.some((l) => apurado.get(l.vendedorId) !== l.totalCalculado)) throw new RespostaInesperada("linhas");
  const aprovado = fechamento.situacao === "aprovado";
  if (linhas.some((l) => (l.totalAprovado !== null) !== aprovado || (l.contestacao !== null && (l.contestacao.decisao !== null) !== aprovado))) {
    throw new RespostaInesperada("situacao das linhas");
  }
  if (aprovado && linhas.reduce((s, l) => s + (l.totalAprovado ?? 0), 0) !== fechamento.totalAprovado) throw new RespostaInesperada("total_aprovado");
  return { mes: pedido.mes, unidadeId: pedido.unidade, fechamento, linhas };
}

export type FechamentoDaLoja = {
  unidadeId: string;
  situacao: SituacaoDoFechamento;
  totalCalculado: number;
  totalAprovado: number | null;
  enviadoEm: string;
  aprovadoEm: string | null;
};
/** As linhas de public.bonus_fechamentos de um mês: o dono vê as lojas da rede; o gerente, a dele. */
export function lerFechamentosDoMes(dado: unknown): FechamentoDaLoja[] {
  if (!Array.isArray(dado) || !dado.every(ehObjeto)) throw new RespostaInesperada("bonus_fechamentos");
  const lojas = dado.map((l) => {
    const situacao = l.situacao;
    if (situacao !== "enviado" && situacao !== "aprovado") throw new RespostaInesperada("situacao");
    const r: FechamentoDaLoja = {
      unidadeId: uuid(l, "unidade_id"), situacao, totalCalculado: n(l, "total_calculado"), totalAprovado: nOuNulo(l, "total_aprovado"),
      enviadoEm: instante(l, "enviado_em"), aprovadoEm: instanteOuNulo(l, "aprovado_em"),
    };
    if ((r.totalAprovado !== null) !== (situacao === "aprovado") || (r.aprovadoEm !== null) !== (situacao === "aprovado")) throw new RespostaInesperada("aprovacao");
    return r;
  });
  if (new Set(lojas.map((l) => l.unidadeId)).size !== lojas.length) throw new RespostaInesperada("loja repetida");
  return lojas;
}

// ---------------------------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------------------------
export const OK_DO_FECHAMENTO = {
  enviado: "Fechamento enviado ao dono. As contestações vão junto; o valor só fica valendo depois da aprovação.",
  aprovado: "Pagamento aprovado. O valor de cada vendedor está gravado e não muda mais; cada vendedor já vê o próprio.",
} as const;
export const ERROS_DO_FECHAMENTO = {
  dados: "Dados inválidos: confira os campos.",
  motivo: "Cada contestação, e cada valor diferente do calculado, precisa de um motivo de 3 a 300 letras.",
  decidir: "Decida cada contestação: manter o valor calculado ou pagar outro.",
  valor: "O valor a pagar é em reais com vírgula (por exemplo, 300,00), de R$ 0,00 a R$ 400.000,00.",
  igual: "Para pagar o valor calculado, escolha \"Manter o calculado\".",
  mudou: "Os números do mês mudaram desde que a tela abriu. Confira de novo antes de enviar.",
  ja_enviado: "O fechamento deste mês já tinha sido enviado.",
  ja_aprovado: "Este fechamento já tinha sido aprovado.",
  mes_aberto: "O mês ainda não terminou: o fechamento abre no dia 1º do mês seguinte.",
  nada: "Não há bônus a fechar neste mês: nenhuma regra valia ou ninguém teve meta.",
  permissao: "Sem permissão: a gerência confere e só o dono aprova o pagamento.",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDoFechamento = keyof typeof ERROS_DO_FECHAMENTO;

/** A recusa do banco na mensagem da tela (o texto do banco não vai para a tela). */
export function erroDoFechamento(erro: { code?: string; message?: string } | null | undefined): ErroDoFechamento {
  const codigo = erro?.code ?? "";
  const mensagem = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501") return "permissao";
  if (codigo !== "22023") return "falha";
  const regras: [string, ErroDoFechamento][] = [
    ["mudaram", "mudou"], ["já foi enviado", "ja_enviado"], ["já foi aprovado", "ja_aprovado"], ["ainda não terminou", "mes_aberto"],
    ["não há o que fechar", "nada"], ["decida cada", "decidir"], ["escolha manter", "igual"], ["valor a pagar", "valor"], ["motivo", "motivo"],
  ];
  return regras.find(([trecho]) => mensagem.includes(trecho))?.[1] ?? "dados";
}

// ---------------------------------------------------------------------------------------------
// Os formulários
// ---------------------------------------------------------------------------------------------
type Campos = { get(nome: string): unknown; getAll(nome: string): unknown[] };
type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroDoFechamento };
const MES = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const limpo = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const motivoValido = (m: string) => m.length >= MOTIVO_MINIMO && m.length <= MOTIVO_MAXIMO;

/** Os totais que a tela mostrou, no campo escondido: {"vendedor": centavos}. */
export const totaisNoCampo = (linhas: readonly { vendedorId: string; total: number }[]) =>
  JSON.stringify(Object.fromEntries(linhas.map((l) => [l.vendedorId, l.total])));
function lerTotais(bruto: unknown): Record<string, number> | null {
  if (typeof bruto !== "string") return null;
  let dado: unknown;
  try {
    dado = JSON.parse(bruto);
  } catch {
    return null;
  }
  if (!ehObjeto(dado)) return null;
  const entradas = Object.entries(dado);
  if (entradas.length === 0 || !entradas.every(([id, v]) => ehUuid(id) && Number.isSafeInteger(v) && (v as number) >= 0)) return null;
  return Object.fromEntries(entradas) as Record<string, number>;
}

export type Conferencia = { mes: string; unidade: string; totais: Record<string, number>; contestacoes: Record<string, string> };
/**
 * A conferência da gerência: "mes", "loja", "totais" (o que a tela mostrou) e, para cada vendedor marcado
 * em "contestar", o "motivo_<vendedor>" (de 3 a 300 letras). Só se contesta quem está nos totais.
 */
export function validarConferencia(campos: Campos): Resultado<Conferencia> {
  const mes = campos.get("mes");
  const unidade = campos.get("loja");
  const totais = lerTotais(campos.get("totais"));
  if (typeof mes !== "string" || !MES.test(mes) || typeof unidade !== "string" || !ehUuid(unidade) || totais === null) return { ok: false, erro: "dados" };
  const contestacoes: Record<string, string> = {};
  for (const vendedor of campos.getAll("contestar")) {
    if (typeof vendedor !== "string" || !(vendedor in totais) || vendedor in contestacoes) return { ok: false, erro: "dados" };
    const motivo = limpo(campos.get(`motivo_${vendedor}`));
    if (!motivoValido(motivo)) return { ok: false, erro: "motivo" };
    contestacoes[vendedor] = motivo;
  }
  return { ok: true, dados: { mes, unidade, totais, contestacoes } };
}

export type DecisaoDoDono = { decisao: "manter"; motivo?: string } | { decisao: "ajustar"; valor: number; motivo: string };
export type Aprovacao = { fechamento: string; mes: string; unidade: string; decisoes: Record<string, DecisaoDoDono> };
/**
 * A aprovação do dono: "fechamento", "mes", "loja", "linhas" (cada vendedor) e "contestadas". Para cada
 * vendedor, "decisao_<vendedor>": "manter" ou "ajustar" (com "valor_<vendedor>" em reais e
 * "motivo_<vendedor>"); a linha contestada precisa de decisão e pode levar resposta ("motivo_").
 * Linha sem contestação mantida não vai ao banco.
 */
export function validarAprovacao(campos: Campos): Resultado<Aprovacao> {
  const fechamento = campos.get("fechamento");
  const mes = campos.get("mes");
  const unidade = campos.get("loja");
  if (typeof fechamento !== "string" || !ehUuid(fechamento) || typeof mes !== "string" || !MES.test(mes) || typeof unidade !== "string" || !ehUuid(unidade)) {
    return { ok: false, erro: "dados" };
  }
  const ids = (valores: unknown[]): string[] | null => (valores.every((v): v is string => typeof v === "string" && ehUuid(v)) ? valores : null);
  const linhas = ids(campos.getAll("linhas"));
  const listaDeContestadas = ids(campos.getAll("contestadas"));
  if (!linhas || !listaDeContestadas || new Set(linhas).size !== linhas.length || listaDeContestadas.some((c) => !linhas.includes(c))) {
    return { ok: false, erro: "dados" };
  }
  const contestadas = new Set(listaDeContestadas);
  const decisoes: Record<string, DecisaoDoDono> = {};
  for (const vendedor of linhas) {
    const decisao = campos.get(`decisao_${vendedor}`);
    const motivo = limpo(campos.get(`motivo_${vendedor}`));
    const contestada = contestadas.has(vendedor);
    if (decisao === null || decisao === undefined || decisao === "") {
      if (contestada) return { ok: false, erro: "decidir" };
      continue;
    }
    if (decisao === "manter") {
      if (!contestada) continue;
      if (motivo !== "" && !motivoValido(motivo)) return { ok: false, erro: "motivo" };
      decisoes[vendedor] = motivo === "" ? { decisao: "manter" } : { decisao: "manter", motivo };
      continue;
    }
    if (decisao !== "ajustar") return { ok: false, erro: "dados" };
    const bruto = campos.get(`valor_${vendedor}`);
    let valor: number;
    try {
      valor = lerReais(typeof bruto === "string" ? bruto : "");
    } catch {
      return { ok: false, erro: "valor" };
    }
    if (!Number.isSafeInteger(valor) || valor < 0 || valor > VALOR_APROVADO_MAXIMO) return { ok: false, erro: "valor" };
    if (!motivoValido(motivo)) return { ok: false, erro: "motivo" };
    decisoes[vendedor] = { decisao: "ajustar", valor, motivo };
  }
  return { ok: true, dados: { fechamento, mes, unidade, decisoes } };
}

// ---------------------------------------------------------------------------------------------
// A planilha do fechamento aprovado (para a folha de pagamento)
// ---------------------------------------------------------------------------------------------
export function planilhaDoFechamento(f: FechamentoDoMes, nomes: ReadonlyMap<string, string>): { colunas: string[]; linhas: (string | number)[][] } | null {
  if (f.fechamento?.situacao !== "aprovado") return null;
  const linhas = [...f.linhas].sort((a, b) => (nomes.get(a.vendedorId) ?? "").localeCompare(nomes.get(b.vendedorId) ?? "", "pt-BR"));
  return {
    colunas: ["Vendedor", "Bônus calculado (R$)", "Bônus aprovado (R$)", "Motivo do ajuste", "Contestação da gerência", "Decisão do dono"],
    linhas: [
      ...linhas.map((l) => [
        nomes.get(l.vendedorId) ?? "Pessoa sem nome", centavosCsv(l.totalCalculado), centavosCsv(l.totalAprovado ?? 0), l.ajusteMotivo ?? "",
        l.contestacao?.motivo ?? "", l.contestacao?.decisao === "ajustado" ? "Pagou outro valor" : l.contestacao?.decisao === "mantido" ? "Manteve o calculado" : "",
      ]),
      ["Total", centavosCsv(f.fechamento.totalCalculado), centavosCsv(f.fechamento.totalAprovado ?? 0), "", "", ""],
    ],
  };
}
