import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Marca } from "../../componentes/Marca";

// A loja online (ONLINE-a; ADR-009) é pública: sem o menu da equipe e sem login. Enquanto o proprietário não decide o
// endereço definitivo (D-024), os buscadores não indexam estas páginas.
export const metadata: Metadata = { title: { default: "Loja online", template: "%s · Loja online Ora 5G" }, robots: { index: false, follow: false } };

export default function LayoutDaLoja({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <header className="sticky top-0 z-20 border-b border-borda bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/loja" aria-label="Loja online da Ora 5G" className="flex items-center gap-2">
            <Marca tamanho="text-xl" />
            <span className="rounded-full bg-acao/10 px-2 py-0.5 text-xs font-semibold text-acao">Loja online</span>
          </Link>
          <nav aria-label="Compra" className="flex items-center gap-3 text-sm">
            <span className="hidden text-suave sm:inline">Escolha no site, retire na loja</span>
            <Link href="/loja/carrinho" className="font-semibold text-acao">Carrinho</Link>
            <Link href="/loja/pedido" className="font-semibold text-acao">Meu pedido</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-borda bg-white">
        <div className="mx-auto max-w-6xl space-y-1 px-4 py-5 text-xs text-suave">
          <p>Os preços são os do balcão de cada loja hoje e podem mudar. A compra e o pagamento são feitos na loja.</p>
          <p>Imagens ilustrativas. Ora 5G.</p>
        </div>
      </footer>
    </div>
  );
}
