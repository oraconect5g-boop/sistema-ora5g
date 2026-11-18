#!/usr/bin/env node
// As idas ao banco de cada tela montada com login, lidas do log de tempos da homologação (ORA_MEDIR_TEMPOS=1; ADR-010,
// decisão 6). Lote VEL-b (18/11/2026): mede o antes e o depois de cada lote de velocidade com a navegação de verdade.
//
// A tela é reconhecida pelo que ela lê (o conjunto de tabelas e funções), não pelo número do pedido: quando o menu
// pré-carrega várias telas ao mesmo tempo, a ordem dos números não liga o pedido à montagem. A pré-carga do menu (só o
// molde da sessão) fica de fora. O log não traz corpo, cabeçalho, token, chave nem o endereço do projeto.
//
// Uso: node scripts/idas-por-tela.mjs [arquivo do log] [--desde <número da linha>] [--mais <quantos grupos>]
//   O padrão é ~/homologacao/logs/plataforma.log, desde a primeira linha, com os 25 grupos mais vistos.
//   Para medir só depois de uma publicação: --desde com o número da linha em que ela começou (wc -l antes de publicar).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const argumentos = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = argumentos.indexOf(nome);
  return i >= 0 ? Number(argumentos[i + 1]) : padrao;
};
const arquivo = argumentos.find((a, i) => !a.startsWith("--") && !argumentos[i - 1]?.startsWith("--")) ?? join(homedir(), "homologacao/logs/plataforma.log");
const desde = opcao("--desde", 0);
const mais = opcao("--mais", 25);

const idas = new Map();
for (const linha of readFileSync(arquivo, "utf8").split("\n").slice(desde)) {
  const m = /^\[tempos\] c(\d+) #\d+ \+(\d+)ms (\d+)ms \d+ \w+ (\S+)/.exec(linha);
  if (!m) continue;
  const lista = idas.get(m[1]) ?? [];
  lista.push({ inicio: Number(m[2]), duracao: Number(m[3]), caminho: m[4].replace("/rest/v1/", "") });
  idas.set(m[1], lista);
}

/** Esperas em fila: a ida que sai depois de a anterior responder começa uma rodada nova. */
function rodadas(lista) {
  let fim = -1;
  let n = 0;
  for (const { inicio, duracao } of [...lista].sort((a, b) => a.inicio - b.inicio)) {
    if (inicio >= fim - 5) {
      n += 1;
      fim = inicio + duracao;
    } else {
      fim = Math.max(fim, inicio + duracao);
    }
  }
  return n;
}
const mediana = (v) => {
  const o = [...v].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};

const grupos = new Map();
for (const lista of idas.values()) {
  if (lista.length < 2 || !lista.some((x) => x.caminho.endsWith("molde_da_sessao"))) continue;
  const contagem = new Map();
  for (const { caminho } of lista) if (!caminho.endsWith("molde_da_sessao")) contagem.set(caminho, (contagem.get(caminho) ?? 0) + 1);
  const chave = [...contagem].sort(([a], [b]) => a.localeCompare(b)).map(([c, n]) => (n > 1 ? `${c}×${n}` : c)).join(", ");
  const medidas = grupos.get(chave) ?? [];
  medidas.push({ idas: lista.length, rodadas: rodadas(lista), tempo: Math.max(...lista.map((x) => x.inicio + x.duracao)) });
  grupos.set(chave, medidas);
}

console.log(`Telas com login no log (${arquivo}, desde a linha ${desde}): ${[...grupos.values()].reduce((s, v) => s + v.length, 0)} montagens.`);
console.log("vezes | idas | rodadas | tempo no banco | o que a tela leu (além do molde da sessão)");
for (const [chave, v] of [...grupos].sort((a, b) => b[1].length - a[1].length).slice(0, mais)) {
  const tempo = `${Math.round(mediana(v.map((x) => x.tempo)))} ms`;
  console.log(`${String(v.length).padStart(5)} | ${String(mediana(v.map((x) => x.idas))).padStart(4)} | ${String(mediana(v.map((x) => x.rodadas))).padStart(7)} | ${tempo.padStart(14)} | ${chave.slice(0, 150)}`);
}
