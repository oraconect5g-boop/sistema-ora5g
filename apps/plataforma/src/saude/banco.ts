// A leitura leve do banco na página pública /saude (lote SAUDE-a; plano do proprietário de 16/11, Onda 0.6; ADR-012).
// Sem login, com a chave pública: public.saude_do_banco devolve a hora do banco e se a última migration desta versão está
// no histórico do banco. Não lê dado de ninguém. A página mostra quanto o banco levou para responder e avisa quando a
// versão publicada está à frente do banco (a migration do lote vai antes da publicação).
import { createClient } from "@supabase/supabase-js";

import { configuracaoSupabase } from "../lib/supabase/configuracao";
import type { Database } from "../lib/supabase/tipos-banco";

export type SituacaoDoBanco =
  | { estado: "nao_configurado" }
  | { estado: "sem_resposta" }
  | { estado: "respondeu"; ms: number; migracao: "em_dia" | "atras" | "sem_conferir" };

/** A última migration que esta versão espera no banco, gravada na build (next.config.ts); nula quando não se sabe. */
export function migracaoEsperada(valor: string | undefined = process.env.ORA_MIGRACAO_ESPERADA): string | null {
  return valor && /^\d{14}$/.test(valor) ? valor : null;
}

/** Uma ida ao banco, com limite de tempo. Qualquer erro, resposta estranha ou demora vira "sem resposta". */
export async function conferirBanco(esperada: string | null, { limiteMs = 4000, buscar }: { limiteMs?: number; buscar?: typeof fetch } = {}): Promise<SituacaoDoBanco> {
  const configuracao = configuracaoSupabase();
  if (!configuracao) return { estado: "nao_configurado" };
  const cliente = createClient<Database>(configuracao.url, configuracao.chavePublica, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(buscar ? { global: { fetch: buscar } } : {}),
  });
  const inicio = performance.now();
  try {
    const { data, error } = await cliente.rpc("saude_do_banco", esperada ? { p_migracao: esperada } : {}).abortSignal(AbortSignal.timeout(limiteMs));
    const ms = Math.max(0, Math.round(performance.now() - inicio));
    if (error || !data || typeof data !== "object" || Array.isArray(data) || typeof data.hora !== "string") return { estado: "sem_resposta" };
    return { estado: "respondeu", ms, migracao: data.migracao === true ? "em_dia" : data.migracao === false ? "atras" : "sem_conferir" };
  } catch {
    return { estado: "sem_resposta" };
  }
}
