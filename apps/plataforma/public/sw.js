// Service worker do site instalável (lotes PWA-a e PWA-b; plano do proprietário de 16/11, Onda 1, item 7). Faz três coisas:
//   1. permite instalar o Ora 5G na tela inicial do celular;
//   2. quando a internet cai no meio da navegação, mostra a página "sem internet" em vez do erro do navegador;
//   3. mostra o aviso no celular (PWA-b) de desconto, nota e saída de caixa a aprovar e, no toque, abre a tela da
//      aprovação, sempre dentro do próprio site.
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

// PWA-b: o aviso no celular. O servidor manda {titulo, corpo, endereco}, cifrado para este navegador (só ele decifra).
// Mensagem fora do formato vira um aviso genérico; o endereço só pode ser uma tela do próprio sistema.
const ENDERECO_DO_SISTEMA = /^\/[a-z0-9/_-]*$/;

self.addEventListener("push", (evento) => {
  let aviso = { titulo: "Ora 5G", corpo: "Há um pedido esperando a sua aprovação.", endereco: "/inicio" };
  try {
    const dados = evento.data ? evento.data.json() : null;
    if (dados && typeof dados.titulo === "string" && typeof dados.corpo === "string") {
      aviso = { titulo: dados.titulo, corpo: dados.corpo, endereco: typeof dados.endereco === "string" ? dados.endereco : "/inicio" };
    }
  } catch {
    // mensagem fora do formato: fica o aviso genérico
  }
  const endereco = ENDERECO_DO_SISTEMA.test(aviso.endereco) ? aviso.endereco : "/inicio";
  evento.waitUntil(self.registration.showNotification(aviso.titulo.slice(0, 80), {
    body: aviso.corpo.slice(0, 160),
    icon: "/icones/icone-192.png",
    badge: "/icones/icone-192.png",
    tag: endereco,
    lang: "pt-BR",
    data: { endereco },
  }));
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const pedido = evento.notification.data && evento.notification.data.endereco;
  const destino = new URL(typeof pedido === "string" && ENDERECO_DO_SISTEMA.test(pedido) ? pedido : "/inicio", self.location.origin);
  evento.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const janela of janelas) {
      if (new URL(janela.url).origin === self.location.origin && "focus" in janela) {
        await janela.focus();
        return "navigate" in janela ? janela.navigate(destino.href) : undefined;
      }
    }
    return self.clients.openWindow(destino.href);
  })());
});
