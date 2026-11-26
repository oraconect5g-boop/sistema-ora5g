import { CalendarClock, Globe, ShoppingCart } from "lucide-react";

import { Aviso, Botao, Cartao, EstadoVazio, Selo } from "../../componentes/ui";
import { brl } from "../../lib/formato";
import { textoDaOrigem } from "../../lib/loja/origem";
import { tempoAteVencer } from "../../lib/loja/reserva";
import { atenderPedido, atenderReserva, cancelarPedido, cancelarReserva } from "./acoes";
import { RevelarContato } from "./RevelarContato";

export type ReservaDaLoja = {
  id: string; codigo: string; nome: string; whatsapp_mascarado: string; preco_centavos: number; situacao: string; expira_em: string; criada_em: string;
  variante_id: string; item_serializado_id: string | null; cancelada_em: string | null; motivo_cancelamento: string | null; atendida_em: string | null;
  /** MKT-a: de onde o cliente chegou ao site (nula nas reservas de antes de 17/11/2026). */
  origem: string | null; utm_source: string | null; utm_campaign: string | null;
  /** ONLINE-d: o pedido do site a que a unidade pertence (nula na reserva avulsa e no banco sem a migration). */
  pedido_id?: string | null;
};
/** ONLINE-d (ADR-023): o pedido do site, com até 3 unidades reservadas de uma vez (cada uma é uma reserva ligada a ele). */
export type PedidoDaLoja = {
  id: string; codigo: string; nome: string; whatsapp_mascarado: string; total_centavos: number; unidades: number; situacao: string;
  expira_em: string; criado_em: string; motivo_cancelamento: string | null;
};
/** PAY-014a (ADR-025): o Pix do pedido, pelo id do pedido (sem linha: o cliente não pediu para pagar pelo site). */
/** AUD-f: a divergência (com o motivo) e a conciliação do pagamento pelo site, quando o banco já tem as colunas. */
export type ConciliacaoDoPagamento = { bruto: number; liquido: number | null; estornado: number; naAsaas: string | null; conferidoEm: string | null };
export type PagamentoNaLoja = { situacao: string; pago_em: string | null; divergencia?: string | null; conciliacao?: ConciliacaoDoPagamento };

const campo = "mt-1 min-h-10 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const dataHora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/**
 * As reservas do site na loja (ONLINE-b; ADR-009): as ativas no prazo, com atender, cancelar e ver o WhatsApp; as
 * outras dos últimos 3 dias (atendidas, canceladas e vencidas), só para consulta. `produtos` e `imeis` vêm por id.
 */
export function ListaDeReservas({ reservas, pedidos = [], pagamentos = {}, produtos, imeis, instante }: {
  reservas: ReservaDaLoja[]; pedidos?: PedidoDaLoja[]; pagamentos?: Record<string, PagamentoNaLoja>; produtos: Record<string, string>;
  imeis: Record<string, string>; instante: number;
}) {
  // As unidades de um pedido saem e voltam com ele: não aparecem como reservas avulsas.
  const avulsas = reservas.filter((r) => !r.pedido_id);
  const doPedido = (p: PedidoDaLoja) => reservas.filter((r) => r.pedido_id === p.id);
  const pedidosAtivos = pedidos.filter((p) => p.situacao === "reservado" && Date.parse(p.expira_em) > instante);
  const ativas = avulsas.filter((r) => r.situacao === "ativa" && Date.parse(r.expira_em) > instante);
  const outras = avulsas.filter((r) => !ativas.includes(r)).sort((a, b) => b.criada_em.localeCompare(a.criada_em));
  const outrosPedidos = pedidos.filter((p) => !pedidosAtivos.includes(p));
  const rotuloDoPedido = (p: PedidoDaLoja) => p.situacao === "cancelado" ? <Selo tom="neutro">Cancelado</Selo> : p.situacao === "atendido" ? <Selo tom="sucesso">Atendido</Selo> : <Selo tom="aviso">Vencido</Selo>;
  const produto = (r: ReservaDaLoja) => produtos[r.variante_id] ?? "Produto";
  // O Pix do pedido: pago (não cobrar de novo), a caminho, devolvido ou sem efeito (cobrar na loja).
  const seloDoPix = (g: PagamentoNaLoja | undefined) => !g ? null
    : g.situacao === "pago" ? <Selo tom="sucesso">{`Pago pelo site${g.pago_em ? ` em ${dataHora(g.pago_em)}` : ""}`}</Selo>
    : g.situacao === "aguardando" ? <Selo tom="info">Pix enviado, ainda não pago</Selo>
    : g.situacao === "criando" ? <Selo tom="info">Preparando o Pix</Selo>
    : g.situacao === "estornado" ? <Selo tom="neutro">Pagamento devolvido</Selo>
    : <Selo tom="neutro">Pix sem efeito: cobre na loja</Selo>;
  // AUD-f: a conciliação do pagamento: o bruto, o líquido (o que a Asaas deposita; a diferença é a taxa dela) e o estornado.
  const conciliacao = (g: PagamentoNaLoja | undefined) => {
    const c = g?.conciliacao;
    if (!c || (g.situacao !== "pago" && g.situacao !== "estornado" && c.estornado === 0)) return null;
    const partes = [`bruto ${brl(c.bruto)}`, ...(c.liquido !== null ? [`líquido ${brl(c.liquido)} (taxa da Asaas ${brl(Math.max(c.bruto - c.liquido, 0))})`] : []),
      ...(c.estornado > 0 ? [`estornado ${brl(c.estornado)}`] : []), ...(c.naAsaas ? [`na Asaas: ${c.naAsaas}`] : [])];
    return <p className="numeros text-xs text-suave">{`Conciliação: ${partes.join(" · ")}${c.conferidoEm ? ` (conferido em ${dataHora(c.conferidoEm)})` : ""}`}</p>;
  };
  const rotulo = (r: ReservaDaLoja) => r.situacao === "cancelada" ? <Selo tom="neutro">Cancelada</Selo> : r.situacao === "atendida" ? <Selo tom="sucesso">Atendida</Selo> : <Selo tom="aviso">Vencida</Selo>;
  return (
    <div className="mt-4 space-y-4">
      {pedidosAtivos.map((p) => {
        const unidades = doPedido(p);
        return (
          <Cartao key={p.id} titulo={`Pedido ${p.codigo}`} subtitulo={`Reservado em ${dataHora(p.criado_em)} · ${p.unidades} ${p.unidades === 1 ? "unidade" : "unidades"}`} icone={ShoppingCart}
            acao={<Selo tom="info" ponto>{`vence em ${tempoAteVencer(p.expira_em, instante)}`}</Selo>}>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              <div><dt className="text-suave">Cliente</dt><dd className="font-medium">{p.nome}</dd></div>
              <div><dt className="text-suave">WhatsApp</dt><dd>{unidades[0] ? <RevelarContato reserva={unidades[0].id} mascara={p.whatsapp_mascarado} /> : p.whatsapp_mascarado}</dd></div>
              <div className="sm:col-span-2"><dt className="text-suave">Itens</dt><dd>
                <ul className="space-y-0.5">{unidades.map((r) => {
                  const imei = r.item_serializado_id ? imeis[r.item_serializado_id] : undefined;
                  return <li key={r.id} className="numeros">{`${produto(r)} · ${brl(r.preco_centavos)}${imei ? ` · IMEI ${imei}` : ""}`}</li>;
                })}</ul>
              </dd></div>
              <div><dt className="text-suave">{pagamentos[p.id]?.situacao === "pago" ? "Total pago pelo site" : "Total anunciado"}</dt><dd className="numeros font-bold">{brl(p.total_centavos)}</dd></div>
              {pagamentos[p.id] && (
                <div className="sm:col-span-2"><dt className="text-suave">Pagamento pelo site</dt><dd className="space-y-1">
                  {seloDoPix(pagamentos[p.id])}
                  {pagamentos[p.id]?.divergencia && <Aviso tom="aviso">{`Confira antes de entregar ou cancelar: ${pagamentos[p.id]?.divergencia}`}</Aviso>}
                  {conciliacao(pagamentos[p.id])}
                </dd></div>
              )}
              {unidades[0] && <div><dt className="text-suave">Veio de</dt><dd>{textoDaOrigem(unidades[0])}</dd></div>}
            </dl>
            <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-1">
              <form action={atenderPedido}><input type="hidden" name="pedido" value={p.id} /><Botao type="submit" tamanho="sm">Atender o pedido no PDV</Botao></form>
              {pagamentos[p.id]?.situacao === "pago" ? (
                <p className="w-full text-xs text-suave sm:w-auto sm:flex-1">Já pago pelo site: não cobre de novo. Se o cliente desistir, o dinheiro volta pela Asaas (o estorno) antes de cancelar o pedido.</p>
              ) : (
                <details className="w-full min-w-0 text-sm sm:w-auto sm:flex-1">
                  <summary className="cursor-pointer py-1.5 font-semibold text-acao">Cancelar o pedido</summary>
                  <form action={cancelarPedido} className="mt-1 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="pedido" value={p.id} />
                    <label className="min-w-0 flex-1 text-xs font-medium">Motivo (de 3 a 200 letras)<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                    <Botao type="submit" tamanho="sm" variante="secundario">Cancelar</Botao>
                  </form>
                </details>
              )}
            </div>
          </Cartao>
        );
      })}
      {ativas.length === 0 && pedidosAtivos.length === 0
        ? <EstadoVazio titulo="Nenhuma reserva esperando" icone={Globe}>Quando um cliente reservar no site para retirar nesta loja, a reserva aparece aqui.</EstadoVazio>
        : ativas.map((r) => {
          const imei = r.item_serializado_id ? imeis[r.item_serializado_id] : undefined;
          return (
            <Cartao key={r.id} titulo={`Código ${r.codigo}`} subtitulo={`Reservada em ${dataHora(r.criada_em)}`} icone={CalendarClock}
              acao={<Selo tom="info" ponto>{`vence em ${tempoAteVencer(r.expira_em, instante)}`}</Selo>}>
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                <div><dt className="text-suave">Cliente</dt><dd className="font-medium">{r.nome}</dd></div>
                <div><dt className="text-suave">WhatsApp</dt><dd><RevelarContato reserva={r.id} mascara={r.whatsapp_mascarado} /></dd></div>
                <div><dt className="text-suave">Produto</dt><dd className="font-medium">{produto(r)}</dd></div>
                <div><dt className="text-suave">Preço anunciado</dt><dd className="numeros font-bold">{brl(r.preco_centavos)}</dd></div>
                <div className="sm:col-span-2"><dt className="text-suave">Veio de</dt><dd>{textoDaOrigem(r)}</dd></div>
                {imei && <div className="sm:col-span-2"><dt className="text-suave">IMEI reservado</dt><dd className="numeros break-all">{imei}</dd></div>}
              </dl>
              {/* No celular, o cancelar fica numa linha só dele, para o motivo ter a largura toda. */}
              <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-1">
                <form action={atenderReserva}><input type="hidden" name="reserva" value={r.id} /><Botao type="submit" tamanho="sm">Atender no PDV</Botao></form>
                <details className="w-full min-w-0 text-sm sm:w-auto sm:flex-1">
                  <summary className="cursor-pointer py-1.5 font-semibold text-acao">Cancelar a reserva</summary>
                  <form action={cancelarReserva} className="mt-1 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="reserva" value={r.id} />
                    <label className="min-w-0 flex-1 text-xs font-medium">Motivo (de 3 a 200 letras)<input name="motivo" required minLength={3} maxLength={200} className={campo} /></label>
                    <Botao type="submit" tamanho="sm" variante="secundario">Cancelar</Botao>
                  </form>
                </details>
              </div>
            </Cartao>
          );
        })}
      {outrosPedidos.length > 0 && (
        <Cartao titulo="Pedidos dos últimos 3 dias" subtitulo="Atendidos, cancelados e vencidos" icone={ShoppingCart}>
          <ul className="divide-y divide-borda text-sm">
            {outrosPedidos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0"><span className="numeros font-semibold">{p.codigo}</span>{` · ${p.nome} · ${p.unidades} ${p.unidades === 1 ? "unidade" : "unidades"} · ${brl(p.total_centavos)}${p.motivo_cancelamento ? ` · ${p.motivo_cancelamento}` : ""}`}</span>
                <span className="flex flex-wrap gap-1">{seloDoPix(pagamentos[p.id])}{rotuloDoPedido(p)}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
      {outras.length > 0 && (
        <Cartao titulo="Últimos 3 dias" subtitulo="Atendidas, canceladas e vencidas" icone={Globe}>
          <ul className="divide-y divide-borda text-sm">
            {outras.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0"><span className="numeros font-semibold">{r.codigo}</span> · {r.nome} · {produto(r)}{r.motivo_cancelamento ? ` · ${r.motivo_cancelamento}` : ""} · <span className="text-suave">{textoDaOrigem(r)}</span></span>
                {rotulo(r)}
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
