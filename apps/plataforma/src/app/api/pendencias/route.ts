// O sino do topo (G6, REPORT-007): as pendências da loja do turno, a mesma leitura do Início (lib/inicio/pendencias.ts),
// pedidas pela tela depois de abrir (não atrasam nenhuma tela). Sem sessão, o login (como as telas). Falha de leitura:
// 503, e o sino diz que não leu (zero inventado não). Nada aqui grava.
import { permissoesDoMenu } from "../../../componentes/MoldeReal";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { lerPendencias } from "../../../lib/inicio/pendencias";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const { supabase, usuario, situacao } = await obterSessao({ exigirLoja: true });
  const unidade = situacao.unidade_id as string;
  try {
    const permissoes = await permissoesDoMenu(supabase, unidade);
    const pendencias = await lerPendencias(supabase, { usuario: usuario.id, unidade, permissoes });
    return Response.json({ unidade, pendencias }, { headers: SEM_CACHE });
  } catch (e) {
    console.error("sino: falha ao ler as pendências", { fonte: e instanceof FalhaDoServico ? e.message : null });
    return Response.json({ erro: "falha" }, { status: 503, headers: SEM_CACHE });
  }
}
