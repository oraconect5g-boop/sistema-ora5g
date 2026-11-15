"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { buscarNoCatalogo, termoDaBusca } from "../../../lib/catalogo/busca";
import { detalheDoErro, erroDaEntrada, erroDaLigacaoDoPedido, validarEntrada } from "../../../lib/estoque/entrada";
import type { Json } from "../../../lib/supabase/tipos-banco";

// Entrada de mercadoria (lote L4a). Cada ação chama UMA função do banco como a pessoa logada: o banco
// confere estoque.receber na loja do turno, valida cada IMEI/ICCID, lança o livro e o custo numa
// transação e grava a auditoria com o motivo.
// Lote R1: a recusa do banco volta com a linha, o SKU e o IMEI/ICCID recusados (REV-NOV-004); o estorno
// volta sempre para a entrada aberta (REV-NOV-009); a busca não oferece produto inativo (REV-NOV-005: o
// banco recusa de qualquer jeito, a busca só evita o caminho sem saída).

function voltar(parametros: Record<string, string | null | undefined>): never {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros)) if (valor) busca.set(chave, valor);
  redirect(`/estoque/entrada${busca.size ? `?${busca}` : ""}`);
}
const ouNulo = <T,>(valor: T | null) => valor as unknown as T;
const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

export async function registrarEntrada(dados: FormData) {
  const r = validarEntrada((n) => dados.get(n));
  if (!r.ok) voltar({ erro: r.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const d = r.dados;
  const { data, error } = await supabase.rpc("estoque_registrar_entrada", {
    p_unidade: d.unidade, p_tipo: d.tipo, p_fornecedor: ouNulo(d.fornecedor), p_documento: ouNulo(d.documento),
    p_itens: d.itens as unknown as Json, p_chave: d.chave, p_motivo: d.motivo,
  });
  if (error) voltar({ erro: erroDaEntrada(error), ...detalheDoErro(error) });
  const resposta = data as { id?: unknown; repetida?: unknown } | null;
  const entrada = typeof resposta?.id === "string" ? resposta.id : null;
  const repetida = resposta?.repetida === true;
  // INV-009b: a entrada que veio do pedido de compra sai ligada a ele (o banco confere a loja, o fornecedor e o pedido
  // aberto). Se a ligação falhar, a entrada continua registrada, e a tela leva ao bloco do pedido para ligar à mão.
  const pedido = dados.get("pedido");
  if (entrada && ehUuid(pedido)) {
    const ligacao = await supabase.rpc("pedido_compra_ligar_entrada", { p_entrada: entrada, p_pedido: pedido, p_motivo: "Recebida a partir do pedido de compra" });
    voltar({ ok: ligacao.error ? "registrada_sem_pedido" : repetida ? "repetida" : "registrada_no_pedido", entrada });
  }
  voltar({ ok: repetida ? "repetida" : "registrada", entrada });
}

export async function estornarEntrada(dados: FormData) {
  const entrada = dados.get("entrada");
  const motivo = texto(dados.get("motivo"));
  if (!ehUuid(entrada)) voltar({ erro: "dados" });
  if (motivo.length < 3 || motivo.length > 200) voltar({ erro: "motivo", entrada });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("estoque_estornar_entrada", { p_entrada: entrada, p_motivo: motivo });
  if (error) voltar({ erro: erroDaEntrada(error), entrada, ...detalheDoErro(error) });
  voltar({ ok: data === "ja_estornada" ? "ja_estornada" : "estornada", entrada });
}

/** INV-009a: liga a entrada (compra registrada) ao pedido de compra aberto, ou desliga (pedido vazio), com motivo. */
export async function ligarPedido(dados: FormData) {
  const entrada = dados.get("entrada");
  const pedido = texto(dados.get("pedido"));
  const motivo = texto(dados.get("motivo"));
  if (!ehUuid(entrada)) voltar({ erro: "dados" });
  if (pedido !== "" && !ehUuid(pedido)) voltar({ erro: "dados", entrada });
  if (motivo.length < 3 || motivo.length > 200) voltar({ erro: "motivo", entrada });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("pedido_compra_ligar_entrada", { p_entrada: entrada, p_pedido: ouNulo(pedido || null), p_motivo: motivo });
  if (error) voltar({ erro: erroDaLigacaoDoPedido(error), entrada });
  voltar({ ok: data === false ? "pedido_sem_mudanca" : pedido ? "pedido_ligado" : "pedido_desligado", entrada });
}

export async function salvarFornecedor(dados: FormData) {
  const nome = texto(dados.get("nome"));
  const cnpj = texto(dados.get("cnpj"));
  const contato = texto(dados.get("contato"));
  const motivo = texto(dados.get("motivo"));
  if (nome.length < 2 || nome.length > 120) voltar({ erro: "nome", form: "fornecedor" });
  if (cnpj && !/^[\d./\s-]{14,20}$/.test(cnpj)) voltar({ erro: "cnpj", form: "fornecedor" });
  if (motivo.length < 3 || motivo.length > 200) voltar({ erro: "motivo", form: "fornecedor" });
  const { supabase, situacao } = await obterSessao({ exigirLoja: true });
  const unidade = await supabase.from("unidades").select("organizacao_id").eq("id", situacao.unidade_id as string).maybeSingle();
  if (unidade.error || !unidade.data) voltar({ erro: "falha" });
  const { error } = await supabase.rpc("fornecedor_salvar", {
    p_organizacao: unidade.data.organizacao_id, p_id: ouNulo<string>(null), p_nome: nome, p_cnpj: ouNulo(cnpj || null),
    p_contato: ouNulo(contato || null), p_ativo: ouNulo<boolean>(null), p_motivo: motivo,
  });
  if (error) voltar({ erro: erroDaEntrada(error), form: "fornecedor" });
  voltar({ ok: "fornecedor" });
}

export type ItemParaEntrada = { id: string; sku: string; nome: string; tipo: "aparelho" | "chip" | "acessorio" };

/** Busca da tela (nome, SKU ou nome da variação, no banco antes do limite): só itens com estoque, de produto e variação ativos. */
export async function buscarItensParaEntrada(termo: string): Promise<ItemParaEntrada[]> {
  const t = termoDaBusca(String(termo ?? "").toLowerCase().slice(0, 40));
  if (t.length < 2) return [];
  const { supabase } = await obterSessao({ exigirLoja: true });
  const achados = await buscarNoCatalogo(supabase, t, { limite: 30 });
  if (achados.variantes.length === 0) return [];
  const { data, error } = await supabase.from("variantes").select("id, sku, nome, produtos!inner(tipo)").in("id", achados.variantes).eq("ativa", true).eq("produtos.ativo", true).limit(30);
  if (error || !data) return [];
  return (data as unknown as { id: string; sku: string; nome: string; produtos: { tipo: string } }[])
    .filter((v) => ["aparelho", "chip", "acessorio"].includes(v.produtos.tipo))
    .map((v) => ({ id: v.id, sku: v.sku, nome: v.nome, tipo: v.produtos.tipo as ItemParaEntrada["tipo"] }))
    .slice(0, 20);
}
