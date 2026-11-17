// O sino do topo (G6, REPORT-007): as pendências da loja do turno, a mesma leitura do Início (lib/inicio/pendencias.ts),
// pedidas pela tela depois de abrir (não atrasam nenhuma tela). Sem sessão, o login (como as telas). Falha de leitura:
// 503, e o sino diz que não leu (zero inventado não). Nada aqui grava.
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { lerPendencias } from "../../../lib/inicio/pendencias";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

function falhaDeLeitura(e: unknown) {
  console.error("sino: falha ao ler as pendências", { fonte: e instanceof FalhaDoServico ? e.message : null });
  return Response.json({ erro: "falha" }, { status: 503, headers: SEM_CACHE });
}

export async function GET() {
  let sessao: Awaited<ReturnType<typeof obterSessao>>;
  try {
    sessao = await obterSessao({ exigirLoja: true });
  } catch (e) {
    // As permissões chegam com a sessão (lote VEL-a): a falha do serviço ao lê-la é falha de leitura do sino. O que
    // não é falha (ir para a entrada, turno encerrado, loja por escolher) segue o caminho de sempre.
    if (e instanceof FalhaDoServico) return falhaDeLeitura(e);
    throw e;
  }
  const { supabase, usuario, situacao, molde } = sessao;
  const unidade = situacao.unidade_id as string;
  try {
    const pendencias = await lerPendencias(supabase, { usuario: usuario.id, unidade, permissoes: molde.permissoes });
    return Response.json({ unidade, pendencias }, { headers: SEM_CACHE });
  } catch (e) {
    return falhaDeLeitura(e);
  }
}
