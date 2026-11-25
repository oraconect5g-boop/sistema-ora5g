"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import type { Json } from "../../lib/supabase/tipos-banco";
import { erroDosAnexos } from "../../lib/vendas/anexos";
import { CONDICOES_DE_RETORNO, erroDaVenda, erroDoPagamento, lerDevolucao, lerPagamentos, lerValor } from "../../lib/vendas/regras";

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
  const destino = String(dados.get("voltar") ?? "/vender") === "/caixa" ? "/caixa" : "/vender";
  // Vazio ou ilegível não vira fundo zero (REV-050, #52): sem fundo, digita-se 0,00.
  const fundo = lerValor(dados.get("fundo"));
  if (fundo === null) redirect(`${destino}?erro=valor`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("abrir_caixa", { p_fundo: fundo, p_chave: chaveDe(dados) });
  voltar(destino, error);
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
  // L12c/L12d: o conserto e a peça da assistência só saem pela ordem de serviço.
  if (error?.code === "22023" && /ordem de serviço/i.test((error as { message?: string }).message ?? "")) redirect("/vender?erro=so_pela_os");
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
  // Vazio ou ilegível não apaga o desconto atual com zero (REV-050, #52): tirar o desconto é digitar 0,00.
  const desconto = lerValor(dados.get("desconto"));
  if (!ehUuid(item)) redirect("/vender?erro=dados");
  if (desconto === null) redirect("/vender?erro=valor");
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
  // PAY-014b: a venda do pedido pago pelo site pode ir sem outra forma; o banco confere se o pago cobre a venda.
  const pagamentos = lerPagamentos(dados, 8, dados.get("pago_pelo_site") === "sim");
  if (!pagamentos.ok) redirect(`/vender?erro=${pagamentos.erro}`);
  const nome = String(dados.get("cliente_nome") ?? "").trim().slice(0, 120);
  const email = String(dados.get("cliente_email") ?? "").trim().toLowerCase().slice(0, 200);
  // Cliente da rede escolhido pela busca exata (L5a); o nome e o e-mail digitados seguem como origem.
  const cliente = dados.get("cliente_id");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("concluir_venda", {
    p_venda: venda, p_pagamentos: pagamentos.pagamentos, p_chave: chaveDe(dados),
    p_cliente: { ...(ehUuid(cliente) ? { id: cliente } : {}), ...(nome ? { nome } : {}), ...(email ? { email } : {}) },
  });
  if (error?.code === "22023" && /cliente/i.test((error as { message?: string }).message ?? "")) redirect("/vender?erro=cliente");
  // PDV-c: a regra do pagamento que o banco recusou (a maquininha, as parcelas, o financiamento só do celular, a entrada).
  const doPagamento = error?.code === "OR009" ? erroDoPagamento((error as { message?: string }).message ?? "") : null;
  // PAY-015b: o link do cartão esperando também segura a conclusão (OR059, como o QR do Pix).
  if (error?.code === "OR059" && /cartão/i.test((error as { message?: string }).message ?? "")) redirect("/vender?erro=cartao_esperando");
  if (doPagamento) redirect(`/vender?erro=${doPagamento}`);
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
  // PAY-015a: a venda aberta com Pix pela Asaas pago não se cancela (OR048, como o pedido pago pelo site).
  if (error?.code === "OR048" && /Pix pela Asaas/i.test((error as { message?: string }).message ?? "")) redirect(`${voltarPara}?erro=pix_pago`);
  // PAY-015b: e com cartão pela Asaas pago.
  if (error?.code === "OR048" && /cartão pela Asaas/i.test((error as { message?: string }).message ?? "")) redirect(`${voltarPara}?erro=cartao_pago`);
  voltar(voltarPara === "/vender" ? "/vender?cancelada=1" : `${voltarPara}?cancelada=1`, error);
}

// PAY-015a (a D-062): o Pix pela Asaas no caixa. Pedir o QR Code (o valor, para a venda aberta da vendedora) e cancelar o QR
// que ainda não foi pago. O worker do servidor cria o QR na Asaas e confere o pagamento; a tela se atualiza sozinha.
export async function pedirPixAsaas(dados: FormData) {
  const venda = dados.get("venda");
  const valor = lerValor(dados.get("valor"));
  if (!ehUuid(venda)) redirect("/vender?erro=dados");
  if (valor === null || valor <= 0) redirect("/vender?erro=valor");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("caixa_pix_pedir", { p_venda: venda, p_valor_centavos: valor, p_chave: chaveDe(dados) });
  if (error?.code === "OR009") redirect("/vender?erro=pix_passa");
  voltar("/vender", error);
}

export async function cancelarPixAsaas(dados: FormData) {
  const pix = dados.get("pix");
  if (!ehUuid(pix)) redirect("/vender?erro=dados");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("caixa_pix_cancelar", { p_pix: pix });
  if (error?.code === "OR048") redirect("/vender?erro=pix_pago");
  voltar("/vender", error);
}

// PAY-015b (a D-062): o link de pagamento no cartão da Asaas, com o QR Code na tela. O banco confere quem pede e até quanto
// (contando o Pix pedido ou pago); o worker cria o link e confere as cobranças de cartão.
export async function pedirCartaoAsaas(dados: FormData) {
  const venda = dados.get("venda");
  const valor = lerValor(dados.get("valor"));
  if (!ehUuid(venda)) redirect("/vender?erro=dados");
  if (valor === null || valor <= 0) redirect("/vender?erro=valor");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("caixa_cartao_pedir", { p_venda: venda, p_valor_centavos: valor, p_chave: chaveDe(dados) });
  if (error?.code === "OR009") redirect("/vender?erro=cartao_passa");
  if (error?.code === "OR058") redirect("/vender?erro=cartao_desligado");
  voltar("/vender", error);
}

export async function cancelarCartaoAsaas(dados: FormData) {
  const cartao = dados.get("cartao");
  if (!ehUuid(cartao)) redirect("/vender?erro=dados");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("caixa_cartao_cancelar", { p_cartao: cartao });
  if (error?.code === "OR048") redirect("/vender?erro=cartao_pago");
  voltar("/vender", error);
}

// Devolução parcial e troca (adendo do ADR-004): o banco confere permissão, quantidades, valores,
// meios e limites; a tela só lê o formulário. O vale-troca criado aparece no comprovante.
const FISICOS = new Set(["aparelho", "chip", "acessorio"]);
export async function devolverItens(dados: FormData) {
  const venda = dados.get("venda");
  const motivo = dados.get("motivo");
  if (!ehUuid(venda)) redirect("/vender?erro=dados");
  const destino = `/vendas/${venda}`;
  if (typeof motivo !== "string" || motivo.trim().length < 3) redirect(`${destino}?erro=motivo`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const [itens, devolvidos] = await Promise.all([
    supabase.from("venda_itens").select("id, tipo, quantidade, item_serializado_id").eq("venda_id", venda),
    supabase.from("venda_devolucoes").select("venda_devolucao_itens(venda_item_id, quantidade)").eq("venda_id", venda),
  ]);
  if (itens.error || devolvidos.error) redirect(`${destino}?erro=falha`);
  const jaDevolvido = new Map<string, number>();
  for (const d of devolvidos.data) for (const i of d.venda_devolucao_itens) jaDevolvido.set(i.venda_item_id, (jaDevolvido.get(i.venda_item_id) ?? 0) + i.quantidade);
  const lido = lerDevolucao(dados, itens.data.map((i) => ({
    id: i.id, restante: i.quantidade - (jaDevolvido.get(i.id) ?? 0), fisico: FISICOS.has(i.tipo), serializado: i.item_serializado_id !== null,
  })));
  if (!lido.ok) redirect(`${destino}?erro=${lido.erro}`);
  const { data, error } = await supabase.rpc("devolver_itens", {
    p_venda: venda, p_itens: lido.pedido.itens as Json, p_reembolsos: lido.pedido.reembolsos as Json, p_motivo: motivo.trim(), p_chave: chaveDe(dados),
  });
  if (error) redirect(`${destino}?erro=${error.code === "OR009" ? "reembolso" : error.code === "22023" ? "conferencia" : erroDaVenda(error)}`);
  const resultado = data as { numero?: number; vale?: number | null } | null;
  redirect(`${destino}?devolvida=${resultado?.numero ?? ""}${resultado?.vale ? `&vale=${resultado.vale}` : ""}`);
}

// Estorno de Pix, cartão ou financeira (#50): só fica confirmado com o código do comprovante do
// estorno (maquininha, banco ou protocolo da financeira). O banco registra quem confirmou e quando.
export async function confirmarEstorno(dados: FormData) {
  const venda = dados.get("venda");
  const estorno = dados.get("estorno");
  if (!ehUuid(venda) || !ehUuid(estorno)) redirect("/vender?erro=dados");
  const destino = `/vendas/${venda}`;
  const comprovante = String(dados.get("comprovante") ?? "").trim();
  const observacao = String(dados.get("observacao") ?? "").trim().slice(0, 500);
  if (comprovante.length < 4 || comprovante.length > 60) redirect(`${destino}?erro=comprovante`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("confirmar_estorno_externo", {
    p_estorno: estorno, p_comprovante: comprovante, p_observacao: (observacao || null) as string,
  });
  if (error) redirect(`${destino}?erro=${error.code === "22023" ? "comprovante" : erroDaVenda(error)}`);
  redirect(`${destino}?estorno=confirmado`);
}

// Retorno físico depois do cancelamento (#51): o item só volta ao estoque conferido pelo IMEI/ICCID
// e com a condição; item que não voltou fecha o retorno sem estoque, com a explicação.
export async function conferirRetorno(dados: FormData) {
  const venda = dados.get("venda");
  const retorno = dados.get("retorno");
  const recebido = dados.get("recebido");
  if (!ehUuid(venda) || !ehUuid(retorno) || (recebido !== "sim" && recebido !== "nao")) redirect("/vender?erro=dados");
  const destino = `/vendas/${venda}`;
  const identificador = String(dados.get("identificador") ?? "").replace(/\D/g, "").slice(0, 20);
  const condicao = dados.get("condicao");
  const observacao = String(dados.get("observacao") ?? "").trim().slice(0, 500);
  if (recebido === "sim" && (typeof condicao !== "string" || !Object.hasOwn(CONDICOES_DE_RETORNO, condicao))) redirect(`${destino}?erro=conferencia`);
  if (recebido === "nao" && observacao.length < 10) redirect(`${destino}?erro=explicacao`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error }: Resultado = await supabase.rpc("conferir_retorno", {
    p_retorno: retorno, p_recebido: recebido === "sim", p_identificador: (identificador || null) as string,
    p_condicao: (recebido === "sim" ? condicao : null) as string, p_observacao: (observacao || null) as string,
  });
  if (error) redirect(`${destino}?erro=${error.code === "22023" ? "conferencia" : erroDaVenda(error)}`);
  redirect(`${destino}?retorno=${recebido === "sim" ? "recebido" : "nao_recebido"}`);
}

// Documento da venda (L5d, ORA-CRM-008): a gerência retira o documento errado, com o motivo; o registro e o arquivo
// continuam (nada se apaga). O envio é pela rota /vendas/[id]/anexos (o arquivo pode passar de 1 MB).
export async function retirarAnexo(dados: FormData) {
  const venda = dados.get("venda");
  const anexo = dados.get("anexo");
  if (!ehUuid(venda) || !ehUuid(anexo)) redirect("/vender?erro=dados");
  const destino = `/vendas/${venda}`;
  const motivo = String(dados.get("motivo") ?? "").trim().replace(/\s+/g, " ");
  if (motivo.length < 3 || motivo.length > 200) redirect(`${destino}?erro_anexo=anexo_motivo`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("venda_retirar_anexo", { p_anexo: anexo as string, p_motivo: motivo });
  if (error) redirect(`${destino}?erro_anexo=${erroDosAnexos(error)}`);
  redirect(`${destino}?anexo=${data ? "retirado" : "sem_mudanca"}`);
}
