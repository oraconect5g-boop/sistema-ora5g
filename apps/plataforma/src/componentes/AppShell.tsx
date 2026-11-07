import { FlaskConical, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { LOJAS, nomeDaLoja } from "../demo/dados";
import { ACESSO, ATALHOS_CELULAR, GRUPOS, PAGINAS, PERFIS, REDE, type Pagina } from "../demo/perfis";
import type { ContextoDemo } from "../demo/sessao";
import { Avisos, MenuPerfil, SeletorLoja, type ItemAviso, type OpcaoLoja } from "./BarraSuperior";
import { Icone } from "./Icone";
import { Marca } from "./Marca";
import { LinkNavegacao } from "./LinkNavegacao";
import { NavegacaoCelular, type ItemNavegacao } from "./NavegacaoCelular";

export const nomeDoEscopo = (loja: string) => (loja === REDE ? "Rede inteira (14 lojas)" : nomeDaLoja(loja));

function opcoesDeLoja(contexto: ContextoDemo): OpcaoLoja[] {
  return contexto.lojas.map((codigo) => {
    const loja = LOJAS.find((l) => l.codigo === codigo);
    return {
      codigo,
      nome: codigo === REDE ? "Rede inteira" : nomeDaLoja(codigo),
      detalhe: codigo === REDE ? "Consolidado das 14 lojas" : loja ? `${loja.bairro}${loja.piloto ? " · piloto" : ""}` : undefined,
    };
  });
}

export function AppShell({ contexto, avisos, pendencias, children }: {
  contexto: ContextoDemo;
  avisos: readonly ItemAviso[];
  pendencias: Partial<Record<Pagina, number>>;
  children: ReactNode;
}) {
  const { perfil } = contexto;
  const dados = PERFIS[perfil];
  const paginas = ACESSO[perfil];
  const opcoes = opcoesDeLoja(contexto);
  const atual = opcoes.find((o) => o.codigo === contexto.loja) ?? { codigo: contexto.loja, nome: nomeDoEscopo(contexto.loja) };

  const item = (p: Pagina): ItemNavegacao => ({ href: PAGINAS[p].caminho, titulo: PAGINAS[p].titulo, curto: PAGINAS[p].curto, icone: PAGINAS[p].icone, emblema: pendencias[p] });
  const atalhos = ATALHOS_CELULAR[perfil].filter((p) => paginas.includes(p));
  const grupos = GRUPOS.map((grupo) => ({ grupo, paginas: paginas.filter((p) => PAGINAS[p].grupo === grupo) })).filter((g) => g.paginas.length > 0);
  const gruposDoMais = grupos
    .map((g) => ({ grupo: g.grupo, itens: g.paginas.filter((p) => !atalhos.includes(p)).map(item) }))
    .filter((g) => g.itens.length > 0);

  return (
    <div className="min-h-dvh lg:pl-[17rem]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow-flutuante">
        Pular para o conteúdo
      </a>

      <aside aria-label="Menu principal" className="nao-imprimir fixed inset-y-0 left-0 z-40 hidden w-[17rem] flex-col bg-gradient-to-b from-navegacao to-navegacao-2 text-white lg:flex">
        <div className="flex items-center gap-2.5 px-6 pb-2 pt-6">
          <Marca claro tamanho="text-[26px]" />
        </div>
        <p className="px-6 pb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Gestão integrada</p>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {grupos.map((g) => (
            <div key={g.grupo}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{g.grupo}</p>
              <div className="space-y-0.5">
                {g.paginas.map((p) => (
                  <LinkNavegacao key={p} href={PAGINAS[p].caminho} variante="lateral" icone={<Icone nome={PAGINAS[p].icone} className="size-[18px]" />} emblema={pendencias[p]}>
                    {PAGINAS[p].titulo}
                  </LinkNavegacao>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="m-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-inset ring-white/10">
          <p className="flex items-center gap-2 text-xs font-semibold text-amber-300"><FlaskConical aria-hidden className="size-3.5" /> Ambiente de demonstração</p>
          <p className="mt-1 text-xs text-slate-400">14 lojas · dados fictícios · nada é gravado</p>
          <Link href="/demo/perfil" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-destaque hover:underline">
            <RefreshCw aria-hidden className="size-3.5" /> Trocar perfil ({dados.nome})
          </Link>
        </div>
      </aside>

      <div role="note" aria-label="Aviso de demonstração" className="nao-imprimir sticky top-0 z-40 flex min-h-9 items-center justify-center gap-x-3 border-b border-amber-300/70 bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 px-4 py-1.5 text-xs text-amber-950 lg:justify-between lg:px-8">
        <span className="flex min-w-0 items-center gap-2">
          <FlaskConical aria-hidden className="size-4 shrink-0 text-amber-700" />
          <span><strong className="font-bold uppercase tracking-wide">Demonstração</strong> · dados fictícios · nada é gravado</span>
        </span>
        <Link href="/demo/perfil" className="hidden shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline lg:inline-flex">
          Perfil: {dados.nome} · trocar
        </Link>
      </div>

      <header className="nao-imprimir relative z-30 border-b border-borda bg-white/90 backdrop-blur lg:sticky lg:top-9">
        <div className="mx-auto flex min-h-16 max-w-[1400px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
          <Link href="/demo" aria-label="Início" className="mr-auto shrink-0 lg:hidden"><Marca /></Link>
          <div className="hidden lg:block"><SeletorLoja atual={atual} opcoes={opcoes} /></div>
          <div className="min-w-0 lg:hidden"><SeletorLoja atual={atual} opcoes={opcoes} compacto /></div>
          <div className="hidden flex-1 lg:block" />
          <Avisos itens={avisos} />
          <MenuPerfil pessoa={dados.pessoa} papel={dados.nome} escopo={nomeDoEscopo(contexto.loja)} />
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-12">
        {children}
      </main>

      <NavegacaoCelular atalhos={atalhos.map(item)} grupos={gruposDoMais} pessoa={dados.pessoa} papel={dados.nome} loja={nomeDoEscopo(contexto.loja)} />
    </div>
  );
}
