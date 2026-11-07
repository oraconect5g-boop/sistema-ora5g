"use client";

import { useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";

// Camada de dicas dos gráficos (hover e foco do teclado). Os gráficos são desenhados no servidor;
// cada marca tem data-dica="Título\nRótulo|Valor\n...". A dica só complementa: os mesmos valores
// estão na tabela de cada gráfico ("Ver dados em tabela"). Texto inserido como texto, nunca HTML.

type Dica = { titulo: string; linhas: [string, string][]; x: number; y: number; alinhamento: "inicio" | "meio" | "fim" };

function lerDica(alvo: Element | null): Omit<Dica, "x" | "y" | "alinhamento"> | null {
  const elemento = alvo?.closest("[data-dica]");
  const bruto = elemento?.getAttribute("data-dica");
  if (!bruto) return null;
  const [titulo = "", ...resto] = bruto.split("\n");
  return { titulo, linhas: resto.map((l) => { const [r = "", v = ""] = l.split("|"); return [r, v]; }) };
}

export function CamadaDicas({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dica, setDica] = useState<Dica | null>(null);

  function posicionar(conteudo: Omit<Dica, "x" | "y" | "alinhamento">, clienteX: number, clienteY: number) {
    const caixa = ref.current?.getBoundingClientRect();
    if (!caixa) return;
    const x = clienteX - caixa.left;
    const proporcao = caixa.width > 0 ? x / caixa.width : 0.5;
    setDica({ ...conteudo, x, y: Math.max(0, clienteY - caixa.top), alinhamento: proporcao < 0.25 ? "inicio" : proporcao > 0.75 ? "fim" : "meio" });
  }

  function aoMover(evento: PointerEvent<HTMLDivElement>) {
    const conteudo = lerDica(evento.target as Element);
    if (!conteudo) return setDica(null);
    posicionar(conteudo, evento.clientX, evento.clientY);
  }

  function aoFocar(evento: FocusEvent<HTMLDivElement>) {
    const conteudo = lerDica(evento.target);
    if (!conteudo) return;
    const marca = evento.target.getBoundingClientRect();
    posicionar(conteudo, marca.left + marca.width / 2, marca.top + Math.min(marca.height / 2, 24));
  }

  const deslocamento = dica?.alinhamento === "inicio" ? "0%" : dica?.alinhamento === "fim" ? "-100%" : "-50%";

  return (
    <div ref={ref} className={`relative ${className}`} onPointerMove={aoMover} onPointerLeave={() => setDica(null)} onFocus={aoFocar} onBlur={() => setDica(null)}>
      {children}
      {dica && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 min-w-36 max-w-64 rounded-xl border border-borda bg-white px-3 py-2 text-xs shadow-flutuante"
          style={{ left: dica.x, top: dica.y, transform: `translate(${deslocamento}, calc(-100% - 12px))` }}
        >
          <p className="font-medium text-suave">{dica.titulo}</p>
          <ul className="mt-1 space-y-0.5">
            {dica.linhas.map(([rotulo, valor]) => (
              <li key={rotulo} className="flex items-baseline justify-between gap-3">
                <span className="text-suave">{rotulo}</span>
                <strong className="numeros text-[13px] text-texto">{valor}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
