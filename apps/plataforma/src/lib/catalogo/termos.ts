// Regras puras da busca de produto, iguais no catálogo, no estoque e no PDV (revisão de 10/11/2026).
// O termo perde o que o filtro do PostgREST interpretaria como curinga ou separador (REV-038, #40).

/** Só letras, números, espaço, hífen, ponto e barra; espaços repetidos viram um; no máximo 60. */
export function termoDaBusca(texto: string | undefined): string {
  return (texto ?? "").replace(/[^\p{L}\p{N} .\-/]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** IMEI (15 dígitos) ou ICCID (19 ou 20), só números (espaço, ponto e hífen são ignorados); o resto é nome. */
export function identificadorDigitado(texto: string): string | null {
  const digitos = texto.replace(/\D/g, "");
  return /^\d{15}$|^\d{19,20}$/.test(digitos) && /^[\d .\-]+$/.test(texto.trim()) ? digitos : null;
}

/** Filtro do PostgREST que acha o aparelho pelo IMEI ou pelo segundo IMEI, ou o chip pelo ICCID. */
export const filtroDoIdentificador = (numero: string) => `imei.eq.${numero},imei2.eq.${numero},iccid.eq.${numero}`;
