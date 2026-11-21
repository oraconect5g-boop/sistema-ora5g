"use client";

import Link from "next/link";
import { useEffect } from "react";

// Erro inesperado numa tela: mensagem em português e botão para tentar de novo, sem mostrar detalhes técnicos. Os atalhos
// para as telas principais (ROB-a, 21/11): a página de erro não tem o menu, e a "página inicial" pode ser a própria tela que
// falhou (o Início, num momento de banco lento); sem eles, a pessoa ficava presa. Sem pré-carga: o banco pode estar lento.
const ATALHOS = [
  { href: "/vender", rotulo: "Vender" },
  { href: "/vendas", rotulo: "Vendas" },
  { href: "/estoque", rotulo: "Estoque" },
  { href: "/caixa", rotulo: "Caixa" },
] as const;

export default function ErroDaTela({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("tela: erro inesperado", error.digest ?? "sem código");
  }, [error]);
  return (
    <main className="grid min-h-[60dvh] place-items-center px-4 py-10">
      <div className="max-w-md rounded-[20px] border border-borda bg-white p-8 text-center shadow-cartao">
        <h1 className="text-xl font-bold tracking-tight">Algo deu errado nesta tela</h1>
        <p className="mt-2 text-sm text-suave">Nada foi perdido do que já estava salvo. Tente de novo; se continuar, avise o administrador{error.digest ? ` com o código ${error.digest}` : ""}.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="inline-flex min-h-11 items-center rounded-botao bg-acao px-4 text-sm font-semibold text-white hover:bg-acao-escura">Tentar de novo</button>
          <Link href="/" prefetch={false} className="inline-flex min-h-11 items-center rounded-botao border border-borda bg-white px-4 text-sm font-semibold hover:bg-slate-50">Página inicial</Link>
        </div>
        <nav aria-label="Outras telas" className="mt-5 border-t border-borda pt-4">
          <p className="text-xs font-semibold text-suave">Ou vá direto para</p>
          <ul className="mt-2 flex flex-wrap justify-center gap-2">
            {ATALHOS.map((a) => (
              <li key={a.href}><Link href={a.href} prefetch={false} className="inline-flex min-h-10 items-center rounded-full border border-borda px-3.5 text-sm font-semibold text-acao hover:bg-slate-50">{a.rotulo}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
