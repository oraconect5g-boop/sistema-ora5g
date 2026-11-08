import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { redirecionar } from "../../../lib/acesso/redirecionar";
import { clienteSupabaseServidor } from "../../../lib/supabase/servidor";

// Link do convite ou da recuperação de senha. Aceita o formato com token_hash (modelo de e-mail
// recomendado para login no servidor, funciona em qualquer aparelho) e o código PKCE (mesmo
// navegador que pediu). Sucesso: a pessoa define a senha. Link vencido ou usado: volta ao login.
const TIPOS = new Set<EmailOtpType>(["invite", "recovery", "email", "magiclink", "signup"]);

export async function GET(requisicao: NextRequest) {
  const parametros = requisicao.nextUrl.searchParams;
  const supabase = await clienteSupabaseServidor();
  if (!supabase) return redirecionar("/entrar?erro=configuracao");

  const tokenHash = parametros.get("token_hash");
  const tipo = parametros.get("type") as EmailOtpType | null;
  const codigo = parametros.get("code");
  let erro = true;
  if (tokenHash && tipo && TIPOS.has(tipo)) {
    erro = Boolean((await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })).error);
  } else if (codigo) {
    erro = Boolean((await supabase.auth.exchangeCodeForSession(codigo)).error);
  }
  return redirecionar(erro ? "/entrar?erro=link" : "/conta/senha");
}
