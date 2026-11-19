#!/usr/bin/env node
// Medida da pré-carga das telas (lote VEL-h: ORA-QUAL-010; o sim do proprietário de 19/11 a medir e deixar mais leve a
// pré-carga do menu; a orientação de 18/11: "medir antes/depois em celular autenticado"). Entra com uma conta de teste e,
// só lendo:
//   1. conta os pedidos de pré-carga (cabeçalho Next-Router-Prefetch) que cada tela dispara nos 4 s depois de abrir, num
//      celular de 360 px (com toque) e num computador de 1280 px (o menu lateral aparece);
//   2. cronometra o toque até a tela nova aparecer, no celular, depois de 4 s parado na tela de origem: um atalho da barra
//      de baixo (Vendas → Início), uma linha da lista (Vendas → o comprovante) e um item do "Mais" (→ Estoque).
// No fim, sai. As idas ao banco de cada pré-carga saem do log de tempos da homologação (contar as linhas [tempos] antes e
// depois da medida).
//
// As contas vêm do arquivo protegido do servidor (~/homologacao/contas-de-teste.txt, permissão 600), uma por linha:
// "<nome> | <e-mail> | <senha> | ...". O script não imprime e-mail nem senha.
//
// Uso (da raiz): node scripts/medir-pre-carga.mjs https://ora5g.com.br ~/homologacao/contas-de-teste.txt "Gerente (teste)"
//                VEZES=5 node scripts/medir-pre-carga.mjs ...   (padrão: 5)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/plataforma/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const [base, arquivo, nome] = process.argv.slice(2);
if (!base || !arquivo || !nome) {
  console.error('Uso: node scripts/medir-pre-carga.mjs <endereço base> <arquivo das contas> "<conta>"');
  process.exit(1);
}
const url = base.replace(/\/+$/, "");
const VEZES = Math.max(1, Number(process.env.VEZES ?? 5));
const PARADO_MS = 4000;
const conta = readFileSync(arquivo, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => l.split(" | ").map((c) => c.trim())).find(([n]) => n === nome);
if (!conta) {
  console.error(`A conta ${nome} não está no arquivo.`);
  process.exit(1);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const mediana = (valores) => {
  const ordem = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordem.length / 2);
  return ordem.length % 2 ? ordem[meio] : (ordem[meio - 1] + ordem[meio]) / 2;
};

const navegador = await chromium.launch();

/** Um aparelho com a conta já dentro (a conta de uma loja só cai direto no Início). */
async function aparelho(opcoes) {
  const contexto = await navegador.newContext(opcoes);
  const pagina = await contexto.newPage();
  const preCargas = [];
  pagina.on("request", (r) => { if (r.headers()["next-router-prefetch"]) preCargas.push(new URL(r.url()).pathname); });
  await pagina.goto(`${url}/entrar`);
  await pagina.getByLabel("E-mail", { exact: true }).fill(conta[1]);
  await pagina.getByLabel("Senha", { exact: true }).fill(conta[2]);
  await pagina.getByRole("button", { name: "Entrar na plataforma" }).click();
  await pagina.waitForURL(/\/inicio/, { timeout: 30_000 });
  return { contexto, pagina, preCargas };
}

/** A largura da página (mais de 360 px no celular: algo passou da tela) e se a barra de baixo está à vista. */
const largura = (pagina) => pagina.evaluate(() => {
  const barra = document.querySelector('nav[aria-label="Atalhos"]')?.getBoundingClientRect();
  return { largura: innerWidth, barraAVista: barra ? barra.bottom <= (visualViewport?.height ?? innerHeight) + 1 : null };
});

/** Os pedidos de pré-carga de cada tela, nos 4 s depois de abrir (a mediana de 3 aberturas), e a largura dela. */
async function contarPreCargas({ pagina, preCargas }, telas) {
  const resultado = {};
  for (const tela of telas) {
    const vezes = [];
    for (let i = 0; i < 3; i++) {
      await pagina.goto(`${url}${tela}`, { waitUntil: "load" });
      preCargas.length = 0;
      await espera(PARADO_MS);
      vezes.push(preCargas.length);
    }
    resultado[tela] = { mediana: mediana(vezes), enderecos: [...new Set(preCargas)].length, ...(await largura(pagina)) };
  }
  return resultado;
}

/** Do toque até a tela nova aparecer, depois de PARADO_MS na tela de origem (e do que `preparar` faz antes do toque). */
async function cronometrar(pagina, origem, preparar, tocar, destino) {
  const tempos = [];
  for (let i = 0; i < VEZES; i++) {
    await pagina.goto(`${url}${origem}`, { waitUntil: "load" });
    await espera(PARADO_MS);
    await preparar();
    const inicio = performance.now();
    await tocar();
    await destino().waitFor({ state: "visible", timeout: 30_000 });
    tempos.push(Math.round(performance.now() - inicio));
  }
  return { mediana: mediana(tempos), menor: Math.min(...tempos), maior: Math.max(...tempos) };
}

const celular = await aparelho({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
const computador = await aparelho({ viewport: { width: 1280, height: 800 } });
try {
  const telas = ["/inicio", "/vendas?periodo=30", "/estoque"];
  const noCelular = await contarPreCargas(celular, telas);
  const noComputador = await contarPreCargas(computador, telas);
  for (const tela of telas) {
    console.log(`${tela}: pré-cargas nos ${PARADO_MS / 1000} s depois de abrir: celular ${noCelular[tela].mediana} (${noCelular[tela].enderecos} telas),`
      + ` computador ${noComputador[tela].mediana} (${noComputador[tela].enderecos} telas); no celular, a página tem ${noCelular[tela].largura} px`
      + ` e a barra de baixo ${noCelular[tela].barraAVista ? "está à vista" : "fica fora da vista"}`);
  }

  const p = celular.pagina;
  const nada = async () => undefined;
  const texto = (t) => (t ? `mediana ${t.mediana} ms (de ${t.menor} a ${t.maior})` : "não dá para tocar: a barra de baixo fica fora da vista");
  const linha = await cronometrar(p, "/vendas?periodo=30", nada,
    () => p.locator('a[href^="/vendas/"]').filter({ hasText: "Nº" }).first().tap(),
    () => p.getByRole("heading", { level: 2, name: /^Venda nº \d+$/ }));
  // A barra de baixo (o atalho e o "Mais") só se toca à vista: com a página mais larga que o celular, ela fica abaixo da tela.
  const aVista = noCelular["/vendas?periodo=30"].barraAVista;
  const barra = aVista ? await cronometrar(p, "/vendas?periodo=30", nada,
    () => p.getByRole("navigation", { name: "Atalhos" }).getByRole("link", { name: "Início" }).tap(),
    () => p.getByRole("heading", { level: 2, name: "Acompanhamento das vendas" })) : null;
  const mais = aVista ? await cronometrar(p, "/vendas?periodo=30",
    async () => {
      await p.getByRole("button", { name: /Mais/ }).tap();
      await p.getByRole("dialog", { name: "Todas as telas" }).waitFor({ state: "visible" });
      await espera(1500);
    },
    () => p.getByRole("dialog", { name: "Todas as telas" }).getByRole("link", { name: "Estoque e conferência" }).tap(),
    () => p.getByRole("heading", { level: 2, name: "Saldo da loja" })) : null;
  console.log(`toque no celular, ${VEZES} vezes: barra de baixo (Vendas → Início) ${texto(barra)}; linha da lista (Vendas → comprovante)`
    + ` ${texto(linha)}; item do "Mais" (→ Estoque, tocado 1,5 s depois de abrir a lista) ${texto(mais)}`);
} finally {
  for (const { contexto, pagina } of [celular, computador]) {
    await pagina.goto(`${url}/sair`).catch(() => undefined);
    await contexto.close();
  }
  await navegador.close();
}
