"use client";

import { useEffect } from "react";

// Erro dentro da demonstração: o menu continua no lugar e dá para tentar de novo.
export default function ErroDaDemonstracao({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("demonstração: erro inesperado", error.digest ?? "sem código");
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-[20px] border border-red-200 bg-white p-8 text-center shadow-cartao">
      <h1 className="text-xl font-bold tracking-tight">Esta tela teve um problema</h1>
      <p className="mt-2 text-sm text-suave">É uma demonstração: nada foi gravado. Tente de novo ou use o menu para ir a outra tela.</p>
      <button type="button" onClick={reset} className="mt-5 inline-flex min-h-11 items-center rounded-botao bg-acao px-4 text-sm font-semibold text-white hover:bg-acao-escura">Tentar de novo</button>
    </div>
  );
}
