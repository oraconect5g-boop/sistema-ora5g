// Planilha da auditoria (lote FIN-009d: ORA-FIN-009), no Excel ou em CSV: o período e o filtro da tela (?periodo=,
// ?alertas=1), da loja do turno e da rede, com todas as linhas do período (a tela mostra as 200 mais recentes). A
// permissão é a da tela (auditoria.ver na loja do turno) e o banco confere cada linha de novo (RLS). Leitura em páginas
// abaixo do teto da API, do mais recente ao mais antigo, até o limite, com aviso no fim; uma página que falha ou um
// nome que não se leu derruba o arquivo (nada pela metade).
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { LIMITE_DA_PLANILHA_DA_AUDITORIA as LIMITE, planilhaDaAuditoria } from "../../../lib/auditoria/planilha";
import { PERIODOS_DA_AUDITORIA } from "../../../lib/auditoria/regras";
import { formatoPedido, geradoEm, parteDoNome } from "../../../lib/csv";
import { lerEmPaginas, lerPorIds } from "../../../lib/leitura-completa";
import { chaveDoCatalogo } from "../../../lib/parametros";
import { inicioDoPeriodo } from "../../../lib/vendas/lista";
import { respostaDaPlanilha } from "../../../lib/xlsx-servidor";

export const dynamic = "force-dynamic";

const texto = (mensagem: string, status: number) => new Response(mensagem, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(pedido: Request) {
  const url = new URL(pedido.url);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const pode = await supabase.rpc("tem_permissao", { p_permissao: "auditoria.ver", p_unidade: unidade });
  if (pode.error) throw new FalhaDoServico("auditoria_permissao");
  if (!pode.data) return texto("Sem permissão para exportar a auditoria.", 403);

  const periodo = chaveDoCatalogo(PERIODOS_DA_AUDITORIA, url.searchParams.get("periodo") ?? undefined) ?? "hoje";
  const soAlertas = url.searchParams.get("alertas") === "1";
  const lidos = await lerEmPaginas((de, ate) => supabase.from("auditoria").select("id, ocorrido_em, usuario_id, unidade_id, acao, alvo_tipo, alvo_id, motivo, origem")
    .or(`unidade_id.eq.${unidade},unidade_id.is.null`).gte("ocorrido_em", inicioDoPeriodo(periodo)).order("id", { ascending: false }).range(de, ate), LIMITE);
  if (!lidos.ok) throw new FalhaDoServico("auditoria_exportar");
  const eventos = lidos.linhas.map((e) => ({
    id: e.id, ocorridoEm: e.ocorrido_em, usuarioId: e.usuario_id, unidadeId: e.unidade_id, acao: e.acao, alvoTipo: e.alvo_tipo, alvoId: e.alvo_id, motivo: e.motivo, origem: e.origem,
  }));
  // Os nomes de quem fez, pelo RLS dos perfis: quem não está na equipe de quem exporta aparece como na tela.
  const pessoas = await lerPorIds(eventos.flatMap((e) => (e.usuarioId ? [e.usuarioId] : [])), (lote, de, ate) => supabase.from("perfis_usuario")
    .select("id, nome").in("id", lote).order("id").range(de, ate));
  if (!pessoas.ok || pessoas.mais) throw new FalhaDoServico("auditoria_exportar_pessoas");
  const nome = new Map(pessoas.linhas.map((p) => [p.id, p.nome] as const));
  const loja = situacao.unidade_nome ?? "Loja do turno";
  const secoes = planilhaDaAuditoria({
    eventos, periodo, soAlertas, loja, gerado: geradoEm(), cortada: lidos.mais ? LIMITE : null,
    quem: (id) => (id ? nome.get(id) ?? "Pessoa de fora da sua equipe" : "Sistema"),
  });
  return respostaDaPlanilha(
    formatoPedido(url.searchParams.get("formato"), "xlsx"),
    `ora5g-auditoria-${periodo === "hoje" ? "hoje" : `${periodo}-dias`}${soAlertas ? "-alertas" : ""}-${parteDoNome(loja)}`,
    "Auditoria", secoes,
  );
}
