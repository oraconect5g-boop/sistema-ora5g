"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import {
  erroDasContas, filtroDasContas, filtroNoEndereco, lerCategoria, lerCorrecao, lerLancamento, lerMotivo, lerPagamento, visaoDasContas,
  type ErroDasContas, type OkDasContas,
} from "../../lib/contas-a-pagar/regras";
import type { Json } from "../../lib/supabase/tipos-banco";

// Contas a pagar (lote L8a). Cada ação confere o formulário, chama a função do banco como a pessoa logada
// (o banco confere a permissão de novo) e volta para a mesma lista e o mesmo filtro, com a mensagem.

function voltar(dados: FormData, resultado: { ok: OkDasContas } | { erro: ErroDasContas }): never {
  const parametros = new URLSearchParams();
  const visao = visaoDasContas(dados.get("ver"));
  if (visao !== "abertas") parametros.set("ver", visao);
  const loja = filtroNoEndereco(filtroDasContas(dados.get("loja")));
  if (loja) parametros.set("loja", loja);
  if ("ok" in resultado) parametros.set("ok", resultado.ok);
  else parametros.set("erro", resultado.erro);
  redirect(`/contas-a-pagar?${parametros}`);
}
const falhou = (dados: FormData, erro: { code?: string; message?: string }) => voltar(dados, { erro: erroDasContas(erro) });

export async function lancarConta(dados: FormData) {
  const lido = lerLancamento(dados);
  if (!lido.ok) voltar(dados, { erro: lido.erro });
  const l = lido.lancamento;
  const chave = dados.get("chave");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("conta_pagar_lancar", {
    p_dados: { unidade: l.unidade, categoria: l.categoria, fornecedor: l.fornecedor, descricao: l.descricao, documento: l.documento, valor: l.valor, vencimento: l.vencimento, forma: l.forma, vezes: l.vezes } as Json,
    p_chave: ehUuid(chave) ? chave : randomUUID(),
  });
  if (error) falhou(dados, error);
  voltar(dados, { ok: l.vezes > 1 ? "lancadas" : "lancada" });
}

export async function pagarConta(dados: FormData) {
  const lido = lerPagamento(dados);
  if (!lido.ok) voltar(dados, { erro: lido.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("conta_pagar_pagar", { p_conta: lido.conta, p_pago_em: lido.pagoEm, p_valor_pago: lido.valorPago, p_referencia: lido.referencia });
  if (error) falhou(dados, error);
  voltar(dados, { ok: data === false ? "sem_mudanca" : "paga" });
}

export async function desfazerPagamento(dados: FormData) {
  const lido = lerMotivo(dados);
  if (!lido.ok) voltar(dados, { erro: lido.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("conta_pagar_desfazer_pagamento", { p_conta: lido.conta, p_motivo: lido.motivo });
  if (error) falhou(dados, error);
  voltar(dados, { ok: data === false ? "sem_mudanca" : "desfeito" });
}

export async function cancelarConta(dados: FormData) {
  const lido = lerMotivo(dados);
  if (!lido.ok) voltar(dados, { erro: lido.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("conta_pagar_cancelar", { p_conta: lido.conta, p_motivo: lido.motivo, p_e_seguintes: lido.seguintes });
  if (error) falhou(dados, error);
  voltar(dados, { ok: data === 0 ? "sem_mudanca" : typeof data === "number" && data > 1 ? "canceladas" : "cancelada" });
}

export async function corrigirConta(dados: FormData) {
  const lido = lerCorrecao(dados);
  if (!lido.ok) voltar(dados, { erro: lido.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("conta_pagar_corrigir", { p_conta: lido.conta, p_dados: { valor: lido.valor, vencimento: lido.vencimento } as Json, p_motivo: lido.motivo });
  if (error) falhou(dados, error);
  voltar(dados, { ok: data === false ? "sem_mudanca" : "corrigida" });
}

export async function salvarCategoria(dados: FormData) {
  const lido = lerCategoria(dados);
  if (!lido.ok) voltar(dados, { erro: lido.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("conta_pagar_categoria_salvar", { p_categoria: lido.categoria as string, p_nome: lido.nome, p_ativa: lido.ativa as boolean });
  if (error) falhou(dados, error);
  voltar(dados, { ok: "categoria" });
}
