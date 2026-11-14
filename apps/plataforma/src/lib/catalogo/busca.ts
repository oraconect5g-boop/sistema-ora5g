// Busca de produto igual no catálogo, no estoque e no PDV (revisão de 10/11/2026). Antes eram três
// buscas diferentes: só o catálogo achava pelo nome do produto, e o PDV não achava o segundo IMEI de
// um aparelho com dois chips, que o estoque achava. A busca vai à fonte, antes do limite (REV-038,
// #40), e o termo perde o que o filtro do PostgREST interpretaria como curinga ou separador.
import { FalhaDoServico, type obterSessao } from "../acesso/sessao";

export { filtroDoIdentificador, identificadorDigitado, termoDaBusca } from "./termos";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

const unicos = (lista: readonly string[]) => [...new Set(lista)];

/**
 * Produtos e variações que batem com o termo: nome do produto, nome da variação ou SKU. Quem acha o
 * produto pelo nome leva todas as variações dele. "ativos": catálogo e PDV só mostram o que está à
 * venda; o estoque mostra também variação desativada que ainda tem saldo.
 */
export async function buscarNoCatalogo(supabase: Cliente, termo: string, opcoes: { limite?: number; ativos?: boolean } = {}) {
  const limite = opcoes.limite ?? 200;
  const ativos = opcoes.ativos ?? true;
  if (!termo) return { produtos: [] as string[], variantes: [] as string[], cortada: false };
  const padrao = `%${termo}%`;
  const produtos = supabase.from("produtos").select("id");
  const porSku = supabase.from("variantes").select("id, produto_id");
  const porNome = supabase.from("variantes").select("id, produto_id");
  const [pelosProdutos, pelosSkus, pelosNomes] = await Promise.all([
    (ativos ? produtos.eq("ativo", true) : produtos).ilike("nome", padrao).limit(limite),
    (ativos ? porSku.eq("ativa", true) : porSku).ilike("sku", padrao).limit(limite),
    (ativos ? porNome.eq("ativa", true) : porNome).ilike("nome", padrao).limit(limite),
  ]);
  if (pelosProdutos.error || pelosSkus.error || pelosNomes.error) throw new FalhaDoServico("busca");
  const produtosPeloNome = pelosProdutos.data.map((p) => p.id);
  const dosProdutos = produtosPeloNome.length
    ? await (ativos ? supabase.from("variantes").select("id, produto_id").eq("ativa", true) : supabase.from("variantes").select("id, produto_id"))
      .in("produto_id", produtosPeloNome).limit(limite)
    : { data: [] as { id: string; produto_id: string }[], error: null };
  if (dosProdutos.error) throw new FalhaDoServico("busca_variantes");
  const variantes = [...pelosSkus.data, ...pelosNomes.data, ...dosProdutos.data];
  return {
    produtos: unicos([...produtosPeloNome, ...variantes.map((v) => v.produto_id)]),
    variantes: unicos(variantes.map((v) => v.id)),
    // B5: alguma das buscas chegou ao limite, então pode haver mais resultados do que os devolvidos: a tela pede
    // para refinar, em vez de apresentar a lista como completa.
    cortada: [pelosProdutos.data, pelosSkus.data, pelosNomes.data, dosProdutos.data].some((l) => l.length >= limite),
  };
}
