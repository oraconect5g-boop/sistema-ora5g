// Planilha do resultado do mês (lote L8d: ORA-FIN-009), em CSV para o Excel em português ou, desde o FIN-009c, no
// próprio Excel (?formato=xlsx): o mesmo mês e a mesma loja da tela. O banco decide quem pode (só o dono, public.resultado_do_mes) e soma os números; aqui
// só se monta o arquivo. Sem permissão: 403; banco sem a leitura: 503 com o motivo; falha: a exportação
// para (arquivo pela metade passaria por completo).
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { formatoPedido, geradoEm, parteDoNome } from "../../../lib/csv";
import { consultarResultado } from "../../../lib/resultado/consulta";
import { planilhaDoResultado } from "../../../lib/resultado/planilha";
import { filtroDoResultado, mesDoResultado } from "../../../lib/resultado/regras";
import { respostaDaPlanilha } from "../../../lib/xlsx-servidor";

export const dynamic = "force-dynamic";

const texto = (mensagem: string, status: number) => new Response(mensagem, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(pedido: Request) {
  const url = new URL(pedido.url);
  const sessao = await obterSessao({ exigirLoja: true });
  const mes = mesDoResultado(url.searchParams.get("mes") ?? undefined);
  const filtro = filtroDoResultado(url.searchParams.get("loja"));
  const unidade = filtro.tipo === "loja" ? filtro.id : null;
  const leitura = await consultarResultado(sessao.supabase, mes, unidade, 1);
  if (leitura.estado === "recusado") return texto("Sem permissão para exportar este resultado: o resultado do mês é só do dono.", 403);
  if (leitura.estado === "indisponivel") return texto("Exportação indisponível neste ambiente: o banco ainda não tem a leitura do resultado do mês.", 503);
  if (leitura.estado === "falha") throw new FalhaDoServico("resultado_exportar");
  const r = leitura.dados;
  const onde = unidade ? (r.lojas.find((l) => l.id === unidade)?.nome ?? "Loja") : "Rede inteira";
  return respostaDaPlanilha(formatoPedido(url.searchParams.get("formato"), "csv"), `ora5g-resultado-${mes.slice(0, 7)}-${parteDoNome(onde)}`, "Resultado do mês", planilhaDoResultado(r, onde, geradoEm()));
}
