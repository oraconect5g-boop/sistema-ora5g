"use client";

import Link from "next/link";
import { useEffect } from "react";

// Erro inesperado numa tela: mensagem em português e botão para tentar de novo, sem mostrar detalhes técnicos.
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
          <Link href="/" className="inline-flex min-h-11 items-center rounded-botao border border-borda bg-white px-4 text-sm font-semibold hover:bg-slate-50">Página inicial</Link>
        </div>
      </div>
    </main>
  );
}
