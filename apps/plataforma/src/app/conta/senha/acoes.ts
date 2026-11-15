"use server";

import { redirect } from "next/navigation";

import { validarSenhaNova } from "../../../lib/acesso/regras";
import { clienteSupabaseServidor } from "../../../lib/supabase/servidor";

// Senha nova (depois do convite, da recuperação ou para trocar): só com sessão válida no Auth.
export async function definirSenha(dados: FormData) {
  const problema = validarSenhaNova(dados.get("senha"), dados.get("confirmacao"));
  if (problema) redirect(`/conta/senha?erro=${problema}`);
  const supabase = await clienteSupabaseServidor();
  if (!supabase) redirect("/entrar?erro=configuracao");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/entrar?erro=link");
  const { error } = await supabase.auth.updateUser({ password: String(dados.get("senha")) });
  // ORG-007a: o Supabase pede o código (aal2) de quem tem o segundo fator; depois do código, volta para cá.
  if (error?.code === "insufficient_aal") redirect("/entrar/codigo?depois=senha");
  if (error) redirect("/conta/senha?erro=servico");
  redirect("/escolher-loja");
}
