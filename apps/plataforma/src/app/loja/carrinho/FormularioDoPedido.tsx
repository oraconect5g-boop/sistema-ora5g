"use client";

import { CalendarClock, CheckCircle2, MapPin, Store } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Aviso, Botao } from "../../../componentes/ui";
import { brl } from "../../../lib/formato";
import { ERROS_DO_PEDIDO, nomeDoItem, type PedidoDoSite } from "../../../lib/loja/carrinho";
import { pedirNoSite, type EstadoDoPedido } from "./acoes";

const campo = "mt-1 min-h-12 w-full rounded-botao border border-borda bg-white px-3.5 text-[15px] outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const dataHora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const SITUACOES: Record<PedidoDoSite["situacao"], string> = { reservado: "Reservado", vencido: "Vencido", atendido: "Retirado na loja", cancelado: "Cancelado" };

/** O pedido: o código grande para mostrar no balcão, os itens, o total, a loja e até quando vale. */
export function PedidoDoSiteNaTela({ pedido, feito }: { pedido: PedidoDoSite; feito: boolean }) {
  return (
    <section className="space-y-4 rounded-cartao border border-sucesso/30 bg-white p-5" aria-live="polite">
      <p className="flex items-center gap-2 font-semibold text-sucesso"><CheckCircle2 aria-hidden className="size-5" /> {feito ? "Pedido reservado" : `Pedido: ${SITUACOES[pedido.situacao]}`}</p>
      <div className="rounded-cartao bg-acao-clara px-4 py-5 text-center">
        <p className="text-sm text-suave">Mostre este código no balcão</p>
        <p className="numeros mt-1 text-4xl font-extrabold tracking-[0.25em] text-acao">{pedido.codigo}</p>
      </div>
      <ul className="divide-y divide-borda text-sm">
        {pedido.itens.map((i, n) => (
          <li key={n} className="flex justify-between gap-3 py-2"><span>{nomeDoItem(i.produto, i.variacao)}</span><span className="numeros font-semibold">{brl(i.preco_centavos)}</span></li>
        ))}
        <li className="flex justify-between gap-3 py-2 font-bold"><span>Total na loja</span><span className="numeros">{brl(pedido.total_centavos)}</span></li>
      </ul>
      <dl className="space-y-2 text-sm">
        <div><dt className="flex items-center gap-1 text-suave"><Store aria-hidden className="size-4" /> Retire em</dt>
          <dd className="font-medium">{pedido.loja.nome}</dd>
          {(pedido.loja.endereco || pedido.loja.cidade) && <dd className="flex items-start gap-1 text-xs text-suave"><MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />{[pedido.loja.endereco, pedido.loja.cidade].filter(Boolean).join(" · ")}</dd>}
        </div>
        {pedido.situacao === "reservado" && (
          <div><dt className="flex items-center gap-1 text-suave"><CalendarClock aria-hidden className="size-4" /> Vale até</dt><dd className="font-medium first-letter:uppercase">{dataHora(pedido.expira_em)}</dd></div>
        )}
      </dl>
      <p className="text-xs text-suave">O pagamento é feito na loja, na retirada. Guarde o código: com ele e o seu WhatsApp, você acompanha o pedido em &quot;Meu pedido&quot;. Depois do prazo, o pedido vence sozinho.</p>
      <Link href="/loja" className="inline-flex min-h-10 items-center text-sm font-semibold text-acao">Voltar à loja</Link>
    </section>
  );
}

/** O formulário do pedido: nome, WhatsApp e o aceite do uso dos dados só para este pedido. */
export function FormularioDoPedido({ chave }: { chave: string }) {
  const [estado, pedir, pedindo] = useActionState<EstadoDoPedido, FormData>(pedirNoSite, { situacao: "vazio" });
  if (estado.situacao === "pronto") return <PedidoDoSiteNaTela pedido={estado.pedido} feito />;
  const antes = estado.situacao === "erro" ? estado.digitado : undefined;
  return (
    <form action={pedir} className="space-y-4 rounded-cartao border border-borda bg-white p-5">
      <input type="hidden" name="chave" value={chave} />
      {estado.situacao === "erro" && <Aviso tom="perigo">{ERROS_DO_PEDIDO[estado.erro]}</Aviso>}
      <label className="block text-sm font-medium">Seu nome
        <input name="nome" required minLength={2} maxLength={80} autoComplete="name" defaultValue={antes?.nome} className={campo} />
      </label>
      <label className="block text-sm font-medium">WhatsApp com DDD
        <input name="whatsapp" required inputMode="tel" autoComplete="tel" placeholder="(41) 99999-0000" maxLength={20} defaultValue={antes?.whatsapp} className={campo} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="aceite" value="sim" required defaultChecked={antes?.aceite} className="mt-1 size-4 accent-acao" />
        <span>Concordo que a Ora 5G use meu nome e meu WhatsApp só para este pedido: para a loja confirmar e combinar a retirada.</span>
      </label>
      <Botao type="submit" className="w-full" disabled={pedindo}>{pedindo ? "Reservando..." : "Reservar o pedido por 24 horas"}</Botao>
      <p className="text-xs text-suave">Tudo ou nada: se um item acabar, nada fica reservado. Você paga na loja, na retirada. O pagamento pelo site ainda não está disponível.</p>
    </form>
  );
}
