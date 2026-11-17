// Gera os ícones do site instalável (lote PWA-a; plano de 16/11, Onda 1, item 7) a partir do mesmo desenho de
// apps/plataforma/src/app/icon.svg: o "5G" verde-água sobre o azul-escuro da marca. Usa o Chromium do Playwright.
// Uso: node scripts/gerar-icones-do-app.mjs   (grava em apps/plataforma/public/icones/ e src/app/apple-icon.png)
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const PLATAFORMA = join(import.meta.dirname, "..", "apps", "plataforma");
const PASTA = join(PLATAFORMA, "public", "icones");
const FUNDO = "#0a1322";
const COR = "#13d9c7";
// "arredondado": o ícone comum (cantos transparentes); "cheio": o quadrado inteiro, para o sistema recortar (maskable e Apple).
const ICONES = [
  { arquivo: "icone-192.png", lado: 192, forma: "arredondado", letra: 0.42 },
  { arquivo: "icone-512.png", lado: 512, forma: "arredondado", letra: 0.42 },
  { arquivo: "icone-mascaravel-512.png", lado: 512, forma: "cheio", letra: 0.3 },
  // O do iPhone vai para src/app/apple-icon.png: o Next põe o <link rel="apple-touch-icon"> sozinho.
  { arquivo: join("..", "..", "src", "app", "apple-icon.png"), lado: 180, forma: "cheio", letra: 0.4 },
];

mkdirSync(PASTA, { recursive: true });
const navegador = await chromium.launch();
const pagina = await navegador.newPage({ deviceScaleFactor: 1 });
for (const i of ICONES) {
  const raio = i.forma === "arredondado" ? Math.round(i.lado * 0.22) : 0;
  await pagina.setContent(`<html><body style="margin:0;background:transparent">
    <div id="icone" style="width:${i.lado}px;height:${i.lado}px;display:grid;place-items:center;background:${FUNDO};border-radius:${raio}px">
      <span style="font:800 ${Math.round(i.lado * i.letra)}px 'DejaVu Sans', Arial, sans-serif;color:${COR};letter-spacing:-0.04em;line-height:1">5G</span>
    </div></body></html>`);
  await pagina.locator("#icone").screenshot({ path: join(PASTA, i.arquivo), omitBackground: true });
  console.log("gravado:", i.arquivo);
}
await navegador.close();
