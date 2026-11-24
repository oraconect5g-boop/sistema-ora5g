// O aviso no celular dos erros do servidor (lote QUAL-006a; ADR-015, adendo de 24/11), na Saúde da operação: quando o
// worker dos avisos conferiu o site pela última vez e quando saiu o último alerta (public.erros_do_servidor_situacao). Só
// para quem recebe o alerta (quem gere as lojas pela rede inteira): para os outros, e no banco sem a função, nada aparece.
// Outra falha: a tela diz que não leu, nunca "ligado" inventado. Só leitura.
import type { obterSessao } from "../acesso/sessao";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export type VigiaDosErros = {
  /** A última vez que o worker conferiu o site (nulo: ainda não conferiu). */
  conferidoEm: number | null;
  /** Desde quando o worker não consegue ler os erros do site (nulo: leu na última vez). */
  semRespostaDesde: number | null;
  /** Os erros que esperam o próximo alerta. */
  pendentes: number;
  alertaDeErrosEm: number | null;
  alertaDeForaEm: number | null;
  alertaACadaMinutos: number;
  foraAposMinutos: number;
};
export type LeituraDoVigia = VigiaDosErros | "falha" | null;

/** O worker confere a cada minuto: passados estes minutos sem conferir, o aviso está parado. */
export const PARADO_APOS_MINUTOS = 5;

const AUSENTE = new Set(["PGRST202", "42883"]);
const instante = (v: unknown): number | null | undefined => {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? undefined : ms;
};
const inteiro = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);

/** A resposta do banco, conferida; null se veio fora da forma. */
export function vigiaDosErros(dados: unknown): VigiaDosErros | null {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  const v = {
    conferidoEm: instante(d.relatado_em), semRespostaDesde: instante(d.sem_resposta_desde), pendentes: inteiro(d.pendentes, 0, 2_000_000_000),
    alertaDeErrosEm: instante(d.alerta_de_erros_em), alertaDeForaEm: instante(d.alerta_de_fora_em),
    alertaACadaMinutos: inteiro(d.alerta_a_cada_minutos, 5, 1440), foraAposMinutos: inteiro(d.fora_apos_minutos, 2, 60),
  };
  return Object.values(v).some((x) => x === undefined) ? null : (v as VigiaDosErros);
}

/** Lê a situação do aviso. */
export async function lerVigiaDosErros(supabase: Cliente): Promise<LeituraDoVigia> {
  const { data, error } = await supabase.rpc("erros_do_servidor_situacao");
  if (error) {
    // Quem não recebe o alerta (o administrador de uma loja só) e o banco sem a função: o bloco não aparece.
    if (error.code === "42501" || AUSENTE.has(error.code)) return null;
    console.error("operação: falha ao ler o aviso dos erros do servidor", { codigo: error.code ?? null });
    return "falha";
  }
  return vigiaDosErros(data) ?? "falha";
}
