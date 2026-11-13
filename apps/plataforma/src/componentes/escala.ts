// Funções puras dos eixos dos gráficos (testáveis sem navegador).

/** O passo "redondo" (1, 2, 2,5, 5 ou 10 vezes uma potência de dez) igual ou logo acima do pedido. */
function passoRedondo(bruto: number): number {
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const fracao = bruto / potencia;
  return (fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 2.5 ? 2.5 : fracao <= 5 ? 5 : 10) * potencia;
}

/** Escala "redonda" para os eixos: 0, 5 mil, 10 mil... */
export function escala(maximo: number, divisoes = 4) {
  if (!(maximo > 0)) return { topo: 1, marcas: [0, 1] };
  const passo = passoRedondo(maximo / divisoes);
  const topo = Math.ceil(maximo / passo) * passo;
  const marcas: number[] = [];
  for (let i = 0; i * passo <= topo + passo / 2; i++) marcas.push(i * passo);
  return { topo, marcas };
}

/**
 * Escala para a série que pode ficar abaixo de zero (a margem de um dia em que a devolução pesou mais
 * que a venda). Sem valor negativo é a mesma de `escala`, com o piso em zero. Com valor negativo, o
 * passo sai da distância inteira entre o menor e o maior, o zero é sempre uma das marcas e o piso desce
 * até a primeira marca que cobre o menor valor.
 */
export function escalaComPiso(minimo: number, maximo: number, divisoes = 4) {
  if (!(minimo < 0)) return { piso: 0, ...escala(maximo, divisoes) };
  const acima = Math.max(0, maximo);
  const passo = passoRedondo((acima - minimo) / divisoes);
  const abaixo = Math.ceil(-minimo / passo);
  const topo = Math.ceil(acima / passo) * passo;
  const marcas: number[] = [];
  for (let i = -abaixo; i * passo <= topo + passo / 2; i++) marcas.push(i === 0 ? 0 : i * passo);
  return { piso: -abaixo * passo, topo, marcas };
}

/**
 * Trechos seguidos de uma série em que há valor, cada ponto com o índice dele no eixo. Onde falta valor
 * (`null`: dia sem venda no ticket médio) a linha se interrompe, em vez de descer a zero.
 */
export function trechosComValor(valores: readonly (number | null | undefined)[]): { indice: number; valor: number }[][] {
  const trechos: { indice: number; valor: number }[][] = [];
  let aberto: { indice: number; valor: number }[] | null = null;
  for (const [indice, valor] of valores.entries()) {
    if (valor === null || valor === undefined) {
      aberto = null;
      continue;
    }
    if (!aberto) {
      aberto = [];
      trechos.push(aberto);
    }
    aberto.push({ indice, valor });
  }
  return trechos;
}

/** Mostra 1 rótulo a cada `cada`, sempre o último, e esconde o vizinho do último para não encostarem. */
export const mostrarRotulo = (i: number, total: number, cada: number) =>
  i === total - 1 || (i % cada === 0 && (cada === 1 || total - 1 - i >= Math.max(2, Math.ceil(cada / 2) + 1)));


// Largura, em px, de cada caractere dos rótulos de eixo: texto de 11px na fonte da interface, medida
// no navegador em 12/11/2026 (os algarismos não têm a mesma largura: "08/08" ocupa 39px e "11/11", 21px).
// Serve para decidir o que cabe, não para desenhar; o que não está na lista conta pelo padrão.
const LARGURA_PADRAO = 8;
const LARGURA_DE = new Map<string, number>();
for (const [largura, caracteres] of [
  [3, " .,:;'ijlI"],
  [4, "1frtJ"],
  [5, "/-xT"],
  [6, "47ksvyzFL"],
  [7, "23569acehnuáàâãéêíóôõúçAEKVXY"],
  [9, "0wCM"],
  [10, "GOQ"],
  [11, "mW"],
] as const) {
  for (const caractere of caracteres) LARGURA_DE.set(caractere, largura);
}

/** Largura aproximada de um rótulo de eixo, em px. */
export function larguraDoRotulo(texto: string): number {
  let soma = 0;
  for (const caractere of texto) soma += LARGURA_DE.get(caractere) ?? LARGURA_PADRAO;
  return soma;
}

/** Espaço mínimo, em px, entre dois rótulos vizinhos do eixo. */
export const FOLGA_DOS_ROTULOS = 6;

/**
 * Onde cada rótulo se prende: nos pontos de uma linha (o primeiro começa na borda esquerda e o último
 * termina na direita) ou no meio de cada coluna.
 */
export type EncaixeDosRotulos = "pontos" | "colunas";

/** Âncora de cada rótulo (fração da largura do gráfico) e quanto o texto avança para cada lado dela. */
export function formaDosRotulos(rotulos: readonly string[], encaixe: EncaixeDosRotulos) {
  const total = rotulos.length;
  return rotulos.map((texto, i) => {
    const largura = larguraDoRotulo(texto);
    const meio = { antes: largura / 2, depois: largura / 2 };
    if (encaixe === "colunas") return { ancora: (i + 0.5) / total, ...meio };
    if (total <= 1) return { ancora: 0.5, ...meio };
    if (i === 0) return { ancora: 0, antes: 0, depois: largura };
    if (i === total - 1) return { ancora: 1, antes: largura, depois: 0 };
    return { ancora: i / (total - 1), ...meio };
  });
}

/**
 * Largura mínima do gráfico, em px, para cada rótulo do eixo X aparecer sem encostar no vizinho.
 * `null`: o rótulo nunca aparece (não é um dos "1 a cada `cada`"); 0: aparece sempre (é o último).
 *
 * O celular tem um terço da largura do computador: os mesmos rótulos que cabem na tela grande se
 * sobrepõem na pequena. Em vez de medir no navegador, a conta é feita aqui: o conjunto de `mostrarRotulo`
 * é o mais cheio; os mais ralos saem dobrando o passo (1 a cada 2, 4, 8...), de modo que quem aparece
 * numa largura continua aparecendo nas maiores. Cada rótulo precisa de duas coisas: que caibam, com
 * folga, todos os do passo mais ralo a que ele pertence; e que ele mesmo não encoste no último, que
 * fica sempre à vista e nem sempre cai no passo.
 */
export function larguraMinimaDosRotulos(rotulos: readonly string[], cada: number, encaixe: EncaixeDosRotulos = "pontos"): (number | null)[] {
  const total = rotulos.length;
  const base = Math.max(1, Math.floor(cada));
  const formas = formaDosRotulos(rotulos, encaixe);
  const ultima = formas.at(-1);
  if (!ultima) return [];
  type Forma = typeof ultima;
  const paraCaber = (a: Forma, b: Forma) => (a.depois + b.antes + FOLGA_DOS_ROTULOS) / (b.ancora - a.ancora);
  const candidato = (i: number) => mostrarRotulo(i, total, base);

  // Do passo pedido ao mais ralo: a largura em que todos os rótulos daquele passo cabem lado a lado.
  const niveis: { passo: number; exigida: number }[] = [];
  for (let passo = base; ; passo *= 2) {
    let exigida = 0;
    let anterior: Forma | null = null;
    for (const [i, forma] of formas.entries()) {
      if (i % passo !== 0 || !candidato(i)) continue;
      if (anterior) exigida = Math.max(exigida, paraCaber(anterior, forma));
      anterior = forma;
    }
    niveis.push({ passo, exigida });
    if (passo >= total - 1) break;
  }

  return formas.map((forma, i) => {
    if (!candidato(i)) return null;
    if (i === total - 1) return 0;
    // Quanto mais ralo o passo, menos largura ele pede: vale o mais ralo a que o rótulo pertence.
    const doPasso = Math.min(...niveis.filter((nivel) => i % nivel.passo === 0).map((nivel) => nivel.exigida));
    return Math.ceil(Math.max(doPasso, paraCaber(forma, ultima)));
  });
}

/** Rótulos à vista num gráfico com `largura` px (os índices, em ordem). */
export function rotulosVisiveis(minimos: readonly (number | null)[], largura: number): number[] {
  return minimos.flatMap((minimo, i) => (minimo !== null && minimo <= largura ? [i] : []));
}
