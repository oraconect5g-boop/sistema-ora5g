"use server";

import { redirect } from "next/navigation";

import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDoBonus, faixasParaOBanco, validarRegras } from "../../../lib/bonus/regras";

// Uma ação, uma chamada ao banco como a pessoa logada (sem chave secreta): public.bonus_definir confere
// bonus.definir em papel de organização (só o dono), o mês (este ou até 12 à frente), as faixas e o
// motivo para mudar ou retirar uma regra que já vale; grava as versões das quatro medidas, tudo ou
// nada, e a auditoria. O mês que já terminou não muda.

const MES = /^\d{4}-(0[1-9]|1[0-2])-01$/;
function voltar(desde: unknown, parametros: Record<string, string | null>): never {
  const busca = new URLSearchParams();
  if (typeof desde === "string" && MES.test(desde)) busca.set("desde", desde.slice(0, 7));
  for (const [chave, valor] of Object.entries(parametros)) if (valor) busca.set(chave, valor);
  redirect(`/metas/bonus?${busca}`);
}
const ouNulo = <T,>(valor: T | null) => valor as unknown as T;

export async function definirBonus(dados: FormData) {
  const campo = (nome: string) => dados.get(nome);
  const r = validarRegras(campo);
  if (!r.ok) voltar(campo("desde"), { erro: r.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const d = r.dados;
  const { data, error } = await supabase.rpc("bonus_definir", { p_vigente_desde: d.vigenteDesde, p_faixas: faixasParaOBanco(d.faixas), p_motivo: ouNulo(d.motivo) });
  if (error) voltar(d.vigenteDesde, { erro: erroDoBonus(error) });
  voltar(d.vigenteDesde, { ok: data === 0 ? "sem_mudanca" : "salvas" });
}
