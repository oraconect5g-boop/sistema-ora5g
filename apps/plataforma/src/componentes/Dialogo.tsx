"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

// Diálogo modal com o <dialog> nativo: prende o foco, fecha com Esc e devolve o foco ao botão.
// Usado para confirmar ações críticas (docs/08: "botões críticos têm confirmação").

export function Dialogo({ aberto, aoFechar, titulo, descricao, children, rodape, largura = "max-w-lg" }: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  children?: ReactNode;
  rodape?: ReactNode;
  largura?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const idDescricao = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      aria-describedby={descricao ? idDescricao : undefined}
      onClose={aoFechar}
      onClick={(evento) => { if (evento.target === ref.current) aoFechar(); }}
      className={`m-auto w-[calc(100%-2rem)] ${largura} rounded-[20px] bg-white p-0 text-texto shadow-flutuante open:animate-surgir`}
    >
      {/* Conteúdo só existe enquanto aberto: nada duplicado nem desatualizado escondido na página. */}
      {aberto && <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={idTitulo} className="text-lg font-bold tracking-tight">{titulo}</h2>
            {descricao && <p id={idDescricao} className="mt-1 text-sm text-suave">{descricao}</p>}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-suave hover:bg-slate-100">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {children && <div className="mt-4">{children}</div>}
        {rodape && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{rodape}</div>}
      </div>}
    </dialog>
  );
}
