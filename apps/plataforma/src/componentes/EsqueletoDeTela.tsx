import { MarcaDeEsqueleto } from "./ancora";

/**
 * Esqueleto das telas reais com login (lote VEL-a: ORA-QUAL-010). O Next mostra o loading.tsx da pasta no instante do
 * toque, enquanto o servidor monta a página: quem tocou no menu vê a tela mudar na hora, em vez de segundos parado
 * na tela anterior sem saber se o toque valeu.
 *
 * Tem a forma do molde (MoldeReal): o lugar do menu (trilho no computador, barra embaixo no celular), a faixa do topo
 * e o miolo na largura da tela que vem, para o conteúdo não pular quando chega. Sem número, nome nem dado algum:
 * o esqueleto sai antes de a página ler o banco. A sessão já foi conferida no layout da pasta, acima dele (sem login
 * a resposta é o 307 para /entrar, não o esqueleto).
 *
 * O desenho é enfeite (aria-hidden); quem usa leitor de tela ouve o rótulo, uma vez.
 */
export function EsqueletoDeTela({ rotulo, largura = "max-w-3xl" }: {
  /** O que o leitor de tela anuncia, por exemplo "Carregando o caixa". */
  rotulo: string;
  /** A mesma largura que a tela passa ao MoldeReal. */
  largura?: string;
}) {
  return (
    <>
      <MarcaDeEsqueleto />
      <p role="status" className="sr-only">{rotulo}</p>
      <div aria-hidden className="area-com-trilho min-h-dvh lg:pl-[92px]">
        <div className="nao-imprimir fixed bottom-4 left-4 top-4 z-50 hidden w-[76px] rounded-[38px] bg-navegacao lg:block [html[data-menu=aberto]_&]:w-[264px]" />
        <div className="nao-imprimir fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 h-[68px] rounded-[34px] bg-navegacao shadow-flutuante lg:hidden" />
        <div className="animate-pulse">
          <div className="mx-auto flex min-h-16 max-w-[1400px] items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6 lg:px-8 lg:py-3">
            <div className="mr-auto h-6 w-20 rounded bg-slate-200 lg:hidden" />
            <div className="h-11 w-36 rounded-full bg-slate-200/80" />
            <div className="hidden flex-1 lg:block" />
            <div className="size-11 rounded-full bg-slate-200/80" />
            <div className="size-9 rounded-full bg-slate-200" />
          </div>
          <div className={`mx-auto ${largura} space-y-4 px-4 pb-32 pt-3 sm:px-6 sm:pt-5 lg:pb-10`}>
            <div className="h-4 w-32 rounded bg-slate-200" />
            <div className="h-8 w-56 max-w-full rounded-lg bg-slate-200" />
            <div className="h-11 rounded-full bg-slate-200/80" />
            <div className="h-36 rounded-cartao bg-slate-200/70" />
            <div className="h-64 rounded-cartao bg-slate-200/70" />
          </div>
        </div>
      </div>
    </>
  );
}
