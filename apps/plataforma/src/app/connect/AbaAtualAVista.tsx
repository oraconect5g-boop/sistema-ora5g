"use client";

import { useEffect } from "react";

// Lote CONNECT-m: no celular, as 9 abas da Ora Connect rolam de lado; ao abrir uma aba do fim (ex.: Carteira e relatórios), ela
// fica centralizada à vista. Só rola a faixa das abas, nunca a página.
export function AbaAtualAVista({ rotulo }: { rotulo: string }) {
  useEffect(() => {
    const faixa = Array.from(document.querySelectorAll<HTMLElement>("nav[aria-label]")).find((n) => n.getAttribute("aria-label") === rotulo);
    const atual = faixa?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!faixa || !atual || faixa.scrollWidth <= faixa.clientWidth) return;
    const f = faixa.getBoundingClientRect();
    const a = atual.getBoundingClientRect();
    faixa.scrollLeft += a.left - f.left - (f.width - a.width) / 2;
  }, [rotulo]);
  return null;
}
