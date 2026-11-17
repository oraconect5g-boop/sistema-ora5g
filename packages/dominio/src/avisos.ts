// Regras dos avisos no celular (lote PWA-b; ADR-014), as mesmas no site e no worker. O banco confere de novo o formato
// da inscrição (public.aviso_inscrever).

/** Os serviços de envio dos navegadores (Chrome, Edge, Firefox, Safari): nada é mandado nem aceito de outro endereço. */
const SERVICOS_DE_ENVIO = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

/** O endereço de envio é de um serviço conhecido, por https, na porta padrão? */
export function servicoDeEnvioConhecido(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && url.port === "" && SERVICOS_DE_ENVIO.test(url.hostname) && endpoint.length <= 1000;
  } catch {
    return false;
  }
}

export type InscricaoDoNavegador = { endpoint: string; p256dh: string; auth: string };

/** A inscrição que o navegador devolve (PushSubscription.toJSON()), no formato que o banco aceita, ou null. */
export function inscricaoDoNavegador(dados: unknown): InscricaoDoNavegador | null {
  if (typeof dados !== "object" || dados === null) return null;
  const d = dados as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = d.endpoint;
  const p256dh = d.keys?.p256dh;
  const auth = d.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (!servicoDeEnvioConhecido(endpoint) || !/^[A-Za-z0-9_-]{86,88}$/.test(p256dh) || !/^[A-Za-z0-9_-]{20,24}$/.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

/** Um nome curto do aparelho para a pessoa reconhecer na lista ("Android · Chrome", "iPhone · Safari"); nada mais do navegador é guardado. */
export function nomeDoDispositivo(userAgent: string): string {
  const ua = userAgent.slice(0, 500);
  const sistema = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Outro aparelho";
  const navegador = /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\/|FxiOS/.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${sistema} · ${navegador}`;
}
