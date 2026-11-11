"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDoInventario } from "../../../lib/estoque/inventario";

// Inventário (lote L4b: ORA-INV-008). Cada ação chama UMA função do banco como a pessoa logada: o banco
// confere estoque.conferir (abrir, contar, cancelar), estoque.solicitar_ajuste (enviar) e estoque.ajustar
// (decidir, por outra pessoa), aplica os ajustes no livro e grava a auditoria com o motivo.

function voltar(inventario: string | null, parametros: Record<string, string | null | undefined>): never {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros)) if (valor) busca.set(chave, valor);
  redirect(`/estoque/inventario${inventario ? `/${inventario}` : ""}${busca.size ? `?${busca}` : ""}`);
}
const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const motivoDe = (dados: FormData) => {
  const m = texto(dados.get("motivo"));
  return m.length >= 3 && m.length <= 200 ? m : null;
};

export async function abrirInventario(dados: FormData) {
  const descricao = texto(dados.get("descricao"));
  const chave = dados.get("chave");
  const variantes = dados.getAll("variante").filter(ehUuid);
  if (descricao.length < 3 || descricao.length > 120) voltar(null, { erro: "descricao" });
  if (variantes.length < 1 || variantes.length > 300) voltar(null, { erro: "itens" });
  if (typeof chave !== "string" || !/^[A-Za-z0-9:-]{8,80}$/.test(chave)) voltar(null, { erro: "dados" });
  const { supabase, situacao } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("inventario_abrir", { p_unidade: situacao.unidade_id as string, p_variantes: variantes, p_descricao: descricao, p_chave: chave });
  if (error) voltar(null, { erro: erroDoInventario(error) });
  const id = (data as { id?: unknown } | null)?.id;
  voltar(typeof id === "string" ? id : null, { ok: "aberto" });
}

export async function contarItem(dados: FormData) {
  const inventario = dados.get("inventario");
  const variante = dados.get("variante");
  if (!ehUuid(inventario) || !ehUuid(variante)) voltar(null, { erro: "dados" });
  const quantidadeTexto = texto(dados.get("quantidade"));
  const identificadores = typeof dados.get("identificadores") === "string"
    ? (dados.get("identificadores") as string).split(/[\s,;]+/).map((x) => x.replace(/\D/g, "")).filter(Boolean)
    : null;
  const quantidade = quantidadeTexto === "" ? null : /^\d{1,6}$/.test(quantidadeTexto) ? Number(quantidadeTexto) : Number.NaN;
  if (Number.isNaN(quantidade) || (identificadores === null && quantidade === null)) voltar(inventario, { erro: "quantidade" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("inventario_contar", {
    p_inventario: inventario, p_variante: variante,
    p_quantidade: quantidade as number, p_identificadores: (identificadores ?? null) as unknown as string[],
  });
  if (error) voltar(inventario, { erro: erroDoInventario(error) });
  voltar(inventario, { ok: "contado" });
}

async function decisao(dados: FormData, funcao: "inventario_enviar" | "inventario_cancelar", ok: string) {
  const inventario = dados.get("inventario");
  if (!ehUuid(inventario)) voltar(null, { erro: "dados" });
  const motivo = motivoDe(dados);
  if (!motivo) voltar(inventario, { erro: "motivo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc(funcao, { p_inventario: inventario, p_motivo: motivo });
  if (error) voltar(inventario, { erro: erroDoInventario(error) });
  voltar(inventario, { ok });
}
export async function enviarInventario(dados: FormData) { await decisao(dados, "inventario_enviar", "enviado"); }
export async function cancelarInventario(dados: FormData) { await decisao(dados, "inventario_cancelar", "cancelado"); }

export async function decidirInventario(dados: FormData) {
  const inventario = dados.get("inventario");
  const aprovar = dados.get("aprovar");
  if (!ehUuid(inventario) || (aprovar !== "sim" && aprovar !== "nao")) voltar(null, { erro: "dados" });
  const motivo = motivoDe(dados);
  if (!motivo) voltar(inventario, { erro: "motivo" });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("inventario_decidir", { p_inventario: inventario, p_aprovar: aprovar === "sim", p_motivo: motivo });
  if (error) voltar(inventario, { erro: erroDoInventario(error) });
  voltar(inventario, { ok: aprovar === "sim" ? "aprovado" : "recusado" });
}
