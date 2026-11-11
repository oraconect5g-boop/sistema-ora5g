"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, useTransition } from "react";

import { ERROS_DO_CLIENTE, formatarRevelado, type CampoRevelavel } from "../../lib/clientes/regras";
import { revelarDado } from "./acoes";

// Mostra um dado protegido do cliente só quando a pessoa pede (lote L5a). Cada vez que se mostra, o banco
// registra quem viu e qual dado; o valor não vai para o endereço nem fica guardado no aparelho.
export function Revelar({ cliente, campo, mascara }: { cliente: string; campo: CampoRevelavel; mascara: string | null }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, iniciar] = useTransition();
  const mostrar = () => iniciar(async () => {
    const r = await revelarDado(cliente, campo);
    if (r.ok) { setTexto(formatarRevelado(campo, r.valor)); setErro(null); } else setErro(ERROS_DO_CLIENTE[r.erro]);
  });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="numeros">{texto ?? mascara ?? "não informado"}</span>
      {texto === null
        ? (mascara && <button type="button" onClick={mostrar} disabled={buscando} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-acao">
            <Eye aria-hidden className="size-3.5" /> {buscando ? "abrindo" : "mostrar"}
          </button>)
        : <button type="button" onClick={() => setTexto(null)} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-acao"><EyeOff aria-hidden className="size-3.5" /> esconder</button>}
      {erro && <span className="text-xs text-perigo">{erro}</span>}
    </span>
  );
}
