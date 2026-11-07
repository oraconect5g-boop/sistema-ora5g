import { verificarAmbiente } from "@ora5g/config/ambiente";

// Endereço e chave PÚBLICA do Supabase, validados pela mesma regra da inicialização (REV-004):
// chave secreta, service_role, http, localhost ou IPv6 são recusados aqui também.
// Lê o ambiente em tempo de execução (só servidor); a chave secreta nunca passa por aqui.
let avisoJaRegistrado = false;

export function configuracaoSupabase(): { url: string; chavePublica: string } | null {
  const ambiente = process.env;
  const url = ambiente["NEXT_PUBLIC_SUPABASE_URL"];
  const chave = ambiente["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url?.trim() && !chave?.trim()) return null;

  const resultado = verificarAmbiente({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: chave }, ["supabase_publico"]);
  if (!resultado.ok) {
    if (!avisoJaRegistrado) {
      console.error(`Configuração pública do Supabase recusada: ${resultado.problemas.map((p) => `${p.variavel} (${p.motivo})`).join("; ")}`);
      avisoJaRegistrado = true;
    }
    return null;
  }
  return { url: resultado.configuracao.NEXT_PUBLIC_SUPABASE_URL, chavePublica: resultado.configuracao.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
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
