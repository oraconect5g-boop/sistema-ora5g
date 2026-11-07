// Uso:
//   node packages/config/scripts/procurar-segredos.ts                 confere os arquivos do Git
//   node packages/config/scripts/procurar-segredos.ts --historico A..B confere linhas adicionadas no intervalo
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

import { arquivoProibido, procurarNoHistorico, procurarNoTexto, type Achado } from "../src/segredos.ts";

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const indice = process.argv.indexOf("--historico");
let achados: Achado[] = [];

if (indice !== -1) {
  const intervalo = process.argv[indice + 1];
  if (!intervalo) throw new Error("Informe o intervalo, ex.: --historico origin/main..HEAD");
  achados = procurarNoHistorico(git("log", "-p", "--no-color", "--no-ext-diff", "--format=commit:%H", intervalo));
} else {
  const arquivos = git("ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0").filter(Boolean);
  for (const arquivo of arquivos) {
    if (arquivoProibido(arquivo)) {
      achados.push({ arquivo, linha: 0, regra: "arquivo-proibido", descricao: "arquivo que não pode ir para o Git" });
      continue;
    }
    let tamanho = 0;
    try {
      tamanho = statSync(arquivo).size;
    } catch {
      continue; // apagado na copia de trabalho
    }
    if (tamanho > 2 * 1024 * 1024) continue;
    achados.push(...procurarNoTexto(arquivo, readFileSync(arquivo, "utf8")));
  }
}

if (achados.length > 0) {
  console.error(`Possíveis segredos encontrados (${achados.length}). Os valores não são exibidos.`);
  for (const a of achados) console.error(`  ${a.arquivo}:${a.linha}  [${a.regra}] ${a.descricao}`);
  console.error("Remova o segredo, troque a chave no fornecedor se ela já foi enviada e tente de novo.");
  process.exit(1);
}
console.log("Nenhum segredo encontrado.");
