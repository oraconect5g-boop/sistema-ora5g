"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

import { Dialogo } from "../../componentes/Dialogo";

/** Miniatura que amplia ao tocar (sem perder a tela); imagem quebrada não derruba nada. */
export function FotoAmpliavel({ url, rotulo, ilustracao }: { url: string | null; rotulo: string; ilustracao: boolean }) {
  const [aberta, setAberta] = useState(false);
  // A falha vale para a URL que falhou (REV-039, #41): URL assinada nova (depois de recarregar) tenta de novo.
  const [quebradaEm, setQuebradaEm] = useState<string | null>(null);
  const quebrada = url !== null && quebradaEm === url;
  const setQuebrada = () => setQuebradaEm(url);
  if (!url || quebrada) {
    return (
      <span className="grid size-16 shrink-0 place-items-center rounded-xl border border-dashed border-aviso bg-aviso-clara/40 text-center text-[10px] font-semibold leading-tight text-aviso" title={rotulo}>
        <span><ImageOff aria-hidden className="mx-auto size-4" />{url ? "foto indisponível" : "sem foto"}</span>
      </span>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setAberta(true)} className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-borda bg-white" aria-label={`Ampliar a foto de ${rotulo}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage privado */}
        <img src={url} alt={`Foto de ${rotulo}`} className="size-full object-contain" onError={setQuebrada} />
        {ilustracao && <span className="absolute inset-x-0 bottom-0 bg-black/55 text-[9px] text-white">ilustração</span>}
      </button>
      <Dialogo aberto={aberta} aoFechar={() => setAberta(false)} titulo={rotulo} descricao={ilustracao ? "Ilustração (item não físico)." : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage privado */}
        <img src={url} alt={`Foto de ${rotulo}`} className="max-h-[70vh] w-full rounded-xl object-contain" onError={setQuebrada} />
      </Dialogo>
    </>
  );
}
