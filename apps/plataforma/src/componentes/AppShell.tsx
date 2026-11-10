import { FlaskConical, LogOut, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { LOJAS, nomeDaLoja } from "../demo/dados";
import { ACESSO, ATALHOS_CELULAR, GRUPOS, PAGINAS, PERFIS, REDE, type Pagina } from "../demo/perfis";
import type { ContextoDemo } from "../demo/sessao";
import { Avisos, MenuPerfil, SeletorLoja, type ItemAviso, type OpcaoLoja } from "./BarraSuperior";
import { textoDaVersao } from "../lib/versao";
import { classeDaAcaoDoTrilho } from "./LinkNavegacao";
import { Marca } from "./Marca";
import { NavegacaoCelular, type ItemNavegacao } from "./NavegacaoCelular";
import { RodapeVersao } from "./RodapeVersao";
import { Trilho } from "./Trilho";

export const nomeDoEscopo = (loja: string) => (loja === REDE ? `Rede inteira (${LOJAS.length} lojas)` : nomeDaLoja(loja));

function opcoesDeLoja(contexto: ContextoDemo): OpcaoLoja[] {
  return contexto.lojas.map((codigo) => {
    const loja = LOJAS.find((l) => l.codigo === codigo);
    return {
      codigo,
      nome: codigo === REDE ? "Rede inteira" : nomeDaLoja(codigo),
      detalhe: codigo === REDE ? `Consolidado das ${LOJAS.length} lojas` : loja ? `${loja.bairro}${loja.piloto ? " · piloto" : ""}` : undefined,
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

  const versao = textoDaVersao();

  return (
    <div className="area-com-trilho min-h-dvh lg:pl-[92px]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow-flutuante">
        Pular para o conteúdo
      </a>

      <Trilho
        inicio="/demo"
        grupos={grupos.map((g) => ({ grupo: g.grupo, itens: g.paginas.map(item) }))}
        pessoa={dados.pessoa}
        papel={dados.nome}
        versao={versao}
        acoes={
          <>
            <Link href="/demo/perfil" className={classeDaAcaoDoTrilho}><RefreshCw aria-hidden className="size-4" /> Trocar perfil ({dados.nome})</Link>
            <Link href="/" className={classeDaAcaoDoTrilho}><LogOut aria-hidden className="size-4" /> Sair da demonstração</Link>
            <p className="flex items-center gap-2 px-3 pt-1 text-[11px] font-semibold text-amber-300"><FlaskConical aria-hidden className="size-3.5" /> {LOJAS.length} lojas + DEFEITOS · dados fictícios</p>
          </>
        }
      />

      <div role="note" aria-label="Aviso de demonstração" className="nao-imprimir sticky top-0 z-40 flex min-h-9 items-center justify-center gap-x-3 border-b border-amber-200 bg-amber-50/95 px-4 py-1.5 text-xs text-amber-950 backdrop-blur lg:top-4 lg:mx-8 lg:mt-4 lg:justify-between lg:rounded-2xl lg:border lg:px-5">
        <span className="flex min-w-0 items-center gap-2">
          <FlaskConical aria-hidden className="size-4 shrink-0 text-amber-700" />
          <span><strong className="font-bold uppercase tracking-wide">Demonstração</strong> · dados fictícios · nada é gravado</span>
        </span>
        <Link href="/demo/perfil" className="hidden shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline lg:inline-flex">
          Perfil: {dados.nome} · trocar
        </Link>
      </div>

      <header className="nao-imprimir relative z-30">
        <div className="mx-auto flex min-h-16 max-w-[1400px] items-center gap-2 px-4 pt-2 sm:gap-3 sm:px-6 lg:px-8 lg:pt-4">
          <Link href="/demo" aria-label="Início" className="mr-auto shrink-0 lg:hidden"><Marca tamanho="text-[22px]" /></Link>
          <div className="hidden lg:block"><SeletorLoja atual={atual} opcoes={opcoes} /></div>
          <div className="min-w-0 lg:hidden"><SeletorLoja atual={atual} opcoes={opcoes} compacto /></div>
          <div className="hidden flex-1 lg:block" />
          <Avisos itens={avisos} />
          <MenuPerfil pessoa={dados.pessoa} papel={dados.nome} escopo={nomeDoEscopo(contexto.loja)} />
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-[1400px] px-4 pb-32 pt-3 sm:px-6 sm:pt-5 lg:px-8 lg:pb-10">
        {children}
        <RodapeVersao />
      </main>

      <NavegacaoCelular atalhos={atalhos.map(item)} grupos={gruposDoMais} pessoa={dados.pessoa} papel={dados.nome} loja={nomeDoEscopo(contexto.loja)} versao={versao} />
    </div>
  );
}
