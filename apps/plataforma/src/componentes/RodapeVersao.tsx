import { textoDaVersao } from "../lib/versao";

/** Versão no ar no fim de cada tela: "ora5G · v0.1.0 · <commit> · build <data e hora>". */
export function RodapeVersao({ className = "mt-10" }: { className?: string }) {
  return <p className={`numeros text-center text-[11px] text-suave lg:text-left ${className}`}>ora5G · {textoDaVersao()}</p>;
}
