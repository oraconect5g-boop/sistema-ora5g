// Consulta da produção do Ora Connect (lote G4a): public.connect_painel, com as regras de leitura de
// quem pede (security invoker). Devolve o próprio estado: "ok", "indisponivel" (o banco do ambiente
// ainda não tem a função) ou "falha" (não respondeu ou veio em forma inesperada). Falha nunca vira
// zero. O registro de erro leva só o código.
import type { obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada, type Janela } from "../financeiro/painel";
import type { Leitura } from "../leitura-do-banco";
import { lerProducao, type ProducaoDoBanco } from "./producao";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

/** Chips vendidos e operações confirmadas da janela: de uma loja (ou da rede, com `unidade` nula) e, se pedido, só de um vendedor. */
export async function consultarProducao(supabase: Cliente, janela: Janela, filtro: { unidade: string | null; vendedor: string | null }): Promise<Leitura<ProducaoDoBanco>> {
  const r = await supabase.rpc("connect_painel", {
    p_inicio: janela.inicio.toISOString(), p_fim: janela.fim.toISOString(),
    ...(filtro.unidade ? { p_unidade: filtro.unidade } : {}), ...(filtro.vendedor ? { p_vendedor: filtro.vendedor } : {}),
  });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    console.error("connect: falha ao consultar connect_painel", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerProducao(r.data) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("connect: resposta inesperada de connect_painel");
    return { estado: "falha" };
  }
}
