"use server";

import { redirect } from "next/navigation";

import { enderecoDaConfirmacao, precisaConfirmar } from "../../../../lib/acesso/confirmacao";
import { ehUuid } from "../../../../lib/acesso/regras";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { erroDoRelatorio, motivoDoPedido, type ErroDoRelatorio, type RelatorioDoTitular } from "../../../../lib/clientes/titular";

export type EstadoDoRelatorio =
  | { situacao: "vazio" }
  | { situacao: "erro"; erro: ErroDoRelatorio }
  | { situacao: "pronto"; relatorio: RelatorioDoTitular; motivo: string };

// QUAL-011a (ORA-QUAL-011): o dono gera o relatório dos dados do titular com o motivo (o pedido do titular). O banco
// confere quem, a senha recente (OR033 leva à confirmação e volta para cá), o limite de consultas, e registra na
// auditoria o motivo, sem o conteúdo. Nada do relatório vai para log.
export async function gerarRelatorioDoTitular(_anterior: EstadoDoRelatorio, dados: FormData): Promise<EstadoDoRelatorio> {
  const cliente = dados.get("cliente");
  if (!ehUuid(cliente)) return { situacao: "erro", erro: "nao_encontrado" };
  const motivo = motivoDoPedido(dados.get("motivo"));
  if (!motivo) return { situacao: "erro", erro: "motivo" };
  const { supabase } = await obterSessao({ exigirLoja: true });
  const { data, error } = await supabase.rpc("cliente_dados_do_titular", { p_cliente: cliente, p_motivo: motivo });
  if (precisaConfirmar(error)) redirect(enderecoDaConfirmacao(`/clientes/${cliente}/titular`));
  if (error || !data) return { situacao: "erro", erro: erroDoRelatorio(error) };
  return { situacao: "pronto", relatorio: data as unknown as RelatorioDoTitular, motivo };
}
