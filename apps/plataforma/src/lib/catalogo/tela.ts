// A tela do Catálogo numa ida ao banco (lote VEL-d: ORA-QUAL-010; ADR-010, "O que veio no VEL-d"). public.catalogo_tela
// traz numa resposta as pendências de foto, os produtos (os achados pela busca, ou todos, até o limite), as variações, as
// fotos em uso e os saldos da loja do turno, com o RLS de quem pede (security invoker). Antes, a tela fazia 9 idas em 8
// rodadas (1,5 s no banco, medido em 19/11 com a conta de teste). O banco sem a função usa as leituras de antes.
import type { obterSessao } from "../acesso/sessao";
import { FalhaDoServico } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import { lerEmPaginas, lerPorIds } from "../leitura-completa";
import { booleano, ehObjeto, inteiro, lista, texto, textoOuNulo, type Linha } from "../leitura-do-banco";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

export type ProdutoDaTela = { id: string; nome: string; tipo: string; organizacao_id: string };
export type VarianteDaTela = { id: string; produto_id: string; sku: string; nome: string; cor: string | null };
export type FotoDaTela = { id: string; produto_id: string; variante_id: string | null; caminho: string; ilustracao: boolean };
export type SaldoDaTela = { variante_id: string; quantidade: number; reservado: number };
export type PendenciaDeFoto = { produto_id: string; variante_id: string | null; sku: string | null; nome: string; motivo: string };
export type TelaDoCatalogo = {
  pendencias: PendenciaDeFoto[];
  /** Na ordem do nome (pt-BR), até o limite. */
  produtos: ProdutoDaTela[];
  /** Há mais produtos do que o limite mostra. */
  mais: boolean;
  variantes: VarianteDaTela[];
  fotos: FotoDaTela[];
  saldos: SaldoDaTela[];
};

const porNome = (a: ProdutoDaTela, b: ProdutoDaTela) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id);
const porSku = (a: VarianteDaTela, b: VarianteDaTela) => a.sku.localeCompare(b.sku) || a.id.localeCompare(b.id);

/** Converte a resposta de public.catalogo_tela. Forma inesperada é erro (a tela mostra falha, não vazio). */
export function lerTelaDoCatalogo(dado: unknown): TelaDoCatalogo {
  if (!ehObjeto(dado)) throw new RespostaInesperada("catalogo_tela");
  const foto = (l: Linha): FotoDaTela => ({
    id: texto(l, "id"), produto_id: texto(l, "produto_id"), variante_id: textoOuNulo(l, "variante_id"), caminho: texto(l, "caminho"), ilustracao: booleano(l, "ilustracao"),
  });
  return {
    pendencias: lista(dado, "pendencias").map((l) => ({
      produto_id: texto(l, "produto_id"), variante_id: textoOuNulo(l, "variante_id"), sku: textoOuNulo(l, "sku"), nome: texto(l, "nome"), motivo: texto(l, "motivo"),
    })),
    produtos: lista(dado, "produtos").map((l) => ({ id: texto(l, "id"), nome: texto(l, "nome"), tipo: texto(l, "tipo"), organizacao_id: texto(l, "organizacao_id") })).sort(porNome),
    mais: booleano(dado, "mais"),
    variantes: lista(dado, "variantes").map((l) => ({ id: texto(l, "id"), produto_id: texto(l, "produto_id"), sku: texto(l, "sku"), nome: texto(l, "nome"), cor: textoOuNulo(l, "cor") })).sort(porSku),
    fotos: lista(dado, "fotos").map(foto),
    saldos: lista(dado, "saldos").map((l) => ({ variante_id: texto(l, "variante_id"), quantidade: inteiro(l, "quantidade"), reservado: inteiro(l, "reservado") })),
  };
}

/**
 * A tela do Catálogo: os produtos achados pela busca (`ids`) ou todos, só os pendentes de foto se pedido, até o limite.
 * Uma ida ao banco; o banco sem a função (migration do VEL-d não aplicada) usa as leituras de antes.
 */
export async function consultarTelaDoCatalogo(
  supabase: Cliente, pedido: { ids: readonly string[] | null; soPendentes: boolean; unidade: string; limite: number },
): Promise<TelaDoCatalogo> {
  const r = await supabase.rpc("catalogo_tela", { p_produtos: pedido.ids ? [...pedido.ids] : (null as unknown as string[]), p_so_pendentes: pedido.soPendentes, p_limite: pedido.limite });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return leiturasDeAntes(supabase, pedido);
    throw new FalhaDoServico("catalogo_tela");
  }
  try {
    return lerTelaDoCatalogo(r.data);
  } catch (erro) {
    if (erro instanceof RespostaInesperada || erro instanceof ValorForaDoLimite) throw new FalhaDoServico("catalogo_tela");
    throw erro;
  }
}

// As leituras de antes do VEL-d (B5, REV-PLAN-003): lotes de ids e páginas, para o teto de linhas da API não cortar nada.
async function leiturasDeAntes(
  supabase: Cliente, pedido: { ids: readonly string[] | null; soPendentes: boolean; unidade: string; limite: number },
): Promise<TelaDoCatalogo> {
  const pendencias = await supabase.rpc("pendencias_de_foto");
  if (pendencias.error) throw new FalhaDoServico("catalogo");
  const pendentesPorProduto = new Set(pendencias.data.map((p) => p.produto_id));
  let ids: string[] | null = pedido.ids ? [...pedido.ids] : null;
  if (pedido.soPendentes) ids = (ids ?? [...pendentesPorProduto]).filter((id) => pendentesPorProduto.has(id));
  const lidos = ids
    ? await lerPorIds(ids, (lote, de, ate) => supabase.from("produtos").select("id, nome, tipo, organizacao_id").eq("ativo", true).in("id", lote).order("id").range(de, ate))
    : await lerEmPaginas((de, ate) => supabase.from("produtos").select("id, nome, tipo, organizacao_id").eq("ativo", true).order("nome").order("id").range(de, ate), pedido.limite);
  if (!lidos.ok || (ids && lidos.mais)) throw new FalhaDoServico("catalogo");
  const ordenados = [...lidos.linhas].sort(porNome);
  const produtos = ordenados.slice(0, pedido.limite);
  const produtoIds = produtos.map((p) => p.id);
  const [variantes, fotos] = await Promise.all([
    lerPorIds(produtoIds, (lote, de, ate) => supabase.from("variantes").select("id, produto_id, sku, nome, cor").eq("ativa", true).in("produto_id", lote).order("sku").order("id").range(de, ate)),
    lerPorIds(produtoIds, (lote, de, ate) => supabase.from("fotos_produto").select("id, produto_id, variante_id, caminho, ilustracao").in("produto_id", lote).is("substituida_em", null).order("id").range(de, ate)),
  ]);
  if (!variantes.ok || variantes.mais || !fotos.ok || fotos.mais) throw new FalhaDoServico("catalogo");
  const saldos = await lerPorIds(variantes.linhas.map((v) => v.id), (lote, de, ate) => supabase.from("estoque_saldos").select("variante_id, quantidade, reservado")
    .eq("unidade_id", pedido.unidade).in("variante_id", lote).order("variante_id").range(de, ate));
  if (!saldos.ok || saldos.mais) throw new FalhaDoServico("catalogo");
  return {
    pendencias: pendencias.data.map((p) => ({ produto_id: p.produto_id, variante_id: p.variante_id, sku: p.sku, nome: p.nome, motivo: p.motivo })),
    produtos, mais: lidos.mais || ordenados.length > pedido.limite,
    variantes: [...variantes.linhas].sort(porSku), fotos: fotos.linhas, saldos: saldos.linhas,
  };
}
