// Previsão de caixa (lote L8c): regras puras, usadas no servidor e no navegador (o simulador). O banco
// devolve só fatos (public.previsao_de_caixa); a estimativa, a simulação e o saldo previsto são contas
// daqui, com as premissas escritas na tela. O saldo digitado nunca sai do navegador.
import { lerReais } from "@ora5g/dominio";

/** Horizontes que a tela oferece (o banco aceita de 1 a 13 semanas). */
export const HORIZONTES = [4, 8, 13] as const;
export type Horizonte = (typeof HORIZONTES)[number];
export const horizonteDoEndereco = (valor: unknown): Horizonte => {
  const n = Number(valor);
  return (HORIZONTES as readonly number[]).includes(n) ? (n as Horizonte) : 8;
};

/** Simulação das vendas: de 30% a menos a 30% a mais, de 10 em 10. */
export const AJUSTES = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3] as const;

export type SemanaBase = { inicio: string; fim: string; recebido: number; devolvido: number; saidasCaixa: number };
export type SemanaFutura = { inicio: string; fim: string; contas: number; quantidade: number };

/** O que uma semana passada deixou de dinheiro: o recebido menos as devoluções pagas e as saídas do caixa. */
export const liquidoDaSemana = (b: SemanaBase) => b.recebido - b.devolvido - b.saidasCaixa;

export type Estimativa = { media: number; semanas: number; de: string; ate: string };
/**
 * A estimativa semanal: a média das semanas passadas a partir da primeira com movimento (loja nova não é
 * puxada para baixo pelas semanas em que ainda não vendia). Sem movimento nenhum, não há estimativa.
 */
export function estimativa(base: readonly SemanaBase[]): Estimativa | null {
  const primeira = base.findIndex((b) => b.recebido !== 0 || b.devolvido !== 0 || b.saidasCaixa !== 0);
  if (primeira < 0) return null;
  const consideradas = base.slice(primeira);
  const total = consideradas.reduce((s, b) => s + liquidoDaSemana(b), 0);
  return { media: Math.round(total / consideradas.length) + 0, semanas: consideradas.length, de: consideradas[0]?.inicio ?? "", ate: consideradas.at(-1)?.fim ?? "" };
}

export type LinhaProjetada = { inicio: string; fim: string; entra: number; sai: number; vencidas: number; diferenca: number; saldo: number | null };
/**
 * A projeção semana a semana: a entrada estimada (com a simulação) igual em toda semana; as contas que
 * vencem em cada uma, com as já vencidas na primeira; o saldo acumulado a partir do saldo de partida
 * (sem saldo, só a diferença de cada semana).
 */
export function projetar(semanas: readonly SemanaFutura[], vencidas: number, media: number | null, ajuste: number, saldo: number | null): LinhaProjetada[] {
  const entra = media === null ? 0 : Math.round(media * (1 + ajuste)) + 0;
  let acumulado = saldo;
  return semanas.map((s, i) => {
    const vencidasAqui = i === 0 ? vencidas : 0;
    const sai = s.contas + vencidasAqui;
    const diferenca = entra - sai;
    acumulado = acumulado === null ? null : acumulado + diferenca;
    return { inicio: s.inicio, fim: s.fim, entra, sai, vencidas: vencidasAqui, diferenca, saldo: acumulado };
  });
}

/** O saldo digitado: "25.000,00", "R$ 25000", "-1.500,00" (negativo). Vazio: null; inválido: undefined. */
export function lerSaldo(texto: string): number | null | undefined {
  const limpo = texto.trim();
  if (limpo === "") return null;
  const negativo = /^[-−]/.test(limpo);
  try {
    const centavos = lerReais(limpo.replace(/^[-−]\s*/, ""));
    return negativo ? -centavos + 0 : centavos;
  } catch {
    return undefined;
  }
}

/** "2026-11-13" → "13/11". */
export const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** O dia `n` dias depois (ou antes) de outro, no calendário. */
export const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
