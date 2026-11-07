"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export const caminhoAtivo = (caminho: string, href: string) => (href === "/demo" ? caminho === "/demo" : caminho === href || caminho.startsWith(`${href}/`));

function Emblema({ valor, flutuante }: { valor?: number; flutuante: boolean }) {
  if (valor === undefined || valor <= 0) return null;
  return (
    <span
      aria-label={`${valor} pendente${valor === 1 ? "" : "s"}`}
      className={flutuante
        ? "absolute right-[calc(50%-26px)] top-1.5 grid min-w-[18px] place-items-center rounded-full bg-perigo px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-white"
        : "ml-auto grid min-w-5 place-items-center rounded-full bg-perigo px-1.5 text-[11px] font-bold leading-5 text-white"}
    >
      {valor}
    </span>
  );
}

export function LinkNavegacao({ href, icone, children, variante, emblema }: {
  href: string;
  icone: ReactNode;
  children: ReactNode;
  variante: "lateral" | "inferior" | "lista";
  emblema?: number;
}) {
  const ativo = caminhoAtivo(usePathname(), href);

  if (variante === "inferior") {
    return (
      <Link href={href} aria-current={ativo ? "page" : undefined} className={`relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${ativo ? "text-acao" : "text-suave"}`}>
        <span className={`grid h-7 w-14 place-items-center rounded-full transition-colors [&>svg]:size-[22px] ${ativo ? "bg-acao-clara" : ""}`}>{icone}</span>
        <span className="max-w-full truncate px-1">{children}</span>
        <Emblema valor={emblema} flutuante />
      </Link>
    );
  }

  const classe = variante === "lateral"
    ? `group relative flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors ${ativo ? "bg-white/[0.08] text-white" : "text-slate-400 hover:bg-white/[0.05] hover:text-white"}`
    : `flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium ${ativo ? "bg-acao-clara text-acao-escura" : "text-texto hover:bg-slate-50"}`;

  return (
    <Link href={href} aria-current={ativo ? "page" : undefined} className={classe}>
      {variante === "lateral" && ativo && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-destaque" />}
      <span className={variante === "lateral" ? (ativo ? "text-destaque" : "text-slate-500 group-hover:text-slate-300") : ativo ? "text-acao" : "text-suave"}>{icone}</span>
      <span className="min-w-0 truncate">{children}</span>
      <Emblema valor={emblema} flutuante={false} />
    </Link>
  );
}
