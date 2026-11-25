"use server";

// As consultas da Nogle que só leem (lote CONNECT-g): o pedido vai ao banco por UMA função (connect_consultar), que confere
// quem pode e grava na fila; o worker do servidor consulta a Nogle e grava a resposta. A tela não fala com a Nogle.
import { redirect } from "next/navigation";

import { obterSessao } from "../../../lib/acesso/sessao";
import { erroDaConsulta, lerPedidoDeConsulta } from "../../../lib/connect/consultas";

// CONNECT-o: a aba Carteira e relatórios pede as consultas da carteira e da rede e volta para ela (só esses dois destinos: o
// campo "voltar" não é um endereço livre).
const destino = (dados: FormData) => (dados.get("voltar") === "carteira" ? "/connect/carteira" : "/connect/linha");

export async function consultar(dados: FormData) {
  const tela = destino(dados);
  const lido = lerPedidoDeConsulta(dados);
  if (!lido.ok) redirect(`${tela}?erro=${lido.erro}`);
  const { tipo, parametro, chave } = lido.pedido;
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { error } = await supabase.rpc("connect_consultar", parametro ? { p_tipo: tipo, p_chave: chave, p_parametro: parametro } : { p_tipo: tipo, p_chave: chave });
  if (error) redirect(`${tela}?erro=${erroDaConsulta(error)}`);
  redirect(tela);
}
