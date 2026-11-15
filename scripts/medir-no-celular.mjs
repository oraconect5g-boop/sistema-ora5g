#!/usr/bin/env node
// Medida das telas num celular simulado (lote QUAL-010a: ORA-QUAL-010). Abre cada endereço no Chromium do Playwright
// como um celular (tela de 360 px, toque), com o processador 4 vezes mais lento e a rede de um 4G lento (os valores
// do "Slow 4G" do Lighthouse: 150 ms de ida e volta, 1,6 Mbit/s para baixar e 750 kbit/s para subir), sem cache, e
// anota o tempo até o primeiro byte, o primeiro desenho, o maior desenho (LCP), o bloqueio da tela por JavaScript
// (soma das tarefas longas acima de 50 ms) e quanto foi baixado. Cada endereço é medido VEZES vezes; vale a mediana.
// Não substitui o teste no aparelho e na internet da loja (piloto): serve para comparar versões e com as metas.
//
// Uso (da raiz): node scripts/medir-no-celular.mjs https://ora5g.com.br /entrar /demo/vender [...]
//                VEZES=5 node scripts/medir-no-celular.mjs ...   (padrão: 3)
//                REDE=livre node scripts/medir-no-celular.mjs ... (sem limitar a rede e o processador, para comparar)
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/plataforma/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const [base, ...rotas] = process.argv.slice(2);
if (!base || rotas.length === 0) {
  console.error("Uso: node scripts/medir-no-celular.mjs <endereço base> <rota> [<rota> ...]");
  process.exit(1);
}
const VEZES = Math.max(1, Number(process.env.VEZES ?? 3));
const LIVRE = process.env.REDE === "livre";
const QUATRO_G_LENTO = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

const mediana = (valores) => {
  const ordem = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordem.length / 2);
  return ordem.length % 2 ? ordem[meio] : (ordem[meio - 1] + ordem[meio]) / 2;
};

async function medir(navegador, endereco) {
  const contexto = await navegador.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const pagina = await contexto.newPage();
  const cdp = await contexto.newCDPSession(pagina);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (!LIVRE) {
    await cdp.send("Network.emulateNetworkConditions", QUATRO_G_LENTO);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  // Os observadores entram antes do primeiro script da página.
  await pagina.addInitScript(() => {
    const w = window;
    w.__medida = { lcp: 0, bloqueio: 0 };
    new PerformanceObserver((lista) => { for (const e of lista.getEntries()) w.__medida.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((lista) => { for (const e of lista.getEntries()) w.__medida.bloqueio += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true });
  });
  const resposta = await pagina.goto(endereco, { waitUntil: "load", timeout: 120_000 });
  await pagina.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
  // O LCP só fecha com uma interação ou com a página escondida; um toque neutro encerra a observação.
  await pagina.mouse.click(1, 1).catch(() => undefined);
  const medida = await pagina.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const recursos = performance.getEntriesByType("resource");
    const js = recursos.filter((r) => r.initiatorType === "script" || /\.js(\?|$)/.test(r.name)).reduce((t, r) => t + (r.transferSize || 0), 0);
    const total = recursos.reduce((t, r) => t + (r.transferSize || 0), nav ? nav.transferSize || 0 : 0);
    return {
      primeiroByte: nav ? nav.responseStart : 0,
      primeiroDesenho: fcp ? fcp.startTime : 0,
      maiorDesenho: window.__medida.lcp,
      bloqueio: window.__medida.bloqueio,
      carregada: nav ? nav.loadEventEnd : 0,
      baixadoKb: total / 1024,
      jsKb: js / 1024,
    };
  });
  await contexto.close();
  return { situacao: resposta?.status() ?? 0, ...medida };
}

const navegador = await chromium.launch();
console.log(`Celular simulado: 360 px, ${LIVRE ? "sem limitar rede e processador" : "processador 4x mais lento, 4G lento (150 ms, 1,6 Mbit/s)"}; ${VEZES} medida(s) por tela, mediana.`);
console.log("tela".padEnd(24) + "HTTP".padStart(5) + "1º byte".padStart(9) + "1º desenho".padStart(12) + "LCP".padStart(8) + "bloqueio".padStart(10) + "carregada".padStart(11) + "baixado".padStart(10) + "JS".padStart(8));
const resultado = [];
for (const rota of rotas) {
  const medidas = [];
  for (let i = 0; i < VEZES; i++) medidas.push(await medir(navegador, new URL(rota, base).toString()));
  const m = (campo) => mediana(medidas.map((x) => x[campo]));
  const linha = { rota, situacao: medidas[0].situacao, primeiroByte: m("primeiroByte"), primeiroDesenho: m("primeiroDesenho"), maiorDesenho: m("maiorDesenho"), bloqueio: m("bloqueio"), carregada: m("carregada"), baixadoKb: m("baixadoKb"), jsKb: m("jsKb") };
  resultado.push(linha);
  const ms = (v) => `${(v / 1000).toFixed(2)} s`;
  console.log(rota.padEnd(24) + String(linha.situacao).padStart(5) + ms(linha.primeiroByte).padStart(9) + ms(linha.primeiroDesenho).padStart(12) + ms(linha.maiorDesenho).padStart(8)
    + `${Math.round(linha.bloqueio)} ms`.padStart(10) + ms(linha.carregada).padStart(11) + `${Math.round(linha.baixadoKb)} KB`.padStart(10) + `${Math.round(linha.jsKb)} KB`.padStart(8));
}
await navegador.close();
if (process.env.JSON) console.log(JSON.stringify(resultado));
