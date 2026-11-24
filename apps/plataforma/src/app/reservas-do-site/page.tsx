import type { Metadata } from "next";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, TituloPagina } from "../../componentes/ui";
import { permite } from "../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { agora as agoraDoServidor } from "../../lib/formato";
import { ERROS_DA_LOJA, reservasAusentes } from "../../lib/loja/reserva";
import { soltarReservasDoSiteVencidas } from "../../lib/loja/reservas-vencidas";
import { chaveDoCatalogo, type ValorDeParametro } from "../../lib/parametros";
import { ListaDeReservas, type PagamentoNaLoja, type PedidoDaLoja, type ReservaDaLoja } from "./ListaDeReservas";

export const metadata: Metadata = { title: "Reservas do site" };
export const dynamic = "force-dynamic";

const OK = {
  cancelada: "Reserva cancelada: a unidade voltou para o estoque da loja.",
  ja_cancelada: "Nada mudou: esta reserva já estava cancelada.",
  pedido_cancelado: "Pedido cancelado: as unidades voltaram para o estoque da loja.",
  pedido_ja_cancelado: "Nada mudou: este pedido já estava cancelado.",
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
  const pode = permite(sessao, "venda.registrar");
  if (!pode) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Só quem vende nesta loja atende as reservas do site.</Aviso></MoldeReal>;
  // As vencidas desta loja saem de vez do estoque reservado (continuam na lista, como "Vencida").
  await soltarReservasDoSiteVencidas(supabase);
  const instante = agoraDoServidor().getTime();
  const desde = new Date(instante - 3 * 86_400_000).toISOString();
  const lidas = await supabase.from("loja_reservas")
    .select("id, codigo, nome, whatsapp_mascarado, preco_centavos, situacao, expira_em, criada_em, variante_id, item_serializado_id, cancelada_em, motivo_cancelamento, atendida_em, origem, utm_source, utm_campaign, pedido_id")
    .eq("unidade_id", unidade).gte("criada_em", desde).order("expira_em").limit(100);
  if (lidas.error) {
    if (!reservasAusentes(lidas.error)) throw new FalhaDoServico("loja_reservas");
    return <MoldeReal sessao={sessao}><TituloPagina titulo="Reservas do site" /><Aviso tom="info" className="mt-4">As reservas do site ainda não estão disponíveis neste ambiente.</Aviso></MoldeReal>;
  }
  const reservas = lidas.data as unknown as ReservaDaLoja[];
  // ONLINE-d: os pedidos do site desta loja (o carrinho reservado de uma vez). Banco sem a migration: sem pedidos.
  const pedidosLidos = await supabase.from("loja_pedidos")
    .select("id, codigo, nome, whatsapp_mascarado, total_centavos, unidades, situacao, expira_em, criado_em, motivo_cancelamento")
    .eq("unidade_id", unidade).gte("criado_em", desde).order("expira_em").limit(50);
  if (pedidosLidos.error && !reservasAusentes(pedidosLidos.error)) throw new FalhaDoServico("loja_pedidos");
  const pedidos = (pedidosLidos.error ? [] : pedidosLidos.data) as unknown as PedidoDaLoja[];
  // PAY-014a: o Pix dos pedidos (a loja vê "pago pelo site" antes de o cliente chegar). Banco sem a migration: sem pagamentos.
  const [variantes, aparelhos, pagamentosLidos] = await Promise.all([
    reservas.length ? supabase.from("variantes").select("id, nome").in("id", [...new Set(reservas.map((r) => r.variante_id))]) : Promise.resolve({ data: [], error: null }),
    reservas.some((r) => r.item_serializado_id)
      ? supabase.from("itens_serializados").select("id, imei").in("id", reservas.flatMap((r) => (r.item_serializado_id ? [r.item_serializado_id] : [])))
      : Promise.resolve({ data: [], error: null }),
    pedidos.length ? supabase.from("loja_pagamentos").select("pedido_id, situacao, pago_em").in("pedido_id", pedidos.map((p) => p.id)) : Promise.resolve({ data: [], error: null }),
  ]);
  if (pagamentosLidos.error && !reservasAusentes(pagamentosLidos.error)) throw new FalhaDoServico("loja_pagamentos");
  const pagamentos: Record<string, PagamentoNaLoja> = Object.fromEntries(((pagamentosLidos.error ? [] : pagamentosLidos.data) ?? [])
    .map((g) => [g.pedido_id, { situacao: g.situacao, pago_em: g.pago_em }]));
  // Sem o nome ou o IMEI (falha passageira ou sem leitura), a reserva aparece mesmo assim: "Produto" e sem o IMEI.
  const produtos: Record<string, string> = Object.fromEntries((variantes.data ?? []).map((v) => [v.id, v.nome]));
  const imeis: Record<string, string> = Object.fromEntries((aparelhos.data ?? []).flatMap((a) => (a.imei ? [[a.id, a.imei]] : [])));

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina titulo="Reservas do site" subtitulo="Clientes que reservaram na loja online para retirar aqui. A reserva vale 24 horas." />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_LOJA[erro]}</Aviso>}
      <ListaDeReservas reservas={reservas} pedidos={pedidos} pagamentos={pagamentos} produtos={produtos} imeis={imeis} instante={instante} />
    </MoldeReal>
  );
}
