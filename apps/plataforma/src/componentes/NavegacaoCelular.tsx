"use client";

import { Ellipsis, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { Icone } from "./Icone";
import { caminhoAtivo, Emblema } from "./LinkNavegacao";

// Barra do celular (visual de 10/11/2026): pílula escura flutuante com até 4 atalhos + "Mais"; o
// atalho ativo ganha o círculo azul. "Mais" abre por baixo uma grade de blocos com todas as telas.
// A lista fecha ao trocar de tela (antes ficava aberta por cima da tela nova), com Esc ou tocando fora.

export type ItemNavegacao = { href: string; titulo: string; curto: string; icone: string; emblema?: number };

export function NavegacaoCelular({ atalhos, grupos, pessoa, papel, loja, rodape, versao }: {
  atalhos: readonly ItemNavegacao[];
  grupos: readonly { grupo: string; itens: readonly ItemNavegacao[] }[];
  pessoa: string;
  papel: string;
  loja: string;
  /** Fim da lista "Mais" (telas reais: trocar de loja, senha e sair). Sem ele, o atalho da demonstração. */
  rodape?: ReactNode;
  /** Versão no ar ("v0.1.0 · commit · build"), no fim da lista "Mais". */
  versao?: string;
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
      <nav
        aria-label="Atalhos"
        className="nao-imprimir fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 flex h-[68px] items-center rounded-[34px] bg-navegacao px-1.5 shadow-flutuante lg:hidden"
      >
        {atalhos.map((a) => {
          const ativo = caminhoAtivo(caminho, a.href);
          return (
            <Link
              key={a.href}
              href={a.href}
              aria-current={ativo ? "page" : undefined}
              className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold ${ativo ? "text-white" : "text-white/60"}`}
            >
              <span className={`relative grid h-8 w-11 place-items-center rounded-full transition-colors [&>svg]:size-[21px] ${ativo ? "bg-acao" : ""}`}>
                <Icone nome={a.icone} />
                <Emblema valor={a.emblema} posicao="canto" contorno="ring-navegacao" />
              </span>
              <span className="max-w-full truncate px-0.5">{a.curto}</span>
            </Link>
          );
        })}
        {grupos.length > 0 && (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => dialogo.current?.showModal()}
            className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold ${maisAtivo ? "text-white" : "text-white/60"}`}
          >
            <span className={`relative grid h-8 w-11 place-items-center rounded-full ${maisAtivo ? "bg-acao" : ""}`}>
              <Ellipsis aria-hidden className="size-[21px]" />
              {pendentesNoMais > 0 && (
                <span aria-label={`${pendentesNoMais} pendentes`} className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-perigo px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-navegacao">
                  {pendentesNoMais}
                </span>
              )}
            </span>
            Mais
          </button>
        )}
      </nav>

      <dialog
        ref={dialogo}
        aria-label="Todas as telas"
        onClick={(evento) => { if (evento.target === dialogo.current) dialogo.current?.close(); }}
        className="m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-[28px] bg-fundo p-0 text-texto open:animate-subir lg:hidden"
      >
        <div className="sticky top-0 z-10 bg-fundo px-4 pb-3 pt-3">
          <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-slate-300" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{pessoa}</p>
              <p className="truncate text-xs text-suave">{papel} · {loja}</p>
            </div>
            <button type="button" onClick={() => dialogo.current?.close()} aria-label="Fechar" className="grid size-11 shrink-0 place-items-center rounded-full border border-borda bg-white text-texto">
              <X aria-hidden className="size-5" />
            </button>
          </div>
        </div>
        <div className="space-y-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {grupos.map((g) => (
            <section key={g.grupo} aria-label={g.grupo}>
              <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-suave">{g.grupo}</p>
              <ul className="grid grid-cols-3 gap-2">
                {g.itens.map((i) => {
                  const ativo = caminhoAtivo(caminho, i.href);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={ativo ? "page" : undefined}
                        className={`relative flex h-full min-h-[92px] flex-col items-center justify-center gap-2 rounded-[20px] border p-2 text-center text-[12.5px] font-semibold leading-tight ${ativo ? "border-acao bg-acao-clara text-acao-escura" : "border-borda bg-white text-texto"}`}
                      >
                        <span className="relative grid size-10 place-items-center rounded-full bg-acao-clara text-acao">
                          <Icone nome={i.icone} />
                          <Emblema valor={i.emblema} posicao="canto" />
                        </span>
                        {i.titulo}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="rounded-[20px] border border-borda bg-white p-2">
            {rodape ?? (
              <Link href="/demo/perfil" className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium">
                <RefreshCw aria-hidden className="size-5 text-suave" /> Trocar o perfil da demonstração
              </Link>
            )}
          </div>
          {versao && <p className="numeros text-center text-[11px] text-suave">ora5G · {versao}</p>}
        </div>
      </dialog>
    </>
  );
}
