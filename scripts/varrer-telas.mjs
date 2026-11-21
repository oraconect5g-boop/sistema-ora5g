#!/usr/bin/env node
// Varredura das telas com login no site no ar (o pedido do proprietário de 20/11/2026: "quero que todas as funcionalidades
// do sistema funcionem"). Entra com uma conta de teste num celular de 360 px e visita, só lendo, toda tela que os links
// alcançam a partir do Início, até a profundidade dada: o menu (a lista do "Mais"), os atalhos, os cartões e os links de
// cada tela. Em cada uma, anota o que não funciona: a resposta de erro do servidor, a página de erro ou de "não
// encontrada", os avisos de falha ou de indisponível que a tela mostra e os erros do navegador. Não envia formulário
// nenhum. No fim, sai.
//
// Não pré-carrega (o navegador recusa os pedidos Next-Router-Prefetch) e espera PAUSA_MS entre uma tela e outra: o banco
// de teste é pequeno (o plano Micro do Supabase; seção 4.13 de docs/operacao/DESEMPENHO_NO_CELULAR.md).
//
// As contas vêm do arquivo protegido do servidor (~/homologacao/contas-de-teste.txt, permissão 600). O script não imprime
// e-mail nem senha.
//
// Uso (da raiz): node scripts/varrer-telas.mjs https://ora5g.com.br ~/homologacao/contas-de-teste.txt "Gerente (teste)" \
//                  [loja para quem escolhe] > varredura.json
//                PROFUNDIDADE=2 LIMITE=200 PAUSA_MS=800 node scripts/varrer-telas.mjs ...
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/plataforma/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const [base, arquivo, nome, loja] = process.argv.slice(2);
if (!base || !arquivo || !nome) {
  console.error('Uso: node scripts/varrer-telas.mjs <endereço base> <arquivo das contas> "<conta>" [loja]');
  process.exit(1);
}
const url = base.replace(/\/+$/, "");
const PROFUNDIDADE = Number(process.env.PROFUNDIDADE ?? 2);
const LIMITE = Number(process.env.LIMITE ?? 200);
const PAUSA_MS = Number(process.env.PAUSA_MS ?? 800);
const conta = readFileSync(arquivo, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => l.split(" | ").map((c) => c.trim())).find(([n]) => n === nome);
if (!conta) {
  console.error(`A conta ${nome} não está no arquivo.`);
  process.exit(1);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Endereços que não se visitam: saem da conta, mudam a loja da sessão, baixam arquivo ou são da demonstração.
const FORA = [/^\/sair/, /^\/entrar/, /^\/escolher-loja/, /\/exportar(\/|$|\?)/, /^\/demo/, /^\/api\//, /\.(csv|xlsx|pdf|xml|zip)(\?|$)/];
// Avisos que a tela mostra quando algo não funciona (o texto de cada um vai para a lista, para conferir).
const AVISOS = /não deu para|indisponível|falhou|falha (na|ao|da|de)|tente de novo|tentar de novo|erro inesperado|algo deu errado|sem resposta do banco|não foi possível/i;

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
await contexto.route("**/*", (r) => (r.request().headers()["next-router-prefetch"] ? r.abort() : r.continue()));
const pagina = await contexto.newPage();
const errosDoNavegador = [];
pagina.on("pageerror", (e) => errosDoNavegador.push(String(e.message).slice(0, 200)));
// "net::ERR_FAILED" é a pré-carga que o próprio navegador da varredura recusa (acima); não conta como erro da tela.
pagina.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_FAILED")) errosDoNavegador.push(m.text().slice(0, 200)); });
const respostasRuins = [];
pagina.on("response", (r) => {
  const u = new URL(r.url());
  if (r.status() >= 400 && u.origin === url && !u.pathname.startsWith("/_next/static")) respostasRuins.push(`${r.status()} ${u.pathname}${u.search}`);
});

const relatorio = { conta: nome, inicio: new Date().toISOString(), telas: [] };
try {
  await pagina.goto(`${url}/entrar`);
  await pagina.getByLabel("E-mail", { exact: true }).fill(conta[1]);
  await pagina.getByLabel("Senha", { exact: true }).fill(conta[2]);
  await pagina.getByRole("button", { name: "Entrar na plataforma" }).click();
  try {
    await pagina.waitForURL(/\/inicio/, { timeout: 15_000 });
  } catch {
    await pagina.getByRole("button", { name: new RegExp((loja ?? "").replace(/[()]/g, "\\$&")) }).click();
    await pagina.waitForURL(/\/inicio/, { timeout: 30_000 });
  }

  const vistos = new Set();
  let fila = [{ caminho: "/inicio", nivel: 0, de: null }];
  while (fila.length && vistos.size < LIMITE) {
    const { caminho, nivel, de } = fila.shift();
    // O molde do endereço: sem os filtros (?...) e com os ids trocados por :id. De cada molde, bastam 3 endereços (as
    // variações de filtro) ou 2 (as telas de um registro, /vendas/:id).
    const chave = caminho.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id");
    const doMolde = [...vistos].filter((v) => v.molde === chave).length;
    if ([...vistos].some((v) => v.caminho === caminho) || doMolde >= (chave.includes(":id") ? 2 : 3)) continue;
    vistos.add({ caminho, molde: chave });
    errosDoNavegador.length = 0;
    respostasRuins.length = 0;
    const tela = { caminho, nivel, de, status: null, titulo: null, problemas: [] };
    try {
      const resposta = await pagina.goto(`${url}${caminho}`, { waitUntil: "load", timeout: 45_000 });
      tela.status = resposta?.status() ?? null;
      // A rede nunca fica parada (o sino lê as pendências de tempos em tempos): espera só o conteúdo que chega em partes.
      await pagina.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => undefined);
      await espera(800);
      tela.final = new URL(pagina.url()).pathname + new URL(pagina.url()).search;
      tela.titulo = (await pagina.locator("h1").first().textContent({ timeout: 3000 }).catch(() => null))?.trim() ?? null;
      if (tela.status && tela.status >= 400) tela.problemas.push(`resposta ${tela.status}`);
      if (/^Página não encontrada$/.test(tela.titulo ?? "")) tela.problemas.push("página não encontrada");
      const corpo = await pagina.locator("main").first().innerText({ timeout: 3000 }).catch(() => "");
      if (/algo deu errado|erro inesperado/i.test(corpo)) tela.problemas.push("página de erro");
      const avisos = [...new Set(corpo.split("\n").map((l) => l.trim()).filter((l) => AVISOS.test(l)))].slice(0, 6);
      for (const a of avisos) tela.problemas.push(`aviso: ${a.slice(0, 220)}`);
      for (const e of [...new Set(errosDoNavegador)].slice(0, 4)) tela.problemas.push(`navegador: ${e}`);
      for (const r of [...new Set(respostasRuins)].slice(0, 4)) tela.problemas.push(`pedido: ${r}`);
      if (nivel < PROFUNDIDADE) {
        const links = await pagina.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")).filter(Boolean));
        for (const href of links) {
          if (!href.startsWith("/") || href.startsWith("//")) continue;
          const sem = href.split("#")[0];
          if (!sem || FORA.some((f) => f.test(sem))) continue;
          fila.push({ caminho: sem, nivel: nivel + 1, de: caminho });
        }
      }
    } catch (erro) {
      tela.problemas.push(`não abriu: ${String(erro.message).split("\n")[0].slice(0, 200)}`);
    }
    relatorio.telas.push(tela);
    process.stderr.write(`${tela.problemas.length ? "×" : "·"} ${caminho}${tela.problemas.length ? ` (${tela.problemas.length})` : ""}\n`);
    await espera(PAUSA_MS);
  }
} finally {
  await pagina.goto(`${url}/sair`).catch(() => undefined);
  await navegador.close();
}
relatorio.fim = new Date().toISOString();
console.log(JSON.stringify(relatorio, null, 1));
