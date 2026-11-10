// Peças comuns da navegação (menu lateral, barra do celular e lista "Mais").

export const caminhoAtivo = (caminho: string, href: string) =>
  href === "/demo" || href === "/inicio" ? caminho === href : caminho === href || caminho.startsWith(`${href}/`);

/** Contagem do que espera a pessoa (ex.: aprovações). O nome acessível diz "N pendentes". */
export function Emblema({ valor, posicao, contorno = "ring-white" }: { valor?: number; posicao: "canto" | "linha"; contorno?: string }) {
  if (valor === undefined || valor <= 0) return null;
  return (
    <span
      aria-label={`${valor} pendente${valor === 1 ? "" : "s"}`}
      className={posicao === "canto"
        ? `absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-perigo px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ${contorno}`
        : "ml-auto grid min-w-5 place-items-center rounded-full bg-perigo px-1.5 text-[11px] font-bold leading-5 text-white"}
    >
      {valor}
    </span>
  );
}

/** Linha de ação no fim do menu lateral aberto (link ou botão de formulário; Trilho.tsx). */
export const classeDaAcaoDoTrilho = "flex min-h-10 w-full items-center gap-3 rounded-full px-3 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white";
