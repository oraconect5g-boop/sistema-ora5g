// Exportação do financeiro real (#65; ORA-FIN-009): todos os registros da visão no período, em CSV
// para o Excel em português. Mesma permissão e mesmo escopo da tela, conferidos aqui no servidor; o
// banco confere cada linha de novo (RLS). Lê lote a lote (o limite da API) até o fim ou até o limite
// de segurança, e avisa na última linha quando parou antes.
import { permissoesDoMenu } from "../../../componentes/MoldeReal";
import { podeVerFinanceiro } from "../../../lib/acesso/menu";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { gerarCsv } from "../../../lib/csv";
import { escolherEscopo, type LojaDoFiltro } from "../../../lib/financeiro/escopo";
import { janelasDoPeriodo, periodoFinanceiro } from "../../../lib/financeiro/painel";
import { tabelaDoCsv } from "../../../lib/financeiro/exportacao";
import { idsDosRegistros, LIMITE_DA_EXPORTACAO, situacaoDoParametro, todosOsRegistros, visaoDoParametro } from "../../../lib/financeiro/registros";

export const dynamic = "force-dynamic";

export async function GET(pedido: Request) {
  const url = new URL(pedido.url);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const turno: LojaDoFiltro = { id: situacao.unidade_id as string, nome: situacao.unidade_nome ?? "Loja do turno" };
  const permissoes = await permissoesDoMenu(supabase, turno.id);
  if (!podeVerFinanceiro(permissoes)) return new Response("Sem permissão para exportar o financeiro.", { status: 403 });

  const daRede = permissoes.has("venda.ver_todas");
  let lojas: LojaDoFiltro[] = [];
  if (daRede) {
    const r = await supabase.from("unidades").select("id, nome").in("tipo", ["loja_fisica", "online"]);
    if (r.error) throw new FalhaDoServico("financeiro_exportar_lojas");
    lojas = r.data;
  }
  const escopo = escolherEscopo(url.searchParams.get("loja") ?? undefined, lojas, turno, daRede);
  const periodo = periodoFinanceiro(url.searchParams.get("periodo"));
  const visao = visaoDoParametro(url.searchParams.get("ver"));
  const filtro = situacaoDoParametro(visao, url.searchParams.get("situacao"));
  const { atual } = janelasDoPeriodo(periodo);

  const { registros, cortado } = await todosOsRegistros(supabase, visao, atual, escopo.unidade, filtro);
  const { pessoas, lojas: idsLojas } = idsDosRegistros(registros);
  const [rPessoas, rLojas] = await Promise.all([
    pessoas.length ? supabase.from("perfis_usuario").select("id, nome").in("id", pessoas) : Promise.resolve({ data: [], error: null }),
    idsLojas.length ? supabase.from("unidades").select("id, nome").in("id", idsLojas) : Promise.resolve({ data: [], error: null }),
  ]);
  if (rPessoas.error || rLojas.error) throw new FalhaDoServico("financeiro_exportar_nomes");
  const pessoa = new Map((rPessoas.data ?? []).map((p) => [p.id, p.nome] as const));
  const loja = new Map((rLojas.data ?? []).map((l) => [l.id, l.nome] as const));

  const { colunas, linhas } = tabelaDoCsv(registros, (id) => pessoa.get(id) ?? "", (id) => loja.get(id) ?? "");
  if (cortado) linhas.push([`Atenção: exportação limitada a ${LIMITE_DA_EXPORTACAO} registros; escolha um período menor ou uma loja.`]);
  return new Response(gerarCsv(colunas, linhas), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ora5g-financeiro-${visao}-${periodo === "hoje" ? "hoje" : `${periodo}-dias`}.csv"`,
      "cache-control": "no-store",
    },
  });
}
