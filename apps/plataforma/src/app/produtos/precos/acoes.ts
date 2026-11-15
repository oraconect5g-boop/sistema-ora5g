"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDoCusto, lerCorrecaoDoCusto } from "../../../lib/catalogo/custos";
import { erroDePreco, validarCampanha, validarCancelamento, validarPreco } from "../../../lib/catalogo/precos";

// Cada ação chama UMA função do banco como a pessoa logada (sem chave secreta). O banco confere
// preco.alterar (na rede ou na loja), o agendamento único, a campanha sem sobreposição e grava a
// auditoria com o motivo. O passado não muda.

function voltar(variante: string | null, parametros: Record<string, string | null | undefined>): never {
  const busca = new URLSearchParams();
  if (variante) busca.set("variante", variante);
  for (const [chave, valor] of Object.entries(parametros)) if (valor) busca.set(chave, valor);
  redirect(variante ? `/produtos/precos?${busca}` : "/produtos");
}
const ouNulo = <T,>(valor: T | null) => valor as unknown as T;
const varianteDo = (dados: FormData) => (ehUuid(dados.get("variante")) ? (dados.get("variante") as string) : null);
const repetida = (data: unknown) => (data as { repetida?: unknown } | null)?.repetida === true;

/** CAT-008b: corrige o custo atual da variação, com motivo (o banco confere: o dono e o administrador). */
export async function corrigirCusto(dados: FormData) {
  const r = lerCorrecaoDoCusto(dados);
  if (!r.ok) voltar(varianteDo(dados), { erro: r.erro, form: "custo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("custo_corrigir", { p_variante: r.variante, p_valor_centavos: r.valor, p_motivo: r.motivo });
  if (error) voltar(r.variante, { erro: erroDoCusto(error), form: "custo" });
  voltar(r.variante, { ok: data === false ? "custo_sem_mudanca" : "custo_corrigido" });
}

export async function definirPreco(dados: FormData) {
  const r = validarPreco((n) => dados.get(n));
  if (!r.ok) voltar(varianteDo(dados), { erro: r.erro, form: "preco" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const d = r.dados;
  const { data, error } = await supabase.rpc("preco_definir", {
    p_variante: d.variante, p_unidade: ouNulo(d.unidade), p_canal: d.canal, p_valor: d.valor, p_inicio: ouNulo(d.inicio), p_motivo: d.motivo,
  });
  if (error) voltar(d.variante, { erro: erroDePreco(error), form: "preco" });
  voltar(d.variante, { ok: repetida(data) ? "sem_mudanca" : d.inicio ? "agendado" : "definido" });
}

export async function criarCampanha(dados: FormData) {
  const r = validarCampanha((n) => dados.get(n));
  if (!r.ok) voltar(varianteDo(dados), { erro: r.erro, form: "campanha" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const d = r.dados;
  const { data, error } = await supabase.rpc("preco_campanha", {
    p_variante: d.variante, p_unidade: ouNulo(d.unidade), p_canal: d.canal, p_valor: d.valor, p_inicio: ouNulo(d.inicio), p_fim: d.fim, p_motivo: d.motivo,
  });
  if (error) voltar(d.variante, { erro: erroDePreco(error), form: "campanha" });
  voltar(d.variante, { ok: repetida(data) ? "campanha_repetida" : "campanha" });
}

export async function cancelarPreco(dados: FormData) {
  const r = validarCancelamento((n) => dados.get(n));
  if (!r.ok) voltar(varianteDo(dados), { erro: r.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const d = r.dados;
  const { data, error } = await supabase.rpc("preco_cancelar", { p_preco: d.preco, p_motivo: d.motivo });
  if (error) voltar(d.variante, { erro: erroDePreco(error) });
  voltar(d.variante, { ok: data === "encerrado" ? "encerrado" : data === "ja_cancelado" ? "ja_cancelado" : "cancelado" });
}
