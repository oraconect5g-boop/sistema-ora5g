// Gerador pseudoaleatório com semente fixa: a demonstração mostra SEMPRE os mesmos dados
// fictícios (telas, testes e capturas batem entre si). Nada aqui é dado real.

export function semente(texto: string): number {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** mulberry32: rápido e suficiente para dados de demonstração (não usar para segurança). */
export function gerador(valorInicial: number) {
  let estado = valorInicial >>> 0;
  const proximo = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    proximo,
    entre: (min: number, max: number) => min + Math.floor(proximo() * (max - min + 1)),
    chance: (probabilidade: number) => proximo() < probabilidade,
    escolher: <T,>(lista: readonly T[]): T => {
      const item = lista[Math.floor(proximo() * lista.length)];
      if (item === undefined) throw new RangeError("lista vazia");
      return item;
    },
  };
}

export type Gerador = ReturnType<typeof gerador>;
