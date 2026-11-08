"use server";

import { redirect } from "next/navigation";

import { clienteSupabaseServidor } from "../../lib/supabase/servidor";

// Mensagem neutra: não revela se o e-mail existe (ADR-002 §2.6).
export async function entrar(dados: FormData) {
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  const senha = String(dados.get("senha") ?? "");
  if (!email || !senha) redirect("/entrar?erro=dados");

  const supabase = await clienteSupabaseServidor();
  if (!supabase) redirect("/entrar?erro=configuracao");

  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) redirect("/entrar?erro=credenciais");
  redirect("/escolher-loja");
}

export async function sair() {
  const supabase = await clienteSupabaseServidor();
  await supabase?.auth.signOut();
  redirect("/entrar");
}
