// Consulta da equipe por papel (lote G5): public.equipe_por_papel, com as regras de leitura de quem pede
// (security invoker; só dono e administrador recebem números). Devolve o próprio estado: "ok",
// "indisponivel" (o banco do ambiente ainda não tem a função) ou "falha" (não respondeu ou veio em
// forma inesperada). Falha nunca vira zero. O registro de erro leva só o código.
import type { obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import type { Leitura } from "../leitura-do-banco";
import { lerEquipePorPapel, type EquipePorPapel } from "./painel";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

export async function consultarEquipePorPapel(supabase: Cliente, organizacao: string): Promise<Leitura<EquipePorPapel>> {
  const r = await supabase.rpc("equipe_por_papel", { p_organizacao: organizacao });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    console.error("equipe: falha ao consultar equipe_por_papel", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerEquipePorPapel(r.data) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("equipe: resposta inesperada de equipe_por_papel");
    return { estado: "falha" };
  }
}
