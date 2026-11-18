"use server";

import { redirect } from "next/navigation";

import { obterSessao } from "../../../../lib/acesso/sessao";
import { erroDosRepasses, validarCasar, validarDesfazer, type ErroDosRepasses, type OkDosRepasses } from "../../../../lib/marketplaces/repasses";

// Os repasses dos marketplaces casados com o extrato do banco (lote REPASSE-a: ORA-MKTPL-005 e ORA-MKTPL-008). Cada ação
// chama UMA função do banco como a pessoa logada: o banco confere a permissão, recalcula o esperado do repasse, confere a
// linha e grava a auditoria com o motivo.
const PAGINA = "/relatorios/marketplaces/repasses";
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Volta para o mesmo período (só datas no formato), com a mensagem. */
function voltar(dados: FormData, parametros: { ok?: OkDosRepasses; erro?: ErroDosRepasses }): never {
  const busca = new URLSearchParams();
  for (const campo of ["inicio", "fim"]) {
    const v = dados.get(campo);
    if (typeof v === "string" && DIA.test(v)) busca.set(campo, v);
  }
  for (const [k, v] of Object.entries(parametros)) if (v) busca.set(k, v);
  redirect(`${PAGINA}${busca.size ? `?${busca}` : ""}`);
}

export async function casarRepasse(dados: FormData) {
  const r = validarCasar(dados);
  if (!r.ok) voltar(dados, { erro: r.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("marketplace_repasse_casar", {
    p_canal: r.dados.canal, p_data_repasse: r.dados.data, p_linha: r.dados.linha, p_motivo: r.dados.motivo as string,
  });
  if (error) voltar(dados, { erro: erroDosRepasses(error) });
  const diferenca = Number((data as { diferenca?: unknown } | null)?.diferenca);
  voltar(dados, { ok: Number.isFinite(diferenca) && diferenca !== 0 ? "casado_com_diferenca" : "casado" });
}

export async function desfazerRepasse(dados: FormData) {
  const r = validarDesfazer(dados);
  if (!r.ok) voltar(dados, { erro: r.erro });
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("marketplace_repasse_desfazer", { p_canal: r.dados.canal, p_data_repasse: r.dados.data, p_motivo: r.dados.motivo });
  if (error) voltar(dados, { erro: erroDosRepasses(error) });
  voltar(dados, { ok: data === false ? "sem_mudanca" : "desfeito" });
}
