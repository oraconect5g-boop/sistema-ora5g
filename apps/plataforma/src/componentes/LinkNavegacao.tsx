"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function LinkNavegacao({ href, children, variante }: { href: string; children: ReactNode; variante: "lateral" | "inferior" | "lista" }) {
  const caminho = usePathname();
  const ativo = href === "/demo" ? caminho === "/demo" : caminho.startsWith(href);
  const estilos = {
    lateral: `flex min-h-11 items-center gap-3 rounded-botao px-3 text-sm font-medium ${ativo ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`,
    inferior: `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${ativo ? "text-acao" : "text-suave"}`,
    lista: `flex min-h-11 items-center gap-3 rounded-botao px-3 text-sm font-medium ${ativo ? "bg-fundo text-acao" : "text-texto hover:bg-fundo"}`,
  };
  return (
    <Link href={href} aria-current={ativo ? "page" : undefined} className={estilos[variante]}>
      {children}
    </Link>
  );
}
