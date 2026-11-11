"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDasNotas } from "../../lib/notas/regras";

// Fila fiscal (ADR-006): cada ação chama UMA função do banco como a pessoa logada. Nada é emitido
// pelo sistema (sem emissor contratado): a emissão é registrada pela chave de acesso.
const chaveDe = (dados: FormData) => {
  const chave = dados.get("chave");
  return typeof chave === "string" && /^[0-9a-f-]{36}$/.test(chave) ? chave : randomUUID();
};
const texto = (dados: FormData, nome: string, maximo = 200) => {
  const valor = dados.get(nome);
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
};
const voltarParaFila = (erro: { code?: string } | null, ok: string): never => redirect(erro ? `/notas?erro=${erroDasNotas(erro)}` : `/notas?ok=${ok}`);

export async function pedirNota(dados: FormData) {
  const venda = dados.get("venda");
  if (!ehUuid(venda)) redirect("/vender?erro=dados");
  // L6a: "no nome do cliente da venda" manda só o cliente; o banco copia nome e documento do cadastro.
  const cliente = dados.get("cliente");
  const destinatario = dados.get("usar_cliente") === "sim" && ehUuid(cliente)
    ? { cliente }
    : { ...(texto(dados, "nome", 120) ? { nome: texto(dados, "nome", 120) } : {}), ...(texto(dados, "documento", 20) ? { documento: texto(dados, "documento", 20) } : {}) };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_solicitar", { p_venda: venda, p_destinatario: destinatario, p_chave: chaveDe(dados) });
  redirect(error ? `/vendas/${venda}?erro_nota=${erroDasNotas(error)}` : `/vendas/${venda}?nota=pedida`);
}

export async function decidirNota(dados: FormData) {
  const pedido = dados.get("pedido");
  const decisao = dados.get("decisao");
  if (!ehUuid(pedido) || (decisao !== "aprovar" && decisao !== "corrigir")) redirect("/notas?erro=dados");
  if (decisao === "corrigir" && texto(dados, "observacao").length < 3) redirect("/notas?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_decidir", { p_pedido: pedido, p_aprovar: decisao === "aprovar", p_observacao: texto(dados, "observacao") });
  voltarParaFila(error, decisao === "aprovar" ? "aprovada" : "correcao");
}

export async function corrigirNota(dados: FormData) {
  const pedido = dados.get("pedido");
  const venda = dados.get("venda");
  if (!ehUuid(pedido) || !ehUuid(venda)) redirect("/vender?erro=dados");
  const destinatario = { ...(texto(dados, "nome", 120) ? { nome: texto(dados, "nome", 120) } : {}), ...(texto(dados, "documento", 20) ? { documento: texto(dados, "documento", 20) } : {}) };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_corrigir", { p_pedido: pedido, p_destinatario: destinatario });
  redirect(error ? `/vendas/${venda}?erro_nota=${erroDasNotas(error)}` : `/vendas/${venda}?nota=corrigida`);
}

export async function registrarEmissao(dados: FormData) {
  const pedido = dados.get("pedido");
  const chaveAcesso = texto(dados, "chave_acesso", 80).replace(/\D/g, "");
  if (!ehUuid(pedido) || chaveAcesso.length !== 44) redirect("/notas?erro=dados");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_registrar_emissao", { p_pedido: pedido, p_chave_acesso: chaveAcesso, p_observacao: texto(dados, "observacao") });
  voltarParaFila(error, "emitida");
}

export async function cancelarPedidoDeNota(dados: FormData) {
  const pedido = dados.get("pedido");
  const motivo = texto(dados, "motivo");
  if (!ehUuid(pedido)) redirect("/notas?erro=dados");
  if (motivo.length < 3) redirect("/notas?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("notas_cancelar", { p_pedido: pedido, p_motivo: motivo });
  voltarParaFila(error, "cancelada");
}

export async function definirPrazo(dados: FormData) {
  const minutos = texto(dados, "alerta_minutos", 6);
  const fonte = texto(dados, "fonte", 300);
  if (minutos && !/^\d{1,5}$/.test(minutos)) redirect("/notas?erro=dados");
  if (fonte.length < 10) redirect("/notas?erro=fonte");
  const { supabase } = await obterSessao({ exigirLoja: true });
  // Sem minutos = sem prazo de alerta (aguardando o contador). O tipo gerado não marca o parâmetro como opcional.
  const { error } = await supabase.rpc("fiscal_definir_politica", { p_alerta_minutos: (minutos ? Number(minutos) : null) as number, p_fonte: fonte });
  voltarParaFila(error, "prazo");
}
