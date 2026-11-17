import { BellRing, ChevronDown, Clock, KeyRound, LogOut, MapPin, Store } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { sair } from "../app/entrar/acoes";
import { montarMenu, PAGINAS_REAIS, type PaginaReal } from "../lib/acesso/menu";
import type { VinculoDoMolde } from "../lib/acesso/molde";
import { horaDoFimDoTurno, PAPEIS, type Papel, type SituacaoSessao } from "../lib/acesso/regras";
import type { obterSessao } from "../lib/acesso/sessao";
import { iniciais } from "../lib/formato";
import { textoDaVersao } from "../lib/versao";
import { IrParaAncora } from "./ancora";
import { AvisoDeRede } from "./AvisoDeRede";
import { BotaoDeEnvio } from "./BotaoDeEnvio";
import { classeDaAcaoDoTrilho } from "./LinkNavegacao";
import { Marca } from "./Marca";
import { MenuSuspenso } from "./MenuSuspenso";
import { NavegacaoCelular, type ItemNavegacao } from "./NavegacaoCelular";
import { RodapeVersao } from "./RodapeVersao";
import { SinoDePendencias } from "./SinoDePendencias";
import { Trilho } from "./Trilho";

type Sessao = Awaited<ReturnType<typeof obterSessao>>;

// Papel mostrado no topo: o da rede (dono, administrador) ou o desta loja.
function papelNaLoja(vinculos: readonly VinculoDoMolde[], unidade: string) {
  const papel = vinculos.find((v) => v.escopo === "organizacao")?.papel ?? vinculos.find((v) => v.unidade_id === unidade)?.papel;
  return papel && Object.hasOwn(PAPEIS, papel) ? PAPEIS[papel as Papel].nome : "Equipe";
}

const classeDoItemDoMenu = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm hover:bg-slate-50";

/**
 * Molde de todas as telas reais com login (revisão de 10/11/2026): menu lateral no computador,
 * barra inferior no celular, loja do turno e turno no topo, troca de loja, senha e saída sempre no
 * mesmo lugar. Os emblemas mostram o que espera a pessoa (aprovações, notas). Visual azul com trilho
 * e pílula (mesmas peças da demonstração) e a versão no ar no fim da tela.
 *
 * Não vai ao banco (lote VEL-a): as permissões do menu, o nome, os vínculos e as contagens dos emblemas chegam com a
 * sessão (sessao.molde), lidos na mesma ida em que o banco decide a sessão (public.molde_da_sessao).
 */
export function MoldeReal({ sessao, children, largura = "max-w-3xl" }: {
  sessao: Sessao;
  children: ReactNode;
  largura?: string;
}) {
  const { molde } = sessao;
  const situacao = sessao.situacao as SituacaoSessao;
  const unidade = situacao.unidade_id as string;
  const pendencias: Partial<Record<PaginaReal, number>> = { aprovacoes: molde.pendencias.aprovacoes, notas: molde.pendencias.notas };

  const pessoa = molde.nome ?? "Equipe";
  const papel = papelNaLoja(molde.vinculos, unidade);
  const loja = situacao.unidade_nome ?? "Loja";
  const fim = horaDoFimDoTurno(situacao.turno_termina_em);
  const menu = montarMenu(molde.permissoes);
  const item = (p: PaginaReal): ItemNavegacao => ({
    href: PAGINAS_REAIS[p].caminho, titulo: PAGINAS_REAIS[p].titulo, curto: PAGINAS_REAIS[p].curto, icone: PAGINAS_REAIS[p].icone, emblema: pendencias[p],
  });
  const gruposDoMais = menu.grupos
    .map((g) => ({ grupo: g.grupo, itens: g.paginas.filter((p) => !menu.atalhos.includes(p)).map(item) }))
    .filter((g) => g.itens.length > 0);
  const versao = textoDaVersao();
  const acoesDoTrilho = (
    <>
      <Link href="/escolher-loja" className={classeDaAcaoDoTrilho}><Store aria-hidden className="size-4" /> Trocar de loja</Link>
      {/* PWA-b: ligar os avisos no celular fica a um toque, em qualquer tela. */}
      <Link href="/conta/avisos" className={classeDaAcaoDoTrilho}><BellRing aria-hidden className="size-4" /> Avisos no celular</Link>
      <Link href="/conta/senha" className={classeDaAcaoDoTrilho}><KeyRound aria-hidden className="size-4" /> Trocar minha senha</Link>
      <form action={sair}><BotaoDeEnvio className={`${classeDaAcaoDoTrilho} disabled:opacity-60`} enquanto={<><LogOut aria-hidden className="size-4" /> Saindo…</>}><LogOut aria-hidden className="size-4" /> Sair</BotaoDeEnvio></form>
    </>
  );
  const contaESaida = (
    <div className="space-y-1 border-t border-borda pt-2">
      <Link href="/escolher-loja" className={classeDoItemDoMenu}><Store aria-hidden className="size-4 text-suave" /> Trocar de loja</Link>
      <Link href="/conta/avisos" className={classeDoItemDoMenu}><BellRing aria-hidden className="size-4 text-suave" /> Avisos no celular</Link>
      <Link href="/conta/senha" className={classeDoItemDoMenu}><KeyRound aria-hidden className="size-4 text-suave" /> Trocar minha senha</Link>
      <form action={sair}><BotaoDeEnvio className={`${classeDoItemDoMenu} disabled:opacity-60`} enquanto={<><LogOut aria-hidden className="size-4 text-suave" /> Saindo…</>}><LogOut aria-hidden className="size-4 text-suave" /> Sair</BotaoDeEnvio></form>
    </div>
  );

  return (
    <div className="area-com-trilho min-h-dvh lg:pl-[92px]">
      <AvisoDeRede />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow-flutuante">
        Pular para o conteúdo
      </a>

      <Trilho
        inicio="/inicio"
        grupos={menu.grupos.map((g) => ({ grupo: g.grupo, itens: g.paginas.map(item) }))}
        pessoa={pessoa}
        papel={papel}
        versao={versao}
        acoes={acoesDoTrilho}
      />

      <header className="nao-imprimir sticky top-0 z-30 bg-fundo/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1400px] items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6 lg:px-8 lg:py-3">
          <Link href="/inicio" aria-label="Início" className="mr-auto shrink-0 lg:hidden"><Marca tamanho="text-[22px]" /></Link>
          <Link href="/escolher-loja" title="Trocar de loja" className="flex min-h-11 max-w-[14rem] items-center gap-2 rounded-full border border-borda bg-white px-3.5 py-1 hover:border-borda-forte">
            <MapPin aria-hidden className="size-4 shrink-0 text-acao" />
            <span className="min-w-0 text-left">
              <span className="hidden text-[11px] font-medium leading-3 text-suave sm:block">Loja do turno</span>
              <span className="block truncate text-sm font-semibold leading-5">{loja}</span>
            </span>
          </Link>
          {fim && <span className="hidden items-center gap-1 text-xs text-suave sm:flex"><Clock aria-hidden className="size-3.5" /> turno até {fim}</span>}
          <div className="hidden flex-1 lg:block" />
          {/* G6 (REPORT-007): o que espera a pessoa nesta loja, lido depois que a tela abre. */}
          <SinoDePendencias unidade={unidade} usuario={sessao.usuario.id} />
          <MenuSuspenso
            rotulo={`${pessoa}, ${papel}`}
            classeBotao="flex min-h-11 items-center gap-2 rounded-full p-1 pr-2 hover:bg-white"
            botao={
              <>
                <span aria-hidden className="grid size-9 place-items-center rounded-full bg-navegacao text-xs font-bold text-white">{iniciais(pessoa)}</span>
                <span className="hidden min-w-0 text-left xl:block">
                  <span className="block max-w-52 truncate text-sm font-semibold leading-4">{pessoa}</span>
                  <span className="block text-xs text-suave">{papel}</span>
                </span>
                <ChevronDown aria-hidden className="hidden size-4 text-suave xl:block" />
              </>
            }
          >
            <div className="px-3 pb-2 pt-2">
              <span className="block truncate text-sm font-semibold">{pessoa}</span>
              <span className="block truncate text-xs text-suave">{papel} · {loja}{fim ? ` · turno até ${fim}` : ""}</span>
            </div>
            {contaESaida}
          </MenuSuspenso>
        </div>
      </header>

      <main id="conteudo" className={`mx-auto ${largura} space-y-4 px-4 pb-32 pt-3 sm:px-6 sm:pt-5 lg:pb-10`}>
        {children}
        <RodapeVersao />
        {/* Âncora do endereço (#saidas, #lancar…) quando o esqueleto apareceu antes desta tela: ver ancora.tsx. */}
        <IrParaAncora />
      </main>

      <NavegacaoCelular atalhos={menu.atalhos.map(item)} grupos={gruposDoMais} pessoa={pessoa} papel={papel} loja={loja} rodape={contaESaida} versao={versao} />
    </div>
  );
}
