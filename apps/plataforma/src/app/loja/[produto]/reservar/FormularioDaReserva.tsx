"use client";

import { CalendarClock, CheckCircle2, MapPin, Store } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Aviso, Botao } from "../../../../componentes/ui";
import { brl } from "../../../../lib/formato";
import { ERROS_DA_RESERVA, type ConfirmacaoDaReserva } from "../../../../lib/loja/reserva";
import { reservarNoSite, type EstadoDaReserva } from "./acoes";

const campo = "mt-1 min-h-12 w-full rounded-botao border border-borda bg-white px-3.5 text-[15px] outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const dataHora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** A reserva feita: o código grande para mostrar no balcão, a loja, até quando vale e o preço. */
export function ReservaConfirmada({ reserva }: { reserva: ConfirmacaoDaReserva }) {
  return (
    <section className="space-y-4 rounded-cartao border border-sucesso/30 bg-white p-5" aria-live="polite">
      <p className="flex items-center gap-2 font-semibold text-sucesso"><CheckCircle2 aria-hidden className="size-5" /> Reserva feita</p>
      <div className="rounded-cartao bg-acao-clara px-4 py-5 text-center">
        <p className="text-sm text-suave">Mostre este código no balcão</p>
        <p className="numeros mt-1 text-4xl font-extrabold tracking-[0.25em] text-acao">{reserva.codigo}</p>
      </div>
      <dl className="space-y-2 text-sm">
        <div><dt className="text-suave">Produto</dt><dd className="font-medium">{reserva.variacao || reserva.produto}</dd></div>
        <div><dt className="text-suave">Preço na loja</dt><dd className="numeros text-lg font-bold">{brl(reserva.preco_centavos)}</dd></div>
        <div><dt className="flex items-center gap-1 text-suave"><Store aria-hidden className="size-4" /> Retire em</dt>
          <dd className="font-medium">{reserva.loja.nome}</dd>
          {(reserva.loja.endereco || reserva.loja.cidade) && <dd className="flex items-start gap-1 text-xs text-suave"><MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />{[reserva.loja.endereco, reserva.loja.cidade].filter(Boolean).join(" · ")}</dd>}
        </div>
        <div><dt className="flex items-center gap-1 text-suave"><CalendarClock aria-hidden className="size-4" /> Vale até</dt><dd className="font-medium first-letter:uppercase">{dataHora(reserva.expira_em)}</dd></div>
      </dl>
      <p className="text-xs text-suave">O pagamento é feito na loja, na retirada. A loja pode chamar você no WhatsApp para combinar. Depois do prazo, a reserva vence sozinha.</p>
      <Link href="/loja" className="inline-flex min-h-10 items-center text-sm font-semibold text-acao">Voltar à loja</Link>
    </section>
  );
}

/** O formulário: nome, WhatsApp e o aceite do uso dos dados só para esta reserva. */
export function FormularioDaReserva({ variante, loja, chave }: { variante: string; loja: string; chave: string }) {
  const [estado, reservar, reservando] = useActionState<EstadoDaReserva, FormData>(reservarNoSite, { situacao: "vazio" });
  if (estado.situacao === "pronta") return <ReservaConfirmada reserva={estado.reserva} />;
  const antes = estado.situacao === "erro" ? estado.digitado : undefined;
  return (
    <form action={reservar} className="space-y-4 rounded-cartao border border-borda bg-white p-5">
      <input type="hidden" name="variante" value={variante} /><input type="hidden" name="loja" value={loja} /><input type="hidden" name="chave" value={chave} />
      {estado.situacao === "erro" && <Aviso tom="perigo">{ERROS_DA_RESERVA[estado.erro]}</Aviso>}
      <label className="block text-sm font-medium">Seu nome
        <input name="nome" required minLength={2} maxLength={80} autoComplete="name" defaultValue={antes?.nome} className={campo} />
      </label>
      <label className="block text-sm font-medium">WhatsApp com DDD
        <input name="whatsapp" required inputMode="tel" autoComplete="tel" placeholder="(41) 99999-0000" maxLength={20} defaultValue={antes?.whatsapp} className={campo} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="aceite" value="sim" required defaultChecked={antes?.aceite} className="mt-1 size-4 accent-acao" />
        <span>Concordo que a Ora 5G use meu nome e meu WhatsApp só para esta reserva: para a loja confirmar e combinar a retirada.</span>
      </label>
      <Botao type="submit" className="w-full" disabled={reservando}>{reservando ? "Reservando..." : "Reservar por 24 horas"}</Botao>
      <p className="text-xs text-suave">Você paga na loja, na retirada. Sem compromisso: se não puder ir, a reserva vence sozinha.</p>
    </form>
  );
}
