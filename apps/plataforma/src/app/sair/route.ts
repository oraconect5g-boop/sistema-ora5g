import type { NextRequest } from "next/server";

import { redirecionar } from "../../lib/acesso/redirecionar";
import { clienteSupabaseServidor } from "../../lib/supabase/servidor";

// Saída forçada (turno encerrado ou pessoa bloqueada): encerra a sessão no Auth e limpa o cookie.
// O motivo só pode ser um dos códigos conhecidos; qualquer outro vira saída sem aviso.
const MOTIVOS = new Set(["turno", "bloqueado"]);

export async function GET(requisicao: NextRequest) {
  const supabase = await clienteSupabaseServidor();
  await supabase?.auth.signOut();
  const motivo = requisicao.nextUrl.searchParams.get("motivo");
  return redirecionar(motivo && MOTIVOS.has(motivo) ? `/entrar?erro=${motivo}` : "/entrar");
}
