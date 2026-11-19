// A lista do estoque da loja do turno numa ida ao banco (lote VEL-d: ORA-QUAL-010; ADR-010, "O que veio no VEL-d").
// public.estoque_lista traz numa resposta a página (as variações com saldo, em ordem de nome), o total para a paginação e
// as fotos em uso dos produtos da página, com o RLS de quem pede (security invoker). Antes, a lista fazia 4 idas em 4
// rodadas (1,2 s no banco, medido em 19/11 com a conta de teste). O banco sem a função usa as leituras de antes.
import type { obterSessao } from "../acesso/sessao";
import { FalhaDoServico } from "../acesso/sessao";
import type { FotoDaTela } from "../catalogo/tela";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import { booleano, contagem, ehObjeto, inteiro, lista, texto, textoOuNulo } from "../leitura-do-banco";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

export type LinhaDoSaldo = { id: string; nome: string; sku: string; estoque_minimo: number; produto_id: string; quantidade: number; reservado: number };
export type ListaDoEstoque = {
  total: number;
  /** A página mostrada: a pedida, ou a última quando a pedida passa dela. */
  pagina: number;
  linhas: LinhaDoSaldo[];
  /** As fotos em uso dos produtos da página; nulo quando vieram pelas leituras de antes (a tela lê as fotos à parte). */
  fotos: FotoDaTela[] | null;
};

/** Converte a resposta de public.estoque_lista. Forma inesperada é erro (a tela mostra falha, não vazio). */
export function lerListaDoEstoque(dado: unknown): ListaDoEstoque {
  if (!ehObjeto(dado)) throw new RespostaInesperada("estoque_lista");
  const pagina = contagem(dado, "pagina");
  if (pagina < 1) throw new RespostaInesperada("pagina");
  return {
    total: contagem(dado, "total"),
    pagina,
    linhas: lista(dado, "linhas").map((l) => ({
      id: texto(l, "id"), nome: texto(l, "nome"), sku: texto(l, "sku"), estoque_minimo: inteiro(l, "estoque_minimo"), produto_id: texto(l, "produto_id"),
      quantidade: inteiro(l, "quantidade"), reservado: inteiro(l, "reservado"),
    })),
    fotos: lista(dado, "fotos").map((l) => ({
      id: texto(l, "id"), produto_id: texto(l, "produto_id"), variante_id: textoOuNulo(l, "variante_id"), caminho: texto(l, "caminho"), ilustracao: booleano(l, "ilustracao"),
    })),
  };
}

/** A página da lista do estoque da loja do turno (sem busca). Uma ida ao banco; sem a função, as leituras de antes. */
export async function consultarListaDoEstoque(supabase: Cliente, unidade: string, paginaPedida: number, porPagina: number): Promise<ListaDoEstoque> {
  const r = await supabase.rpc("estoque_lista", { p_pagina: paginaPedida, p_por_pagina: porPagina });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return leiturasDeAntes(supabase, unidade, paginaPedida, porPagina);
    throw new FalhaDoServico("estoque_lista");
  }
  try {
    return lerListaDoEstoque(r.data);
  } catch (erro) {
    if (erro instanceof RespostaInesperada || erro instanceof ValorForaDoLimite) throw new FalhaDoServico("estoque_lista");
    throw erro;
  }
}

// As leituras de antes do VEL-d (B5, REV-PLAN-003): o total contado no banco e a página já ordenada pelo nome.
async function leiturasDeAntes(supabase: Cliente, unidade: string, paginaPedida: number, porPagina: number): Promise<ListaDoEstoque> {
  const total = await supabase.from("variantes").select("id, estoque_saldos!inner(variante_id)", { count: "exact", head: true }).eq("estoque_saldos.unidade_id", unidade);
  if (total.error || total.count === null) throw new FalhaDoServico("estoque_saldos");
  const pagina = Math.min(paginaPedida, Math.max(1, Math.ceil(total.count / porPagina)));
  if (total.count === 0) return { total: 0, pagina, linhas: [], fotos: null };
  const de = (pagina - 1) * porPagina;
  const lidas = await supabase.from("variantes").select("id, nome, sku, estoque_minimo, produto_id, estoque_saldos!inner(quantidade, reservado)")
    .eq("estoque_saldos.unidade_id", unidade).order("nome").order("id").range(de, de + porPagina - 1);
  if (lidas.error) throw new FalhaDoServico("estoque_saldos");
  const linhas = lidas.data.map(({ estoque_saldos: saldo, ...v }) => ({ ...v, quantidade: saldo[0]?.quantidade ?? 0, reservado: saldo[0]?.reservado ?? 0 }));
  return { total: total.count, pagina, linhas, fotos: null };
}
