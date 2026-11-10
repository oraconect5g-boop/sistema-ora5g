// Versão visível nas telas (pedido do proprietário em 10/11/2026): conferir na hora qual versão está
// no ar, sem acesso ao servidor. O número vem do package.json; o commit e a hora da build são gravados
// na build pelo next.config.ts (NEXT_PUBLIC_ORA_COMMIT e NEXT_PUBLIC_ORA_BUILD).
import pacote from "../../package.json";

export type DadosDaVersao = { numero: string; commit: string; build: string };

export const VERSAO: DadosDaVersao = {
  numero: pacote.version,
  commit: process.env.NEXT_PUBLIC_ORA_COMMIT || "local",
  build: process.env.NEXT_PUBLIC_ORA_BUILD || "",
};

const FORMATO_DA_BUILD = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "v0.1.0 · eb0a947 · build 10/11/2026 18:05" (horário de São Paulo). Sem build válida, sai só o resto. */
export function textoDaVersao(dados: DadosDaVersao = VERSAO): string {
  const instante = dados.build ? new Date(dados.build) : null;
  const quando = instante && !Number.isNaN(instante.getTime()) ? `build ${FORMATO_DA_BUILD.format(instante).replace(",", "")}` : "";
  return [`v${dados.numero}`, dados.commit, quando].filter(Boolean).join(" · ");
}
