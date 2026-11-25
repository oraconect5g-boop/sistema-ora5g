"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDosChips } from "../../../lib/connect/chips";

// A ligação do PDV da Nogle com a loja (lote CONNECT-d): UMA função do banco, como a pessoa logada. O banco confere a
// permissão (quem gere a Ora Connect na rede ou as integrações), a loja física da rede e "uma loja, um PDV", e grava na
// auditoria. Sem loja escolhida, desliga. Nada vai para a Nogle.
export async function ligarPdv(dados: FormData) {
  const pdv = dados.get("pdv");
  const unidade = dados.get("unidade");
  if (typeof pdv !== "string" || !/^[1-9]\d{0,8}$/.test(pdv)) redirect("/connect/chips?erro=dados");
  const volta = `/connect/chips?pdv=${pdv}`;
  if (unidade !== "" && !ehUuid(unidade)) redirect(`${volta}&erro=dados`);
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_ligar_pdv", unidade === "" ? { p_pdv: Number(pdv) } : { p_pdv: Number(pdv), p_unidade: unidade });
  redirect(error ? `${volta}&erro=${erroDosChips(error)}` : `${volta}&ok=ligacao`);
}
