// Leitura agregada do financeiro real (#65): public.financeiro_painel, security invoker (o RLS de
// quem pede vale em cada linha somada). Sem a função instalada no banco do ambiente, responde
// "indisponivel" e a tela diz isso; nunca inventa número.
import { FalhaDoServico, type obterSessao } from "../acesso/sessao";
import { lerPainel, type Janela, type PainelDoBanco } from "./painel";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

export async function consultarPainel(supabase: Cliente, janela: Janela, unidade: string | null, porHora: boolean): Promise<PainelDoBanco | "indisponivel"> {
  const r = await supabase.rpc("financeiro_painel", {
    p_inicio: janela.inicio.toISOString(), p_fim: janela.fim.toISOString(), p_por_hora: porHora, ...(unidade ? { p_unidade: unidade } : {}),
  });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return "indisponivel";
    throw new FalhaDoServico("financeiro_painel");
  }
  return lerPainel(r.data);
}
