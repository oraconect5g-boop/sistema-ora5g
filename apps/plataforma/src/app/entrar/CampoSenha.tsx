"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

/** Senha com botão para ver o que foi digitado (ajuda no celular). */
export function CampoSenha({ classe }: { classe: string }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative mt-1">
      <input id="senha" name="senha" type={visivel ? "text" : "password"} autoComplete="current-password" required className={`${classe} pr-12`} />
      <button type="button" onClick={() => setVisivel(!visivel)} aria-label={visivel ? "Ocultar a senha" : "Mostrar a senha"} aria-pressed={visivel} className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-suave hover:bg-slate-100 hover:text-texto">
        {visivel ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
      </button>
    </div>
  );
}
