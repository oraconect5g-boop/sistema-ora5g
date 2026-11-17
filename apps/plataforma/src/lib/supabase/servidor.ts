import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import { configuracaoSupabase } from "./configuracao";
import { medidorDeTempos } from "./tempos";
import type { Database } from "./tipos-banco";

// Log de tempos (ORA_MEDIR_TEMPOS=1; desligado, é null e nada muda): um medidor por tela montada. O `cache` do React
// vale por montagem, então as idas de todos os clientes que a tela cria saem com o mesmo nome e numeradas em ordem.
// Fora da montagem (ação de formulário, rota) é um medidor por cliente.
const temposDaTela = cache(() => medidorDeTempos("c"));

// Cliente do Supabase no servidor, com a sessão do usuário nos cookies:
// toda consulta passa pelo RLS do banco como o próprio usuário.
export async function clienteSupabaseServidor() {
  const configuracao = configuracaoSupabase();
  if (!configuracao) return null;
  const loja = await cookies();
  const tempos = temposDaTela();
  return createServerClient<Database>(configuracao.url, configuracao.chavePublica, {
    ...(tempos ? { global: { fetch: tempos.fetch } } : {}),
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

export type ClienteSupabase = NonNullable<Awaited<ReturnType<typeof clienteSupabaseServidor>>>;
