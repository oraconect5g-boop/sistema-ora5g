// Consultas das metas (lote G4b): public.metas_painel (security invoker: as regras de leitura de quem
// pede) e public.metas_equipe (os nomes, só para quem vê ou define as metas da loja). Cada leitura
// devolve o próprio estado: "ok", "indisponivel" (o banco do ambiente ainda não tem a função) ou
// "falha" (não respondeu ou veio em forma inesperada). Falha nunca vira zero. O registro de erro leva
// só o código, nunca valor nem nome.
import type { obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import type { Leitura } from "../leitura-do-banco";
import { lerEquipe, lerMetas, type MetasDoBanco, type PessoaDasMetas } from "./painel";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

async function ler<T>(nome: "metas_painel" | "metas_equipe", consulta: PromiseLike<{ data: unknown; error: { code: string } | null }>, conversor: (dado: unknown) => T): Promise<Leitura<T>> {
  const r = await consulta;
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    console.error(`metas: falha ao consultar ${nome}`, { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: conversor(r.data) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error(`metas: resposta inesperada de ${nome}`);
    return { estado: "falha" };
  }
}

/** Metas vigentes e realizado do mês numa loja: a loja (para quem lê as vendas dela) e cada vendedor que a pessoa pode ver. */
export const consultarMetas = (supabase: Cliente, mes: string, unidade: string): Promise<Leitura<MetasDoBanco>> =>
  ler("metas_painel", supabase.rpc("metas_painel", { p_mes: mes, p_unidade: unidade }), lerMetas);

/** Quem aparece nas metas da loja no mês, com o nome (a equipe atual e quem tem meta ou fato no mês). */
export const consultarEquipe = (supabase: Cliente, mes: string, unidade: string): Promise<Leitura<PessoaDasMetas[]>> =>
  ler("metas_equipe", supabase.rpc("metas_equipe", { p_mes: mes, p_unidade: unidade }), lerEquipe);
