"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// Menu que abre abaixo de um botão (padrão "disclosure": botão + painel de links).
// Fecha com Esc, com clique fora ou ao escolher um item.

export function MenuSuspenso({ rotulo, botao, children, alinhamento = "direita", largura = "w-72", classeBotao = "" }: {
  rotulo: string;
  botao: ReactNode;
  children: ReactNode;
  alinhamento?: "direita" | "esquerda";
  largura?: string;
  classeBotao?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (evento: PointerEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) setAberto(false);
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        setAberto(false);
        botaoRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className="relative">
      <button
        ref={botaoRef}
        type="button"
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((a) => !a)}
        className={classeBotao}
      >
        {botao}
      </button>
      <div
        id={id}
        hidden={!aberto}
        onClick={(evento) => { if ((evento.target as Element).closest("a,[data-fecha-menu]")) setAberto(false); }}
        className={`absolute top-full z-50 mt-2 ${largura} max-w-[calc(100vw-1.5rem)] animate-surgir rounded-2xl border border-borda bg-white p-2 text-texto shadow-flutuante max-sm:fixed max-sm:inset-x-3 max-sm:top-[6.75rem] max-sm:mt-0 max-sm:w-auto max-sm:max-w-none ${alinhamento === "direita" ? "right-0" : "left-0"}`}
      >
        {children}
      </div>
    </div>
  );
}
