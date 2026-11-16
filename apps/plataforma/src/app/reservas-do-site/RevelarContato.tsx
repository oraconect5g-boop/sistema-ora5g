"use client";

import { MessageCircle } from "lucide-react";
import { useActionState } from "react";

import { ERROS_DA_LOJA, whatsappLegivel } from "../../lib/loja/reserva";
import { revelarContato, type EstadoDoContato } from "./acoes";

/** O WhatsApp do cliente, só quando a pessoa pede (fica na auditoria), com o link para abrir a conversa. */
export function RevelarContato({ reserva, mascara }: { reserva: string; mascara: string }) {
  const [estado, revelar, revelando] = useActionState<EstadoDoContato, FormData>(revelarContato, { situacao: "vazio" });
  if (estado.situacao === "pronto") {
    return (
      <a href={`https://wa.me/55${estado.whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-acao">
        <MessageCircle aria-hidden className="size-4" /> {whatsappLegivel(estado.whatsapp)}
      </a>
    );
  }
  return (
    <form action={revelar} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="reserva" value={reserva} />
      <span className="numeros">{mascara}</span>
      <button type="submit" disabled={revelando} className="text-xs font-semibold text-acao underline-offset-2 hover:underline">{revelando ? "..." : "ver WhatsApp"}</button>
      {estado.situacao === "erro" && <span className="text-xs text-perigo">{ERROS_DA_LOJA[estado.erro]}</span>}
    </form>
  );
}
