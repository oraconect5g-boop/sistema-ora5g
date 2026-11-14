// CSV para o Excel em português (ORA-FIN-009): ponto e vírgula, BOM e quebra de linha do Windows.
// Fica fora de componentes de cliente para servir também à exportação feita no servidor.

// Texto que a planilha leria como fórmula (=, +, -, @, tabulação, retorno) ganha um apóstrofo na
// frente (REV-036, #38: injeção de fórmula em CSV). Número de verdade, inclusive negativo, fica igual.
const PARECE_FORMULA = /^[=+\-@\t\r]/;
const NUMERO_COMUM = /^[-+]?\d[\d.,]*$/;
export function celulaCsv(valor: string | number) {
  let texto = String(valor);
  if (typeof valor === "string" && PARECE_FORMULA.test(texto) && !NUMERO_COMUM.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

export const gerarCsv = (colunas: readonly string[], linhas: readonly (readonly (string | number)[])[]) =>
  `﻿${[colunas, ...linhas].map((linha) => linha.map(celulaCsv).join(";")).join("\r\n")}`;

/** Centavos como número decimal com vírgula ("1234,56"), sem separador de milhar: a planilha soma. */
export const centavosCsv = (centavos: number) => {
  const sinal = centavos < 0 ? "-" : "";
  const absoluto = Math.abs(centavos);
  return `${sinal}${Math.trunc(absoluto / 100)},${String(absoluto % 100).padStart(2, "0")}`;
};

/**
 * Um arquivo com várias partes (o demonstrativo, as contas por categoria...), separadas por uma linha em
 * branco, cada uma com o próprio cabeçalho. As células passam pela mesma proteção de `celulaCsv`.
 */
export type SecaoCsv = { colunas?: readonly string[]; linhas: readonly (readonly (string | number)[])[] };
export const gerarCsvEmSecoes = (secoes: readonly SecaoCsv[]) =>
  `﻿${secoes
    .map((s) => [...(s.colunas ? [s.colunas] : []), ...s.linhas].map((linha) => linha.map(celulaCsv).join(";")).join("\r\n"))
    .join("\r\n\r\n")}`;

/** Instante de geração do arquivo, em São Paulo: "13/11/2026 22:10". */
export const geradoEm = (agora: Date = new Date()) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(agora).replace(",", "");

/** Parte de nome de arquivo: "São José dos Pinhais" → "sao-jose-dos-pinhais". */
export const parteDoNome = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "arquivo";

/** "2026-11-13" → "13/11/2026". */
export const diaCsv = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
