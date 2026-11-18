// Planilhas do estoque (lote FIN-009b: ORA-FIN-009, exportação nas demais telas reais): o saldo por produto e os
// aparelhos e chips no estoque, em Excel (XLSX, lib/xlsx: o IMEI e o ICCID saem inteiros, como texto) ou em CSV.
// A permissão é a da tela (estoque.consultar na loja do turno). O recorte é o do painel do estoque: quem consulta
// mais de um local escolhe um deles ou a rede inteira (o padrão é a loja do turno), e local que a pessoa não consulta
// dá 403, em vez de um arquivo de outro lugar com o nome dele. O banco confere cada linha de novo (RLS:
// estoque.consultar no local). Tudo vem em páginas abaixo do teto da API, até o limite, com aviso no fim; uma
// leitura que falha ou um nome que não se leu derruba o arquivo inteiro (nada pela metade). Custo não entra.
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { geradoEm, parteDoNome, type SecaoCsv } from "../../../lib/csv";
import { consultarEstoque } from "../../../lib/estoque/consulta-painel";
import { escopoDoEstoque } from "../../../lib/estoque/painel";
import {
  formatoDaPlanilha, LIMITE_DA_PLANILHA_DO_ESTOQUE as LIMITE, parteDaPlanilha, PARTES_DA_PLANILHA, planilhaDoSaldo, planilhaDosItens,
  type ItemDaPlanilha, type LocalDaPlanilha, type NomesDaPlanilha, type ProdutoDaPlanilha, type SaldoDaPlanilha, type VarianteDaPlanilha,
} from "../../../lib/estoque/planilha";
import { lerEmPaginas, lerPorIds } from "../../../lib/leitura-completa";
import { respostaDaPlanilha } from "../../../lib/xlsx-servidor";

export const dynamic = "force-dynamic";

const texto = (mensagem: string, status: number) => new Response(mensagem, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

class NomeQueFaltou extends Error {}
const exigir = <T,>(mapa: ReadonlyMap<string, T>, id: string): T => {
  const achado = mapa.get(id);
  if (achado === undefined) throw new NomeQueFaltou(id);
  return achado;
};

export async function GET(pedido: Request) {
  const url = new URL(pedido.url);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const turno = situacao.unidade_id as string;
  const pode = permite(sessao, "estoque.consultar");
  if (!pode) return texto("Sem permissão para exportar o estoque.", 403);

  const parte = parteDaPlanilha(url.searchParams.get("parte"));
  const formato = formatoDaPlanilha(url.searchParams.get("formato"));
  const lojaPedida = url.searchParams.get("loja");

  // Os locais que a pessoa consulta vêm do painel do estoque, com as permissões dela. Banco sem o painel (G3): só a
  // loja do turno, como na aba "Saldo e busca".
  const painel = await consultarEstoque(supabase, null);
  if (painel.estado === "falha") throw new FalhaDoServico("estoque_exportar_locais");
  const doPainel = painel.estado === "ok" ? painel.dados.locais : [];
  const locais: LocalDaPlanilha[] = doPainel.length
    ? doPainel.map((l) => ({ id: l.unidadeId, nome: l.nome, vende: l.vende }))
    : [{ id: turno, nome: situacao.unidade_nome ?? "Loja do turno", vende: true }];
  if (lojaPedida && lojaPedida !== "rede" && !locais.some((l) => l.id === lojaPedida)) return texto("Sem permissão para exportar o estoque deste local.", 403);
  const escopo = escopoDoEstoque(lojaPedida ?? undefined, doPainel, turno);
  const ids = escopo.unidade ? [escopo.unidade] : locais.map((l) => l.id);
  const local = new Map(locais.map((l) => [l.id, l] as const));
  const onde = escopo.unidade ? (local.get(escopo.unidade)?.nome ?? situacao.unidade_nome ?? "Loja do turno") : "Rede inteira";

  let saldos: SaldoDaPlanilha[] = [];
  let itens: ItemDaPlanilha[] = [];
  let cortada = false;
  if (parte === "saldo") {
    const r = await lerEmPaginas((de, ate) => supabase.from("estoque_saldos").select("unidade_id, variante_id, quantidade, reservado")
      .in("unidade_id", ids).order("unidade_id").order("variante_id").range(de, ate), LIMITE);
    if (!r.ok) throw new FalhaDoServico("estoque_exportar_saldos");
    saldos = r.linhas.map((s) => ({ unidadeId: s.unidade_id, varianteId: s.variante_id, quantidade: s.quantidade, reservado: s.reservado }));
    cortada = r.mais;
  } else {
    const r = await lerEmPaginas((de, ate) => supabase.from("itens_serializados")
      .select("id, unidade_id, variante_id, imei, imei2, iccid, numero_serie, situacao, condicao, criado_em, conferido_em")
      .in("unidade_id", ids).eq("em_estoque", true).order("unidade_id").order("variante_id").order("id").range(de, ate), LIMITE);
    if (!r.ok) throw new FalhaDoServico("estoque_exportar_itens");
    itens = r.linhas.map((i) => ({
      id: i.id, unidadeId: i.unidade_id, varianteId: i.variante_id, imei: i.imei, imei2: i.imei2, iccid: i.iccid, numeroSerie: i.numero_serie,
      situacao: i.situacao, condicao: i.condicao, criadoEm: i.criado_em, conferidoEm: i.conferido_em,
    }));
    cortada = r.mais;
  }

  // Os nomes: as variações de cada linha e, no saldo, o produto, a marca e a categoria.
  const lidas = await lerPorIds([...saldos.map((s) => s.varianteId), ...itens.map((i) => i.varianteId)], (lote, de, ate) => supabase.from("variantes")
    .select("id, nome, sku, estoque_minimo, produto_id").in("id", lote).order("id").range(de, ate));
  if (!lidas.ok || lidas.mais) throw new FalhaDoServico("estoque_exportar_variantes");
  const variantes = new Map(lidas.linhas.map((v): [string, VarianteDaPlanilha] => [v.id, { id: v.id, nome: v.nome, sku: v.sku, estoqueMinimo: v.estoque_minimo, produtoId: v.produto_id }]));
  const produtos = new Map<string, ProdutoDaPlanilha>();
  if (parte === "saldo") {
    const r = await lerPorIds(lidas.linhas.map((v) => v.produto_id), (lote, de, ate) => supabase.from("produtos")
      .select("id, nome, categoria_id, marca_id").in("id", lote).order("id").range(de, ate));
    if (!r.ok || r.mais) throw new FalhaDoServico("estoque_exportar_produtos");
    const [categorias, marcas] = await Promise.all([
      lerPorIds(r.linhas.map((p) => p.categoria_id), (lote, de, ate) => supabase.from("categorias").select("id, nome").in("id", lote).order("id").range(de, ate)),
      lerPorIds(r.linhas.flatMap((p) => (p.marca_id ? [p.marca_id] : [])), (lote, de, ate) => supabase.from("marcas").select("id, nome").in("id", lote).order("id").range(de, ate)),
    ]);
    if (!categorias.ok || categorias.mais || !marcas.ok || marcas.mais) throw new FalhaDoServico("estoque_exportar_categorias");
    const categoria = new Map(categorias.linhas.map((c) => [c.id, c.nome] as const));
    const marca = new Map(marcas.linhas.map((m) => [m.id, m.nome] as const));
    try {
      for (const p of r.linhas) produtos.set(p.id, { nome: p.nome, categoria: exigir(categoria, p.categoria_id), marca: p.marca_id ? exigir(marca, p.marca_id) : null });
    } catch (erro) {
      if (!(erro instanceof NomeQueFaltou)) throw erro;
      throw new FalhaDoServico("estoque_exportar_nomes");
    }
  }
  const nomes: NomesDaPlanilha = { local: (id) => exigir(local, id), variante: (id) => exigir(variantes, id), produto: (id) => exigir(produtos, id) };

  let secoes: SecaoCsv[];
  try {
    secoes = parte === "saldo"
      ? planilhaDoSaldo(saldos, nomes, onde, geradoEm(), cortada ? LIMITE : null)
      : planilhaDosItens(itens, nomes, onde, geradoEm(), cortada ? LIMITE : null);
  } catch (erro) {
    // Produto ou local sem nome sairia em branco: melhor não exportar.
    if (!(erro instanceof NomeQueFaltou)) throw erro;
    throw new FalhaDoServico("estoque_exportar_nomes");
  }
  return respostaDaPlanilha(formato, `ora5g-estoque-${PARTES_DA_PLANILHA[parte].arquivo}-${parteDoNome(onde)}`, PARTES_DA_PLANILHA[parte].titulo, secoes);
}
