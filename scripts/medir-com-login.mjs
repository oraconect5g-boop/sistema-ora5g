#!/usr/bin/env node
// Medida das telas com login no site no ar (lote VEL-d: ORA-QUAL-010; a orientação do proprietário de 18/11/2026:
// "medir antes/depois em celular autenticado"). Entra com uma conta de teste num celular simulado (tela de 360 px, toque,
// sem limitar a rede) e abre cada tela VEZES vezes, só lendo; no fim, sai. Imprime, por tela, a mediana do tempo até o
// servidor começar a responder e até a tela terminar de carregar. As idas ao banco de cada abertura saem do log de tempos
// da homologação (scripts/idas-por-tela.mjs), quando ele está ligado.
//
// As contas vêm de um arquivo protegido do servidor (~/homologacao/contas-de-teste.txt, permissão 600), uma por linha:
// "<nome> | <e-mail> | <senha> | ...". O script não imprime e-mail nem senha.
//
// Uso (da raiz): node scripts/medir-com-login.mjs https://ora5g.com.br ~/homologacao/contas-de-teste.txt \
//                  "Vendedor (teste)=/catalogo,/estoque" "Gerente (teste)=/inicio"
//                VEZES=5 node scripts/medir-com-login.mjs ...   (padrão: 3)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/plataforma/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const [base, arquivo, ...pedidos] = process.argv.slice(2);
if (!base || !arquivo || pedidos.length === 0) {
  console.error('Uso: node scripts/medir-com-login.mjs <endereço base> <arquivo das contas> "<conta>=<tela>,<tela>" [...]');
  process.exit(1);
}
const url = base.replace(/\/+$/, "");
const VEZES = Math.max(1, Number(process.env.VEZES ?? 3));
const contas = new Map(readFileSync(arquivo, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => l.split(" | ").map((c) => c.trim())).map(([nome, email, senha]) => [nome, { email, senha }]));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const mediana = (valores) => {
  const ordem = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordem.length / 2);
  return ordem.length % 2 ? ordem[meio] : (ordem[meio - 1] + ordem[meio]) / 2;
};

const navegador = await chromium.launch();
try {
  for (const pedido of pedidos) {
    const corte = pedido.lastIndexOf("=");
    const nome = pedido.slice(0, corte);
    const conta = contas.get(nome);
    if (corte < 1 || !conta?.email || !conta.senha) {
      console.log(`${nome || pedido}: conta não achada no arquivo`);
      continue;
    }
    const contexto = await navegador.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
    const pagina = await contexto.newPage();
    await pagina.goto(`${url}/entrar`);
    await pagina.getByLabel("E-mail", { exact: true }).fill(conta.email);
    await pagina.getByLabel("Senha", { exact: true }).fill(conta.senha);
    await pagina.getByRole("button", { name: "Entrar na plataforma" }).click();
    await pagina.waitForURL(/\/(inicio|escolher-loja)/);
    if (new URL(pagina.url()).pathname.startsWith("/escolher-loja")) {
      // Mais de uma loja: a medida não escolhe por ninguém. Use uma conta de uma loja só.
      console.log(`${nome}: a conta pede a escolha da loja; não medida`);
      await pagina.goto(`${url}/sair`);
      await contexto.close();
      continue;
    }
    await espera(2000);
    for (const tela of pedido.slice(corte + 1).split(",").filter(Boolean)) {
      const medidas = [];
      for (let i = 0; i < VEZES; i++) {
        const resposta = await pagina.goto(url + tela, { waitUntil: "load" });
        const tempos = await pagina.evaluate(() => {
          const n = performance.getEntriesByType("navigation")[0];
          return { servidor: n.responseStart - n.requestStart, tela: n.loadEventEnd - n.startTime };
        });
        medidas.push({ ...tempos, status: resposta?.status(), final: new URL(pagina.url()).pathname });
        await espera(1500);
      }
      const finais = [...new Set(medidas.map((m) => m.final))].join(",");
      const status = [...new Set(medidas.map((m) => m.status))].join(",");
      console.log(`${nome} ${tela}: servidor ${mediana(medidas.map((m) => m.servidor)).toFixed(0)} ms, tela ${mediana(medidas.map((m) => m.tela)).toFixed(0)} ms`
        + ` (mediana de ${VEZES}; ficou em ${finais}; status ${status})`);
    }
    await pagina.goto(`${url}/sair`);
    await contexto.close();
  }
} finally {
  await navegador.close();
}
