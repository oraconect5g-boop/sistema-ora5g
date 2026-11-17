import type { MetadataRoute } from "next";

// O site instalável (lote PWA-a; plano do proprietário de 16/11, Onda 1, item 7): o dono e a equipe põem o Ora 5G na
// tela inicial do celular, e ele abre em tela cheia, como um aplicativo. Começa no Início da plataforma; quem não
// entrou vai para a entrada. Nada de venda sem internet: o service worker (public/sw.js) só mostra a página "sem
// internet" quando a conexão cai.
export const CORES_DO_APP = { fundo: "#0a1322", tema: "#10131a" } as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/inicio",
    name: "Ora 5G",
    short_name: "Ora 5G",
    description: "A plataforma das lojas Ora 5G: vendas, estoque, caixa e aprovações no celular.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    background_color: CORES_DO_APP.fundo,
    theme_color: CORES_DO_APP.tema,
    icons: [
      { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icones/icone-mascaravel-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
