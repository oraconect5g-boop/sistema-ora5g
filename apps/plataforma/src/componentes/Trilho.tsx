"use client";

import { Menu, PanelLeftClose } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import { iniciais } from "../lib/formato";
import { Icone } from "./Icone";
import { caminhoAtivo, Emblema } from "./LinkNavegacao";
import { SeloMarca } from "./Marca";
import type { ItemNavegacao } from "./NavegacaoCelular";

// Menu lateral do computador (visual de 10/11/2026, prints de referência): trilho escuro e
// arredondado só com ícones; o item ativo vira um círculo azul que "sai" do trilho. Ao passar o mouse
// (ou ao navegar pelo teclado) o trilho abre com os nomes; o botão do topo fixa o menu aberto e o
// conteúdo abre espaço (global.css, html[data-menu="aberto"]). A escolha fica no navegador.

const CHAVE = "ora5g.menu";
const ouvintes = new Set<() => void>();
let memoria = false; // navegação privada sem localStorage: vale até recarregar

function lerFixo(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "aberto";
  } catch {
    return memoria;
  }
}

function gravarFixo(valor: boolean) {
  memoria = valor;
  try {
    localStorage.setItem(CHAVE, valor ? "aberto" : "recolhido");
  } catch {
    // sem armazenamento: fica só na memória desta página
  }
  ouvintes.forEach((avisar) => avisar());
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  return () => {
    ouvintes.delete(avisar);
  };
}

export function Trilho({ inicio, grupos, pessoa, papel, acoes, versao }: {
  inicio: string;
  grupos: readonly { grupo: string; itens: readonly ItemNavegacao[] }[];
  pessoa: string;
  papel: string;
  /** Ações da pessoa no fim do menu aberto (trocar perfil ou loja, senha, sair). */
  acoes?: ReactNode;
  versao: string;
}) {
  const caminho = usePathname();
  const fixo = useSyncExternalStore(assinar, lerFixo, () => false);

  useEffect(() => {
    document.documentElement.dataset.menu = fixo ? "aberto" : "recolhido";
  }, [fixo]);

  return (
    <aside
      aria-label="Menu principal"
      data-fixo={fixo}
      className="trilho nao-imprimir fixed bottom-4 left-4 top-4 z-50 hidden w-[76px] flex-col rounded-[38px] bg-navegacao py-3.5 text-white transition-[width,box-shadow] duration-200 hover:w-[264px] hover:shadow-flutuante has-[:focus-visible]:w-[264px] data-[fixo=true]:w-[264px] lg:flex"
    >
      <div className="flex items-center gap-3 px-3.5">
        <Link href={inicio} aria-label="Início" className="shrink-0 rounded-2xl">
          <SeloMarca />
        </Link>
        <span className="min-w-0 whitespace-nowrap opacity-0 transition-opacity trilho-aberto:opacity-100">
          <span className="block text-[15px] font-extrabold tracking-tight">Ora 5G</span>
          <span className="block text-[11px] font-medium text-white/50">Gestão integrada</span>
        </span>
      </div>

      <button
        type="button"
        onClick={() => gravarFixo(!fixo)}
        aria-pressed={fixo}
        aria-label={fixo ? "Recolher o menu" : "Fixar o menu aberto"}
        className="mx-4 mt-3 flex h-11 shrink-0 items-center gap-3 rounded-full text-sm font-semibold text-white/60 transition-colors hover:text-white trilho-aberto:hover:bg-white/10"
      >
        <span className="grid size-11 shrink-0 place-items-center">
          {fixo ? <PanelLeftClose aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
        </span>
        <span className="truncate opacity-0 transition-opacity trilho-aberto:opacity-100">{fixo ? "Recolher o menu" : "Fixar o menu aberto"}</span>
      </button>

      <nav className="sem-barra -mr-6 mt-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2 pr-6">
        {grupos.map((g, indice) => (
          <div key={g.grupo} role="group" aria-label={g.grupo}>
            {indice > 0 && <div aria-hidden className="mx-auto my-2 h-px w-7 bg-white/15 transition-[width] trilho-aberto:w-[216px]" />}
            <ul className="space-y-1 px-4">
              {g.itens.map((item) => {
                const ativo = caminhoAtivo(caminho, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={ativo ? "page" : undefined}
                      className={`relative flex h-11 items-center gap-3 rounded-full pr-3 text-sm font-semibold transition-colors ${ativo ? "text-white trilho-aberto:bg-acao" : "text-white/60 hover:text-white trilho-aberto:hover:bg-white/10"}`}
                    >
                      <span
                        className={`relative grid size-11 shrink-0 place-items-center rounded-full transition-transform duration-200 ${ativo ? "translate-x-[22px] scale-[1.15] bg-acao ring-[7px] ring-fundo trilho-aberto:translate-x-0 trilho-aberto:scale-100 trilho-aberto:ring-0" : ""}`}
                      >
                        <Icone nome={item.icone} className="size-5" />
                        <Emblema valor={item.emblema} posicao="canto" contorno="ring-navegacao" />
                      </span>
                      <span className="min-w-0 truncate opacity-0 transition-opacity trilho-aberto:opacity-100">{item.titulo}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-1 shrink-0 px-4">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-navegacao-3 text-sm font-bold">{iniciais(pessoa)}</span>
          <span className="min-w-0 opacity-0 transition-opacity trilho-aberto:opacity-100">
            <span className="block truncate text-sm font-semibold">{pessoa}</span>
            <span className="block truncate text-xs text-white/50">{papel}</span>
          </span>
        </div>
        <div className="hidden pt-2 trilho-aberto:block">
          {acoes}
          <p className="numeros px-1 pt-2 text-[11px] text-white/40">{versao}</p>
        </div>
      </div>
    </aside>
  );
}
