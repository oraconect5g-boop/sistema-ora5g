"use client";

import { Download } from "lucide-react";

import { classeBotao } from "./ui";

// Exporta a tabela que está na tela (ORA-FIN-009). Ponto e vírgula e BOM para abrir certo no Excel em português.
// Só exporta o que o perfil já está vendo: o filtro de permissão acontece antes, no servidor.

// Texto que a planilha leria como fórmula (=, +, -, @, tabulação, retorno) ganha um apóstrofo na
// frente (REV-036, #38: injeção de fórmula em CSV). Número de verdade, inclusive negativo, fica igual.
const PARECE_FORMULA = /^[=+\-@\t\r]/;
const NUMERO_COMUM = /^[-+]?\d[\d.,]*$/;
export function celulaCsv(valor: string | number) {
  let texto = String(valor);
  if (typeof valor === "string" && PARECE_FORMULA.test(texto) && !NUMERO_COMUM.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

export function ExportarCsv({ nomeArquivo, colunas, linhas, rotulo = "Exportar CSV" }: {
  nomeArquivo: string;
  colunas: readonly string[];
  linhas: readonly (readonly (string | number)[])[];
  rotulo?: string;
}) {
  function baixar() {
    const conteudo = [colunas, ...linhas].map((linha) => linha.map(celulaCsv).join(";")).join("\r\n");
    const arquivo = new Blob([`﻿${conteudo}`], { type: "text/csv;charset=utf-8" });
    const endereco = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = endereco;
    link.download = `ora5g-demonstracao-${nomeArquivo}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(endereco);
  }
  return (
    <button type="button" onClick={baixar} disabled={linhas.length === 0} className={classeBotao("secundario", "md")}>
      <Download aria-hidden className="size-4" /> {rotulo}
    </button>
  );
}
