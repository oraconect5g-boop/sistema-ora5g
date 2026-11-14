// Contas a pagar (lote L8a): leitura estrita do resumo (public.contas_a_pagar_resumo, somado no banco com o
// RLS de quem pede), da lista, das categorias e dos fornecedores. Cada leitura volta com o próprio estado:
// banco sem a migration é "indisponível", falha é falha, e nenhuma das duas vira zero ou lista vazia.
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { centavosDoBanco, ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto, inteiro as n, lista, objeto, texto as t, type Leitura, type Linha } from "../leitura-do-banco";
import { ehDia, ehForma, ehSituacaoDaConta, type FiltroDasContas, type Forma, type SituacaoDaConta, type VisaoDasContas } from "./regras";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);
const TABELA_AUSENTE = new Set(["PGRST205", "42P01"]);

export type Soma = { quantidade: number; valor: number };
export type ResumoDasContas = {
  hoje: string;
  abertas: Soma;
  vencidas: Soma & { maisAntigaDias: number };
  hojeVencem: Soma;
  proximos7: Soma;
  proximos30: Soma;
  pagasNoMes: { quantidade: number; valorPago: number; valor: number };
  porCategoria: { categoria: string; aberto: number; pagoNoMes: number }[];
  /** unidade null: as contas da rede. */
  porLoja: { unidade: string | null; aberto: number; vencido: number }[];
  porSemana: { inicio: string; valor: number }[];
  escopo: { rede: boolean; lojas: { id: string; nome: string }[] };
};

const dia = (l: Linha, campo: string) => {
  const v = t(l, campo);
  if (!ehDia(v)) throw new RespostaInesperada(campo);
  return v;
};
const uuid = (l: Linha, campo: string) => {
  const v = t(l, campo);
  if (!ehUuid(v)) throw new RespostaInesperada(campo);
  return v;
};
function soma(dado: Linha, campo: string): Soma {
  const o = objeto(dado, campo);
  const r = { quantidade: n(o, "quantidade"), valor: n(o, "valor") };
  if (r.quantidade < 0 || r.valor < 0 || (r.quantidade === 0) !== (r.valor === 0)) throw new RespostaInesperada(campo);
  return r;
}
const somar = <T>(itens: readonly T[], valor: (i: T) => number) => itens.reduce((s, i) => s + valor(i), 0);

/** Converte a resposta do resumo. Conta que não fecha (as partes não batem com o total) é falha, não número. */
export function lerResumoDasContas(dado: unknown): ResumoDasContas {
  if (!ehObjeto(dado)) throw new RespostaInesperada("contas_a_pagar_resumo");
  const vencidas = { ...soma(dado, "vencidas"), maisAntigaDias: n(objeto(dado, "vencidas"), "mais_antiga_dias") };
  const pagas = objeto(dado, "pagas_no_mes");
  const escopo = objeto(dado, "escopo");
  if (typeof escopo.rede !== "boolean") throw new RespostaInesperada("escopo");
  const r: ResumoDasContas = {
    hoje: dia(dado, "hoje"),
    abertas: soma(dado, "abertas"),
    vencidas,
    hojeVencem: soma(dado, "hoje_vencem"),
    proximos7: soma(dado, "proximos_7"),
    proximos30: soma(dado, "proximos_30"),
    pagasNoMes: { quantidade: n(pagas, "quantidade"), valorPago: n(pagas, "valor_pago"), valor: n(pagas, "valor") },
    porCategoria: lista(dado, "por_categoria").map((l) => ({ categoria: uuid(l, "categoria"), aberto: n(l, "aberto"), pagoNoMes: n(l, "pago_no_mes") })),
    porLoja: lista(dado, "por_loja").map((l) => {
      if (l.unidade !== null && !ehUuid(l.unidade)) throw new RespostaInesperada("unidade");
      return { unidade: l.unidade as string | null, aberto: n(l, "aberto"), vencido: n(l, "vencido") };
    }),
    porSemana: lista(dado, "por_semana").map((l) => ({ inicio: dia(l, "inicio"), valor: n(l, "valor") })),
    escopo: { rede: escopo.rede, lojas: lista(escopo, "lojas").map((l) => ({ id: uuid(l, "id"), nome: t(l, "nome") })) },
  };
  const { abertas, pagasNoMes: p } = r;
  const fecha =
    vencidas.valor + r.hojeVencem.valor + r.proximos30.valor <= abertas.valor
    && r.proximos7.valor <= r.proximos30.valor
    && (vencidas.quantidade === 0 ? vencidas.maisAntigaDias === 0 : vencidas.maisAntigaDias >= 1)
    && somar(r.porLoja, (l) => l.aberto) === abertas.valor
    && somar(r.porLoja, (l) => l.vencido) === vencidas.valor
    && r.porLoja.every((l) => l.vencido >= 0 && l.vencido <= l.aberto)
    && somar(r.porCategoria, (c) => c.aberto) === abertas.valor
    && somar(r.porCategoria, (c) => c.pagoNoMes) === p.valorPago
    && r.porSemana.length === 8 && somar(r.porSemana, (s) => s.valor) + vencidas.valor <= abertas.valor
    && p.quantidade >= 0 && p.valorPago >= 0 && p.valor >= 0 && (p.quantidade === 0) === (p.valor === 0);
  if (!fecha) throw new RespostaInesperada("contas_a_pagar_resumo");
  return r;
}

/**
 * O resumo do filtro pedido. Filtro que o banco recusa (loja fora do escopo de quem pede) volta como
 * "recusado", para a tela cair no resumo de tudo o que a pessoa lê.
 */
export async function consultarResumo(supabase: Cliente, filtro: FiltroDasContas): Promise<Leitura<ResumoDasContas> | { estado: "recusado" }> {
  const r = await supabase.rpc("contas_a_pagar_resumo", { p_unidade: (filtro.tipo === "loja" ? filtro.id : null) as string, p_rede: filtro.tipo === "rede" });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    if (r.error.code === "42501" && filtro.tipo !== "todas") return { estado: "recusado" };
    console.error("contas a pagar: falha ao consultar contas_a_pagar_resumo", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerResumoDasContas(r.data) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("contas a pagar: resposta inesperada de contas_a_pagar_resumo");
    return { estado: "falha" };
  }
}

export type ContaAPagar = {
  id: string; unidadeId: string | null; categoriaId: string; fornecedorId: string | null; descricao: string; documento: string | null;
  valor: number; vencimento: string; forma: Forma; parcela: number; parcelas: number; situacao: SituacaoDaConta;
  pagaEm: string | null; valorPago: number | null; referencia: string | null; canceladaEm: string | null; motivoCancelamento: string | null;
};
const COLUNAS = "id, unidade_id, categoria_id, fornecedor_id, descricao, documento, valor_centavos, vencimento, forma, parcela, parcelas, situacao, paga_em, valor_pago_centavos, referencia_pagamento, cancelada_em, motivo_cancelamento";
export const LIMITE_DA_LISTA = 200;
/** A exportação (L8d) leva mais contas que a tela; passou disso, o arquivo avisa na última linha. */
export const LIMITE_DA_EXPORTACAO_DAS_CONTAS = 5_000;

function converterConta(l: Linha): ContaAPagar {
  const forma = l.forma;
  const situacao = l.situacao;
  if (!ehForma(forma) || !ehSituacaoDaConta(situacao)) throw new RespostaInesperada("conta");
  const textoOuNulo = (campo: string) => (l[campo] === null ? null : t(l, campo));
  const c: ContaAPagar = {
    id: uuid(l, "id"), unidadeId: l.unidade_id === null ? null : uuid(l, "unidade_id"), categoriaId: uuid(l, "categoria_id"),
    fornecedorId: l.fornecedor_id === null ? null : uuid(l, "fornecedor_id"), descricao: t(l, "descricao"), documento: textoOuNulo("documento"),
    valor: centavosDoBanco(l.valor_centavos), vencimento: dia(l, "vencimento"), forma, parcela: n(l, "parcela"), parcelas: n(l, "parcelas"), situacao,
    pagaEm: l.paga_em === null ? null : dia(l, "paga_em"), valorPago: l.valor_pago_centavos === null ? null : centavosDoBanco(l.valor_pago_centavos),
    referencia: textoOuNulo("referencia_pagamento"), canceladaEm: textoOuNulo("cancelada_em"), motivoCancelamento: textoOuNulo("motivo_cancelamento"),
  };
  // Paga tem os dados do pagamento; cancelada, o motivo; aberta, nenhum dos dois.
  const pagamento = c.pagaEm !== null && c.valorPago !== null && c.referencia !== null;
  const semPagamento = c.pagaEm === null && c.valorPago === null && c.referencia === null;
  const cancelamento = c.canceladaEm !== null && c.motivoCancelamento !== null;
  const semCancelamento = c.canceladaEm === null && c.motivoCancelamento === null;
  const coerente = c.situacao === "paga" ? pagamento && semCancelamento : c.situacao === "cancelada" ? cancelamento && semPagamento : semPagamento && semCancelamento;
  if (!coerente || c.parcela < 1 || c.parcela > c.parcelas || c.valor <= 0) throw new RespostaInesperada("conta");
  return c;
}

/**
 * A lista da visão pedida: as em aberto por vencimento; as pagas e as canceladas dos últimos 60 dias, das mais
 * novas. No máximo LIMITE_DA_LISTA linhas; "mais" diz se ficou alguma de fora.
 */
export async function consultarContas(
  supabase: Cliente, visao: VisaoDasContas, filtro: FiltroDasContas, hoje: string, limite: number = LIMITE_DA_LISTA,
): Promise<Leitura<{ contas: ContaAPagar[]; mais: boolean }>> {
  const inicio = new Date(Date.parse(`${hoje}T12:00:00Z`) - 60 * 86_400_000).toISOString().slice(0, 10);
  let consulta = supabase.from("contas_a_pagar").select(COLUNAS);
  if (filtro.tipo === "rede") consulta = consulta.is("unidade_id", null);
  if (filtro.tipo === "loja") consulta = consulta.eq("unidade_id", filtro.id);
  const r = visao === "abertas"
    ? await consulta.eq("situacao", "aberta").order("vencimento").order("descricao").order("parcela").limit(limite + 1)
    : visao === "pagas"
      ? await consulta.eq("situacao", "paga").gte("paga_em", inicio).order("paga_em", { ascending: false }).order("descricao").limit(limite + 1)
      : await consulta.eq("situacao", "cancelada").gte("cancelada_em", `${inicio}T03:00:00Z`).order("cancelada_em", { ascending: false }).limit(limite + 1);
  if (r.error) {
    if (TABELA_AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    console.error("contas a pagar: falha ao ler a lista", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    const contas = (r.data as Linha[]).map(converterConta);
    return { estado: "ok", dados: { contas: contas.slice(0, limite), mais: contas.length > limite } };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("contas a pagar: conta em forma inesperada");
    return { estado: "falha" };
  }
}

/** entraNoResultado (L8b): nulo quando o banco ainda não tem a coluna (a tela então não mostra a marcação). */
export type CategoriaDaConta = { id: string; nome: string; ativa: boolean; entraNoResultado: boolean | null };
const COLUNA_AUSENTE = "42703";
export async function consultarCategorias(supabase: Cliente): Promise<Leitura<CategoriaDaConta[]>> {
  const tabela = () => supabase.from("contas_pagar_categorias");
  const r = await tabela().select("id, nome, ativa, entra_no_resultado").order("ordem").order("nome");
  const lidas: Linha[] | null = r.error?.code === COLUNA_AUSENTE ? null : (r.data as Linha[] | null);
  const antigas = r.error?.code === COLUNA_AUSENTE ? await tabela().select("id, nome, ativa").order("ordem").order("nome") : null;
  const erro = antigas ? antigas.error : r.error;
  if (erro) {
    if (TABELA_AUSENTE.has(erro.code)) return { estado: "indisponivel" };
    console.error("contas a pagar: falha ao ler as categorias", { codigo: erro.code || null });
    return { estado: "falha" };
  }
  const linhas = (lidas ?? antigas?.data ?? []) as Linha[];
  const entra = (c: Linha) => (lidas === null ? null : c.entra_no_resultado);
  if (!linhas.every((c) => ehUuid(c.id) && typeof c.nome === "string" && typeof c.ativa === "boolean" && (lidas === null || typeof entra(c) === "boolean"))) {
    console.error("contas a pagar: categoria em forma inesperada");
    return { estado: "falha" };
  }
  return { estado: "ok", dados: linhas.map((c) => ({ id: c.id as string, nome: c.nome as string, ativa: c.ativa as boolean, entraNoResultado: entra(c) as boolean | null })) };
}

/** Fornecedores ativos para o formulário (opcional): sem a lista, o formulário segue sem o campo. */
export async function consultarFornecedores(supabase: Cliente): Promise<{ id: string; nome: string }[] | null> {
  const r = await supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome").limit(300);
  if (r.error) {
    console.error("contas a pagar: falha ao ler os fornecedores", { codigo: r.error.code || null });
    return null;
  }
  return r.data.map((f) => ({ id: f.id, nome: f.nome }));
}

/**
 * Todos os fornecedores da rede (ativos ou não), para a planilha dar o nome de cada conta (L8d). Falha
 * volta null: a exportação para, em vez de sair com o nome em branco.
 */
export async function nomesDosFornecedores(supabase: Cliente): Promise<Map<string, string> | null> {
  const r = await supabase.from("fornecedores").select("id, nome").order("nome").limit(5_000);
  if (r.error) {
    console.error("contas a pagar: falha ao ler os nomes dos fornecedores", { codigo: r.error.code || null });
    return null;
  }
  return new Map(r.data.map((f) => [f.id, f.nome]));
}
