// Endereço e chave PÚBLICA do Supabase (respeitam RLS). A chave secreta nunca passa por aqui.
export function configuracaoSupabase(): { url: string; chavePublica: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const chavePublica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && chavePublica ? { url, chavePublica } : null;
}

export type SituacaoConexao = "conectado" | "nao_configurado" | "sem_resposta";

// Confere se o serviço de login do Supabase responde (não lê dados nem expõe a chave).
export async function conferirConexaoSupabase(limiteMs = 4000): Promise<SituacaoConexao> {
  const configuracao = configuracaoSupabase();
  if (!configuracao) return "nao_configurado";
  try {
    const resposta = await fetch(`${configuracao.url}/auth/v1/health`, {
      headers: { apikey: configuracao.chavePublica },
      signal: AbortSignal.timeout(limiteMs),
      cache: "no-store",
    });
    return resposta.ok ? "conectado" : "sem_resposta";
  } catch {
    return "sem_resposta";
  }
}
