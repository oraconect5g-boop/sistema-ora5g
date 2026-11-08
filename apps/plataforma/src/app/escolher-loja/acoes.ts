"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";

// A loja da sessão é gravada pelo banco (selecionar_unidade), que recusa loja sem vínculo e audita.
export async function escolherLoja(dados: FormData) {
  const unidade = dados.get("unidade");
  if (!ehUuid(unidade)) redirect("/escolher-loja?erro=loja");
  const { supabase } = await obterSessao({ exigirLoja: false });
  const { data, error } = await supabase.rpc("selecionar_unidade", { p_unidade: unidade });
  if (error) throw new FalhaDoServico("selecionar_unidade");
  redirect(data ? "/inicio" : "/escolher-loja?erro=loja");
}
