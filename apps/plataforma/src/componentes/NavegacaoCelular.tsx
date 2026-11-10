"use client";

import { Ellipsis, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { Icone } from "./Icone";
import { caminhoAtivo, LinkNavegacao } from "./LinkNavegacao";

// Barra inferior do celular: até 4 atalhos + "Mais", que abre a lista completa por baixo.
// A lista fecha ao trocar de tela (antes ficava aberta por cima da tela nova), com Esc ou tocando fora.

export type ItemNavegacao = { href: string; titulo: string; curto: string; icone: string; emblema?: number };

export function NavegacaoCelular({ atalhos, grupos, pessoa, papel, loja, rodape }: {
  atalhos: readonly ItemNavegacao[];
  grupos: readonly { grupo: string; itens: readonly ItemNavegacao[] }[];
  pessoa: string;
  papel: string;
  loja: string;
  /** Fim da lista "Mais" (telas reais: trocar de loja, senha e sair). Sem ele, o atalho da demonstração. */
  rodape?: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const caminho = usePathname();

  useEffect(() => {
    if (dialogo.current?.open) dialogo.current.close();
  }, [caminho]);

  const maisAtivo = grupos.some((g) => g.itens.some((i) => caminhoAtivo(caminho, i.href)));
  const pendentesNoMais = grupos.flatMap((g) => g.itens).reduce((s, i) => s + (i.emblema ?? 0), 0);

  return (
    <>
      <nav aria-label="Atalhos" className="nao-imprimir fixed inset-x-0 bottom-0 z-30 flex border-t border-borda bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {atalhos.map((a) => (
          <LinkNavegacao key={a.href} href={a.href} variante="inferior" icone={<Icone nome={a.icone} />} emblema={a.emblema}>
            {a.curto}
          </LinkNavegacao>
        ))}
        {grupos.length > 0 && (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => dialogo.current?.showModal()}
            className={`relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${maisAtivo ? "text-acao" : "text-suave"}`}
          >
            <span className={`grid h-7 w-14 place-items-center rounded-full ${maisAtivo ? "bg-acao-clara" : ""}`}><Ellipsis aria-hidden className="size-[22px]" /></span>
            Mais
            {pendentesNoMais > 0 && <span aria-label={`${pendentesNoMais} pendentes`} className="absolute right-[calc(50%-26px)] top-1.5 grid min-w-[18px] place-items-center rounded-full bg-perigo px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-white">{pendentesNoMais}</span>}
          </button>
        )}
      </nav>

      <dialog
        ref={dialogo}
        aria-label="Todas as telas"
        onClick={(evento) => { if (evento.target === dialogo.current) dialogo.current?.close(); }}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-[24px] bg-white p-0 text-texto open:animate-subir lg:hidden"
      >
        <div className="sticky top-0 z-10 bg-white px-4 pb-2 pt-3">
          <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-slate-200" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{pessoa}</p>
              <p className="truncate text-xs text-suave">{papel} · {loja}</p>
            </div>
            <button type="button" onClick={() => dialogo.current?.close()} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-full text-suave hover:bg-slate-100">
              <X aria-hidden className="size-5" />
            </button>
          </div>
        </div>
        <div className="space-y-4 px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {grupos.map((g) => (
            <section key={g.grupo} aria-label={g.grupo}>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-suave">{g.grupo}</p>
              {g.itens.map((i) => (
                <LinkNavegacao key={i.href} href={i.href} variante="lista" icone={<Icone nome={i.icone} />} emblema={i.emblema}>
                  {i.titulo}
                </LinkNavegacao>
              ))}
            </section>
          ))}
          {rodape ?? (
            <Link href="/demo/perfil" className="flex min-h-12 items-center gap-3 rounded-xl border border-borda px-3 text-[15px] font-medium">
              <RefreshCw aria-hidden className="size-5 text-suave" /> Trocar o perfil da demonstração
            </Link>
          )}
        </div>
      </dialog>
    </>
  );
}
