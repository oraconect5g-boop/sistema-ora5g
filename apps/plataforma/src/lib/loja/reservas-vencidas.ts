// ONLINE-b (ORA-ONLINE-006; ADR-009): as reservas do site vencidas da loja do turno saem de vez antes de a tela ler o
// estoque, para o aparelho de uma reserva vencida voltar a aparecer livre no PDV. Quem decide é o banco
// (public.loja_reservas_liberar_vencidas: só as do site, só na loja do turno, só quem vende nela, sem esperar trava).
import type { obterSessao } from "../acesso/sessao";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

/** A função ainda não existe (migration do ONLINE-b não aplicada) ou a pessoa não vende nesta loja: nada a fazer. */
const SEM_EFEITO = new Set(["PGRST202", "42883", "42501"]);

/** Solta as reservas do site vencidas desta loja; nunca impede a tela de abrir. Devolve quantas soltou. */
export async function soltarReservasDoSiteVencidas(supabase: Cliente): Promise<number> {
  const { data, error } = await supabase.rpc("loja_reservas_liberar_vencidas");
  if (error) {
    if (!SEM_EFEITO.has(error.code)) console.error("loja: falha ao soltar as reservas do site vencidas", { codigo: error.code });
    return 0;
  }
  return typeof data === "number" ? data : 0;
}
