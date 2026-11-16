import type { Metadata } from "next";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, TituloPagina } from "../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { agora as agoraDoServidor } from "../../lib/formato";
import { ERROS_DA_LOJA, reservasAusentes } from "../../lib/loja/reserva";
import { soltarReservasDoSiteVencidas } from "../../lib/loja/reservas-vencidas";
import { chaveDoCatalogo, type ValorDeParametro } from "../../lib/parametros";
import { ListaDeReservas, type ReservaDaLoja } from "./ListaDeReservas";

export const metadata: Metadata = { title: "Reservas do site" };
export const dynamic = "force-dynamic";

const OK = {
  cancelada: "Reserva cancelada: a unidade voltou para o estoque da loja.",
  ja_cancelada: "Nada mudou: esta reserva já estava cancelada.",
} as const;

// ONLINE-b (ORA-ONLINE-006; ADR-009): as reservas do site na loja do turno, para quem vende nela. Atender abre a venda
// no PDV com a unidade reservada; cancelar devolve a unidade ao estoque; o WhatsApp só aparece quando se pede.
export default async function ReservasDoSite({ searchParams }: { searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DA_LOJA, parametros.erro);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const pode = await supabase.rpc("tem_permissao", { p_permissao: "venda.registrar", p_unidade: unidade });
  if (pode.error) throw new FalhaDoServico("tem_permissao");
  if (!pode.data) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Só quem vende nesta loja atende as reservas do site.</Aviso></MoldeReal>;
  // As vencidas desta loja saem de vez do estoque reservado (continuam na lista, como "Vencida").
  await soltarReservasDoSiteVencidas(supabase);
  const instante = agoraDoServidor().getTime();
  const desde = new Date(instante - 3 * 86_400_000).toISOString();
  const lidas = await supabase.from("loja_reservas")
    .select("id, codigo, nome, whatsapp_mascarado, preco_centavos, situacao, expira_em, criada_em, variante_id, item_serializado_id, cancelada_em, motivo_cancelamento, atendida_em")
    .eq("unidade_id", unidade).gte("criada_em", desde).order("expira_em").limit(100);
  if (lidas.error) {
    if (!reservasAusentes(lidas.error)) throw new FalhaDoServico("loja_reservas");
    return <MoldeReal sessao={sessao}><TituloPagina titulo="Reservas do site" /><Aviso tom="info" className="mt-4">As reservas do site ainda não estão disponíveis neste ambiente.</Aviso></MoldeReal>;
  }
  const reservas = lidas.data as ReservaDaLoja[];
  const [variantes, aparelhos] = await Promise.all([
    reservas.length ? supabase.from("variantes").select("id, nome").in("id", [...new Set(reservas.map((r) => r.variante_id))]) : Promise.resolve({ data: [], error: null }),
    reservas.some((r) => r.item_serializado_id)
      ? supabase.from("itens_serializados").select("id, imei").in("id", reservas.flatMap((r) => (r.item_serializado_id ? [r.item_serializado_id] : [])))
      : Promise.resolve({ data: [], error: null }),
  ]);
  // Sem o nome ou o IMEI (falha passageira ou sem leitura), a reserva aparece mesmo assim: "Produto" e sem o IMEI.
  const produtos: Record<string, string> = Object.fromEntries((variantes.data ?? []).map((v) => [v.id, v.nome]));
  const imeis: Record<string, string> = Object.fromEntries((aparelhos.data ?? []).flatMap((a) => (a.imei ? [[a.id, a.imei]] : [])));

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina titulo="Reservas do site" subtitulo="Clientes que reservaram na loja online para retirar aqui. A reserva vale 24 horas." />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_LOJA[erro]}</Aviso>}
      <ListaDeReservas reservas={reservas} produtos={produtos} imeis={imeis} instante={instante} />
    </MoldeReal>
  );
}
