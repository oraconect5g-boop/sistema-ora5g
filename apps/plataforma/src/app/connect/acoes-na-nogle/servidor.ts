"use server";

// As ações que mudam algo na Nogle (lote CONNECT-j; a D-061): o pedido vai ao banco por UMA função (connect_pedir_acao), que confere
// quem pode (o dono e os gerentes) e o que cada ação pede; o worker do servidor envia cada pedido uma vez.
import { redirect } from "next/navigation";

import { ehUuid } from "../../../lib/acesso/regras";
import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDaAcao, lerPedidoDeAcao } from "../../../lib/connect/acoes";
import type { Json } from "../../../lib/supabase/tipos-banco";

export async function pedirAcao(dados: FormData) {
  const lido = lerPedidoDeAcao(dados);
  if (!lido.ok) redirect(`/connect/acoes-na-nogle?erro=${lido.erro}`);
  const { tipo, chave, motivo, parametros, dados: sensiveis } = lido.pedido;
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("connect_pedir_acao", {
    p_tipo: tipo, p_chave: chave, p_motivo: motivo, p_parametros: parametros as Json, ...(sensiveis ? { p_dados: sensiveis as Json } : {}),
  });
  if (error) redirect(`/connect/acoes-na-nogle?erro=${erroDaAcao(error)}`);
  const numero = data && typeof data === "object" && "numero" in data ? String((data as { numero: unknown }).numero) : "";
  redirect(`/connect/acoes-na-nogle?ok=pedido${/^\d+$/.test(numero) ? `&numero=${numero}` : ""}`);
}

export async function cancelarAcao(dados: FormData) {
  const acao = typeof dados.get("acao") === "string" ? String(dados.get("acao")) : "";
  const motivo = typeof dados.get("motivo") === "string" ? String(dados.get("motivo")).trim().slice(0, 300) : "";
  if (!ehUuid(acao)) redirect("/connect/acoes-na-nogle?erro=falha");
  if (motivo.length < 3) redirect("/connect/acoes-na-nogle?erro=motivo");
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_cancelar_acao", { p_acao: acao, p_motivo: motivo });
  if (error) redirect(`/connect/acoes-na-nogle?erro=${erroDaAcao(error)}`);
  redirect("/connect/acoes-na-nogle?ok=cancelada");
}
