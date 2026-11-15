// Busca de produto igual no catálogo, no estoque e no PDV (revisão de 10/11/2026). Antes eram três
// buscas diferentes: só o catálogo achava pelo nome do produto, e o PDV não achava o segundo IMEI de
// um aparelho com dois chips, que o estoque achava. A busca vai à fonte, antes do limite (REV-038,
// #40), e o termo perde o que o filtro do PostgREST interpretaria como curinga ou separador.
import { FalhaDoServico, type obterSessao } from "../acesso/sessao";
import { SEM_TABELA } from "./codigos";

export { filtroDoIdentificador, identificadorDigitado, termoDaBusca } from "./termos";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

const unicos = (lista: readonly string[]) => [...new Set(lista)];

/** CAT-006: 4 a 14 dígitos (espaço, ponto e hífen ignorados) também buscam o código de barras e o final do IMEI. */
export function digitosParaBusca(termo: string): string | null {
  const digitos = termo.replace(/[\s.\-]/g, "");
  return /^\d{4,14}$/.test(digitos) ? digitos : null;
}

/**
 * Produtos e variações que batem com o termo: nome do produto, nome da marca (traz os produtos dela), nome da
 * variação, SKU, o código ativo da variação em outro canal (o da Rein, o do anúncio; CAT-009) e, com 4 a 14
 * dígitos, o código de barras e o final do IMEI (ou do segundo IMEI) de um aparelho em estoque (CAT-006; o IMEI
 * inteiro, com 15 dígitos, continua na busca exata de cada tela). Quem acha o produto pelo nome ou pela marca
 * leva todas as variações dele. "ativos": catálogo e PDV só mostram o que está à venda; o estoque mostra também
 * variação desativada que ainda tem saldo. Num banco sem a tabela dos códigos, a busca segue sem eles.
 */
export async function buscarNoCatalogo(supabase: Cliente, termo: string, opcoes: { limite?: number; ativos?: boolean } = {}) {
  const limite = opcoes.limite ?? 200;
  const ativos = opcoes.ativos ?? true;
  if (!termo) return { produtos: [] as string[], variantes: [] as string[], cortada: false };
  const padrao = `%${termo}%`;
  const digitos = digitosParaBusca(termo);
  const produtos = supabase.from("produtos").select("id");
  const porSku = supabase.from("variantes").select("id, produto_id");
  const porNome = supabase.from("variantes").select("id, produto_id");
  const porCodigoDeBarras = supabase.from("variantes").select("id, produto_id");
  const nenhum = { data: [] as { id: string; produto_id: string }[], error: null };
  const nenhumItem = { data: [] as { variante_id: string }[], error: null };
  const [pelosProdutos, pelosSkus, pelosNomes, pelosCodigos, pelasMarcas, pelosCodigosDeBarras, pelosImeis] = await Promise.all([
    (ativos ? produtos.eq("ativo", true) : produtos).ilike("nome", padrao).limit(limite),
    (ativos ? porSku.eq("ativa", true) : porSku).ilike("sku", padrao).limit(limite),
    (ativos ? porNome.eq("ativa", true) : porNome).ilike("nome", padrao).limit(limite),
    supabase.from("variante_codigos_externos").select("variante_id").is("desligado_em", null).ilike("codigo", padrao).limit(limite),
    supabase.from("marcas").select("id").ilike("nome", padrao).limit(limite),
    digitos ? (ativos ? porCodigoDeBarras.eq("ativa", true) : porCodigoDeBarras).ilike("codigo_barras", `%${digitos}%`).limit(limite) : nenhum,
    digitos
      ? supabase.from("itens_serializados").select("variante_id").eq("em_estoque", true).or(`imei.like.*${digitos},imei2.like.*${digitos}`).limit(limite)
      : nenhumItem,
  ]);
  if (pelosProdutos.error || pelosSkus.error || pelosNomes.error || pelasMarcas.error || pelosCodigosDeBarras.error || pelosImeis.error) {
    throw new FalhaDoServico("busca");
  }
  const semCodigos = pelosCodigos.error !== null && SEM_TABELA.has(pelosCodigos.error.code ?? "");
  if (pelosCodigos.error && !semCodigos) throw new FalhaDoServico("busca_codigos");
  const marcas = pelasMarcas.data.map((m) => m.id);
  const produtosDasMarcas = marcas.length
    ? await (ativos ? supabase.from("produtos").select("id").eq("ativo", true) : supabase.from("produtos").select("id")).in("marca_id", marcas).limit(limite)
    : { data: [] as { id: string }[], error: null };
  if (produtosDasMarcas.error) throw new FalhaDoServico("busca_marcas");
  const produtosPeloNome = unicos([...pelosProdutos.data.map((p) => p.id), ...produtosDasMarcas.data.map((p) => p.id)]);
  const variantesPeloCodigo = unicos([...(semCodigos ? [] : (pelosCodigos.data ?? []).map((c) => c.variante_id)), ...pelosImeis.data.map((i) => i.variante_id)]);
  const variantesDe = () => (ativos ? supabase.from("variantes").select("id, produto_id").eq("ativa", true) : supabase.from("variantes").select("id, produto_id"));
  const [dosProdutos, dosCodigos] = await Promise.all([
    produtosPeloNome.length ? variantesDe().in("produto_id", produtosPeloNome).limit(limite) : nenhum,
    variantesPeloCodigo.length ? variantesDe().in("id", variantesPeloCodigo).limit(limite) : nenhum,
  ]);
  if (dosProdutos.error || dosCodigos.error) throw new FalhaDoServico("busca_variantes");
  const variantes = [...pelosSkus.data, ...pelosNomes.data, ...pelosCodigosDeBarras.data, ...dosCodigos.data, ...dosProdutos.data];
  return {
    produtos: unicos([...produtosPeloNome, ...variantes.map((v) => v.produto_id)]),
    variantes: unicos(variantes.map((v) => v.id)),
    // B5: alguma das buscas chegou ao limite, então pode haver mais resultados do que os devolvidos: a tela pede
    // para refinar, em vez de apresentar a lista como completa.
    cortada: [pelosProdutos.data, pelosSkus.data, pelosNomes.data, semCodigos ? [] : pelosCodigos.data ?? [], pelasMarcas.data, pelosCodigosDeBarras.data,
      pelosImeis.data, produtosDasMarcas.data, dosProdutos.data, dosCodigos.data].some((l) => l.length >= limite),
  };
}
