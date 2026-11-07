import { Ellipsis } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ACESSO, ATALHOS_CELULAR, PAGINAS, PERFIS, type Perfil } from "../demo/perfis";
import { Icone } from "./Icone";
import { LinkNavegacao } from "./LinkNavegacao";

function Marca() {
  return (
    <span className="text-xl font-extrabold tracking-tight">
      ora<span className="text-destaque">5G</span>
    </span>
  );
}

export function AppShell({ perfil, children }: { perfil: Perfil; children: ReactNode }) {
  const paginas = ACESSO[perfil];
  const atalhos = ATALHOS_CELULAR[perfil];
  const demais = paginas.filter((p) => !atalhos.includes(p));
  const dados = PERFIS[perfil];

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-navegacao px-3 py-5 text-white lg:flex" aria-label="Menu principal">
        <div className="px-3 pb-1 text-white"><Marca /></div>
        <p className="px-3 pb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Gestão integrada</p>
        <nav className="flex flex-1 flex-col gap-1">
          {paginas.map((p) => (
            <LinkNavegacao key={p} href={PAGINAS[p].caminho} variante="lateral">
              <Icone nome={PAGINAS[p].icone} />
              {PAGINAS[p].titulo}
            </LinkNavegacao>
          ))}
        </nav>
        <p className="px-3 text-xs text-slate-400">● Ambiente de demonstração</p>
      </aside>

      <div role="status" className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-aviso/95 px-4 py-2 text-sm font-semibold text-navegacao">
        <span>DEMONSTRAÇÃO · dados fictícios · nada é gravado</span>
        <Link href="/demo/perfil" className="underline underline-offset-2">
          Perfil: {dados.nome} (trocar)
        </Link>
      </div>

      <header className="flex items-center justify-between gap-3 border-b border-borda bg-white px-4 py-3 lg:px-8">
        <div className="text-navegacao lg:hidden"><Marca /></div>
        <div className="min-w-0 text-right lg:text-left">
          <p className="truncate text-sm font-semibold">{dados.pessoa}</p>
          <p className="truncate text-xs text-suave">{dados.escopo}</p>
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-6xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10">
        {children}
      </main>

      <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-borda bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {atalhos.map((p) => (
          <LinkNavegacao key={p} href={PAGINAS[p].caminho} variante="inferior">
            <Icone nome={PAGINAS[p].icone} />
            {PAGINAS[p].titulo.split(" ")[0]}
          </LinkNavegacao>
        ))}
        {demais.length > 0 && (
          <details className="relative flex-1">
            <summary className="flex min-h-14 cursor-pointer list-none flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-suave">
              <Ellipsis aria-hidden className="size-5" />
              Mais
            </summary>
            <div className="absolute bottom-16 right-2 w-64 rounded-cartao border border-borda bg-white p-2 shadow-lg">
              {demais.map((p) => (
                <LinkNavegacao key={p} href={PAGINAS[p].caminho} variante="lista">
                  <Icone nome={PAGINAS[p].icone} />
                  {PAGINAS[p].titulo}
                </LinkNavegacao>
              ))}
            </div>
          </details>
        )}
      </nav>
    </div>
  );
}
