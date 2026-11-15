"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDoPedido, lerFormularioDoPedido, type ErroDosPedidos, type OkDosPedidos } from "../../../lib/estoque/pedidos-de-compra";
import type { Json } from "../../../lib/supabase/tipos-banco";

// Pedidos de compra (lote INV-009a). Cada ação chama UMA função do banco como a pessoa logada: o banco confere
// estoque.receber na loja, o fornecedor, cada item e a chave do formulário, e grava a auditoria.

function voltar(parametros: { pedido?: string | null; ok?: OkDosPedidos; erro?: ErroDosPedidos; form?: string }): never {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros)) if (valor) busca.set(chave, valor);
  redirect(`/estoque/pedidos${busca.size ? `?${busca}` : ""}`);
}
const ouNulo = <T,>(valor: T | null) => valor as unknown as T;

export async function criarPedido(dados: FormData) {
  const r = lerFormularioDoPedido(dados);
  if (!r.ok) voltar({ erro: r.erro, form: "novo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const d = r.dados;
  const { data, error } = await supabase.rpc("pedido_compra_criar", {
    p_unidade: d.unidade, p_fornecedor: d.fornecedor, p_documento: ouNulo(d.documento), p_previsto: ouNulo(d.previsto),
    p_itens: d.itens as unknown as Json, p_observacao: ouNulo(d.observacao), p_chave: d.chave,
  });
  if (error) voltar({ erro: erroDoPedido(error), form: "novo" });
  const resposta = data as { id?: unknown; repetido?: unknown } | null;
  voltar({ pedido: ehUuid(resposta?.id) ? resposta.id : null, ok: resposta?.repetido === true ? "repetido" : "criado" });
}

/** Encerra o pedido aberto, com motivo: sem nada recebido, o banco o marca cancelado; com algo, encerrado. */
export async function encerrarPedido(dados: FormData) {
  const pedido = dados.get("pedido");
  const motivo = typeof dados.get("motivo") === "string" ? (dados.get("motivo") as string).trim().replace(/\s+/g, " ") : "";
  if (!ehUuid(pedido)) voltar({ erro: "dados" });
  if (motivo.length < 3 || motivo.length > 300) voltar({ pedido, erro: "motivo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("pedido_compra_encerrar", { p_pedido: pedido, p_motivo: motivo });
  if (error) voltar({ pedido, erro: erroDoPedido(error) });
  voltar({ pedido, ok: data === "cancelado" ? "cancelado" : data === "encerrado" ? "encerrado" : "ja_encerrado" });
}
