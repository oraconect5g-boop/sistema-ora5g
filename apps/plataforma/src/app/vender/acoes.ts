"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDaVenda, lerPagamentos, lerValor } from "../../lib/vendas/regras";

// Cada ação chama UMA função do banco como a pessoa logada (ADR-004). As chaves de idempotência
// vêm do formulário (geradas quando a tela foi montada): clique duplo ou reenvio repetem a mesma
// operação, nunca criam outra.
type Resultado = { error: { code?: string } | null };
// Com erro, volta para a mesma tela sem os avisos de sucesso; sem erro, para o destino.
const voltar = (destino: string, erro: { code?: string } | null): never =>
  redirect(erro ? `${destino.split("?")[0]}?erro=${erroDaVenda(erro)}` : destino);
const chaveDe = (dados: FormData) => {
  const chave = dados.get("chave");
  return typeof chave === "string" && /^[0-9a-f-]{36}$/.test(chave) ? chave : randomUUID();
};

export async function abrirCaixa(dados: FormData) {
  const fundo = lerValor(dados.get("fundo")) ?? 0;
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("abrir_caixa", { p_fundo: fundo, p_chave: chaveDe(dados) });
  voltar(String(dados.get("voltar") ?? "/vender") === "/caixa" ? "/caixa" : "/vender", error);
}

export async function novaVenda(dados: FormData) {
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("criar_venda", { p_chave: chaveDe(dados) });
  voltar("/vender", error);
}

export async function adicionarItem(dados: FormData) {
  const venda = dados.get("venda");
  const variante = dados.get("variante");
  const item = dados.get("item");
  const quantidade = Number(dados.get("quantidade") ?? 1);
  if (!ehUuid(venda) || !ehUuid(variante) || (item && !ehUuid(item)) || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 99) {
    redirect("/vender?erro=dados");
  }
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("adicionar_item", {
    p_venda: venda, p_variante: variante,
    // Acessório e serviço vão sem IMEI/ICCID (null); o tipo gerado não marca o parâmetro como opcional.
    p_item: (ehUuid(item) ? item : null) as string, p_quantidade: quantidade, p_chave: chaveDe(dados),
  });
  voltar("/vender", error);
}

export async function removerItem(dados: FormData) {
  const item = dados.get("item");
  if (!ehUuid(item)) redirect("/vender?erro=dados");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("remover_item", { p_item: item });
  voltar("/vender", error);
}

export async function aplicarDesconto(dados: FormData) {
  const item = dados.get("item");
  const desconto = lerValor(dados.get("desconto")) ?? 0;
  if (!ehUuid(item)) redirect("/vender?erro=dados");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("aplicar_desconto", { p_item: item, p_desconto: desconto });
  if (error) voltar("/vender", error);
  redirect(`/vender?desconto=${data === "precisa_aprovacao" || data === "abaixo_do_custo" ? "pedir" : "ok"}`);
}

export async function pedirAprovacao(dados: FormData) {
  const item = dados.get("item");
  const motivo = dados.get("motivo");
  if (!ehUuid(item)) redirect("/vender?erro=dados");
  if (typeof motivo !== "string" || motivo.trim().length < 3) redirect("/vender?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("pedir_aprovacao", { p_item: item, p_motivo: motivo.trim() });
  voltar("/vender", error);
}

export async function concluirVenda(dados: FormData) {
  const venda = dados.get("venda");
  if (!ehUuid(venda)) redirect("/vender?erro=dados");
  const pagamentos = lerPagamentos(dados);
  if (!pagamentos.ok) redirect(`/vender?erro=${pagamentos.erro}`);
  const nome = String(dados.get("cliente_nome") ?? "").trim().slice(0, 120);
  const email = String(dados.get("cliente_email") ?? "").trim().toLowerCase().slice(0, 200);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("concluir_venda", {
    p_venda: venda, p_pagamentos: pagamentos.pagamentos, p_cliente: { ...(nome ? { nome } : {}), ...(email ? { email } : {}) }, p_chave: chaveDe(dados),
  });
  if (error) voltar("/vender", error);
  const resultado = data as { venda?: string } | null;
  redirect(`/vendas/${resultado?.venda ?? venda}?concluida=1`);
}

export async function cancelarVenda(dados: FormData) {
  const venda = dados.get("venda");
  const motivo = dados.get("motivo");
  const voltarPara = dados.get("voltar") === "comprovante" && ehUuid(venda) ? `/vendas/${venda}` : "/vender";
  if (!ehUuid(venda)) redirect("/vender?erro=dados");
  if (typeof motivo !== "string" || motivo.trim().length < 3) redirect(`${voltarPara}?erro=motivo`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("cancelar_venda", { p_venda: venda, p_motivo: motivo.trim() });
  voltar(voltarPara === "/vender" ? "/vender?cancelada=1" : `${voltarPara}?cancelada=1`, error);
}
