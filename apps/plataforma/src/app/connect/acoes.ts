"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehTipoOperacao } from "@ora5g/dominio/nogle";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDoConnect, lerPedido } from "../../lib/connect/regras";
import type { Json } from "../../lib/supabase/tipos-banco";

// Cada ação chama UMA função do banco como a pessoa logada (ADR-005). O servidor web não fala
// com a Nogle: a operação fica registrada e o worker do servidor envia e consulta.
const chaveDe = (dados: FormData) => {
  const chave = dados.get("chave");
  return typeof chave === "string" && /^[0-9a-f-]{36}$/.test(chave) ? chave : randomUUID();
};
const voltar = (erro: { code?: string } | null, ok: string): never => redirect(erro ? `/connect?erro=${erroDoConnect(erro)}` : `/connect?ok=${ok}`);

export async function registrarOperacao(dados: FormData) {
  const tipo = dados.get("tipo");
  if (!ehTipoOperacao(tipo)) redirect("/connect?erro=dados");
  const lido = lerPedido(tipo, dados);
  if (!lido.ok) redirect(`/connect?erro=${lido.erro}`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_registrar", { p_tipo: tipo, p_pedido: lido.pedido as Json, p_chave: chaveDe(dados) });
  voltar(error, "registrada");
}

export async function cancelarOperacao(dados: FormData) {
  const operacao = dados.get("operacao");
  const motivo = dados.get("motivo");
  if (!ehUuid(operacao)) redirect("/connect?erro=dados");
  if (typeof motivo !== "string" || motivo.trim().length < 3) redirect("/connect?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_cancelar", { p_operacao: operacao, p_motivo: motivo.trim() });
  voltar(error, "cancelada");
}

export async function resolverOperacao(dados: FormData) {
  const operacao = dados.get("operacao");
  const resultado = dados.get("resultado");
  const motivo = dados.get("motivo");
  if (!ehUuid(operacao) || (resultado !== "confirmada" && resultado !== "nao_recebida" && resultado !== "recusada")) redirect("/connect?erro=dados");
  if (typeof motivo !== "string" || motivo.trim().length < 10) redirect("/connect?erro=evidencia");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_resolver", { p_operacao: operacao, p_resultado: resultado, p_motivo: motivo.trim() });
  voltar(error, "resolvida");
}

export async function habilitarOperacao(dados: FormData) {
  const tipo = dados.get("tipo");
  const habilitar = dados.get("habilitar");
  const evidencia = dados.get("evidencia");
  if (!ehTipoOperacao(tipo) || (habilitar !== "sim" && habilitar !== "nao")) redirect("/connect?erro=dados");
  if (typeof evidencia !== "string" || evidencia.trim().length < 10) redirect("/connect?erro=evidencia");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_habilitar", { p_tipo: tipo, p_habilitar: habilitar === "sim", p_evidencia: evidencia.trim() });
  voltar(error, "habilitacao");
}
