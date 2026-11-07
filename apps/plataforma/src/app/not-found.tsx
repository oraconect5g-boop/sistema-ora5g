import type { Metadata } from "next";

import { Marca } from "../componentes/Marca";
import { BotaoLink } from "../componentes/ui";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function NaoEncontrada() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="max-w-md text-center">
        <Marca tamanho="text-2xl" />
        <p className="mt-8 text-6xl font-bold tracking-tight text-acao">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Página não encontrada</h1>
        <p className="mt-2 text-suave">O endereço pode ter sido digitado errado ou a página não existe neste ambiente.</p>
        <BotaoLink href="/" className="mt-6">Ir para a página inicial</BotaoLink>
      </div>
    </main>
  );
}
