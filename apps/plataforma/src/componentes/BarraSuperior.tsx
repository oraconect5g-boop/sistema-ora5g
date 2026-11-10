"use client";

import { Bell, Check, ChevronDown, LogOut, MapPin, RefreshCw, Store } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { iniciais } from "../lib/formato";
import { MenuSuspenso } from "./MenuSuspenso";

// Peças interativas da barra superior: loja da sessão, avisos e menu do perfil.

export type OpcaoLoja = { codigo: string; nome: string; detalhe?: string };

const linkDaLoja = (codigo: string, voltar: string) => `/demo/loja/usar?l=${encodeURIComponent(codigo)}&voltar=${encodeURIComponent(voltar)}`;

/** Loja atual da sessão. Quem tem um vínculo só vê o nome; quem tem vários escolhe (ADR-002). */
export function SeletorLoja({ atual, opcoes, compacto = false }: { atual: OpcaoLoja; opcoes: readonly OpcaoLoja[]; compacto?: boolean }) {
  const caminho = usePathname();
  const conteudo = (
    <>
      <MapPin aria-hidden className="size-4 shrink-0 text-acao" />
      <span className="min-w-0 text-left">
        {!compacto && <span className="block text-[11px] font-medium leading-3 text-suave">Loja da sessão</span>}
        <span className="block truncate text-sm font-semibold leading-5">{atual.nome}</span>
      </span>
    </>
  );
  const classe = `flex min-h-11 max-w-[14rem] items-center gap-2 rounded-full border border-borda bg-white px-3.5 py-1 ${compacto ? "max-w-[10.5rem]" : ""}`;
  if (opcoes.length <= 1) return <div className={classe} title="Você tem vínculo com uma loja só">{conteudo}</div>;
  return (
    <MenuSuspenso
      rotulo={`Loja da sessão: ${atual.nome}. Trocar de loja`}
      alinhamento={compacto ? "direita" : "esquerda"}
      classeBotao={`${classe} hover:border-borda-forte`}
      botao={<>{conteudo}<ChevronDown aria-hidden className="size-4 shrink-0 text-suave" /></>}
    >
      <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-suave">Trocar de loja</p>
      <p className="px-3 pb-2 text-xs text-suave">Você só vê e opera a loja escolhida.</p>
      <ul className="max-h-[60dvh] overflow-y-auto">
        {opcoes.map((o) => (
          <li key={o.codigo}>
            {/* Link comum (recarrega a página): a loja nova vale para a tela inteira, inclusive o menu. */}
            <a
              href={linkDaLoja(o.codigo, caminho)}
              aria-current={o.codigo === atual.codigo ? "true" : undefined}
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-slate-50"
            >
              <Store aria-hidden className="size-4 shrink-0 text-suave" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{o.nome}</span>
                {o.detalhe && <span className="block truncate text-xs text-suave">{o.detalhe}</span>}
              </span>
              {o.codigo === atual.codigo && <Check aria-hidden className="size-4 shrink-0 text-acao" />}
            </a>
          </li>
        ))}
      </ul>
    </MenuSuspenso>
  );
}

export type ItemAviso = { id: string; titulo: string; detalhe: string; tom: "aviso" | "perigo" | "info"; href: string };

const COR_AVISO = { aviso: "bg-amber-500", perigo: "bg-perigo", info: "bg-info" } as const;

export function Avisos({ itens }: { itens: readonly ItemAviso[] }) {
  return (
    <MenuSuspenso
      rotulo={itens.length > 0 ? `Avisos: ${itens.length}` : "Avisos: nenhum"}
      largura="w-80"
      classeBotao="relative grid size-11 place-items-center rounded-full border border-borda bg-white text-texto hover:border-borda-forte"
      botao={
        <>
          <Bell aria-hidden className="size-5" />
          {itens.length > 0 && <span aria-hidden className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-perigo px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-fundo">{itens.length}</span>}
        </>
      }
    >
      <p className="px-3 pb-2 pt-2 text-sm font-semibold">Avisos de hoje</p>
      {itens.length === 0 ? (
        <p className="px-3 pb-3 text-sm text-suave">Nada pendente por aqui.</p>
      ) : (
        <ul className="max-h-[60dvh] space-y-0.5 overflow-y-auto">
          {itens.map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50">
                <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${COR_AVISO[a.tom]}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-5">{a.titulo}</span>
                  <span className="block text-xs text-suave">{a.detalhe}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MenuSuspenso>
  );
}

export function MenuPerfil({ pessoa, papel, escopo }: { pessoa: string; papel: string; escopo: string }) {
  return (
    <MenuSuspenso
      rotulo={`Perfil: ${pessoa}, ${papel}`}
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
      <div className="flex items-center gap-3 px-3 pb-3 pt-2">
        <span aria-hidden className="grid size-10 place-items-center rounded-full bg-navegacao text-sm font-bold text-white">{iniciais(pessoa)}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{pessoa}</span>
          <span className="block truncate text-xs text-suave">{papel} · {escopo}</span>
        </span>
      </div>
      <div className="border-t border-borda pt-1">
        <Link href="/demo/perfil" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-slate-50">
          <RefreshCw aria-hidden className="size-4 text-suave" /> Trocar o perfil da demonstração
        </Link>
        <Link href="/" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-slate-50">
          <LogOut aria-hidden className="size-4 text-suave" /> Sair da demonstração
        </Link>
      </div>
    </MenuSuspenso>
  );
}
