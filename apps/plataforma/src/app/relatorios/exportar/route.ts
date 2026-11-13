// Exportação dos Relatórios (lote G2a), em CSV para o Excel em português. Dois arquivos:
//   ?ver=dias (o padrão): uma linha por dia, com as vendas e, para quem vê o custo, a margem bruta;
//   ?ver=itens: o detalhe da margem, uma linha por item das vendas concluídas (só para quem vê o custo).
// Mesma permissão e mesmo recorte da tela, conferidos aqui no servidor; o banco confere de novo cada
// número (RLS, e custo.ver loja a loja dentro das funções da margem). Se uma leitura falha, o arquivo
// inteiro falha: arquivo pela metade, ou com zero no lugar do que não foi lido, passaria por completo.
import { permissoesDoMenu } from "../../../componentes/MoldeReal";
import { podeVerFinanceiro } from "../../../lib/acesso/menu";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { gerarCsv } from "../../../lib/csv";
import type { LojaDoFiltro } from "../../../lib/financeiro/escopo";
import { LIMITE_DA_EXPORTACAO } from "../../../lib/financeiro/registros";
import { consultarVendas } from "../../../lib/inicio/consulta";
import type { Leitura } from "../../../lib/leitura-do-banco";
import { consultarMargem, todosOsItensDaMargem } from "../../../lib/margem/consulta";
import { escopoDosRelatorios, podeVerCusto } from "../../../lib/relatorios/consulta";
import { janelasDoRelatorio, periodoDoRelatorio, tabelaDosDias, tabelaDosItens, visaoDaExportacao } from "../../../lib/relatorios/painel";

export const dynamic = "force-dynamic";

const texto = (mensagem: string, status: number) => new Response(mensagem, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** Só segue com a leitura inteira. Sem a função no banco: 503 com o motivo; falha: a exportação para. */
function exigir<T>(leitura: Leitura<T>): { dados: T } | { recusa: Response } {
  if (leitura.estado === "ok") return { dados: leitura.dados };
  if (leitura.estado === "indisponivel") return { recusa: texto("Exportação indisponível neste ambiente: o banco ainda não tem a leitura agregada das vendas ou da margem.", 503) };
  throw new FalhaDoServico("relatorios_exportar");
}

export async function GET(pedido: Request) {
  const url = new URL(pedido.url);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const turno: LojaDoFiltro = { id: situacao.unidade_id as string, nome: situacao.unidade_nome ?? "Loja do turno" };
  const permissoes = await permissoesDoMenu(supabase, turno.id);
  if (!podeVerFinanceiro(permissoes)) return texto("Sem permissão para exportar os relatórios.", 403);

  const ver = visaoDaExportacao(url.searchParams.get("ver"));
  const custo = await podeVerCusto(supabase, turno.id);
  if (ver === "itens" && !custo) return texto("Sem permissão para exportar a margem por item: ela depende de ver o custo dos produtos.", 403);

  const daRede = permissoes.has("venda.ver_todas");
  const lido = await escopoDosRelatorios(supabase, url.searchParams.get("loja") ?? undefined, turno, daRede);
  // Sem a lista de lojas não dá para conferir a loja pedida no endereço.
  if (!lido) throw new FalhaDoServico("relatorios_exportar_lojas");
  const { unidade } = lido.escopo;
  const periodo = periodoDoRelatorio(url.searchParams.get("periodo"));
  const { atual } = janelasDoRelatorio(periodo);

  let tabela: ReturnType<typeof tabelaDosDias>;
  if (ver === "itens") {
    const itens = exigir(await todosOsItensDaMargem(supabase, atual, unidade));
    if ("recusa" in itens) return itens.recusa;
    tabela = tabelaDosItens(itens.dados.itens);
    if (itens.dados.cortado) tabela.linhas.push([`Atenção: exportação limitada a ${LIMITE_DA_EXPORTACAO} itens; escolha um período menor ou uma loja.`]);
  } else {
    const [leituraDasVendas, leituraDaMargem] = await Promise.all([
      consultarVendas(supabase, atual, { unidade, vendedor: null }, false),
      custo ? consultarMargem(supabase, atual, unidade) : null,
    ]);
    const vendas = exigir(leituraDasVendas);
    if ("recusa" in vendas) return vendas.recusa;
    const margem = leituraDaMargem ? exigir(leituraDaMargem) : null;
    if (margem && "recusa" in margem) return margem.recusa;
    tabela = tabelaDosDias(vendas.dados, margem ? margem.dados : null, atual);
  }

  return new Response(gerarCsv(tabela.colunas, tabela.linhas), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ora5g-relatorio-${ver === "itens" ? "margem-por-item" : "por-dia"}-${periodo}-dias.csv"`,
      "cache-control": "no-store",
    },
  });
}
