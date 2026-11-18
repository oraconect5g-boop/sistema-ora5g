// As regras da tela da conciliação com a Nogle (lote CONNECT-c; ORA-CONNECT-009): os nomes dos resultados, a leitura
// estrita dos totais gravados pelo banco e o final da linha e do ICCID (a tela não mostra o número inteiro).

export const RESULTADOS_DA_CONCILIACAO = {
  conferida: { rotulo: "Conferidas", detalhe: "a Nogle e a Ora têm a mesma operação, com o mesmo valor" },
  valor_diferente: { rotulo: "Com valor diferente", detalhe: "ligadas à operação da Ora, mas com outro valor no relatório" },
  so_na_nogle: { rotulo: "Só na Nogle", detalhe: "a Nogle registrou e a Ora não tem: pode ser a renovação feita pelo cliente, ou uma operação fora da Ora" },
  sem_identificacao: { rotulo: "Sem linha e sem ICCID", detalhe: "a linha do relatório não traz como ligar" },
} as const;
export type ResultadoDaConciliacao = keyof typeof RESULTADOS_DA_CONCILIACAO;
export const ehResultadoDaConciliacao = (v: unknown): v is ResultadoDaConciliacao => typeof v === "string" && Object.hasOwn(RESULTADOS_DA_CONCILIACAO, v);
export const SO_NA_ORA = { rotulo: "Só na Ora", detalhe: "confirmadas na Ora no período e ausentes do relatório da Nogle" } as const;
export const NOMES_DOS_RELATORIOS: Record<string, string> = { ativacoes: "Ativações", recargas: "Recargas" };

export type TotaisDaConciliacao = { linhas: number; conferidas: number; valor_diferente: number; so_na_nogle: number; sem_identificacao: number; so_aqui: number };
/** Os totais gravados pelo banco; o que faltar ou vier estranho conta zero, nunca número inventado. */
export function totaisDaConciliacao(v: unknown): TotaisDaConciliacao {
  const o = v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const n = (k: string) => (typeof o[k] === "number" && Number.isSafeInteger(o[k]) && (o[k] as number) >= 0 ? o[k] as number : 0);
  return { linhas: n("linhas"), conferidas: n("conferidas"), valor_diferente: n("valor_diferente"), so_na_nogle: n("so_na_nogle"), sem_identificacao: n("sem_identificacao"), so_aqui: n("so_aqui") };
}

/** Só o final (os 4 últimos dígitos) da linha ou do ICCID; o resto não aparece na tela. */
export const finalDoNumero = (v: unknown) => (typeof v === "string" && /^\d{4,}$/.test(v) ? `final ${v.slice(-4)}` : "—");
