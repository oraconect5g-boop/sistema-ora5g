import { ChevronDown, Clock, KeyRound, LogOut, MapPin, Store } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { sair } from "../app/entrar/acoes";
import { montarMenu, PAGINAS_REAIS, PERMISSOES_DO_MENU, type PaginaReal } from "../lib/acesso/menu";
import { horaDoFimDoTurno, PAPEIS, type Papel, type SituacaoSessao } from "../lib/acesso/regras";
import { FalhaDoServico, type obterSessao } from "../lib/acesso/sessao";
import { iniciais } from "../lib/formato";
import { Icone } from "./Icone";
import { LinkNavegacao } from "./LinkNavegacao";
import { Marca } from "./Marca";
import { MenuSuspenso } from "./MenuSuspenso";
import { NavegacaoCelular, type ItemNavegacao } from "./NavegacaoCelular";

type Sessao = Awaited<ReturnType<typeof obterSessao>>;
type Cliente = Sessao["supabase"];

// Permissões que montam o menu, conferidas no banco na loja do turno (equipe vale para a rede).
export async function permissoesDoMenu(supabase: Cliente, unidade: string): Promise<Set<string>> {
  const respostas = await Promise.all(PERMISSOES_DO_MENU.map((p) =>
    supabase.rpc("tem_permissao", p === "usuarios.gerir" ? { p_permissao: p } : { p_permissao: p, p_unidade: unidade })));
  if (respostas.some((r) => r.error)) throw new FalhaDoServico("menu");
  return new Set(PERMISSOES_DO_MENU.filter((_, i) => respostas[i]?.data === true));
}

// Papel mostrado no topo: o da rede (dono, administrador) ou o desta loja.
function papelNaLoja(vinculos: { papel: string; escopo: string; unidade_id: string | null }[], unidade: string) {
  const papel = vinculos.find((v) => v.escopo === "organizacao")?.papel ?? vinculos.find((v) => v.unidade_id === unidade)?.papel;
  return papel && Object.hasOwn(PAPEIS, papel) ? PAPEIS[papel as Papel].nome : "Equipe";
}

const classeDoItemDoMenu = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm hover:bg-slate-50";

/**
 * Molde de todas as telas reais com login (revisão de 10/11/2026): menu lateral no computador,
 * barra inferior no celular, loja do turno e turno no topo, troca de loja, senha e saída sempre no
 * mesmo lugar. Os emblemas mostram o que espera a pessoa (aprovações, notas).
 */
export async function MoldeReal({ sessao, children, largura = "max-w-3xl", permissoes: jaConferidas }: {
  sessao: Sessao;
  children: ReactNode;
  largura?: string;
  /** Quando a tela já conferiu as permissões do menu (o início), não pergunta de novo ao banco. */
  permissoes?: ReadonlySet<string>;
}) {
  const { supabase, usuario } = sessao;
  const situacao = sessao.situacao as SituacaoSessao;
  const unidade = situacao.unidade_id as string;
  const [permissoes, perfil, vinculos] = await Promise.all([
    jaConferidas ?? permissoesDoMenu(supabase, unidade),
    supabase.from("perfis_usuario").select("nome").eq("id", usuario.id).maybeSingle(),
    supabase.from("vinculos").select("papel, escopo, unidade_id").eq("usuario_id", usuario.id).is("fim", null),
  ]);
  if (perfil.error || vinculos.error) throw new FalhaDoServico("molde");
  const [aprovacoes, notas] = await Promise.all([
    permissoes.has("desconto.aprovar")
      ? supabase.from("aprovacoes_desconto").select("id", { count: "exact", head: true }).eq("unidade_id", unidade).eq("situacao", "pendente")
      : Promise.resolve({ count: 0, error: null }),
    permissoes.has("nota.aprovar")
      ? supabase.from("notas_pedidos").select("id", { count: "exact", head: true }).eq("unidade_id", unidade).in("situacao", ["aguardando_aprovacao", "aprovada"])
      : Promise.resolve({ count: 0, error: null }),
  ]);
  if (aprovacoes.error || notas.error) throw new FalhaDoServico("molde_pendencias");
  const pendencias: Partial<Record<PaginaReal, number>> = { aprovacoes: aprovacoes.count ?? 0, notas: notas.count ?? 0 };

  const pessoa = perfil.data?.nome ?? "Equipe";
  const papel = papelNaLoja(vinculos.data, unidade);
  const loja = situacao.unidade_nome ?? "Loja";
  const fim = horaDoFimDoTurno(situacao.turno_termina_em);
  const menu = montarMenu(permissoes);
  const item = (p: PaginaReal): ItemNavegacao => ({
    href: PAGINAS_REAIS[p].caminho, titulo: PAGINAS_REAIS[p].titulo, curto: PAGINAS_REAIS[p].curto, icone: PAGINAS_REAIS[p].icone, emblema: pendencias[p],
  });
  const gruposDoMais = menu.grupos
    .map((g) => ({ grupo: g.grupo, itens: g.paginas.filter((p) => !menu.atalhos.includes(p)).map(item) }))
    .filter((g) => g.itens.length > 0);
  const contaESaida = (
    <div className="space-y-1 border-t border-borda pt-2">
      <Link href="/escolher-loja" className={classeDoItemDoMenu}><Store aria-hidden className="size-4 text-suave" /> Trocar de loja</Link>
      <Link href="/conta/senha" className={classeDoItemDoMenu}><KeyRound aria-hidden className="size-4 text-suave" /> Trocar minha senha</Link>
      <form action={sair}><button type="submit" className={classeDoItemDoMenu}><LogOut aria-hidden className="size-4 text-suave" /> Sair</button></form>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-[17rem]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow-flutuante">
        Pular para o conteúdo
      </a>

      <aside aria-label="Menu principal" className="nao-imprimir fixed inset-y-0 left-0 z-40 hidden w-[17rem] flex-col bg-gradient-to-b from-navegacao to-navegacao-2 text-white lg:flex">
        <Link href="/inicio" className="px-6 pb-2 pt-6"><Marca claro tamanho="text-[26px]" /></Link>
        <p className="px-6 pb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Gestão integrada</p>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {menu.grupos.map((g) => (
            <div key={g.grupo}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{g.grupo}</p>
              <div className="space-y-0.5">
                {g.paginas.map((p) => (
                  <LinkNavegacao key={p} href={PAGINAS_REAIS[p].caminho} variante="lateral" icone={<Icone nome={PAGINAS_REAIS[p].icone} className="size-[18px]" />} emblema={pendencias[p]}>
                    {PAGINAS_REAIS[p].titulo}
                  </LinkNavegacao>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <header className="nao-imprimir sticky top-0 z-30 border-b border-borda bg-white/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1400px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
          <Link href="/inicio" aria-label="Início" className="mr-auto shrink-0 lg:hidden"><Marca /></Link>
          <Link href="/escolher-loja" title="Trocar de loja" className="flex min-h-10 max-w-[13rem] items-center gap-2 rounded-xl border border-borda bg-white px-3 py-1 shadow-sm hover:border-borda-forte">
            <MapPin aria-hidden className="size-4 shrink-0 text-acao" />
            <span className="min-w-0 text-left">
              <span className="hidden text-[11px] font-medium leading-3 text-suave sm:block">Loja do turno</span>
              <span className="block truncate text-sm font-semibold leading-5">{loja}</span>
            </span>
          </Link>
          {fim && <span className="hidden items-center gap-1 text-xs text-suave sm:flex"><Clock aria-hidden className="size-3.5" /> turno até {fim}</span>}
          <div className="hidden flex-1 lg:block" />
          <MenuSuspenso
            rotulo={`${pessoa}, ${papel}`}
            classeBotao="flex min-h-10 items-center gap-2 rounded-xl p-1 pr-2 hover:bg-slate-100"
            botao={
              <>
                <span aria-hidden className="grid size-8 place-items-center rounded-full bg-navegacao text-xs font-bold text-white">{iniciais(pessoa)}</span>
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

      <main id="conteudo" className={`mx-auto ${largura} space-y-4 px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:pb-12`}>
        {children}
      </main>

      <NavegacaoCelular atalhos={menu.atalhos.map(item)} grupos={gruposDoMais} pessoa={pessoa} papel={papel} loja={loja} rodape={contaESaida} />
    </div>
  );
}
