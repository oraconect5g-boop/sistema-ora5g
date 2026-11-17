// Service worker do site instalável (lote PWA-a; plano do proprietário de 16/11, Onda 1, item 7). Faz só duas coisas:
//   1. permite instalar o Ora 5G na tela inicial do celular;
//   2. quando a internet cai no meio da navegação, mostra a página "sem internet" em vez do erro do navegador.
// Não guarda dados nem telas: vender, consultar o estoque e aprovar continuam precisando da internet (sem venda
// offline, como manda o CLAUDE.md). Só a navegação GET passa por aqui; o resto vai direto para a rede.
const VERSAO = "ora5g-sem-internet-v1";
const SEM_INTERNET = "/sem-internet.html";

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSAO).then((cache) => cache.add(new Request(SEM_INTERNET, { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((nome) => nome !== VERSAO).map((nome) => caches.delete(nome))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.mode !== "navigate" || pedido.method !== "GET") return;
  evento.respondWith(fetch(pedido).catch(async () => (await caches.match(SEM_INTERNET)) ?? Response.error()));
});
