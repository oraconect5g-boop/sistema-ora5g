"use client";

import { Send, Sparkles } from "lucide-react";
import { useState } from "react";

import { Avatar, Botao, Selo } from "../../../componentes/ui";

type Mensagem = { de: "cliente" | "loja"; texto: string; hora: string };
export type ConversaDemo = { id: string; cliente: string; canal: string; responsavel: string; naoLidas: number; ultima: string; mensagens: readonly Mensagem[]; sugestao?: string };

/** Caixa de entrada compartilhada (WhatsApp oficial ainda não conectado): na demonstração, a resposta fica só na tela. */
export function Conversas({ conversas }: { conversas: readonly ConversaDemo[] }) {
  const [ativa, setAtiva] = useState(conversas[0]?.id ?? "");
  const [enviadas, setEnviadas] = useState<Record<string, Mensagem[]>>({});
  const [texto, setTexto] = useState("");
  const conversa = conversas.find((c) => c.id === ativa);

  function enviar() {
    const limpo = texto.trim();
    if (!conversa || limpo === "") return;
    const agora = new Date();
    const hora = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
    setEnviadas({ ...enviadas, [conversa.id]: [...(enviadas[conversa.id] ?? []), { de: "loja", texto: limpo, hora }] });
    setTexto("");
  }

  return (
    <div className="grid min-h-[28rem] overflow-hidden rounded-cartao border border-borda bg-white shadow-cartao md:grid-cols-[18rem_minmax(0,1fr)]">
      <ul aria-label="Conversas" className="divide-y divide-borda border-b border-borda md:border-b-0 md:border-r">
        {conversas.map((c) => (
          <li key={c.id}>
            <button type="button" aria-pressed={c.id === ativa} onClick={() => setAtiva(c.id)} className={`flex w-full items-start gap-3 px-4 py-3 text-left ${c.id === ativa ? "bg-acao-clara/60" : "hover:bg-slate-50"}`}>
              <Avatar nome={c.cliente} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{c.cliente}</span>{c.naoLidas > 0 && !enviadas[c.id] && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-acao text-[11px] font-bold text-white">{c.naoLidas}</span>}</span>
                <span className="block truncate text-xs text-suave">{enviadas[c.id]?.at(-1)?.texto ?? c.ultima}</span>
                <span className="mt-1 block"><Selo tom="neutro">{c.canal}</Selo></span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {conversa && (
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-borda px-4 py-3">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{conversa.cliente}</p><p className="text-xs text-suave">{conversa.canal} · atribuída a {conversa.responsavel}</p></div>
            <Selo tom="aviso" ponto>WhatsApp oficial não conectado</Selo>
          </div>
          <ol aria-label={`Mensagens com ${conversa.cliente}`} aria-live="polite" className="flex-1 space-y-2 overflow-y-auto bg-fundo/60 px-4 py-4">
            {[...conversa.mensagens, ...(enviadas[conversa.id] ?? [])].map((m, i) => (
              <li key={i} className={`flex ${m.de === "loja" ? "justify-end" : ""}`}>
                <p className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.de === "loja" ? "rounded-br-md bg-acao text-white" : "rounded-bl-md bg-white"}`}>
                  {m.texto}<span className={`ml-2 text-[10px] ${m.de === "loja" ? "text-teal-100" : "text-suave"}`}>{m.hora}</span>
                </p>
              </li>
            ))}
          </ol>
          {conversa.sugestao && (
            <div className="border-t border-borda bg-violet-50/60 px-4 py-2">
              <p className="flex items-start gap-2 text-xs text-violet-900"><Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0" /><span><strong>Sugestão da IA (supervisionada):</strong> {conversa.sugestao}</span></p>
              <button type="button" onClick={() => setTexto(conversa.sugestao ?? "")} className="mt-1 text-xs font-semibold text-violet-800 underline">Usar como rascunho</button>
            </div>
          )}
          <form className="flex gap-2 border-t border-borda p-3" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
            <label className="sr-only" htmlFor="mensagem">Escrever mensagem</label>
            <input id="mensagem" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escrever resposta…" autoComplete="off" className="min-h-11 min-w-0 flex-1 rounded-botao border border-borda px-3 text-[15px] outline-none focus:border-acao focus:ring-2 focus:ring-acao/20" />
            <Botao type="submit" disabled={texto.trim() === ""}><Send aria-hidden className="size-4" /> Enviar</Botao>
          </form>
          <p className="px-4 pb-3 text-[11px] text-suave">Demonstração: a mensagem não sai do navegador. A IA só sugere; quem responde é a pessoa, e a IA nunca dá desconto.</p>
        </div>
      )}
    </div>
  );
}
