"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDaVenda, lerValor } from "../../lib/vendas/regras";

const voltar = (erro: { code?: string } | null, ok: string): never => redirect(erro ? `/caixa?erro=${erroDaVenda(erro)}` : `/caixa?ok=${ok}`);

export async function movimentarCaixa(dados: FormData) {
  const tipo = dados.get("tipo");
  const valor = lerValor(dados.get("valor"));
  const motivo = String(dados.get("motivo") ?? "").trim();
  const chave = String(dados.get("chave") ?? "");
  if ((tipo !== "suprimento" && tipo !== "sangria") || valor === null || valor <= 0) redirect("/caixa?erro=valor");
  if (motivo.length < 3) redirect("/caixa?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("movimentar_caixa", { p_tipo: tipo, p_valor: valor, p_motivo: motivo, p_chave: /^[0-9a-f-]{36}$/.test(chave) ? chave : randomUUID() });
  voltar(error, tipo);
}

export async function fecharCaixa(dados: FormData) {
  const contado = lerValor(dados.get("contado"));
  if (contado === null || contado < 0) redirect("/caixa?erro=valor");
  const observacao = String(dados.get("observacao") ?? "").trim();
  const { supabase } = await obterSessao({ exigirLoja: true });
  // Sem observação vai null: o banco exige explicação quando há diferença.
  const { error } = await supabase.rpc("fechar_caixa", { p_contado: contado, p_observacao: (observacao || null) as string });
  voltar(error, "fechado");
}

export async function conferirCaixa(dados: FormData) {
  const caixa = dados.get("caixa");
  if (!ehUuid(caixa)) redirect("/caixa?erro=dados");
  const observacao = String(dados.get("observacao") ?? "").trim();
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("conferir_caixa", { p_caixa: caixa, p_observacao: (observacao || null) as string });
  voltar(error, "conferido");
}

export async function decidirAprovacao(dados: FormData) {
  const pedido = dados.get("pedido");
  const decisao = dados.get("decisao");
  if (!ehUuid(pedido) || (decisao !== "aprovar" && decisao !== "negar")) redirect("/aprovacoes?erro=dados");
  const observacao = String(dados.get("observacao") ?? "").trim();
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("decidir_aprovacao", { p_aprovacao: pedido, p_aprovar: decisao === "aprovar", p_observacao: (observacao || null) as string });
  if (error) redirect(`/aprovacoes?erro=${erroDaVenda(error)}`);
  redirect(`/aprovacoes?ok=${data ? decisao : "vencido"}`);
}
