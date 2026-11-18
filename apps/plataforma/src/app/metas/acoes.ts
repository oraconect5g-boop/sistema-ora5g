"use server";

import { redirect } from "next/navigation";

import { ehUuid } from "../../lib/acesso/regras";
import { obterSessao } from "../../lib/acesso/sessao";
import { erroDasMetas, validarDefinicao } from "../../lib/metas/painel";

// Uma ação, uma chamada ao banco como a pessoa logada (sem chave secreta): public.metas_definir confere
// metas.gerir na loja (o dono em todas; o gerente, na dele), o mês (este ou até 12 à frente), quem pode
// receber meta nova e o motivo para mudar ou retirar; grava as versões das cinco medidas, tudo ou
// nada, e a auditoria. O mês que já terminou não muda.

function voltar(campo: (nome: string) => unknown, parametros: Record<string, string | null>): never {
  const busca = new URLSearchParams();
  const mes = campo("mes");
  if (typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(mes)) busca.set("mes", mes.slice(0, 7));
  // A loja só vai no endereço de quem escolheu outra loja (o dono); os demais ficam na do turno.
  const loja = campo("loja");
  if (ehUuid(loja)) busca.set("loja", loja);
  for (const [chave, valor] of Object.entries(parametros)) if (valor) busca.set(chave, valor);
  redirect(`/metas?${busca}`);
}
const ouNulo = <T,>(valor: T | null) => valor as unknown as T;

export async function definirMetas(dados: FormData) {
  const campo = (nome: string) => dados.get(nome);
  const alvo = campo("alvo");
  const emFoco = alvo === "loja" || ehUuid(alvo) ? (alvo as string) : null;
  const r = validarDefinicao(campo);
  if (!r.ok) voltar(campo, { erro: r.erro, alvo: emFoco });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const d = r.dados;
  const { data, error } = await supabase.rpc("metas_definir", {
    p_unidade: d.unidade, p_vendedor: ouNulo(d.vendedor), p_mes: d.mes, p_valores: d.valores, p_motivo: ouNulo(d.motivo),
  });
  if (error) voltar(campo, { erro: erroDasMetas(error), alvo: emFoco });
  voltar(campo, { ok: data === 0 ? "sem_mudanca" : "salvas" });
}
