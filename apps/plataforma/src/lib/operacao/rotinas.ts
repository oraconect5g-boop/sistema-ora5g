// As rotinas agendadas no banco (lote ROT-a: ORA-QUAL-006 em parte; ADR-011), na Saúde da operação. Quem decide a
// situação é o banco (public.rotinas_situacao: com falha, atrasada, aguardando a primeira rodada ou em dia); aqui, a
// leitura e o texto. Função que o banco ainda não tem (migration do ROT-a não aplicada): o cartão some. Outra falha: o
// cartão diz que não leu, nunca "em dia" inventado. Só leitura.
import type { obterSessao } from "../acesso/sessao";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export type SituacaoDaRotina = "com_falha" | "atrasada" | "aguardando" | "em_dia";
export type Rotina = {
  nome: string; descricao: string; frequencia: string; situacao: SituacaoDaRotina;
  ultimaCerta: string | null; ultimaFalha: string | null; erro: string | null;
};
export type LeituraDasRotinas = { estado: "ok"; rotinas: Rotina[] } | { estado: "falha" } | { estado: "ausente" };

export const SITUACOES_DA_ROTINA: Record<SituacaoDaRotina, { rotulo: string; tom: "perigo" | "aviso" | "neutro" | "sucesso" }> = {
  com_falha: { rotulo: "Com falha", tom: "perigo" },
  atrasada: { rotulo: "Atrasada", tom: "aviso" },
  aguardando: { rotulo: "Aguardando a 1ª rodada", tom: "neutro" },
  em_dia: { rotulo: "Em dia", tom: "sucesso" },
};

/** A função ainda não existe no banco (PostgREST: PGRST202; PostgreSQL: 42883). */
const AUSENTE = new Set(["PGRST202", "42883"]);
const texto = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
const situacao = (v: unknown): SituacaoDaRotina | null => (typeof v === "string" && v in SITUACOES_DA_ROTINA ? (v as SituacaoDaRotina) : null);

/** Lê a situação das rotinas. Linha que não se entende vira falha da leitura (nunca some calada). */
export async function lerRotinas(supabase: Cliente): Promise<LeituraDasRotinas> {
  const { data, error } = await supabase.rpc("rotinas_situacao");
  if (error) {
    if (AUSENTE.has(error.code)) return { estado: "ausente" };
    console.error("operação: falha ao ler as rotinas", { codigo: error.code ?? null });
    return { estado: "falha" };
  }
  if (!Array.isArray(data)) return { estado: "falha" };
  const rotinas: Rotina[] = [];
  for (const linha of data as unknown[]) {
    const r = (linha && typeof linha === "object" ? linha : {}) as Record<string, unknown>;
    const nome = texto(r.nome);
    const descricao = texto(r.descricao);
    const frequencia = texto(r.frequencia);
    const s = situacao(r.situacao);
    if (!nome || !descricao || !frequencia || !s) {
      console.error("operação: rotina sem os campos esperados", { nome });
      return { estado: "falha" };
    }
    rotinas.push({ nome, descricao, frequencia, situacao: s, ultimaCerta: texto(r.ultima_ok), ultimaFalha: texto(r.ultima_falha), erro: texto(r.erro) });
  }
  return { estado: "ok", rotinas };
}

/** As que pedem atenção (com falha ou atrasada), as com falha primeiro. */
export function rotinasComProblema(rotinas: readonly Rotina[]): Rotina[] {
  const ordem: SituacaoDaRotina[] = ["com_falha", "atrasada"];
  return rotinas.filter((r) => ordem.includes(r.situacao)).sort((a, b) => ordem.indexOf(a.situacao) - ordem.indexOf(b.situacao));
}

/** Minutos inteiros desde o instante (nunca negativo). */
export const minutosDesde = (instante: string, agora: number) => Math.max(0, Math.floor((agora - Date.parse(instante)) / 60_000));
