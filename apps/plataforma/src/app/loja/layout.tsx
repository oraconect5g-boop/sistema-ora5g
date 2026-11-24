import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

import { Marca } from "../../componentes/Marca";
import { COOKIE_DO_CARRINHO, lerCarrinho } from "../../lib/loja/carrinho";

// A loja online (ONLINE-a; ADR-009) é pública: sem o menu da equipe e sem login. Enquanto o proprietário não decide o
// endereço definitivo (D-024), os buscadores não indexam estas páginas.
export const metadata: Metadata = { title: { default: "Loja online", template: "%s · Loja online Ora 5G" }, robots: { index: false, follow: false } };

export default async function LayoutDaLoja({ children }: { children: ReactNode }) {
  // ONLINE-e: quantos itens o carrinho tem, lido do cookie dele (só os identificadores, sem dado pessoal e sem ir ao banco).
  const noCarrinho = lerCarrinho((await cookies()).get(COOKIE_DO_CARRINHO)?.value).itens.length;
  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <header className="sticky top-0 z-20 border-b border-borda bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/loja" aria-label="Loja online da Ora 5G" className="flex items-center gap-2">
            <Marca tamanho="text-xl" />
            <span className="hidden whitespace-nowrap rounded-full bg-acao/10 px-2 py-0.5 text-xs font-semibold text-acao min-[360px]:inline">Loja online</span>
          </Link>
          <nav aria-label="Compra" className="flex items-center gap-5 whitespace-nowrap text-sm">
            <span className="hidden text-suave sm:inline">Escolha no site, retire na loja</span>
            {/* O número fica sobre o canto da palavra (como a bolinha de contagem), para o topo caber num celular de 360 px. */}
            <Link href="/loja/carrinho" aria-label={noCarrinho > 0 ? `Carrinho, ${noCarrinho} ${noCarrinho === 1 ? "item" : "itens"}` : undefined}
              className="relative font-semibold text-acao">
              Carrinho
              {noCarrinho > 0 && (
                <span aria-hidden className="numeros absolute -right-3 -top-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-acao px-1 text-[11px] font-bold leading-none text-white">{noCarrinho}</span>
              )}
            </Link>
            <Link href="/loja/pedido" className="font-semibold text-acao">Meu pedido</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-borda bg-white">
        <div className="mx-auto max-w-6xl space-y-1 px-4 py-5 text-xs text-suave">
          <p>Os preços são os do balcão de cada loja hoje e podem mudar. A retirada é feita na loja.</p>
          <p>Imagens ilustrativas. Ora 5G.</p>
        </div>
      </footer>
    </div>
  );
}
