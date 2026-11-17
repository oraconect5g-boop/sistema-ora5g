"use client";

import { useLayoutEffect } from "react";

// Âncora no endereço (#lancar, #saidas, #nova…) quando o esqueleto de carregamento aparece no meio do caminho
// (lote VEL-a). Numa navegação sem recarregar, o Next decide a rolagem assim que a tela nova entra. Se o que entrou
// foi o esqueleto (loading.tsx), o elemento da âncora ainda não existe, e o Next dá a rolagem por resolvida sem rolar
// (next/dist/client/components/layout-router.js: "A missing hash target is still a handled scroll intent"). Quando o
// conteúdo chega, a página fica na altura em que a pessoa estava na tela anterior, longe do bloco que o link apontava.
//
// Estas duas peças devolvem a rolagem só nesse caso:
//   - MarcaDeEsqueleto, dentro de todo esqueleto, anota o endereço para o qual ele apareceu;
//   - IrParaAncora, dentro do MoldeReal, rola até a âncora quando a tela real monta nesse mesmo endereço.
//
// Fora dele não fazem nada, de propósito: tela aberta direto ou recarregada (a âncora é do navegador), Voltar e
// Avançar (o navegador devolve a posição) e busca ou filtro na mesma tela (o esqueleto não aparece e o Next rola).

/** Endereço para o qual o esqueleto apareceu por último, com busca e âncora. */
let esqueletoDe: string | null = null;
/** Já houve tela real montada neste documento: dali em diante, esqueleto novo é de navegação sem recarregar. */
let telaJaMontou = false;

const enderecoAtual = () => window.location.pathname + window.location.search + window.location.hash;

/**
 * A decisão, separada para o teste: o id do elemento até onde rolar, ou null quando não é o caso.
 * Só há rolagem quando o esqueleto apareceu para este mesmo endereço e o endereço tem âncora.
 */
export function ancoraDepoisDoEsqueleto(esqueleto: string | null, atual: string): string | null {
  if (esqueleto === null || esqueleto !== atual) return null;
  const corte = atual.indexOf("#");
  if (corte < 0 || corte === atual.length - 1) return null;
  try {
    return decodeURIComponent(atual.slice(corte + 1));
  } catch {
    // % solto no endereço: não há elemento com esse id para achar
    return null;
  }
}

/**
 * O esqueleto apareceu para este endereço. No primeiro carregamento do documento a âncora é do navegador:
 * só anota depois que uma tela real já montou.
 */
export function aoMostrarEsqueleto(endereco: string): void {
  if (telaJaMontou) esqueletoDe = endereco;
}

/** A tela real montou neste endereço: devolve o id até onde rolar (ou null) e esquece o esqueleto anotado. */
export function aoMontarTela(endereco: string): string | null {
  const id = ancoraDepoisDoEsqueleto(esqueletoDe, endereco);
  esqueletoDe = null;
  telaJaMontou = true;
  return id;
}

/** Dentro do esqueleto (loading.tsx): anota o endereço que está carregando. Não desenha nada. */
export function MarcaDeEsqueleto() {
  useLayoutEffect(() => {
    aoMostrarEsqueleto(enderecoAtual());
  }, []);
  return null;
}

/** Dentro do MoldeReal: se o esqueleto apareceu para este endereço, rola até a âncora dele. Não desenha nada. */
export function IrParaAncora() {
  useLayoutEffect(() => {
    const id = aoMontarTela(enderecoAtual());
    if (id !== null) document.getElementById(id)?.scrollIntoView();
  }, []);
  return null;
}
