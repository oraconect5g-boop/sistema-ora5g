// As lojas que podem receber a carga do estoque inicial (lote REIN-b; ADR-021): as ativas que guardam estoque (loja
// física, depósito e o DEFEITOS), na ordem do nome, que a pessoa vê (o banco filtra pela RLS). O banco confere de novo.
import type { obterSessao } from "../acesso/sessao";
import type { LojaDaCarga } from "./carga";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export async function lojasDaCarga(supabase: Cliente): Promise<LojaDaCarga[] | null> {
  const { data, error } = await supabase.from("unidades").select("id, nome").eq("status", "ativa")
    .in("tipo", ["loja_fisica", "deposito", "excecao"]).order("nome");
  if (error || !data) return null;
  return (data as { id: string; nome: string }[]).map((u) => ({ id: u.id, nome: u.nome }));
}
