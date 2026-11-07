import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { configuracaoSupabase } from "./configuracao";

// Cliente do Supabase no servidor, com a sessão do usuário nos cookies:
// toda consulta passa pelo RLS do banco como o próprio usuário.
export async function clienteSupabaseServidor() {
  const configuracao = configuracaoSupabase();
  if (!configuracao) return null;
  const loja = await cookies();
  return createServerClient(configuracao.url, configuracao.chavePublica, {
    cookies: {
      getAll: () => loja.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) loja.set(name, value, options);
        } catch {
          // Em componente de servidor os cookies são só leitura; a sessão é renovada nas ações.
        }
      },
    },
  });
}
