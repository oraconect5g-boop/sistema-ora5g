"use client";

import type { ReactNode } from "react";

// Se o vendedor digitou um e-mail inválido e fechou os detalhes, reabra antes de o navegador focar o campo.
export function IdentificarCliente({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-xl border border-borda px-3 py-1" onInvalidCapture={(e) => { e.currentTarget.open = true; }}>
      <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-acao">Identificar cliente (opcional)</summary>
      <div className="space-y-2 pb-2">{children}</div>
    </details>
  );
}
