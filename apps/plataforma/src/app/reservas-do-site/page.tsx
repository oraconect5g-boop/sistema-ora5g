import type { Metadata } from "next";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, BotaoLink, TituloPagina } from "../../componentes/ui";
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

const CAMPOS_RESERVA = "id, codigo, nome, whatsapp_mascarado, preco_centavos, situacao, expira_em, criada_em, variante_id, item_serializado_id, cancelada_em, motivo_cancelamento, atendida_em, origem, utm_source, utm_campaign, pedido_id";
const CAMPOS_PEDIDO = "id, codigo, nome, whatsapp_mascarado, total_centavos, unidades, situacao, expira_em, criado_em, motivo_cancelamento";
const TAMANHO_LOTE = 50;

type Leitura<T> = PromiseLike<{ data: T[] | null; error: { code?: string } | null }>;

async function lerEmLotes<T>(ids: string[], ler: (lote: string[]) => Leitura<T>) {
  const unicos = [...new Set(ids)];
  const respostas = await Promise.all(Array.from({ length: Math.ceil(unicos.length / TAMANHO_LOTE) }, (_, i) =>
    ler(unicos.slice(i * TAMANHO_LOTE, (i + 1) * TAMANHO_LOTE))));
  return { data: respostas.flatMap((r) => r.data ?? []), erros: respostas.flatMap((r) => r.error ? [r.error] : []) };
}

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
  const agora = new Date(instante).toISOString();
  const desde = new Date(instante - 3 * 86_400_000).toISOString();
  // As reservas avulsas mantêm o histórico curto. Itens de pedido são lidos pelos pedidos ativos abaixo, sem essa data.
  const lidas = await supabase.from("loja_reservas")
    .select(CAMPOS_RESERVA)
    .eq("unidade_id", unidade).is("pedido_id", null).gte("criada_em", desde).order("expira_em").limit(100);
  if (lidas.error) {
    if (!reservasAusentes(lidas.error)) throw new FalhaDoServico("loja_reservas");
    return <MoldeReal sessao={sessao}><TituloPagina titulo="Reservas do site" /><Aviso tom="info" className="mt-4">As reservas do site ainda não estão disponíveis neste ambiente.</Aviso></MoldeReal>;
  }
  // O Pix pode estender a retirada a sete dias (PAY-014). O corte de três dias só vale para o histórico.
  const lerPedidos = () => supabase.from("loja_pedidos").select(CAMPOS_PEDIDO).eq("unidade_id", unidade);
  const ativos = new Map<string, PedidoDaLoja>();
  // O ID não muda quando um pedido é atendido, cancelado ou prorrogado entre duas leituras.
  let ultimoId: string | undefined;
  for (;;) {
    const consulta = lerPedidos().eq("situacao", "reservado").gt("expira_em", agora).order("id").limit(TAMANHO_LOTE);
    const pagina = await (ultimoId ? consulta.gt("id", ultimoId) : consulta);
    if (pagina.error) {
      if (!reservasAusentes(pagina.error)) throw new FalhaDoServico("loja_pedidos");
      break; // Banco sem a migração do pedido: as reservas avulsas continuam disponíveis.
    }
    const itens = (pagina.data ?? []) as unknown as PedidoDaLoja[];
    for (const pedido of itens) ativos.set(pedido.id, pedido);
    if (itens.length < TAMANHO_LOTE) break;
    ultimoId = itens[itens.length - 1]?.id;
    if (!ultimoId) break;
  }
  const [historico, itensDosPedidos] = await Promise.all([
    lerPedidos().gte("criado_em", desde).or(`situacao.neq.reservado,expira_em.lte.${agora}`)
      .order("criado_em", { ascending: false }).order("id").limit(50),
    // Um pedido tem no máximo três itens. Mesmo no lote cheio, a leitura fica abaixo do limite padrão de linhas.
    lerEmLotes([...ativos.keys()], (lote) => supabase.from("loja_reservas").select(CAMPOS_RESERVA)
      .eq("unidade_id", unidade).in("pedido_id", lote).order("id")),
  ]);
  if (historico.error && !reservasAusentes(historico.error)) throw new FalhaDoServico("loja_pedidos");
  if (itensDosPedidos.erros.length) throw new FalhaDoServico("loja_reservas");
  const fechados = (historico.data ?? []) as unknown as PedidoDaLoja[];
  // Se a leitura posterior já viu o pedido fechado, não mostre também o cartão de retirada.
  for (const pedido of fechados) ativos.delete(pedido.id);
  const porVencimento = [...ativos.values()].sort((a, b) => Date.parse(a.expira_em) - Date.parse(b.expira_em) || a.id.localeCompare(b.id));
  const pedidos = [...porVencimento, ...fechados];
  const reservas = [...(lidas.data ?? []), ...itensDosPedidos.data] as unknown as ReservaDaLoja[];
  // PAY-014a: o Pix dos pedidos (a loja vê "pago pelo site" antes de o cliente chegar). Banco sem a migration: sem pagamentos.
  const [variantes, aparelhos, pagamentosLidos] = await Promise.all([
    lerEmLotes(reservas.map((r) => r.variante_id), (lote) => supabase.from("variantes").select("id, nome").in("id", lote)),
    lerEmLotes(reservas.flatMap((r) => r.item_serializado_id ? [r.item_serializado_id] : []),
      (lote) => supabase.from("itens_serializados").select("id, imei").in("id", lote)),
    lerEmLotes(pedidos.map((p) => p.id), (lote) => supabase.from("loja_pagamentos").select("pedido_id, situacao, pago_em").in("pedido_id", lote)),
  ]);
  if (pagamentosLidos.erros.some((erro) => !reservasAusentes(erro))) throw new FalhaDoServico("loja_pagamentos");
  const pagamentos: Record<string, PagamentoNaLoja> = Object.fromEntries(pagamentosLidos.data
    .map((g) => [g.pedido_id, { situacao: g.situacao, pago_em: g.pago_em }]));
  // Sem o nome ou o IMEI (falha passageira ou sem leitura), a reserva aparece mesmo assim: "Produto" e sem o IMEI.
  const produtos: Record<string, string> = Object.fromEntries((variantes.data ?? []).map((v) => [v.id, v.nome]));
  const imeis: Record<string, string> = Object.fromEntries((aparelhos.data ?? []).flatMap((a) => (a.imei ? [[a.id, a.imei]] : [])));

  return (
    <MoldeReal sessao={sessao}>
      <TituloPagina titulo="Reservas do site" subtitulo="Pedidos da loja online para retirar aqui. Sem pagamento, a reserva vale 24 horas. Pedidos pagos seguem o prazo informado."
        acao={<div className="flex flex-wrap gap-2">
          {permite(sessao, "estoque.consultar") && <BotaoLink href="/estoque" prefetch={false} tamanho="sm" variante="secundario">Consultar estoque</BotaoLink>}
          <BotaoLink href="/vender" prefetch={false} tamanho="sm" variante="secundario">Voltar ao PDV</BotaoLink>
        </div>} />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_LOJA[erro]}</Aviso>}
      <ListaDeReservas reservas={reservas} pedidos={pedidos} pagamentos={pagamentos} produtos={produtos} imeis={imeis} instante={instante} />
    </MoldeReal>
  );
}
