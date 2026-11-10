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
