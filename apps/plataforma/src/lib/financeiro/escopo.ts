// Escopo do financeiro real (#65): a loja do turno vem primeiro. Consolidar a rede só para quem vê as
// vendas de todas as lojas (venda.ver_todas); o gerente fica sempre na loja do turno. O banco confere
// de novo (RLS): pedir uma loja alheia devolve zero, nunca os números dela.
export type LojaDoFiltro = { id: string; nome: string };
export type Escopo = { unidade: string | null; nome: string; chave: string };

export function escolherEscopo(parametro: string | undefined, lojas: readonly LojaDoFiltro[], turno: LojaDoFiltro, daRede: boolean): Escopo {
  const doTurno = { unidade: turno.id, nome: turno.nome, chave: turno.id };
  if (!daRede) return doTurno;
  if (parametro === "rede") return { unidade: null, nome: "Rede inteira", chave: "rede" };
  const loja = lojas.find((l) => l.id === parametro);
  return loja ? { unidade: loja.id, nome: loja.nome, chave: loja.id } : doTurno;
}

/** Opções do filtro de loja: a do turno, as demais em ordem e, por último, a rede inteira. */
export function opcoesDeLoja(lojas: readonly LojaDoFiltro[], turno: LojaDoFiltro): LojaDoFiltro[] {
  const outras = lojas.filter((l) => l.id !== turno.id).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return [turno, ...outras, { id: "rede", nome: "Rede inteira" }];
}
