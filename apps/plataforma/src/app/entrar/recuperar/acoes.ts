"use server";

import { redirect } from "next/navigation";

import { clienteSupabaseServidor } from "../../../lib/supabase/servidor";

// "Esqueci minha senha": o Supabase manda o link (precisa do SMTP próprio configurado no painel).
// A resposta é sempre a mesma, exista ou não o e-mail (ADR-002 §2.6).
export async function pedirLinkDeSenha(dados: FormData) {
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/entrar/recuperar?erro=email");
  const supabase = await clienteSupabaseServidor();
  if (!supabase) redirect("/entrar?erro=configuracao");
  const endereco = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  await supabase.auth.resetPasswordForEmail(email, endereco ? { redirectTo: `${endereco}/auth/confirmar` } : undefined);
  redirect("/entrar/recuperar?enviado=1");
}
