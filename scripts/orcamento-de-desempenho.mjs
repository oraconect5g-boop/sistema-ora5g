#!/usr/bin/env node
// Orçamento de desempenho no celular (lote QUAL-010a: ORA-QUAL-010). Mede, no build de produção da plataforma
// (apps/plataforma/.next, depois do `npm run build`), quanto JavaScript e quanto CSS cada tela manda ao navegador na
// primeira visita, comprimido como na rede (gzip), e compara com o orçamento de docs/operacao/orcamento-de-desempenho.json.
//
// O que entra na conta de cada tela: os arquivos que o Next carrega em toda página (rootMainFiles: o React e o
// próprio Next; os polyfills ficam de fora, porque só navegador antigo os baixa) e os arquivos das entradas da tela no
// manifesto do build (o layout, a página, o erro e o "não encontrado"). É um teto do que a tela baixa, não a medida do
// tempo: o tempo no celular é medido à parte (docs/operacao/DESEMPENHO_NO_CELULAR.md).
//
// Uso: node scripts/orcamento-de-desempenho.mjs              mostra a tabela de todas as telas
//      node scripts/orcamento-de-desempenho.mjs --conferir   falha se alguma tela passar do orçamento (o CI usa este)
//      node scripts/orcamento-de-desempenho.mjs --json       a medida em JSON (para o documento)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const NEXT = join(RAIZ, "apps", "plataforma", ".next");
const ORCAMENTO = join(RAIZ, "docs", "operacao", "orcamento-de-desempenho.json");
const modo = process.argv[2] ?? "";

function falhar(mensagem) {
  console.error(`Orçamento de desempenho: ${mensagem}`);
  process.exit(1);
}

if (!existsSync(join(NEXT, "build-manifest.json"))) falhar("sem o build de produção (rode `npm run build` antes).");

const tamanhos = new Map();
/** O tamanho comprimido (gzip, nível 9) de um arquivo do build, lido uma vez só. */
function gzip(caminho) {
  if (!tamanhos.has(caminho)) {
    const arquivo = join(NEXT, caminho);
    if (!existsSync(arquivo)) falhar(`o build cita ${caminho}, que não existe (build pela metade?).`);
    tamanhos.set(caminho, gzipSync(readFileSync(arquivo), { level: 9 }).length);
  }
  return tamanhos.get(caminho);
}

/** Os manifestos das telas: server/app/<rota>/page_client-reference-manifest.js. */
function manifestos(pasta) {
  const achados = [];
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) achados.push(...manifestos(caminho));
    else if (entrada.name === "page_client-reference-manifest.js") achados.push(caminho);
  }
  return achados;
}

const manifestoDoBuild = JSON.parse(readFileSync(join(NEXT, "build-manifest.json"), "utf8"));
const comuns = manifestoDoBuild.rootMainFiles ?? [];
if (comuns.length === 0) falhar("o build-manifest.json não tem rootMainFiles (o formato do build mudou?).");

const telas = [];
for (const arquivo of manifestos(join(NEXT, "server", "app"))) {
  // O manifesto é um script que preenche globalThis.__RSC_MANIFEST; roda isolado, sem acesso a nada daqui.
  const contexto = { globalThis: {} };
  runInNewContext(readFileSync(arquivo, "utf8"), contexto, { timeout: 1000 });
  const registro = contexto.globalThis.__RSC_MANIFEST ?? {};
  for (const [chave, manifesto] of Object.entries(registro)) {
    const rota = chave.replace(/\/page$/, "") || "/";
    const js = new Set(comuns);
    for (const lista of Object.values(manifesto.entryJSFiles ?? {})) for (const c of lista) js.add(c);
    const css = new Set();
    for (const lista of Object.values(manifesto.entryCSSFiles ?? {})) for (const c of lista) if (!c.inlined) css.add(c.path);
    const somar = (conjunto) => [...conjunto].reduce((total, c) => total + gzip(c), 0);
    telas.push({ rota, jsKb: somar(js) / 1024, cssKb: somar(css) / 1024, arquivos: js.size, origem: relative(NEXT, arquivo).split(sep).join("/") });
  }
}
if (telas.length === 0) falhar("nenhuma tela no build (o formato do build mudou?).");
telas.sort((a, b) => b.jsKb - a.jsKb || a.rota.localeCompare(b.rota));
const comunsKb = [...new Set(comuns)].reduce((total, c) => total + gzip(c), 0) / 1024;

if (modo === "--json") {
  console.log(JSON.stringify({ comunsKb: Number(comunsKb.toFixed(1)), telas: telas.map((t) => ({ rota: t.rota, jsKb: Number(t.jsKb.toFixed(1)), cssKb: Number(t.cssKb.toFixed(1)) })) }, null, 2));
  process.exit(0);
}

const orcamento = JSON.parse(readFileSync(ORCAMENTO, "utf8"));
const limiteDe = (rota) => {
  const excecao = orcamento.excecoes?.[rota];
  return { js: excecao?.js_gzip_max_kb ?? orcamento.js_gzip_max_kb, css: excecao?.css_gzip_max_kb ?? orcamento.css_gzip_max_kb };
};
const acima = telas.filter((t) => t.jsKb > limiteDe(t.rota).js || t.cssKb > limiteDe(t.rota).css);
for (const rota of Object.keys(orcamento.excecoes ?? {})) {
  if (!telas.some((t) => t.rota === rota)) falhar(`a exceção do orçamento cita ${rota}, que não existe mais: retire-a do arquivo.`);
}

if (modo === "--conferir") {
  if (acima.length > 0) {
    for (const t of acima) {
      const limite = limiteDe(t.rota);
      console.error(`${t.rota}: JavaScript ${t.jsKb.toFixed(1)} KB (limite ${limite.js} KB), CSS ${t.cssKb.toFixed(1)} KB (limite ${limite.css} KB)`);
    }
    falhar(`${acima.length} tela(s) acima do orçamento. Diminua o que a tela carrega ou, com motivo, mude o orçamento em docs/operacao/orcamento-de-desempenho.json.`);
  }
  const maior = telas[0];
  console.log(`Orçamento de desempenho em dia: ${telas.length} telas; a maior, ${maior.rota}, com ${maior.jsKb.toFixed(1)} KB de JavaScript (limite ${limiteDe(maior.rota).js} KB); ${comunsKb.toFixed(1)} KB são comuns a todas.`);
  process.exit(0);
}

console.log(`JavaScript comum a todas as telas (React e Next): ${comunsKb.toFixed(1)} KB comprimido.`);
console.log("tela".padEnd(42) + "JS (KB)".padStart(9) + "CSS (KB)".padStart(10) + "  limite JS");
for (const t of telas) {
  const limite = limiteDe(t.rota);
  console.log(t.rota.padEnd(42) + t.jsKb.toFixed(1).padStart(9) + t.cssKb.toFixed(1).padStart(10) + String(limite.js).padStart(11) + (t.jsKb > limite.js || t.cssKb > limite.css ? "  ACIMA" : ""));
}
