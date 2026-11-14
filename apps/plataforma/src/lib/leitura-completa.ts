// Leitura completa abaixo do teto de linhas da API (REV-PLAN-003, lote B5, 14/11/2026).
//
// O PostgREST corta cada resposta no max_rows do projeto (1.000 no padrão do Supabase; o do ora5g-dev não foi
// medido) SEM erro e sem aviso: pedir 5.001 linhas de uma vez devolve no máximo 1.000, e uma lista que devia
// avisar "há mais" sai como se estivesse completa. Aqui:
//   * lerEmPaginas pede em páginas de até LINHAS_POR_PEDIDO (abaixo do teto padrão) e avança pelo que VEIO: um
//     teto ainda menor que a página não corta nada, só gasta mais pedidos. Para na página vazia ou no máximo + 1
//     (o "+ 1" diz se havia mais do que o máximo);
//   * a ordem pedida tem de terminar num campo único (o id): sem isso, a fronteira entre duas páginas pode
//     repetir ou pular linhas;
//   * lerPorIds divide listas grandes de ids em lotes para o filtro `in` (endereço curto) e lê cada lote também
//     em páginas: um lote de produtos pode ter mais de mil variações.
// Uma página que falha faz a leitura inteira falhar: arquivo ou lista pela metade passaria por completo.

export const LINHAS_POR_PEDIDO = 500;
export const IDS_POR_LOTE = 100;

export type ErroDaLeitura = { code?: string; message?: string };
export type Resposta<T> = { data: T[] | null; error: ErroDaLeitura | null };
export type LeituraCompleta<T> = { ok: true; linhas: T[]; mais: boolean } | { ok: false; erro: ErroDaLeitura };

/** Até `maximo` linhas, página a página; `mais` diz se havia além delas. */
export async function lerEmPaginas<T>(
  pedir: (de: number, ate: number) => PromiseLike<Resposta<T>>, maximo: number, porPedido = LINHAS_POR_PEDIDO,
): Promise<LeituraCompleta<T>> {
  const linhas: T[] = [];
  while (linhas.length <= maximo) {
    const de = linhas.length;
    const ate = de + Math.min(porPedido, maximo + 1 - de) - 1;
    const r = await pedir(de, ate);
    if (r.error) {
      if (r.error.code === "PGRST103") break; // pedido além do fim: não há mais linhas
      return { ok: false, erro: r.error };
    }
    const pagina = r.data ?? [];
    if (pagina.length === 0) break;
    if (pagina.length > ate - de + 1) return { ok: false, erro: { code: "pagina_maior_que_o_pedido" } };
    linhas.push(...pagina);
  }
  return { ok: true, linhas: linhas.slice(0, maximo), mais: linhas.length > maximo };
}

/** Os ids sem repetição, em lotes para o filtro `in`. */
export function idsEmLotes(ids: readonly string[], tamanho = IDS_POR_LOTE): string[][] {
  const unicos = [...new Set(ids)];
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += tamanho) lotes.push(unicos.slice(i, i + tamanho));
  return lotes;
}

/** Todas as linhas ligadas a uma lista de ids (variações dos produtos, fotos, saldos...), lote a lote e página a página. */
export async function lerPorIds<T>(
  ids: readonly string[], pedir: (lote: string[], de: number, ate: number) => PromiseLike<Resposta<T>>, maximo = 50_000,
): Promise<LeituraCompleta<T>> {
  const linhas: T[] = [];
  for (const lote of idsEmLotes(ids)) {
    const r = await lerEmPaginas((de, ate) => pedir(lote, de, ate), maximo - linhas.length);
    if (!r.ok) return r;
    linhas.push(...r.linhas);
    if (r.mais) return { ok: true, linhas, mais: true };
  }
  return { ok: true, linhas, mais: false };
}
