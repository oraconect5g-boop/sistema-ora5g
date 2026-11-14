// Resultado do mês (lote L8b): regras puras da tela. O mês do endereço, o filtro de loja, os meses que o
// filtro oferece e o percentual sobre a receita. Os números vêm prontos do banco (public.resultado_do_mes).
import { ehUuid } from "../acesso/regras";
import { mesDeHoje, nomeDoMes, somarMeses } from "../metas/painel";

/** Quantos meses para trás o banco aceita (o mês atual e os 24 anteriores). */
export const MESES_DE_HISTORICO = 24;
/** Quantos meses a série do gráfico mostra (o escolhido e os anteriores). */
export const MESES_DA_SERIE = 6;

/** "2026-11" do endereço → "2026-11-01", do mês atual até 24 meses atrás; inválido ou fora disso → o mês atual. */
export function mesDoResultado(valor: unknown, agora: Date = new Date()): string {
  const hoje = mesDeHoje(agora);
  if (typeof valor !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) return hoje;
  const mes = `${valor}-01`;
  return mes <= hoje && mes >= somarMeses(hoje, -MESES_DE_HISTORICO) ? mes : hoje;
}

/** "nov/26": o rótulo curto do mês no gráfico. */
export function mesCurto(mes: string): string {
  return `${nomeDoMes(mes).slice(0, 3)}/${mes.slice(2, 4)}`;
}

/** O filtro do endereço: a rede inteira (padrão) ou uma loja. */
export type FiltroDoResultado = { tipo: "rede" } | { tipo: "loja"; id: string };
export const filtroDoResultado = (valor: unknown): FiltroDoResultado => (typeof valor === "string" && ehUuid(valor) ? { tipo: "loja", id: valor } : { tipo: "rede" });

/** Parte da receita líquida, para o "% da receita" de cada linha; sem receita positiva, não há percentual. */
export const daReceita = (valor: number, receita: number): number | null => (receita > 0 ? valor / receita : null);
