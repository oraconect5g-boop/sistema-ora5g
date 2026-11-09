"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDoEstoque, identificadorDigitado } from "../../lib/estoque/regras";

// Conferência física (ORA-INV-004): o banco confere a permissão e a loja e grava na auditoria.
const voltar = (erro: { code?: string } | null): never =>
  redirect(erro ? `/estoque?aba=conferencia&erro=${erroDoEstoque(erro)}` : "/estoque?aba=conferencia&ok=conferido");

export async function conferirItem(dados: FormData) {
  const item = dados.get("item");
  if (!ehUuid(item)) redirect("/estoque?aba=conferencia&erro=dados");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("conferir_item", { p_item: item });
  voltar(error);
}

export async function conferirPorIdentificador(dados: FormData) {
  const digitado = dados.get("identificador");
  const identificador = typeof digitado === "string" ? identificadorDigitado(digitado) : null;
  if (!identificador) redirect("/estoque?aba=conferencia&erro=dados");
  const { supabase, situacao } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.from("itens_serializados").select("id")
    .eq("unidade_id", situacao.unidade_id as string).eq("em_estoque", true)
    .or(`imei.eq.${identificador},imei2.eq.${identificador},iccid.eq.${identificador}`).limit(1).maybeSingle();
  if (error) voltar(error);
  if (!data) redirect("/estoque?aba=conferencia&erro=nao_encontrado");
  const conferido = await supabase.rpc("conferir_item", { p_item: data.id });
  voltar(conferido.error);
}
