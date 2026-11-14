// Bônus por meta (lote L9a; decisão do proprietário de 13/11/2026, D-014): a Ora não paga comissão por
// venda; paga bônus ao vendedor que bate a meta do mês. Leitura estrita de public.bonus_do_mes, de
// public.extrato_do_vendedor e das versões de public.bonus_regras, e a validação do formulário do dono.
// A conta é do banco (provada em packages/banco/src/bonus.test.ts); aqui ela é REFEITA para conferir:
// número que a tela não sabe explicar vira falha, nunca bônus.
//   * Faixa: "a partir de X% da meta, R$ Y"; de 1 a 5, com X e Y crescentes; vale a maior alcançada.
//   * Alcançou quando realizado × 100 ≥ meta × X, em inteiros (sem arredondar). Sem meta, sem bônus.
//   * A venda conta na conclusão; devolução e cancelamento descontam no mês em que acontecem (regra de
//     contagem 1 das metas). Provisório até o fechamento do mês (lote L9b).
import { lerReais } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";
import { RespostaInesperada } from "../financeiro/painel";
import { brl, numero } from "../formato";
import { ehObjeto, inteiro as n, inteiroOuNulo as nOuNulo, lista, objeto, texto as t, type Linha } from "../leitura-do-banco";
import { comUnidade, ehMedida, MEDIDAS, ORDEM_DAS_MEDIDAS, type Medida } from "../metas/painel";

export const MAXIMO_DE_FAIXAS = 5;
export const PORCENTAGEM_MAXIMA = 500;
/** R$ 100.000,00 por faixa. */
export const BONUS_MAXIMO = 10_000_000;
export const LINHAS_DO_EXTRATO = 2_000;

/** Uma faixa: a partir de `aPartirDe`% da meta, `valor` centavos de bônus. */
export type Faixa = { aPartirDe: number; valor: number };
export type RegraDoMes = { vigenteDesde: string; versao: number; faixas: Faixa[] };
export type Proxima = { faixa: number; aPartirDe: number; valor: number; falta: number };
export type ContaDaMedida = { meta: number | null; realizado: number; faixa: number | null; bonus: number; proxima: Proxima | null };
export type BonusDoVendedor = { vendedorId: string; medidas: Partial<Record<Medida, ContaDaMedida>>; total: number };
export type BonusDoMes = {
  /** "2026-11-01". */
  mes: string;
  /** As medidas com regra que vale no mês (sem regra, a medida não paga bônus e não aparece). */
  regras: Partial<Record<Medida, RegraDoMes>>;
  /** Quem tem meta ou fato no mês; o vendedor recebe só a própria linha. */
  vendedores: BonusDoVendedor[];
};

const MES = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const medidasComRegra = (b: Pick<BonusDoMes, "regras">) => ORDEM_DAS_MEDIDAS.filter((m) => b.regras[m] !== undefined);

/** As faixas como o banco grava: de 1 a 5, porcentagem e bônus crescentes, dentro dos limites. */
export function faixasValidas(faixas: readonly Faixa[]): boolean {
  if (faixas.length < 1 || faixas.length > MAXIMO_DE_FAIXAS) return false;
  return faixas.every((f, i) => {
    const anterior = faixas[i - 1];
    return Number.isSafeInteger(f.aPartirDe) && Number.isSafeInteger(f.valor)
      && f.aPartirDe >= 1 && f.aPartirDe <= PORCENTAGEM_MAXIMA && f.valor >= 1 && f.valor <= BONUS_MAXIMO
      && (anterior === undefined || (f.aPartirDe > anterior.aPartirDe && f.valor > anterior.valor));
  });
}
function lerFaixas(dado: unknown): Faixa[] {
  if (!Array.isArray(dado) || !dado.every(ehObjeto)) throw new RespostaInesperada("faixas");
  const faixas = dado.map((f) => ({ aPartirDe: n(f, "a_partir_de"), valor: n(f, "valor") }));
  if (!faixasValidas(faixas)) throw new RespostaInesperada("faixas");
  return faixas;
}

/** A conta de uma medida, refeita: a maior faixa alcançada, o bônus e a próxima, com quanto falta. */
export function contaDaMedida(meta: number | null, realizado: number, faixas: readonly Faixa[]): ContaDaMedida {
  if (meta === null) return { meta, realizado, faixa: null, bonus: 0, proxima: null };
  let faixa: number | null = null;
  let bonus = 0;
  let proxima: Proxima | null = null;
  for (const [i, f] of faixas.entries()) {
    if (realizado * 100 >= meta * f.aPartirDe) {
      faixa = i + 1;
      bonus = f.valor;
    } else if (proxima === null) {
      // O menor realizado que alcança a faixa, em inteiros: ⌈meta × X ÷ 100⌉.
      proxima = { faixa: i + 1, aPartirDe: f.aPartirDe, valor: f.valor, falta: Math.ceil((meta * f.aPartirDe) / 100) - realizado };
    }
  }
  return { meta, realizado, faixa, bonus, proxima };
}

function lerConta(l: Linha): ContaDaMedida {
  const proximaBruta = l.proxima;
  let proxima: Proxima | null = null;
  if (proximaBruta !== null) {
    if (!ehObjeto(proximaBruta)) throw new RespostaInesperada("proxima");
    proxima = { faixa: n(proximaBruta, "faixa"), aPartirDe: n(proximaBruta, "a_partir_de"), valor: n(proximaBruta, "valor"), falta: n(proximaBruta, "falta") };
  }
  return { meta: nOuNulo(l, "meta"), realizado: n(l, "realizado"), faixa: nOuNulo(l, "faixa"), bonus: n(l, "bonus"), proxima };
}
const mesmaConta = (a: ContaDaMedida, b: ContaDaMedida) => JSON.stringify(a) === JSON.stringify(b);

/** Converte a resposta de public.bonus_do_mes, conferindo cada conta e cada total. */
export function lerBonusDoMes(dado: unknown, pedido: { mes: string }): BonusDoMes {
  if (!ehObjeto(dado)) throw new RespostaInesperada("bonus_do_mes");
  // Outra regra de contagem seria um número que a tela não sabe explicar: falha, não bônus.
  if (dado.regra_contagem !== 1) throw new RespostaInesperada("regra_contagem");
  const mes = t(dado, "mes");
  if (!MES.test(mes) || mes !== pedido.mes) throw new RespostaInesperada("mes");
  const brutas = objeto(dado, "regras");
  const regras: BonusDoMes["regras"] = {};
  for (const [medida, bruta] of Object.entries(brutas)) {
    if (!ehMedida(medida) || !ehObjeto(bruta)) throw new RespostaInesperada("regras");
    const vigenteDesde = t(bruta, "vigente_desde");
    const versao = n(bruta, "versao");
    if (!MES.test(vigenteDesde) || vigenteDesde > mes || versao < 1) throw new RespostaInesperada("vigente_desde");
    regras[medida] = { vigenteDesde, versao, faixas: lerFaixas(bruta.faixas) };
  }
  const comRegra = medidasComRegra({ regras });
  const vendedores = lista(dado, "vendedores").map((l) => {
    const vendedorId = t(l, "vendedor_id");
    if (!ehUuid(vendedorId)) throw new RespostaInesperada("vendedor_id");
    const brutasDoVendedor = objeto(l, "medidas");
    const chaves = Object.keys(brutasDoVendedor);
    if (chaves.length !== comRegra.length || !comRegra.every((m) => chaves.includes(m))) throw new RespostaInesperada("medidas");
    const medidas: BonusDoVendedor["medidas"] = {};
    let soma = 0;
    for (const medida of comRegra) {
      const conta = lerConta(objeto(brutasDoVendedor, medida));
      // A conta do banco tem de ser a mesma refeita aqui com as faixas que valem no mês.
      if (!mesmaConta(conta, contaDaMedida(conta.meta, conta.realizado, regras[medida]?.faixas ?? []))) throw new RespostaInesperada("conta");
      medidas[medida] = conta;
      soma += conta.bonus;
    }
    const total = n(l, "total");
    if (total !== soma) throw new RespostaInesperada("total");
    return { vendedorId, medidas, total };
  });
  if (new Set(vendedores.map((v) => v.vendedorId)).size !== vendedores.length) throw new RespostaInesperada("vendedor repetido");
  return { mes, regras, vendedores };
}

// ---------------------------------------------------------------------------------------------
// O extrato do vendedor
// ---------------------------------------------------------------------------------------------
export type TipoDoFato = "venda" | "cancelamento" | "devolucao" | "connect";
export type ServicoDoConnect = "ativacao" | "recarga" | "portabilidade";
export type Efeito = Record<Medida, number>;
export type FatoDoExtrato = {
  tipo: TipoDoFato;
  /** Instante do fato (ISO). */
  quando: string;
  venda: number | null;
  devolucao: number | null;
  operacao: number | null;
  servico: ServicoDoConnect | null;
  efeito: Efeito;
};
export type Extrato = {
  mes: string;
  unidadeId: string;
  vendedorId: string;
  /** Quantos fatos o mês tem (as linhas vêm até 2.000, das mais recentes). */
  quantidade: number;
  totais: Efeito;
  linhas: FatoDoExtrato[];
};
const TIPOS: readonly TipoDoFato[] = ["venda", "cancelamento", "devolucao", "connect"];
const SERVICOS: readonly ServicoDoConnect[] = ["ativacao", "recarga", "portabilidade"];
const mesDeSaoPaulo = (instante: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date(instante));

function lerFato(l: Linha, mes: string): FatoDoExtrato {
  const tipo = t(l, "tipo") as TipoDoFato;
  if (!TIPOS.includes(tipo)) throw new RespostaInesperada("tipo");
  const quando = t(l, "quando");
  if (Number.isNaN(Date.parse(quando)) || `${mesDeSaoPaulo(quando)}-01` !== mes) throw new RespostaInesperada("quando");
  const efeito: Efeito = { vendido_liquido: n(l, "vendido_liquido"), aparelhos: n(l, "aparelhos"), acessorios: n(l, "acessorios"), connect: n(l, "connect") };
  const venda = nOuNulo(l, "venda");
  const devolucao = nOuNulo(l, "devolucao");
  const operacao = nOuNulo(l, "operacao");
  const servicoBruto = l.servico;
  if (servicoBruto !== null && !SERVICOS.includes(servicoBruto as ServicoDoConnect)) throw new RespostaInesperada("servico");
  const servico = servicoBruto as ServicoDoConnect | null;
  const valores = [efeito.vendido_liquido, efeito.aparelhos, efeito.acessorios];
  // Cada tipo tem a sua forma: a venda soma, o cancelamento e a devolução descontam, o Connect conta um.
  const forma = {
    venda: venda !== null && devolucao === null && operacao === null && servico === null && valores.every((v) => v >= 0) && efeito.connect === 0,
    cancelamento: venda !== null && devolucao === null && operacao === null && servico === null && valores.every((v) => v <= 0) && efeito.connect === 0,
    devolucao: venda !== null && devolucao !== null && operacao === null && servico === null && valores.every((v) => v <= 0) && efeito.vendido_liquido < 0 && efeito.connect === 0,
    connect: venda === null && devolucao === null && servico !== null && valores.every((v) => v === 0) && efeito.connect === 1,
  }[tipo];
  if (!forma) throw new RespostaInesperada("fato");
  return { tipo, quando, venda, devolucao, operacao, servico, efeito };
}

/** Converte a resposta de public.extrato_do_vendedor; com todas as linhas, a soma delas tem de ser o total. */
export function lerExtrato(dado: unknown, pedido: { mes: string; unidade: string; vendedor: string }): Extrato {
  if (!ehObjeto(dado)) throw new RespostaInesperada("extrato_do_vendedor");
  if (dado.regra_contagem !== 1) throw new RespostaInesperada("regra_contagem");
  const mes = t(dado, "mes");
  if (mes !== pedido.mes || t(dado, "unidade_id") !== pedido.unidade || t(dado, "vendedor_id") !== pedido.vendedor) throw new RespostaInesperada("pedido");
  const quantidade = n(dado, "quantidade");
  const tot = objeto(dado, "totais");
  const totais: Efeito = { vendido_liquido: n(tot, "vendido_liquido"), aparelhos: n(tot, "aparelhos"), acessorios: n(tot, "acessorios"), connect: n(tot, "connect") };
  const linhas = lista(dado, "linhas").map((l) => lerFato(l, mes));
  if (linhas.length > LINHAS_DO_EXTRATO || quantidade < linhas.length || (quantidade > linhas.length && linhas.length < LINHAS_DO_EXTRATO)) {
    throw new RespostaInesperada("quantidade");
  }
  if (totais.connect < 0 || totais.connect > quantidade) throw new RespostaInesperada("connect");
  if (quantidade === linhas.length) {
    for (const medida of ORDEM_DAS_MEDIDAS) {
      if (linhas.reduce((soma, l) => soma + l.efeito[medida], 0) !== totais[medida]) throw new RespostaInesperada("totais");
    }
  }
  for (let i = 1; i < linhas.length; i++) {
    if (Date.parse(linhas[i - 1]?.quando ?? "") < Date.parse(linhas[i]?.quando ?? "")) throw new RespostaInesperada("ordem");
  }
  return { mes, unidadeId: pedido.unidade, vendedorId: pedido.vendedor, quantidade, totais, linhas };
}

// ---------------------------------------------------------------------------------------------
// As versões das regras (a tela do dono)
// ---------------------------------------------------------------------------------------------
export type VersaoDaRegra = { versao: number; medida: Medida; vigenteDesde: string; faixas: Faixa[] | null; motivo: string | null; definidaEm: string };

/** Converte as linhas de public.bonus_regras (a mais nova primeiro). */
export function lerVersoes(dado: unknown): VersaoDaRegra[] {
  if (!Array.isArray(dado) || !dado.every(ehObjeto)) throw new RespostaInesperada("bonus_regras");
  const versoes = dado.map((l) => {
    const medida = t(l, "medida");
    const vigenteDesde = t(l, "vigente_desde");
    const definidaEm = t(l, "definida_em");
    const motivo = l.motivo;
    if (!ehMedida(medida) || !MES.test(vigenteDesde) || Number.isNaN(Date.parse(definidaEm)) || (motivo !== null && typeof motivo !== "string")) {
      throw new RespostaInesperada("versao");
    }
    return { versao: n(l, "versao"), medida, vigenteDesde, faixas: l.faixas === null ? null : lerFaixas(l.faixas), motivo: motivo as string | null, definidaEm };
  });
  if (versoes.some((v, i) => i > 0 && (versoes[i - 1]?.versao ?? 0) <= v.versao)) throw new RespostaInesperada("ordem");
  return versoes;
}

/** A regra que vale num mês, pelas versões: a de maior "a partir de" que não passa do mês e, nela, a mais nova. */
export function regraNoMes(versoes: readonly VersaoDaRegra[], medida: Medida, mes: string): Faixa[] | null {
  const valem = versoes.filter((v) => v.medida === medida && v.vigenteDesde <= mes);
  valem.sort((a, b) => (a.vigenteDesde === b.vigenteDesde ? b.versao - a.versao : b.vigenteDesde.localeCompare(a.vigenteDesde)));
  return valem[0]?.faixas ?? null;
}

// ---------------------------------------------------------------------------------------------
// Frases
// ---------------------------------------------------------------------------------------------
/** "100% da meta" */
export const porcentagemDaMeta = (aPartirDe: number) => `${numero(aPartirDe)}% da meta`;
/** "a partir de 100% da meta: R$ 300,00" */
export const textoDaFaixa = (f: Faixa) => `a partir de ${porcentagemDaMeta(f.aPartirDe)}: ${brl(f.valor)}`;
/** "100%: R$ 300,00 · 120%: R$ 500,00" */
export const resumoDasFaixas = (faixas: readonly Faixa[]) => faixas.map((f) => `${numero(f.aPartirDe)}%: ${brl(f.valor)}`).join(" · ");

/** O verbo concorda com o que falta: "Falta 1 aparelho", "Faltam 2 aparelhos", "Falta R$ 1,50", "Faltam R$ 222,00". */
export function verboFaltar(medida: Medida, quanto: number, terminou: boolean): string {
  const singular = MEDIDAS[medida].dinheiro ? quanto < 200 : quanto === 1;
  return terminou ? (singular ? "Faltou" : "Faltaram") : (singular ? "Falta" : "Faltam");
}

/** Em uma frase, onde a pessoa está na medida: a faixa alcançada e quanto falta para a próxima. */
export function fraseDaConta(medida: Medida, c: ContaDaMedida, faixas: readonly Faixa[], terminou: boolean): string {
  if (c.meta === null) return `Sem meta de ${MEDIDAS[medida].curto.toLowerCase()} no mês: esta medida não paga bônus.`;
  const alcancou = c.faixa === null ? null : `Faixa ${c.faixa} de ${faixas.length}: ${brl(c.bonus)}.`;
  if (c.proxima === null) return `${alcancou ?? ""} Maior faixa alcançada.`.trim();
  const falta = `${verboFaltar(medida, c.proxima.falta, terminou)} ${comUnidade(medida, c.proxima.falta)} para ${porcentagemDaMeta(c.proxima.aPartirDe)} (${brl(c.proxima.valor)}).`;
  if (terminou) return alcancou ? `${alcancou} ${falta}` : `Nenhuma faixa alcançada. ${falta}`;
  return alcancou ? `${alcancou} ${falta}` : falta;
}

// ---------------------------------------------------------------------------------------------
// O formulário do dono
// ---------------------------------------------------------------------------------------------
export const OK_DO_BONUS = {
  salvas: "Regras salvas. Cada mudança fica no histórico, com a data, quem fez e o motivo.",
  sem_mudanca: "Nada mudou: as faixas enviadas já eram as que valem nesse mês.",
} as const;
export const ERROS_DO_BONUS = {
  dados: "Dados inválidos: confira os campos.",
  incompleta: "Cada faixa precisa das duas partes: a porcentagem da meta e o valor do bônus. Deixe a linha inteira vazia para não usar.",
  porcentagem: "A porcentagem da meta é um número inteiro de 1 a 500 (por exemplo, 100 para bater a meta, 120 para passar 20%).",
  valor: "O bônus é em reais com vírgula (por exemplo, 300,00), de R$ 0,01 a R$ 100.000,00.",
  ordem: "As faixas vão da menor para a maior: cada porcentagem maior que a anterior, com bônus maior também. Duas faixas não podem ter a mesma porcentagem.",
  motivo: "Para mudar ou retirar uma regra que já vale, diga o motivo (de 3 a 300 letras); ele fica na auditoria.",
  mes: "A regra vale a partir deste mês ou de um dos próximos 12: o mês que já terminou não muda.",
  permissao: "Só o dono define as regras do bônus.",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDoBonus = keyof typeof ERROS_DO_BONUS;

export function erroDoBonus(erro: { code?: string; message?: string } | null | undefined): ErroDoBonus {
  const codigo = erro?.code ?? "";
  const mensagem = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501") return "permissao";
  if (codigo === "22023") {
    const regras: [string, ErroDoBonus][] = [["motivo", "motivo"], ["mês", "mes"], ["crescentes", "ordem"], ["500%", "porcentagem"], ["porcentagem da meta e o valor", "incompleta"]];
    return regras.find(([trecho]) => mensagem.includes(trecho))?.[1] ?? "dados";
  }
  return "falha";
}

/** O valor de uma faixa no campo: "300,00". */
export const valorDaFaixaNoCampo = (centavos: number) => brl(centavos).replace(/^R\$\s?/, "");

export type DefinicaoDoBonus = { vigenteDesde: string; faixas: Record<Medida, Faixa[] | null>; motivo: string | null };
type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroDoBonus };

/**
 * Confere o formulário: "desde" (o mês em que passa a valer) e, em cada medida, até 5 linhas de
 * porcentagem (pct_<medida>_<n>) e bônus (valor_<medida>_<n>). Linha inteira vazia é ignorada; medida
 * sem nenhuma linha fica sem bônus (retira a regra que valesse). As linhas são postas em ordem de
 * porcentagem; o bônus tem de crescer junto. As quatro medidas vão sempre: a que não mudou não vira versão.
 */
export function validarRegras(campo: (nome: string) => unknown): Resultado<DefinicaoDoBonus> {
  const desde = campo("desde");
  if (typeof desde !== "string" || !MES.test(desde)) return { ok: false, erro: "dados" };
  const faixas = {} as Record<Medida, Faixa[] | null>;
  for (const medida of ORDEM_DAS_MEDIDAS) {
    const linhas: Faixa[] = [];
    for (let i = 1; i <= MAXIMO_DE_FAIXAS; i++) {
      const pct = String(campo(`pct_${medida}_${i}`) ?? "").trim().replace(/%$/, "").trim();
      const valor = String(campo(`valor_${medida}_${i}`) ?? "").trim();
      if (pct === "" && valor === "") continue;
      if (pct === "" || valor === "") return { ok: false, erro: "incompleta" };
      if (!/^\d{1,3}$/.test(pct) || Number(pct) < 1 || Number(pct) > PORCENTAGEM_MAXIMA) return { ok: false, erro: "porcentagem" };
      let centavos: number;
      try {
        centavos = lerReais(valor);
      } catch {
        return { ok: false, erro: "valor" };
      }
      if (!Number.isSafeInteger(centavos) || centavos < 1 || centavos > BONUS_MAXIMO) return { ok: false, erro: "valor" };
      linhas.push({ aPartirDe: Number(pct), valor: centavos });
    }
    linhas.sort((a, b) => a.aPartirDe - b.aPartirDe);
    if (linhas.length > 0 && !faixasValidas(linhas)) return { ok: false, erro: "ordem" };
    faixas[medida] = linhas.length > 0 ? linhas : null;
  }
  const bruto = campo("motivo");
  const motivo = typeof bruto === "string" ? bruto.trim().replace(/\s+/g, " ") : "";
  if (motivo !== "" && (motivo.length < 3 || motivo.length > 300)) return { ok: false, erro: "motivo" };
  return { ok: true, dados: { vigenteDesde: desde, faixas, motivo: motivo === "" ? null : motivo } };
}

/** O corpo de public.bonus_definir: {"medida": [{"a_partir_de", "valor"}] ou null}. */
export const faixasParaOBanco = (faixas: Record<Medida, Faixa[] | null>) =>
  Object.fromEntries(ORDEM_DAS_MEDIDAS.map((m) => [m, faixas[m]?.map((f) => ({ a_partir_de: f.aPartirDe, valor: f.valor })) ?? null]));
