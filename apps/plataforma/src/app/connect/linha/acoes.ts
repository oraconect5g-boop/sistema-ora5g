"use server";

// As consultas da Nogle que só leem (lote CONNECT-g): o pedido vai ao banco por UMA função (connect_consultar), que confere
// quem pode e grava na fila; o worker do servidor consulta a Nogle e grava a resposta. A tela não fala com a Nogle.
import { redirect } from "next/navigation";

import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDaConsulta, lerPedidoDeConsulta } from "../../../lib/connect/consultas";

export async function consultar(dados: FormData) {
  const lido = lerPedidoDeConsulta(dados);
  if (!lido.ok) redirect(`/connect/linha?erro=${lido.erro}`);
  const { tipo, parametro, chave } = lido.pedido;
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_consultar", parametro ? { p_tipo: tipo, p_chave: chave, p_parametro: parametro } : { p_tipo: tipo, p_chave: chave });
  if (error) redirect(`/connect/linha?erro=${erroDaConsulta(error)}`);
  redirect("/connect/linha");
}
