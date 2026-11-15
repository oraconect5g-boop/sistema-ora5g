// Planilha das contas a pagar (lote L8d: ORA-FIN-009), em CSV para o Excel em português (ou, desde o FIN-009c, no
// próprio Excel, com ?formato=xlsx): a mesma lista e o
// mesmo filtro da tela, com todas as colunas. A permissão é a da tela (conta_pagar.gerir: o dono na rede e
// em todas as lojas, o gerente na loja dele) e o banco confere de novo cada linha (RLS). A loja pedida passa
// pelo resumo: a que o banco recusa dá 403, em vez de um arquivo vazio com o nome dela.
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import {
  consultarCategorias, consultarContas, consultarResumo, LIMITE_DA_EXPORTACAO_DAS_CONTAS, nomesDosFornecedores,
} from "../../../lib/contas-a-pagar/consulta";
import { planilhaDasContas } from "../../../lib/contas-a-pagar/planilha";
import { filtroDasContas, hojeEmSaoPaulo, visaoDasContas } from "../../../lib/contas-a-pagar/regras";
import { formatoPedido, geradoEm, parteDoNome } from "../../../lib/csv";
import { respostaDaPlanilha } from "../../../lib/xlsx-servidor";

export const dynamic = "force-dynamic";

const texto = (mensagem: string, status: number) => new Response(mensagem, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const INDISPONIVEL = "Exportação indisponível neste ambiente: o banco ainda não tem as contas a pagar.";

export async function GET(pedido: Request) {
  const url = new URL(pedido.url);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const pode = await supabase.rpc("tem_permissao", { p_permissao: "conta_pagar.gerir", p_unidade: situacao.unidade_id as string });
  if (pode.error) throw new FalhaDoServico("tem_permissao");
  if (!pode.data) return texto("Sem permissão para exportar as contas a pagar.", 403);

  const visao = visaoDasContas(url.searchParams.get("ver"));
  const filtro = filtroDasContas(url.searchParams.get("loja"));
  const resumo = await consultarResumo(supabase, filtro);
  if (resumo.estado === "recusado") return texto("Sem permissão para exportar as contas desta loja.", 403);
  if (resumo.estado === "indisponivel") return texto(INDISPONIVEL, 503);
  if (resumo.estado === "falha") throw new FalhaDoServico("contas_exportar");

  const [lista, categorias, fornecedores] = await Promise.all([
    consultarContas(supabase, visao, filtro, hojeEmSaoPaulo(), LIMITE_DA_EXPORTACAO_DAS_CONTAS), consultarCategorias(supabase), nomesDosFornecedores(supabase),
  ]);
  if (lista.estado === "indisponivel" || categorias.estado === "indisponivel") return texto(INDISPONIVEL, 503);
  // Nome de categoria ou de fornecedor que não se leu sairia em branco: melhor não exportar.
  if (lista.estado !== "ok" || categorias.estado !== "ok" || fornecedores === null) throw new FalhaDoServico("contas_exportar");

  const { escopo } = resumo.dados;
  const loja = (id: string | null) => (id === null ? "Rede (central)" : escopo.lojas.find((l) => l.id === id)?.nome ?? "Outra loja");
  const onde = filtro.tipo === "rede" ? "Rede (central)" : filtro.tipo === "loja" ? loja(filtro.id)
    : escopo.rede ? "Rede e todas as lojas" : loja(situacao.unidade_id);
  const nomes = {
    loja,
    categoria: (id: string) => categorias.dados.find((c) => c.id === id)?.nome ?? "Categoria",
    fornecedor: (id: string | null) => (id === null ? null : fornecedores.get(id) ?? "Fornecedor"),
  };
  const planilha = planilhaDasContas(lista.dados.contas, visao, onde, geradoEm(), nomes, lista.dados.mais ? LIMITE_DA_EXPORTACAO_DAS_CONTAS : null);
  return respostaDaPlanilha(formatoPedido(url.searchParams.get("formato"), "csv"), `ora5g-contas-a-pagar-${visao}-${parteDoNome(onde)}`, "Contas a pagar", planilha);
}
