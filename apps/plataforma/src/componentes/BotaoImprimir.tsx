"use client";

import { Printer } from "lucide-react";

import { classeBotao } from "./ui";

// "Imprimir ou salvar em PDF" (lote L8d: ORA-FIN-009): abre a janela de impressão do navegador, onde
// também se escolhe "Salvar como PDF". Antes, abre as tabelas dos gráficos (details com data-imprimir)
// para elas saírem no papel; depois da impressão, fecha de novo as que estavam fechadas. Menus, filtros
// e formulários não saem (classe nao-imprimir, em global.css).
export function BotaoImprimir({ rotulo = "Imprimir ou salvar em PDF" }: { rotulo?: string }) {
  function imprimir() {
    const fechadas = [...document.querySelectorAll<HTMLDetailsElement>("main details[data-imprimir]:not([open])")];
    for (const d of fechadas) d.open = true;
    const voltar = () => {
      for (const d of fechadas) d.open = false;
      window.removeEventListener("afterprint", voltar);
    };
    window.addEventListener("afterprint", voltar);
    window.print();
  }
  return (
    <button type="button" onClick={imprimir} className={classeBotao("secundario", "md", "nao-imprimir")}>
      <Printer aria-hidden className="size-4" /> {rotulo}
    </button>
  );
}

/** Linha que só aparece no papel: de onde e quando saiu o relatório. */
export function CarimboDaImpressao({ texto }: { texto: string }) {
  return <p className="hidden text-xs text-suave print:block">{texto}</p>;
}
