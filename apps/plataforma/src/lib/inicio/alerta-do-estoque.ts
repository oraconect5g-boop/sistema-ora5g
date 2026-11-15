// O aviso do estoque abaixo do mínimo no Início (lote REPORT-001b: o alerta da demonstração que faltava no Início real,
// ORA-REPORT-001 e ORA-REPORT-002). Lê o painel do estoque (public.estoque_painel, com as permissões de quem pede) só no
// Início: o sino do topo aparece em todas as telas e segue com as contagens leves. Na visão da rede, as lojas que a pessoa
// consulta; nas outras, a loja do turno. Conta os pares produto × loja com o disponível abaixo do mínimo (a mesma conta
// do painel). Banco sem o painel: some; falha: o Início diz que não leu, em vez de esconder.
import type { obterSessao } from "../acesso/sessao";
import { consultarEstoque } from "../estoque/consulta-painel";
import type { Pendencia } from "./pendencias";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export type AlertaDoEstoque = { estado: "ok"; pendencia: Pendencia | null } | { estado: "falha" };

export async function lerAlertaDoEstoque(supabase: Cliente, { rede, unidade, permissoes }: { rede: boolean; unidade: string; permissoes: ReadonlySet<string> }): Promise<AlertaDoEstoque | null> {
  if (!permissoes.has("estoque.consultar")) return null;
  const leitura = await consultarEstoque(supabase, rede ? null : unidade);
  if (leitura.estado === "indisponivel") return null;
  if (leitura.estado === "falha") return { estado: "falha" };
  const quantos = leitura.dados.totais.abaixoDoMinimo;
  if (quantos <= 0) return { estado: "ok", pendencia: null };
  return {
    estado: "ok",
    pendencia: {
      rotulo: "Estoque abaixo do mínimo", detalhe: rede ? "produtos × lojas da rede" : "produtos nesta loja",
      href: rede ? "/estoque?aba=painel&loja=rede" : "/estoque?aba=painel", icone: "estoque_abaixo_do_minimo", quantidade: quantos, alerta: true,
    },
  };
}
