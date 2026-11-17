// O site instalável (lote PWA-a; plano de 16/11, Onda 1, item 7): o manifesto, os ícones que ele cita (com o tamanho
// certo) e o service worker, rodado com um navegador SIMULADO: só a navegação GET passa por ele, e a página "sem
// internet" aparece quando a rede falha. Nada de dado guardado.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

import manifest from "./manifest";

const PUBLICA = join(process.cwd(), "public");
// Largura e altura de um PNG: os 8 bytes do cabeçalho IHDR, logo depois da assinatura.
function tamanhoDoPng(caminho: string): string {
  const b = readFileSync(caminho);
  expect(b.subarray(1, 4).toString("ascii")).toBe("PNG");
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

describe("o manifesto do site instalável", () => {
  it("abre o Início em tela cheia, em português, com as cores da marca", () => {
    expect(manifest()).toMatchObject({
      name: "Ora 5G", short_name: "Ora 5G", lang: "pt-BR", start_url: "/inicio", scope: "/", display: "standalone",
      background_color: "#0a1322", theme_color: "#10131a",
    });
  });

  it("cada ícone existe na pasta pública com o tamanho declarado, e há um recortável (maskable)", () => {
    const icones = manifest().icons ?? [];
    expect(icones.length).toBeGreaterThanOrEqual(3);
    for (const icone of icones) expect(tamanhoDoPng(join(PUBLICA, icone.src)), icone.src).toBe(icone.sizes);
    expect(icones.some((i) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
    expect(tamanhoDoPng(join(process.cwd(), "src", "app", "apple-icon.png"))).toBe("180x180");
  });
});

// O service worker de verdade (public/sw.js), num contexto simulado: os eventos que ele registra, o cache e a rede.
function montarServiceWorker(rede: (pedido: Request) => Promise<Response>, janelasAbertas: { url: string }[] = []) {
  const ouvintes: Record<string, (evento: unknown) => void> = {};
  // PWA-b: os avisos mostrados, as janelas focadas e levadas a outra tela e as abertas.
  const avisos: { titulo: string; opcoes: Record<string, unknown> }[] = [];
  const janelas: string[] = [];
  const guardados = new Map<string, Response>();
  const caches = {
    open: async () => ({ add: async (pedido: Request) => { guardados.set(new URL(pedido.url, "https://ora5g.com.br").pathname, new Response("<h1>Sem internet agora</h1>")); } }),
    keys: async () => ["ora5g-antigo", "ora5g-sem-internet-v1"],
    delete: async (nome: string) => nome === "ora5g-antigo",
    match: async (caminho: string) => guardados.get(caminho),
  };
  const self = {
    addEventListener: (tipo: string, ouvinte: (evento: unknown) => void) => { ouvintes[tipo] = ouvinte; },
    skipWaiting: () => undefined,
    location: { origin: "https://ora5g.com.br" },
    registration: { showNotification: async (titulo: string, opcoes: Record<string, unknown>) => { avisos.push({ titulo, opcoes }); } },
    clients: {
      claim: async () => undefined,
      matchAll: async () => janelasAbertas.map((j) => ({
        url: j.url, focus: async () => { janelas.push(`focada ${j.url}`); }, navigate: async (para: string) => { janelas.push(`levada a ${para}`); },
      })),
      openWindow: async (url: string) => { janelas.push(`aberta ${url}`); },
    },
  };
  // No navegador, o endereço relativo vale a partir do service worker; aqui, a partir do domínio.
  class PedidoDoNavegador extends Request {
    constructor(url: string, opcoes?: RequestInit) { super(new URL(url, "https://ora5g.com.br"), opcoes); }
  }
  runInNewContext(readFileSync(join(PUBLICA, "sw.js"), "utf8"), { self, caches, fetch: rede, Request: PedidoDoNavegador, Response, Promise, URL });
  return { ouvintes, guardados, avisos, janelas };
}
async function disparar(ouvinte: ((evento: unknown) => void) | undefined, dados: Record<string, unknown> = {}) {
  let espera: Promise<unknown> = Promise.resolve();
  let resposta: Promise<Response> | null = null;
  ouvinte?.({ ...dados, waitUntil: (p: Promise<unknown>) => { espera = p; }, respondWith: (p: Promise<Response>) => { resposta = p; } });
  await espera;
  return resposta as Promise<Response> | null;
}
const navegacao = (url: string, method = "GET") => ({ url, method, mode: "navigate" }) as unknown as Request;

describe("o service worker do site instalável", () => {
  it("ao instalar, guarda só a página sem internet; ao ativar, apaga as versões antigas", async () => {
    const { ouvintes, guardados } = montarServiceWorker(async () => new Response("ok"));
    await disparar(ouvintes.install);
    expect([...guardados.keys()]).toEqual(["/sem-internet.html"]);
    await disparar(ouvintes.activate);
  });

  it("navegação com internet vai para a rede; sem internet, mostra a página guardada", async () => {
    let online = true;
    const { ouvintes } = montarServiceWorker(async () => { if (!online) throw new TypeError("Failed to fetch"); return new Response("tela da rede"); });
    await disparar(ouvintes.install);
    expect(await (await disparar(ouvintes.fetch, { request: navegacao("https://ora5g.com.br/inicio") }))?.text()).toBe("tela da rede");
    online = false;
    expect(await (await disparar(ouvintes.fetch, { request: navegacao("https://ora5g.com.br/inicio") }))?.text()).toContain("Sem internet agora");
  });

  it("não mexe no que não é navegação GET: envio de formulário, chamadas da tela, imagens e arquivos", async () => {
    const { ouvintes } = montarServiceWorker(async () => new Response("rede"));
    expect(await disparar(ouvintes.fetch, { request: navegacao("https://ora5g.com.br/vender", "POST") })).toBeNull();
    expect(await disparar(ouvintes.fetch, { request: { url: "https://ora5g.com.br/api/pendencias", method: "GET", mode: "cors" } })).toBeNull();
    expect(await disparar(ouvintes.fetch, { request: { url: "https://ora5g.com.br/icones/icone-192.png", method: "GET", mode: "no-cors" } })).toBeNull();
  });
});

// PWA-b: o aviso no celular. O servidor manda {titulo, corpo, endereco} cifrado; o navegador entrega decifrado ao evento.
describe("o aviso no celular (PWA-b)", () => {
  const empurrao = (dados: unknown) => ({ data: { json: () => { if (dados instanceof Error) throw dados; return dados; } } });

  it("mostra o título e o texto do aviso, com o ícone do Ora 5G; o toque abre a tela da aprovação", async () => {
    const { ouvintes, avisos, janelas } = montarServiceWorker(async () => new Response("rede"));
    await disparar(ouvintes.push, empurrao({ titulo: "Desconto para aprovar", corpo: "Loja A: desconto pedido na venda nº 7", endereco: "/aprovacoes" }));
    expect(avisos).toEqual([{ titulo: "Desconto para aprovar", opcoes: {
      body: "Loja A: desconto pedido na venda nº 7", icon: "/icones/icone-192.png", badge: "/icones/icone-192.png", tag: "/aprovacoes", lang: "pt-BR", data: { endereco: "/aprovacoes" },
    } }]);
    let fechada = false;
    await disparar(ouvintes.notificationclick, { notification: { data: { endereco: "/aprovacoes" }, close: () => { fechada = true; } } });
    expect(fechada).toBe(true);
    expect(janelas).toEqual(["aberta https://ora5g.com.br/aprovacoes"]);
  });

  it("com o sistema aberto, o toque leva a janela aberta para a tela da aprovação", async () => {
    const { ouvintes, janelas } = montarServiceWorker(async () => new Response("rede"), [{ url: "https://ora5g.com.br/vender" }]);
    await disparar(ouvintes.notificationclick, { notification: { data: { endereco: "/notas" }, close: () => undefined } });
    expect(janelas).toEqual(["focada https://ora5g.com.br/vender", "levada a https://ora5g.com.br/notas"]);
  });

  it("mensagem fora do formato vira o aviso genérico; endereço fora do sistema vira o Início", async () => {
    const { ouvintes, avisos, janelas } = montarServiceWorker(async () => new Response("rede"));
    await disparar(ouvintes.push, empurrao(new Error("não é JSON")));
    await disparar(ouvintes.push, { data: null });
    await disparar(ouvintes.push, empurrao({ titulo: "Clique aqui", corpo: "x", endereco: "https://golpe.invalid/entrar" }));
    expect(avisos.map((a) => [a.titulo, a.opcoes.data])).toEqual([
      ["Ora 5G", { endereco: "/inicio" }], ["Ora 5G", { endereco: "/inicio" }], ["Clique aqui", { endereco: "/inicio" }],
    ]);
    await disparar(ouvintes.notificationclick, { notification: { data: { endereco: "//golpe.invalid/x" }, close: () => undefined } });
    expect(janelas).toEqual(["aberta https://ora5g.com.br/inicio"]);
  });
});
