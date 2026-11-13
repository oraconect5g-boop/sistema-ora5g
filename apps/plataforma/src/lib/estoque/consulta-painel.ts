// Consulta dos painéis do estoque (lote G3): public.estoque_painel, com as regras de leitura de quem
// pede (security invoker). Devolve o próprio estado: "ok", "indisponivel" (o banco do ambiente ainda
// não tem a função) ou "falha" (não respondeu ou veio em forma inesperada). Falha nunca vira zero. O
// registro de erro leva só o código.
import type { obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import type { Leitura } from "../leitura-do-banco";
import { lerEstoque, type EstoqueDoBanco } from "./painel";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

/** A posição de agora do estoque: de um local ou, com `unidade` nula, de todos os que a pessoa consulta. */
export async function consultarEstoque(supabase: Cliente, unidade: string | null): Promise<Leitura<EstoqueDoBanco>> {
  const r = await supabase.rpc("estoque_painel", unidade ? { p_unidade: unidade } : {});
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    console.error("estoque: falha ao consultar estoque_painel", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerEstoque(r.data) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("estoque: resposta inesperada de estoque_painel");
    return { estado: "falha" };
  }
}
